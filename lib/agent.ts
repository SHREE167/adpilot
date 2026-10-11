import "server-only";
import { allocateBudget } from "./allocate";
import { templateCreative } from "./copy-templates";
import { buildCalendar } from "./enrich/calendar";
import { fetchLocalMarket } from "./enrich/places";
import { fetchCreators } from "./enrich/youtube-creators";
import { fetchAudience } from "./enrich/meta-reach";
import { runEnrichment } from "./enrich/signal";
import { buildReadiness } from "./enrich/site-readiness";
import { buildBudgetGrid } from "./budget-grid";
import { buildRealityCheck, hasRealityInputs } from "./reality-check";
import {
  ESTIMATE_DISCLAIMER,
  type BudgetGrid,
  type ChannelAllocation,
  type EnrichmentBundle,
  type LaunchKit,
  type PlanInput,
  type PlanResult,
  type PlanShap,
  type RealityCheck,
  type TraceMeta,
  type ZeroRupeeItem,
} from "./types";
import { newPlanId } from "./format";
import { capMetaReach, rollupForecast, seasonFactor, type SeasonAdjust } from "./forecast";
import { fillWithLlm, mergeCreative, recognizeWithLlm, rewriteLaunchKit, type KitRewrite } from "./llm";
import { groundingSet, guardText, isEnglishText } from "./grounding-guard";
import { buildLaunchKit, guardKitTexts, kitEvidence, kitTexts } from "./launch-kit";
import { mergeIntel, recognizeHeuristic } from "./recognize";
import { getRateCard } from "./storage";
import { lookupPlacements } from "./placements";
import { scrapeSite } from "./scrape";
import { explainChannels, scoreChannels } from "./scoring";
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
      meta: (r): TraceMeta => ({ used: r.used, provider: r.provider ?? "none", ...(r.fallback ? { fallback: r.fallback } : {}) }),
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
            creators: () => fetchCreators(input, product),
            audience: () => fetchAudience(input, product),
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
  // Step 4b (F9): exact TreeSHAP per channel, for the "Why this channel?" waterfall.
  let shap: PlanShap | undefined;
  if (v2) {
    shap = await trace.span(
      "shap",
      () => explainChannels(input, { category: product.category, priceTier: product.priceTier }, scores),
      { meta: (s) => ({ channels: s.channels.length }) }
    );
  } else {
    trace.skip("shap", "baseline (v1)");
  }
  // Step 4c (F11): scores at 11 budgets (0.25x-4x) for the client-side slider. Model stays on the server.
  let budgetGrid: BudgetGrid | undefined;
  if (v2) {
    budgetGrid = await trace.span(
      "budget_grid",
      () => buildBudgetGrid(input, { category: product.category, priceTier: product.priceTier }, rateCard),
      { meta: (g) => ({ points: g.points.length, shap: g.points.reduce((s, p) => s + p.shap.length, 0) }) }
    );
  } else {
    trace.skip("budget_grid", "baseline (v1)");
  }
  // Step 5: signals that change the numbers: festival-week CPM multipliers (F3)
  // and Meta's audience pool as a reach ceiling (F4). Only ok signals count.
  const { season, reachPool } = await trace.span(
    "signal_adjust",
    (): { season?: SeasonAdjust; reachPool?: number } => {
      const cal = enrichment?.calendar;
      const aud = enrichment?.audience;
      return {
        ...(cal?.status === "ok" && cal.data
          ? { season: { weekMultipliers: cal.data.weekMultipliers, weekFestivals: cal.data.weekFestivals } }
          : {}),
        ...(aud?.status === "ok" && aud.data ? { reachPool: aud.data.upper } : {}),
      };
    },
    {
      meta: (a) => ({
        seasonFactor: Math.round(seasonFactor(a.season) * 1000) / 1000,
        ...(a.reachPool ? { reachPool: a.reachPool } : {}),
      }),
    }
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
    () => capMetaReach(allocateBudget(input, scores, rateCard, product.priceTier, season), reachPool),
    { meta: (m) => ({ channels: m.length, reachCapped: m.filter((r) => r.forecast.reachCapped).length }) }
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
          return buildRealityCheck({ input, clicks: totals.clicks, clicksRange: totals.ranges?.clicks });
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

  const rejected = scores
    .filter((s) => s.rejected || !mix.some((m) => m.channelId === s.channelId))
    .sort((a, b) => b.score - a.score);
  // Placements only read channel ids/names, so they run before copy and feed the kit's keywords.
  const placements = await trace.span(
    "placements",
    () => lookupPlacements(mix, input, product),
    { meta: (p) => ({ picks: p.length }) }
  );

  // Step 10 (F7): deterministic launch kit from the mix + signals.
  let launchKit: LaunchKit | undefined;
  if (v2) {
    launchKit = await trace.span(
      "launch_kit",
      () => buildLaunchKit({ input, category: product.category, mix, placements, enrichment }),
      { meta: (k) => ({ channels: k.channels.length, sources: new Set(k.channels.flatMap((c) => c.sources)).size }) }
    );
  } else {
    trace.skip("launch_kit", "baseline (v1)");
  }

  // Copy LLM and kit rewrite run in parallel; both are wording only.
  let kitRewrite: KitRewrite | null = null;
  if (remaining() > 3500) {
    const baseKit = launchKit;
    const [llm, rew] = await Promise.all([
      trace.span("copy_llm", () => fillWithLlm(input, mix, product, site), {
        meta: (r): TraceMeta => ({ used: r.used, provider: r.provider ?? "none", ...(r.fallback ? { fallback: r.fallback } : {}) }),
      }),
      baseKit
        ? trace.span("launch_kit_llm", () => rewriteLaunchKit(kitTexts(baseKit), input, product.tone), {
            meta: (r): TraceMeta => ({
              used: r.used,
              provider: r.provider ?? "none",
              ...(r.mock ? { mock: true } : {}),
              ...(r.fallback ? { fallback: r.fallback } : {}),
            }),
          })
        : Promise.resolve(null),
    ]);
    kitRewrite = rew;
    llmUsed = llm.used;
    llmProvider = llm.used ? llm.provider : null;
    creative = mergeCreative(mix, templates, llm.fill);
    // Wording only: the channels were scored on this category/tier, so they stay fixed.
    if (llm.product) {
      product = mergeIntel(product, { ...llm.product, category: undefined, priceTier: undefined });
    }
  } else {
    trace.skip("copy_llm", "time budget");
    if (launchKit) trace.skip("launch_kit_llm", "time budget");
  }

  // Grounding guard (F7): every number in LLM text must trace to the plan or a signal.
  if (v2) {
    const kitBefore = launchKit;
    const guarded = await trace.span(
      "grounding_guard",
      () => {
        const evidence = groundingSet(
          { input, mix, totals, weeklyForecast, realityCheck, enrichment, zeroRupee, placements },
          kitBefore ? kitEvidence(kitBefore) : null
        );
        let checked = 0;
        let nonEnglish = 0;
        const removed: string[] = [];
        let kit = kitBefore;
        if (kitBefore && kitRewrite?.texts) {
          const r = guardKitTexts(kitBefore, kitRewrite.texts, evidence, guardText, isEnglishText);
          kit = r.kit;
          checked += r.checked;
          nonEnglish += r.nonEnglish;
          removed.push(...r.removed);
        }
        let copy = creative;
        // Template and LLM copy alike: ad angles, outreach scripts and explanations.
        {
          const r = guardCreative(creative, mix, templates, evidence);
          copy = r.creative;
          checked += r.checked;
          nonEnglish += r.nonEnglish;
          removed.push(...r.removed);
        }
        return { kit, copy, checked, removed, nonEnglish };
      },
      {
        meta: (g): TraceMeta => ({
          checked: g.checked,
          removed: g.removed.length,
          ...(g.nonEnglish ? { nonEnglish: g.nonEnglish } : {}),
          ...(g.removed.length ? { samples: g.removed.slice(0, 5).join(" | ") } : {}),
        }),
      }
    );
    creative = guarded.copy;
    if (guarded.kit) {
      launchKit = {
        ...guarded.kit,
        wording: kitRewrite?.used && kitRewrite.provider ? kitRewrite.provider + (kitRewrite.mock ? " (recorded)" : "") : "template",
        guard: {
          checked: guarded.checked,
          removed: guarded.removed.length,
          samples: guarded.removed.slice(0, 5),
          ...(guarded.nonEnglish ? { nonEnglish: guarded.nonEnglish } : {}),
        },
      };
    }
  } else {
    trace.skip("grounding_guard", "baseline (v1)");
  }

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
    ...(shap ? { shap } : {}),
    ...(budgetGrid ? { budgetGrid } : {}),
    ...(launchKit ? { launchKit } : {}),
    trace: planTrace,
  };
}

