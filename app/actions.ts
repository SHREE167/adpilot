"use server";

import { runAgent } from "@/lib/agent";
import { fetchPageSpeed, PAGESPEED_SOURCE, publicSiteUrl } from "@/lib/enrich/pagespeed";
import { skipped } from "@/lib/enrich/signal";
import {
  getPlan,
  getRateCard,
  listPlans,
  putRateCard,
  savePlan,
  storageMode,
} from "@/lib/storage";
import type {
  PageSpeedResult,
  PlanInput,
  PlanListItem,
  PlanResult,
  RateCard,
  Signal,
} from "@/lib/types";
import { parsePlanInput } from "@/lib/validate";

export async function createPlan(
  raw: PlanInput
): Promise<{ plan: PlanResult } | { error: string }> {
  try {
    const input = parsePlanInput(raw);
    const plan = await runAgent(input);
    await savePlan(plan);
    return { plan };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Failed to build plan",
    };
  }
}

/**
 * F1 part B, deferred: the dashboard calls this after render, so the plan never
 * waits on PageSpeed (often 10-30s). Prefers the stored plan's scraped URL; a
 * client URL is only used when the plan is not in storage, and only if public.
 * Never throws.
 */
export async function checkPageSpeed(
  planId: string,
  clientUrl?: string
): Promise<Signal<PageSpeedResult>> {
  try {
    const stored = await getPlan(planId).catch(() => null);
    if (stored && (!stored.site?.scraped || !stored.site.url)) {
      return skipped(PAGESPEED_SOURCE, "site was not reachable when the plan was made");
    }
    const url = stored ? stored.site.url : publicSiteUrl(clientUrl);
    const signal = await fetchPageSpeed(url);
    if (stored?.enrichment && signal.status === "ok") {
      await savePlan({ ...stored, enrichment: { ...stored.enrichment, pageSpeed: signal } }).catch(
        () => undefined
      );
    }
    return signal;
  } catch {
    return skipped(PAGESPEED_SOURCE, "PageSpeed check unavailable");
  }
}

export async function loadPlan(
  id: string
): Promise<{ plan: PlanResult | null; storage: string }> {
  const plan = await getPlan(id);
  return { plan, storage: storageMode() };
}

export async function loadPlans(): Promise<{
  plans: PlanListItem[];
  source: "postgres" | "memory";
  storage: string;
}> {
  const { source, plans } = await listPlans();
  return { plans, source, storage: storageMode() };
}

export async function loadRateCard(): Promise<{
  rateCard: RateCard;
  storage: string;
}> {
  const rateCard = await getRateCard();
  return { rateCard, storage: storageMode() };
}

export async function saveRateCard(
  data: RateCard
): Promise<{ rateCard: RateCard; storage: string } | { error: string }> {
  try {
    const rateCard = await putRateCard(data);
    return { rateCard, storage: storageMode() };
  } catch (err) {
    return {
      error: err instanceof Error ? err.message : "Invalid rate card",
    };
  }
}
