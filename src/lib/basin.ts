// The basin itself: where to look, and how observation thins along it.
import type { Source, Subbasin } from './types';
import { type BBox, isGlobalScale } from './spatial';

/** The Red Sea and the Gulf of Aden mouth, which is the frame worth opening on. */
export const BASIN_BOUNDS: [[number, number], [number, number]] = [
  [32.0, 11.8],
  [44.2, 30.2],
];

/**
 * Approximate extents for the five subbasins, used for navigation only: they
 * position the camera, they are not claims about where one subbasin ends and
 * the next begins. The records' own `subbasins` field is what decides which
 * datasets belong to which.
 */
export const SUBBASIN_EXTENTS: Record<Subbasin, { bounds: [[number, number], [number, number]]; label: string }> = {
  'gulf-of-aqaba': { bounds: [[34.0, 27.9], [35.4, 29.7]], label: 'Gulf of Aqaba' },
  northern: { bounds: [[33.0, 23.8], [38.5, 28.4]], label: 'Northern' },
  central: { bounds: [[35.5, 18.8], [41.5, 24.2]], label: 'Central' },
  southern: { bounds: [[38.5, 12.2], [43.5, 19.2]], label: 'Southern' },
  farasan: { bounds: [[41.0, 16.0], [42.8, 17.6]], label: 'Farasan' },
};

export interface LatitudeBand {
  /** Southern edge of the band. */
  lat: number;
  count: number;
}

/** Half-degree bands, about 55 km each, from the strait to the head of Aqaba. */
export const BAND_STEP = 0.5;
export const BAND_MIN = 12;
export const BAND_MAX = 30;

/**
 * How many datasets reach each latitude band. Global-extent records are left
 * out: counting them would flatten the profile into a straight line and hide
 * the thing worth seeing, which is where the basin-scale work actually went.
 */
export function latitudeProfile(sources: Source[]): LatitudeBand[] {
  const local = sources.filter((s) => s.spatial.bbox && !isGlobalScale(s.spatial.bbox as BBox));
  const bands: LatitudeBand[] = [];

  for (let lat = BAND_MIN; lat < BAND_MAX; lat += BAND_STEP) {
    const count = local.filter((s) => {
      const [, south, , north] = s.spatial.bbox as BBox;
      return south <= lat + BAND_STEP && north >= lat;
    }).length;
    bands.push({ lat, count });
  }

  return bands;
}

export function profileExtremes(bands: LatitudeBand[]) {
  const counts = bands.map((b) => b.count);
  const max = Math.max(...counts, 1);
  const min = Math.min(...counts);
  const thinnest = bands.filter((b) => b.count === min);
  return {
    max,
    min,
    thinnestFrom: thinnest.length ? thinnest[0].lat : BAND_MIN,
    thinnestTo: thinnest.length ? thinnest[thinnest.length - 1].lat + BAND_STEP : BAND_MIN,
  };
}

export interface ThinStretch {
  from: number;
  to: number;
  count: number;
  /** Records that stop within reach of the stretch and could be extended. */
  nearby: Source[];
  /** Records that already reach into it, basin-wide products included. */
  covering: Source[];
}

/**
 * The least observed run of the basin, and the records nearest to it.
 *
 * This is a prioritisation aid, not a prediction: it says where the catalogue
 * is thinnest and which existing work sits close enough that extending it, or
 * subsetting a wider product, would cover the gap. Whether those records
 * actually transfer to that water is a question for the people who made them.
 */
export function thinStretch(sources: Source[], reachDegrees = 2): ThinStretch | null {
  const bands = latitudeProfile(sources);
  if (bands.length === 0) return null;

  const { min } = profileExtremes(bands);
  const thin = bands.filter((b) => b.count === min);
  if (thin.length === 0) return null;

  const from = thin[0].lat;
  const to = thin[thin.length - 1].lat + BAND_STEP;

  const local = sources.filter((s) => s.spatial.bbox && !isGlobalScale(s.spatial.bbox as BBox));
  const covering = sources.filter((s) => {
    if (!s.spatial.bbox) return false;
    const [, south, , north] = s.spatial.bbox as BBox;
    return south <= to && north >= from;
  });

  const nearby = local
    .filter((s) => {
      const [, south, , north] = s.spatial.bbox as BBox;
      if (south <= to && north >= from) return false; // already there
      const distance = south > to ? south - to : from - north;
      return distance <= reachDegrees;
    })
    .sort((a, b) => {
      const aGap = (a.spatial.bbox as BBox)[1] - to;
      const bGap = (b.spatial.bbox as BBox)[1] - to;
      return Math.abs(aGap) - Math.abs(bGap);
    });

  return { from, to, count: min, nearby, covering };
}
