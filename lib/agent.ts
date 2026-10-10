import "server-only";
import { allocateBudget } from "./allocate";
import { templateCreative } from "./copy-templates";
import { runEnrichment } from "./enrich/signal";
import {
  ESTIMATE_DISCLAIMER,
  type EnrichmentBundle,
  type PlanInput,
  type PlanResult,
} from "./types";
import { newPlanId } from "./format";
import { rollupForecast } from "./forecast";
import { fillWithLlm, mergeCreative, recognizeWithLlm } from "./llm";
import { mergeIntel, recognizeHeuristic } from "./recognize";
import { getRateCard } from "./storage";
import { lookupPlacements } from "./placements";
import { scrapeSite } from "./scrape";
import { scoreChannels } from "./scoring";
import { createTrace } from "./trace";

const BUDGET_MS = 14000;

/**
 * 1 scrape → 2 recognize product → 3 enrich (parallel, optional) → 4 XGBoost
 * → 5 signal adjust → 6 allocate → 7 forecast → 8 copy. Every step is a trace span.
 */
export async function runAgent(input: PlanInput): Promise<PlanResult> {
  const trace = createTrace();
  const remaining = () => BUDGET_MS - trace.elapsed();

  const site = await trace.span("scrape", () => scrapeSite(input.domain, input.product_name), {
    meta: (s) => ({ scraped: s.scraped, ...(s.scrapeError ? { reason: s.scrapeError } : {}) }),
  });

  let product = await trace.span("recognize", () => recognizeHeuristic(input, site), {
    meta: (p) => ({ category: p.category, priceTier: p.priceTier }),
  });

  if (remaining() > 4000) {
    const rec = await trace.span("recognize_llm", () => recognizeWithLlm(input, site, product), {
      meta: (r) => ({ used: r.used, provider: r.provider ?? "none" }),
    });
    if (rec.product) {
      product = mergeIntel(product, rec.product);
    }
  } else {
    trace.skip("recognize_llm", "time budget");
  }

  // Step 3: every source is optional, time-boxed and never throws.
  const enrichment: EnrichmentBundle = await trace.span(
    "enrich",
    () => runEnrichment({}, (key, signal) => trace.signal(key, signal, "enrich")),
    { meta: (b) => ({ sources: Object.keys(b).length }) }
  );

  const rateCard = await trace.span("rate_card", () => getRateCard(), {
    meta: (c) => ({ version: c.version }),
  });
  const scores = await trace.span(
    "score",
    () =>
      scoreChannels(input, { category: product.category, priceTier: product.priceTier }, rateCard),
    { meta: (s) => ({ channels: s.length, rejected: s.filter((x) => x.rejected).length }) }
  );
  const mix = await trace.span(
    "allocate",
    () => allocateBudget(input, scores, rateCard, product.priceTier),
    { meta: (m) => ({ channels: m.length }) }
  );
  const { totals, weeklyForecast } = await trace.span(
    "forecast",
    () => rollupForecast(mix, input, product.priceTier),
    { meta: (f) => ({ impressions: f.totals.impressions, weeks: f.weeklyForecast.length }) }
  );
  const templates = await trace.span("copy_template", () =>
    templateCreative(input, mix, product.category, product.priceTier, product)
  );

  let llmUsed = false;
  let llmProvider: string | null = null;
  let creative = mergeCreative(mix, templates, null);

  if (remaining() > 3500) {
    const llm = await trace.span("copy_llm", () => fillWithLlm(input, mix, product, site), {
      meta: (r) => ({ used: r.used, provider: r.provider ?? "none" }),
    });
    llmUsed = llm.used;
    llmProvider = llm.used ? llm.provider : null;
    creative = mergeCreative(mix, templates, llm.fill);
    if (llm.product) product = mergeIntel(product, llm.product);
  } else {
    trace.skip("copy_llm", "time budget");
  }

  const rejected = scores
    .filter((s) => s.rejected || !mix.some((m) => m.channelId === s.channelId))
    .sort((a, b) => b.score - a.score);
  const placements = await trace.span(
    "placements",
    () => lookupPlacements(creative.mix, input, product),
    { meta: (p) => ({ picks: p.length }) }
  );

  const planTrace = trace.finish();

  return {
    id: newPlanId(),
    createdAt: new Date().toISOString(),
    input,
    site,
    product,
    category: product.category,
    priceTier: product.priceTier,
    scores,
    mix: creative.mix,
    placements,
    rejected,
    totals,
    weeklyForecast,
    adAngles: creative.adAngles,
    outreach: creative.outreach,
    llmUsed,
    llmProvider,
    disclaimer: ESTIMATE_DISCLAIMER,
    estimateLabel: "ESTIMATE",
    agentMs: planTrace.totalMs,
    scorer: "xgboost",
    planVersion: 2,
    enrichment,
    trace: planTrace,
  };
}
