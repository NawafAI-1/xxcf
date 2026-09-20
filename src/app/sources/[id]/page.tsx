import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getAllSources, getSourceById, getRelatedSources } from '@/lib/sources';
import { parseSize, formatBytes } from '@/lib/stats';
import { type BBox, bboxExtentLabel, isGlobalScale } from '@/lib/spatial';
import { DOMAIN_COLORS } from '@/lib/types';
import type { Source } from '@/lib/types';
import MiniMapClient from './MiniMapClient';
import CopyButton from '@/components/CopyButton';

export function generateStaticParams() {
  return getAllSources().map((s) => ({ id: s.id }));
}

const ACCESS_LABELS: Record<Source['access']['tier'], string> = {
  public: 'Public',
  'kaust-internal': 'KAUST internal',
  restricted: 'Restricted',
  embargoed: 'Embargoed',
};

// And these mirror ACCESS_COLORS: cyan open, slate internal, amber on request.
const ACCESS_STYLES: Record<Source['access']['tier'], string> = {
  public: 'bg-cyan-100 text-cyan-900 ring-cyan-200',
  'kaust-internal': 'bg-slate-200 text-slate-700 ring-slate-300',
  restricted: 'bg-amber-100 text-amber-900 ring-amber-200',
  embargoed: 'bg-rose-100 text-rose-900 ring-rose-200',
};

// Badge tints mirror QUALITY_COLORS: teal usable, amber part-way, slate raw.
const STATUS_STYLES: Record<Source['quality']['status'], string> = {
  'analysis-ready': 'bg-teal-100 text-teal-900 ring-teal-200',
  cleaned: 'bg-amber-100 text-amber-900 ring-amber-200',
  raw: 'bg-slate-200 text-slate-700 ring-slate-300',
  deprecated: 'bg-slate-100 text-slate-500 ring-slate-200',
};

const STATUS_HINTS: Record<Source['quality']['status'], string> = {
  'analysis-ready': 'usable as it stands',
  cleaned: 'processed, still needs checks',
  raw: 'needs processing before analysis',
  deprecated: 'superseded; check before using',
};

