// Server-side (build-time) loading of data/sources/*.json — used by statically
// generated pages via fs, never shipped to the client.
import fs from 'node:fs';
import path from 'node:path';
import type { Source } from './types';

const SOURCES_DIR = path.join(process.cwd(), 'data', 'sources');

export function getAllSources(): Source[] {
  const files = fs.readdirSync(SOURCES_DIR).filter((f) => f.endsWith('.json'));
  return files
    .map((file) => JSON.parse(fs.readFileSync(path.join(SOURCES_DIR, file), 'utf-8')) as Source)
    .sort((a, b) => {
      const order = { 'analysis-ready': 0, cleaned: 1, raw: 2, deprecated: 3 } as const;
      const statusDiff = order[a.quality.status] - order[b.quality.status];
      if (statusDiff !== 0) return statusDiff;
      return b.temporal.end.localeCompare(a.temporal.end);
    });
}

export function getSourceById(id: string): Source | undefined {
  return getAllSources().find((s) => s.id === id);
}

/**
 * Other datasets sharing themes or keywords with this one, most overlap first.
 * Lineage is explicit in the records; this is the softer "you probably also
 * need" link that makes a detail page a starting point rather than a dead end.
 */
export function getRelatedSources(source: Source, limit = 4): Source[] {
  const terms = new Set([...source.themes, ...source.keywords].map((t) => t.toLowerCase().trim()));

  return getAllSources()
    .filter((s) => s.id !== source.id)
    .map((s) => {
      const shared = new Set(
        [...s.themes, ...s.keywords].map((t) => t.toLowerCase().trim()).filter((t) => terms.has(t))
      );
      return { source: s, shared: shared.size };
    })
    .filter((match) => match.shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, limit)
    .map((match) => match.source);
}
