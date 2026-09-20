interface PageHeaderProps {
  title: string;
  description?: string;
  children?: React.ReactNode;
}

/** Consistent title block for the non-overview pages. */
export default function PageHeader({ title, description, children }: PageHeaderProps) {
  return (
    <div className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-600">{description}</p> : null}
      {children}
    </div>
  );
}
