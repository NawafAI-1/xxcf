// Turns the records' temporal coverage into a shape a ribbon chart can draw,
// and answers the question the catalogue could not answer before: for which
// years do we hold several kinds of data at once?
import type { Domain, Source } from './types';
import { DOMAINS } from './types';
import { endYear, startYear } from './temporal';

export interface TimelineRow {
  id: string;
  title: string;
  domain: Domain;
  domains: Domain[];
  start: number;
  end: number;
  ongoing: boolean;
  status: Source['quality']['status'];
}

export interface YearCoverage {
  year: number;
  /** How many of the five domains have at least one dataset covering it. */
  domains: number;
  datasets: number;
}

export interface Timeline {
  minYear: number;
  maxYear: number;
  groups: { domain: Domain; rows: TimelineRow[] }[];
  years: YearCoverage[];
  /** The longest run of years where every domain is represented at once. */
  bestOverlap: { from: number; to: number; domains: number } | null;
}

function yearOf(value: string, fallback: number): number {
  const parsed = parseInt(value.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function buildTimeline(sources: Source[]): Timeline {
  const now = new Date().getFullYear();

  const rows: TimelineRow[] = sources.map((s) => {
    const start = startYear(s);
    const end = endYear(s, now);
    return {
      id: s.id,
      title: s.title,
      domain: s.domain[0],
      domains: s.domain,
      start,
      end,
      ongoing: s.temporal.ongoing,
      status: s.quality.status,
    };
  });

  const minYear = Math.min(...rows.map((r) => r.start));
  const maxYear = Math.max(now, ...rows.map((r) => r.end));

  const years: YearCoverage[] = [];
  for (let year = minYear; year <= maxYear; year += 1) {
    const covering = rows.filter((r) => r.start <= year && r.end >= year);
    const domains = new Set<Domain>();
    covering.forEach((r) => r.domains.forEach((d) => domains.add(d)));
    years.push({ year, domains: domains.size, datasets: covering.length });
  }

  // The best stretch is the longest run at the highest domain count reached,
  // which is the honest version of "when can you study the whole system".
  const peak = Math.max(...years.map((y) => y.domains));
  let bestOverlap: Timeline['bestOverlap'] = null;
  let runStart: number | null = null;
  for (const entry of years) {
    if (entry.domains === peak) {
      if (runStart === null) runStart = entry.year;
      const length = entry.year - runStart;
      if (!bestOverlap || length > bestOverlap.to - bestOverlap.from) {
        bestOverlap = { from: runStart, to: entry.year, domains: peak };
      }
    } else {
      runStart = null;
    }
  }

  const groups = DOMAINS.map((domain) => ({
    domain,
    rows: rows
      .filter((r) => r.domains.includes(domain))
      .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title)),
  })).filter((g) => g.rows.length > 0);

  return { minYear, maxYear, groups, years, bestOverlap };
}
