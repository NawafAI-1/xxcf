import Link from 'next/link';
import land from '@/lib/basin-land.json';
import type { Source } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/types';
import { type BBox, isGlobalScale } from '@/lib/spatial';
import { siteMentions } from '@/lib/sites';

/**
 * A real map of the basin, drawn as inline SVG from Natural Earth coastline
 * shipped with the site (see scripts/build-basin-geometry.mjs).
 *
 * No tiles, so no API key, no quota, no watermark, no orbital swath gaps and
 * nothing to fall back to: the coastline is in the bundle, and the map renders
 * the same with the network switched off. Everything about how it looks is
 * ours to set rather than a provider's.
 */

interface BasinMapProps {
  sources: Source[];
  /** Single-record mode: draw this one's footprint and dim the rest. */
  focus?: Source;
  /** Tighter crop for the small map on a dataset page. */
  compact?: boolean;
}

// The whole neighbourhood: Egypt to Oman, Jordan to the Horn. The sea is
// the subject, but a strip of coast either side says nothing about where it
// is; the countries around it do.
const BASIN_VIEW = { west: 21.5, east: 59.5, south: 3, north: 33.2 };
/** The extent the coastline file covers; nothing can be shown beyond it. */
const DATA_LIMITS = { west: 21, east: 60, south: 2.5, north: 33.5 };
const SCALE = 60; // svg units per degree of latitude

interface View {
  west: number;
  east: number;
  south: number;
  north: number;
}

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high);

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

  // Aim for a 3:2 frame so the card stays a reasonable shape.
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
  const width = (view.east - view.west) * SCALE * cos;
  const height = (view.north - view.south) * SCALE;
  return {
    width,
    height,
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
  { name: 'SAUDI ARABIA', lon: 46.0, lat: 22.0 },
  { name: 'SUDAN', lon: 29.5, lat: 15.5 },
  { name: 'ERITREA', lon: 38.5, lat: 15.3 },
  { name: 'ETHIOPIA', lon: 39.5, lat: 8.5 },
  { name: 'YEMEN', lon: 47.0, lat: 15.5 },
  { name: 'OMAN', lon: 56.0, lat: 20.5 },
  { name: 'SOMALIA', lon: 46.5, lat: 6.0 },
  { name: 'JORDAN', lon: 36.6, lat: 31.2 },
  { name: 'CHAD', lon: 22.5, lat: 15.0 },
];

const LABELS: { name: string; lon: number; lat: number; anchor?: 'start' | 'middle' | 'end' }[] = [
  { name: 'Red Sea', lon: 35.2, lat: 25.6, anchor: 'middle' },
  { name: 'Gulf of Aden', lon: 47.5, lat: 12.2, anchor: 'middle' },
  { name: 'Arabian Sea', lon: 56.5, lat: 13.0, anchor: 'middle' },
  { name: 'The Gulf', lon: 51.5, lat: 27.5, anchor: 'middle' },
  { name: 'Mediterranean', lon: 28.0, lat: 32.6, anchor: 'middle' },
];

interface Cluster {
  key: string;
  lon: number;
  lat: number;
  sources: Source[];
}

function cluster(sources: Source[], view: View): Cluster[] {
  const byKey = new Map<string, Cluster>();
  const step = Math.max(0.5, (view.east - view.west) / 22);
  const snap = (value: number) => Math.round(value / step) * step;
  for (const source of sources) {
    if (!source.spatial.bbox || isGlobalScale(source.spatial.bbox as BBox)) continue;
    const [w, s, e, n] = source.spatial.bbox as BBox;
    const lon = (w + e) / 2;
    const lat = (s + n) / 2;
    if (lon < view.west || lon > view.east || lat < view.south || lat > view.north) continue;
    const key = `${snap(lon)},${snap(lat)}`;
    const existing = byKey.get(key);
    if (existing) existing.sources.push(source);
    else byKey.set(key, { key, lon, lat, sources: [source] });
  }
  return [...byKey.values()].sort((a, b) => b.sources.length - a.sources.length);
}

