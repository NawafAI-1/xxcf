import Link from 'next/link';
import { getAllSources } from '@/lib/sources';
import { latitudeProfile, profileExtremes } from '@/lib/basin';
import { type BBox, isGlobalScale } from '@/lib/spatial';
import { DOMAIN_COLORS } from '@/lib/types';
import BasinRibbon from '@/components/BasinRibbon';
import PageHeader from '@/components/PageHeader';
import { sectionAccent } from '@/lib/sections';

export const metadata = {
  title: 'Where | Red Sea Marine Data Catalog',
  description: 'Where along the Red Sea each catalogued dataset reaches, and how observation thins toward the strait.',
};

const DOMAIN_LABELS: Record<string, string> = {
  environmental: 'Environmental',
  ecological: 'Ecological',
  production: 'Production',
  'nutrition-health': 'Nutrition & health',
  'socio-economic': 'Socio-economic',
};

export default function WherePage() {
  const sources = getAllSources();
  const local = sources.filter((s) => s.spatial.bbox && !isGlobalScale(s.spatial.bbox as BBox));
  const global = sources.filter((s) => s.spatial.bbox && isGlobalScale(s.spatial.bbox as BBox));
  const profile = latitudeProfile(sources);
  const { max, min } = profileExtremes(profile);
  const widest = profile.find((b) => b.count === max);
  const thinnest = profile.find((b) => b.count === min);

  return (
    <div className="space-y-6">
      <PageHeader
        accent={sectionAccent('/map')}
        title="Where the data is"
        description="The Red Sea runs 2,000 km along one axis and 300 km across it, so where a dataset reaches is very nearly a question of latitude. The basin is drawn here as a ribbon from the head of the Gulf of Aqaba down to the strait, shaded by how many datasets reach each half-degree. Every dot is a dataset at the middle of its reach; hover to name it, click to open it."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[32rem_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              {local.length} datasets along the basin
            </h2>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {Object.entries(DOMAIN_LABELS).map(([key, label]) => (
                <li key={key} className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: DOMAIN_COLORS[key as keyof typeof DOMAIN_COLORS] }}
                    aria-hidden
                  />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="pl-10">
            <BasinRibbon sources={sources} className="h-[34rem]" />
          </div>

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Schematic, not a chart of the coastline: the ribbon carries latitude and nothing else.
            Shading is the number of datasets reaching each half-degree band, taken from the
            records&rsquo; own bounding boxes.
          </p>
        </section>

        <div className="space-y-6">
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-slate-900">The north-south gradient</h2>
            <p className="mt-3 text-4xl font-semibold text-slate-900">
              {max}
              <span className="text-2xl text-slate-400"> / {min}</span>
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {max} datasets reach the basin around {widest ? `${widest.lat.toFixed(1)}°N` : 'the centre'},
              and {min} reach {thinnest ? `${thinnest.lat.toFixed(1)}°N` : 'the strait'}. The southern
              Red Sea is roughly half as observed as the centre, which is the clearest case in this
              catalogue for where to survey next.
            </p>
          </section>

          {global.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                {global.length} global datasets
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                These cover the basin because they cover everywhere, so they have no place on the
                ribbon.
              </p>
              <ul className="mt-3 space-y-1.5">
                {global.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={`/sources/${s.id}`}
                      className="flex items-start gap-2 text-sm text-slate-700 transition hover:text-teal-800"
                    >
                      <span
                        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
                        style={{ backgroundColor: DOMAIN_COLORS[s.domain[0]] }}
                        aria-hidden
                      />
                      <span>{s.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
