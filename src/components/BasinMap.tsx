'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import land from '@/lib/basin-land.json';
import type { Domain, Source } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/types';
import { type BBox, isGlobalScale } from '@/lib/spatial';
import { SITES, siteMentions } from '@/lib/sites';
import { coverageColor } from '@/lib/coverage-depth';

/**
 * A map of the basin, drawn as inline SVG from Natural Earth coastline shipped
 * with the site (see scripts/build-basin-geometry.mjs).
 *
 * No tiles, so no API key, no quota, no watermark, no orbital swath gaps and
 * nothing to fall back to: the coastline is in the bundle, and the map renders
 * the same with the network switched off.
 *
 * It is drawn dark because the sea is the subject. On a pale atlas basemap the
 * water read as background and the markers had to shout over it; against deep
 * water the domain colours are the brightest thing on the page, which is the
 * right order of importance for a data catalogue.
 */

interface BasinMapProps {
  sources: Source[];
  /** Single-record mode: draw this one's footprint and dim the rest. */
  focus?: Source;
  /** Tighter crop for the small map on a dataset page. */
  compact?: boolean;
  /**
   * Let a click open the location inside the card instead of navigating. The
   * overview's small map has no room for the panel.
   */
  interactive?: boolean;
}

interface View {
  west: number;
  east: number;
  south: number;
  north: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

/**
 * The extent the shipped coastline covers. It is written into the file by
 * scripts/build-basin-geometry.mjs, which reads it off the catalogue, so the
 * map can only be asked to show coast that is already in the bundle.
 */
const DATA_LIMITS: View = (land as { world?: View }).world ?? {
  west: -180,
  east: 180,
  south: -85,
  north: 85,
};
/** Where the catalogue's work is, and where the detailed coastline exists. */
const DETAIL_REGION: View = (land as { region?: View }).region ?? DATA_LIMITS;

/**
 * The domains present in a set of records, with how many each accounts for.
 * A record in two domains counts in both, so the parts sum past the total.
 */
function domainMix(sources: Source[]): { domain: Domain; count: number }[] {
  const counts = new Map<Domain, number>();
  for (const source of sources) {
    for (const domain of source.domain) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain));
}

const DOMAIN_LABELS: Record<Domain, string> = {
  environmental: 'Environmental',
  ecological: 'Ecological',
  production: 'Production',
  'nutrition-health': 'Nutrition & health',
  'socio-economic': 'Socio-economic',
};

interface Cell {
  west: number;
  east: number;
  south: number;
  north: number;
  count: number;
}

/**
 * The footprints turned into a single shaded surface.
 *
 * Drawing the boxes themselves left thirty-odd rectangles on the sea, and
 * their edges read as borders around places that have none. Because every
 * footprint is axis-aligned, the distinct levels of coverage fall on a grid of
 * the footprints' own edges: cutting there gives exact regions with no grid
 * artefacts, and merging equal neighbours leaves a surface rather than a stack
 * of boxes.
 */
function coverageCells(prints: Footprint[], view: View): Cell[] {
  if (prints.length === 0) return [];

  const lons = [...new Set([view.west, view.east, ...prints.flatMap((f) => [f.west, f.east])])]
    .filter((v) => v >= view.west && v <= view.east)
    .sort((a, b) => a - b);
  const lats = [...new Set([view.south, view.north, ...prints.flatMap((f) => [f.south, f.north])])]
    .filter((v) => v >= view.south && v <= view.north)
    .sort((a, b) => a - b);

  const cells: Cell[] = [];
  for (let j = 0; j < lats.length - 1; j += 1) {
    const south = lats[j];
    const north = lats[j + 1];
    if (north - south < 0.001) continue;
    const midLat = (south + north) / 2;

    let run: Cell | null = null;
    for (let i = 0; i < lons.length - 1; i += 1) {
      const west = lons[i];
      const east = lons[i + 1];
      if (east - west < 0.001) continue;
      const midLon = (west + east) / 2;
      const count = prints.filter(
        (f) => f.west <= midLon && f.east >= midLon && f.south <= midLat && f.north >= midLat
      ).length;

      // Neighbours at the same depth are one region, not two boxes.
      if (run && run.count === count && Math.abs(run.east - west) < 0.001) {
        run.east = east;
        continue;
      }
      if (run && run.count > 0) cells.push(run);
      run = { west, east, south, north, count };
    }
    if (run && run.count > 0) cells.push(run);
  }
  return cells;
}

interface Point {
  lon: number;
  lat: number;
}

