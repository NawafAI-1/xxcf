// How deeply covered a patch of water is, as a colour.
//
// Shared by the map and the key beside it, and kept out of the map component
// because that one is a client component and the page rendering the key is not.

/**
 * A sequential ramp, so a reader can tell more from less without a key, and
 * cool enough that the domain colours in the panel stay the loudest thing.
 */
export const COVERAGE_RAMP = [
  '#dff0f3',
  '#bfe0e7',
  '#9acfda',
  '#72bccc',
  '#4aa4bb',
  '#2e88a4',
  '#1d6c8b',
  '#134f6d',
  '#0d3750',
];

export function coverageColor(count: number, peak: number): string {
  if (count <= 0) return COVERAGE_RAMP[0];
  const step = Math.round(((count - 1) / Math.max(peak - 1, 1)) * (COVERAGE_RAMP.length - 1));
  return COVERAGE_RAMP[Math.min(Math.max(step, 0), COVERAGE_RAMP.length - 1)];
}
