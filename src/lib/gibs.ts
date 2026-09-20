// NASA GIBS imagery layers that show the same measurements this catalogue
// inventories, so the globe can display the science itself rather than only
// where it was collected. Public domain, no key, one tile URL per date.
export interface ScienceLayer {
  key: string;
  label: string;
  /** GIBS layer identifier. */
  id: string;
  /** GIBS tile matrix set; also the deepest zoom the layer carries. */
  matrix: string;
  maxzoom: number;
  format: 'png' | 'jpg';
  unit: string;
  blurb: string;
  /** The record in this catalogue holding the same product. */
  catalogId: string;
}

export const SCIENCE_LAYERS: ScienceLayer[] = [
  {
    key: 'sst',
    label: 'Sea surface temperature',
    id: 'GHRSST_L4_MUR_Sea_Surface_Temperature',
    matrix: 'GoogleMapsCompatible_Level7',
    maxzoom: 7,
    format: 'png',
    unit: '°C',
    blurb:
      'Daily analysed sea surface temperature at 1 km (GHRSST MUR). The Red Sea is among the warmest open water on Earth, and this is the field behind every thermal-stress question in the catalogue.',
    catalogId: 'kaust-modis-aqua-sst-night-daily',
  },
  {
    key: 'chlorophyll',
    label: 'Chlorophyll-a',
    id: 'MODIS_Aqua_Chlorophyll_A',
    matrix: 'GoogleMapsCompatible_Level6',
    maxzoom: 6,
    format: 'png',
    unit: 'mg/m³',
    blurb:
      'Daily ocean-colour chlorophyll-a from MODIS Aqua: where the water is productive, which is where the fish and the fishing tend to be.',
    catalogId: 'kaust-modis-aqua-chlorophyll-a-daily',
  },
];

/** GIBS publishes a legend image per layer, so the scale is theirs, not a guess. */
export function legendUrl(layer: ScienceLayer): string {
  return `https://gibs.earthdata.nasa.gov/legends/${layer.id}_H.svg`;
}

export function tileUrl(layer: ScienceLayer, date: string): string {
  return `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/${layer.id}/default/${date}/${layer.matrix}/{z}/{y}/{x}.${layer.format}`;
}

/**
 * Satellite products are published with a processing lag, so "today" is
 * usually empty. Five days back is comfortably inside what is available.
 */
export function defaultDate(): string {
  return isoDate(new Date(Date.now() - 5 * 24 * 60 * 60 * 1000));
}

export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The slider runs over the last year, one step per day. */
export const SLIDER_DAYS = 365;

export function dateFromSlider(value: number): string {
  const end = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  end.setUTCDate(end.getUTCDate() - (SLIDER_DAYS - value));
  return isoDate(end);
}

export function sliderFromDate(date: string): number {
  const end = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
  const days = Math.round((end.getTime() - new Date(date).getTime()) / 86400000);
  return SLIDER_DAYS - days;
}
