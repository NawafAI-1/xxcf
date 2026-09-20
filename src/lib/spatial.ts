// Shared geometry helpers for the maps. Both the basin map and the per-dataset
// mini-map need the same notion of "this footprint is global, not Red Sea
// scale", so it lives here rather than being re-derived in each component.
export type BBox = [number, number, number, number]; // [W, S, E, N]

// A dataset whose bbox is much wider than the Red Sea basin itself (roughly
// 11 x 17 degrees) is global/near-global in extent. Drawing those as
// rectangles blankets the map in one colour and hides every Red-Sea-scale
// footprint underneath, so they get their own treatment instead.
export const GLOBAL_SCALE_DEGREES = 60;

export function bboxSpan([w, s, e, n]: BBox) {
  return { width: e - w, height: n - s };
}

export function isGlobalScale(bbox: BBox): boolean {
  const { width, height } = bboxSpan(bbox);
  return width > GLOBAL_SCALE_DEGREES || height > GLOBAL_SCALE_DEGREES;
}

/** Closed ring, counter-clockwise, ready for a GeoJSON Polygon. */
export function bboxToRing([w, s, e, n]: BBox): [number, number][] {
  return [
    [w, s],
    [e, s],
    [e, n],
    [w, n],
    [w, s],
  ];
}

/**
 * A polygon covering the whole world with the bbox punched out of it — drawn
 * over the basemap, it dims everything outside the footprint so the dataset's
 * own extent is what the eye lands on. The hole is wound the opposite way from
 * the outer ring, which is what makes it a hole rather than a second shape.
 */
export function spotlightMask(bbox: BBox): GeoJSON.Feature<GeoJSON.Polygon> {
  const world: [number, number][] = [
    [-180, -85],
    [180, -85],
    [180, 85],
    [-180, 85],
    [-180, -85],
  ];
  return {
    type: 'Feature',
    properties: {},
    geometry: { type: 'Polygon', coordinates: [world, bboxToRing(bbox).slice().reverse()] },
  };
}

export function bboxPolygon(bbox: BBox, properties: Record<string, unknown> = {}): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties,
    geometry: { type: 'Polygon', coordinates: [bboxToRing(bbox)] },
  };
}

/** "1,420 km x 780 km" — a size a reader can picture, from degrees they can't. */
export function bboxExtentLabel(bbox: BBox): string {
  const [w, s, e, n] = bbox;
  const midLat = ((s + n) / 2) * (Math.PI / 180);
  const kmPerDegLat = 111.32;
  const widthKm = Math.round((e - w) * kmPerDegLat * Math.cos(midLat));
  const heightKm = Math.round((n - s) * kmPerDegLat);
  return `${widthKm.toLocaleString('en-US')} × ${heightKm.toLocaleString('en-US')} km`;
}
