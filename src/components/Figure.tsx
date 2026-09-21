import Link from 'next/link';

/** One headline figure, with room for a line of context underneath. */
export default function Figure({
  label,
  value,
  hint,
  href,
  accent,
}: {
  label: string;
  value: string;
  hint: string;
  href?: string;
  accent: string;
}) {
  const body = (
    <>
      <span className="block h-1 w-8 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
      <p className="mt-2.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 text-[1.75rem] font-semibold leading-none tracking-tight text-slate-900">
        {value}
      </p>
      <p className="mt-1.5 text-xs leading-snug text-slate-500">{hint}</p>
    </>
  );
  const className =
    'block rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/80 transition' +
    (href ? ' hover:-translate-y-0.5 hover:ring-slate-300' : '');
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
