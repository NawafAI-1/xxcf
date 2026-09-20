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
        description={`A globe of the ${stats.datasets} datasets, each one a dot at the centre of its footprint, colored by domain. Click a dot to see what is there. Zoom in and the dots give way to the footprints themselves: global and regional products cover the whole basin, while survey data clusters where the fieldwork happened.`}
      />
      <MapPageClient sources={sources} />
    </div>
  );
}
