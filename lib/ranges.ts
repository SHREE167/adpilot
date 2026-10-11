// F14: low / mid / high forecast ranges. Pure and client-safe (the budget slider
// re-runs these in the browser). M6 adds "calibrated" bands from real actuals;
// everything here takes the band as data so that switch is a data change.
import type { ChannelForecast, ForecastBand, ForecastRange, ForecastRanges, PlanTotals } from "./types";

/** Flat band on rate-card math (ESTIMATE). */
export const DEFAULT_BAND_PCT = 0.3;
/** Narrower band when a LIVE/MOCK signal backs the number (Meta pool for reach). */
export const SIGNAL_BAND_PCT = 0.15;

export const DEFAULT_BAND: ForecastBand = { kind: "default", pct: DEFAULT_BAND_PCT, label: "default band" };
export const META_POOL_BAND: ForecastBand = {
  kind: "signal",
  pct: SIGNAL_BAND_PCT,
  source: "meta_reach",
  label: "backed by Meta pool",
};

/** Precision a quantity is shown at: counts are whole, conversions one decimal. */
type Step = 1 | 0.1;

function floorTo(n: number, step: Step): number {
  return step === 1 ? Math.floor(n) : Math.floor(n * 10 + 1e-9) / 10;
}
function ceilTo(n: number, step: Step): number {
  return step === 1 ? Math.ceil(n) : Math.ceil(n * 10 - 1e-9) / 10;
}

/** mid ± pct, rounded outward so low <= mid <= high always holds; never below 0. */
export function rangeAround(mid: number, pct: number, step: Step = 1): ForecastRange {
  const m = Math.max(0, mid);
  return {
    low: Math.max(0, Math.min(m, floorTo(m * (1 - pct), step))),
    mid: m,
    high: Math.max(m, ceilTo(m * (1 + pct), step)),
  };
}

/** Default-band ranges for one channel forecast (rate-card math only). */
export function defaultRanges(f: Pick<ChannelForecast, "reach" | "clicks" | "conversions">): ForecastRanges {
  return {
    reach: rangeAround(f.reach, DEFAULT_BAND_PCT),
    clicks: rangeAround(f.clicks, DEFAULT_BAND_PCT),
    conversions: rangeAround(f.conversions, DEFAULT_BAND_PCT, 0.1),
    band: DEFAULT_BAND,
  };
}

/** The forecast's ranges, or a default band derived from its single numbers (plans saved before M5). */
export function rangesOf(f: ChannelForecast): ForecastRanges {
  return f.ranges ?? defaultRanges(f);
}

function sum(rs: ForecastRange[], step: Step): ForecastRange {
  const add = (k: keyof ForecastRange) => {
    const v = rs.reduce((s, r) => s + r[k], 0);
    return step === 1 ? Math.round(v) : Math.round(v * 10) / 10;
  };
  return { low: add("low"), mid: add("mid"), high: add("high") };
}

/** Plan totals: sums of channel lows / mids / highs (conservative: errors are not assumed to cancel). */
export function totalRanges(forecasts: ChannelForecast[]): NonNullable<PlanTotals["ranges"]> {
  const rs = forecasts.map(rangesOf);
  return {
    reach: sum(
      rs.map((r) => r.reach),
      1
    ),
    clicks: sum(
      rs.map((r) => r.clicks),
      1
    ),
    conversions: sum(
      rs.map((r) => r.conversions),
      0.1
    ),
  };
}

/** Plan totals' ranges, derived from the mix when the plan predates M5. */
export function totalsRangesOf(totals: PlanTotals, forecasts: ChannelForecast[]): NonNullable<PlanTotals["ranges"]> {
  return totals.ranges ?? totalRanges(forecasts);
}

export function isOrdered(r: ForecastRange): boolean {
  return r.low <= r.mid && r.mid <= r.high && r.low >= 0;
}

/** "42K–61K" style label using the caller's formatter. */
export function rangeText(r: ForecastRange, fmt: (n: number) => string): string {
  const lo = fmt(r.low);
  const hi = fmt(r.high);
  return lo === hi ? lo : `${lo}–${hi}`;
}
