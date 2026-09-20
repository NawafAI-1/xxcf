import { getAllSources } from '@/lib/sources';
import { getCatalogStats } from '@/lib/stats';
import MapPageClient from './MapPageClient';
import PageHeader from '@/components/PageHeader';
import { sectionAccent } from '@/lib/sections';

export const metadata = {
  title: 'Spatial footprints | Red Sea Marine Data Catalog',
  description: 'The bounding box of every catalogued Red Sea dataset, drawn on one map.',
};

export default function MapPage() {
  const sources = getAllSources();
  const stats = getCatalogStats(sources);

  return (
    <div>
      <PageHeader
        accent={sectionAccent('/map')}
        title="Spatial footprints"
        description={`Every place in the catalog, on a globe of the Earth as it looked yesterday. Each point is one location, sized by how many datasets sit there and colored by domain. Click a point to travel to it, then click it again to open what is there. Datasets with no single place, the global products, are listed below the map.`}
      />
      <MapPageClient sources={sources} />
    </div>
  );
}
