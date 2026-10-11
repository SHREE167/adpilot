import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { CREATOR_MAX_SUBS, CREATOR_MIN_SUBS, costBand } from "@/lib/creator-rates";
import { inr } from "@/lib/format";
import type { CreatorFinder, Signal } from "@/lib/types";

function subsLabel(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/** Position on the 2k-200k band, log scale, 0-100. */
function rulerPos(subs: number): number {
  const lo = Math.log10(CREATOR_MIN_SUBS);
  const hi = Math.log10(CREATOR_MAX_SUBS);
  return Math.min(100, Math.max(0, ((Math.log10(subs) - lo) / (hi - lo)) * 100));
}

/** One quiet line: the creator's size against the 2k-200k band we search. */
function SizeRuler({ subs }: { subs: number }) {
  const pos = rulerPos(subs);
  return (
    <div className="relative mt-3 h-4 w-full max-w-xs" aria-hidden="true">
      <div className="absolute inset-x-0 top-1/2 h-px bg-rule" />
      <div className="absolute top-1/2 h-px bg-sand/60" style={{ left: 0, width: `${pos}%` }} />
      <div
        className="absolute top-0 h-4 w-[3px] -translate-x-1/2 rounded-full bg-sand"
        style={{ left: `${pos}%` }}
      />
      <span className="num absolute -bottom-4 left-0 text-[10px] text-fog">2k</span>
      <span className="num absolute -bottom-4 right-0 text-[10px] text-fog">200k</span>
    </div>
  );
}

/** F5: "Local voices". Channel facts are from YouTube; the cost band is ESTIMATE. */
export function CreatorsCard({ signal, city }: { signal: Signal<CreatorFinder>; city: string }) {
  const f = signal.data;

  if (signal.status !== "ok" || !f) {
    const noKey = /no API key/.test(signal.reason || "");
    return (
      <div className="story-bit max-w-3xl">
        <h2 className="display text-3xl leading-[0.95] sm:text-4xl">Who already talks to {city}?</h2>
        <p className="mt-8 flex flex-wrap items-center gap-3 text-lg text-fog">
          <ProvenanceBadge signal={signal} />
          {noKey
            ? `Add YOUTUBE_API_KEY to find small YouTube creators in ${city} who could feature you.`
            : signal.status === "timeout"
              ? "YouTube did not answer in time; this plan has no creator list."
              : signal.reason}
        </p>
      </div>
    );
  }

  return (
    <>
      <h2 className="story-bit display max-w-[18ch] text-3xl leading-[0.95] sm:text-4xl">
        {f.picks.length ? (
          <>
            {f.picks.length} local {f.picks.length === 1 ? "voice" : "voices"} for {f.topic} in {city}.
          </>
        ) : (
          <>No small {f.topic} creators found for {city}.</>
        )}
      </h2>
      <p className="story-bit mt-8 flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 text-lg text-fog">
        <span>
          YouTube search &ldquo;{f.query}&rdquo; found <span className="num text-paper">{f.found}</span> channels;{" "}
          <span className="num text-paper">{f.inBand}</span> have 2k to 200k subscribers.
        </span>
        <ProvenanceBadge signal={signal} />
      </p>

      {f.picks.length ? (
        <ol className="story-bit mt-8 max-w-3xl space-y-10">
          {f.picks.map((p, i) => {
            const band = costBand(p.subscribers);
            return (
              <li key={p.channelId} className="grid grid-cols-[2rem_1fr] gap-x-3 border-t border-rule pt-6">
                <span className="num pt-1 text-sand">{i + 1}</span>
                <div className="min-w-0">
                  <a
                    href={p.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="display block truncate text-xl text-paper underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                    title={`Open ${p.title} on YouTube`}
                  >
                    {p.title}
                  </a>
                  <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-fog">
                    <span>
                      <span className="num text-paper">{subsLabel(p.subscribers)}</span> subscribers
                    </span>
                    <span>
                      <span className="num">{p.videos.toLocaleString("en-IN")}</span> videos
                    </span>
                    <ProvenanceBadge signal={signal} />
                  </p>
                  <SizeRuler subs={p.subscribers} />
                  <p className="mt-7 max-w-[60ch] text-lg leading-snug text-fog">
                    {p.why.filter((w) => !/subscribers|videos posted/.test(w)).join(". ") || "Matched the search"}.
                  </p>
                  {band ? (
                    <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-paper">
                      <span>
                        Collab: <span className="num text-sand">{inr(band.low)}</span> to{" "}
                        <span className="num text-sand">{inr(band.high)}</span> per video
                        {band.barter ? ", or free product" : ""}
                      </span>
                      <ProvenanceBadge estimate />
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      ) : null}

      <p className="story-bit mt-8 max-w-3xl text-sm text-fog">
        YouTube channels only: public channel names and stats, ranked by city mention, topic,
        language and size. We do not search Instagram creators. Collab prices are typical Indian
        rates, not quotes; ask each creator.
      </p>
    </>
  );
}
