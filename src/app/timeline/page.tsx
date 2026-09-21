import { getAllSources } from '@/lib/sources';
import { buildTimeline } from '@/lib/timeline';
import TimelineRibbon from '@/components/TimelineRibbon';
import PageHeader from '@/components/PageHeader';
import { sectionAccent } from '@/lib/sections';

export const metadata = {
  title: 'Timeline | Red Sea Marine Data Catalog',
  description: 'When each catalogued Red Sea dataset covers, and which years hold several kinds of data at once.',
};

export default function TimelinePage() {
  const sources = getAllSources();
  const timeline = buildTimeline(sources);

  return (
    <div>
      <PageHeader
        accent={sectionAccent('/timeline')}
        title="Timeline"
        description="When each dataset covers, and which years hold every domain at once."
      />
      <TimelineRibbon timeline={timeline} />
    </div>
  );
}
