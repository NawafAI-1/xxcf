'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, MapGeoJSONFeature } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { Source, Subbasin } from '@/lib/types';
import { DOMAIN_COLORS } from '@/lib/types';
import {
  DEMOTILES_STYLE_URL,
  SPACE_COLOR,
  blueMarbleStyle,
  esriImageryStyle,
  trueColorStyle,
  withBasemap,
} from '@/lib/basemap';
import { type BBox, isGlobalScale } from '@/lib/spatial';
import SourceCard from './SourceCard';

// Approximate centroids for sources that have a subbasin but no bbox.
const SUBBASIN_CENTROIDS: Record<Subbasin, [number, number]> = {
  northern: [35.3, 27.5],
  central: [38.0, 21.0],
  southern: [40.5, 17.0],
  'gulf-of-aqaba': [34.9, 29.2],
  farasan: [42.1, 16.7],
};

const GLOBE_VIEW = { center: [38.5, 20.5] as [number, number], zoom: 2.4 };
/** Where a first click lands you: close enough to read the coastline. */
const PLACE_ZOOM = 5.5;

interface Place {
  key: string;
  lon: number;
  lat: number;
  ids: string[];
  color: string;
}

/**
 * Datasets whose footprints centre on the same spot are one point on the map.
 * Half a degree is about 55 km, which is small enough to keep distinct survey
 * areas apart and large enough that a basin-wide product and its derivative do
 * not sit on top of each other as two unclickable dots.
 */
function toPlaces(sources: Source[]): Place[] {
  const byKey = new Map<string, Place>();

  for (const source of sources) {
    let lon: number;
    let lat: number;
    if (source.spatial.bbox) {
      const [w, s, e, n] = source.spatial.bbox as BBox;
      lon = (w + e) / 2;
      lat = (s + n) / 2;
    } else if (source.spatial.subbasins.length) {
      [lon, lat] = SUBBASIN_CENTROIDS[source.spatial.subbasins[0]];
    } else {
      continue;
    }

    const key = `${Math.round(lon * 2) / 2},${Math.round(lat * 2) / 2}`;
    const place = byKey.get(key);
    if (place) {
      place.ids.push(source.id);
    } else {
      byKey.set(key, { key, lon, lat, ids: [source.id], color: DOMAIN_COLORS[source.domain[0]] });
    }
  }

  return [...byKey.values()];
}

