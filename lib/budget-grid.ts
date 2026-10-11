import "server-only";
// F11: precompute channel scores (+ SHAP for the mix) at log-spaced budgets.
// Runs the model on the server; the browser only ever sees these numbers.
import { allocateBudget } from "./allocate";
import { isB2B, isProfessionalAudience } from "./infer";
import { extractFeatures } from "./ml/features";
import { predictAllScores, shapForChannel } from "./ml/infer";
import { applyPolicy, type PolicyContext } from "./policy";
import type { RateCard } from "./rate-card";
import { GRID_POINTS, gridBudgets } from "./scenario";
import type { BudgetGrid, BudgetGridPoint, ChannelId, ChannelScore, PlanInput, PriceTier } from "./types";

export function buildBudgetGrid(
  input: PlanInput,
  ctx: { category: string; priceTier: PriceTier },
  rateCard: RateCard
): BudgetGrid {
  const policy: PolicyContext = {
    b2b: isB2B(input, ctx.category),
    professional: isProfessionalAudience(input),
    goal: String(input.goal),
  };
  const points: BudgetGridPoint[] = gridBudgets(input.budget, GRID_POINTS).map(({ budget, factor }) => {
    const at = { ...input, budget };
    const x = extractFeatures(at, ctx.category, ctx.priceTier);
    const raw = predictAllScores(x);
    // Which channels are in the mix here decides whose SHAP we keep.
    const scores: ChannelScore[] = rateCard.channels.map((ch) => ({
      channelId: ch.id,
      name: ch.name,
      reasons: [],
      ...applyPolicy(ch.id, raw[ch.id], budget, policy),
    }));
    const mix = allocateBudget(at, scores, rateCard, ctx.priceTier);
    const byId = new Map(scores.map((s) => [s.channelId, s]));
    return {
      budget,
      factor,
      scores: Object.fromEntries(rateCard.channels.map((ch) => [ch.id, raw[ch.id]])) as Record<ChannelId, number>,
      shap: mix.map((m) => ({ ...shapForChannel(m.channelId, x), score: byId.get(m.channelId)!.score })),
    };
  });
  return {
    version: 1,
    base: Math.round(input.budget),
    points,
    rateCard: { version: rateCard.version, channels: rateCard.channels.map((c) => ({ ...c })) },
    policy,
  };
}
