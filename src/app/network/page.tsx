import Link from 'next/link';
import { getAllSources } from '@/lib/sources';
import { buildGraph, networkFindings, STRONG_LINK_MIN_WEIGHT } from '@/lib/graph';
import { DOMAIN_COLORS } from '@/lib/types';
import NetworkPageClient from './NetworkPageClient';
import PageHeader from '@/components/PageHeader';
import Figure from '@/components/Figure';
import Panel from '@/components/Panel';
import { sectionAccent } from '@/lib/sections';

export const metadata = {
  title: 'Source network | Red Sea Marine Data Catalog',
  description:
    'Which Red Sea datasets can be joined to which, the records that bridge two domains, and the ones nothing else connects to.',
};

const DOMAIN_LABELS: Record<string, string> = {
  environmental: 'Environmental',
  ecological: 'Ecological',
  production: 'Production',
  'nutrition-health': 'Nutrition & health',
  'socio-economic': 'Socio-economic',
};

export default function NetworkPage() {
  const sources = getAllSources();
  const accent = sectionAccent('/network');
  const graph = buildGraph(sources);
  const findings = networkFindings(graph, STRONG_LINK_MIN_WEIGHT);
  const bridges = findings.bridges.slice(0, 5);
  const maxCross = bridges[0]?.crossLinks ?? 1;

  return (
    <div className="space-y-4">
      <PageHeader
        accent={accent}
        title="What joins to what"
        description={`One node per dataset, placed in its domain. A line means the two could plausibly be joined. Two thirds of the ${findings.totalLinks} possible links rest on a single shared word, so those are hidden.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Joins worth a look"
          value={String(findings.strongLinks)}
          hint={`Pairs sharing ${findings.minWeight} or more terms, plus ${findings.lineageLinks} recorded lineage links.`}
          accent={accent}
        />
        <Figure
          label="Cross a domain"
          value={String(findings.crossDomainLinks)}
          hint="Between records sharing no domain. A reader in one domain never meets them."
          accent="#d97706"
        />
        <Figure
          label="Connected"
          value={`${Math.round(findings.connectedShare * 100)}%`}
          hint={`Of ${graph.nodes.length} records, with at least one strong link.`}
          accent="#0284c7"
        />
        <Figure
          label="Connected to nothing"
          value={String(findings.orphans.length)}
          hint="No shared vocabulary at any threshold."
          accent="#64748b"
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          eyebrow="The finding to act on"
          title={`${bridges.length} records carry the traffic between domains`}
          description="Their strong links land outside their own domain. Cut these and the catalog falls into five piles."
          footnote="Counted at the default threshold. A record can bridge more than one domain."
        >
          <ul className="space-y-3">
            {bridges.map((b) => (
              <li key={b.id}>
                <div className="flex items-baseline gap-3">
                  <Link
                    href={`/sources/${b.id}`}
                    className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 hover:text-violet-700 hover:underline"
                  >
                    {b.title}
                  </Link>
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{b.crossLinks}</span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(b.crossLinks / maxCross) * 100}%`,
                        backgroundColor: DOMAIN_COLORS[b.domain[0]],
                      }}
                    />
                  </div>
                  <span className="shrink-0 text-[11px] text-slate-500">
                    reaches {b.reaches.map((d) => DOMAIN_LABELS[d]).join(', ')}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Panel>

        <div className="space-y-4">
          {findings.strongestJoin ? (
            <Panel
              eyebrow="Strongest single join"
              title={`${findings.strongestJoin.weight} shared terms`}
              description="Shared vocabulary is a hint, not a promise: check space, time and units before merging."
            >
              <div className="space-y-2 text-sm">
                <p className="font-medium leading-snug text-slate-900">{findings.strongestJoin.a}</p>
                <p className="text-xs text-slate-400">and</p>
                <p className="font-medium leading-snug text-slate-900">{findings.strongestJoin.b}</p>
              </div>
              <ul className="mt-4 flex flex-wrap gap-1">
                {findings.strongestJoin.sharedThemes.map((t) => (
                  <li
                    key={t}
                    className="rounded-full bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 ring-1 ring-inset ring-slate-200"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {findings.orphans.length > 0 ? (
            <Panel
              eyebrow="Nothing links here"
              title={`${findings.orphans.length} record${findings.orphans.length === 1 ? '' : 's'} sit${findings.orphans.length === 1 ? 's' : ''} alone`}
              description="No theme or keyword in common with anything else. Either they stand apart, or their vocabulary needs aligning."
            >
              <ul className="space-y-2">
                {findings.orphans.map((o) => (
                  <li key={o.id} className="flex items-baseline gap-2">
                    <span
                      className="h-2 w-2 shrink-0 translate-y-[1px] rounded-full"
                      style={{ backgroundColor: DOMAIN_COLORS[o.domain[0]] }}
                      aria-hidden
                    />
                    <Link
                      href={`/sources/${o.id}`}
                      className="text-sm text-slate-700 hover:text-violet-700 hover:underline"
                    >
                      {o.title}
                    </Link>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </div>

      <NetworkPageClient sources={sources} />
    </div>
  );
}
