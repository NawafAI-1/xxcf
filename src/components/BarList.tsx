import Link from 'next/link';

export interface BarItem {
  key: string;
  label: string;
  count: number;
  color: string;
  href?: string;
}

interface BarListProps {
  items: BarItem[];
  /** Denominator for bar width — usually the largest count, not the sum. */
  max?: number;
  unit?: string;
}

/**
 * Horizontal bars, one per category, each directly labelled with its value.
 * Direct labels are the secondary encoding that keeps the categories readable
 * when two hues sit close together for a colorblind reader.
 */
export default function BarList({ items, max, unit = 'datasets' }: BarListProps) {
  const ceiling = max ?? Math.max(...items.map((i) => i.count), 1);

  return (
    <ul className="space-y-2">
      {items.map((item) => {
        const width = `${Math.max((item.count / ceiling) * 100, 2)}%`;
        const row = (
          <div className="flex items-center gap-3">
            <span className="w-36 shrink-0 truncate text-sm text-slate-700" title={item.label}>
              {item.label}
            </span>
            <span className="flex flex-1 items-center gap-2">
              <span
                className="h-5 rounded-r-[4px]"
                style={{ width, backgroundColor: item.color }}
                title={`${item.label}: ${item.count} ${unit}`}
                aria-hidden
              />
              <span className="text-sm font-medium tabular-nums text-slate-600">{item.count}</span>
            </span>
          </div>
        );

        return (
          <li key={item.key}>
            {item.href ? (
              <Link
                href={item.href}
                className="block rounded-md py-0.5 transition hover:bg-slate-50"
                aria-label={`${item.label}: ${item.count} ${unit}`}
              >
                {row}
              </Link>
            ) : (
              row
            )}
          </li>
        );
      })}
    </ul>
  );
}
