// Named field sites: the places the records say the work happened.
//
// The coordinates are a small gazetteer of Red Sea locations; the mentions are
// the catalogue's own words. A site appears on the map only because a record
// names it in its title, abstract, themes, keywords, resource names or paths,
// variable descriptions or known issues. The `subbasins` field is deliberately
// not searched: "farasan" there is a region tag, not a statement that anyone
// went there.
import type { Source } from './types';

export interface Site {
  name: string;
  lon: number;
  lat: number;
  /** Written forms that appear in the records. */
  aliases?: string[];
}

export const SITES: Site[] = [
  { name: 'Aqaba', lon: 35.0, lat: 29.53 },
  { name: 'Duba', lon: 35.69, lat: 27.35 },
  { name: 'Al Wajh', lon: 36.46, lat: 26.24, aliases: ['Al Waj', 'AlWajh'] },
  { name: 'Yanbu', lon: 38.06, lat: 24.09 },
  { name: 'Thuwal', lon: 39.1, lat: 22.3, aliases: ['KAUST'] },
  { name: 'Jeddah', lon: 39.19, lat: 21.49 },
  { name: 'Al Lith', lon: 40.27, lat: 20.15 },
  { name: 'Al Qunfudhah', lon: 41.08, lat: 19.13 },
  { name: 'Jazan', lon: 42.55, lat: 16.89 },
  { name: 'Farasan', lon: 42.11, lat: 16.7 },
  { name: 'Port Sudan', lon: 37.22, lat: 19.62 },
  { name: 'Massawa', lon: 39.45, lat: 15.61 },
];

function searchableText(source: Source): string {
  const parts: string[] = [
    source.title,
    source.abstract,
    ...source.themes,
    ...source.keywords,
    ...source.quality.known_issues,
  ];
  for (const resource of source.resources) {
    parts.push(resource.name, resource.path ?? '');
    for (const variable of resource.variables ?? []) parts.push(variable.description);
  }
  return parts.join(' ').toLowerCase();
}

export interface SiteMention {
  site: Site;
  sources: Source[];
}

export function siteMentions(sources: Source[]): SiteMention[] {
  const texts = new Map(sources.map((s) => [s.id, searchableText(s)]));

  return SITES.map((site) => {
    const names = [site.name, ...(site.aliases ?? [])].map((n) => n.toLowerCase());
    const matched = sources.filter((s) => {
      const text = texts.get(s.id) ?? '';
      return names.some((n) => text.includes(n));
    });
    return { site, sources: matched };
  })
    .filter((mention) => mention.sources.length > 0)
    .sort((a, b) => b.sources.length - a.sources.length);
}
