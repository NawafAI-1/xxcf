'use client';

import dynamic from 'next/dynamic';
import type { Source } from '@/lib/types';

// The d3-force simulation touches layout and timing that only make sense in a
// browser, and the drag/pan interactions need real pointer events, so this
// stays out of static generation.
const NetworkGraph = dynamic(() => import('@/components/NetworkGraph'), {
  ssr: false,
  loading: () => (
    <div className="flex aspect-[940/640] items-center justify-center rounded-2xl bg-[#08243c] text-sm text-slate-400 ring-1 ring-slate-900/10">
      Settling the network&hellip;
    </div>
  ),
});

export default function NetworkPageClient({ sources }: { sources: Source[] }) {
  return <NetworkGraph sources={sources} />;
}