/** The box two corners describe, whichever way round they were drawn. */
function boxOf(a: Point, b: Point): View {
  return {
    west: Math.min(a.lon, b.lon),
    east: Math.max(a.lon, b.lon),
    south: Math.min(a.lat, b.lat),
    north: Math.max(a.lat, b.lat),
  };
}

/** Degrees across, for telling a click apart from a drawn box. */
function boxSize(box: View): number {
  return Math.max(box.east - box.west, box.north - box.south);
}

/** A record wider than this covers several seas and does not frame anything. */
const SINGLE_SEA = 30;
/** Degrees of coast to keep around the work, so the frame is a map. */
const FRAME_MARGIN = 3.5;

/**
 * The frame the catalogue asks for: everything the records cover, padded, and
 * held inside the coast the bundle carries.
 *
 * Nothing here is pinned to the Red Sea. Add records from another sea, re-run
 * the geometry script so its coastline ships, and this widens to hold them.
 * Records spanning several seas at once are left out of the reckoning for the
 * same reason the geometry script leaves them out: two of them would stretch
 * the frame from the Mediterranean to India and shrink the basin everyone
 * works in to a sliver.
 */
function frameFor(sources: Source[]): View {
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;

  for (const source of sources) {
    const box = source.spatial.bbox as BBox | undefined;
    if (!box || isGlobalScale(box)) continue;
    const [w, s, e, n] = box;
    if (e - w > SINGLE_SEA || n - s > SINGLE_SEA) continue;
    if (n === s && e === w) continue;
    west = Math.min(west, w);
    south = Math.min(south, s);
    east = Math.max(east, e);
    north = Math.max(north, n);
  }

  if (!Number.isFinite(west)) return DETAIL_REGION;
  return {
    west: clamp(west - FRAME_MARGIN, DETAIL_REGION.west, DETAIL_REGION.east),
    east: clamp(east + FRAME_MARGIN, DETAIL_REGION.west, DETAIL_REGION.east),
    south: clamp(south - FRAME_MARGIN, DETAIL_REGION.south, DETAIL_REGION.north),
    north: clamp(north + FRAME_MARGIN, DETAIL_REGION.south, DETAIL_REGION.north),
  };
}
const SCALE = 60; // svg units per degree of latitude

/**
 * A dataset's own neighbourhood, padded and squared off to a landscape frame.
 * A footprint alone makes a poor map: it is the coast either side of it that
 * says where the footprint is.
 */
function viewFor(box: BBox): View {
  const padLat = Math.max((box[3] - box[1]) * 0.35, 2);
  let south = clamp(box[1] - padLat, DATA_LIMITS.south, DATA_LIMITS.north);
  let north = clamp(box[3] + padLat, DATA_LIMITS.south, DATA_LIMITS.north);
  if (north - south < 6) {
    const mid = (north + south) / 2;
    south = clamp(mid - 3, DATA_LIMITS.south, DATA_LIMITS.north);
    north = clamp(mid + 3, DATA_LIMITS.south, DATA_LIMITS.north);
  }

  const midLat = (north + south) / 2;
  const cos = Math.cos((midLat * Math.PI) / 180);
  const wantLon = ((north - south) * 1.5) / cos;
  const midLon = clamp((box[0] + box[2]) / 2, DATA_LIMITS.west, DATA_LIMITS.east);
  const west = clamp(midLon - wantLon / 2, DATA_LIMITS.west, DATA_LIMITS.east);
  const east = clamp(midLon + wantLon / 2, DATA_LIMITS.west, DATA_LIMITS.east);
  return { west, east, south, north };
}

function projector(view: View) {
  const cos = Math.cos((((view.north + view.south) / 2) * Math.PI) / 180);
  return {
    width: (view.east - view.west) * SCALE * cos,
    height: (view.north - view.south) * SCALE,
    x: (lon: number) => (lon - view.west) * SCALE * cos,
    y: (lat: number) => (view.north - lat) * SCALE,
  };
}

type Project = ReturnType<typeof projector>;

function ringPath(ring: number[][], p: Project): string {
  return `${ring
    .map(([lon, lat], i) => `${i ? 'L' : 'M'}${p.x(lon).toFixed(1)},${p.y(lat).toFixed(1)}`)
    .join('')}Z`;
}

/** The generated file holds plain Polygon and MultiPolygon coordinate arrays. */
type LandGeometry = { type: string; coordinates: number[][][] | number[][][][] };

