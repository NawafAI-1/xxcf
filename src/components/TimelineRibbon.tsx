'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Currency, Timeline, TimelineRow } from '@/lib/timeline';
import type { Domain, Frequency } from '@/lib/types';
import Panel from './Panel';
import Figure from './Figure';
import YearStrip from './YearStrip';
import { DOMAIN_COLORS } from '@/lib/types';

const DOMAIN_LABELS: Record<string, string> = {
  environmental: 'Environmental',
  ecological: 'Ecological',
  production: 'Production',
  'nutrition-health': 'Nutrition & health',
  'socio-economic': 'Socio-economic',
};

/**
 * How often a record is added to, as a one-letter badge. A daily satellite
 * series and a single survey draw the same bar otherwise, which is the one
 * thing a reader most needs to tell apart before planning around either.
 */
const FREQUENCY_BADGE: Record<Frequency, { short: string; label: string }> = {
  daily: { short: 'D', label: 'Daily' },
  monthly: { short: 'M', label: 'Monthly' },
  annual: { short: 'A', label: 'Annual' },
  irregular: { short: 'I', label: 'Irregular' },
  once: { short: '1', label: 'Collected once' },
};

const CURRENCY_LABELS: Record<Currency, string> = {
  current: 'Still current',
  lagging: 'Falling behind',
  stale: 'Gone quiet',
};

type Lens = 'all' | Currency;

const LENSES: { key: Lens; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'current', label: 'Still current' },
  { key: 'lagging', label: 'Falling behind' },
  { key: 'stale', label: 'Gone quiet' },
];

/** Decade ticks across the full span, for the axis and the gridlines. */
function decades(min: number, max: number): number[] {
  const ticks: number[] = [];
  for (let year = Math.ceil(min / 10) * 10; year <= max; year += 10) ticks.push(year);
  return ticks;
}

