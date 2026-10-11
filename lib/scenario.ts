// F11 budget slider: pure, client-safe. Re-runs allocate + forecast + reality
// check at any budget from the server's precomputed grid. Signals (Meta pool,
// festival weeks) are reused from the plan, never re-fetched.
import { allocateBudget } from "./allocate";
import { templateCreative } from "./copy-templates";
import { capMetaReach, rollupForecast, type SeasonAdjust } from "./forecast";
import { applyPolicy } from "./policy";
import { buildRealityCheck, hasRealityInputs } from "./reality-check";
import type {
  BudgetGrid,
  BudgetGridPoint,
  ChannelAllocation,
  ChannelId,
  ChannelScore,
  ChannelShap,
  PlanResult,
  PlanTotals,
  RateCard,
  RealityCheck,
  WeeklyPoint,
} from "./types";

/** 11 points from 0.25x to 4x: factor 4^((i-5)/5), so i = 5 is exactly 1x. */
export const GRID_POINTS = 11;
export const MIN_FACTOR = 0.25;
export const MAX_FACTOR = 4;

export function gridBudgets(base: number, n = GRID_POINTS): { budget: number; factor: number }[] {
  const mid = (n - 1) / 2;
  return Array.from({ length: n }, (_, i) => {
    const factor = Math.pow(MAX_FACTOR, (i - mid) / mid);
    return { budget: Math.max(100, Math.round(base * factor)), factor: Math.round(factor * 1000) / 1000 };
  });
}

