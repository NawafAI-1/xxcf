import Link from 'next/link';
import { getAllSources } from '@/lib/sources';
import { getCatalogStats, compactNumber, formatBytes, recentlyVerified } from '@/lib/stats';
import { ACCESS_COLORS, DOMAIN_COLORS, QUALITY_COLORS } from '@/lib/types';
import StatTile from '@/components/StatTile';
import BarList, { type BarItem } from '@/components/BarList';
import DecadeChart from '@/components/DecadeChart';
import Section from '@/components/Section';
import SourceCard from '@/components/SourceCard';
import OceanScene from '@/components/OceanScene';

const READINESS_LABELS: Record<string, string> = {
  'analysis-ready': 'Analysis-ready',
  cleaned: 'Cleaned',
  raw: 'Raw',
  deprecated: 'Deprecated',
};

const ACCESS_LABELS: Record<string, string> = {
  public: 'Public',
  'kaust-internal': 'KAUST internal',
  restricted: 'Restricted',
  embargoed: 'Embargoed',
};

const DOMAIN_LABELS: Record<string, string> = {
  environmental: 'Environmental',
  ecological: 'Ecological',
  production: 'Production',
  'nutrition-health': 'Nutrition & health',
  'socio-economic': 'Socio-economic',
};

const EXPLORE = [
  {
    href: '/browse',
    title: 'Browse & search',
    body: 'Filter by domain, subbasin, access tier and readiness, or search by meaning rather than keyword.',
  },
  {
    href: '/map',
    title: 'Spatial footprints',
    body: 'See which stretch of the basin each dataset actually covers, drawn as bounding boxes on one map.',
  },
  {
    href: '/coverage',
    title: 'Coverage gaps',
    body: 'Subbasin by theme, colored by the best data available. The grey cells are the open questions.',
  },
  {
    href: '/network',
    title: 'Source network',
    body: 'Lineage and shared-theme links between datasets, so you can see what builds on what.',
  },
];

