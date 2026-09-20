import Link from 'next/link';
import type { Source, Subbasin } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/types';
import { BAND_MAX, BAND_MIN, BAND_STEP, latitudeProfile, profileExtremes } from '@/lib/basin';
import { type BBox, isGlobalScale } from '@/lib/spatial';

/**
 * The basin as a ribbon rather than a map.
 *
 * The Red Sea runs 2,000 km along one axis and 300 km across it, so latitude
 * carries nearly all of the information a footprint has. Drawing it as a ribbon
 * keeps that and drops everything a tile map brought with it: keys, quotas,
 * watermarks, orbital swath gaps and four fallback styles. It renders from the
 * records alone, identically in a browser with no network at all.
 *
 * Nothing here is a coastline. The shape is schematic and says so; the only
 * geography claimed is latitude, which comes straight from each record's bbox.
 */

const SUBBASIN_MARKS: { key: Subbasin; label: string; from: number; to: number }[] = [
  { key: 'gulf-of-aqaba', label: 'Gulf of Aqaba', from: 27.9, to: 29.7 },
  { key: 'northern', label: 'Northern', from: 23.8, to: 27.9 },
  { key: 'central', label: 'Central', from: 18.8, to: 23.8 },
  { key: 'southern', label: 'Southern', from: 12.2, to: 18.8 },
  { key: 'farasan', label: 'Farasan', from: 16.0, to: 17.6 },
];

interface BasinRibbonProps {
  sources: Source[];
  /** Single-dataset mode: this record's reach is lit, the rest of the basin dimmed. */
  focus?: Source;
  className?: string;
}

/** Latitude to a 0-100 position down the ribbon, north at the top. */
function y(lat: number): number {
  return ((BAND_MAX - lat) / (BAND_MAX - BAND_MIN)) * 100;
}

