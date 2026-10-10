import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import type { LocalMarket, Signal } from "@/lib/types";

export const NOT_LOCAL_REASON = "not a local-storefront business";

/** Hide the chapter when Places was deliberately not asked (online/B2B business). */
export function showLocalMarket(signal: Signal<LocalMarket> | undefined): boolean {
  return Boolean(signal) && signal!.reason !== NOT_LOCAL_REASON;
}

function countLabel(m: LocalMarket): string {
  return m.more ? `${m.count}+` : String(m.count);
}

/** F2: the "local" chapter. Every number here comes from Google Places and carries its badge. */
export function LocalMarketCard({ signal, city }: { signal: Signal<LocalMarket>; city: string }) {
  const m = signal.data;

  if (signal.status !== "ok" || !m) {
    const noKey = /no API key/.test(signal.reason || "");
    return (
      <div className="story-bit max-w-3xl">
        <h2 className="display text-5xl leading-[0.95] sm:text-7xl">Who else is on the map?</h2>
        <p className="mt-8 flex flex-wrap items-center gap-3 text-xl text-fog">
          <ProvenanceBadge signal={signal} />
          {noKey
            ? `Add GOOGLE_PLACES_API_KEY to see who else in ${city} sells this, and whether you are on Google Maps.`
            : signal.status === "timeout"
              ? "Google Places did not answer in time; this plan has no local scan."
              : signal.reason}
        </p>
      </div>
    );
  }

  return (
    <>
      <h2 className="story-bit display max-w-[18ch] text-5xl leading-[0.95] sm:text-7xl">
        {m.count > 0 ? (
          <>
            <span className="num text-sand">{countLabel(m)}</span> similar{" "}
            {m.count === 1 ? "business" : "businesses"} near you.
          </>
        ) : (
          <>No &ldquo;{m.keyword}&rdquo; listings found in {city}.</>
        )}
      </h2>
      <p className="story-bit mt-8 flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 text-xl text-fog">
        <span>&ldquo;{m.query}&rdquo;</span>
        {m.avgRating !== null ? (
          <span>
            · avg rating <span className="num text-paper">{m.avgRating.toFixed(1)}</span> across{" "}
            <span className="num">{m.ratedCount}</span> rated
          </span>
        ) : null}
        <ProvenanceBadge signal={signal} />
      </p>

      <div
        className={`story-bit card mt-12 max-w-3xl border p-6 sm:p-8 ${m.own.found ? "border-mint/30" : "border-sand/40"}`}
      >
        {m.own.found ? (
          <>
            <p className="text-sm uppercase tracking-[0.22em] text-mint">You are on Google Maps</p>
            <p className="display mt-3 text-3xl">{m.own.name}</p>
            {m.own.mapsUri ? (
              <a
                href={m.own.mapsUri}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-block text-sand underline-offset-4 hover:underline focus-visible:underline"
              >
                Open your listing on Maps ↗
              </a>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-sm uppercase tracking-[0.22em] text-sand">Not on Google Maps</p>
            <p className="display mt-3 text-3xl leading-tight">
              People searching &ldquo;{m.keyword}&rdquo; in {city} cannot find you.
            </p>
            <p className="mt-4 text-fog">
              We searched &ldquo;{m.own.query}&rdquo; and no listing matched. A Google Business
              Profile is free and puts you on Maps and local search.
            </p>
            <a
              href="https://business.google.com/create"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-5 inline-flex items-center rounded-full border border-sand/50 bg-sand/10 px-5 py-2 text-sm text-sand transition-colors hover:bg-sand/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sand"
            >
              Create a free Business Profile ↗
            </a>
          </>
        )}
      </div>

      {m.top.length ? (
        <div className="story-bit mt-12 max-w-3xl">
          <h3 className="flex flex-wrap items-center gap-3 text-xl">
            Best rated nearby <ProvenanceBadge signal={signal} />
          </h3>
          <ol className="mt-4 divide-y divide-rule">
            {m.top.map((p, i) => (
              <li key={`${p.name}-${i}`} className="grid grid-cols-[2rem_1fr_auto] items-baseline gap-3 py-3">
                <span className="num text-sand">{i + 1}</span>
                <span className="min-w-0 truncate text-paper" title={p.name}>
                  {p.name}
                </span>
                <span className="num whitespace-nowrap text-sm text-fog">
                  {typeof p.rating === "number" ? (
                    <>
                      <span className="text-sand">★ {p.rating.toFixed(1)}</span>
                      {typeof p.reviews === "number" ? ` · ${p.reviews.toLocaleString("en-IN")}` : ""}
                    </>
                  ) : (
                    "no rating"
                  )}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <p className="story-bit mt-10 max-w-3xl text-sm text-fog">
        First page of Google Places results (up to 20). Only public business names and ratings are
        kept; ranked by rating among places with 10+ reviews.
      </p>
    </>
  );
}
