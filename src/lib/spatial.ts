// Shared geometry helpers. Every view that draws a footprint needs the same
// notion of "this one is global, not Red Sea scale", so it lives here rather
// than being re-derived in each of them.
export type BBox = [number, number, number, number]; // [W, S, E, N]

// A dataset whose bbox is much wider than the Red Sea basin itself (roughly
// 11 x 17 degrees) is global/near-global in extent. Drawing those as
// rectangles blankets the map in one colour and hides every Red-Sea-scale
// footprint underneath, so they get their own treatment instead.
export const GLOBAL_SCALE_DEGREES = 60;

export function isGlobalScale([w, s, e, n]: BBox): boolean {
  return e - w > GLOBAL_SCALE_DEGREES || n - s > GLOBAL_SCALE_DEGREES;
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
