// Shared definition of the coverage gap matrix: the domain x theme columns we
// track, and the "best available quality" lookup for a subbasin/column cell.
// Used by both the coverage page (to render the matrix) and the overview page
// (to report how many cells are still empty), so the two can never disagree.
import type { Source, Subbasin, QualityStatus, Domain } from './types';

export interface CoverageColumn {
  key: string;
  label: string;
  shortLabel: string;
  domain: Domain;
  theme: string;
}

// Add a column whenever a new domain/theme combination should be tracked.
export const COVERAGE_COLUMNS: CoverageColumn[] = [
  { key: 'env-sst', label: 'Environmental — SST', shortLabel: 'SST', domain: 'environmental', theme: 'SST' },
  { key: 'env-chl', label: 'Environmental — Chlorophyll', shortLabel: 'Chlorophyll', domain: 'environmental', theme: 'chlorophyll-a' },
  { key: 'eco-coral', label: 'Ecological — Coral Cover', shortLabel: 'Coral cover', domain: 'ecological', theme: 'coral cover' },
  { key: 'eco-fish', label: 'Ecological — Reef Fish', shortLabel: 'Reef fish', domain: 'ecological', theme: 'reef fish' },
  { key: 'prod-catch', label: 'Production — Fisheries Catch', shortLabel: 'Fisheries catch', domain: 'production', theme: 'fisheries catch reconstruction' },
  { key: 'nutri-consumption', label: 'Nutrition — Seafood Consumption', shortLabel: 'Seafood consumption', domain: 'nutrition-health', theme: 'seafood consumption' },
  { key: 'socio-pop', label: 'Socio-economic — Population Density', shortLabel: 'Population density', domain: 'socio-economic', theme: 'population density' },
];

const STATUS_ORDER: QualityStatus[] = ['analysis-ready', 'cleaned', 'raw', 'deprecated'];

export function matchesCell(source: Source, subbasin: Subbasin, column: CoverageColumn): boolean {
  return (
    source.spatial.subbasins.includes(subbasin) &&
    source.domain.includes(column.domain) &&
    source.themes.includes(column.theme)
  );
}

export interface CoverageCell {
  status: QualityStatus | null;
  count: number;
}

export function coverageCell(sources: Source[], subbasin: Subbasin, column: CoverageColumn): CoverageCell {
  const matches = sources.filter((s) => matchesCell(s, subbasin, column));
  if (matches.length === 0) return { status: null, count: 0 };

  const best = matches
    .slice()
    .sort((a, b) => STATUS_ORDER.indexOf(a.quality.status) - STATUS_ORDER.indexOf(b.quality.status))[0];
  return { status: best.quality.status, count: matches.length };
}
