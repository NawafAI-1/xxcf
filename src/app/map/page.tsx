import Link from "next/link";
import { getAllSources } from "@/lib/sources";
import { latitudeProfile, profileExtremes, thinStretch } from "@/lib/basin";
import { siteMentions } from "@/lib/sites";
import { type BBox, isGlobalScale } from "@/lib/spatial";
import { DOMAIN_COLORS } from "@/lib/types";
import BasinMap from "@/components/BasinMap";
import { coverageColor } from "@/lib/coverage-depth";
import PageHeader from "@/components/PageHeader";
import Panel from "@/components/Panel";
import { sectionAccent } from "@/lib/sections";
import type { Source } from "@/lib/types";

export const metadata = {
  title: "Where | Red Sea Marine Data Catalog",
  description:
    "Where along the Red Sea each catalogued dataset reaches, and how observation thins toward the strait.",
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
  const local = sources.filter(
    (s) => s.spatial.bbox && !isGlobalScale(s.spatial.bbox as BBox),
  );
  // Regional records centred beyond the frame: real places, just not this sea.
  const offFrame = local.filter((s) => {
    const [w, south, e, north] = s.spatial.bbox as BBox;
    const lon = (w + e) / 2;
    const lat = (south + north) / 2;
    return lon < 31.5 || lon > 45.5 || lat < 10.5 || lat > 30.5;
  });
  // A record logged with a 0,0,0,0 extent (a lab culture) has nothing to draw.
  const mappable = local.filter((s) => {
    const [w, south, e, north] = s.spatial.bbox as BBox;
    return north > south || e > w;
  });
  const global = sources.filter(
    (s) => s.spatial.bbox && isGlobalScale(s.spatial.bbox as BBox),
  );
  const profile = latitudeProfile(sources);
  const { max, min } = profileExtremes(profile);
  const widest = profile.find((b) => b.count === max);
  const thinnest = profile.find((b) => b.count === min);
  const thin = thinStretch(sources);
  const sites = siteMentions(sources);

  return (
    <div className="space-y-6">
      <PageHeader
        accent={sectionAccent("/map")}
        title="Where the data is"
        description="What each dataset covers, and where the basin is least observed."
      />

      <Panel
        title={`${mappable.length} datasets over the basin`}
        footnote="The water is shaded by how many records state an extent covering it. Natural Earth coastline, nothing fetched at runtime."
      >
        <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-600">
          <span className="flex items-center gap-2">
            Few records here
            <span className="flex overflow-hidden rounded-[3px] ring-1 ring-slate-200" aria-hidden>
              {[1, 2, 4, 8, 14, 20, 26, 32].map((step) => (
                <span
                  key={step}
                  className="h-3 w-5"
                  style={{ backgroundColor: coverageColor(step, 32) }}
                />
              ))}
            </span>
            many
          </span>
          <span className="text-slate-400">
Only two records describe a stretch smaller than the whole sea
          </span>
        </div>

        <BasinMap sources={sources} interactive />
      </Panel>

      <div className="columns-1 gap-4 md:columns-2 lg:columns-3 [&>*]:mb-4 [&>*]:break-inside-avoid">
        <Panel
          eyebrow="The north-south gradient"
          title={`${max} datasets at the widest, ${min} at the thinnest`}
        >
          <p className="text-sm leading-relaxed text-slate-600">
            {max} datasets reach{" "}
            {widest ? `${widest.lat.toFixed(1)}°N` : "the centre"}, {min} reach{" "}
            {thinnest ? `${thinnest.lat.toFixed(1)}°N` : "the strait"}. The
            south is half as observed as the centre.
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
                  title={named.map((s) => s.title).join("; ")}
                >
                  {site.name}
                  <span className="ml-1 tabular-nums text-slate-500">
                    {named.length}
                  </span>
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
