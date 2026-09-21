// Pure data-shaping for the network graph — no rendering or physics here.
//
// Two kinds of edges come out of the source records:
//  - "lineage": provenance.derived_from, an explicit, recorded relationship
//  - "theme": two records share vocabulary (themes + keywords), a computed
//    relationship that stands in for "these could plausibly be joined"
//
// Theme edges carry a weight (how many terms are shared) because an unweighted
// version of this graph is a hairball: 143 edges over 43 records, and two
// thirds of them rest on a single shared word. The weight is what lets the
// page show the joins that are worth a researcher's time.
import type { Source, Domain } from './types';
import { DOMAINS } from './types';

export interface GraphNode {
  id: string;
  title: string;
  domain: Domain[];
  quality: Source['quality']['status'];
  accessTier: Source['access']['tier'];
  /** Resource count, used for node size. */
  resources: number;
}

export interface GraphLink {
  source: string;
  target: string;
  kind: 'lineage' | 'theme';
  /** Shared-term count for theme links; lineage links are always 1. */
  weight: number;
  sharedThemes?: string[];
  /** True when the two records share no domain, so the link crosses a boundary. */
  crossDomain: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** The strongest single join in the catalog, named so the page can lead with it. */
export interface StrongestJoin {
  a: string;
  b: string;
  weight: number;
  sharedThemes: string[];
}

/** A record that carries traffic between two different domains. */
export interface Bridge {
  id: string;
  title: string;
  domain: Domain[];
  /** How many of its strong links land in a domain it does not itself belong to. */
  crossLinks: number;
  reaches: Domain[];
}

export interface NetworkFindings {
  /** Threshold the findings were computed at, so the copy and the graph agree. */
  minWeight: number;
  totalLinks: number;
  strongLinks: number;
  lineageLinks: number;
  crossDomainLinks: number;
  bridges: Bridge[];
  orphans: GraphNode[];
  strongestJoin: StrongestJoin | null;
  /** Share of records with at least one strong link, as a 0-1 fraction. */
  connectedShare: number;
}

/** Default floor for a link the page calls "strong". */
export const STRONG_LINK_MIN_WEIGHT = 2;

function normalizedTerms(source: Source): Set<string> {
  return new Set([...source.themes, ...source.keywords].map((t) => t.toLowerCase().trim()));
}

function sharesDomain(a: Domain[], b: Domain[]): boolean {
  return a.some((d) => b.includes(d));
}

export function buildGraph(sources: Source[]): GraphData {
  const ids = new Set(sources.map((s) => s.id));
  const byId = new Map(sources.map((s) => [s.id, s]));

  const nodes: GraphNode[] = sources.map((s) => ({
    id: s.id,
    title: s.title,
    domain: s.domain,
    quality: s.quality.status,
    accessTier: s.access.tier,
    resources: s.resources.length,
  }));

  const links: GraphLink[] = [];
  const lineagePairs = new Set<string>();

  // Lineage edges: real, explicit derived_from relationships.
  for (const s of sources) {
    for (const parentId of s.provenance.derived_from) {
      if (!ids.has(parentId) || parentId === s.id) continue;
      const key = [s.id, parentId].sort().join('|');
      if (lineagePairs.has(key)) continue;
      lineagePairs.add(key);
      links.push({
        source: parentId,
        target: s.id,
        kind: 'lineage',
        weight: 1,
        crossDomain: !sharesDomain(byId.get(parentId)!.domain, s.domain),
      });
    }
  }

  // Theme edges: vocabulary overlap, one edge per pair, skipping pairs the
  // lineage pass already claimed.
  const terms = new Map(sources.map((s) => [s.id, normalizedTerms(s)]));
  for (let i = 0; i < sources.length; i++) {
    for (let j = i + 1; j < sources.length; j++) {
      const a = sources[i];
      const b = sources[j];
      if (lineagePairs.has([a.id, b.id].sort().join('|'))) continue;

      const shared = [...terms.get(a.id)!].filter((t) => terms.get(b.id)!.has(t)).sort();
      if (shared.length === 0) continue;

      links.push({
        source: a.id,
        target: b.id,
        kind: 'theme',
        weight: shared.length,
        sharedThemes: shared,
        crossDomain: !sharesDomain(a.domain, b.domain),
      });
    }
  }

  return { nodes, links };
}

/**
 * What the network actually says, computed once on the server so the page can
 * lead with findings instead of asking the reader to interpret a blob.
 */
export function networkFindings(
  graph: GraphData,
  minWeight = STRONG_LINK_MIN_WEIGHT
): NetworkFindings {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const strong = graph.links.filter((l) => l.kind === 'lineage' || l.weight >= minWeight);

  const degree = new Map<string, number>();
  const crossCount = new Map<string, number>();
  const reaches = new Map<string, Set<Domain>>();

  for (const link of strong) {
    const a = byId.get(link.source)!;
    const b = byId.get(link.target)!;
    degree.set(a.id, (degree.get(a.id) ?? 0) + 1);
    degree.set(b.id, (degree.get(b.id) ?? 0) + 1);
    if (!link.crossDomain) continue;
    crossCount.set(a.id, (crossCount.get(a.id) ?? 0) + 1);
    crossCount.set(b.id, (crossCount.get(b.id) ?? 0) + 1);
    for (const [self, other] of [
      [a, b],
      [b, a],
    ] as const) {
      if (!reaches.has(self.id)) reaches.set(self.id, new Set());
      for (const d of other.domain) if (!self.domain.includes(d)) reaches.get(self.id)!.add(d);
    }
  }

  const bridges: Bridge[] = [...crossCount.entries()]
    .map(([id, crossLinks]) => {
      const node = byId.get(id)!;
      return {
        id,
        title: node.title,
        domain: node.domain,
        crossLinks,
        reaches: DOMAINS.filter((d) => reaches.get(id)?.has(d)),
      };
    })
    .sort((a, b) => b.crossLinks - a.crossLinks || a.title.localeCompare(b.title));

  // An orphan has no link at any weight, not merely none above the threshold:
  // the threshold hides links, it does not remove them from the record.
  const anyDegree = new Set<string>();
  for (const link of graph.links) {
    anyDegree.add(link.source);
    anyDegree.add(link.target);
  }
  const orphans = graph.nodes.filter((n) => !anyDegree.has(n.id));

  const themeLinks = graph.links.filter((l) => l.kind === 'theme');
  const top = themeLinks.reduce<GraphLink | null>(
    (best, l) => (best === null || l.weight > best.weight ? l : best),
    null
  );

  return {
    minWeight,
    totalLinks: graph.links.length,
    strongLinks: strong.length,
    lineageLinks: graph.links.filter((l) => l.kind === 'lineage').length,
    crossDomainLinks: strong.filter((l) => l.crossDomain).length,
    bridges,
    orphans,
    strongestJoin: top
      ? {
          a: byId.get(top.source)!.title,
          b: byId.get(top.target)!.title,
          weight: top.weight,
          sharedThemes: top.sharedThemes ?? [],
        }
      : null,
    connectedShare: graph.nodes.length ? degree.size / graph.nodes.length : 0,
  };
}
