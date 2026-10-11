import "server-only";
import { extractFeatures } from "@/lib/ml/features";
import {
  assertModelSelfCheck,
  explainScore,
  modelCard,
  predictAllScores,
  shapForChannel,
} from "@/lib/ml/infer";
import {
  isB2B,
  isProfessionalAudience,
} from "@/lib/infer";
import { applyPolicy, type PolicyContext } from "@/lib/policy";
import type { RateCard } from "@/lib/rate-card";
import type { ChannelScore, PlanInput, PlanShap, PriceTier } from "@/lib/types";

export const SHAP_NOTE =
  "Model trained on synthetic briefs; explanations describe the model, not the market.";

/** F9: exact TreeSHAP for every channel, paired with the plan's final score. */
export function explainChannels(
  input: PlanInput,
  ctx: ScoreContext,
  scores: ChannelScore[]
): PlanShap {
  const x = extractFeatures(input, ctx.category, ctx.priceTier);
  return {
    method: "treeshap",
    note: SHAP_NOTE,
    channels: scores.map((s) => ({ ...shapForChannel(s.channelId, x), score: s.score })),
  };
}

export interface ScoreContext {
  category: string;
  priceTier: PriceTier;
}

/**
 * Channel fit is predicted by a trained XGBoost model (one regressor per
 * channel). Hard budget/policy rules still apply after inference.
 */
export function scoreChannels(
  input: PlanInput,
  ctx: ScoreContext,
  rateCard: RateCard
): ChannelScore[] {
  assertModelSelfCheck();
  const x = extractFeatures(input, ctx.category, ctx.priceTier);
  const predicted = predictAllScores(x);
  const b2b = isB2B(input, ctx.category);
  const professional = isProfessionalAudience(input);
  const card = modelCard();

  const policy: PolicyContext = { b2b, professional, goal: String(input.goal) };

  return rateCard.channels.map((ch) => {
    const reasons = explainScore(ch.id, x);
    reasons.push(`model R2 (holdout) ${card.meanR2}`);
    const final = applyPolicy(ch.id, predicted[ch.id], input.budget, policy, reasons);
    return {
      channelId: ch.id,
      name: ch.name,
      score: final.score,
      reasons,
      rejected: final.rejected,
      rejectReason: final.rejectReason,
    };
  });
}