export default function HomePage() {
  const sources = getAllSources();
  const stats = getCatalogStats(sources);
  const spotlight = recentlyVerified(sources, 3);

  const domainItems: BarItem[] = stats.domainCounts.map((d) => ({
    key: d.key,
    label: DOMAIN_LABELS[d.key] ?? d.key,
    count: d.count,
    color: DOMAIN_COLORS[d.key],
    href: `/browse?domain=${d.key}`,
  }));

  const readinessItems: BarItem[] = stats.qualityCounts.map((q) => ({
    key: q.key,
    label: READINESS_LABELS[q.key] ?? q.key,
    count: q.count,
    color: QUALITY_COLORS[q.key],
    href: `/browse?quality=${q.key}`,
  }));

  const accessItems: BarItem[] = stats.accessCounts.map((a) => ({
    key: a.key,
    label: ACCESS_LABELS[a.key] ?? a.key,
    count: a.count,
    color: ACCESS_COLORS[a.key],
    href: `/browse?access=${a.key}`,
  }));

  const subbasinItems: BarItem[] = stats.subbasinCounts.map((s) => ({
    key: s.key,
    label: s.key.replace(/-/g, ' ').replace(/^\w/, (c) => c.toUpperCase()),
    count: s.count,
    color: '#0e7490',
    href: `/browse?subbasin=${s.key}`,
  }));

  const coveragePct = Math.round((stats.coverage.covered / stats.coverage.cells) * 100);

  return (
    <div className="space-y-6">
      {/* Hero — the one place the catalog gets to state its case in plain words.
          The ocean behind it is decoration, so it sits under the content and
          stills itself for readers who ask for reduced motion. */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-6 py-10 text-white shadow-sm sm:px-10 sm:py-14">
        <OceanScene />
        <div className="relative">
        <p className="text-xs font-semibold uppercase tracking-widest text-teal-300">
          KAUST Red Sea research data
        </p>
        <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
          {stats.datasets} Red Sea datasets, described well enough to actually use.
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
          One inventory across environment, reef ecology, fisheries production, nutrition and
          socio-economics, covering {stats.earliestYear} to today, with every variable, steward, licence and
          known limitation written down. Find what exists, see what does not, and know what it will
          take to use it before you commit a project to it.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/browse"
            className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
          >
            Browse the catalog
          </Link>
          <Link
            href="/coverage"
            className="rounded-lg border border-white/30 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            See where the gaps are
          </Link>
        </div>
        <dl className="mt-9 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-white/15 pt-6 sm:grid-cols-4">
          {[
            { label: 'Years of record', value: `${stats.latestYear - stats.earliestYear + 1}`, hint: `${stats.earliestYear}–present` },
            { label: 'Originating institutions', value: `${stats.originators}`, hint: `${stats.stewards} named stewards` },
            { label: 'Documented variables', value: `${stats.variables}`, hint: `across ${stats.resources} files` },
            { label: 'Still being updated', value: `${stats.ongoing}`, hint: 'ongoing collections' },
          ].map((item) => (
            <div key={item.label}>
              <dt className="text-xs font-medium uppercase tracking-wide text-teal-200">{item.label}</dt>
              <dd className="mt-1 text-2xl font-semibold">{item.value}</dd>
              <dd className="text-xs text-slate-300">{item.hint}</dd>
            </div>
          ))}
        </dl>
        </div>
      </section>

      {/* Headline numbers: size of the catalog, and how much of it is usable today. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Datasets catalogued"
          value={`${stats.datasets}`}
          hint={`${stats.resources} files · ${compactNumber(stats.rows)} records`}
          href="/browse"
          accent="#0f766e"
        />
        <StatTile
          label="Ready to analyse now"
          value={`${stats.analysisReady}`}
          hint={`${stats.qualityCounts.find((q) => q.key === 'raw')?.count ?? 0} still raw; cleaning is the bottleneck`}
          href="/browse?quality=analysis-ready"
          accent="#047857"
        />
        <StatTile
          label="Openly licensed"
          value={`${stats.publicAccess} of ${stats.datasets}`}
          hint={`${stats.datasets - stats.publicAccess} need a KAUST internal request`}
          href="/browse?access=public"
          accent="#0284c7"
        />
        <StatTile
          label="Indexed volume"
          value={formatBytes(stats.sizedBytes)}
          hint={`plus ${stats.unsizedResources} files sized only as part of a collection`}
          accent="#7c3aed"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section
          title="What the catalog holds"
          description="Datasets by domain. A dataset can sit in more than one."
          action={{ href: '/browse', label: 'Browse all' }}
        >
          <BarList items={domainItems} />
        </Section>

        <Section
          title="How usable it is today"
          description="Processing state and access tier: the two questions that decide whether a dataset helps this quarter or next year."
          action={{ href: '/browse', label: 'Filter' }}
        >
          <BarList items={readinessItems} />
          <hr className="my-4 border-slate-100" />
          <BarList items={accessItems} />
        </Section>

        <Section
          title="When it covers"
          description="Datasets with records in each decade. Recent years are dense; the long tail back to the 1950s comes from reconstructed catch and demographic series."
          action={{ href: '/browse', label: 'Browse by period' }}
        >
          <DecadeChart decades={stats.decades} />
        </Section>

        <Section
          title="Where it covers"
          description="Datasets whose footprint includes each subbasin. Basin-wide products count in every row."
          action={{ href: '/map', label: 'Open the map' }}
        >
          <BarList items={subbasinItems} />
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Section
          title="Theme coverage"
          description="Subbasin × theme combinations with at least one dataset behind them."
          action={{ href: '/coverage', label: 'Open matrix' }}
          className="lg:col-span-1"
        >
          <p className="text-4xl font-semibold text-slate-900">{coveragePct}%</p>
          <p className="mt-1 text-sm text-slate-600">
            {stats.coverage.covered} of {stats.coverage.cells} combinations are covered;{' '}
            {stats.coverage.gaps} {stats.coverage.gaps === 1 ? 'is' : 'are'} still empty.
          </p>
          <div className="mt-4 flex flex-wrap gap-1" aria-hidden>
            {Array.from({ length: stats.coverage.cells }).map((_, i) => (
              <span
                key={i}
                className="h-3 w-3 rounded-[2px]"
                style={{ backgroundColor: i < stats.coverage.covered ? '#0f766e' : '#e2e8f0' }}
              />
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">
            Each square is one subbasin × theme combination; grey squares are the ones no catalogued
            dataset answers.
          </p>
        </Section>

        <Section
          title="What we know we don't know"
          description="Cataloguing records its own uncertainty rather than rounding it away."
          className="lg:col-span-2"
        >
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {[
              { label: 'Known issues logged', value: `${stats.knownIssues}`, hint: 'unverified licences, uncounted rows, gaps in metadata' },
              { label: 'Records with a DOI', value: `${stats.withDoi}`, hint: 'the rest cite an originator without one' },
              { label: 'Lineage links', value: `${stats.lineageLinks}`, hint: 'datasets explicitly derived from another' },
              { label: 'Last verified', value: stats.lastVerified, hint: 'most recent record check' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg bg-slate-50 p-3">
                <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{item.label}</dt>
                <dd className="mt-1 text-xl font-semibold text-slate-900">{item.value}</dd>
                <dd className="mt-1 text-xs leading-relaxed text-slate-500">{item.hint}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            Every record carries a <span className="font-medium text-slate-800">known issues</span>{' '}
            field. Where a row count, licence or DOI could not be confirmed during cataloguing, it
            says so instead of guessing, so a plan built on this catalog can budget for the
            verification it still needs.
          </p>
        </Section>
      </div>

      <Section
        title="Most recently verified"
        description="The records checked most recently against their files on DataWaha."
        action={{ href: '/browse', label: 'See all datasets' }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {spotlight.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      </Section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {EXPLORE.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md"
          >
            <h3 className="text-sm font-semibold text-slate-900 group-hover:text-teal-800">
              {card.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{card.body}</p>
            <span className="mt-3 inline-block text-sm font-medium text-teal-700">Open &rarr;</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
