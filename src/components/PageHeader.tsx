interface PageHeaderProps {
  title: string;
  description?: string;
  /** The section's colour, from src/lib/sections.ts. */
  accent?: string;
  children?: React.ReactNode;
}

/** Consistent title block for the non-overview pages. */
export default function PageHeader({ title, description, accent, children }: PageHeaderProps) {
  return (
    <div className="mb-6">
      {accent ? (
        <span className="mb-3 block h-1 w-10 rounded-full" style={{ backgroundColor: accent }} aria-hidden />
      ) : null}
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p> : null}
      {children}
    </div>
  );
}
