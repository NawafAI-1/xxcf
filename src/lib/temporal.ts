// One reading of a record's time span, used everywhere a year is compared.
//
// `ongoing` says a series is still being collected; it does not say data
// already exists for this year. Six records in the catalogue are flagged
// ongoing with a stated end in the past - UN WPP stops at 2023, FAOSTAT at
// 2024 - so treating ongoing as "runs to today" put them in years they do not
// cover, and a click on 2025 returned records whose own data stops before it.
//
// The rule: coverage ends where the record says it ends. `ongoing` only
// extends the span when no end year is recorded at all.
import type { Source } from './types';

export function startYear(source: Source): number {
  const parsed = parseInt(source.temporal.start.slice(0, 4), 10);
  return Number.isFinite(parsed) ? parsed : new Date().getFullYear();
}

export function endYear(source: Source, now = new Date().getFullYear()): number {
  const stated = parseInt(source.temporal.end.slice(0, 4), 10);
  if (Number.isFinite(stated)) return Math.max(stated, startYear(source));
  return source.temporal.ongoing ? now : startYear(source);
}

export function coversYear(source: Source, year: number, now = new Date().getFullYear()): boolean {
  return year >= startYear(source) && year <= endYear(source, now);
}

/** "2016-2023", with the ongoing flag left to the caller to show separately. */
export function periodLabel(source: Source): string {
  const start = startYear(source);
  const end = endYear(source);
  return start === end ? `${start}` : `${start}-${end}`;
}
