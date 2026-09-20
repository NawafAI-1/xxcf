import { getAllSources } from '@/lib/sources';
import { getCatalogStats } from '@/lib/stats';
import BrowseView from '@/components/BrowseView';
import PageHeader from '@/components/PageHeader';
import { sectionAccent } from '@/lib/sections';

export const metadata = {
  title: 'Browse datasets | Red Sea Marine Data Catalog',
  description: 'Search and filter the Red Sea marine dataset inventory by domain, subbasin, access tier and processing state.',
};

export default function BrowsePage() {
  const sources = getAllSources();
  const stats = getCatalogStats(sources);

  return (
    <div>
      <PageHeader
        accent={sectionAccent('/browse')}
        title="Browse the catalog"
        description={`All ${stats.datasets} datasets, sorted with the analysis-ready ones first. Search runs in your browser on dataset meaning, not just keywords, so "coral bleaching" finds thermal-stress records that never use the word.`}
      />
      <BrowseView sources={sources} />
    </div>
  );
}
