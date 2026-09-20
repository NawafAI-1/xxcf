// One basemap for every map in the site, plus the fallback that keeps a map
// usable when it cannot be reached.
//
// Two rules learned the hard way:
//  - The basemap must need no API key unless one is configured. CARTO's tiles
//    answer key-less requests with an "API KEY REQUIRED" watermark stamped
//    across the map rather than an error, so nothing in the code can detect
//    it — only the choice of host prevents it.
//  - Whichever style is not in use is kept as the fallback, because a basemap
//    host that cannot be reached must never take the footprints down with it.
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

/**
 * CARTO's own Positron, used when a key is configured. The key is read from the
 * environment at build time and never stored in this repository: it is public
 * once the site ships (any browser-side map key is), so it belongs in a build
 * secret and behind CARTO's domain restrictions, not in version control.
 */
const CARTO_API_KEY = process.env.NEXT_PUBLIC_CARTO_API_KEY?.trim();

/** OpenFreeMap's Positron: the same quiet grey cartography, no key, no sign-up. */
export const OPENFREEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/**
 * MapLibre's demo tiles: a political map in pastels. Chosen deliberately as
 * this site's basemap — it needs no key, it is the style that has actually
 * been seen rendering here, and countries-and-coastlines is the context a
 * reader wants when asking "where in the region is this dataset?".
 */
export const DEMOTILES_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

export const BASEMAP_STYLE_URL = CARTO_API_KEY
  ? `https://basemaps.cartocdn.com/gl/positron-gl-style/style.json?api_key=${encodeURIComponent(CARTO_API_KEY)}`
  : DEMOTILES_STYLE_URL;

/**
 * Second choice, then third. Whatever is not primary is the backstop, so a
 * blocked host or an expired key costs cartography rather than the map.
 */
export const FALLBACK_STYLE_URLS = CARTO_API_KEY
  ? [DEMOTILES_STYLE_URL, OPENFREEMAP_STYLE_URL]
  : [OPENFREEMAP_STYLE_URL];

/** Plain water-coloured canvas, drawn under everything by both styles' own background. */
export const CANVAS_COLOR = '#eaf1f6';

/** How long to wait for a style before falling back. */
const STYLE_TIMEOUT_MS = 6000;

/** How long a raster style gets to produce one tile before it is abandoned. */
const TILE_TIMEOUT_MS = 8000;


/**
 * NASA's true-colour imagery from GIBS: yesterday's MODIS Terra pass, which is
 * the planet as it actually looked, weather and all. Public domain, no key.
 * Yesterday rather than today because the current day's mosaic is still being
 * assembled and has gaps.
 */
export function trueColorStyle(): StyleSpecification {
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return imageryStyle(
    `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/MODIS_Terra_CorrectedReflectance_TrueColor/default/${yesterday}/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg`,
    9,
    'Imagery: <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA EOSDIS GIBS</a>, MODIS Terra true colour'
  );
}

/**
 * Blue Marble: shaded relief with bathymetry, cloudless and always available.
 * The backstop for the day a true-colour mosaic is missing.
 */
export function blueMarbleStyle(): StyleSpecification {
  return imageryStyle(
    'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg',
    8,
    'Imagery: <a href="https://worldview.earthdata.nasa.gov/" target="_blank" rel="noreferrer">NASA EOSDIS GIBS</a>, Blue Marble'
  );
}

/** Shared shape of the imagery styles: one raster source, space behind it. */
function imageryStyle(tiles: string, maxzoom: number, attribution: string): StyleSpecification {
  return {
    version: 8,
    sources: {
      imagery: { type: 'raster', tiles: [tiles], tileSize: 256, maxzoom, attribution },
    },
    layers: [
      { id: 'space', type: 'background', paint: { 'background-color': SPACE_COLOR } },
      { id: 'imagery', type: 'raster', source: 'imagery' },
    ],
    sky: {
      'sky-color': '#0b1a33',
      'horizon-color': '#8ec5ff',
      'fog-color': '#cfe6ff',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.6,
      'fog-ground-blend': 0.1,
      'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 0.9, 5, 0.5, 8, 0],
    },
  };
}

/** Deeper imagery for when someone zooms past what NASA's mosaics carry. */
export function esriImageryStyle(): StyleSpecification {
  return imageryStyle(
    'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    19,
    'Imagery: Esri, Maxar, Earthstar Geographics'
  );
}