function featurePath(geometry: LandGeometry, p: Project): string {
  const polygons =
    geometry.type === 'Polygon'
      ? [geometry.coordinates as number[][][]]
      : (geometry.coordinates as number[][][][]);
  return polygons.map((rings) => rings.map((ring) => ringPath(ring, p)).join('')).join('');
}

interface LandFeature {
  properties: {
    name: string;
    color?: number;
    /** Where the name goes, from the centroid of the country's largest ring. */
    at?: [number, number];
    /** That ring's area in square degrees, for deciding what there is room for. */
    area?: number;
  };
  geometry: LandGeometry;
}

const LAND = land as unknown as {
  /** The catalogue's own neighbourhood at 50m. */
  features: LandFeature[];
  /** The whole globe at 110m, for frames wider than that neighbourhood. */
  coarse: LandFeature[];
  region: View;
  world: View;
};

/**
 * A political palette, one colour per country, assigned at build time so no
 * two that touch share one. Land used to be a single tone, which read as one
 * undifferentiated mass once the frame could be walked past the basin.
 */
const COUNTRY_COLORS = [
  '#f3b0ab',
  '#f7d99b',
  '#b3d8a8',
  '#cdd394',
  '#f4c194',
  '#c6bbdf',
  '#a8d4d8',
  '#eabdcd',
];

/**
 * The countries this map names while the frame is on the basin.
 *
 * Every state with a shore on the Red Sea or the Gulf of Aden, which is the
 * water the catalogue is about. Their neighbours inland stay as coloured
 * context: a chart of where marine data reaches has no reason to name Iraq or
 * Kyrgyzstan, and the frame was carrying eighteen names for a sea with eight
 * coastlines.
 *
 * Edit this list to change which are named. Names must match Natural Earth's
 * spelling exactly, which is what src/lib/basin-land.json carries; a name that
 * matches nothing here is simply never drawn. Empty the list and the map falls
 * back to naming by size, as it does when the frame is walked off the basin.
 */
const BASIN_STATES = new Set([
  'Djibouti',
  'Egypt',
  'Eritrea',
  'PALESTINE',
  'Jordan',
  'Saudi Arabia',
  'Somalia',
  'Somaliland',
  'Sudan',
  'Yemen',
]);

/**
 * Which country names fit on the frame, biggest first.
 *
 * A country is only named while there is room for the word inside its own
 * territory, and only if no name already placed is sitting where this one
 * would go. Taking them in order of size means that when the frame is full it
 * is the small countries that go unnamed, which is how an atlas reads.
 */
function countryLabels(
  features: LandFeature[],
  view: View,
  project: Project,
  unit: number,
  /** When set, only these countries are named; otherwise size decides. */
  only?: Set<string>
): { name: string; x: number; y: number; size: number }[] {
  const viewArea = (view.east - view.west) * (view.north - view.south);
  const placed: { x: number; y: number; halfWidth: number; halfHeight: number }[] = [];
  const out: { name: string; x: number; y: number; size: number }[] = [];

  const candidates = features
    .filter((f) => {
      const at = f.properties.at;
      if (!at) return false;
      if (only && only.size > 0 && !only.has(f.properties.name)) return false;
      return at[0] > view.west && at[0] < view.east && at[1] > view.south && at[1] < view.north;
    })
    .sort((a, b) => (b.properties.area ?? 0) - (a.properties.area ?? 0));

  for (const country of candidates) {
    const [lon, lat] = country.properties.at!;
    const share = (country.properties.area ?? 0) / viewArea;
    // Below this a country is a speck and its name would be a word floating
    // over its neighbours. The floor sits where it does so that small states
    // with a place on this coast, Palestine and Cyprus among them, are named
    // rather than left as unlabelled colour.
    if (share < 0.0005) continue;

    const size = unit * (share > 0.06 ? 2 : share > 0.02 ? 1.7 : 1.45);
    const text = country.properties.name.toUpperCase();
    const halfWidth = (text.length * size * 0.62) / 2;
    const halfHeight = size * 0.75;
    const px = project.x(lon);
    const py = project.y(lat);

    const free = (cx: number, cy: number) =>
      !placed.some(
        (q) =>
          Math.abs(q.x - cx) < q.halfWidth + halfWidth &&
          Math.abs(q.y - cy) < q.halfHeight + halfHeight
      );

    // A small state beside a large one loses every time on the centroid alone:
    // Palestine's anchor sits half a degree from Israel's. Stepping the name
    // off the centroid before giving up is what lets both be named.
    const step = halfHeight * 2.3;
    const spots: [number, number][] = [
      [px, py],
      [px, py - step],
      [px, py + step],
      [px + halfWidth * 1.2, py],
      [px - halfWidth * 1.2, py],
    ];
    const spot = spots.find(([cx, cy]) => free(cx, cy));
    if (!spot) continue;

    placed.push({ x: spot[0], y: spot[1], halfWidth, halfHeight });
    out.push({ name: text, x: spot[0], y: spot[1], size });
  }
  return out;
}

