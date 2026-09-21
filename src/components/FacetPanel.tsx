'use client';

import { DOMAINS, SUBBASINS, ACCESS_TIERS, QUALITY_STATUSES } from '@/lib/types';
import type { Domain, Subbasin, AccessTier, QualityStatus } from '@/lib/types';

export interface Facets {
  domain: Domain[];
  subbasin: Subbasin[];
  access: AccessTier[];
  quality: QualityStatus[];
  /**
   * Exact theme names, matched the way the coverage matrix matches them. Set by
   * links rather than by a checkbox list: there are over a hundred themes, and
   * a panel listing them all would bury the four facets that do belong there.
   */
  theme: string[];
  /** A single year, arriving from the timeline: records covering it. */
  year: string[];
  /**
   * Exact record ids, arriving from a map cluster. A cluster knows precisely
   * which datasets sit on its spot, so it hands them over by name rather than
   * guessing at a subbasin that only some of them share.
   */
  id: string[];
}

export const EMPTY_FACETS: Facets = {
  domain: [],
  subbasin: [],
  access: [],
  quality: [],
  theme: [],
  year: [],
  id: [],
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function Group<T extends string>({
  title,
  options,
  selected,
  onChange,
}: {
  title: string;
  options: T[];
  selected: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="mb-5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
      <ul className="space-y-1">
        {options.map((opt) => (
          <li key={opt}>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={() => onChange(toggle(selected, opt))}
                className="rounded border-slate-300"
              />
              <span className="capitalize">{opt.replace('-', ' ')}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function FacetPanel({
  facets,
  onChange,
}: {
  facets: Facets;
  onChange: (facets: Facets) => void;
}) {
  return (
    <aside className="w-56 shrink-0">
      <Group
        title="Domain"
        options={DOMAINS}
        selected={facets.domain}
        onChange={(domain) => onChange({ ...facets, domain })}
      />
      <Group
        title="Subbasin"
        options={SUBBASINS}
        selected={facets.subbasin}
        onChange={(subbasin) => onChange({ ...facets, subbasin })}
      />
      <Group
        title="Access Tier"
        options={ACCESS_TIERS}
        selected={facets.access}
        onChange={(access) => onChange({ ...facets, access })}
      />
      <Group
        title="Quality Status"
        options={QUALITY_STATUSES}
        selected={facets.quality}
        onChange={(quality) => onChange({ ...facets, quality })}
      />
      {(facets.domain.length ||
        facets.subbasin.length ||
        facets.access.length ||
        facets.quality.length ||
        facets.theme.length ||
        facets.year.length) > 0 && (
        <button
          onClick={() => onChange(EMPTY_FACETS)}
          className="text-xs font-medium text-blue-600 hover:underline"
        >
          Clear all filters
        </button>
      )}
    </aside>
  );
}
