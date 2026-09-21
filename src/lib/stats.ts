// Build-time aggregation of the catalog into the handful of numbers a
// stakeholder actually asks for: how much is here, how much of it is usable
// today, what it covers in space and time, and where the holes are.
//
// Everything here is derived from data/sources/*.json — nothing is hardcoded,
// so the overview page stays true as records are added or edited.
import type {
  Source,
  Domain,
  Subbasin,
  QualityStatus,
  AccessTier,
} from './types';
import { DOMAINS, SUBBASINS } from './types';
import { COVERAGE_COLUMNS, coverageCell } from './coverage';
import { endYear, startYear } from './temporal';

export interface Count<T extends string> {
  key: T;
  count: number;
}

export interface DecadeCount {
  decade: number;
  label: string;
  count: number;
}

export interface CatalogStats {
  datasets: number;
  resources: number;
  variables: number;
  rows: number;
  /** Bytes summed over resources that state their own size. */
  sizedBytes: number;
  /** Resources whose size is only known as part of a larger collection. */
  unsizedResources: number;
  originators: number;
  stewards: number;
  themes: number;
  keywords: number;
  earliestYear: number;
  latestYear: number;
  ongoing: number;
  analysisReady: number;
  publicAccess: number;
  knownIssues: number;
  withDoi: number;
  lineageLinks: number;
  lastVerified: string;
  domainCounts: Count<Domain>[];
  qualityCounts: Count<QualityStatus>[];
  accessCounts: Count<AccessTier>[];
  subbasinCounts: Count<Subbasin>[];
  decades: DecadeCount[];
  coverage: { cells: number; covered: number; gaps: number };
}

const UNITS: Record<string, number> = { KB: 1e3, MB: 1e6, GB: 1e9, TB: 1e12 };

/**
 * Parses a human-written resource size ("16.4 MB", "< 1 MB", "629 MB total
 * (28 files)") into bytes. Returns null for sizes that are only meaningful as
 * part of a collection ("part of 16 GB project total") or unknown, so those are
 * reported separately instead of silently counted as zero.
 */
export function parseSize(size: string | undefined): number | null {
  if (!size) return null;
  const text = size.trim();
  if (/part of/i.test(text)) return null;
  const match = text.match(/^[<~]?\s*([\d.]+)\s*(KB|MB|GB|TB)\b/i);
  if (!match) return null;
  return parseFloat(match[1]) * UNITS[match[2].toUpperCase()];
}

function year(value: string): number {
  return parseInt(value.slice(0, 4), 10);
}

function tally<T extends string>(keys: readonly T[], counts: Map<T, number>): Count<T>[] {
  return keys
    .map((key) => ({ key, count: counts.get(key) ?? 0 }))
    .sort((a, b) => b.count - a.count);
}

