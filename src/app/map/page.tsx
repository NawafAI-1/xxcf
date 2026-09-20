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
        description={`The basin and what has been measured in it. Each point is one location, sized by how many datasets sit there; click it to travel, click again to open them. Jump between subbasins, paint sea surface temperature or chlorophyll over the water and scrub through a year of it, and read the profile at the right to see how observation thins from the centre toward the strait. Datasets with no single place, the global products, are listed below the map.`}
      />
      <MapPageClient sources={sources} />
    </div>
  );
}
