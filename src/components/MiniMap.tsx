'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { basemapStyle } from '@/lib/basemap';
import { type BBox, bboxPolygon, isGlobalScale, spotlightMask } from '@/lib/spatial';

interface MiniMapProps {
  bbox: BBox;
  /** Footprint colour — the dataset's first domain, so it matches its badge. */
  color?: string;
}

/**
 * The footprint of one dataset. Everything outside it is dimmed by a mask, so
 * the extent reads as a lit area on a quiet map rather than as a rectangle
 * floating over a political atlas. Global-extent datasets skip the mask: there
 * is nothing to dim, and the world view says "global" on its own.
 */
export default function MiniMap({ bbox, color = '#0f766e' }: MiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [moved, setMoved] = useState(false);
  const global = isGlobalScale(bbox);

  const fit = (map: MapLibreMap, animate = true) => {
    const [w, s, e, n] = bbox;
    map.fitBounds(
      [
        [w, s],
        [e, n],
      ],
      { padding: global ? 8 : 48, duration: animate ? 600 : 0, maxZoom: 9 }
    );
  };

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: basemapStyle({ labelled: false }),
        attributionControl: false,
        // The page scrolls past this map; hijacking the wheel over it strands
        // readers mid-page. Zoom lives on the buttons instead.
        scrollZoom: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchZoomRotate: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

      map.on('load', () => {
        if (cancelled) return;
        fit(map, false);

        if (!global) {
          map.addSource('mask', { type: 'geojson', data: spotlightMask(bbox) });
          map.addLayer({
            id: 'mask',
            type: 'fill',
            source: 'mask',
            paint: { 'fill-color': '#f8fafc', 'fill-opacity': 0.62 },
          });
        }

        map.addSource('footprint', { type: 'geojson', data: bboxPolygon(bbox) });
        map.addLayer({
          id: 'footprint-fill',
          type: 'fill',
          source: 'footprint',
          paint: { 'fill-color': color, 'fill-opacity': 0.12 },
        });
        // A white line under the coloured one keeps the edge readable wherever
        // it crosses a coastline or a dark patch of basemap.
        map.addLayer({
          id: 'footprint-halo',
          type: 'line',
          source: 'footprint',
          paint: { 'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 0.9 },
        });
        map.addLayer({
          id: 'footprint-line',
          type: 'line',
          source: 'footprint',
          paint: { 'line-color': color, 'line-width': 2 },
          layout: { 'line-join': 'round' },
        });
      });

      // "Reset view" appears only after the reader moves the map themselves.
      // Listening to moveend would catch the opening fitBounds too, so the
      // triggers are the interactions a person can actually perform here:
      // dragging, double-click zoom, and the zoom buttons.
      const markMoved = () => {
        if (!cancelled) setMoved(true);
      };
      map.on('dragend', markMoved);
      map.on('zoomend', (event) => {
        if ((event as { originalEvent?: Event }).originalEvent) markMoved();
      });
      containerRef.current
        ?.querySelectorAll('.maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out')
        .forEach((button) => button.addEventListener('click', markMoved));
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bbox.join(','), color]);

  return (
    <div className="relative h-72 w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 sm:h-80">
      <div ref={containerRef} className="h-full w-full" />

      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur">
        <span className="h-2.5 w-2.5 rounded-[2px]" style={{ backgroundColor: color }} aria-hidden />
        {global ? 'Global extent' : 'Dataset footprint'}
      </div>

      {moved ? (
        <button
          onClick={() => {
            const map = mapRef.current;
            if (map) {
              fit(map);
              setMoved(false);
            }
          }}
          className="absolute bottom-3 left-3 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 backdrop-blur transition hover:bg-white"
        >
          Reset view
        </button>
      ) : null}
    </div>
  );
}
