'use client';

import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, MapGeoJSONFeature, RasterTileSource } from 'maplibre-gl';
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
import {
  BAND_STEP,
  BASIN_BOUNDS,
  SUBBASIN_EXTENTS,
  latitudeProfile,
  profileExtremes,
} from '@/lib/basin';
import {
  SCIENCE_LAYERS,
  SLIDER_DAYS,
  type ScienceLayer,
  dateFromSlider,
  defaultDate,
  legendUrl,
  sliderFromDate,
  tileUrl,
} from '@/lib/gibs';
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
const SUBBASIN_ORDER: (keyof typeof SUBBASIN_EXTENTS)[] = [
  'gulf-of-aqaba',
  'northern',
  'central',
  'southern',
  'farasan',
];
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
  const [science, setScience] = useState<ScienceLayer | null>(null);
  const [planet, setPlanet] = useState(false);
  const [subbasin, setSubbasin] = useState<keyof typeof SUBBASIN_EXTENTS | null>(null);
  const [date, setDate] = useState(defaultDate());
  const [playing, setPlaying] = useState(false);
  const [scienceFailed, setScienceFailed] = useState(false);
  // Read inside the map's own callbacks, which are created once and would
  // otherwise close over the state as it was when the map was built.
  const scienceRef = useRef<{ layer: ScienceLayer | null; date: string }>({ layer: null, date });
  /** Layer/date combinations already found to have no imagery. */
  const failedRef = useRef<Set<string>>(new Set());
  /** The combination the most recent probe was for, so a stale one cannot win. */
  const probeRef = useRef<string | null>(null);
  // The place a first click flew to. A second click on it opens its datasets.
  const armedRef = useRef<string | null>(null);

  const profile = latitudeProfile(sources);
  const extremes = profileExtremes(profile);
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

  useEffect(() => {
    scienceRef.current = { layer: science, date };
  }, [science, date]);

  /**
   * The measurement layer is a raster source under the points: added, retiled
   * or removed as the choice changes, and re-added from scratch whenever the
   * basemap style swaps underneath it.
   *
   * It probes one tile before adding anything. MapLibre renders raster tiles by
   * binding their texture, and a tile that failed to load has none, which
   * throws inside the render loop and takes the map down with it. Satellite
   * products have real gaps - a date with no pass over this longitude returns
   * nothing - so this is a state to expect, not an edge case. Probing first
   * means a missing date shows a message instead of a broken map.
   */
  async function applyScience(map: MapLibreMap) {
    const { layer, date: on } = scienceRef.current;

    const remove = () => {
      if (map.getLayer('science')) map.removeLayer('science');
      if (map.getSource('science')) map.removeSource('science');
    };

    if (!layer) {
      remove();
      return;
    }

    const token = `${layer.key}:${on}`;
    probeRef.current = token;

    if (failedRef.current.has(token)) {
      remove();
      return;
    }

    const url = tileUrl(layer, on).replace('{z}', '2').replace('{y}', '1').replace('{x}', '2');
    let reachable = false;
    try {
      const response = await fetch(url, { method: 'GET', cache: 'force-cache' });
      reachable = response.ok;
    } catch {
      reachable = false;
    }

    // The choice moved on while the probe was in flight; that call owns it now.
    if (probeRef.current !== token) return;

    if (!reachable) {
      failedRef.current.add(token);
      setScienceFailed(true);
      remove();
      return;
    }

    if (!map.getSource('science')) {
      map.addSource('science', {
        type: 'raster',
        tiles: [tileUrl(layer, on)],
        tileSize: 256,
        maxzoom: layer.maxzoom,
        attribution:
          '<a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA EOSDIS GIBS</a>',
      });
    } else {
      (map.getSource('science') as RasterTileSource).setTiles([tileUrl(layer, on)]);
    }

    if (!map.getLayer('science')) {
      // Under the points: the measurement is context for them, not a cover.
      map.addLayer(
        {
          id: 'science',
          type: 'raster',
          source: 'science',
          paint: { 'raster-opacity': 0.85 },
        },
        map.getLayer('place-ring') ? 'place-ring' : undefined
      );
    }
  }

  function resetView() {
    armedRef.current = null;
    setHint(null);
    setSelected(null);
    setPickerOptions(null);
    setSubbasin(null);
    const map = mapRef.current;
    if (!map) return;
    if (planet) {
      map.flyTo({ ...GLOBE_VIEW, duration: 1400 });
    } else {
      map.fitBounds(BASIN_BOUNDS, { padding: 40, duration: 1400 });
    }
  }

  /** The planet is a way to look at the basin from further off, not the default. */
  function togglePlanet() {
    const map = mapRef.current;
    if (!map) return;
    const next = !planet;
    setPlanet(next);
    armedRef.current = null;
    setHint(null);
    map.setProjection({ type: next ? 'globe' : 'mercator' });
    if (next) {
      map.flyTo({ ...GLOBE_VIEW, duration: 1400 });
    } else {
      map.fitBounds(BASIN_BOUNDS, { padding: 40, duration: 1400 });
    }
  }

  function goToSubbasin(key: keyof typeof SUBBASIN_EXTENTS) {
    const map = mapRef.current;
    if (!map) return;
    setSubbasin(key);
    armedRef.current = null;
    setHint(null);
    if (planet) {
      setPlanet(false);
      map.setProjection({ type: 'mercator' });
    }
    map.fitBounds(SUBBASIN_EXTENTS[key].bounds, { padding: 60, duration: 1400 });
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
        bounds: BASIN_BOUNDS,
        fitBoundsOptions: { padding: 40 },
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      mapRef.current = map;
      // Bottom-right, so the zoom buttons do not sit on top of the latitude profile.
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
      map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

      const addOverlays = () => {
        if (cancelled) return;

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

        void applyScience(map);
      };

      // A measurement layer with no data for the chosen date returns errors
      // rather than empty tiles, so say so instead of showing bare ocean.
      map.on('error', (event) => {
        if ((event as { sourceId?: string }).sourceId !== 'science' || cancelled) return;
        // Pull the layer immediately: a raster tile that errored has no texture,
        // and the next frame that tries to bind it would throw.
        if (map.getLayer('science')) map.removeLayer('science');
        if (map.getSource('science')) map.removeSource('science');
        if (probeRef.current) failedRef.current.add(probeRef.current);
        setScienceFailed(true);
      });

      cleanupBasemap = withBasemap(map, {
        addOverlays,
        // True colour, then cloudless Blue Marble, then deeper commercial
        // imagery, then the vector demo style: whatever is reachable, the
        // planet keeps its points.
        fallbacks: [blueMarbleStyle(), esriImageryStyle(), DEMOTILES_STYLE_URL],
      });

      map.on('moveend', () => {
        if (cancelled) return;
        // "Reset" is only worth offering once the view has actually moved on.
        setAway(map.getZoom() > 6 || Boolean(armedRef.current));
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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    setScienceFailed(false);
    void applyScience(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [science, date]);

  // Playback walks the slider forward a day at a time and stops at today.
  useEffect(() => {
    if (!playing || !science) return;
    const timer = setInterval(() => {
      setDate((current) => {
        const next = sliderFromDate(current) + 1;
        if (next > SLIDER_DAYS) {
          setPlaying(false);
          return current;
        }
        return dateFromSlider(next);
      });
    }, 900);
    return () => clearInterval(timer);
  }, [playing, science]);

  return (
    <div>
      <div className="relative flex h-[70vh] gap-4">
        <div
          ref={containerRef}
          className="h-full flex-1 overflow-hidden rounded-xl border border-slate-800 shadow-sm"
          style={{ backgroundColor: SPACE_COLOR }}
        />

        {/* The measurement panel: what is painted on the ocean, and when. */}
        <div className="absolute left-4 top-4 w-72 rounded-xl bg-white/95 p-3 shadow-sm ring-1 ring-slate-200 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Show the measurement
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            <button
              onClick={() => {
                setScience(null);
                setPlaying(false);
              }}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                science ? 'text-slate-600 hover:bg-slate-100' : 'bg-slate-900 text-white'
              }`}
            >
              None
            </button>
            {SCIENCE_LAYERS.map((layer) => (
              <button
                key={layer.key}
                onClick={() => {
                  setScience(layer);
                  setScienceFailed(false);
                }}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  science?.key === layer.key
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {layer.label}
              </button>
            ))}
          </div>

          {science ? (
            <div className="mt-3 space-y-2">
              <p className="text-xs leading-relaxed text-slate-600">{science.blurb}</p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPlaying((p) => !p)}
                  className="rounded-md border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 transition hover:border-slate-400"
                >
                  {playing ? 'Pause' : 'Play year'}
                </button>
                <span className="font-mono text-xs tabular-nums text-slate-700">{date}</span>
              </div>

              <input
                type="range"
                min={0}
                max={SLIDER_DAYS}
                value={sliderFromDate(date)}
                onChange={(e) => {
                  setPlaying(false);
                  setDate(dateFromSlider(Number(e.target.value)));
                }}
                className="w-full accent-teal-700"
                aria-label="Date"
              />

              {/* GIBS publishes the scale for each layer, so it is theirs rather
                  than a guess of mine. */}
              <img
                src={legendUrl(science)}
                alt={`${science.label} scale in ${science.unit}`}
                className="h-8 w-full object-contain"
              />

              {scienceFailed ? (
                <p className="rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-800">
                  No imagery for this date. Try another day: satellite products have gaps and a
                  processing lag.
                </p>
              ) : null}

              <a
                href={`/sources/${science.catalogId}`}
                className="inline-block text-xs font-medium text-teal-700 hover:text-teal-800"
              >
                The catalogue&rsquo;s record for this product &rarr;
              </a>
            </div>
          ) : null}
        </div>

        {hint ? (
          <div className="pointer-events-none absolute left-1/2 top-4 -translate-x-1/2 rounded-full bg-white/95 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm ring-1 ring-slate-200">
            {hint}
          </div>
        ) : null}

        {/* Basin navigation: the five subbasins the records themselves use. */}
        <div className="absolute bottom-4 left-4 flex flex-wrap items-center gap-1 rounded-full bg-white/95 px-2 py-1.5 shadow-sm ring-1 ring-slate-200">
          {SUBBASIN_ORDER.map((key) => (
            <button
              key={key}
              onClick={() => goToSubbasin(key)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                subbasin === key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {SUBBASIN_EXTENTS[key].label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-slate-200" aria-hidden />
          <button
            onClick={togglePlanet}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
              planet ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
            }`}
            title="See the basin from orbit"
          >
            Planet
          </button>
          {away || subbasin ? (
            <button
              onClick={resetView}
              className="rounded-full px-2.5 py-1 text-xs font-medium text-teal-700 transition hover:bg-teal-50"
            >
              Reset
            </button>
          ) : null}
        </div>

        {/* How observation thins along the basin, aligned with the map's own
            latitudes: north at the top, the strait at the bottom. */}
        <figure className="absolute right-4 top-4 hidden w-36 rounded-xl bg-white/95 p-3 shadow-sm ring-1 ring-slate-200 lg:block">
          <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Datasets by latitude
          </figcaption>
          <div className="mt-2 space-y-[2px]">
            {[...profile].reverse().map((band) => (
              <div
                key={band.lat}
                className="flex items-center gap-1.5"
                title={`${band.lat.toFixed(1)}-${(band.lat + BAND_STEP).toFixed(1)}°N: ${band.count} datasets`}
              >
                <span className="w-7 shrink-0 text-right text-[10px] tabular-nums text-slate-400">
                  {Number.isInteger(band.lat) ? `${band.lat}°` : ''}
                </span>
                <span
                  className="h-[3px] rounded-r-[2px] bg-teal-600"
                  style={{ width: `${(band.count / extremes.max) * 100}%` }}
                />
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-snug text-slate-500">
            {extremes.max} at the widest, {extremes.min} at the mouth: the south is about half as
            observed as the centre.
          </p>
        </figure>

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
