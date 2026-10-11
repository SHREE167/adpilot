import type { PageSpeedResult } from "./types";

/** Google's Core Web Vitals LCP bands (ms). */
export const LCP_GOOD_MS = 2500;
export const LCP_POOR_MS = 4000;

export type SpeedBand = "good" | "needs_work" | "poor";

/** Real-user data wins over the lab run when Google has it. */
export function speedBand(r: PageSpeedResult): SpeedBand {
  if (r.fieldLcp === "SLOW") return "poor";
  if (r.fieldLcp === "FAST") return "good";
  if (r.fieldLcp === "AVERAGE") return "needs_work";
  if (r.lcpMs > LCP_POOR_MS) return "poor";
  return r.lcpMs > LCP_GOOD_MS ? "needs_work" : "good";
}

export function seconds(ms: number): string {
  return `${(Math.round(ms / 100) / 10).toFixed(1)}s`;
}

/** Brief rule: LCP > 4s → fix speed first. Null when speed is not the blocker. */
export function speedFix(r: PageSpeedResult | undefined): string | null {
  if (!r || speedBand(r) !== "poor") return null;
  return `Your page takes ${seconds(r.lcpMs)} to show its main content on a phone. Fix speed before paying for clicks: compress images and cut heavy scripts.`;
}
