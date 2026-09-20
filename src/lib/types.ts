// Canonical types mirroring the data/sources/*.json schema.
// Every field here should stay in lockstep with the source record schema.

export type Domain =
  | 'environmental'
  | 'ecological'
  | 'production'
  | 'nutrition-health'
  | 'socio-economic';

export type Subbasin =
  | 'northern'
  | 'central'
  | 'southern'
  | 'gulf-of-aqaba'
  | 'farasan';

export type Frequency = 'once' | 'daily' | 'monthly' | 'annual' | 'irregular';

export type AccessTier = 'public' | 'kaust-internal' | 'restricted' | 'embargoed';

export type QualityStatus = 'raw' | 'cleaned' | 'analysis-ready' | 'deprecated';

export interface Spatial {
  bbox: [number, number, number, number]; // [W, S, E, N] WGS84
  subbasins: Subbasin[];
  resolution: string;
  geometry_file?: string;
}

export interface Temporal {
  start: string; // "YYYY" or "YYYY-MM"
  end: string;
  frequency: Frequency;
  ongoing: boolean;
}

export interface Variable {
  name: string;
  label: string;
  type: string;
  unit: string;
  description: string;
  missing_values: string[];
  maps_to: string[];
}

export interface Resource {
  name: string;
  format: string;
  path: string; // DataWaha path
  size: string;
  n_rows: number;
  variables: Variable[];
}

export interface Steward {
  name: string;
  email: string;
}

export interface Access {
  tier: AccessTier;
  steward: Steward;
  how_to_request: string;
}

export interface Provenance {
  originator: string;
  // Null where cataloguing could not establish one — a real state of the
  // inventory, not a placeholder to render blank.
  license: string | null;
  citation: string | null;
  doi?: string | null;
  source_url?: string | null;
  derived_from: string[]; // other source ids
}

export interface Quality {
  status: QualityStatus;
  known_issues: string[];
  last_verified: string;
}

export interface Source {
  id: string;
  title: string;
  abstract: string;
  domain: Domain[];
  themes: string[];
  keywords: string[];
  spatial: Spatial;
  temporal: Temporal;
  resources: Resource[];
  access: Access;
  provenance: Provenance;
  quality: Quality;
  used_in: string[];
}

export interface SearchIndexEntry {
  id: string;
  title: string;
  vector: number[];
}

export const DOMAINS: Domain[] = [
  'environmental',
  'ecological',
  'production',
  'nutrition-health',
  'socio-economic',
];

export const SUBBASINS: Subbasin[] = [
  'northern',
  'central',
  'southern',
  'gulf-of-aqaba',
  'farasan',
];

export const ACCESS_TIERS: AccessTier[] = [
  'public',
  'kaust-internal',
  'restricted',
  'embargoed',
];

export const QUALITY_STATUSES: QualityStatus[] = [
  'raw',
  'cleaned',
  'analysis-ready',
  'deprecated',
];

/**
 * Domain colours, read as the sea reads: open water, seagrass, the catch, coral,
 * and the communities around it. Validated as a categorical palette — every
 * adjacent pair clears the colour-blind and normal-vision separation floors
 * against a light surface, so the five domains stay distinguishable on the map,
 * the network graph and every badge.
 */
export const DOMAIN_COLORS: Record<Domain, string> = {
  environmental: '#0284c7', // ocean blue — water, light, temperature
  ecological: '#047857', // seagrass green — reefs and the life on them
  production: '#d97706', // catch amber — fisheries and landings
  'nutrition-health': '#e11d48', // coral rose — what the catch becomes
  'socio-economic': '#7c3aed', // deep violet — the people around the basin
};

/**
 * Access runs from open water to closed: cyan is downloadable by anyone, slate
 * needs a KAUST login, amber needs asking, rose is embargoed. It is a scale of
 * openness, so it never borrows the domain hues.
 */
export const ACCESS_COLORS: Record<AccessTier, string> = {
  public: '#0e7490',
  'kaust-internal': '#64748b',
  restricted: '#d97706',
  embargoed: '#be123c',
};

/**
 * Processing state is a status scale, not a category: teal means usable, amber
 * means part-way, and slate means untouched. Raw and cleaned used to share one
 * amber, which hid the distinction the catalog cares most about.
 */
export const QUALITY_COLORS: Record<QualityStatus, string> = {
  'analysis-ready': '#0f766e',
  cleaned: '#d97706',
  raw: '#64748b',
  deprecated: '#94a3b8',
};