/** Grid point closest to a budget on a log scale (scores between points snap to it). */
export function nearestPoint(grid: BudgetGrid, budget: number): BudgetGridPoint {
  let best = grid.points[0];
  let bestD = Infinity;
  for (const p of grid.points) {
    const d = Math.abs(Math.log(budget / p.budget));
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** Rupee step a budget is rounded to on the slider. */
function niceStep(b: number): number {
  if (b < 5000) return 100;
  if (b < 20000) return 250;
  if (b < 100000) return 1000;
  return 5000;
}

/**
 * Slider positions: ~120 log-spaced, rounded budgets from 0.25x to 4x, always
 * including the plan's own budget. Keyboard arrows move one step.
 */
export function sliderSteps(grid: BudgetGrid, n = 120): number[] {
  const lo = grid.points[0].budget;
  const hi = grid.points[grid.points.length - 1].budget;
  const set = new Set<number>([grid.base]);
  for (let i = 0; i < n; i++) {
    const b = lo * Math.pow(hi / lo, i / (n - 1));
    const s = niceStep(b);
    set.add(Math.max(100, Math.round(b / s) * s));
  }
  return [...set].sort((a, b) => a - b);
}

/** Final scores at an exact budget: grid point model scores + policy at that budget. */
export function scoresAt(grid: BudgetGrid, budget: number): ChannelScore[] {
  const point = nearestPoint(grid, budget);
  return grid.rateCard.channels.map((ch) => ({
    channelId: ch.id,
    name: ch.name,
    reasons: [],
    ...applyPolicy(ch.id, point.scores[ch.id] ?? 0, budget, grid.policy),
  }));
}

function cardOf(grid: BudgetGrid): RateCard {
  return {
    version: grid.rateCard.version,
    region: "India",
    year: 2026,
    currency: "INR",
    disclaimer: "",
    channels: grid.rateCard.channels,
  };
}

function seasonOf(plan: PlanResult): SeasonAdjust | undefined {
  const cal = plan.enrichment?.calendar;
  return cal?.status === "ok" && cal.data
    ? { weekMultipliers: cal.data.weekMultipliers, weekFestivals: cal.data.weekFestivals }
    : undefined;
}

function poolOf(plan: PlanResult): number | undefined {
  const a = plan.enrichment?.audience;
  return a?.status === "ok" && a.data ? a.data.upper : undefined;
}

/** Channel ids in the mix at a budget (fast path for transitions: no forecast). */
export function mixIdsAt(plan: PlanResult, budget: number): ChannelId[] {
  const grid = plan.budgetGrid!;
  const input = { ...plan.input, budget };
  return allocateBudget(input, scoresAt(grid, budget), cardOf(grid), plan.priceTier).map((m) => m.channelId);
}

export interface Scenario {
  budget: number;
  factor: number;
  /** Grid point the scores came from. */
  point: BudgetGridPoint;
  mix: ChannelAllocation[];
  rejected: ChannelScore[];
  totals: PlanTotals;
  weeklyForecast: WeeklyPoint[];
  realityCheck?: RealityCheck;
  /** SHAP for channels in this mix, from the nearest grid point. */
  shap: ChannelShap[];
}

/**
 * The plan at another budget. Totals always equal `budget` (allocation runs at
 * the exact budget); scores snap to the nearest grid point; policy, Meta pool
 * cap and festival weeks are re-applied exactly as the server did.
 */
export function scenarioAt(plan: PlanResult, budget: number): Scenario {
  const grid = plan.budgetGrid!;
  const b = Math.round(budget);
  const input = { ...plan.input, budget: b };
  const scores = scoresAt(grid, b);
  const season = seasonOf(plan);
  const allocated = capMetaReach(allocateBudget(input, scores, cardOf(grid), plan.priceTier, season), poolOf(plan));
  const original = new Map(plan.mix.map((m) => [m.channelId, m.explanation]));
  const fresh = allocated.some((m) => !original.get(m.channelId))
    ? templateCreative(input, allocated, plan.category, plan.priceTier, plan.product).explanations
    : {};
  const mix = allocated.map((m) => ({ ...m, explanation: original.get(m.channelId) || fresh[m.channelId] || "" }));
  const { totals, weeklyForecast } = rollupForecast(mix, input, plan.priceTier, season);
  const realityCheck = hasRealityInputs(input)
    ? buildRealityCheck({ input, clicks: totals.clicks, clicksRange: totals.ranges?.clicks })
    : undefined;
  const inMix = new Set(mix.map((m) => m.channelId));
  const point = nearestPoint(grid, b);
  const rejected = scores.filter((s) => s.rejected || !inMix.has(s.channelId)).sort((x, y) => y.score - x.score);
  return {
    budget: b,
    factor: b / grid.base,
    point,
    mix,
    rejected,
    totals,
    weeklyForecast,
    ...(realityCheck ? { realityCheck } : {}),
    shap: point.shap.filter((s) => inMix.has(s.channelId)),
  };
}

export interface Transition {
  channelId: ChannelId;
  name: string;
  kind: "enters" | "leaves";
  /** Changes when the budget goes above (or below) `budget`, the last step that matches the plan's own mix. */
  direction: "above" | "below";
  budget: number;
}

/**
 * For each channel, the nearest slider budget (above and below the plan's own)
 * where it enters or leaves the mix. "LinkedIn appears above ₹15,000".
 */
export function transitions(plan: PlanResult, steps: number[]): Transition[] {
  const grid = plan.budgetGrid!;
  const names = new Map(grid.rateCard.channels.map((c) => [c.id, c.name]));
  const sets = steps.map((b) => new Set(mixIdsAt(plan, b)));
  const baseIdx = steps.indexOf(grid.base);
  const base = sets[baseIdx];
  const out: Transition[] = [];
  for (const id of names.keys()) {
    const inBase = base.has(id);
    for (const dir of ["above", "below"] as const) {
      const range = dir === "above" ? steps.map((_, i) => i).slice(baseIdx + 1) : steps.map((_, i) => i).slice(0, baseIdx).reverse();
      const hit = range.find((i) => sets[i].has(id) !== inBase);
      if (hit === undefined) continue;
      // The boundary the user crosses: the last budget that still looks like the plan's own mix.
      const at = dir === "above" ? steps[hit - 1] : steps[hit + 1];
      out.push({ channelId: id, name: names.get(id)!, kind: inBase ? "leaves" : "enters", direction: dir, budget: at });
    }
  }
  // Closest to the plan's own budget first.
  return out.sort((a, b) => Math.abs(Math.log(a.budget / grid.base)) - Math.abs(Math.log(b.budget / grid.base)));
}
