import type {
  ChannelAllocation,
  ChannelForecast,
  ChannelId,
  PlanInput,
  PlanTotals,
  PriceTier,
  RateCardEntry,
  WeeklyPoint,
} from "./types";

const FREQUENCY = 3.2;

/** Cheap reach is not a closed deal. Weights keep ESTIMATE ROAS honest. */
const CHANNEL_CVR_WEIGHT: Record<ChannelId, number> = {
  google_search: 1,
  linkedin: 0.85,
  whatsapp: 0.75,
  instagram_reels: 0.45,
  instagram_feed: 0.4,
  reddit: 0.4,
  facebook: 0.35,
  x: 0.3,
  youtube: 0.25,
  sharechat: 0.25,
  google_display: 0.12,
  telegram: 0.1,
};

function conversionRate(
  input: PlanInput,
  priceTier: PriceTier
): number {
  const goal = String(input.goal).toLowerCase();
  if (goal.includes("awareness")) return 0.004;
  if (goal.includes("store")) return 0.055;
  if (goal.includes("app")) return 0.045;
  if (goal.includes("lead")) {
    if (priceTier === "enterprise") return 0.025;
    if (priceTier === "high") return 0.04;
    return 0.08;
  }
  if (goal === "b2b") return 0.022;
  switch (priceTier) {
    case "low":
      return 0.045;
    case "mid":
      return 0.02;
    case "high":
      return 0.01;
    case "enterprise":
      return 0.006;
  }
}

export function estimatedAov(input: PlanInput, priceTier: PriceTier): number {
  const blob = `${input.product_name} ${input.audience_notes}`.toLowerCase();
  if (input.goal === "b2b" || /\b(saas|software|b2b)\b/.test(blob)) {
    if (priceTier === "enterprise") return 48000;
    return 18000;
  }
  if (/\b(snack|chips|namkeen|tea|coffee)\b/.test(blob)) return 90;
  switch (priceTier) {
    case "low":
      return 180;
    case "mid":
      return 1500;
    case "high":
      return 9000;
    case "enterprise":
      return 40000;
  }
}

export function forecastChannel(
  budget: number,
  entry: RateCardEntry,
  input: PlanInput,
  priceTier: PriceTier
): ChannelForecast {
  const impressions = (budget / entry.cpm) * 1000;
  const clicks = impressions * entry.ctr;
  const reach = impressions / FREQUENCY;
  const weight = CHANNEL_CVR_WEIGHT[entry.id] ?? 0.4;
  const conversions = clicks * conversionRate(input, priceTier) * weight;
  const cpa = conversions > 0 ? budget / conversions : null;
  return {
    impressions: Math.round(impressions),
    clicks: Math.round(clicks),
    ctr: entry.ctr,
    cpm: entry.cpm,
    cpc: entry.cpc,
    reach: Math.round(reach),
    conversions: Math.round(conversions * 10) / 10,
    cpa: cpa === null ? null : Math.round(cpa),
    note: "ESTIMATE from rate card math (impressions = spend/CPM*1000, clicks = impressions*CTR)",
  };
}

export function rollupForecast(
  mix: ChannelAllocation[],
  input: PlanInput,
  priceTier: PriceTier
): { totals: PlanTotals; weeklyForecast: WeeklyPoint[] } {
  const budget = mix.reduce((s, r) => s + r.budget, 0);
  const impressions = mix.reduce((s, r) => s + r.forecast.impressions, 0);
  const clicks = mix.reduce((s, r) => s + r.forecast.clicks, 0);
  const reach = mix.reduce((s, r) => s + r.forecast.reach, 0);
  const conversions = mix.reduce((s, r) => s + r.forecast.conversions, 0);
  const aov = estimatedAov(input, priceTier);
  const estimatedCpa = conversions > 0 ? Math.round(budget / conversions) : null;
  const pipeline = /lead|b2b/i.test(String(input.goal));
  const closeRate = pipeline ? (priceTier === "enterprise" ? 0.05 : 0.08) : 1;
  const revenue = conversions * closeRate * aov;
  const estimatedRoas = budget > 0 ? Math.round((revenue / budget) * 100) / 100 : null;

  const pacing = [0.18, 0.26, 0.3, 0.26];
  const weeklyForecast: WeeklyPoint[] = pacing.map((p, i) => ({
    week: i + 1,
    label: `Week ${i + 1}`,
    impressions: Math.round(impressions * p),
    clicks: Math.round(clicks * p),
    spend: Math.round(budget * p),
  }));
  const spendFix = budget - weeklyForecast.reduce((s, w) => s + w.spend, 0);
  if (weeklyForecast.length) weeklyForecast[2].spend += spendFix;

  return {
    totals: {
      budget,
      impressions,
      clicks,
      reach,
      conversions: Math.round(conversions * 10) / 10,
      estimatedCpa,
      estimatedRoas,
      estimatedAov: aov,
    },
    weeklyForecast,
  };
}