const LABELS: { name: string; lon: number; lat: number; onBright?: boolean }[] = [
  // The Red Sea's name sits on the coverage stack, the darkest thing on an
  // otherwise pale map, so it is written light rather than dark.
  { name: 'Red Sea', lon: 38.6, lat: 19.4, onBright: true },
  { name: 'Gulf of Aden', lon: 44.8, lat: 12.2 },
  { name: 'The Gulf', lon: 50.4, lat: 27.5 },
  { name: 'Mediterranean', lon: 30.8, lat: 32.4 },
];

/**
 * A record's own extent, in map units, clipped to the frame.
 *
 * Only 2 of the 33 non-global records describe a stretch smaller than the
 * basin: the rest give a bounding box over the whole Red Sea. Drawing their
 * centres as locations invented places the catalogue never claimed, so the map
 * draws what the records actually say instead, and lets the overlap speak.
 */
interface Footprint {
  source: Source;
  west: number;
  east: number;
  south: number;
  north: number;
  /** Degrees of latitude the record reaches, for ordering and for the legend. */
  span: number;
  local: boolean;
}

/** A footprint narrower than this says something about a place, not the sea. */
const LOCAL_SPAN = 5;

function footprints(sources: Source[], view: View): Footprint[] {
  return sources
    .filter((source) => source.spatial.bbox && !isGlobalScale(source.spatial.bbox as BBox))
    .map((source) => {
      const [w, s, e, n] = source.spatial.bbox as BBox;
      return {
        source,
        west: clamp(w, view.west, view.east),
        east: clamp(e, view.west, view.east),
        south: clamp(s, view.south, view.north),
        north: clamp(n, view.south, view.north),
        span: n - s,
        local: n - s < LOCAL_SPAN && e - w < LOCAL_SPAN,
      };
    })
    // A record with no extent at all (a lab culture, logged as 0,0,0,0) has
    // nothing to draw on a map of the sea.
    .filter((f) => f.north > f.south || f.east > f.west)
    .sort((a, b) => b.span - a.span);
}

