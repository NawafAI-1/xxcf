'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import land from '@/lib/basin-land.json';
import type { Domain, Source } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/types';
import { type BBox, isGlobalScale } from '@/lib/spatial';
import { SITES, siteMentions } from '@/lib/sites';
import { thinStretch } from '@/lib/basin';

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
  /** Draw the latitude coverage gauge and mark the least observed stretch. */
  showCoverage?: boolean;
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
const DATA_LIMITS: View = (land as { region?: View }).region ?? {
  west: 22,
  east: 54,
  south: 3,
  north: 34,
};

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

  if (!Number.isFinite(west)) return DATA_LIMITS;
  return {
    west: clamp(west - FRAME_MARGIN * 1.6, DATA_LIMITS.west, DATA_LIMITS.east),
    east: clamp(east + FRAME_MARGIN * 1.6, DATA_LIMITS.west, DATA_LIMITS.east),
    south: clamp(south - FRAME_MARGIN, DATA_LIMITS.south, DATA_LIMITS.north),
    north: clamp(north + FRAME_MARGIN, DATA_LIMITS.south, DATA_LIMITS.north),
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

const LAND = land as unknown as {
  features: { properties: { name: string }; geometry: LandGeometry }[];
};

/** Place names worth carrying, with the anchor inside their own territory. */
const PLACES: { name: string; lon: number; lat: number }[] = [
  { name: 'EGYPT', lon: 29.5, lat: 26.5 },
  { name: 'SAUDI ARABIA', lon: 45.0, lat: 23.5 },
  { name: 'SUDAN', lon: 29.5, lat: 15.5 },
  { name: 'ERITREA', lon: 38.3, lat: 15.4 },
  { name: 'ETHIOPIA', lon: 39.5, lat: 8.5 },
  { name: 'YEMEN', lon: 46.5, lat: 15.5 },
  { name: 'JORDAN', lon: 36.6, lat: 31.2 },
];

const LABELS: { name: string; lon: number; lat: number; onBright?: boolean }[] = [
  // The Red Sea's name sits on the coverage stack, the darkest thing on an
  // otherwise pale map, so it is written light rather than dark.
  { name: 'Red Sea', lon: 38.6, lat: 19.4, onBright: true },
  { name: 'Gulf of Aden', lon: 46.5, lat: 12.2 },
  { name: 'The Gulf', lon: 50.4, lat: 27.5 },
  { name: 'Mediterranean', lon: 28.5, lat: 32.4 },
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
  showCoverage = false,
  interactive = false,
}: BasinMapProps) {
  // The latitude the reader is pointing at, and whether they have pinned it.
  const [scrubLat, setScrubLat] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);

  const box = focus?.spatial.bbox as BBox | undefined;
  const focusGlobal = box ? isGlobalScale(box) : false;
  const view = box && !focusGlobal ? viewFor(box) : frameFor(sources);
  const { width, height, x, y } = projector(view);
  // Sizes are in map units, so they have to be a fraction of the frame rather
  // than fixed: at a frame this wide, an 11-unit label renders at two pixels.
  const u = width / 100;

  const prints = useMemo(
    () => (focus ? [] : footprints(sources, view)),
    [focus, sources, view.west, view.east, view.south, view.north] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const sites = siteMentions(focus ? [focus] : sources).filter(
    ({ site }) =>
      site.lon > view.west && site.lon < view.east && site.lat > view.south && site.lat < view.north
  );
  const accent = focus ? DOMAIN_COLORS[focus.domain[0]] : '#2dd4bf';

  const thin = showCoverage && !focus ? thinStretch(sources) : null;

  const reaching = scrubLat === null
    ? []
    : prints.filter((f) => f.south <= scrubLat && f.north >= scrubLat);

  /** Latitude under the pointer, from the event's position in the frame. */
  function latAt(event: React.MouseEvent<SVGRectElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientY - rect.top) / rect.height;
    return view.north - ratio * (view.north - view.south);
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
          {LAND.features.map((feature) => (
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
        {LAND.features.map((feature) => (
          <path
            key={feature.properties.name}
            d={featurePath(feature.geometry, { width, height, x, y })}
            fill="url(#darkLand)"
            stroke="#cbd5e1"
            strokeWidth={u * 0.13}
          />
        ))}
      </g>

      {!compact && (
        <g fill="#a9b4bf" fontSize={u * 1.8} letterSpacing={u * 0.16} fontWeight="600">
          {PLACES.filter(
            (p) => p.lon > view.west && p.lon < view.east && p.lat > view.south && p.lat < view.north
          ).map((place) => (
            <text key={place.name} x={x(place.lon)} y={y(place.lat)} textAnchor="middle">
              {place.name}
            </text>
          ))}
        </g>
      )}

      <g fontSize={u * 2} fontStyle="italic" paintOrder="stroke" strokeWidth={u * 0.5}>
        {LABELS.filter(
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

      {/* The least observed stretch, marked where it is rather than only named
          in a panel beside the map. */}
      {thin ? (
        <g>
          <rect
            x={0}
            y={y(thin.to)}
            width={width}
            height={Math.max(y(thin.from) - y(thin.to), u)}
            fill="#b45309"
            fillOpacity={0.13}
            mask="url(#seaOnly)"
          />
          {[thin.to, thin.from].map((lat) => (
            <line
              key={lat}
              x1={0}
              y1={y(lat)}
              x2={width}
              y2={y(lat)}
              stroke="#b45309"
              strokeOpacity={0.45}
              strokeWidth={u * 0.13}
              strokeDasharray={`${u * 0.8} ${u * 0.6}`}
            />
          ))}
          <text
            x={u * 3}
            y={y((thin.from + thin.to) / 2) + u * 0.6}
            textAnchor="start"
            fontSize={u * 1.6}
            fontWeight="600"
            fill="#92400e"
            stroke="#ffffff"
            strokeWidth={u * 0.5}
            paintOrder="stroke"
          >
            {`thinnest: ${thin.count} datasets reach ${thin.from.toFixed(1)}-${thin.to.toFixed(1)}°N`}
          </text>
        </g>
      ) : null}

      {/* What each record actually covers. Thirty of the thirty-three give a
          bounding box over the whole sea, so the overlap is the finding: the
          water brightens where many reach and stays dark where few do. */}
      <g mask="url(#seaOnly)">
        {prints.map((print) => {
          const lit = scrubLat !== null && print.south <= scrubLat && print.north >= scrubLat;
          return (
            <rect
              key={print.source.id}
              x={x(print.west)}
              y={y(print.north)}
              width={Math.max(x(print.east) - x(print.west), u * 0.3)}
              height={Math.max(y(print.south) - y(print.north), u * 0.3)}
              fill="#334e68"
              fillOpacity={scrubLat === null ? 0.055 : lit ? 0.08 : 0.012}
            />
          );
        })}
      </g>

      {/* The two records that describe a stretch rather than the whole sea are
          the only ones whose outline says anything, so they get one. */}
      <g>
        {prints
          .filter((print) => print.local)
          .map((print) => (
            <rect
              key={`local-${print.source.id}`}
              x={x(print.west)}
              y={y(print.north)}
              width={Math.max(x(print.east) - x(print.west), u * 0.6)}
              height={Math.max(y(print.south) - y(print.north), u * 0.6)}
              fill="none"
              stroke={DOMAIN_COLORS[print.source.domain[0]]}
              strokeWidth={u * 0.22}
              strokeOpacity={0.85}
              rx={u * 0.3}
            >
              <title>{print.source.title}</title>
            </rect>
          ))}
      </g>

      {/* The places the records name as where the work happened. */}
      <g>
        {(() => {
          const placed: { px: number; py: number }[] = [];
          const midLon = (view.west + view.east) / 2;
          return [...sites]
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

      {/* Reading across a latitude is the question this map can answer well:
          what reaches this water? The line follows the pointer, and a click
          pins it so the list beside the map can be used. */}
      {interactive && scrubLat !== null ? (
        <g pointerEvents="none">
          <line
            x1={0}
            y1={y(scrubLat)}
            x2={width}
            y2={y(scrubLat)}
            stroke="#0f172a"
            strokeOpacity={pinned ? 0.75 : 0.4}
            strokeWidth={u * 0.16}
            strokeDasharray={pinned ? undefined : `${u * 0.9} ${u * 0.6}`}
          />
          <rect
            x={width - u * 17}
            y={y(scrubLat) - u * 2.4}
            width={u * 15.6}
            height={u * 2.6}
            rx={u * 0.5}
            fill="#0f172a"
            fillOpacity={0.92}
          />
          <text
            x={width - u * 1.9}
            y={y(scrubLat) - u * 0.6}
            textAnchor="end"
            fontSize={u * 1.6}
            fontWeight="600"
            fill="#e2e8f0"
          >
            {`${scrubLat.toFixed(1)}\u00b0N \u00b7 ${reaching.length} datasets`}
          </text>
        </g>
      ) : null}

      {interactive ? (
        <rect
          width={width}
          height={height}
          fill="transparent"
          className="cursor-crosshair"
          onMouseMove={(event) => {
            if (!pinned) setScrubLat(latAt(event));
          }}
          onMouseLeave={() => {
            if (!pinned) setScrubLat(null);
          }}
          onClick={(event) => {
            if (pinned) {
              setPinned(false);
              setScrubLat(latAt(event));
            } else {
              setScrubLat(latAt(event));
              setPinned(true);
            }
          }}
        />
      ) : null}
    </svg>
  );

  if (!interactive) return <figure className="m-0">{mapSvg}</figure>;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
      <figure className="m-0 overflow-hidden rounded-xl ring-1 ring-slate-900/10">{mapSvg}</figure>

      <div className="flex flex-col">
        {scrubLat !== null && reaching.length > 0 ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-sm font-semibold tabular-nums text-slate-900">
                {scrubLat.toFixed(1)}&deg;N
              </p>
              <button
                type="button"
                onClick={() => {
                  setPinned(false);
                  setScrubLat(null);
                }}
                className="text-xs text-slate-400 transition hover:text-slate-700"
              >
                {pinned ? 'Unpin' : 'Clear'}
              </button>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {reaching.length} of {prints.length} records reach this water
              {pinned ? '' : '. Click the map to hold it.'}
            </p>
            <ul className="mt-3 max-h-[26rem] space-y-1.5 overflow-y-auto pr-1">
              {reaching.map(({ source, local }) => (
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
                        <span className="ml-1.5 rounded bg-teal-50 px-1 py-px text-[10px] font-medium text-teal-800">
                          local
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={`/browse?id=${reaching.map((f) => f.source.id).join(',')}`}
              className="mt-3 inline-block text-xs font-medium text-teal-700 hover:underline"
            >
              Filter browse to these &rarr;
            </Link>
          </div>
        ) : (
          <div className="flex flex-1 flex-col justify-center rounded-xl border border-dashed border-slate-300 p-5 text-sm text-slate-500">
            <p>Point anywhere on the sea to see what reaches that water.</p>
            <p className="mt-3 text-xs leading-relaxed">
              Each shaded rectangle is one record&rsquo;s stated extent. Only{' '}
              {prints.filter((f) => f.local).length} of {prints.length} describe a stretch smaller
              than the basin, so the dark water is where many records overlap rather than where
              anyone went.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
