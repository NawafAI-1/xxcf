import Link from 'next/link';

interface StatTileProps {
  label: string;
  value: string;
  hint?: string;
  href?: string;
  /** Accent bar color — identity only; the text stays in ink tokens. */
  accent?: string;
}

/**
 * One headline number. Label above, value large, one line of context below —
 * the value carries the weight, so nothing else in the tile competes with it.
 */
export default function StatTile({ label, value, hint, href, accent = '#0f766e' }: StatTileProps) {
  const body = (
    <>
      <span className="block h-1 w-8 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
      <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-relaxed text-slate-500">{hint}</p> : null}
    </>
  );

  const className =
    'block rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition' +
    (href ? ' hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md' : '');

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
