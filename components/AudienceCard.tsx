import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { compactNumber } from "@/lib/format";
import type { AudienceEstimate, ChannelAllocation, Signal } from "@/lib/types";

const META_IDS = new Set(["facebook", "instagram_reels", "instagram_feed"]);

/** F4: "Who you can reach". Bounds come from Meta's reach estimate; the spec is exactly what was sent. */
export function AudienceCard({
  signal,
  city,
  mix,
}: {
  signal: Signal<AudienceEstimate>;
  city: string;
  mix: ChannelAllocation[];
}) {
  const a = signal.data;

  if (signal.status !== "ok" || !a) {
    const noKey = /no API key/.test(signal.reason || "");
    return (
      <div className="story-bit max-w-3xl">
        <h2 className="display text-5xl leading-[0.95] sm:text-7xl">How many people can you reach in {city}?</h2>
        <p className="mt-8 flex flex-wrap items-center gap-3 text-xl text-fog">
          <ProvenanceBadge signal={signal} />
          {noKey
            ? "Add META_ACCESS_TOKEN, META_AD_ACCOUNT_ID and META_API_VERSION (a system-user token with ads_read) to see Meta's real audience size. Until then, Facebook and Instagram reach is rate-card math only."
            : signal.status === "timeout"
              ? "Meta did not answer in time; reach is rate-card math only."
              : signal.reason}
        </p>
      </div>
    );
  }

  const metaRows = mix.filter((r) => META_IDS.has(r.channelId));
  const capped = metaRows.filter((r) => r.forecast.reachCapped);
  const forecastReach = metaRows.reduce((s, r) => s + r.forecast.reach, 0);

  return (
    <>
      <h2 className="story-bit display max-w-[18ch] text-5xl leading-[0.95] sm:text-7xl">
        <span className="num text-sand">
          {compactNumber(a.lower)} to {compactNumber(a.upper)}
        </span>{" "}
        people in {a.city.name} match this targeting.
      </h2>
      <p className="story-bit mt-8 flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 text-xl text-fog">
        <span>Monthly Facebook + Instagram audience from Meta&rsquo;s reach estimate</span>
        <ProvenanceBadge signal={signal} />
      </p>

      <dl className="story-bit mt-12 grid max-w-3xl grid-cols-[minmax(6rem,auto)_1fr] gap-x-6 gap-y-4 border-t border-rule pt-8 text-lg">
        <dt className="text-fog">Where</dt>
        <dd className="text-paper">
          {a.city.name}
          {a.city.region ? `, ${a.city.region}` : ""}
        </dd>
        <dt className="text-fog">Age</dt>
        <dd className="num text-paper">
          {a.ageMin} to {a.ageMax}
          {a.ageMax === 65 ? "+" : ""}
        </dd>
        <dt className="text-fog">Interests</dt>
        <dd className="text-paper">
          {a.interests.length ? a.interests.map((i) => i.name).join(", ") : "None"}
          {a.interestsNote ? <span className="mt-1 block text-base text-fog">{a.interestsNote}</span> : null}
        </dd>
        <dt className="text-fog">Placements</dt>
        <dd className="text-paper">Facebook and Instagram</dd>
      </dl>

      {metaRows.length ? (
        <p className="story-bit mt-10 max-w-3xl text-lg text-fog">
          {capped.length ? (
            <>
              Your Facebook and Instagram reach forecast was cut to{" "}
              <span className="num text-paper">{compactNumber(forecastReach)}</span> so it never exceeds
              this pool.
            </>
          ) : (
            <>
              Your Facebook and Instagram forecast reaches{" "}
              <span className="num text-paper">{compactNumber(forecastReach)}</span> people, inside this
              pool.
            </>
          )}{" "}
          <ProvenanceBadge estimate />
        </p>
      ) : null}

      <details className="story-bit mt-10 max-w-3xl">
        <summary className="cursor-pointer text-sand underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none">
          Exact targeting spec (paste into Ads Manager or the API)
        </summary>
        <pre className="card mt-4 overflow-x-auto p-5 text-sm leading-relaxed text-fog">
          {JSON.stringify(a.targetingSpec, null, 2)}
        </pre>
        <p className="mt-3 text-sm text-fog">Marketing API {a.apiVersion}, act_…/reachestimate.</p>
      </details>
    </>
  );
}
