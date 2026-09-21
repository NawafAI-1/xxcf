import Link from 'next/link';
import land from '@/lib/basin-land.json';
import type { Source } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/types';
import { type BBox, isGlobalScale } from '@/lib/spatial';
import { siteMentions } from '@/lib/sites';
import { BAND_STEP, latitudeProfile, thinStretch } from '@/lib/basin';
import type { Domain } from '@/lib/types';

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
  /**
   * Draw the latitude coverage gauge and mark the least observed stretch.
   * The overview's small map has no room for either.
   */
  showCoverage?: boolean;
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
];

const LABELS: { name: string; lon: number; lat: number; anchor?: 'start' | 'middle' | 'end' }[] = [
  { name: 'Red Sea', lon: 38.6, lat: 19.4, anchor: 'middle' },
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

/**
 * The domains present at a spot, in catalogue order, with how many records
 * each accounts for. A cluster painted the colour of whichever record happened
 * to sort first claimed a domain it did not have; a ring of its actual mix
 * does not.
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

/**
 * Nudge overlapping discs apart, keeping a memory of where each one belongs.
 *
 * Half the catalogue sits on one stretch of the Saudi coast, so at basin scale
 * the biggest circles bury each other and the counts underneath become
 * unreadable. Pushing them apart and drawing a leader back to the true spot
 * keeps every count legible without moving the data: the small tick is where
 * the datasets are, the disc is only where its label fits.
 */
function relax(
  discs: { cx: number; cy: number; r: number; trueX: number; trueY: number }[],
  width: number,
  height: number,
  /** Marks a disc must not land on: field-site pins and the sea names. */
  fixed: { cx: number; cy: number; r: number }[] = []
) {
  for (let pass = 0; pass < 120; pass += 1) {
    let moved = false;
    for (let i = 0; i < discs.length; i += 1) {
      for (let j = i + 1; j < discs.length; j += 1) {
        const a = discs[i];
        const b = discs[j];
        const dx = b.cx - a.cx;
        const dy = b.cy - a.cy;
        const distance = Math.hypot(dx, dy) || 0.01;
        const wanted = a.r + b.r + 3;
        if (distance >= wanted) continue;
        const push = (wanted - distance) / 2;
        const ux = dx / distance;
        const uy = dy / distance;
        a.cx -= ux * push;
        a.cy -= uy * push;
        b.cx += ux * push;
        b.cy += uy * push;
        moved = true;
      }
    }
    for (const disc of discs) {
      for (const block of fixed) {
        const dx = disc.cx - block.cx;
        const dy = disc.cy - block.cy;
        const distance = Math.hypot(dx, dy) || 0.01;
        const wanted = disc.r + block.r;
        if (distance >= wanted) continue;
        disc.cx += (dx / distance) * (wanted - distance);
        disc.cy += (dy / distance) * (wanted - distance);
        moved = true;
      }
    }
    // A disc drifts only as far as it must, so the map still reads as a map.
    for (const disc of discs) {
      const dx = disc.cx - disc.trueX;
      const dy = disc.cy - disc.trueY;
      const drift = Math.hypot(dx, dy);
      const limit = disc.r * 3.5;
      if (drift > limit) {
        disc.cx = disc.trueX + (dx / drift) * limit;
        disc.cy = disc.trueY + (dy / drift) * limit;
      }
      disc.cx = Math.min(Math.max(disc.cx, disc.r + 2), width - disc.r - 2);
      disc.cy = Math.min(Math.max(disc.cy, disc.r + 2), height - disc.r - 2);
    }
    if (!moved) break;
  }
  return discs;
}

/** Arc path for one slice of a cluster's ring. */
function arc(cx: number, cy: number, r: number, from: number, to: number): string {
  const p = (angle: number) => [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  const [x1, y1] = p(from);
  const [x2, y2] = p(to);
  const large = to - from > Math.PI ? 1 : 0;
  return `M${x1.toFixed(2)},${y1.toFixed(2)}A${r.toFixed(2)},${r.toFixed(2)} 0 ${large} 1 ${x2.toFixed(2)},${y2.toFixed(2)}`;
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

export default function BasinMap({
  sources,
  focus,
  compact = false,
  showCoverage = false,
}: BasinMapProps) {
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

  // How far observation reaches at each latitude, drawn on the map rather than
  // only stated beside it: the gauge and the marked stretch are the same
  // numbers the page's "where to look next" panel quotes.
  const coverage = showCoverage && !focus ? latitudeProfile(sources) : [];
  const coveragePeak = Math.max(...coverage.map((b) => b.count), 1);
  const thin = showCoverage && !focus ? thinStretch(sources) : null;
  const clusterDiscs = relax(
    clusters.map((group) => ({
      cx: x(group.lon),
      cy: y(group.lat),
      trueX: x(group.lon),
      trueY: y(group.lat),
      r: u * 1.1 + Math.min(group.sources.length, 9) * u * 0.28 + u * 1.02,
    })),
    width,
    height,
    [
      ...sites.map(({ site }) => ({ cx: x(site.lon), cy: y(site.lat), r: u * 1.6 })),
      ...LABELS.filter(
        (l) => l.lon > view.west && l.lon < view.east && l.lat > view.south && l.lat < view.north
      ).map((l) => ({ cx: x(l.lon), cy: y(l.lat), r: u * 5.5 })),
    ]
  );
  const gaugeLeft = x(view.west) + u * 1.6;
  const gaugeWidth = u * 5;

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

        {/* The least observed stretch of the basin, marked where it is rather
            than only named in a panel beside the map. */}
        {thin ? (
          <g>
            <rect
              x={0}
              y={y(thin.to)}
              width={width}
              height={Math.max(y(thin.from) - y(thin.to), u)}
              fill="#b45309"
              fillOpacity={0.09}
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
                strokeWidth={u * 0.14}
                strokeDasharray={`${u * 0.8} ${u * 0.6}`}
              />
            ))}
            <text
              x={width - u * 1.5}
              y={y(thin.to) + u * 2.2}
              textAnchor="end"
              fontSize={u * 1.6}
              fontWeight="600"
              fill="#92400e"
              stroke="#ffffff"
              strokeWidth={u * 0.55}
              paintOrder="stroke"
            >
              {`least observed: ${thin.count} datasets reach ${thin.from.toFixed(1)}-${thin.to.toFixed(1)}\u00b0N`}
            </text>
          </g>
        ) : null}

        {/* How far observation reaches at each latitude, read straight across
            from any point on the map. */}
        {coverage.length > 0 ? (
          <g>
            <rect
              x={gaugeLeft - u * 0.5}
              y={y(coverage[coverage.length - 1].lat + BAND_STEP) - u * 0.5}
              width={gaugeWidth + u}
              height={y(coverage[0].lat) - y(coverage[coverage.length - 1].lat + BAND_STEP) + u}
              rx={u * 0.4}
              fill="#ffffff"
              fillOpacity={0.5}
            />
            <text
              x={gaugeLeft}
              y={y(coverage[coverage.length - 1].lat + BAND_STEP) - u * 2.6}
              fontSize={u * 1.15}
              fontWeight="700"
              letterSpacing={u * 0.05}
              fill="#0f766e"
            >
              <tspan x={gaugeLeft} dy={0}>DATASETS</tspan>
              <tspan x={gaugeLeft} dy={u * 1.35}>REACHING</tspan>
            </text>
            {coverage.map((band) => (
              <rect
                key={band.lat}
                x={gaugeLeft}
                y={y(band.lat + BAND_STEP)}
                width={Math.max((band.count / coveragePeak) * gaugeWidth, u * 0.2)}
                height={Math.max(y(band.lat) - y(band.lat + BAND_STEP) - u * 0.08, u * 0.2)}
                fill={thin && band.lat >= thin.from && band.lat < thin.to ? '#b45309' : '#0f766e'}
                fillOpacity={0.85}
              >
                <title>{`${band.lat.toFixed(1)}-${(band.lat + BAND_STEP).toFixed(1)}\u00b0N: ${band.count} datasets`}</title>
              </rect>
            ))}
            <text
              x={gaugeLeft + gaugeWidth + u * 1.1}
              y={y(coverage.reduce((best, b) => (b.count > best.count ? b : best), coverage[0]).lat) + u * 0.4}
              fontSize={u * 1.35}
              fontWeight="700"
              fill="#0f766e"
              stroke="#ffffff"
              strokeWidth={u * 0.45}
              paintOrder="stroke"
            >
              {coveragePeak}
            </text>
          </g>
        ) : null}

        {/* Where the datasets actually sit, before any disc is nudged off it. */}
        <g>
          {clusterDiscs
            .filter((d) => Math.hypot(d.cx - d.trueX, d.cy - d.trueY) > u * 0.6)
            .map((d) => (
              <g key={`leader-${d.trueX.toFixed(1)}-${d.trueY.toFixed(1)}`}>
                <line
                  x1={d.trueX}
                  y1={d.trueY}
                  x2={d.cx}
                  y2={d.cy}
                  stroke="#334155"
                  strokeWidth={u * 0.16}
                  strokeOpacity={0.45}
                />
                <circle cx={d.trueX} cy={d.trueY} r={u * 0.42} fill="#ffffff" />
                <circle cx={d.trueX} cy={d.trueY} r={u * 0.26} fill="#334155" />
              </g>
            ))}
        </g>

        {/* Every location that holds data, ringed by the domains actually
            present there and linking to exactly those records. */}
        {clusters.map((group, index) => {
          const radius = u * 1.1 + Math.min(group.sources.length, 9) * u * 0.28;
          const mix = domainMix(group.sources);
          const total = mix.reduce((sum, m) => sum + m.count, 0) || 1;
          const disc = clusterDiscs[index];
          const cx = disc.cx;
          const cy = disc.cy;
          const ring = radius + u * 0.72;
          const href = `/browse?id=${group.sources.map((s) => s.id).join(',')}`;
          let angle = -Math.PI / 2;
          return (
            <Link key={group.key} href={href}>
              <g className="cursor-pointer">
                <title>
                  {`${group.sources.length} dataset${group.sources.length === 1 ? '' : 's'} here (${mix
                    .map((m) => `${m.count} ${m.domain}`)
                    .join(', ')}). Opens them.`}
                </title>
                <circle cx={cx} cy={cy} r={ring + u * 0.3} fill="#ffffff" fillOpacity="0.95" />
                {/* The ring is the domain mix; the disc underneath stays neutral
                    so no one domain claims a spot it only shares. */}
                {mix.map((m) => {
                  const sweep = (m.count / total) * Math.PI * 2;
                  const from = angle;
                  angle += sweep;
                  return (
                    <path
                      key={m.domain}
                      d={arc(cx, cy, ring, from, angle - 0.04)}
                      fill="none"
                      stroke={DOMAIN_COLORS[m.domain]}
                      strokeWidth={u * 0.62}
                      strokeLinecap="butt"
                    />
                  );
                })}
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill="#334155"
                  fillOpacity={0.88}
                />
                <text
                  x={cx}
                  y={cy + u * 0.62}
                  textAnchor="middle"
                  fontSize={u * 1.8}
                  fontWeight="700"
                  fill="#ffffff"
                >
                  {group.sources.length}
                </text>
              </g>
            </Link>
          );
        })}
        {/* The places the records name as where the work happened. Thuwal sits
            48 km from Jeddah and Farasan 25 km from Jazan, so labels alternate
            sides and shift down whenever the one before is within reach. */}
        <g>
          {(() => {
            const placed: { px: number; py: number }[] = [];
            const midLon = (view.west + view.east) / 2;
            return [...sites]
              .sort((a, b) => b.site.lat - a.site.lat)
              .map(({ site, sources: named }) => {
                const px = x(site.lon);
                const py = y(site.lat);
                // Push the name out past any cluster the marker sits inside,
                // and away from the neighbour above it if that one is close.
                const covering = clusterDiscs
                  .filter((d) => Math.hypot(d.cx - px, d.cy - py) < d.r)
                  .reduce((widest, d) => Math.max(widest, d.r - (d.cx - px)), 0);
                const crowded = placed.some(
                  (q) => Math.abs(q.py - py) < u * 2.2 && Math.abs(q.px - px) < u * 18
                );
                placed.push({ px, py });
                // Inland is the empty half, so eastern-shore names run east.
                const left = site.lon < midLon;
                const gap = u * 1.1 + Math.max(covering, 0);
                return (
                  <g key={site.name}>
                    <title>
                      {`${site.name}: named in ${named.length} record${named.length === 1 ? '' : 's'}`}
                    </title>
                    <circle cx={px} cy={py} r={u * 0.75} fill="#ffffff" fillOpacity="0.9" />
                    <circle cx={px} cy={py} r={u * 0.42} fill="#1f2937" fillOpacity="0.75" />
                    {gap > u * 2 ? (
                      <line
                        x1={px}
                        y1={py}
                        x2={left ? px - gap + u * 0.4 : px + gap - u * 0.4}
                        y2={py + (crowded ? u * 1.5 : 0)}
                        stroke="#64748b"
                        strokeWidth={u * 0.13}
                        strokeOpacity={0.8}
                      />
                    ) : null}
                    <text
                      x={left ? px - gap : px + gap}
                      y={py + (crowded ? u * 2.1 : u * 0.6)}
                      textAnchor={left ? 'end' : 'start'}
                      fontSize={u * 1.7}
                      fill="#374151"
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
      </svg>
    </figure>
  );
}
