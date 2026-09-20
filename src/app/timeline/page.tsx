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
        description="Every dataset drawn end to end, grouped by domain. The question this answers is the one a catalogue list cannot: for which years do we hold environment, ecology, catch, nutrition and economics at the same time?"
      />
      <TimelineRibbon timeline={timeline} />
    </div>
  );
}