export default function BasinMap({ sources, focus, compact = false }: BasinMapProps) {
  const box = focus?.spatial.bbox as BBox | undefined;
  const focusGlobal = box ? isGlobalScale(box) : false;
  const view = box && !focusGlobal ? viewFor(box) : BASIN_VIEW;
  const { width, height, x, y } = projector(view);
  // Sizes are in map units, so they have to be a fraction of the frame rather
  // than fixed: at a frame this wide, an 11-unit label renders at two pixels.
  const u = width / 100;
  const clusters = focus ? [] : cluster(sources, view);
  const sites = siteMentions(focus ? [focus] : sources).filter(
    ({ site }) =>
      site.lon > view.west && site.lon < view.east && site.lat > view.south && site.lat < view.north
  );
  const accent = focus ? DOMAIN_COLORS[focus.domain[0]] : '#0f766e';

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${width.toFixed(0)} ${height.toFixed(0)}`}
        className="h-auto w-full"
        role="img"
        aria-label={
          focus
            ? `Map of the Red Sea with the footprint of ${focus.title} marked`
            : `Map of the Red Sea with ${clusters.length} locations that hold catalogued datasets`
        }
      >
        <defs>
          <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d3eaf1" />
            <stop offset="50%" stopColor="#a4d3e0" />
            <stop offset="100%" stopColor="#7fbed1" />
          </linearGradient>
          <linearGradient id="landFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f3ead9" />
            <stop offset="100%" stopColor="#e7dac2" />
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

        <rect width={width} height={height} fill="url(#sea)" />

        {/* Graticule, one step off the sea so it reads as reference, not data. */}
        <g stroke="#ffffff" strokeOpacity="0.35" strokeWidth={u * 0.12}>
          {[10, 15, 20, 25, 30]
            .filter((lat) => lat > view.south && lat < view.north)
            .map((lat) => (
              <line key={lat} x1={0} y1={y(lat)} x2={width} y2={y(lat)} />
            ))}
          {[32, 35, 38, 41, 44]
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
              fill="url(#landFill)"
              stroke="#c9b892"
              strokeWidth="1"
            />
          ))}
        </g>

        {!compact && (
          <g fill="#a08d6a" fontSize={u * 1.9} letterSpacing={u * 0.18} fontWeight="600">
            {PLACES.filter(
              (p) => p.lon > view.west && p.lon < view.east && p.lat > view.south && p.lat < view.north
            ).map((place) => (
              <text key={place.name} x={x(place.lon)} y={y(place.lat)} textAnchor="middle">
                {place.name}
              </text>
            ))}
          </g>
        )}

        <g fill="#25707f" fontSize={u * 2.1} fontStyle="italic">
          {LABELS.filter(
            (l) => l.lon > view.west && l.lon < view.east && l.lat > view.south && l.lat < view.north
          ).map((label) => (
            <text
              key={label.name}
              x={x(label.lon)}
              y={y(label.lat)}
              textAnchor={label.anchor ?? 'middle'}
            >
              {label.name}
            </text>
          ))}
        </g>

        {/* One record's footprint, clipped to the sea. A bounding box drawn
            whole covers two countries and claims a reach over land that no
            marine dataset has; masking the land out shows the water it is
            actually about. */}
        {focus && box && !focusGlobal ? (
          <g>
            <rect
              x={x(box[0])}
              y={y(box[3])}
              width={Math.max(x(box[2]) - x(box[0]), 4)}
              height={Math.max(y(box[1]) - y(box[3]), 4)}
              fill={accent}
              fillOpacity={0.35}
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
              strokeOpacity="0.65"
              rx={u * 0.4}
            />
          </g>
        ) : null}

        {/* The places the records name as where the work happened. */}
        <g>
          {sites.map(({ site, sources: named }) => (
            <g key={site.name}>
              <title>
                {`${site.name}: named in ${named.length} record${named.length === 1 ? '' : 's'}`}
              </title>
              <circle cx={x(site.lon)} cy={y(site.lat)} r={u * 0.75} fill="#ffffff" fillOpacity="0.9" />
              <circle
                cx={x(site.lon)}
                cy={y(site.lat)}
                r={u * 0.42}
                fill="#1f2937"
                fillOpacity="0.75"
              />
              <text
                x={x(site.lon) + u * 1.1}
                y={y(site.lat) + u * 0.6}
                fontSize={u * 1.7}
                fill="#374151"
                stroke="#ffffff"
                strokeWidth={u * 0.45}
                paintOrder="stroke"
              >
                {site.name}
              </text>
            </g>
          ))}
        </g>

        {/* Every location that holds data. */}
        {clusters.map((group) => {
          const radius = u * 1.1 + Math.min(group.sources.length, 9) * u * 0.28;
          const single = group.sources.length === 1;
          const href = single ? `/sources/${group.sources[0].id}` : `/browse?subbasin=${group.sources[0].spatial.subbasins[0] ?? 'central'}`;
          return (
            <Link key={group.key} href={href}>
              <g className="cursor-pointer">
                <title>
                  {single
                    ? group.sources[0].title
                    : `${group.sources.length} datasets here: ${group.sources
                        .slice(0, 4)
                        .map((s) => s.title)
                        .join('; ')}${group.sources.length > 4 ? '…' : ''}`}
                </title>
                <circle
                  cx={x(group.lon)}
                  cy={y(group.lat)}
                  r={radius + u * 0.42}
                  fill="#ffffff"
                  fillOpacity="0.95"
                />
                <circle
                  cx={x(group.lon)}
                  cy={y(group.lat)}
                  r={radius}
                  fill={DOMAIN_COLORS[group.sources[0].domain[0]]}
                  fillOpacity="0.9"
                />
                {group.sources.length > 1 ? (
                  <text
                    x={x(group.lon)}
                    y={y(group.lat) + u * 0.62}
                    textAnchor="middle"
                    fontSize={u * 1.8}
                    fontWeight="700"
                    fill="#ffffff"
                  >
                    {group.sources.length}
                  </text>
                ) : null}
              </g>
            </Link>
          );
        })}
      </svg>
    </figure>
  );
}
