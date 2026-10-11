"use client";

import { inr } from "@/lib/format";
import type { Transition } from "@/lib/scenario";

/** "LinkedIn appears above ₹15,000" / "ShareChat drops out below ₹2,000". */
export function transitionText(t: Transition): string {
  return `${t.name} ${t.kind === "enters" ? "appears" : "drops out"} ${t.direction} ${inr(t.budget)}`;
}

function factorText(f: number): string {
  if (Math.abs(f - 1) < 0.005) return "your plan's budget";
  return `${f >= 1 ? f.toFixed(f >= 2 ? 1 : 2) : f.toFixed(2)}× your plan`;
}

/**
 * F11: a native range input over pre-rounded rupee steps (keyboard: arrows,
 * PageUp/PageDown, Home/End). `compact` is the sticky one-line version.
 */
export function BudgetSlider({
  steps,
  value,
  base,
  onChange,
  transitions,
  compact = false,
}: {
  steps: number[];
  value: number;
  base: number;
  onChange: (budget: number) => void;
  transitions: Transition[];
  compact?: boolean;
}) {
  const index = Math.max(0, steps.indexOf(value));
  const baseIndex = steps.indexOf(base);
  const changed = value !== base;
  const id = compact ? "budget-slider-compact" : "budget-slider";
  // Just past the boundary, so the change is visible when a note is clicked.
  const jump = (t: Transition) => {
    const i = steps.indexOf(t.budget);
    const next = t.direction === "above" ? steps[Math.min(steps.length - 1, i + 1)] : steps[Math.max(0, i - 1)];
    onChange(next);
  };

  const input = (
    <input
      id={id}
      type="range"
      min={0}
      max={steps.length - 1}
      step={1}
      value={index}
      onChange={(e) => onChange(steps[Number(e.target.value)])}
      aria-valuetext={`${inr(value)}, ${factorText(value / base)}`}
      className="budget-range w-full"
      style={{ ["--fill" as string]: `${(index / Math.max(1, steps.length - 1)) * 100}%` }}
    />
  );

  if (compact) {
    return (
      <div className="page flex items-center gap-3 py-2">
        <label htmlFor={id} className="shrink-0 text-sm text-fog">
          Budget
        </label>
        <span className="num w-24 shrink-0 text-paper">{inr(value)}</span>
        {input}
        <button
          type="button"
          className="btn btn-ghost shrink-0 !px-3 !py-1.5 text-sm"
          onClick={() => onChange(base)}
          disabled={!changed}
        >
          Reset
        </button>
      </div>
    );
  }

  return (
    <div className="card panel mx-auto mt-6 max-w-3xl text-left">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <label htmlFor={id} className="font-semibold text-paper">
          Try another budget
        </label>
        <p className="text-sm text-fog">{factorText(value / base)}</p>
      </div>
      <p className="num mt-2 text-4xl leading-none text-sand" aria-live="polite">
        {inr(value)}
      </p>
      <div className="mt-5">{input}</div>
      <div className="num mt-1 flex justify-between text-xs text-fog" aria-hidden>
        <span>{inr(steps[0])}</span>
        {baseIndex >= 0 ? <span>plan {inr(base)}</span> : null}
        <span>{inr(steps[steps.length - 1])}</span>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" className="btn btn-ghost !py-1.5 text-sm" onClick={() => onChange(base)} disabled={!changed}>
          Reset to original
        </button>
        <p className="text-sm text-fog">
          Mix, rupee split, forecast and the break-even verdict update as you move it. Scores come from the
          nearest of 11 precomputed budgets; totals always equal the slider.
        </p>
      </div>
      {transitions.length ? (
        <ul className="mt-4 flex flex-wrap gap-2 border-t border-rule pt-4" aria-label="Where the mix changes">
          {transitions.slice(0, 6).map((t) => (
            <li key={`${t.channelId}-${t.direction}`}>
              <button
                type="button"
                onClick={() => jump(t)}
                className={`rounded-md border px-2.5 py-1 text-sm hover:border-sand ${
                  t.kind === "enters" ? "border-mint/40 text-mint" : "border-rule-strong text-fog"
                }`}
              >
                {transitionText(t)}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 border-t border-rule pt-4 text-sm text-fog">
          The same channels stay in the mix across this whole range; only the split changes.
        </p>
      )}
    </div>
  );
}
