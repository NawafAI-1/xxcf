// What can actually be combined with what.
//
// Two signals, kept apart because they are not equally strong:
//
//  - Shared concepts come from the records themselves. A variable's `maps_to`
//    field names the concept it feeds, so two datasets naming the same concept
//    were declared joinable by whoever catalogued them.
//  - Join keys are inferred from variable names. A column called `year`, `lat`
//    or `sciname` is almost certainly the axis you would join on, but nothing
//    in the record says so, and the page labels it as inference.
//
// A pair is only worth proposing if it also overlaps in time and in space:
// two datasets that share a concept but never observed the same years cannot
// be joined, however well their columns line up.
import type { Source } from './types';
import { type BBox, isGlobalScale } from './spatial';

export type KeyKind = 'time' | 'coordinates' | 'place' | 'taxon';

export const KEY_LABELS: Record<KeyKind, string> = {
  time: 'Time',
  coordinates: 'Coordinates',
  place: 'Named place',
  taxon: 'Species',
};

const KEY_PATTERNS: Record<KeyKind, RegExp> = {
  time: /^(year|date|time|month|period|datetime|timestamp)$|_(year|date)$|^(start|end)_/,
  coordinates: /^(lat|lon|long|latitude|longitude|x|y)$|coord/,
  place: /^(site|station|region|country|area_name|province|governorate|iso3?|fishing_entity|location|name)$/,
  taxon: /^(sciname|species|taxon|genus|family|scientific_name|common_name|taxon_key)$/,
};

export function keysOf(source: Source): KeyKind[] {
  const found = new Set<KeyKind>();
  for (const resource of source.resources) {
    for (const variable of resource.variables ?? []) {
      const name = variable.name.toLowerCase().trim();
      (Object.keys(KEY_PATTERNS) as KeyKind[]).forEach((kind) => {
        if (KEY_PATTERNS[kind].test(name)) found.add(kind);
      });
    }
  }
  return (Object.keys(KEY_LABELS) as KeyKind[]).filter((k) => found.has(k));
}

export interface Concept {
  /** The `maps_to` value, e.g. "ecological:thermal_stress_index". */
  id: string;
  domain: string;
  label: string;
  sources: Source[];
}

export function concepts(sources: Source[]): Concept[] {
  const byConcept = new Map<string, Set<string>>();

  for (const source of sources) {
    for (const resource of source.resources) {
      for (const variable of resource.variables ?? []) {
        for (const target of variable.maps_to ?? []) {
          if (!byConcept.has(target)) byConcept.set(target, new Set());
          byConcept.get(target)!.add(source.id);
        }
      }
    }
  }

  return [...byConcept.entries()]
    .map(([id, ids]) => {
      const [domain, rest] = id.includes(':') ? id.split(':') : ['', id];
      return {
        id,
        domain,
        label: (rest ?? id).replace(/_/g, ' '),
        sources: sources.filter((s) => ids.has(s.id)),
      };
    })
    .sort((a, b) => b.sources.length - a.sources.length || a.id.localeCompare(b.id));
}

function yearsOf(source: Source, now: number): [number, number] {
  const start = parseInt(source.temporal.start.slice(0, 4), 10);
  const end = source.temporal.ongoing ? now : parseInt(source.temporal.end.slice(0, 4), 10);
  return [start, Math.max(end || start, start)];
}

function overlapYears(a: Source, b: Source, now: number): [number, number] | null {
  const [aStart, aEnd] = yearsOf(a, now);
  const [bStart, bEnd] = yearsOf(b, now);
  const from = Math.max(aStart, bStart);
  const to = Math.min(aEnd, bEnd);
  return from <= to ? [from, to] : null;
}

function bboxesIntersect(a: Source, b: Source): boolean {
  if (!a.spatial.bbox || !b.spatial.bbox) return false;
  const [aw, as, ae, an] = a.spatial.bbox as BBox;
  const [bw, bs, be, bn] = b.spatial.bbox as BBox;
  return aw <= be && bw <= ae && as <= bn && bs <= an;
}

export interface JoinCandidate {
  a: Source;
  b: Source;
  concepts: string[];
  sharedKeys: KeyKind[];
  years: [number, number];
  /** Concept-backed pairs first; then more shared keys; then a longer overlap. */
  score: number;
}

export function joinCandidates(sources: Source[], limit = 12): JoinCandidate[] {
  const now = new Date().getFullYear();
  const conceptsBySource = new Map<string, Set<string>>();

  for (const source of sources) {
    const set = new Set<string>();
    for (const resource of source.resources) {
      for (const variable of resource.variables ?? []) {
        (variable.maps_to ?? []).forEach((t) => set.add(t));
      }
    }
    conceptsBySource.set(source.id, set);
  }

  const keysBySource = new Map(sources.map((s) => [s.id, keysOf(s)]));
  const candidates: JoinCandidate[] = [];

  for (let i = 0; i < sources.length; i += 1) {
    for (let j = i + 1; j < sources.length; j += 1) {
      const a = sources[i];
      const b = sources[j];

      const years = overlapYears(a, b, now);
      if (!years) continue;

      // Two global products overlap everywhere, which says nothing; at least
      // one of the pair has to be about somewhere in particular.
      const aGlobal = a.spatial.bbox ? isGlobalScale(a.spatial.bbox as BBox) : true;
      const bGlobal = b.spatial.bbox ? isGlobalScale(b.spatial.bbox as BBox) : true;
      if (aGlobal && bGlobal) continue;
      if (!bboxesIntersect(a, b)) continue;

      const shared = [...(conceptsBySource.get(a.id) ?? [])].filter((c) =>
        conceptsBySource.get(b.id)?.has(c)
      );
      const sharedKeys = (keysBySource.get(a.id) ?? []).filter((k) =>
        keysBySource.get(b.id)?.includes(k)
      );

      // A pair needs a declared concept in common, or two ways to line the
      // rows up. One shared key, usually "time", is not a join.
      if (shared.length === 0 && sharedKeys.length < 2) continue;

      const span = years[1] - years[0] + 1;
      candidates.push({
        a,
        b,
        concepts: shared,
        sharedKeys,
        years,
        score: shared.length * 1000 + sharedKeys.length * 100 + Math.min(span, 60),
      });
    }
  }

  return candidates.sort((x, y) => y.score - x.score).slice(0, limit);
}
