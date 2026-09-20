import Link from 'next/link';
import type { Source } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/types';

const ACCESS_LABELS: Record<Source['access']['tier'], string> = {
  public: 'Public',
  'kaust-internal': 'KAUST Internal',
  restricted: 'Restricted',
  embargoed: 'Embargoed',
};

const ACCESS_STYLES: Record<Source['access']['tier'], string> = {
  public: 'bg-green-100 text-green-800',
  'kaust-internal': 'bg-blue-100 text-blue-800',
  restricted: 'bg-amber-100 text-amber-800',
  embargoed: 'bg-red-100 text-red-800',
};

export default function SourceCard({ source }: { source: Source }) {
  const [w, s, e, n] = source.spatial.bbox;

  return (
    <Link
      href={`/sources/${source.id}`}
      className="flex h-full flex-col rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {source.domain.map((d) => (
          <span
            key={d}
            className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: DOMAIN_COLORS[d] }}
          >
            {d}
          </span>
        ))}
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ACCESS_STYLES[source.access.tier]}`}>
          {ACCESS_LABELS[source.access.tier]}
        </span>
      </div>
      <h3 className="text-base font-semibold text-slate-900">{source.title}</h3>
      <p className="mt-1 line-clamp-2 text-sm text-slate-600">{source.abstract}</p>
      <div className="mt-auto flex flex-wrap gap-3 pt-3 text-xs text-slate-500">
        <span>
          bbox [{w}, {s}, {e}, {n}]
        </span>
        <span>
          {source.temporal.start}&ndash;{source.temporal.ongoing ? 'present' : source.temporal.end}
        </span>
        <span className="capitalize">{source.quality.status.replace('-', ' ')}</span>
      </div>
    </Link>
  );
}
