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

export const DOMAIN_COLORS: Record<Domain, string> = {
  environmental: '#2563eb',
  ecological: '#16a34a',
  production: '#d97706',
  'nutrition-health': '#db2777',
  'socio-economic': '#7c3aed',
};

export const QUALITY_COLORS: Record<QualityStatus, string> = {
  'analysis-ready': '#16a34a',
  cleaned: '#f59e0b',
  raw: '#f59e0b',
  deprecated: '#6b7280',
};
