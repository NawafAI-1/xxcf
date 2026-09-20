import { getAllSources } from '@/lib/sources';
import { getCatalogStats } from '@/lib/stats';
import NetworkPageClient from './NetworkPageClient';
import PageHeader from '@/components/PageHeader';
import { sectionAccent } from '@/lib/sections';

export const metadata = {
  title: 'Source network — Red Sea Marine Data Catalog',
  description: 'Lineage and shared-theme links between the catalogued Red Sea datasets.',
};

export default function NetworkPage() {
  const sources = getAllSources();
  const stats = getCatalogStats(sources);

  return (
    <div>
      <PageHeader
        accent={sectionAccent('/network')}
        title="Source network"
        description={`Every dataset as a node, colored by domain. Solid lines are explicit lineage — one dataset derived from another, ${stats.lineageLinks} of them recorded so far. Dashed lines connect datasets that share a theme or keyword, which is where unexpected reuse tends to show up.`}
      />
      <NetworkPageClient sources={sources} />
    </div>
  );
}
