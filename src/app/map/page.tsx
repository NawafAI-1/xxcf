import Link from 'next/link';
import { getAllSources } from '@/lib/sources';
import { latitudeProfile, profileExtremes, thinStretch } from '@/lib/basin';
import { siteMentions } from '@/lib/sites';
import { type BBox, isGlobalScale } from '@/lib/spatial';
import { DOMAIN_COLORS } from '@/lib/types';
import BasinMap from '@/components/BasinMap';
import PageHeader from '@/components/PageHeader';
import Panel from '@/components/Panel';
import { sectionAccent } from '@/lib/sections';
import type { Source } from '@/lib/types';

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

/** A dataset in a list, dotted with its domain colour. */
function SourceLine({ source }: { source: Source }) {
  return (
    <li>
      <Link
        href={`/sources/${source.id}`}
        className="flex items-start gap-2 text-sm leading-snug text-slate-700 transition hover:text-teal-800"
      >
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: DOMAIN_COLORS[source.domain[0]] }}
          aria-hidden
        />
        <span>{source.title}</span>
      </Link>
    </li>
  );
}

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
        description="Every location holding data, sized by how much, and where coverage thins."
      />

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <Panel
          title={`${local.length - offFrame.length} datasets on the basin`}
          footnote="A numbered circle opens exactly those records; its ring is the domains present. Bars at the left are datasets reaching each half degree of latitude. Natural Earth coastline, nothing fetched at runtime."
        >
          <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
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

          <BasinMap sources={sources} showCoverage />
        </Panel>

        <div className="space-y-4">
          <Panel eyebrow="The north-south gradient" title={`${max} datasets at the widest, ${min} at the thinnest`}>
            <p className="text-sm leading-relaxed text-slate-600">
              {max} datasets reach {widest ? `${widest.lat.toFixed(1)}°N` : 'the centre'}, {min} reach{' '}
              {thinnest ? `${thinnest.lat.toFixed(1)}°N` : 'the strait'}. The south is half as observed
              as the centre.
            </p>
          </Panel>

          {thin && (
            <Panel
              eyebrow="Where to look next"
              title={`${thin.from.toFixed(1)}°N to ${thin.to.toFixed(1)}°N`}
              description={`The basin's least observed stretch: ${thin.count} datasets reach it. These sit closest.`}
              footnote="A prioritisation aid, not a prediction."
            >
              {thin.nearby.length > 0 ? (
                <>
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
                    Stops just short of it
                  </p>
                  <ul className="space-y-1.5">
                    {thin.nearby.slice(0, 5).map((s) => (
                      <SourceLine key={s.id} source={s} />
                    ))}
                  </ul>
                </>
              ) : null}
            </Panel>
          )}
        </div>
      </div>

      {/* The three reference lists ran down the right column and left the map
          card stranded beside a column twice its height. They read better as a
          row of their own under the map. */}
      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {sites.length > 0 && (
          <Panel
            eyebrow="On the map"
            title="Field sites named in the records"
            description="Named in a record's own words, not from a region tag."
          >
            <ul className="flex flex-wrap gap-1.5">
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
          </Panel>
        )}

        {offFrame.length > 0 && (
          <Panel
            eyebrow="Off the frame"
            title={`${offFrame.length} centred elsewhere`}
            description="Real places, just not this sea."
          >
            <ul className="space-y-1.5">
              {offFrame.map((s) => (
                <SourceLine key={s.id} source={s} />
              ))}
            </ul>
          </Panel>
        )}

        {global.length > 0 && (
          <Panel
            eyebrow="No single place"
            title={`${global.length} global datasets`}
            description="They cover everywhere, so no point on the map is theirs."
          >
            <ul className="space-y-1.5">
              {global.map((s) => (
                <SourceLine key={s.id} source={s} />
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
