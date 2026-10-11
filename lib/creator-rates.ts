// F5: collab cost band for a creator's size. Static data, always ESTIMATE. Client-safe.
import rates from "@/data/creator-rates.json";

export interface CostBand {
  id: string;
  label: string;
  low: number;
  high: number;
  /** Small creators often take product/barter instead of cash. */
  barter: boolean;
}

/** Inclusive lower bound, exclusive upper (the top band includes its max). */
export function costBand(subscribers: number): CostBand | null {
  const bands = rates.bands;
  const hit = bands.find(
    (b, i) => subscribers >= b.minSubs && (subscribers < b.maxSubs || (i === bands.length - 1 && subscribers <= b.maxSubs))
  );
  return hit ? { id: hit.id, label: hit.label, low: hit.low, high: hit.high, barter: hit.barter } : null;
}

export const CREATOR_MIN_SUBS = rates.bands[0].minSubs;
export const CREATOR_MAX_SUBS = rates.bands[rates.bands.length - 1].maxSubs;
