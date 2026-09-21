import Link from 'next/link';

interface PanelProps {
  /** Small label above the title, for scanning the page by section. */
  eyebrow?: string;
  title: string;
  description?: string;
  action?: { href: string; label: string };
  footnote?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * The dashboard's one card. Every panel shares the same frame, the same header
 * rhythm and the same place for a caveat, so the page reads as one instrument
 * rather than a pile of boxes.
 */
export default function Panel({
  eyebrow,
  title,
  description,
  action,
  footnote,
  children,
  className = '',
}: PanelProps) {
  return (
    <section
      className={`rounded-2xl bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/80 sm:p-5 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          {eyebrow ? (
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
              {eyebrow}
            </p>
          ) : null}
          <h2 className="text-base font-semibold tracking-tight text-slate-900">{title}</h2>
          {description ? (
            <p className="mt-1 max-w-xl text-sm leading-snug text-slate-600">{description}</p>
          ) : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1 text-sm font-medium text-teal-700 transition hover:bg-teal-50 hover:text-teal-800"
          >
            {action.label} &rarr;
          </Link>
        ) : null}
      </div>
      {children}
      {footnote ? <p className="mt-4 text-xs leading-snug text-slate-500">{footnote}</p> : null}
    </section>
  );
}