export default function TimelineRibbon({ timeline }: { timeline: Timeline }) {
  const { minYear, maxYear, groups, years, bestOverlap, now, currencyCounts, peakYear, firstComplete } =
    timeline;
  const [lens, setLens] = useState<Lens>('all');
  const [domainFilter, setDomainFilter] = useState<Domain | null>(null);

  const span = maxYear - minYear + 1;
  const ticks = decades(minYear, maxYear);
  const behind = currencyCounts.lagging + currencyCounts.stale;

  const visible = useMemo(
    () =>
      groups
        .filter((group) => domainFilter === null || group.domain === domainFilter)
        .map((group) => ({
          ...group,
          rows: group.rows.filter((row) => lens === 'all' || row.currency === lens),
        }))
        .filter((group) => group.rows.length > 0),
    [groups, lens, domainFilter]
  );

  // A record in two domains draws a bar in each group, so the count of bars
  // is not the count of records. The heading states records.
  const shown = new Set(visible.flatMap((g) => g.rows.map((r) => r.id))).size;
  const bars = visible.reduce((sum, g) => sum + g.rows.length, 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Figure
          label="All five domains"
          value={bestOverlap ? `${bestOverlap.from}-${bestOverlap.to}` : 'never'}
          hint="Longest run with every domain present."
          accent="#0369a1"
        />
        <Figure
          label="Busiest year"
          value={String(peakYear.year)}
          hint={`${peakYear.datasets} records cover it.`}
          href={`/browse?year=${peakYear.year}`}
          accent="#0f766e"
        />
        <Figure
          label="Still current"
          value={String(currencyCounts.current)}
          hint={`Coverage reaches ${now - 1} or later.`}
          accent="#0284c7"
        />
        <Figure
          label="Not current"
          value={String(behind)}
          hint={`${currencyCounts.lagging} falling behind, ${currencyCounts.stale} gone quiet.`}
          accent="#b45309"
        />
      </div>

      <Panel
        eyebrow="Coverage"
        title="Datasets in play, year by year"
        description="Datasets covering each year, teal where all five domains are present. Click a year."
      >
        <YearStrip years={years} />
      </Panel>

      <Panel
        eyebrow="Every dataset, end to end"
        title={shown === 43 ? 'All 43 records' : `${shown} of 43 records`}
        description={`${bars} bars, first year to last. Solid is analysis-ready.`}
        footnote="Triangle: collecting. Hollow square: stopped 5+ years ago. D daily, M monthly, A annual, I irregular, 1 once."
      >
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex overflow-hidden rounded-lg ring-1 ring-inset ring-slate-200">
            {LENSES.map((option) => (
              <button
                key={option.key}
                type="button"
                onClick={() => setLens(option.key)}
                className={`px-2.5 py-1 text-xs font-medium transition ${
                  lens === option.key
                    ? 'bg-slate-800 text-white'
                    : 'bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {option.label}
                {option.key !== 'all' ? (
                  <span className="ml-1.5 tabular-nums opacity-70">{currencyCounts[option.key]}</span>
                ) : null}
              </button>
            ))}
          </div>

          <ul className="flex flex-wrap gap-x-3 gap-y-1">
            {groups.map((group) => {
              const on = domainFilter === group.domain;
              return (
                <li key={group.domain}>
                  <button
                    type="button"
                    onClick={() => setDomainFilter(on ? null : group.domain)}
                    className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs transition ${
                      on ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-[2px]"
                      style={{ backgroundColor: DOMAIN_COLORS[group.domain] }}
                      aria-hidden
                    />
                    {DOMAIN_LABELS[group.domain] ?? group.domain}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {shown === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-300 p-8 text-center text-sm text-slate-500">
            No record matches this combination.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[60rem]">
              <Axis minYear={minYear} span={span} ticks={ticks} />

              {visible.map((group) => (
                <div key={group.domain} className="mb-5 last:mb-0">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    {DOMAIN_LABELS[group.domain] ?? group.domain}
                    <span className="ml-2 font-normal tracking-normal">
                      {group.rows.length} dataset{group.rows.length === 1 ? '' : 's'}
                    </span>
                  </p>

                  <ul>
                    {group.rows.map((row) => (
                      <Row
                        key={`${group.domain}-${row.id}`}
                        row={row}
                        domain={group.domain}
                        minYear={minYear}
                        maxYear={maxYear}
                        span={span}
                        ticks={ticks}
                        now={now}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}

/** The decade scale, sharing the row layout so the ticks line up with the bars. */
function Axis({ minYear, span, ticks }: { minYear: number; span: number; ticks: number[] }) {
  return (
    <div className="mb-2 flex items-end gap-3 border-b border-slate-200 pb-1">
      <span className="w-72 shrink-0" />
      <span className="w-20 shrink-0 text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-400">
        Covers
      </span>
      <span className="w-5 shrink-0" />
      <div className="relative h-4 flex-1">
        {ticks.map((year) => (
          <span
            key={year}
            className="absolute -translate-x-1/2 text-xs tabular-nums text-slate-500"
            style={{ left: `${((year - minYear) / span) * 100}%` }}
          >
            {year}
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * One record. The period rides in its own column rather than beside its bar:
 * a bar reaching the right edge used to push its label back over the title.
 */
function Row({
  row,
  domain,
  minYear,
  maxYear,
  span,
  ticks,
  now,
}: {
  row: TimelineRow;
  domain: Domain;
  minYear: number;
  maxYear: number;
  span: number;
  ticks: number[];
  now: number;
}) {
  const left = ((row.start - minYear) / span) * 100;
  const right = ((row.end + 1 - minYear) / span) * 100;
  const colour = DOMAIN_COLORS[domain];
  const badge = FREQUENCY_BADGE[row.frequency];
  const live = row.currency === 'current' && row.ongoing;

  return (
    <li>
      <Link
        href={`/sources/${row.id}`}
        className="group flex items-center gap-3 rounded-md py-1 transition hover:bg-slate-50"
      >
        <span
          className="w-72 shrink-0 truncate text-[11px] leading-4 text-slate-700 group-hover:text-teal-800"
          title={row.title}
        >
          {row.title}
        </span>

        <span
          className={`w-20 shrink-0 text-[10px] tabular-nums ${
            row.currency === 'current' ? 'text-slate-500' : 'text-amber-700'
          }`}
          title={
            row.currency === 'current'
              ? `${CURRENCY_LABELS[row.currency]}`
              : `${CURRENCY_LABELS[row.currency]}: ${row.yearsBehind} years behind ${now}`
          }
        >
          {row.start === row.end ? row.start : `${row.start}-${row.end}`}
        </span>

        <span
          className="flex h-4 w-5 shrink-0 items-center justify-center rounded-[3px] bg-slate-100 text-[9px] font-semibold text-slate-500"
          title={`${badge.label} updates`}
        >
          {badge.short}
        </span>

        <span className="relative h-5 flex-1">
          {ticks.map((year) => (
            <span
              key={year}
              aria-hidden
              className="absolute top-0 h-full w-px bg-slate-100"
              style={{ left: `${((year - minYear) / span) * 100}%` }}
            />
          ))}
          <span
            aria-hidden
            className="absolute top-0 h-full w-px bg-slate-200"
            style={{ left: `${((maxYear - minYear) / span) * 100}%` }}
          />
          <span
            className={`absolute top-1 h-3 transition group-hover:brightness-110 ${
              live ? 'rounded-l-[3px]' : 'rounded-[3px]'
            }`}
            style={{
              left: `${left}%`,
              width: `${Math.max(right - left, 0.6)}%`,
              backgroundColor: colour,
              opacity: row.status === 'analysis-ready' ? 1 : 0.5,
            }}
            title={`${row.title}: ${row.start}-${row.end}, ${row.status.replace('-', ' ')}, ${badge.label.toLowerCase()}`}
          />
          {live ? (
            <span
              aria-hidden
              className="absolute top-[7px] text-[9px] leading-none"
              style={{ left: `calc(${right}% + 1px)`, color: colour }}
            >
              &#9654;
            </span>
          ) : null}
          {row.currency === 'stale' ? (
            <span
              aria-hidden
              title={`Coverage stopped ${row.yearsBehind} years ago`}
              className="absolute top-[7px] h-[7px] w-[7px] rounded-[1px] border border-amber-600 bg-white"
              style={{ left: `calc(${right}% + 2px)` }}
            />
          ) : null}
        </span>
      </Link>
    </li>
  );
}
