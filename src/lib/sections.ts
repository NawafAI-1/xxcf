// The site's five sections and the colour each one wears. Kept in one place so
// the nav, the page headers and any link into a section cannot drift apart.
//
// The accents run cool-to-warm across the journey a reader takes: the overview
// is the shoreline teal, browsing is open water, the map is shallow cyan,
// coverage is the sandy edge where the data runs out, and the network is the
// deep violet of what connects to what.
export interface Section {
  href: string;
  label: string;
  accent: string;
}

export const SECTIONS: Section[] = [
  { href: '/', label: 'Overview', accent: '#0f766e' },
  { href: '/browse', label: 'Browse', accent: '#0284c7' },
  { href: '/map', label: 'Map', accent: '#0891b2' },
  { href: '/timeline', label: 'Timeline', accent: '#0369a1' },
  { href: '/coverage', label: 'Coverage', accent: '#b45309' },
  { href: '/joins', label: 'Joins', accent: '#0d9488' },
  { href: '/network', label: 'Network', accent: '#7c3aed' },
];

export function sectionAccent(href: string): string {
  return SECTIONS.find((s) => s.href === href)?.accent ?? '#0f766e';
}
