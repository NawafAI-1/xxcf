import Link from 'next/link';

interface SectionProps {
  title: string;
  description?: string;
  action?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}

/** A titled panel on the overview page — keeps every block visually identical. */
export default function Section({ title, description, action, children, className = '' }: SectionProps) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {description ? <p className="mt-1 text-sm text-slate-600">{description}</p> : null}
        </div>
        {action ? (
          <Link
            href={action.href}
            className="shrink-0 whitespace-nowrap text-sm font-medium text-teal-700 hover:text-teal-800"
          >
            {action.label} &rarr;
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}
