// Budget policy rules applied after XGBoost scoring. Pure and client-safe: the
// server uses it in scoreChannels and the budget slider (F11) applies it at the
// exact slider budget, so "LinkedIn appears above ₹15,000" is exact, not snapped.
import type { ChannelId, ChannelScore } from "./types";

export const MIN_SCORE = 40;
export const LINKEDIN_MIN_BUDGET = 15000;

/** Brief facts the policy needs (from lib/infer at plan time). */
export interface PolicyContext {
  b2b: boolean;
  professional: boolean;
  goal: string;
}

export const LINKEDIN_REASON =
  "Policy: LinkedIn score set to 0 below ₹15,000 unless goal is B2B and audience is professional";

/** LinkedIn below ₹15k is allowed only for a B2B goal with a professional audience. */
export function linkedinAllowed(budget: number, ctx: PolicyContext): boolean {
  return budget >= LINKEDIN_MIN_BUDGET || (ctx.b2b && ctx.professional && ctx.goal.toLowerCase() === "b2b");
}

/**
 * One channel's final score + rejection at a budget. `reasons` (when given)
 * gets the policy line appended, as scoreChannels always did.
 */
export function applyPolicy(
  channelId: ChannelId,
  modelScore: number,
  budget: number,
  ctx: PolicyContext,
  reasons?: string[]
): Pick<ChannelScore, "score" | "rejected" | "rejectReason"> {
  if (channelId === "linkedin" && !linkedinAllowed(budget, ctx)) {
    reasons?.push(LINKEDIN_REASON);
    return { score: 0, rejected: true, rejectReason: LINKEDIN_REASON };
  }
  if (modelScore < MIN_SCORE) {
    return { score: modelScore, rejected: true, rejectReason: `XGBoost score ${modelScore} is below the 40 cutoff` };
  }
  return { score: modelScore, rejected: false };
}
