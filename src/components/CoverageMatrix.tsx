import type { Source } from '@/lib/types';
import { SUBBASINS, QUALITY_COLORS } from '@/lib/types';
import { COVERAGE_COLUMNS, coverageCell } from '@/lib/coverage';

const LEGEND: { label: string; color: string; note: string }[] = [
  { label: 'Analysis-ready', color: QUALITY_COLORS['analysis-ready'], note: 'usable as-is' },
  { label: 'Cleaned / raw', color: QUALITY_COLORS.cleaned, note: 'needs processing first' },
  { label: 'No data', color: '#e2e8f0', note: 'nothing catalogued yet' },
];

export default function CoverageMatrix({ sources }: { sources: Source[] }) {
  return (
    <div>
      <ul className="mb-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate-600">
        {LEGEND.map((item) => (
          <li key={item.label} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-[2px] ring-1 ring-inset ring-black/5"
              style={{ backgroundColor: item.color }}
              aria-hidden
            />
            <span className="font-medium text-slate-700">{item.label}</span>
            <span className="text-slate-500">— {item.note}</span>
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-collapse text-sm">
          <caption className="sr-only">
            Best available data quality for each Red Sea subbasin and domain/theme combination.
          </caption>
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-slate-50 p-3 text-left font-semibold text-slate-700">
                Subbasin
              </th>
              {COVERAGE_COLUMNS.map((col) => (
                <th key={col.key} scope="col" className="p-3 text-left align-bottom">
                  <span className="block text-xs font-medium uppercase tracking-wide text-slate-400">
                    {col.domain.replace('-', ' ')}
                  </span>
                  <span className="block font-medium text-slate-700">{col.shortLabel}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SUBBASINS.map((subbasin) => (
              <tr key={subbasin} className="border-t border-slate-100">
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-white p-3 text-left font-medium capitalize text-slate-800"
                >
                  {subbasin.replace(/-/g, ' ')}
                </th>
                {COVERAGE_COLUMNS.map((col) => {
                  const { status, count } = coverageCell(sources, subbasin, col);
                  return (
                    <td key={col.key} className="p-1.5">
                      <div
                        title={
                          status
                            ? `${col.label} — ${subbasin.replace(/-/g, ' ')}: ${count} dataset${
                                count === 1 ? '' : 's'
                              }, best available is ${status.replace('-', ' ')}`
                            : `${col.label} — ${subbasin.replace(/-/g, ' ')}: no catalogued dataset`
                        }
                        className={`flex h-12 w-full flex-col items-center justify-center rounded-md text-xs font-medium transition hover:brightness-110 ${
                          status ? 'text-white' : 'border border-dashed border-slate-300 text-slate-400'
                        }`}
                        style={{ backgroundColor: status ? QUALITY_COLORS[status] : '#f1f5f9' }}
                      >
                        <span>{status ? status.replace('-', ' ') : 'gap'}</span>
                        {status ? (
                          <span className="text-[10px] font-normal tabular-nums text-white/80">
                            {count} dataset{count === 1 ? '' : 's'}
                          </span>
                        ) : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
