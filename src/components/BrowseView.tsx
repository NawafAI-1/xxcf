'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Source, Domain, Subbasin, AccessTier, QualityStatus } from '@/lib/types';
import { DOMAINS, SUBBASINS, ACCESS_TIERS, QUALITY_STATUSES } from '@/lib/types';
import SearchBar from './SearchBar';
import FacetPanel, { EMPTY_FACETS, type Facets } from './FacetPanel';
import SourceCard from './SourceCard';

type FacetKey = keyof Facets;

const FACET_LABELS: Record<FacetKey, string> = {
  domain: 'Domain',
  subbasin: 'Subbasin',
  access: 'Access',
  quality: 'Status',
};

/**
 * Reads facet selections out of the query string (?domain=ecological&access=public,
 * repeated or comma-separated) so the overview page can link straight into a
 * filtered view. Done from `location.search` rather than `useSearchParams` so the
 * statically exported page needs no Suspense boundary or client-side router state.
 */
function facetsFromLocation(): Facets {
  if (typeof window === 'undefined') return EMPTY_FACETS;
  const params = new URLSearchParams(window.location.search);

  const pick = <T extends string>(key: string, allowed: readonly T[]): T[] => {
    const raw = params.getAll(key).flatMap((v) => v.split(','));
    return raw.map((v) => v.trim()).filter((v): v is T => (allowed as readonly string[]).includes(v));
  };

  return {
    domain: pick<Domain>('domain', DOMAINS),
    subbasin: pick<Subbasin>('subbasin', SUBBASINS),
    access: pick<AccessTier>('access', ACCESS_TIERS),
    quality: pick<QualityStatus>('quality', QUALITY_STATUSES),
  };
}

export default function BrowseView({ sources }: { sources: Source[] }) {
  const [facets, setFacets] = useState<Facets>(EMPTY_FACETS);
  const [searchIds, setSearchIds] = useState<string[] | null>(null);

  // Applied after mount: the export is prerendered without a query string, so
  // seeding state directly from the URL would mismatch the server HTML.
  useEffect(() => {
    setFacets(facetsFromLocation());
  }, []);

  const filtered = useMemo(() => {
    let result = sources;

    if (facets.domain.length) {
      result = result.filter((s) => s.domain.some((d) => facets.domain.includes(d)));
    }
    if (facets.subbasin.length) {
      result = result.filter((s) => s.spatial.subbasins.some((sb) => facets.subbasin.includes(sb)));
    }
    if (facets.access.length) {
      result = result.filter((s) => facets.access.includes(s.access.tier));
    }
    if (facets.quality.length) {
      result = result.filter((s) => facets.quality.includes(s.quality.status));
    }

    if (searchIds) {
      const rank = new Map(searchIds.map((id, i) => [id, i]));
      result = result.filter((s) => rank.has(s.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
    }

    return result;
  }, [sources, facets, searchIds]);

  const activeChips = (Object.keys(FACET_LABELS) as FacetKey[]).flatMap((key) =>
    facets[key].map((value) => ({ key, value: value as string }))
  );

  function removeChip(key: FacetKey, value: string) {
    setFacets({ ...facets, [key]: (facets[key] as string[]).filter((v) => v !== value) } as Facets);
  }

  return (
    <div>
      <div className="mb-6">
        <SearchBar onResults={setSearchIds} />
      </div>
      <div className="flex flex-col gap-8 md:flex-row">
        <FacetPanel facets={facets} onChange={setFacets} />
        <div className="flex-1">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-900">{filtered.length}</span>{' '}
              dataset{filtered.length === 1 ? '' : 's'}
              {filtered.length !== sources.length ? (
                <span className="text-slate-500"> of {sources.length}</span>
              ) : null}
              {searchIds ? <span className="text-slate-500"> · ranked by relevance</span> : null}
            </p>
            {activeChips.map((chip) => (
              <button
                key={`${chip.key}-${chip.value}`}
                onClick={() => removeChip(chip.key, chip.value)}
                className="group flex items-center gap-1 rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700 transition hover:bg-slate-300"
                title={`Remove ${FACET_LABELS[chip.key].toLowerCase()} filter`}
              >
                <span className="capitalize">{chip.value.replace(/-/g, ' ')}</span>
                <span aria-hidden className="text-slate-500 group-hover:text-slate-700">
                  &times;
                </span>
              </button>
            ))}
          </div>
          {filtered.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
              <p className="text-sm font-medium text-slate-700">Nothing matches these filters.</p>
              <p className="mt-1 text-sm text-slate-500">
                Try clearing a facet, or search for a theme instead. That gap may itself be worth
                reporting.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {filtered.map((source) => (
                <SourceCard key={source.id} source={source} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
