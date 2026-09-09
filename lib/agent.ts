import "server-only";
import { allocateBudget } from "./allocate";
import { templateCreative } from "./copy-templates";
import { ESTIMATE_DISCLAIMER, type PlanInput, type PlanResult } from "./types";
import { newPlanId } from "./format";
import { rollupForecast } from "./forecast";
import { fillWithLlm, mergeCreative, recognizeWithLlm } from "./llm";
import { mergeIntel, recognizeHeuristic } from "./recognize";
import { getRateCard } from "./storage";
import { lookupPlacements } from "./placements";
import { scrapeSite } from "./scrape";
import { scoreChannels } from "./scoring";

/**
 * 1 scrape → 2 recognize product → 3 XGBoost → 4 allocate → 5 forecast → 6 copy
 */
export async function runAgent(input: PlanInput): Promise<PlanResult> {
  const started = Date.now();
  const site = await scrapeSite(input.domain, input.product_name);
  let product = recognizeHeuristic(input, site);

  const remainingAfterScrape = 14000 - (Date.now() - started);
  if (remainingAfterScrape > 4000) {
    const rec = await recognizeWithLlm(input, site, product);
    if (rec.product) {
      product = mergeIntel(product, rec.product);
    }
  }

  const rateCard = await getRateCard();
  const scores = scoreChannels(
    input,
    { category: product.category, priceTier: product.priceTier },
    rateCard
  );
  const mix = allocateBudget(input, scores, rateCard, product.priceTier);
  const { totals, weeklyForecast } = rollupForecast(mix, input, product.priceTier);
  const templates = templateCreative(
    input,
    mix,
    product.category,
    product.priceTier,
    product
  );

  let llmUsed = false;
  let llmProvider: string | null = null;
  let creative = mergeCreative(mix, templates, null);

  const remaining = 14000 - (Date.now() - started);
  if (remaining > 3500) {
    const llm = await fillWithLlm(input, mix, product, site);
    llmUsed = llm.used;
    llmProvider = llm.used ? llm.provider : null;
    creative = mergeCreative(mix, templates, llm.fill);
    if (llm.product) product = mergeIntel(product, llm.product);
  }

  const rejected = scores
    .filter((s) => s.rejected || !mix.some((m) => m.channelId === s.channelId))
    .sort((a, b) => b.score - a.score);
  const placements = lookupPlacements(creative.mix, input, product);

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
    agentMs: Date.now() - started,
    scorer: "xgboost",
  };
}
