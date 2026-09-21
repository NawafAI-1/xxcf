// The readings a stakeholder actually needs from the catalogue: not how many
// records exist, but which of them can be used, what stands in the way, and
// where the work is concentrated. Everything is derived from data/sources.
import type { Domain, Source, QualityStatus } from './types';
import { DOMAINS } from './types';

export interface DomainReadiness {
  domain: Domain;
  total: number;
  ready: number;
  cleaned: number;
  raw: number;
  /** Share of the domain that can be used as it stands. */
  share: number;
}

export function readinessByDomain(sources: Source[]): DomainReadiness[] {
  return DOMAINS.map((domain) => {
    const inDomain = sources.filter((s) => s.domain.includes(domain));
    const count = (status: QualityStatus) =>
      inDomain.filter((s) => s.quality.status === status).length;
    const ready = count('analysis-ready');
    return {
      domain,
      total: inDomain.length,
      ready,
      cleaned: count('cleaned'),
      raw: count('raw'),
      share: inDomain.length ? ready / inDomain.length : 0,
    };
  })
    .filter((entry) => entry.total > 0)
    .sort((a, b) => b.share - a.share || b.total - a.total);
}

/**
 * The 128 known issues, grouped into the kinds of work they imply.
 *
 * Grouping is by keyword over the issue text, so an issue naming two problems
 * counts under both and the totals are larger than the number of issues. It is
 * a reading of prose, not a field in the schema, and the page says so.
 */
const ISSUE_THEMES: { label: string; hint: string; pattern: RegExp }[] = [
  {
    label: 'Not filtered to the Red Sea',
    hint: 'global extracts needing a spatial subset',
    pattern: /global|not filtered|not red.?sea|subsett|whole world|all countries/i,
  },
  {
    label: 'Counts estimated, not exact',
    hint: 'row counts inferred from file size or sampled',
    pattern: /row count|not exact|estimat|uncounted|sampled|approximate/i,
  },
  {
    label: 'Provenance or version unclear',
    hint: 'which extract this is, or where it came from',
    pattern: /provenance|version|stale|unclear|undocumented|not documented|unconfirmed|not (independently )?verified/i,
  },
  {
    label: 'Needs processing before use',
    hint: 'conversion, chunking or parsing before analysis',
    pattern: /needs |requires |chunked|stream|conversion|convert|parsing|reprocess/i,
  },
  {
    label: 'Licence or DOI unconfirmed',
    hint: 'cannot be published on without checking terms',
    pattern: /licen|doi|terms of use|redistribut|attribution/i,
  },
];

export interface IssueTheme {
  label: string;
  hint: string;
  count: number;
  sources: number;
}

export function issueThemes(sources: Source[]): { total: number; themes: IssueTheme[] } {
  let total = 0;
  const counts = new Map<string, { count: number; sources: Set<string> }>();

  for (const source of sources) {
    for (const issue of source.quality.known_issues) {
      total += 1;
      for (const theme of ISSUE_THEMES) {
        if (!theme.pattern.test(issue)) continue;
        const entry = counts.get(theme.label) ?? { count: 0, sources: new Set<string>() };
        entry.count += 1;
        entry.sources.add(source.id);
        counts.set(theme.label, entry);
      }
    }
  }

  const themes = ISSUE_THEMES.map((theme) => ({
    label: theme.label,
    hint: theme.hint,
    count: counts.get(theme.label)?.count ?? 0,
    sources: counts.get(theme.label)?.sources.size ?? 0,
  }))
    .filter((t) => t.count > 0)
    .sort((a, b) => b.count - a.count);

  return { total, themes };
}

export interface Custody {
  stewards: number;
  withoutEmail: number;
  busiest: { name: string; count: number } | null;
}

export function custody(sources: Source[]): Custody {
  const byName = new Map<string, number>();
  let withoutEmail = 0;

  for (const source of sources) {
    const name = source.access.steward?.name?.trim();
    if (name) byName.set(name, (byName.get(name) ?? 0) + 1);
    if (!source.access.steward?.email?.trim()) withoutEmail += 1;
  }

  const busiest = [...byName.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    stewards: byName.size,
    withoutEmail,
    busiest: busiest ? { name: busiest[0], count: busiest[1] } : null,
  };
}
