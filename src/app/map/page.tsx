import { getAllSources } from '@/lib/sources';
import { getCatalogStats } from '@/lib/stats';
import MapPageClient from './MapPageClient';
import PageHeader from '@/components/PageHeader';

export const metadata = {
  title: 'Spatial footprints — Red Sea Marine Data Catalog',
  description: 'The bounding box of every catalogued Red Sea dataset, drawn on one map.',
};

export default function MapPage() {
  const sources = getAllSources();
  const stats = getCatalogStats(sources);

  return (
    <div>
      <PageHeader
        title="Spatial footprints"
        description={`Where each of the ${stats.datasets} datasets actually reaches, drawn as a bounding box and colored by domain. Global and regional products cover the whole basin; survey data clusters where the fieldwork happened.`}
      />
      <MapPageClient sources={sources} />
    </div>
  );
}
