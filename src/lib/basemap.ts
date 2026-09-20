// One basemap for every map in the site, plus the fallback that keeps a map
// usable when it cannot be reached.
//
// Two rules learned the hard way:
//  - The basemap must need no API key. CARTO's tiles now answer key-less
//    requests with an "API KEY REQUIRED" watermark stamped across the map
//    rather than an error, so nothing in the code can detect it — only the
//    choice of host prevents it.
//  - MapLibre's own demo tiles are the one style this project has actually
//    seen render, so they are the fallback: a political map in pastels is a
//    poor backdrop for a footprint, but it beats an empty rectangle.
import type { Map as MapLibreMap, StyleSpecification } from 'maplibre-gl';

/** OpenFreeMap's Positron: quiet grey land, pale water, no key, no sign-up. */
export const BASEMAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/positron';

/** MapLibre's demo tiles — reachable without a key, used only if the above is not. */
export const FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

/** Plain water-coloured canvas, drawn under everything by both styles' own background. */
export const CANVAS_COLOR = '#eaf1f6';

/** How long to wait for the primary style before falling back. */
const STYLE_TIMEOUT_MS = 6000;

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

interface BasemapOptions {
  /** Adds the map's own sources and layers; called again after a style swap. */
  addOverlays: (map: MapLibreMap) => void;
  labelled?: boolean;
}

/**
 * Wires up style-ready handling for a map and degrades in three steps, so the
 * data a map exists to show is never hostage to a basemap host:
 *   1. the primary style;
 *   2. the demo tiles, if the primary has not loaded in time;
 *   3. a plain water-coloured canvas, if neither is reachable — the footprints
 *      still draw, on an empty sea rather than on nothing.
 * Returns a cleanup function.
 */
export function withBasemap(map: MapLibreMap, { addOverlays, labelled = true }: BasemapOptions): () => void {
  let drawn = false;
  const timers: ReturnType<typeof setTimeout>[] = [];

  const draw = () => {
    if (drawn) return;
    drawn = true;
    if (!labelled) hideLabels(map);
    addOverlays(map);
  };

  // 'load' fires once the style is up and the first frame is drawn; if the
  // style never arrives it never fires, which is what the timers are for.
  map.once('load', draw);

  timers.push(
    setTimeout(() => {
      if (drawn || map.isStyleLoaded()) return;
      map.setStyle(FALLBACK_STYLE_URL);
      map.once('styledata', draw);

      timers.push(
        setTimeout(() => {
          if (drawn || map.isStyleLoaded()) return;
          map.setStyle(canvasStyle());
          map.once('styledata', draw);
        }, STYLE_TIMEOUT_MS)
      );
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
