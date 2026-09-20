'use client';

import dynamic from 'next/dynamic';
import type { BBox } from '@/lib/spatial';

// MapLibre GL accesses `window`, so it must never run during static generation.
const MiniMap = dynamic(() => import('@/components/MiniMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-72 w-full items-center justify-center rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-500 sm:h-80">
      Loading map…
    </div>
  ),
});

export default function MiniMapClient({ bbox, color }: { bbox: BBox; color?: string }) {
  return <MiniMap bbox={bbox} color={color} />;
}