function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>
      {title ? (
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  // A long value ("15 arc-second (~450 m)") set at the headline size wraps to
  // three lines and stretches every tile in the row; step it down instead.
  const size = value.length > 16 ? 'text-sm' : 'text-lg';
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className={`mt-1 font-semibold leading-snug text-slate-900 ${size}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
    </div>
  );
}

/** Trimmed value, or null when the record genuinely has nothing recorded. */
function value(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  return trimmed ? trimmed : null;
}

function NotRecorded({ what }: { what: string }) {
  return <span className="text-slate-400">No {what} recorded</span>;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-slate-100 py-2.5 first:border-0 first:pt-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="mt-1 break-words text-sm leading-relaxed text-slate-800">{children}</dd>
    </div>
  );
}

export default async function SourceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = getSourceById(id);
  if (!source) notFound();

  const allSources = getAllSources();
  const lineageSources = source.provenance.derived_from
    .map((parentId) => allSources.find((s) => s.id === parentId))
    .filter((s): s is Source => Boolean(s));
  const related = getRelatedSources(source, 4);

  const accent = DOMAIN_COLORS[source.domain[0]];
  const bbox = source.spatial.bbox as BBox;
  const global = isGlobalScale(bbox);

  const variableCount = source.resources.reduce((n, r) => n + (r.variables?.length ?? 0), 0);
  const rowCount = source.resources.reduce((n, r) => n + (r.n_rows ?? 0), 0);
  const sizedBytes = source.resources.reduce((n, r) => n + (parseSize(r.size) ?? 0), 0);
  const unsized = source.resources.filter((r) => parseSize(r.size) === null).length;

  const citation = value(source.provenance.citation);
  const license = value(source.provenance.license);
  const doi = value(source.provenance.doi);
  const sourceUrl = value(source.provenance.source_url);

  const period = `${source.temporal.start}-${source.temporal.ongoing ? 'present' : source.temporal.end}`;
  const mailto = source.access.steward.email
    ? `mailto:${source.access.steward.email}?subject=${encodeURIComponent(`Data request: ${source.title}`)}`
    : null;

  return (
    <div className="space-y-6">
      <nav className="text-sm text-slate-500">
        <Link href="/browse" className="font-medium text-teal-700 hover:text-teal-800">
          ← All datasets
        </Link>
      </nav>

      {/* Header: what it is, who may use it, and how ready it is — before any detail. */}
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="h-1.5 w-full" style={{ backgroundColor: accent }} aria-hidden />
        <div className="p-6 sm:p-8">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {source.domain.map((d) => (
              <span
                key={d}
                className="rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                style={{ backgroundColor: DOMAIN_COLORS[d] }}
              >
                {d.replace('-', ' ')}
              </span>
            ))}
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${ACCESS_STYLES[source.access.tier]}`}
            >
              {ACCESS_LABELS[source.access.tier]}
            </span>
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium capitalize ring-1 ring-inset ${STATUS_STYLES[source.quality.status]}`}
            >
              {source.quality.status.replace('-', ' ')}
            </span>
          </div>

          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-slate-900 sm:text-3xl">
            {source.title}
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-600 sm:text-base">
            {source.abstract}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-800"
              >
                Visit source ↗
              </a>
            ) : null}
            {mailto ? (
              <a
                href={mailto}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:border-slate-400 hover:text-slate-900"
              >
                Email steward
              </a>
            ) : null}
            {citation ? (
              <CopyButton value={citation} label="Copy citation" className="px-3 py-1.5" />
            ) : null}
            <span className="ml-auto font-mono text-xs text-slate-400">{source.id}</span>
          </div>
        </div>
      </header>

      {/* The six numbers that decide whether this dataset fits a piece of work. */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
        <Fact label="Coverage" value={period} hint={source.temporal.ongoing ? 'still collecting' : 'closed series'} />
        <Fact label="Frequency" value={source.temporal.frequency} hint="how often it updates" />
        <Fact label="Resolution" value={source.spatial.resolution || 'Not recorded'} hint="spatial grain" />
        <Fact
          label="Extent"
          value={global ? 'Global' : bboxExtentLabel(bbox)}
          hint={`${source.spatial.subbasins.length} of 5 subbasins`}
        />
        <Fact
          label="Files"
          value={`${source.resources.length}`}
          hint={sizedBytes > 0 ? `${formatBytes(sizedBytes)}${unsized ? ' + collection' : ''}` : 'size not recorded'}
        />
        <Fact
          label="Variables"
          value={`${variableCount}`}
          hint={rowCount > 0 ? `${rowCount.toLocaleString('en-US')} records` : 'documented fields'}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card
            title="Where it reaches"
            action={
              <Link href="/map" className="text-sm font-medium text-teal-700 hover:text-teal-800">
                Compare on the basin map →
              </Link>
            }
          >
            <MiniMapClient bbox={bbox} color={accent} />
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {source.spatial.subbasins.map((b) => (
                <Link
                  key={b}
                  href={`/browse?subbasin=${b}`}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium capitalize text-slate-700 transition hover:bg-slate-200"
                >
                  {b.replace(/-/g, ' ')}
                </Link>
              ))}
              <span className="ml-auto font-mono text-xs text-slate-400">
                bbox [{bbox.join(', ')}]
              </span>
            </div>
          </Card>

          <Card title="Files">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                    <th className="pb-2 pr-3 font-medium">Name</th>
                    <th className="pb-2 pr-3 font-medium">Format</th>
                    <th className="pb-2 pr-3 font-medium">Size</th>
                    <th className="pb-2 pr-3 text-right font-medium">Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {source.resources.map((r) => (
                    <tr key={r.name} className="border-b border-slate-100 align-top last:border-0">
                      <td className="py-3 pr-3">
                        <p className="font-medium text-slate-900">{r.name}</p>
                        <p className="mt-1 flex items-start gap-2">
                          <code className="break-all font-mono text-xs text-slate-500">{r.path}</code>
                          <CopyButton value={r.path} label="Copy path" className="shrink-0" />
                        </p>
                      </td>
                      <td className="py-3 pr-3 text-slate-700">{r.format}</td>
                      <td className="py-3 pr-3 text-slate-700">{r.size}</td>
                      <td className="py-3 pr-3 text-right tabular-nums text-slate-700">
                        {r.n_rows ? r.n_rows.toLocaleString('en-US') : 'n/a'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {variableCount > 0 ? (
            <Card title="Variable dictionary">
              <div className="space-y-5">
                {source.resources
                  .filter((r) => r.variables?.length)
                  .map((r) => (
                    <div key={r.name}>
                      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                        {r.name}
                      </p>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <tbody>
                            {r.variables.map((v) => (
                              <tr key={v.name} className="border-b border-slate-100 align-top last:border-0">
                                <td className="w-48 py-3 pr-3">
                                  <code className="font-mono text-xs font-semibold text-slate-900">
                                    {v.name}
                                  </code>
                                  <p className="mt-0.5 text-xs text-slate-500">
                                    {v.type}
                                    {v.unit ? ` · ${v.unit}` : ''}
                                  </p>
                                </td>
                                <td className="py-3 pr-3 text-slate-600">
                                  {v.description}
                                  {v.maps_to.length ? (
                                    <span className="mt-1.5 flex flex-wrap gap-1">
                                      {v.maps_to.map((m) => (
                                        <span
                                          key={m}
                                          className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600"
                                        >
                                          {m}
                                        </span>
                                      ))}
                                    </span>
                                  ) : null}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ))}
              </div>
            </Card>
          ) : null}

          {(lineageSources.length > 0 || related.length > 0) && (
            <Card title="Connected datasets">
              {lineageSources.length > 0 && (
                <div className="mb-4">
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Derived from
                  </p>
                  <ul className="space-y-1.5">
                    {lineageSources.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/sources/${s.id}`}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 transition hover:bg-slate-50"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: DOMAIN_COLORS[s.domain[0]] }}
                          />
                          {s.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {related.length > 0 && (
                <div>
                  <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Shares themes with
                  </p>
                  <ul className="space-y-1.5">
                    {related.map((s) => (
                      <li key={s.id}>
                        <Link
                          href={`/sources/${s.id}`}
                          className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-800 transition hover:bg-slate-50"
                        >
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: DOMAIN_COLORS[s.domain[0]] }}
                          />
                          {s.title}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>

        {/* Sidebar: the questions asked right before someone commits to using it. */}
        <div className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          <Card title="Getting access">
            <dl>
              <Row label="Tier">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${ACCESS_STYLES[source.access.tier]}`}
                >
                  {ACCESS_LABELS[source.access.tier]}
                </span>
              </Row>
              <Row label="Steward">
                {source.access.steward.name}
                {source.access.steward.email ? (
                  <>
                    {' '}
                    <a href={mailto ?? '#'} className="text-teal-700 hover:text-teal-800">
                      {source.access.steward.email}
                    </a>
                  </>
                ) : (
                  <span className="text-slate-400"> (no contact recorded)</span>
                )}
              </Row>
              <Row label="How to request">{source.access.how_to_request}</Row>
            </dl>
          </Card>

          <Card title="Readiness">
            <dl>
              <Row label="Processing state">
                <span className="capitalize">{source.quality.status.replace('-', ' ')}</span>
                <span className="text-slate-500"> ({STATUS_HINTS[source.quality.status]})</span>
              </Row>
              <Row label="Last verified">{source.quality.last_verified}</Row>
            </dl>
            {source.quality.known_issues.length > 0 ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
                  Known issues ({source.quality.known_issues.length})
                </p>
                <ul className="mt-2 space-y-1.5 text-sm leading-relaxed text-amber-900">
                  {source.quality.known_issues.map((issue) => (
                    <li key={issue} className="flex gap-2">
                      <span aria-hidden className="text-amber-500">
                        •
                      </span>
                      <span>{issue}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-500">No known issues recorded.</p>
            )}
          </Card>

          <Card title="Provenance">
            <dl>
              <Row label="Originator">{source.provenance.originator}</Row>
              <Row label="Licence">{license ?? <NotRecorded what="licence" />}</Row>
              <Row label="DOI">
                {doi ? (
                  <a
                    href={`https://doi.org/${doi.replace(/^https?:\/\/doi\.org\//, '')}`}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-teal-700 hover:text-teal-800"
                  >
                    {doi}
                  </a>
                ) : (
                  <NotRecorded what="DOI" />
                )}
              </Row>
              <Row label="Citation">
                {citation ? (
                  <>
                    <span className="block">{citation}</span>
                    <CopyButton value={citation} className="mt-2" />
                  </>
                ) : (
                  <NotRecorded what="citation" />
                )}
              </Row>
            </dl>
          </Card>

          {(source.themes.length > 0 || source.keywords.length > 0) && (
            <Card title="Themes & keywords">
              <div className="flex flex-wrap gap-1.5">
                {source.themes.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                  >
                    {t}
                  </span>
                ))}
                {source.keywords.map((k) => (
                  <span key={k} className="rounded-full px-2.5 py-1 text-xs text-slate-500 ring-1 ring-slate-200">
                    {k}
                  </span>
                ))}
              </div>
            </Card>
          )}

          {source.used_in.length > 0 && (
            <Card title="Used in">
              <ul className="space-y-1.5 text-sm text-slate-700">
                {source.used_in.map((u) => (
                  <li key={u}>{u}</li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
