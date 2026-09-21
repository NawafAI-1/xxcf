import Link from 'next/link';
import { getAllSources } from '@/lib/sources';
import { getCatalogStats, compactNumber, formatBytes, recentlyVerified } from '@/lib/stats';
import { buildTimeline } from '@/lib/timeline';
import { latitudeProfile, profileExtremes, thinStretch } from '@/lib/basin';
import { custody, issueThemes, readinessByDomain } from '@/lib/insights';
import { ACCESS_COLORS, DOMAIN_COLORS, QUALITY_COLORS } from '@/lib/types';
import BasinMap from '@/components/BasinMap';
import Meter from '@/components/Meter';
import Panel from '@/components/Panel';
import Figure from '@/components/Figure';
import SourceCard from '@/components/SourceCard';
import YearStrip from '@/components/YearStrip';
import OceanScene from '@/components/OceanScene';

const DOMAIN_LABELS: Record<string, string> = {
  environmental: 'Environmental',
  ecological: 'Ecological',
  production: 'Production',
  'nutrition-health': 'Nutrition & health',
  'socio-economic': 'Socio-economic',
};

const EXPLORE = [
  { href: '/browse', title: 'Browse & search', body: 'Filter, or search by meaning.' },
  { href: '/map', title: 'Where the data is', body: 'Coverage across the basin.' },
  { href: '/timeline', title: 'Timeline', body: 'Every dataset, end to end.' },
  { href: '/coverage', title: 'Coverage gaps', body: 'Subbasin by theme.' },
];

