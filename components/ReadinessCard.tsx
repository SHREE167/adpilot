import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { SpeedRow } from "@/components/SpeedCheck";
import { speedFix } from "@/lib/speed-rules";
import type { PageSpeedResult, ReadinessCheck, Signal, SiteReadiness } from "@/lib/types";

const GLYPH: Record<ReadinessCheck["state"], { mark: string; tone: string; sr: string }> = {
  pass: { mark: "✓", tone: "text-mint border-mint/40 bg-mint/10", sr: "Pass" },
  warn: { mark: "!", tone: "text-sand border-sand/40 bg-sand/10", sr: "Check" },
  fail: { mark: "✕", tone: "text-danger border-danger/40 bg-danger/10", sr: "Missing" },
};

function verdict(score: number): string {
  if (score >= 75) return "Ready to spend.";
  if (score >= 50) return "Almost ready.";
  return "Fix the site first.";
}

/**
 * F1: the "Ready to spend?" chapter body. Score = ESTIMATE; checks = LIVE from the site.
 * Part B (PageSpeed) arrives after render; a slow page (LCP > 4s) becomes the first fix.
 */
export function ReadinessCard({
  signal,
  domain,
  speed,
  speedPending = false,
}: {
  signal: Signal<SiteReadiness>;
  domain: string;
  speed?: Signal<PageSpeedResult>;
  speedPending?: boolean;
}) {
  const r = signal.data;

  if (signal.status !== "ok" || !r) {
    return (
      <div className="story-bit max-w-3xl">
        <h2 className="display text-5xl leading-[0.95] sm:text-7xl">Ready to spend?</h2>
        <p className="mt-8 text-2xl leading-snug text-fog">
          We could not read {domain || "your site"}, so there are no site checks for this plan.
        </p>
        <p className="mt-6 flex flex-wrap items-center gap-3 text-fog">
          <ProvenanceBadge signal={signal} />
          <span className="text-sm">{signal.reason}</span>
        </p>
        <p className="mt-6 text-lg text-fog">
          Add a public domain to the brief to check the Meta Pixel, GA4, WhatsApp and mobile
          setup before you spend.
        </p>
      </div>
    );
  }

  const slow = speed?.status === "ok" ? speedFix(speed.data) : null;
  const fixes = slow ? [slow, ...r.fixes] : r.fixes;
  const urgent = new Set([slow, r.funnelHint ? r.fixes[0] : null].filter(Boolean));
  const open = r.checks.filter((c) => c.state !== "pass").length + (slow ? 1 : 0);

  return (
    <>
      <h2 className="story-bit display text-5xl leading-[0.95] sm:text-7xl">Ready to spend?</h2>
      <div className="story-bit mt-10 flex flex-wrap items-end gap-x-8 gap-y-4">
        <p className="display num leading-[0.8] text-sand">
          <span className="text-[26vw] sm:text-[11rem]">{r.score}</span>
          <span className="ml-2 text-3xl text-fog sm:text-4xl">/100</span>
        </p>
        <div className="pb-3">
          <p className="display text-3xl sm:text-4xl">{verdict(r.score)}</p>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-fog">
            Readiness score <ProvenanceBadge estimate />
          </p>
        </div>
      </div>

      <div className="story-bit card mt-12 max-w-4xl p-6 sm:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-xl">
            What we found on <span className="text-sand">{domain}</span>
          </h3>
          <ProvenanceBadge signal={signal} />
        </div>
        <ul className="mt-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          {r.checks.map((c) => {
            const g = GLYPH[c.state];
            return (
              <li key={c.id} className="flex gap-3">
                <span
                  className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${g.tone}`}
                  aria-hidden
                >
                  {g.mark}
                </span>
                <span>
                  <span className="sr-only">{g.sr}: </span>
                  <span className="text-paper">{c.label}</span>
                  <span className="block text-sm text-fog">{c.detail}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <SpeedRow signal={speed} pending={speedPending} />
      </div>

      {fixes.length ? (
        <div className="story-bit mt-12 max-w-3xl">
          <h3 className="display text-3xl sm:text-4xl">
            {open > 0 ? "Fix these first" : "One more thing"}
          </h3>
          <ol className="mt-6 space-y-4">
            {fixes.map((f, i) => (
              <li key={f} className="grid grid-cols-[2rem_1fr] text-xl leading-snug">
                <span className="num text-sand">{i + 1}</span>
                <span className={urgent.has(f) ? "text-paper" : "text-fog"}>{f}</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </>
  );
}