/**
 * Guard ad copy and outreach scripts (template or LLM): explanations with an
 * untraceable number fall back to the template line; ad angles and outreach
 * lose the offending number tokens.
 */
function guardCreative(
  creative: { mix: ChannelAllocation[]; adAngles: PlanResult["adAngles"]; outreach: PlanResult["outreach"] },
  mix: ChannelAllocation[],
  templates: { explanations: Record<string, string>; adAngles: PlanResult["adAngles"]; outreach: PlanResult["outreach"] },
  evidence: readonly number[]
): { creative: typeof creative; checked: number; removed: string[]; nonEnglish: number } {
  let checked = 0;
  let nonEnglish = 0;
  const removed: string[] = [];
  const templateExplanations = templates.explanations;
  // English only: a non-English LLM item falls back to the template item in the same slot.
  const english = <T>(item: T, texts: string[], fallback: T | undefined): T => {
    if (texts.every(isEnglishText) || !fallback) return item;
    nonEnglish++;
    return fallback;
  };
  const g = (text: string) => {
    const r = guardText(text, evidence);
    checked += r.checked;
    removed.push(...r.removed);
    return r;
  };
  const nextMix = creative.mix.map((row) => {
    if (!isEnglishText(row.explanation) && templateExplanations[row.channelId]) {
      nonEnglish++;
      return { ...row, explanation: templateExplanations[row.channelId] };
    }
    const r = g(row.explanation);
    if (!r.removed.length) return row;
    const fallback = templateExplanations[row.channelId] ?? mix.find((m) => m.channelId === row.channelId)?.explanation ?? r.text;
    return { ...row, explanation: fallback };
  });
  const adAngles = creative.adAngles
    .map((a, i) => english(a, [a.headline, a.primaryText, a.cta], templates.adAngles[i]))
    .map((a) => ({
    ...a,
    headline: g(a.headline).text,
    primaryText: g(a.primaryText).text,
    cta: g(a.cta).text,
  }));
  const outreach = creative.outreach
    .map((o, i) => english(o, [o.title, o.body], templates.outreach[i]))
    .map((o) => ({ ...o, title: g(o.title).text, body: g(o.body).text }));
  return { creative: { mix: nextMix, adAngles, outreach }, checked, removed, nonEnglish };
}