export default function MapView({ sources }: { sources: Source[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [selected, setSelected] = useState<Source | null>(null);
  const [pickerOptions, setPickerOptions] = useState<Source[] | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [away, setAway] = useState(false);
  // The place a first click flew to. A second click on it opens its datasets.
  const armedRef = useRef<string | null>(null);

  const localSources = sources.filter((s) => s.spatial.bbox && !isGlobalScale(s.spatial.bbox as BBox));
  const globalSources = sources.filter((s) => s.spatial.bbox && isGlobalScale(s.spatial.bbox as BBox));
  const placeSources = [...localSources, ...sources.filter((s) => !s.spatial.bbox)];

  function pick(ids: string[]) {
    const matches = ids
      .map((id) => sources.find((s) => s.id === id))
      .filter((s): s is Source => Boolean(s));
    if (matches.length === 0) return;
    setHint(null);
    if (matches.length === 1) {
      setSelected(matches[0]);
      setPickerOptions(null);
    } else {
      setPickerOptions(matches);
      setSelected(null);
    }
  }

  function backToGlobe() {
    armedRef.current = null;
    setHint(null);
    setSelected(null);
    setPickerOptions(null);
    mapRef.current?.flyTo({ ...GLOBE_VIEW, duration: 1400 });
  }

  useEffect(() => {
    let cancelled = false;
    let cleanupBasemap: (() => void) | undefined;
    const places = toPlaces(placeSources);

    (async () => {
      const maplibregl = (await import('maplibre-gl')).default;
      if (cancelled || !containerRef.current) return;

      const map = new maplibregl.Map({
        container: containerRef.current,
        style: trueColorStyle(),
        center: GLOBE_VIEW.center,
        zoom: GLOBE_VIEW.zoom,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

      const addOverlays = () => {
        if (cancelled) return;
        map.setProjection({ type: 'globe' });

        map.addSource('places', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: places.map((place) => ({
              type: 'Feature' as const,
              properties: { key: place.key, color: place.color, count: place.ids.length },
              geometry: { type: 'Point' as const, coordinates: [place.lon, place.lat] },
            })),
          },
        });

        // A white ring under the dot keeps it visible over bright cloud and
        // over dark ocean alike; the dot grows with how much sits there.
        map.addLayer({
          id: 'place-ring',
          type: 'circle',
          source: 'places',
          paint: {
            'circle-radius': ['+', ['interpolate', ['linear'], ['get', 'count'], 1, 6, 8, 12], 3],
            'circle-color': '#ffffff',
            'circle-opacity': 0.9,
          },
        });
        map.addLayer({
          id: 'place',
          type: 'circle',
          source: 'places',
          paint: {
            'circle-radius': ['interpolate', ['linear'], ['get', 'count'], 1, 6, 8, 12],
            'circle-color': ['get', 'color'],
          },
        });

        map.on('click', 'place', (event) => {
          const features: MapGeoJSONFeature[] = map.queryRenderedFeatures(event.point, {
            layers: ['place'],
          });
          const keys = Array.from(
            new Set(features.map((f) => f.properties?.key as string).filter(Boolean))
          );
          const hit = places.filter((p) => keys.includes(p.key));
          if (hit.length === 0) return;

          const ids = hit.flatMap((p) => p.ids);
          const key = hit.map((p) => p.key).join('|');

          // First click travels to the place; the second opens what is there.
          if (armedRef.current !== key) {
            armedRef.current = key;
            setSelected(null);
            setPickerOptions(null);
            setHint(
              `${ids.length} dataset${ids.length === 1 ? '' : 's'} here. Click the point again to open ${
                ids.length === 1 ? 'it' : 'them'
              }.`
            );
            map.flyTo({
              center: [hit[0].lon, hit[0].lat],
              zoom: Math.max(map.getZoom(), PLACE_ZOOM),
              duration: 1400,
            });
            return;
          }

          pick(ids);
        });

        map.on('mouseenter', 'place', () => (map.getCanvas().style.cursor = 'pointer'));
        map.on('mouseleave', 'place', () => (map.getCanvas().style.cursor = ''));
      };

      cleanupBasemap = withBasemap(map, {
        addOverlays,
        // True colour, then cloudless Blue Marble, then deeper commercial
        // imagery, then the vector demo style: whatever is reachable, the
        // planet keeps its points.
        fallbacks: [blueMarbleStyle(), esriImageryStyle(), DEMOTILES_STYLE_URL],
      });

      map.on('moveend', () => {
        if (!cancelled) setAway(map.getZoom() > GLOBE_VIEW.zoom + 0.5);
      });
    })();

    return () => {
      cancelled = true;
      cleanupBasemap?.();
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  return (
    <div>
      <div className="relative flex h-[70vh] gap-4">
        <div
          ref={containerRef}
          className="h-full flex-1 overflow-hidden rounded-xl border border-slate-800 shadow-sm"
          style={{ backgroundColor: SPACE_COLOR }}
        />

        {hint ? (
          <div className="pointer-events-none absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
            {hint}
          </div>
        ) : null}

        {away ? (
          <button
            onClick={backToGlobe}
            className="absolute bottom-4 left-4 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 transition hover:bg-white"
          >
            Back to the globe
          </button>
        ) : null}

        {(selected || pickerOptions) && (
          <div className="w-80 shrink-0 overflow-y-auto">
            <button
              onClick={() => {
                setSelected(null);
                setPickerOptions(null);
              }}
              className="mb-2 text-xs font-medium text-slate-500 hover:text-slate-800"
            >
              Close ✕
            </button>
            {selected && <SourceCard source={selected} />}
            {pickerOptions && (
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="mb-2 text-xs font-medium text-slate-600">
                  {pickerOptions.length} datasets at this point. Pick one:
                </p>
                <ul className="space-y-1">
                  {pickerOptions.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => {
                          setSelected(s);
                          setPickerOptions(null);
                        }}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-slate-50"
                      >
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ backgroundColor: DOMAIN_COLORS[s.domain[0]] }}
                        />
                        <span className="text-slate-800">{s.title}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {globalSources.length > 0 && (
        <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-sm font-medium text-slate-700">
            {globalSources.length} global or very large-extent dataset
            {globalSources.length === 1 ? '' : 's'}, which have no single place on the globe
          </p>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {globalSources.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => {
                    setSelected(s);
                    setPickerOptions(null);
                  }}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-slate-50"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: DOMAIN_COLORS[s.domain[0]] }}
                  />
                  <span className="text-slate-700">{s.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