export default function BasinMap({
  sources,
  focus,
  compact = false,
  interactive = false,
}: BasinMapProps) {
  // The box the reader has drawn on the map, and the one they are drawing now.
  const [selection, setSelection] = useState<View | null>(null);
  const [drag, setDrag] = useState<{ from: Point; to: Point } | null>(null);
  const [tool, setTool] = useState<'move' | 'select'>('move');
  const pan = useRef<{ lon: number; lat: number } | null>(null);

  const box = focus?.spatial.bbox as BBox | undefined;
  const focusGlobal = box ? isGlobalScale(box) : false;
  const home = useMemo(
    () => (box && !focusGlobal ? viewFor(box) : frameFor(sources)),
    [box, focusGlobal, sources]
  );
  // The frame the reader is looking at. It starts on the work and can be
  // walked out to the neighbouring coasts, as far as the shipped coastline
  // goes. Panning moves the frame itself rather than transforming the
  // drawing, so the coastline, the names and the shading all redraw for
  // wherever you end up.
  const [moved, setMoved] = useState<View | null>(null);
  const view = moved ?? home;
  const { width, height, x, y } = projector(view);
  // Sizes are in map units, so they have to be a fraction of the frame rather
  // than fixed: at a frame this wide, an 11-unit label renders at two pixels.
  const u = width / 100;
  // The detailed coastline only exists over the catalogue's neighbourhood, and
  // at a frame much wider than that its extra vertices are invisible anyway.
  const inDetail =
    view.west >= DETAIL_REGION.west - 0.01 &&
    view.east <= DETAIL_REGION.east + 0.01 &&
    view.south >= DETAIL_REGION.south - 0.01 &&
    view.north <= DETAIL_REGION.north + 0.01;
  const landFeatures = inDetail ? LAND.features : LAND.coarse;
  // The basin's own names are only meaningful while the frame is near it. Held
  // on once it has been walked out to the continent they pile into a knot over
  // the Red Sea and say nothing about what is on screen.
  const nearBasin = view.east - view.west < (DETAIL_REGION.east - DETAIL_REGION.west) * 1.7;
  // On the basin the map names the basin's own states; walked out to the
  // continent it falls back to naming by size, because a list of ten would
  // leave the rest of the world blank.
  const names = compact
    ? []
    : countryLabels(
        landFeatures,
        view,
        { width, height, x, y },
        u,
        inDetail ? BASIN_STATES : undefined
      );

  const prints = useMemo(
    () => (focus ? [] : footprints(sources, view)),
    [focus, sources, view.west, view.east, view.south, view.north] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const sites = siteMentions(focus ? [focus] : sources).filter(
    ({ site }) =>
      site.lon > view.west && site.lon < view.east && site.lat > view.south && site.lat < view.north
  );
  const accent = focus ? DOMAIN_COLORS[focus.domain[0]] : '#2dd4bf';

  const cells = useMemo(() => coverageCells(prints, view), [prints, view]);
  const coveragePeak = Math.max(...cells.map((c) => c.count), 1);

  /** Whether a patch of water falls inside the box the reader has drawn. */
  function cellAsked(cell: Cell): boolean {
    if (!asked) return true;
    return (
      cell.west <= asked.east &&
      cell.east >= asked.west &&
      cell.south <= asked.north &&
      cell.north >= asked.south
    );
  }

  // What is being shown: the finished box, or the one under the pointer.
  const live = drag ? boxOf(drag.from, drag.to) : null;
  const asked = live ?? selection;
  const inside = asked
    ? prints.filter(
        (f) =>
          f.west <= asked.east &&
          f.east >= asked.west &&
          f.south <= asked.north &&
          f.north >= asked.south
      )
    : [];
  const shown = asked ? inside : prints;
  const shownMix = domainMix(shown.map((f) => f.source));
  const insideSites = asked
    ? sites.filter(
        ({ site }) =>
          site.lon >= asked.west &&
          site.lon <= asked.east &&
          site.lat >= asked.south &&
          site.lat <= asked.north
      )
    : [];

  /** Shift the frame, keeping its size and staying inside the shipped coast. */
  function panBy(dLon: number, dLat: number) {
    const lonSpan = view.east - view.west;
    const latSpan = view.north - view.south;
    const west = clamp(view.west + dLon, DATA_LIMITS.west, DATA_LIMITS.east - lonSpan);
    const south = clamp(view.south + dLat, DATA_LIMITS.south, DATA_LIMITS.north - latSpan);
    setMoved({ west, east: west + lonSpan, south, north: south + latSpan });
  }

  /** Scale the frame about its centre, keeping its shape. */
  function zoomBy(factor: number) {
    const lonSpan = view.east - view.west;
    const latSpan = view.north - view.south;
    const limitLon = DATA_LIMITS.east - DATA_LIMITS.west;
    const limitLat = DATA_LIMITS.north - DATA_LIMITS.south;
    const capped = Math.min(
      factor,
      limitLon / lonSpan,
      limitLat / latSpan,
      // Below about two degrees the shipped coastline has no more detail to
      // give, so there is nothing to gain by going closer.
      lonSpan > 2.5 || factor > 1 ? Infinity : 1
    );
    const scale = Math.max(capped, 2.5 / lonSpan);
    const midLon = (view.west + view.east) / 2;
    const midLat = (view.south + view.north) / 2;
    const halfLon = (lonSpan * scale) / 2;
    const halfLat = (latSpan * scale) / 2;
    const west = clamp(midLon - halfLon, DATA_LIMITS.west, DATA_LIMITS.east - halfLon * 2);
    const south = clamp(midLat - halfLat, DATA_LIMITS.south, DATA_LIMITS.north - halfLat * 2);
    setMoved({ west, east: west + halfLon * 2, south, north: south + halfLat * 2 });
  }

  /** Where on the sea the pointer is, in degrees. */
  function pointAt(event: React.PointerEvent<SVGRectElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      lon: view.west + ((event.clientX - rect.left) / rect.width) * (view.east - view.west),
      lat: view.north - ((event.clientY - rect.top) / rect.height) * (view.north - view.south),
    };
  }

  const mapSvg = (
    <svg
      viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
      className="block h-auto w-full"
      role="img"
      aria-label={
        focus
          ? `Map of the Red Sea with the footprint of ${focus.title} marked`
          : `Map of the Red Sea showing the extent each of ${prints.length} catalogued datasets covers`
      }
    >
      <defs>
        <linearGradient id="deepSea" x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0%" stopColor="#e9eef2" />
          <stop offset="100%" stopColor="#dfe6ec" />
        </linearGradient>
        <linearGradient id="darkLand" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbfbfa" />
          <stop offset="100%" stopColor="#f4f4f2" />
        </linearGradient>
        <mask id="seaOnly">
          <rect width={width} height={height} fill="#ffffff" />
          {landFeatures.map((feature) => (
            <path
              key={`mask-${feature.properties.name}`}
              d={featurePath(feature.geometry, { width, height, x, y })}
              fill="#000000"
            />
          ))}
        </mask>
      </defs>

      <rect width={width} height={height} fill="url(#deepSea)" />

      {/* Graticule, dim enough to read as reference rather than data. */}
      <g stroke="#94a3b8" strokeOpacity="0.22" strokeWidth={u * 0.08}>
        {[10, 15, 20, 25, 30]
          .filter((lat) => lat > view.south && lat < view.north)
          .map((lat) => (
            <line key={lat} x1={0} y1={y(lat)} x2={width} y2={y(lat)} />
          ))}
        {[30, 35, 40, 45, 50]
          .filter((lon) => lon > view.west && lon < view.east)
          .map((lon) => (
            <line key={lon} x1={x(lon)} y1={0} x2={x(lon)} y2={height} />
          ))}
      </g>

      <g>
        {landFeatures.map((feature) => (
          <path
            key={feature.properties.name}
            d={featurePath(feature.geometry, { width, height, x, y })}
            fill={COUNTRY_COLORS[(feature.properties.color ?? 0) % COUNTRY_COLORS.length]}
            fillOpacity={0.8}
            stroke="#ffffff"
            strokeWidth={u * 0.16}
          >
            <title>{feature.properties.name}</title>
          </path>
        ))}
      </g>

      {/* One record's footprint, clipped to the sea. A bounding box drawn whole
          covers two countries and claims a reach over land that no marine
          dataset has; masking the land out shows the water it is about. */}
      {focus && box && !focusGlobal ? (
        <g>
          <rect
            x={x(box[0])}
            y={y(box[3])}
            width={Math.max(x(box[2]) - x(box[0]), 4)}
            height={Math.max(y(box[1]) - y(box[3]), 4)}
            fill={accent}
            fillOpacity={0.4}
            mask="url(#seaOnly)"
          />
          <rect
            x={x(box[0])}
            y={y(box[3])}
            width={Math.max(x(box[2]) - x(box[0]), 4)}
            height={Math.max(y(box[1]) - y(box[3]), 4)}
            fill="none"
            stroke={accent}
            strokeWidth={u * 0.25}
            strokeDasharray={`${u} ${u * 0.7}`}
            strokeOpacity="0.8"
            rx={u * 0.4}
          />
        </g>
      ) : null}

      {/* What the records actually cover, as one surface. Thirty of the
          thirty-two give a bounding box over the whole sea, so the depth of
          colour is the finding: how many reach this water. */}
      <g mask="url(#seaOnly)" shapeRendering="crispEdges">
        {cells.map((cell) => (
          <rect
            key={`${cell.west}-${cell.south}-${cell.east}`}
            x={x(cell.west) - 0.5}
            y={y(cell.north) - 0.5}
            width={Math.max(x(cell.east) - x(cell.west) + 1, 1)}
            height={Math.max(y(cell.south) - y(cell.north) + 1, 1)}
            fill={coverageColor(cell.count, coveragePeak)}
            fillOpacity={asked === null || cellAsked(cell) ? 1 : 0.35}
          >
            <title>{`${cell.count} dataset${cell.count === 1 ? '' : 's'} reach here`}</title>
          </rect>
        ))}
      </g>

      <g fontWeight="600" letterSpacing={u * 0.12} paintOrder="stroke">
        {names.map((label) => (
          <text
            key={label.name}
            x={label.x}
            y={label.y}
            textAnchor="middle"
            fontSize={label.size}
            fill="#57616d"
            stroke="#ffffff"
            strokeWidth={label.size * 0.28}
          >
            {label.name}
          </text>
        ))}
      </g>

      <g fontSize={u * 2} fontStyle="italic" paintOrder="stroke" strokeWidth={u * 0.5}>
        {(nearBasin ? LABELS : []).filter(
          (l) => l.lon > view.west && l.lon < view.east && l.lat > view.south && l.lat < view.north
        ).map((label) => (
          <text
            key={label.name}
            x={x(label.lon)}
            y={y(label.lat)}
            textAnchor="middle"
            fill={label.onBright ? '#f8fafc' : '#64748b'}
            stroke={label.onBright ? '#1e293b' : '#ffffff'}
            strokeOpacity={0.85}
          >
            {label.name}
          </text>
        ))}
      </g>

      {/* The places the records name as where the work happened. */}
      <g>
        {(() => {
          const placed: { px: number; py: number }[] = [];
          const midLon = (view.west + view.east) / 2;
          return (nearBasin ? [...sites] : [])
            .sort((a, b) => b.site.lat - a.site.lat)
            .map(({ site, sources: named }) => {
              const px = x(site.lon);
              const py = y(site.lat);
              const crowded = placed.some(
                (q) => Math.abs(q.py - py) < u * 2.2 && Math.abs(q.px - px) < u * 18
              );
              placed.push({ px, py });
              const left = site.lon < midLon;
              const gap = u * 1.1;
              return (
                <g key={site.name}>
                  <title>
                    {`${site.name}: named in ${named.length} record${named.length === 1 ? '' : 's'}`}
                  </title>
                  <circle cx={px} cy={py} r={u * 0.7} fill="#ffffff" />
                  <circle cx={px} cy={py} r={u * 0.38} fill="#0f172a" />
                  {gap > u * 2 ? (
                    <line
                      x1={px}
                      y1={py}
                      x2={left ? px - gap + u * 0.4 : px + gap - u * 0.4}
                      y2={py + (crowded ? u * 1.5 : 0)}
                      stroke="#64748b"
                      strokeWidth={u * 0.12}
                      strokeOpacity={0.8}
                    />
                  ) : null}
                  <text
                    x={left ? px - gap : px + gap}
                    y={py + (crowded ? u * 2.1 : u * 0.6)}
                    textAnchor={left ? 'end' : 'start'}
                    fontSize={u * 1.7}
                    fill="#334155"
                    stroke="#ffffff"
                    strokeWidth={u * 0.5}
                    paintOrder="stroke"
                  >
                    {site.name}
                  </text>
                </g>
              );
            });
        })()}
      </g>

      {/* Draw a box and the panel says what is in it. The records mostly give
          basin-wide extents, so "what covers this water" is the question the
          map can answer honestly; a box asks it of an area rather than a line. */}
      {interactive && asked ? (
        <g pointerEvents="none">
          <rect
            x={x(asked.west)}
            y={y(asked.north)}
            width={Math.max(x(asked.east) - x(asked.west), 1)}
            height={Math.max(y(asked.south) - y(asked.north), 1)}
            fill="#0f172a"
            fillOpacity={0.06}
            stroke="#0f172a"
            strokeOpacity={0.7}
            strokeWidth={u * 0.16}
            strokeDasharray={drag ? `${u * 0.8} ${u * 0.5}` : undefined}
          />
          {boxSize(asked) > 0.4 ? (
            <>
              <rect
                x={x(asked.west)}
                y={y(asked.north) - u * 2.5}
                width={u * (5.2 + String(inside.length).length * 0.95)}
                height={u * 2.3}
                rx={u * 0.4}
                fill="#0f172a"
                fillOpacity={0.9}
              />
              <text
                x={x(asked.west) + u * 0.8}
                y={y(asked.north) - u * 0.9}
                fontSize={u * 1.5}
                fontWeight="600"
                fill="#f8fafc"
              >
                {`${inside.length} here`}
              </text>
            </>
          ) : null}
        </g>
      ) : null}

      {interactive ? (
        <rect
          width={width}
          height={height}
          fill="transparent"
          className={tool === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair'}
          onPointerDown={(event) => {
            event.currentTarget.setPointerCapture(event.pointerId);
            const from = pointAt(event);
            if (tool === 'move') pan.current = from;
            else setDrag({ from, to: from });
          }}
          onPointerMove={(event) => {
            if (tool === 'move') {
              const start = pan.current;
              if (!start) return;
              // The grabbed point stays under the pointer, so the map follows
              // the hand rather than drifting away from it.
              const now = pointAt(event);
              panBy(start.lon - now.lon, start.lat - now.lat);
              return;
            }
            if (!drag) return;
            setDrag({ from: drag.from, to: pointAt(event) });
          }}
          onPointerUp={(event) => {
            pan.current = null;
            if (!drag) return;
            const box = boxOf(drag.from, pointAt(event));
            setDrag(null);
            // A click is a box with no size, so it clears the one already
            // drawn rather than selecting a point nobody aimed at.
            setSelection(boxSize(box) < 0.25 ? null : box);
          }}
          onPointerCancel={() => {
            pan.current = null;
            setDrag(null);
          }}
        />
      ) : null}
    </svg>
  );

  if (!interactive) return <figure className="m-0">{mapSvg}</figure>;

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-200">
            {(['move', 'select'] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTool(option)}
                className={`px-2.5 py-1 text-xs font-medium capitalize transition ${
                  tool === option
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {option === 'move' ? 'Move' : 'Select box'}
              </button>
            ))}
          </div>
          <div className="flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-200">
            <button
              type="button"
              onClick={() => zoomBy(1 / 1.35)}
              aria-label="Zoom in"
              className="px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              +
            </button>
            <button
              type="button"
              onClick={() => zoomBy(1.35)}
              aria-label="Zoom out"
              className="px-2.5 py-1 text-xs font-semibold text-slate-600 transition hover:bg-slate-50"
            >
              &minus;
            </button>
          </div>
          {moved ? (
            <button
              type="button"
              onClick={() => setMoved(null)}
              className="text-xs text-slate-500 transition hover:text-slate-800"
            >
              Back to the basin
            </button>
          ) : null}
        </div>

        <figure className="m-0 overflow-hidden rounded-xl ring-1 ring-slate-900/10">{mapSvg}</figure>
        <p className="mt-3 text-xs leading-snug text-slate-500">
          {tool === 'move' ? 'Drag to move around the coast, or switch to Select box to narrow the list.' : 'Drag a box to narrow the list.'}{' '}
          Only {prints.filter((f) => f.local).length} of {prints.length} records describe a stretch
          smaller than the basin, so depth of colour is how many reach that water, not where anyone
          went.
        </p>
      </div>

      <div className="flex flex-col">
        {shown.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold text-slate-900">
                {shown.length} dataset{shown.length === 1 ? '' : 's'}
                {asked ? ' here' : ' over the basin'}
              </p>
              {asked ? (
                <button
                  type="button"
                  onClick={() => setSelection(null)}
                  className="text-xs text-slate-400 transition hover:text-slate-700"
                >
                  Clear
                </button>
              ) : null}
            </div>
            {asked ? (
              <p className="mt-0.5 text-xs tabular-nums text-slate-500">
                {asked.south.toFixed(1)}&ndash;{asked.north.toFixed(1)}&deg;N,{' '}
                {asked.west.toFixed(1)}&ndash;{asked.east.toFixed(1)}&deg;E
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-slate-500">
                {tool === 'select'
                  ? 'Drag a box on the map to narrow this.'
                  : 'Switch to Select box to narrow this to one stretch.'}
              </p>
            )}

            {/* What kind of data, before which records: the mix is the answer
                to "what is here", the list is the detail under it. */}
            <ul className="mt-3 space-y-1.5">
              {shownMix.map((entry) => (
                <li key={entry.domain} className="flex items-center gap-2 text-xs">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: DOMAIN_COLORS[entry.domain] }}
                    aria-hidden
                  />
                  <span className="w-32 shrink-0 text-slate-700">
                    {DOMAIN_LABELS[entry.domain]}
                  </span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${(entry.count / shownMix[0].count) * 100}%`,
                        backgroundColor: DOMAIN_COLORS[entry.domain],
                      }}
                    />
                  </span>
                  <span className="w-4 shrink-0 text-right font-semibold tabular-nums text-slate-900">
                    {entry.count}
                  </span>
                </li>
              ))}
            </ul>

            {insideSites.length > 0 ? (
              <p className="mt-3 text-xs text-slate-500">
                Field sites named here: {insideSites.map(({ site }) => site.name).join(', ')}.
              </p>
            ) : null}

            <ul className="mt-3 max-h-[19rem] space-y-1.5 overflow-y-auto border-t border-slate-100 pr-1 pt-3">
              {shown.map(({ source, local }) => (
                <li key={source.id}>
                  <Link
                    href={`/sources/${source.id}`}
                    className="flex items-start gap-2 text-sm leading-snug text-slate-700 transition hover:text-teal-800"
                  >
                    <span
                      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: DOMAIN_COLORS[source.domain[0]] }}
                      aria-hidden
                    />
                    <span>
                      {source.title}
                      {local ? (
                        <span className="ml-1.5 rounded bg-slate-100 px-1 py-px text-[10px] font-medium text-slate-600">
                          local
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>

            <Link
              href={`/browse?id=${shown.map((f) => f.source.id).join(',')}`}
              className="mt-3 inline-block text-xs font-medium text-teal-700 hover:underline"
            >
              Filter browse to these &rarr;
            </Link>
          </div>
        ) : (
          <div className="flex flex-col rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            <p>No record reaches this box.</p>
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="mt-2 self-start text-xs font-medium text-teal-700 hover:underline"
            >
              Clear
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
