import Link from 'next/link';
import { getAllSources } from '@/lib/sources';
import { latitudeProfile, profileExtremes } from '@/lib/basin';
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
