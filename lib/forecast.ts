import { defaultRanges, META_POOL_BAND, rangeAround, SIGNAL_BAND_PCT, totalRanges } from "./ranges";
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

/** Share of monthly spend per week. */
export const WEEKLY_PACING = [0.18, 0.26, 0.3, 0.26];

/** F3 signal adjust: per-week CPM multipliers from the festival calendar. */
export interface SeasonAdjust {
  weekMultipliers: number[];
  weekFestivals?: (string | null)[];
}

function isFlat(season?: SeasonAdjust): boolean {
  return !season || season.weekMultipliers.every((m) => !(m > 1));
}

/**
 * Impressions per rupee over the month relative to a normal month:
 * Σ pacing_w / multiplier_w. Exactly 1 when no festival week overlaps.
 */
export function seasonFactor(season?: SeasonAdjust): number {
  if (isFlat(season)) return 1;
  return WEEKLY_PACING.reduce((s, p, i) => s + p / Math.max(1, season!.weekMultipliers[i] ?? 1), 0);
}

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
  priceTier: PriceTier,
  season?: SeasonAdjust
): ChannelForecast {
  const factor = seasonFactor(season);
  const impressions = (budget / entry.cpm) * 1000 * factor;
  const clicks = impressions * entry.ctr;
  const reach = impressions / FREQUENCY;
  const weight = CHANNEL_CVR_WEIGHT[entry.id] ?? 0.4;
  const conversions = clicks * conversionRate(input, priceTier) * weight;
  const cpa = conversions > 0 ? budget / conversions : null;
  const mid = {
    reach: Math.round(reach),
    clicks: Math.round(clicks),
    conversions: Math.round(conversions * 10) / 10,
  };
  return {
    impressions: Math.round(impressions),
    clicks: mid.clicks,
    ctr: entry.ctr,
    cpm: factor === 1 ? entry.cpm : Math.round((entry.cpm / factor) * 100) / 100,
    cpc: entry.cpc,
    reach: mid.reach,
    conversions: mid.conversions,
    ranges: defaultRanges(mid),
    cpa: cpa === null ? null : Math.round(cpa),
    note:
      factor === 1
        ? "ESTIMATE from rate card math (impressions = spend/CPM*1000, clicks = impressions*CTR)"
        : `ESTIMATE from rate card math with festival-week CPM uplift (month ${Math.round((1 / factor - 1) * 100)}% pricier)`,
  };
}

/** Channels whose people come from Meta's Facebook + Instagram audience. */
export const META_CHANNELS: ReadonlySet<ChannelId> = new Set(["facebook", "instagram_reels", "instagram_feed"]);

/**
 * F4 + F14 signal adjust, from Meta's audience pool for the targeting:
 * - Facebook + Instagram rows together never reach more people than the pool
 *   (reach scaled down proportionally, rows flagged reachCapped);
 * - their reach band narrows to ±15% ("backed by Meta pool") and the combined
 *   high stays within the pool.
 * Without a pool every row is returned unchanged (output == v1).
 */
export function capMetaReach(mix: ChannelAllocation[], pool?: number): ChannelAllocation[] {
  if (!pool || pool <= 0) return mix;
  const metaReach = mix.reduce((s, r) => s + (META_CHANNELS.has(r.channelId) ? r.forecast.reach : 0), 0);
  const k = metaReach > pool ? pool / metaReach : 1;
  const rows = mix.map((r) => {
    if (!META_CHANNELS.has(r.channelId)) return r;
    const reach = k < 1 ? Math.floor(r.forecast.reach * k) : r.forecast.reach;
    const base = r.forecast.ranges ?? defaultRanges(r.forecast);
    return {
      ...r,
      forecast: {
        ...r.forecast,
        reach,
        ...(k < 1
          ? {
              reachCapped: true,
              note: `${r.forecast.note}; reach capped to Meta's audience pool for this targeting`,
            }
          : {}),
        ranges: { ...base, reach: rangeAround(reach, SIGNAL_BAND_PCT), reachBand: META_POOL_BAND },
      },
    };
  });
  // Keep the Meta rows' combined high inside the pool: shrink only the part above mid.
  const meta = rows.filter((r) => META_CHANNELS.has(r.channelId));
  const sumMid = meta.reduce((s, r) => s + r.forecast.ranges!.reach.mid, 0);
  const sumHigh = meta.reduce((s, r) => s + r.forecast.ranges!.reach.high, 0);
  if (sumHigh > pool && sumHigh > sumMid) {
    const room = Math.max(0, pool - sumMid) / (sumHigh - sumMid);
    for (const r of meta) {
      const reachR = r.forecast.ranges!.reach;
      reachR.high = reachR.mid + Math.floor((reachR.high - reachR.mid) * room);
    }
  }
  return rows;
}

export function rollupForecast(
  mix: ChannelAllocation[],
  input: PlanInput,
  priceTier: PriceTier,
  season?: SeasonAdjust
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

  // Mix rows already carry the month's season factor; spread delivery so
  // festival weeks buy fewer impressions for the same spend.
  const factor = seasonFactor(season);
  const weeklyForecast: WeeklyPoint[] = WEEKLY_PACING.map((p, i) => {
    const mult = isFlat(season) ? 1 : Math.max(1, season!.weekMultipliers[i] ?? 1);
    const share = p / mult / factor;
    const point: WeeklyPoint = {
      week: i + 1,
      label: `Week ${i + 1}`,
      impressions: Math.round(impressions * share),
      clicks: Math.round(clicks * share),
      spend: Math.round(budget * p),
    };
    if (mult > 1) {
      point.cpmMultiplier = mult;
      const name = season?.weekFestivals?.[i];
      if (name) point.festival = name;
    }
    return point;
  });
  const spendFix = budget - weeklyForecast.reduce((s, w) => s + w.spend, 0);
  if (weeklyForecast.length) weeklyForecast[2].spend += spendFix;

  return {
    totals: {
      budget,
      impressions,
      clicks,
      reach,
      ranges: totalRanges(mix.map((r) => r.forecast)),
      conversions: Math.round(conversions * 10) / 10,
      estimatedCpa,
      estimatedRoas,
      estimatedAov: aov,
    },
    weeklyForecast,
  };
}
