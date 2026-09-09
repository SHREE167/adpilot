import { getEntry, type RateCard } from "./rate-card";
import { forecastChannel } from "./forecast";
import type {
  ChannelAllocation,
  ChannelScore,
  PlanInput,
  PriceTier,
} from "./types";

const MIN_SCORE = 40;
const MAX_SHARE_UNLESS_TINY = 0.5;
const TINY_BUDGET = 3000;
const SMALL_BUDGET = 2000;

/**
 * Pick 2–5 channels (2 if budget < ₹2000), never give one channel more than
 * 50% unless budget < ₹3000, drop score < 40, make rupees sum to budget.
 */
export function allocateBudget(
  input: PlanInput,
  scores: ChannelScore[],
  rateCard: RateCard,
  priceTier: PriceTier
): ChannelAllocation[] {
  const budget = Math.round(input.budget);
  const ranked = [...scores].sort((a, b) => b.score - a.score);
  const eligible = ranked.filter((s) => !s.rejected && s.score >= MIN_SCORE);

  const maxChannels = budget < SMALL_BUDGET ? 2 : 5;
  let picked = eligible.slice(0, maxChannels);

  if (picked.length === 0) {
    picked = ranked.slice(0, Math.min(2, ranked.length)).map((s) => ({
      ...s,
      rejected: false,
      rejectReason: undefined,
    }));
  }

  if (picked.length === 1 && ranked.length > 1 && budget >= SMALL_BUDGET) {
    const second = ranked.find(
      (s) => s.channelId !== picked[0].channelId && s.score >= MIN_SCORE
    );
    if (second) picked = [picked[0], second];
  }

  const weights = picked.map((s) => Math.pow(Math.max(s.score, 1), 1.2));
  const cap = budget < TINY_BUDGET ? 1 : MAX_SHARE_UNLESS_TINY;
  const shares = cappedShares(weights, cap);
  const rupees = largestRemainder(shares, budget);

  const rows: ChannelAllocation[] = [];
  picked.forEach((s, i) => {
    const amount = rupees[i];
    if (amount <= 0) return;
    const entry = getEntry(rateCard, s.channelId);
    rows.push({
      channelId: s.channelId,
      name: s.name,
      score: s.score,
      budget: amount,
      percent: budget > 0 ? (amount / budget) * 100 : 0,
      forecast: forecastChannel(amount, entry, input, priceTier),
      explanation: "",
    });
  });

  const spent = rows.reduce((sum, r) => sum + r.budget, 0);
  if (rows.length && spent !== budget) {
    rows[0].budget += budget - spent;
    rows[0].percent = (rows[0].budget / budget) * 100;
    const entry = getEntry(rateCard, rows[0].channelId);
    rows[0].forecast = forecastChannel(rows[0].budget, entry, input, priceTier);
  }

  return rows;
}

function cappedShares(weights: number[], cap: number): number[] {
  const n = weights.length;
  let shares = weights.map((w) => w / weights.reduce((a, b) => a + b, 0));
  for (let iter = 0; iter < n + 2; iter++) {
    let overflow = 0;
    const uncapped: number[] = [];
    shares = shares.map((s, i) => {
      if (s > cap + 1e-12) {
        overflow += s - cap;
        return cap;
      }
      uncapped.push(i);
      return s;
    });
    if (overflow < 1e-12) break;
    const mass = uncapped.reduce((a, i) => a + shares[i], 0);
    if (mass <= 0) break;
    for (const i of uncapped) {
      const extra = overflow * (shares[i] / mass);
      shares[i] = Math.min(cap, shares[i] + extra);
    }
  }
  const total = shares.reduce((a, b) => a + b, 0);
  return shares.map((s) => s / total);
}

function largestRemainder(shares: number[], budget: number): number[] {
  const raw = shares.map((s) => s * budget);
  const floors = raw.map((r) => Math.floor(r));
  const left = budget - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  const out = [...floors];
  for (let k = 0; k < left; k++) {
    out[order[k % order.length].i] += 1;
  }
  return out;
}
