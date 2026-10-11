import { ProvenanceBadge } from "@/components/ProvenanceBadge";
import { compactNumber, inr } from "@/lib/format";
import { cvrPct } from "@/lib/reality-check";
import type { RealityCheck, RealityVerdict } from "@/lib/types";

const VERDICT: Record<RealityVerdict, { label: string; tone: string; mark: string }> = {
  healthy: { label: "Healthy", tone: "text-mint", mark: "bg-mint" },
  tight: { label: "Tight", tone: "text-sand", mark: "bg-sand" },
  likely_loss: { label: "Likely loss", tone: "text-danger", mark: "bg-danger" },
};

function Term({ value, label }: { value: string; label: string }) {
  return (
    <span className="inline-flex flex-col">
      <span className="num display text-xl leading-none text-paper sm:text-2xl">{value}</span>
      <span className="mt-1 text-sm text-fog">{label}</span>
    </span>
  );
}

function Op({ children }: { children: string }) {
  return (
    <span aria-hidden className="display self-start text-xl leading-none text-fog sm:text-2xl">
      {children}
    </span>
  );
}

/** Keep a label inside the scale: start-aligned near 0, end-aligned near the max. */
function align(pos: number): string {
  if (pos < 0.15) return "-translate-x-1";
  if (pos > 0.85) return "-translate-x-full";
  return "-translate-x-1/2";
}

/** Required conversion vs the typical band, on one linear scale from 0. */
function ConversionScale({ rc }: { rc: RealityCheck }) {
  const need = rc.requiredCvr!;
  const { low, typical, high } = rc.benchmark;
  const max = Math.max(need * 1.15, high * 1.25);
  const at = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  const v = VERDICT[rc.verdict];
  return (
    <div
      role="img"
      aria-label={`You need ${cvrPct(need)} of clicks to buy. Typical is ${cvrPct(typical)}, range ${cvrPct(low)} to ${cvrPct(high)}.`}
      className="mt-6"
    >
      <div className="relative h-10">
        <div className="absolute inset-x-0 top-1/2 h-px bg-rule-strong/60" />
        <div
          className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-mint/25"
          style={{ left: at(low), width: `max(4px, calc(${at(high)} - ${at(low)}))` }}
        />
        <div
          className="absolute top-1/2 h-5 w-0.5 -translate-y-1/2 bg-mint"
          style={{ left: at(typical) }}
        />
        <div
          className={`absolute top-1/2 h-9 w-1 -translate-y-1/2 rounded-full ${v.mark}`}
          style={{ left: `calc(${at(need)} - 2px)` }}
        />
      </div>
      {/* Two label rows so the markers' labels never collide, wherever they land. */}
      <div className="relative mt-1 h-12 text-sm">
        <span className={`absolute top-0 whitespace-nowrap text-mint ${align(typical / max)}`} style={{ left: at(typical) }}>
          typical ~{cvrPct(typical)}
        </span>
        <span
          className={`absolute top-6 whitespace-nowrap font-bold ${v.tone} ${align(need / max)}`}
          style={{ left: at(need) }}
        >
          you need {cvrPct(need)}
        </span>
      </div>
    </div>
  );
}

/**
 * F8: break-even reality check, right after the cover. Every number here is
 * ESTIMATE (benchmarks + rate-card clicks). Advice never blocks the plan.
 */
export function RealityCard({ rc, hasFreeActions }: { rc: RealityCheck; hasFreeActions: boolean }) {
  const v = VERDICT[rc.verdict];
  return (
    <>
      <h2 className={`story-bit display text-4xl leading-[0.9] sm:text-5xl ${v.tone}`}>{v.label}.</h2>
      <p className="story-bit mt-6 max-w-3xl text-lg leading-snug text-paper sm:text-xl">
        {rc.headline}
      </p>
      <p className="story-bit mt-3 flex max-w-3xl flex-wrap items-center gap-x-3 gap-y-2 text-lg text-fog">
        {rc.detail.replace(" (ESTIMATE)", "")}
        <ProvenanceBadge estimate />
      </p>

      <div className="story-bit card mt-6 max-w-4xl p-6 sm:p-8">
        <h3 className="text-lg">How we worked it out</h3>
        <div className="mt-6 flex flex-wrap items-start gap-x-5 gap-y-6">
          <Term value={inr(rc.budget)} label="budget" />
          <Op>÷</Op>
          <Term value={inr(rc.profitPerSale)} label={`profit per sale (${inr(rc.price)} × ${rc.marginPct}%)`} />
          <Op>=</Op>
          <Term value={rc.breakEvenUnits.toLocaleString("en-IN")} label="sales to break even" />
        </div>
        {rc.requiredCvr !== null ? (
          <>
            <div className="mt-8 flex flex-wrap items-start gap-x-5 gap-y-6 border-t border-rule pt-6">
              <Term value={rc.breakEvenUnits.toLocaleString("en-IN")} label="sales" />
              <Op>÷</Op>
              <Term value={compactNumber(rc.clicks)} label="forecast clicks" />
              <Op>=</Op>
              <Term value={cvrPct(rc.requiredCvr)} label="of clicks must buy" />
            </div>
            <ConversionScale rc={rc} />
            {rc.requiredCvrRange && rc.clicksRange ? (
              <p className="mt-4 text-sm text-fog">
                Across the forecast range of{" "}
                <span className="num text-paper">
                  {compactNumber(rc.clicksRange.low)}–{compactNumber(rc.clicksRange.high)}
                </span>{" "}
                clicks (default band ±30%), between{" "}
                <span className="num text-paper">
                  {cvrPct(rc.requiredCvrRange.low)} and {cvrPct(rc.requiredCvrRange.high)}
                </span>{" "}
                of clicks must buy. The verdict uses the middle estimate.
              </p>
            ) : null}
          </>
        ) : null}
        <p className="mt-4 text-sm text-fog">
          Typical band for the {rc.benchmark.goal.replace(/_/g, " ")} goal is{" "}
          {cvrPct(rc.benchmark.low)}–{cvrPct(rc.benchmark.high)} of clicks becoming a sale. These are
          planning assumptions, not measured data.
        </p>
      </div>

      <p className="story-bit mt-6 max-w-3xl text-lg leading-snug text-paper">{rc.advice}</p>
      {rc.verdict !== "healthy" ? (
        <div className="story-bit mt-6 flex flex-wrap gap-3">
          {hasFreeActions ? (
            <a className="btn btn-primary" href="#free">
              See the free actions
            </a>
          ) : null}
          {rc.testBudget && rc.testBudget < rc.budget ? (
            <span className="inline-flex items-center rounded-full border border-rule px-4 py-2 text-fog">
              Suggested first test: <span className="num ml-2 text-paper">{inr(rc.testBudget)}</span>
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