export function getCatalogStats(sources: Source[]): CatalogStats {
  const CURRENT_YEAR = new Date().getFullYear();

  let resources = 0;
  let variables = 0;
  let rows = 0;
  let sizedBytes = 0;
  let unsizedResources = 0;

  for (const source of sources) {
    for (const resource of source.resources) {
      resources += 1;
      variables += resource.variables?.length ?? 0;
      rows += resource.n_rows ?? 0;
      const bytes = parseSize(resource.size);
      if (bytes === null) unsizedResources += 1;
      else sizedBytes += bytes;
    }
  }

  const domainCounts = new Map<Domain, number>();
  const qualityCounts = new Map<QualityStatus, number>();
  const accessCounts = new Map<AccessTier, number>();
  const subbasinCounts = new Map<Subbasin, number>();
  const decadeCounts = new Map<number, number>();
  const originators = new Set<string>();
  const stewards = new Set<string>();
  const themes = new Set<string>();
  const keywords = new Set<string>();

  let knownIssues = 0;
  let withDoi = 0;
  let lineageLinks = 0;
  let lastVerified = '';
  let earliestYear = Infinity;
  let latestYear = -Infinity;

  for (const source of sources) {
    source.domain.forEach((d) => domainCounts.set(d, (domainCounts.get(d) ?? 0) + 1));
    qualityCounts.set(source.quality.status, (qualityCounts.get(source.quality.status) ?? 0) + 1);
    accessCounts.set(source.access.tier, (accessCounts.get(source.access.tier) ?? 0) + 1);
    source.spatial.subbasins.forEach((b) => subbasinCounts.set(b, (subbasinCounts.get(b) ?? 0) + 1));

    if (source.provenance.originator) originators.add(source.provenance.originator.trim());
    if (source.access.steward?.name) stewards.add(source.access.steward.name.trim());
    source.themes.forEach((t) => themes.add(t.toLowerCase().trim()));
    source.keywords.forEach((k) => keywords.add(k.toLowerCase().trim()));

    knownIssues += source.quality.known_issues.length;
    if (source.provenance.doi) withDoi += 1;
    lineageLinks += source.provenance.derived_from.length;
    if (source.quality.last_verified > lastVerified) lastVerified = source.quality.last_verified;

    const start = startYear(source);
    const end = endYear(source, CURRENT_YEAR);
    if (Number.isFinite(start)) {
      earliestYear = Math.min(earliestYear, start);
      latestYear = Math.max(latestYear, Number.isFinite(end) ? end : start);
      const lastDecade = Math.floor((Number.isFinite(end) ? end : start) / 10) * 10;
      for (let decade = Math.floor(start / 10) * 10; decade <= lastDecade; decade += 10) {
        decadeCounts.set(decade, (decadeCounts.get(decade) ?? 0) + 1);
      }
    }
  }

  const decades: DecadeCount[] = [...decadeCounts.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([decade, count]) => ({ decade, label: `${String(decade).slice(2)}s`, count }));

  let covered = 0;
  for (const subbasin of SUBBASINS) {
    for (const column of COVERAGE_COLUMNS) {
      if (coverageCell(sources, subbasin, column).status) covered += 1;
    }
  }
  const cells = SUBBASINS.length * COVERAGE_COLUMNS.length;

  return {
    datasets: sources.length,
    resources,
    variables,
    rows,
    sizedBytes,
    unsizedResources,
    originators: originators.size,
    stewards: stewards.size,
    themes: themes.size,
    keywords: keywords.size,
    earliestYear: Number.isFinite(earliestYear) ? earliestYear : CURRENT_YEAR,
    latestYear: Number.isFinite(latestYear) ? latestYear : CURRENT_YEAR,
    ongoing: sources.filter((s) => s.temporal.ongoing).length,
    analysisReady: sources.filter((s) => s.quality.status === 'analysis-ready').length,
    publicAccess: sources.filter((s) => s.access.tier === 'public').length,
    knownIssues,
    withDoi,
    lineageLinks,
    lastVerified,
    domainCounts: tally(DOMAINS, domainCounts),
    qualityCounts: tally(['analysis-ready', 'cleaned', 'raw', 'deprecated'] as const, qualityCounts).filter(
      (c) => c.count > 0
    ),
    accessCounts: tally(['public', 'kaust-internal', 'restricted', 'embargoed'] as const, accessCounts).filter(
      (c) => c.count > 0
    ),
    subbasinCounts: tally(SUBBASINS, subbasinCounts),
    decades,
    coverage: { cells, covered, gaps: cells - covered },
  };
}

/** 1284 -> "1,284"; 159957409 -> "160M". Used for stat-tile values. */
export function compactNumber(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace(/\.0$/, '')}M`;
  if (value >= 10_000) return `${(value / 1e3).toFixed(0)}K`;
  return value.toLocaleString('en-US');
}

/** Bytes -> "171 GB", rounded the way a person would say it out loud. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(1)} TB`;
  if (bytes >= 1e9) return `${Math.round(bytes / 1e9)} GB`;
  if (bytes >= 1e6) return `${Math.round(bytes / 1e6)} MB`;
  return `${Math.round(bytes / 1e3)} KB`;
}

/** Newest record in the catalog by verification date, for the spotlight row. */
export function recentlyVerified(sources: Source[], limit: number): Source[] {
  return sources
    .slice()
    .sort((a, b) => b.quality.last_verified.localeCompare(a.quality.last_verified))
    .slice(0, limit);
}