/** The colour of space behind the planet, and of a sphere with no tiles yet. */
export const SPACE_COLOR = '#05070f';

/**
 * Place names at mini-map size are noise, and the label layers differ between
 * styles, so they are switched off by type rather than by name.
 */
export function hideLabels(map: MapLibreMap): void {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (layer.type === 'symbol') {
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {
        // A layer can disappear between reading the style and setting the
        // property (a style swap mid-flight); nothing here is worth failing on.
      }
    }
  }
}

/**
 * The demo style draws the tropics and the equator as dashed lines with
 * labels. They are geography-lesson furniture, not context for a dataset
 * footprint, and the dashes read as data when they cross one — so they go.
 */
export function hideGraticule(map: MapLibreMap): void {
  const style = map.getStyle();
  if (!style?.layers) return;
  for (const layer of style.layers) {
    if (/geoline|graticule|latitude|longitude|tropic/i.test(layer.id)) {
      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {
        // Layer vanished under a style swap; nothing here is worth failing on.
      }
    }
  }
}

/** A style is either a URL to fetch or a specification to apply directly. */
export type StyleSource = string | StyleSpecification;

interface BasemapOptions {
  /** Adds the map's own sources and layers; called again after a style swap. */
  addOverlays: (map: MapLibreMap) => void;
  labelled?: boolean;
  /** Styles to try in turn if the primary one does not load. */
  fallbacks?: StyleSource[];
}

/**
 * Wires up style handling for a map and degrades step by step, so the data a
 * map exists to show is never hostage to a basemap host: the primary style,
 * then each fallback in turn, and finally a plain canvas where the overlays
 * still draw.
 *
 * Two different failures are watched for, because they look nothing alike:
 *
 *  - The style never loads (blocked host, DNS failure, 404 on the style JSON).
 *    Nothing renders, and no 'load' event ever fires, so a timer catches it.
 *  - The style loads but its tiles do not (a raster endpoint whose URL template
 *    is wrong, or an imagery service that has moved). The map looks finished
 *    and shows an empty sphere, so this one is caught by watching for tile
 *    errors with no tile ever succeeding.
 *
 * Returns a cleanup function.
 */
export function withBasemap(
  map: MapLibreMap,
  { addOverlays, labelled = true, fallbacks = FALLBACK_STYLE_URLS }: BasemapOptions
): () => void {
  let drawn = false;
  let remaining = [...fallbacks];
  const timers: ReturnType<typeof setTimeout>[] = [];

  const draw = () => {
    if (drawn) return;
    drawn = true;
    hideGraticule(map);
    if (!labelled) hideLabels(map);
    addOverlays(map);
  };

  const advance = () => {
    if (remaining.length === 0) return false;
    const [next, ...rest] = remaining;
    remaining = rest;
    drawn = false;
    map.setStyle(next);
    map.once('styledata', () => {
      draw();
      watchTiles();
    });
    return true;
  };

  // A raster style renders "successfully" with no imagery at all, so give the
  // tiles a few seconds to prove themselves.
  let tileErrors = 0;
  let tileLoaded = false;
  map.on('error', (event) => {
    if ((event as { sourceId?: string }).sourceId) tileErrors += 1;
  });
  map.on('data', (event) => {
    if (event.dataType === 'source' && 'tile' in event) tileLoaded = true;
  });

  const watchTiles = () => {
    timers.push(
      setTimeout(() => {
        if (tileLoaded || tileErrors < 3) return;
        tileErrors = 0;
        advance();
      }, TILE_TIMEOUT_MS)
    );
  };

  // 'load' fires once the style is up and the first frame is drawn; if the
  // style never arrives it never fires, which is what the timer is for.
  map.once('load', () => {
    draw();
    watchTiles();
  });

  timers.push(
    setTimeout(function styleWatchdog() {
      if (drawn || map.isStyleLoaded()) return;
      if (!advance()) {
        map.setStyle(canvasStyle());
        map.once('styledata', draw);
        return;
      }
      timers.push(setTimeout(styleWatchdog, STYLE_TIMEOUT_MS));
    }, STYLE_TIMEOUT_MS)
  );

  return () => timers.forEach(clearTimeout);
}

/** A bare canvas, used as the map's starting background before tiles arrive. */
export function canvasStyle(): StyleSpecification {
  return {
    version: 8,
    sources: {},
    layers: [{ id: 'canvas', type: 'background', paint: { 'background-color': CANVAS_COLOR } }],
  };
}