export default function HomePage() {
  const sources = getAllSources();
  const stats = getCatalogStats(sources);
  const timeline = buildTimeline(sources);
  const readiness = readinessByDomain(sources);
  const issues = issueThemes(sources);
  const team = custody(sources);
  const profile = latitudeProfile(sources);
  const gradient = profileExtremes(profile);
  const thin = thinStretch(sources);
  const spotlight = recentlyVerified(sources, 3);

  const raw = stats.qualityCounts.find((q) => q.key === 'raw')?.count ?? 0;
  const cleaned = stats.qualityCounts.find((q) => q.key === 'cleaned')?.count ?? 0;
  const worst = readiness[readiness.length - 1];
  const issueLeader = issues.themes[0];

  return (
    <div className="space-y-4">
      {/* Hero: the catalogue's case, in the plainest words available. */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-teal-900 px-6 py-10 text-white shadow-sm sm:px-10 sm:py-14">
        <OceanScene />
        <div className="relative">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-teal-300">
            KAUST Red Sea research data
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.15] tracking-tight sm:text-[2.75rem]">
            {stats.datasets} Red Sea datasets. {stats.analysisReady} you can use today.
          </h1>
          <p className="mt-5 max-w-2xl text-sm leading-relaxed text-slate-200 sm:text-base">
            Environment, reef ecology, fisheries, nutrition and socio-economics,{' '}
            {stats.earliestYear} to now. Every variable, steward, licence and known limitation
            written down.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/browse?quality=analysis-ready"
              className="rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-slate-900 transition hover:bg-slate-100"
            >
              See what is ready
            </Link>
            <Link
              href="/map"
              className="rounded-xl border border-white/30 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Where the data is
            </Link>
          </div>
          <dl className="mt-10 grid grid-cols-2 gap-x-6 gap-y-6 border-t border-white/15 pt-7 sm:grid-cols-4">
            {[
              { label: 'Years of record', value: `${stats.latestYear - stats.earliestYear + 1}`, hint: `${stats.earliestYear} to present` },
              { label: 'Institutions', value: `${stats.originators}`, hint: `${team.stewards} named stewards` },
              { label: 'Documented variables', value: `${stats.variables}`, hint: `across ${stats.resources} files` },
              { label: 'Still collecting', value: `${stats.ongoing}`, hint: 'ongoing series' },
            ].map((item) => (
              <div key={item.label}>
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-teal-200">
                  {item.label}
                </dt>
                <dd className="mt-1.5 text-2xl font-semibold leading-none">{item.value}</dd>
                <dd className="mt-1.5 text-xs text-slate-300">{item.hint}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* The four numbers a decision actually turns on. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="Catalogued"
          value={`${stats.datasets}`}
          hint={`${stats.resources} files · ${compactNumber(stats.rows)} records · ${formatBytes(stats.sizedBytes)}`}
          href="/browse"
          accent="#0f766e"
        />
        <Figure
          label="Ready to analyse"
          value={`${stats.analysisReady}`}
          hint={`${raw} raw, ${cleaned} part-way. Cleaning is the bottleneck.`}
          href="/browse?quality=analysis-ready"
          accent={QUALITY_COLORS['analysis-ready']}
        />
        <Figure
          label="Openly licensed"
          value={`${stats.publicAccess}`}
          hint={`${stats.datasets - stats.publicAccess} need a KAUST request first`}
          href="/browse?access=public"
          accent={ACCESS_COLORS.public}
        />
        <Figure
          label="Known issues logged"
          value={`${issues.total}`}
          hint={`${stats.withDoi} carry a DOI; ${team.withoutEmail} have no steward.`}
          accent="#b45309"
        />
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <Panel
          eyebrow="Readiness"
          title="How usable each domain is"
          description="A domain is only as useful as the share you can open without processing first."
          action={{ href: '/browse', label: 'Filter' }}
          className="lg:col-span-3"
          footnote="A dataset in two domains counts in both."
        >
          <ul className="space-y-4">
            {readiness.map((entry) => (
              <li key={entry.domain}>
                <div className="mb-1.5 flex items-baseline justify-between gap-3">
                  <Link
                    href={`/browse?domain=${entry.domain}`}
                    className="text-sm font-medium text-slate-800 transition hover:text-teal-800"
                  >
                    {DOMAIN_LABELS[entry.domain] ?? entry.domain}
                  </Link>
                  <span className="text-xs tabular-nums text-slate-500">
                    <span className="font-semibold text-slate-900">{entry.ready}</span> of{' '}
                    {entry.total} ready
                  </span>
                </div>
                <div className="flex w-full gap-[2px] overflow-hidden rounded-full">
                  {[
                    { value: entry.ready, color: QUALITY_COLORS['analysis-ready'] },
                    { value: entry.cleaned, color: QUALITY_COLORS.cleaned },
                    { value: entry.raw, color: QUALITY_COLORS.raw },
                  ]
                    .filter((part) => part.value > 0)
                    .map((part) => (
                      <span
                        key={part.color}
                        className="h-2.5 first:rounded-l-full last:rounded-r-full"
                        style={{
                          width: `${(part.value / entry.total) * 100}%`,
                          backgroundColor: part.color,
                        }}
                      />
                    ))}
                </div>
              </li>
            ))}
          </ul>

          <div className="mt-5 border-t border-slate-100 pt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
              The catalogue as a whole
            </p>
            <Meter
              segments={[
                { label: 'Analysis-ready', value: stats.analysisReady, color: QUALITY_COLORS['analysis-ready'] },
                { label: 'Cleaned', value: cleaned, color: QUALITY_COLORS.cleaned },
                { label: 'Raw', value: raw, color: QUALITY_COLORS.raw },
              ]}
            />
          </div>
        </Panel>

        <Panel
          eyebrow="The work ahead"
          title="What stands between raw and usable"
          description="Known-issue notes, by the kind of work each implies."
          className="lg:col-span-2"
          footnote="An issue naming two problems counts twice."
        >
          <ul className="space-y-3">
            {issues.themes.map((theme) => (
              <li key={theme.label}>
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm text-slate-800">{theme.label}</span>
                  <span className="text-xs tabular-nums text-slate-500">
                    <span className="font-semibold text-slate-900">{theme.count}</span> in{' '}
                    {theme.sources} records
                  </span>
                </div>
                <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-amber-600"
                    style={{ width: `${(theme.count / (issueLeader?.count ?? 1)) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">{theme.hint}</p>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-5">
        <Panel
          eyebrow="Time"
          title="What can be studied, and when"
          description="Datasets covering each year, teal where all five domains are present. Click a year."
          action={{ href: '/timeline', label: 'Full timeline' }}
          className="lg:col-span-3"
          footnote={
            timeline.bestOverlap
              ? `${timeline.bestOverlap.from}-${timeline.bestOverlap.to} is the longest run with all five domains present.`
              : undefined
          }
        >
          <YearStrip years={timeline.years} height="h-44" />
        </Panel>

        <Panel
          eyebrow="Space"
          title="Where the work went"
          description="Deeper water, more records reaching it."
          action={{ href: '/map', label: 'Open the map' }}
          className="lg:col-span-2"
          footnote={
            thin
              ? `Thinnest: ${thin.from.toFixed(1)}-${thin.to.toFixed(1)}°N, reached by ${thin.count} against ${gradient.max} at the widest.`
              : undefined
          }
        >
          <BasinMap sources={sources} />
        </Panel>
      </div>

      <Panel
        eyebrow="Provenance"
        title="Most recently verified"
        description="Checked most recently against their files."
        action={{ href: '/browse', label: 'All datasets' }}
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {spotlight.map((source) => (
            <SourceCard key={source.id} source={source} />
          ))}
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {EXPLORE.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group rounded-2xl bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_-20px_rgba(15,23,42,0.35)] ring-1 ring-slate-200/80 transition hover:-translate-y-0.5 hover:ring-teal-300"
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
