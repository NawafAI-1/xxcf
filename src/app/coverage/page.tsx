import { getAllSources } from '@/lib/sources';
import { getCatalogStats } from '@/lib/stats';
import CoverageMatrix from '@/components/CoverageMatrix';
import PageHeader from '@/components/PageHeader';
import { sectionAccent } from '@/lib/sections';

export const metadata = {
  title: 'Coverage gaps | Red Sea Marine Data Catalog',
  description: 'Which Red Sea subbasins have data for which themes, and which combinations have none.',
};

export default function CoveragePage() {
  const sources = getAllSources();
  const { coverage } = getCatalogStats(sources);

  return (
    <div>
      <PageHeader
        accent={sectionAccent('/coverage')}
        title="Coverage gap matrix"
        description="Rows are Red Sea subbasins, columns are the domain × theme combinations we track. Each cell shows the best data quality available for it, and opens the datasets behind it when clicked. A grey cell means nothing in the catalog answers that question yet."
      />
      <p className="mb-5 inline-flex flex-wrap items-baseline gap-x-2 rounded-lg bg-white px-4 py-3 text-sm text-slate-600 shadow-sm ring-1 ring-slate-200">
        <span className="text-2xl font-semibold text-slate-900">{coverage.gaps}</span>
        <span>
          of {coverage.cells} tracked combinations have no catalogued dataset. Each one is a
          candidate for the next survey or acquisition.
        </span>
      </p>
      <CoverageMatrix sources={sources} />
    </div>
  );
}
