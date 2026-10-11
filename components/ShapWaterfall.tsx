import type { ChannelShap } from "@/lib/types";

interface Step {
  key: string;
  label: string;
  from: number;
  to: number;
  kind: "base" | "up" | "down" | "final";
}

/** Waterfall rows: base → top drivers → other features → final (raw model output). */
export function waterfallSteps(s: ChannelShap): Step[] {
  const steps: Step[] = [{ key: "base", label: "Average channel score", from: 0, to: s.base, kind: "base" }];
  let run = s.base;
  const push = (key: string, label: string, v: number) => {
    steps.push({ key, label, from: run, to: run + v, kind: v >= 0 ? "up" : "down" });
    run += v;
  };
  for (const d of s.drivers) push(d.feature, d.label, d.value);
  if (s.otherCount > 0 && Math.abs(s.other) >= 0.05) {
    push("other", `${s.otherCount} other ${s.otherCount === 1 ? "feature" : "features"}`, s.other);
  }
  steps.push({ key: "final", label: "Model score", from: 0, to: s.prediction, kind: "final" });
  return steps;
}

const signed = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1)}`;

const BAR: Record<Step["kind"], string> = {
  base: "bg-fog/50",
  up: "bg-mint",
  down: "bg-danger",
  final: "bg-sand",
};

/**
 * F9: "Why this channel?" Exact TreeSHAP drivers as a floating-bar waterfall
 * on the 0-100 score axis. Explains the model, not the market.
 */
export function ShapWaterfall({ shap, note }: { shap: ChannelShap; note: string }) {
  const steps = waterfallSteps(shap);
  const lo = Math.min(0, ...steps.map((s) => Math.min(s.from, s.to)));
  const hi = Math.max(100, ...steps.map((s) => Math.max(s.from, s.to)));
  const at = (v: number) => ((v - lo) / (hi - lo)) * 100;
  const clamped = shap.prediction > 100 || shap.prediction < 0;
  const shown = Math.round(Math.max(0, Math.min(100, shap.prediction)));

  return (
    <details className="story-bit group mt-6 max-w-3xl rounded-2xl border border-rule bg-surface/60 open:shadow-[var(--shadow)]">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-lg [&::-webkit-details-marker]:hidden">
        <span>Why this channel?</span>
        <span aria-hidden className="text-sand transition-transform group-open:rotate-45 motion-reduce:transition-none">
          +
        </span>
      </summary>
      <div className="border-t border-rule px-5 pb-6 pt-5">
        <p className="text-fog">
          How the model got from an average score of <span className="num text-paper">{shap.base.toFixed(1)}</span> to{" "}
          <span className="num text-paper">{shown}</span> for this brief. Green pushed the score up, red pulled it down.
        </p>
        <ol className="mt-6 space-y-3">
          {steps.map((s) => {
            const left = at(Math.min(s.from, s.to));
            const width = Math.max(0.6, Math.abs(at(s.to) - at(s.from)));
            const total = s.kind === "base" || s.kind === "final";
            return (
              <li
                key={s.key}
                className={`grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 sm:grid-cols-[13rem_1fr_3.5rem] ${total ? "font-bold" : ""}`}
              >
                <span className={`order-1 text-sm ${total ? "text-paper" : "text-fog"}`}>{s.label}</span>
                <span
                  className={`num order-2 text-right text-sm sm:order-3 ${
                    s.kind === "up" ? "text-mint" : s.kind === "down" ? "text-danger" : "text-paper"
                  }`}
                >
                  {total ? s.to.toFixed(1) : signed(s.to - s.from)}
                </span>
                <div className="relative order-3 col-span-2 h-3 rounded-full bg-tint sm:order-2 sm:col-span-1">
                  <div
                    className={`absolute inset-y-0 rounded-full ${BAR[s.kind]}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                  />
                </div>
              </li>
            );
          })}
        </ol>
        {clamped ? (
          <p className="mt-4 text-sm text-fog">
            The raw model output is {shap.prediction.toFixed(1)}; plan scores are capped to 0–100.
          </p>
        ) : null}
        <p className="mt-5 border-t border-rule pt-4 text-sm text-fog">
          Exact TreeSHAP over the XGBoost trees. {note}
        </p>
      </div>
    </details>
  );
}
