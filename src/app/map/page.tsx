import Link from 'next/link';
import { getAllSources } from '@/lib/sources';
import { latitudeProfile, profileExtremes, thinStretch } from '@/lib/basin';
import { siteMentions } from '@/lib/sites';
import { type BBox, isGlobalScale } from '@/lib/spatial';
import { DOMAIN_COLORS } from '@/lib/types';
import BasinMap from '@/components/BasinMap';
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
  // Regional records centred beyond the frame: real places, just not this sea.
  const offFrame = local.filter((s) => {
    const [w, south, e, north] = s.spatial.bbox as BBox;
    const lon = (w + e) / 2;
    const lat = (south + north) / 2;
    return lon < 31.5 || lon > 45.5 || lat < 10.5 || lat > 30.5;
  });
  const global = sources.filter((s) => s.spatial.bbox && isGlobalScale(s.spatial.bbox as BBox));
  const profile = latitudeProfile(sources);
  const { max, min } = profileExtremes(profile);
  const widest = profile.find((b) => b.count === max);
  const thinnest = profile.find((b) => b.count === min);
  const thin = thinStretch(sources);
  const sites = siteMentions(sources);

  return (
    <div className="space-y-6">
      <PageHeader
        accent={sectionAccent('/map')}
        title="Where the data is"
        description="Where the catalogue's work actually sits, from the Gulf of Aqaba down to Bab el-Mandeb. Each circle is a location that holds data, sized and numbered by how much; hover to see what is there, click to open it."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[32rem_1fr]">
        <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900">
              {local.length - offFrame.length} datasets on the basin
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

          <BasinMap sources={sources} />

          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            Coastline from Natural Earth, drawn straight into the page: no tiles, no key, and
            nothing fetched while you read it. A numbered circle is that many datasets centred on
            the same spot; click it to see them, or click a single one to open it.
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

          {thin && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Where to look next</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                The stretch from {thin.from.toFixed(1)}&deg;N to {thin.to.toFixed(1)}&deg;N is the
                least observed in the basin, with {thin.count} datasets reaching it. These records
                sit closest to that water, so extending a survey or subsetting a wider product is
                the cheapest way to cover it.
              </p>

              {thin.nearby.length > 0 && (
                <>
                  <p className="mt-4 text-xs font-medium uppercase tracking-wide text-slate-500">
                    Stops just short of it
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {thin.nearby.slice(0, 5).map((s) => (
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
                </>
              )}

              <p className="mt-4 text-xs leading-relaxed text-slate-500">
                A prioritisation aid, not a prediction. Whether any of these actually transfer to
                that water is a question for the people who made them.
              </p>
            </section>
          )}

          {sites.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">Field sites named in the records</h2>
              <p className="mt-1 text-sm text-slate-600">
                Marked on the map. A place appears only because a record names it in its own words,
                not because of a region tag.
              </p>
              <ul className="mt-3 flex flex-wrap gap-1.5">
                {sites.map(({ site, sources: named }) => (
                  <li
                    key={site.name}
                    className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700"
                    title={named.map((s) => s.title).join('; ')}
                  >
                    {site.name}
                    <span className="ml-1 tabular-nums text-slate-500">{named.length}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {offFrame.length > 0 && (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-base font-semibold text-slate-900">
                {offFrame.length} centred outside the frame
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Regional records whose middle falls beyond this map: real places, just not this sea.
              </p>
              <ul className="mt-3 space-y-1.5">
                {offFrame.map((s) => (
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
