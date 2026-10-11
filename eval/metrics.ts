// F16 eval metrics. Pure functions over PlanResult; no I/O, no network.
import { groundingSet } from "@/lib/grounding-guard";
import { kitEvidence, kitTexts } from "@/lib/launch-kit";
import type { PlanResult } from "@/lib/types";

/** 1 - |A ∩ B| / |A ∪ B|. Two empty sets are identical (0). */
export function jaccardDistance(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const union = new Set([...A, ...B]);
  if (!union.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return 1 - inter / union.size;
}

/** Mean Jaccard distance over every unordered pair of sets. */
export function meanPairwiseJaccard(sets: readonly (readonly string[])[]): number {
  let sum = 0;
  let n = 0;
  for (let i = 0; i < sets.length; i++) {
    for (let j = i + 1; j < sets.length; j++) {
      sum += jaccardDistance(sets[i], sets[j]);
      n++;
    }
  }
  return n ? sum / n : 0;
}

/** Linear-interpolated percentile, p in [0, 100]. */
export function percentile(values: readonly number[], p: number): number {
  if (!values.length) return 0;
  const s = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (s.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return s[lo] + (s[hi] - s[lo]) * (rank - lo);
}

export function mixChannels(plan: PlanResult): string[] {
  return plan.mix.map((m) => m.channelId).sort();
}

export function mixSumsToBudget(plan: PlanResult): boolean {
  return plan.mix.reduce((s, m) => s + m.budget, 0) === plan.input.budget;
}

/**
 * Specificity: grounded facts the plan cites, each traceable to an ok signal
 * (or, for the reality check, to numbers the user typed). Places facts count
 * only when the signal's query names the brief's city, so a fallback fixture
 * for another city cannot inflate the score.
 */
export function groundedFacts(plan: PlanResult): string[] {
  const facts: string[] = [];
  const e = plan.enrichment;
  const ready = e?.siteReadiness;
  if (ready?.status === "ok" && ready.data) {
    for (const f of ready.data.fixes) facts.push(`readiness: ${f}`);
  }
  const cal = e?.calendar;
  if (cal?.status === "ok" && cal.data) {
    for (const h of [...cal.data.inWindow, ...cal.data.upcoming]) facts.push(`festival: ${h.name} ${h.date}`);
  }
  for (const w of plan.weeklyForecast) {
    if (w.cpmMultiplier && w.cpmMultiplier > 1) facts.push(`season week ${w.week} ×${w.cpmMultiplier}`);
  }
  const lm = e?.localMarket;
  const city = plan.input.city.trim().toLowerCase();
  if (lm?.status === "ok" && lm.data && city && lm.data.query.toLowerCase().includes(city)) {
    facts.push(`places: ${lm.data.count}${lm.data.more ? "+" : ""} competitors`);
    if (lm.data.avgRating !== null) facts.push(`places: avg rating ${lm.data.avgRating}`);
    for (const t of lm.data.top) facts.push(`places: ${t.name}`);
    facts.push(`places: own listing ${lm.data.own.found ? "found" : "missing"}`);
  }
  const au = e?.audience;
  if (au?.status === "ok" && au.data && city && au.data.city.name.toLowerCase() === city) {
    facts.push(`meta: pool ${au.data.lower}-${au.data.upper}`);
    for (const i of au.data.interests) facts.push(`meta: interest ${i.name}`);
  }
  const cr = e?.creators;
  if (cr?.status === "ok" && cr.data && city && cr.data.query.toLowerCase().includes(city)) {
    for (const c of cr.data.picks) facts.push(`creator: ${c.title}`);
  }
  for (const z of plan.zeroRupee || []) {
    if (z.sources.length) facts.push(`zero-rupee: ${z.id}`);
  }
  if (plan.realityCheck) facts.push(`reality: ${plan.realityCheck.breakEvenUnits} sales to break even`);
  return facts;
}

/**
 * Explanation additivity of v1's zero-ablation: deltas_i = f(x) - f(x with
 * feature i zeroed), baseline f(0). Additive when f(0) + Σ deltas == f(x).
 */
export function ablationAdditive(
  predict: (x: number[]) => number,
  x: readonly number[],
  tol = 1e-3
): boolean {
  const fx = predict([...x]);
  const base = predict(x.map(() => 0));
  let sum = 0;
  for (let i = 0; i < x.length; i++) {
    const x0 = [...x];
    x0[i] = 0;
    sum += fx - predict(x0);
  }
  return Math.abs(base + sum - fx) <= tol;
}

/** Share of briefs whose recognized category equals the labelled one, plus the misses. */
export function categoryAccuracy(
  rows: readonly { id: string; expected?: string; actual: string }[]
): { correct: number; total: number; misses: { id: string; expected: string; actual: string }[] } {
  const labelled = rows.filter((r): r is { id: string; expected: string; actual: string } => Boolean(r.expected));
  const misses = labelled.filter((r) => r.expected !== r.actual);
  return { correct: labelled.length - misses.length, total: labelled.length, misses };
}

export function pctOf(n: number, d: number): number {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

/** Word n-gram set of a text (lowercased, letters/digits only). */
export function shingles(text: string, n = 3): Set<string> {
  const w = text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const out = new Set<string>();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "));
  return out;
}

/** Mean pairwise Jaccard SIMILARITY of shingle sets (0 = nothing shared, 1 = identical). Lower = more specific. */
export function meanPairwiseSimilarity(texts: readonly string[], n = 3): number {
  const sets = texts.map((t) => [...shingles(t, n)]);
  return sets.length > 1 ? 1 - meanPairwiseJaccard(sets) : 0;
}

/** Everything a plan's generated text may cite: structured plan data + signals (no free text). */
export function planEvidence(plan: PlanResult): number[] {
  const { input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements } = plan;
  return groundingSet(
    { input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements },
    plan.launchKit ? kitEvidence(plan.launchKit) : null
  );
}

export function kitText(plan: PlanResult): string {
  return plan.launchKit ? Object.values(kitTexts(plan.launchKit)).join("\n") : "";
}

/** Generated text the guard is responsible for: the kit, plus LLM copy when an LLM wrote it. */
export function guardedTexts(plan: PlanResult): string[] {
  const out = plan.launchKit ? Object.values(kitTexts(plan.launchKit)) : [];
  if (plan.llmUsed) {
    out.push(...plan.mix.map((m) => m.explanation));
    for (const a of plan.adAngles) out.push(a.headline, a.primaryText, a.cta);
    for (const o of plan.outreach) out.push(o.title, o.body);
  }
  return out;
}

/** v1 template ad angles + outreach + explanations (not LLM, not guarded): illustrative offers. */
export function templateCopyTexts(plan: PlanResult): string[] {
  if (plan.llmUsed) return [];
  const out = plan.mix.map((m) => m.explanation);
  for (const a of plan.adAngles) out.push(a.headline, a.primaryText, a.cta);
  for (const o of plan.outreach) out.push(o.title, o.body);
  return out;
}
