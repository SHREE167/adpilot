import type { PlanListItem, PlanResult } from "./types";
import { summarize } from "./summarize";

const PLANS_KEY = "adpilot.plans.v1";
const LAST_KEY = "adpilot.lastResult";

let memoryLast: PlanResult | null = null;

function canUseDom(): boolean {
  return typeof window !== "undefined" && typeof localStorage !== "undefined";
}

export function savePlanLocal(plan: PlanResult): void {
  memoryLast = plan;
  if (!canUseDom()) return;
  localStorage.setItem(LAST_KEY, JSON.stringify(plan));
  const next = [plan, ...loadAllRaw().filter((p) => p.id !== plan.id)].slice(0, 50);
  localStorage.setItem(PLANS_KEY, JSON.stringify(next));
}

function loadAllRaw(): PlanResult[] {
  if (!canUseDom()) return memoryLast ? [memoryLast] : [];
  try {
    const raw = localStorage.getItem(PLANS_KEY);
    if (!raw) return memoryLast ? [memoryLast] : [];
    const parsed = JSON.parse(raw) as PlanResult[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function listPlansLocal(): PlanListItem[] {
  return loadAllRaw()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(summarize);
}

export function getPlanLocal(id: string): PlanResult | null {
  if (memoryLast?.id === id) return memoryLast;
  if (!canUseDom()) return null;
  const all = loadAllRaw();
  const found = all.find((p) => p.id === id);
  if (found) return found;
  try {
    const last = localStorage.getItem(LAST_KEY);
    if (!last) return null;
    const plan = JSON.parse(last) as PlanResult;
    if (plan.id === id) return plan;
  } catch {
    /* ignore */
  }
  return null;
}

export function getLastLocal(): PlanResult | null {
  if (memoryLast) return memoryLast;
  if (!canUseDom()) return null;
  try {
    const last = localStorage.getItem(LAST_KEY);
    return last ? (JSON.parse(last) as PlanResult) : null;
  } catch {
    return null;
  }
}

export function mergeLists(
  server: PlanListItem[],
  local: PlanListItem[]
): PlanListItem[] {
  const map = new Map<string, PlanListItem>();
  for (const p of [...local, ...server]) map.set(p.id, p);
  return [...map.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
