import Link from 'next/link';
import type { YearCoverage } from '@/lib/timeline';

/**
 * One bar per year: height is how many datasets cover it, colour says whether
 * all five domains are represented. Each bar opens that year's records, so the
 * chart is also the filter.
 */
export default function YearStrip({
  years,
  height = 'h-24',
}: {
  years: YearCoverage[];
  height?: string;
}) {
  const peak = Math.max(...years.map((y) => y.datasets), 1);
  const first = years[0]?.year;
  const last = years[years.length - 1]?.year;
  const ticks = years.filter((y) => y.year % 10 === 0).map((y) => y.year);

  return (
    <div>
      <div className={`flex ${height} items-end gap-px`}>
        {years.map((entry) => {
          const complete = entry.domains === 5;

          // A year nothing covers has nothing to open, so it stays a bar.
          if (entry.datasets === 0) {
            return (
              <span
                key={entry.year}
                title={`${entry.year}: no datasets cover this year`}
                className="flex flex-1 items-end self-stretch"
              >
                <span className="h-[3%] w-full rounded-t-[2px] bg-slate-200" />
              </span>
            );
          }

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
                  complete ? 'bg-teal-700 hover:bg-teal-500' : 'bg-slate-300 hover:bg-slate-400'
                }`}
                style={{ height: `${Math.max((entry.datasets / peak) * 100, 3)}%` }}
              />
            </Link>
          );
        })}
      </div>
      <div className="relative mt-1 h-4 border-t border-slate-200">
        {ticks.map((year) => (
          <span
            key={year}
            className="absolute -translate-x-1/2 text-[11px] tabular-nums text-slate-400"
            style={{ left: `${((year - (first ?? 0)) / ((last ?? 1) - (first ?? 0))) * 100}%` }}
          >
            {year}
          </span>
        ))}
      </div>
    </div>
  );
}
