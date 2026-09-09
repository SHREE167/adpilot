"use server";

import { runAgent } from "@/lib/agent";
import {
  getPlan,
  getRateCard,
  listPlans,
  putRateCard,
  savePlan,
  storageMode,
} from "@/lib/storage";
import type { PlanInput, PlanListItem, PlanResult, RateCard } from "@/lib/types";
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
