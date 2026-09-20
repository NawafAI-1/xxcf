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

const BASIN_VIEW = { west: 31.5, east: 45.5, south: 10.5, north: 30.5 };
/** The extent the coastline file covers; nothing can be shown beyond it. */
const DATA_LIMITS = { west: 30.5, east: 47.5, south: 9.5, north: 31.5 };
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
  { name: 'EGYPT', lon: 32.6, lat: 26.5 },
  { name: 'SAUDI ARABIA', lon: 42.4, lat: 24.5 },
  { name: 'SUDAN', lon: 33.4, lat: 18.5 },
  { name: 'ERITREA', lon: 38.6, lat: 15.4 },
  { name: 'YEMEN', lon: 44.4, lat: 15.2 },
];

const LABELS: { name: string; lon: number; lat: number; anchor?: 'start' | 'middle' | 'end' }[] = [
  { name: 'Gulf of Aqaba', lon: 35.6, lat: 28.9, anchor: 'start' },
  { name: 'Gulf of Suez', lon: 32.9, lat: 27.6, anchor: 'start' },
  { name: 'Red Sea', lon: 36.6, lat: 23.4, anchor: 'middle' },
  { name: 'Farasan', lon: 41.9, lat: 16.6, anchor: 'start' },
  { name: 'Bab el-Mandeb', lon: 43.6, lat: 12.6, anchor: 'start' },
];

interface Cluster {
  key: string;
  lon: number;
  lat: number;
  sources: Source[];
}

function cluster(sources: Source[], view: View): Cluster[] {
  const byKey = new Map<string, Cluster>();
  for (const source of sources) {
    if (!source.spatial.bbox || isGlobalScale(source.spatial.bbox as BBox)) continue;
    const [w, s, e, n] = source.spatial.bbox as BBox;
    const lon = (w + e) / 2;
    const lat = (s + n) / 2;
    if (lon < view.west || lon > view.east || lat < view.south || lat > view.north) continue;
    const key = `${Math.round(lon * 2) / 2},${Math.round(lat * 2) / 2}`;
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
        <g stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1">
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
          <g fill="#a08d6a" fontSize="11" letterSpacing="1.5" fontWeight="600">
            {PLACES.filter(
              (p) => p.lon > view.west && p.lon < view.east && p.lat > view.south && p.lat < view.north
            ).map((place) => (
              <text key={place.name} x={x(place.lon)} y={y(place.lat)} textAnchor="middle">
                {place.name}
              </text>
            ))}
          </g>
        )}

        <g fill="#25707f" fontSize="12" fontStyle="italic">
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
              strokeWidth="1.5"
              strokeDasharray="6 4"
              strokeOpacity="0.65"
              rx="3"
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
              <circle cx={x(site.lon)} cy={y(site.lat)} r="4.5" fill="#ffffff" fillOpacity="0.9" />
              <circle
                cx={x(site.lon)}
                cy={y(site.lat)}
                r="2.5"
                fill="#1f2937"
                fillOpacity="0.75"
              />
              <text
                x={x(site.lon) + 7}
                y={y(site.lat) + 3.5}
                fontSize="10"
                fill="#374151"
                stroke="#ffffff"
                strokeWidth="2.5"
                paintOrder="stroke"
              >
                {site.name}
              </text>
            </g>
          ))}
        </g>

        {/* Every location that holds data. */}
        {clusters.map((group) => {
          const radius = 6 + Math.min(group.sources.length, 9) * 1.6;
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
                  r={radius + 2.5}
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
                    y={y(group.lat) + 4}
                    textAnchor="middle"
                    fontSize="11"
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
