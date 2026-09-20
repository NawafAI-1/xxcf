import Link from 'next/link';
import type { Timeline } from '@/lib/timeline';
import { DOMAIN_COLORS } from '@/lib/types';

const DOMAIN_LABELS: Record<string, string> = {
  environmental: 'Environmental',
  ecological: 'Ecological',
  production: 'Production',
  'nutrition-health': 'Nutrition & health',
  'socio-economic': 'Socio-economic',
};

/** Decade ticks across the full span, for the axis and the gridlines. */
function decades(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let year = Math.ceil(min / 10) * 10; year <= max; year += 10) ticks.push(year);
  return ticks;
}

export default function TimelineRibbon({ timeline }: { timeline: Timeline }) {
  const { minYear, maxYear, groups, years, bestOverlap } = timeline;
  const span = maxYear - minYear + 1;
  const ticks = decades(minYear, maxYear);
  const peakDatasets = Math.max(...years.map((y) => y.datasets), 1);
  const peakYear = years.reduce((best, y) => (y.datasets > best.datasets ? y : best), years[0]);
  const firstComplete = years.find((y) => y.domains === 5)?.year;
  const position = (start: number, end: number) => ({
    left: `${((start - minYear) / span) * 100}%`,
    width: `${((end - start + 1) / span) * 100}%`,
  });

  return (
    <div className="space-y-6">
      {bestOverlap ? (
        <p className="rounded-xl bg-white px-4 py-3 text-sm text-slate-700 shadow-sm ring-1 ring-slate-200">
          <span className="text-2xl font-semibold text-slate-900">
            {bestOverlap.from}&ndash;{bestOverlap.to}
          </span>{' '}
          is the longest stretch where all {bestOverlap.domains} domains are represented at once.
          Anything that needs environment, ecology, catch, nutrition and economics together has to
          live inside a window like this one.
        </p>
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-slate-900">Datasets in play, year by year</h2>
        <p className="mt-1 text-sm text-slate-600">
          Bar height is how many datasets cover each year. A bar is teal where all five domains are
          represented and slate where they are not, so the thin, pale years on the left are the ones
          an integrated question cannot reach. Click any year to open the records covering it.
        </p>
        <div className="mt-4 flex h-24 items-end gap-px">
          {years.map((entry) => {
            const complete = entry.domains === 5;
            return (
              <Link
                key={entry.year}
                href={`/browse?year=${entry.year}`}
                title={`${entry.year}: ${entry.datasets} dataset${
                  entry.datasets === 1 ? '' : 's'
                }, ${entry.domains} of 5 domains. Opens them.`}
                aria-label={`${entry.year}: open the ${entry.datasets} datasets covering this year`}
                className="flex flex-1 items-end self-stretch"
              >
                <span
                  className={`w-full rounded-t-[2px] transition ${
                    complete ? 'bg-teal-700 hover:bg-teal-500' : 'bg-slate-400 hover:bg-slate-500'
                  }`}
                  style={{ height: `${Math.max((entry.datasets / peakDatasets) * 100, 3)}%` }}
                />
              </Link>
            );
          })}
        </div>
        <div className="relative mt-1 h-4 border-t border-slate-200">
          {ticks.map((year) => (
            <span
              key={year}
              className="absolute -translate-x-1/2 text-xs tabular-nums text-slate-500"
              style={{ left: `${((year - minYear) / span) * 100}%` }}
            >
              {year}
            </span>
          ))}
        </div>
        <p className="mt-6 text-xs text-slate-500">
          Peak: {peakYear.datasets} datasets covering {peakYear.year}. Earliest year with all five
          domains: {firstComplete ?? 'none'}.
        </p>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">Every dataset, end to end</h2>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
            {groups.map((group) => (
              <li key={group.domain} className="flex items-center gap-1.5">
                <span
                  className="h-2.5 w-2.5 rounded-[2px]"
                  style={{ backgroundColor: DOMAIN_COLORS[group.domain] }}
                  aria-hidden
                />
                {DOMAIN_LABELS[group.domain] ?? group.domain}
              </li>
            ))}
          </ul>
        </div>

        <div className="overflow-x-auto">
          <div className="min-w-[56rem]">
            {/* Axis, repeated at the top so long groups stay readable. */}
            <div className="mb-2 flex items-end gap-3 border-b border-slate-200 pb-1">
              <span className="w-80 shrink-0" />
              <div className="relative h-4 flex-1">
                {ticks.map((year) => (
                  <span
                    key={year}
                    className="absolute -translate-x-1/2 text-xs tabular-nums text-slate-500"
                    style={{ left: `${((year - minYear) / span) * 100}%` }}
                  >
                    {year}
                  </span>
                ))}
              </div>
            </div>

            {groups.map((group) => (
              <div key={group.domain} className="mb-5 last:mb-0">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {DOMAIN_LABELS[group.domain] ?? group.domain}
                  <span className="ml-2 font-normal normal-case tracking-normal text-slate-400">
                    {group.rows.length} dataset{group.rows.length === 1 ? '' : 's'}
                  </span>
                </p>

                <ul>
                  {group.rows.map((row) => {
                    const left = ((row.start - minYear) / span) * 100;
                    const right = ((row.end + 1 - minYear) / span) * 100;
                    // The period reads at the end of its own bar, unless the bar
                    // runs to the edge, where it would be clipped.
                    const labelInside = right > 86;
                    return (
                      <li key={`${group.domain}-${row.id}`}>
                        <Link
                          href={`/sources/${row.id}`}
                          className="group flex items-center gap-3 rounded-md py-1 transition hover:bg-slate-50"
                        >
                          <span
                            className="w-80 shrink-0 truncate text-[11px] leading-4 text-slate-700 group-hover:text-teal-800"
                            title={row.title}
                          >
                            {row.title}
                          </span>
                          <span className="relative h-5 flex-1">
                            {ticks.map((year) => (
                              <span
                                key={year}
                                aria-hidden
                                className="absolute top-0 h-full w-px bg-slate-100"
                                style={{ left: `${((year - minYear) / span) * 100}%` }}
                              />
                            ))}
                            <span
                              aria-hidden
                              className="absolute top-0 h-full w-px bg-slate-200"
                              style={{ left: `${((maxYear - minYear) / span) * 100}%` }}
                            />
                            <span
                              className={`absolute top-1 h-3 transition group-hover:brightness-110 ${
                                row.ongoing ? 'rounded-l-[3px]' : 'rounded-[3px]'
                              }`}
                              style={{
                                left: `${left}%`,
                                width: `${Math.max(right - left, 0.6)}%`,
                                backgroundColor: DOMAIN_COLORS[group.domain],
                                opacity: row.status === 'analysis-ready' ? 1 : 0.5,
                              }}
                              title={`${row.title}: ${row.start}-${row.ongoing ? 'present' : row.end}, ${row.status.replace('-', ' ')}`}
                            />
                            {row.ongoing ? (
                              <span
                                aria-hidden
                                className="absolute top-[7px] text-[9px] leading-none"
                                style={{
                                  left: `calc(${right}% + 1px)`,
                                  color: DOMAIN_COLORS[group.domain],
                                }}
                              >
                                &#9654;
                              </span>
                            ) : null}
                            <span
                              className="absolute top-0.5 whitespace-nowrap text-[10px] tabular-nums text-slate-400"
                              style={
                                labelInside
                                  ? { right: `calc(${100 - left}% + 6px)` }
                                  : { left: `calc(${right}% + ${row.ongoing ? 10 : 4}px)` }
                              }
                            >
                              {row.start}
                              {row.ongoing ? '-' : `-${row.end}`}
                            </span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <p className="mt-4 text-xs text-slate-500">
          Solid bars are analysis-ready records; faded bars still need processing. A bar ending in
          &#9654; is still collecting. A dataset in two domains appears in both rows.
        </p>
      </section>
    </div>
  );
}
