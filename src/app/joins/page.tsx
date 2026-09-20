import Link from 'next/link';
import { getAllSources } from '@/lib/sources';
import { KEY_LABELS, type KeyKind, concepts, joinCandidates, keysOf } from '@/lib/joins';
import { DOMAIN_COLORS } from '@/lib/types';
import PageHeader from '@/components/PageHeader';
import { sectionAccent } from '@/lib/sections';

export const metadata = {
  title: 'Joins | Red Sea Marine Data Catalog',
  description:
    'Which datasets can actually be combined: shared concepts declared in the records, shared join keys, and overlapping time and space.',
};

function Dot({ domain }: { domain: keyof typeof DOMAIN_COLORS }) {
  return (
    <span
      className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: DOMAIN_COLORS[domain] }}
      aria-hidden
    />
  );
}

export default function JoinsPage() {
  const sources = getAllSources();
  const shared = concepts(sources).filter((c) => c.sources.length > 1);
  const candidates = joinCandidates(sources, 12);

  const keyCoverage = (Object.keys(KEY_LABELS) as KeyKind[]).map((kind) => ({
    kind,
    count: sources.filter((s) => keysOf(s).includes(kind)).length,
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        accent={sectionAccent('/joins')}
        title="What joins to what"
        description="A catalogue lists datasets. The useful question is which of them can be put together. This page answers it from two signals: the concepts the records declare their variables feed, and the columns those variables would be joined on, filtered down to pairs that actually overlap in time and space."
      />

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="text-base font-semibold text-slate-900">Pairs worth combining</h2>
          <p className="mt-1 text-sm text-slate-600">
            Ranked by strength of evidence: a declared shared concept first, then the number of
            columns the two have in common, then the length of the overlap. Every pair here already
            overlaps in both years and area, so the join is possible rather than merely plausible.
          </p>
        </div>

        {candidates.length === 0 ? (
          <p className="text-sm text-slate-500">No pairs meet the bar yet.</p>
        ) : (
          <ul className="space-y-3">
            {candidates.map((pair) => (
              <li
                key={`${pair.a.id}-${pair.b.id}`}
                className="rounded-lg border border-slate-200 p-3 transition hover:border-slate-300"
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {[pair.a, pair.b].map((source) => (
                    <Link
                      key={source.id}
                      href={`/sources/${source.id}`}
                      className="flex items-start gap-2 text-sm text-slate-800 hover:text-teal-800"
                    >
                      <Dot domain={source.domain[0]} />
                      <span>{source.title}</span>
                    </Link>
                  ))}
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 font-medium tabular-nums text-slate-700">
                    {pair.years[0]}-{pair.years[1]}
                  </span>
                  {pair.concepts.map((concept) => (
                    <span
                      key={concept}
                      className="rounded-full bg-teal-50 px-2 py-0.5 font-medium text-teal-800 ring-1 ring-inset ring-teal-200"
                      title="Declared in both records"
                    >
                      {concept.split(':').pop()?.replace(/_/g, ' ')}
                    </span>
                  ))}
                  {pair.sharedKeys.map((kind) => (
                    <span key={kind} className="rounded-full px-2 py-0.5 text-slate-500 ring-1 ring-slate-200">
                      {KEY_LABELS[kind]}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-500">
          Teal chips are concepts both records declare. Outlined chips are columns inferred from
          variable names, which is a hint rather than a guarantee.
        </p>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">Concepts more than one dataset feeds</h2>
          <p className="mt-1 text-sm text-slate-600">
            Straight from the records: a variable&rsquo;s <code className="rounded bg-slate-100 px-1 text-xs">maps_to</code>{' '}
            names the concept it supplies, so two datasets naming the same one were catalogued as
            speaking about the same thing.
          </p>
          <ul className="mt-4 space-y-4">
            {shared.map((concept) => (
              <li key={concept.id}>
                <p className="text-sm font-medium text-slate-900">
                  {concept.label}
                  <span className="ml-2 font-mono text-xs font-normal text-slate-400">{concept.domain}</span>
                </p>
                <ul className="mt-1 space-y-1">
                  {concept.sources.map((source) => (
                    <li key={source.id}>
                      <Link
                        href={`/sources/${source.id}`}
                        className="flex items-start gap-2 text-sm text-slate-700 hover:text-teal-800"
                      >
                        <Dot domain={source.domain[0]} />
                        <span>{source.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-base font-semibold text-slate-900">What the catalogue cannot tell you yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            A join needs a column to join on, and the catalogue only knows about columns someone
            wrote down. Of {sources.length} records, this many document each kind:
          </p>
          <ul className="mt-4 space-y-2">
            {keyCoverage.map((entry) => (
              <li key={entry.kind} className="flex items-center gap-3">
                <span className="w-28 shrink-0 text-sm text-slate-700">{KEY_LABELS[entry.kind]}</span>
                <span className="flex flex-1 items-center gap-2">
                  <span
                    className="h-5 rounded-r-[4px] bg-teal-700"
                    style={{ width: `${Math.max((entry.count / sources.length) * 100, 2)}%` }}
                    aria-hidden
                  />
                  <span className="text-sm font-medium tabular-nums text-slate-600">
                    {entry.count}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            So for most records the answer is not &ldquo;these cannot be joined&rdquo; but &ldquo;nobody has
            written down enough to say&rdquo;. Documenting the time and location columns of the
            remaining records is the cheapest thing that would make this page useful across the
            whole catalogue.
          </p>
        </section>
      </div>
    </div>
  );
}