export default function BasinRibbon({ sources, focus, className = '' }: BasinRibbonProps) {
  const profile = latitudeProfile(sources);
  const { max } = profileExtremes(profile);

  const focusBox = focus?.spatial.bbox as BBox | undefined;
  const focusGlobal = focusBox ? isGlobalScale(focusBox) : false;
  const focusFrom = focusBox ? Math.max(focusBox[1], BAND_MIN) : null;
  const focusTo = focusBox ? Math.min(focusBox[3], BAND_MAX) : null;

  // In catalogue mode every local dataset gets a dot at the middle of its
  // reach, nudged sideways by a stable hash so overlapping records stay
  // countable instead of stacking into one blob.
  // In catalogue mode every local dataset gets a dot at the middle of its
  // reach. Dots too close together are stepped sideways into free lanes rather
  // than left to pile up: the pile hides how many records are actually there.
  const LANE_GAP = 2.6; // percent of the ribbon's height
  const laneEnds: number[] = [];
  const dots = focus
    ? []
    : sources
        .filter((s) => s.spatial.bbox && !isGlobalScale(s.spatial.bbox as BBox))
        .map((s) => {
          const [, south, , north] = s.spatial.bbox as BBox;
          const mid = Math.min(Math.max((south + north) / 2, BAND_MIN), BAND_MAX);
          return { source: s, top: y(mid) };
        })
        .sort((a, b) => a.top - b.top)
        .map((dot) => {
          let lane = laneEnds.findIndex((end) => dot.top - end >= LANE_GAP);
          if (lane === -1) lane = laneEnds.length;
          laneEnds[lane] = dot.top;
          return { ...dot, lane };
        });

  return (
    <div className={`relative ${className}`}>
      <div className="relative flex h-full gap-4">
        {/* The ribbon: one band per half degree, shaded by how many datasets
            reach it. The shape of the shading is the north-south gradient. */}
        <div className="relative h-full w-20 shrink-0">
          <div className="absolute inset-0 overflow-hidden rounded-full ring-1 ring-slate-200">
            {/* North first: the profile is built from the strait upward, but the
                ribbon reads top-down like the latitude scale beside it. */}
            {[...profile].reverse().map((band) => {
              const inFocus =
                focusFrom === null ||
                focusTo === null ||
                (band.lat + BAND_STEP >= focusFrom && band.lat <= focusTo);
              const strength = band.count / max;
              return (
                <div
                  key={band.lat}
                  title={`${band.lat.toFixed(1)}-${(band.lat + BAND_STEP).toFixed(1)}°N: ${
                    band.count
                  } dataset${band.count === 1 ? '' : 's'}`}
                  className="w-full"
                  style={{
                    height: `${(BAND_STEP / (BAND_MAX - BAND_MIN)) * 100}%`,
                    backgroundColor: '#0f766e',
                    opacity: focus
                      ? inFocus
                        ? 0.25 + strength * 0.5
                        : 0.06
                      : 0.15 + strength * 0.75,
                  }}
                />
              );
            })}
          </div>

          {/* The focused record's reach, drawn over the ribbon. */}
          {focus && focusFrom !== null && focusTo !== null && !focusGlobal ? (
            <div
              className="absolute left-0 w-full rounded-xl ring-2 ring-inset"
              style={{
                top: `${y(focusTo)}%`,
                height: `${Math.max(y(focusFrom) - y(focusTo), 1.5)}%`,
                backgroundColor: `${DOMAIN_COLORS[focus.domain[0]]}55`,
                boxShadow: `0 0 0 2px ${DOMAIN_COLORS[focus.domain[0]]}`,
              }}
              title={`${focus.title}: ${focusBox?.[1]}-${focusBox?.[3]}°N`}
            />
          ) : null}
        </div>

        {/* Every local dataset, placed at the middle of its reach. */}
        {!focus ? (
          <div className="relative h-full w-44 shrink-0">
            {dots.map(({ source, top, lane }) => (
              <Link
                key={source.id}
                href={`/sources/${source.id}`}
                title={`${source.title} (${(source.spatial.bbox as BBox)[1]}-${
                  (source.spatial.bbox as BBox)[3]
                }°N)`}
                className="group absolute flex items-center gap-2"
                style={{ top: `${top}%`, left: `${10 + lane * 16}px`, transform: 'translateY(-50%)' }}
              >
                <span
                  className="h-3 w-3 rounded-full ring-2 ring-white transition group-hover:scale-125"
                  style={{ backgroundColor: DOMAIN_COLORS[source.domain[0]] }}
                />
                <span className="pointer-events-none absolute left-6 w-72 truncate rounded bg-white/95 px-1.5 py-0.5 text-xs text-slate-700 opacity-0 shadow-sm ring-1 ring-slate-200 transition group-hover:opacity-100">
                  {source.title}
                </span>
              </Link>
            ))}
          </div>
        ) : null}
        {/* Subbasins, named along the axis. */}
        <div className="relative h-full w-36 shrink-0">
          {SUBBASIN_MARKS.map((mark) => {
            const lit = !focus || focus.spatial.subbasins.includes(mark.key);
            return (
              <Link
                key={mark.key}
                href={`/browse?subbasin=${mark.key}`}
                className={`absolute left-0 flex w-full items-center gap-2 text-xs transition hover:text-teal-800 ${
                  lit ? 'text-slate-700' : 'text-slate-300'
                }`}
                style={{
                  top: `${y((mark.from + mark.to) / 2)}%`,
                  transform: 'translateY(-50%)',
                  paddingLeft: mark.key === 'farasan' ? '1.5rem' : undefined,
                }}
              >
                <span
                  className={`h-px w-4 ${lit ? 'bg-slate-300' : 'bg-slate-200'}`}
                  aria-hidden
                />
                <span className="font-medium">{mark.label}</span>
              </Link>
            );
          })}
        </div>

      </div>

      {/* Latitude scale, the one piece of real geography on the diagram. */}
      <div className="pointer-events-none absolute inset-y-0 left-0 w-20">
        {[30, 25, 20, 15, 12].map((lat) => (
          <span
            key={lat}
            className="absolute -left-8 text-[10px] tabular-nums text-slate-400"
            style={{ top: `${y(lat)}%`, transform: 'translateY(-50%)' }}
          >
            {lat}°N
          </span>
        ))}
      </div>
    </div>
  );
}
