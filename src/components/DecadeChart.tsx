import type { DecadeCount } from '@/lib/stats';

/**
 * How many datasets have records touching each decade. One series, so no
 * legend: the heading says what is plotted. Only the peak column is labelled
 * outright; the rest reveal their value on hover and all of them are listed in
 * the table below for anyone who needs the numbers.
 */
export default function DecadeChart({ decades }: { decades: DecadeCount[] }) {
  const peak = Math.max(...decades.map((d) => d.count), 1);

  return (
    <figure className="m-0">
      <div className="flex h-40 items-end gap-2" role="presentation">
        {decades.map((d) => {
          const isPeak = d.count === peak;
          return (
            <div
              key={d.decade}
              className="group/col flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              <span
                className={`h-4 text-xs font-medium leading-4 tabular-nums text-slate-600 ${
                  isPeak ? '' : 'opacity-0 transition-opacity group-hover/col:opacity-100'
                }`}
              >
                {d.count}
              </span>
              {/* Height is taken from the column's own height minus the label row
                  above it, so the tallest bar fills the plot without pushing its
                  label out of the frame. */}
              <span
                className="w-full max-w-[24px] rounded-t-[4px] bg-teal-600 transition group-hover/col:bg-teal-500"
                style={{ height: `calc((100% - 1.25rem) * ${Math.max(d.count / peak, 0.04).toFixed(3)})` }}
                title={`${d.decade}s: ${d.count} datasets with records in this decade`}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 border-t border-slate-200 pt-1">
        {decades.map((d) => (
          <span key={d.decade} className="flex-1 text-center text-xs tabular-nums text-slate-500">
            {d.label}
          </span>
        ))}
      </div>
      <details className="mt-3 text-xs text-slate-500">
        <summary className="cursor-pointer hover:text-slate-700">View as table</summary>
        <table className="mt-2 w-full text-left">
          <thead>
            <tr className="text-slate-500">
              <th className="py-1 font-medium">Decade</th>
              <th className="py-1 font-medium">Datasets with records</th>
            </tr>
          </thead>
          <tbody>
            {decades.map((d) => (
              <tr key={d.decade} className="border-t border-slate-100">
                <td className="py-1 tabular-nums">{d.decade}s</td>
                <td className="py-1 tabular-nums">{d.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
