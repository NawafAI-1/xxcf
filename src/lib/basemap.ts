// One basemap for every map in the site. MapLibre's demo tiles render the world
// as a political map in saturated pastels, which competes with the data drawn on
// top of it; a light, low-contrast canvas lets the footprints carry the colour.
import type { StyleSpecification } from 'maplibre-gl';

export const BASEMAP_ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors, © <a href="https://carto.com/attributions" target="_blank" rel="noreferrer">CARTO</a>';

/**
 * CARTO's Positron basemap: grey land, pale water, labels only where they help.
 * `labelled: false` swaps in the label-free variant for the small mini-map,
 * where place names at that size are noise.
 */
export function basemapStyle({ labelled = true }: { labelled?: boolean } = {}): StyleSpecification {
  const variant = labelled ? 'light_all' : 'light_nolabels';
  const retina = typeof window !== 'undefined' && window.devicePixelRatio > 1.5 ? '@2x' : '';

  return {
    version: 8,
    sources: {
      basemap: {
        type: 'raster',
        tiles: ['a', 'b', 'c', 'd'].map(
          (host) => `https://${host}.basemaps.cartocdn.com/${variant}/{z}/{x}/{y}${retina}.png`
        ),
        tileSize: 256,
        attribution: BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      // Rendered under the tiles, so a tile that is still loading — or blocked
      // by a network policy — leaves calm water rather than a black hole.
      { id: 'canvas', type: 'background', paint: { 'background-color': '#eaf1f6' } },
      { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': 1 } },
    ],
  };
}
