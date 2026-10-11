import "server-only";
import { allocateBudget } from "./allocate";
import { templateCreative } from "./copy-templates";
import { buildCalendar } from "./enrich/calendar";
import { fetchLocalMarket } from "./enrich/places";
import { runEnrichment } from "./enrich/signal";
import { buildReadiness } from "./enrich/site-readiness";
import { buildRealityCheck, hasRealityInputs } from "./reality-check";
import {
  ESTIMATE_DISCLAIMER,
  type EnrichmentBundle,
  type PlanInput,
  type PlanResult,
  type RealityCheck,
  type TraceMeta,
  type ZeroRupeeItem,
} from "./types";
import { newPlanId } from "./format";
import { rollupForecast, seasonFactor, type SeasonAdjust } from "./forecast";
import { fillWithLlm, mergeCreative, recognizeWithLlm } from "./llm";
import { mergeIntel, recognizeHeuristic } from "./recognize";
import { getRateCard } from "./storage";
import { lookupPlacements } from "./placements";
import { scrapeSite } from "./scrape";
import { scoreChannels } from "./scoring";
import { createTrace, type TraceListener } from "./trace";
import { buildZeroRupee } from "./zero-rupee";

const BUDGET_MS = 14000;

/**
 * 1 scrape → 2 recognize product → 3 enrich (parallel, optional) → 4 XGBoost
 * → 5 signal adjust → 6 allocate → 7 forecast → 8 reality check → copy. Every step is a trace span.
 */
export async function runAgent(
  input: PlanInput,
  opts: {
    onEvent?: TraceListener;
    /**
     * v1 path for the eval harness (F16): no enrichment and no v2 layers
     * (season adjust, zero-rupee, reality check). The mix equals v1's.
     */
    baseline?: boolean;
  } = {}
): Promise<PlanResult> {
  const v2 = !opts.baseline;
  const trace = createTrace(Date.now, opts.onEvent);
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
  let enrichment: EnrichmentBundle | undefined;
  if (v2) {
    enrichment = await trace.span(
      "enrich",
      () =>
        runEnrichment(
          {
            siteReadiness: () => buildReadiness(site, input),
            calendar: () => buildCalendar(input, product.category),
            localMarket: () => fetchLocalMarket(input, product),
          },
          (key, signal) => trace.signal(key, signal, "enrich")
        ),
      { meta: (b) => ({ sources: Object.keys(b).length }) }
    );
  } else {
    trace.skip("enrich", "baseline (v1)");
  }

  const rateCard = await trace.span("rate_card", () => getRateCard(), {
    meta: (c) => ({ version: c.version }),
  });
  const scores = await trace.span(
    "score",
    () =>
      scoreChannels(input, { category: product.category, priceTier: product.priceTier }, rateCard),
    { meta: (s) => ({ channels: s.length, rejected: s.filter((x) => x.rejected).length }) }
  );
  // Step 5: signals that change the numbers (M1: festival-week CPM multipliers).
  const season = await trace.span(
    "signal_adjust",
    (): SeasonAdjust | undefined => {
      const cal = enrichment?.calendar;
      if (!cal || cal.status !== "ok" || !cal.data) return undefined;
      return {
        weekMultipliers: cal.data.weekMultipliers,
        weekFestivals: cal.data.weekFestivals,
      };
    },
    { meta: (s) => ({ seasonFactor: Math.round(seasonFactor(s) * 1000) / 1000 }) }
  );
  // F10: free actions before the paid mix, ranked from signals + brief.
  let zeroRupee: ZeroRupeeItem[] | undefined;
  if (enrichment) {
    const signals = enrichment;
    zeroRupee = await trace.span(
      "zero_rupee",
      () =>
        buildZeroRupee({
          input,
          category: product.category,
          readiness: signals.siteReadiness,
          localMarket: signals.localMarket,
        }),
      { meta: (z) => ({ items: z.length, ...(z[0] ? { first: z[0].id } : {}) }) }
    );
  } else {
    trace.skip("zero_rupee", "baseline (v1)");
  }
  const mix = await trace.span(
    "allocate",
    () => allocateBudget(input, scores, rateCard, product.priceTier, season),
    { meta: (m) => ({ channels: m.length }) }
  );
  const { totals, weeklyForecast } = await trace.span(
    "forecast",
    () => rollupForecast(mix, input, product.priceTier, season),
    { meta: (f) => ({ impressions: f.totals.impressions, weeks: f.weeklyForecast.length }) }
  );
  // Step 8 (F8): break-even verdict, only when the brief has price + margin.
  let realityCheck: RealityCheck | undefined;
  if (v2 && hasRealityInputs(input)) {
    realityCheck = await trace.span(
      "reality_check",
      () => {
        try {
          return buildRealityCheck({ input, clicks: totals.clicks });
        } catch {
          return undefined;
        }
      },
      { meta: (r): TraceMeta => (r ? { verdict: r.verdict, breakEvenUnits: r.breakEvenUnits } : { verdict: "none" }) }
    );
  } else {
    trace.skip("reality_check", v2 ? "no price/margin" : "baseline (v1)");
  }
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
    ...(enrichment ? { enrichment } : {}),
    ...(zeroRupee ? { zeroRupee } : {}),
    ...(realityCheck ? { realityCheck } : {}),
    trace: planTrace,
  };
}
