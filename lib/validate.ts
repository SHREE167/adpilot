import { GOALS, type GoalId, type PlanInput } from "./types";

const GOAL_IDS = new Set(GOALS.map((g) => g.id));

export function parsePlanInput(body: unknown): PlanInput {
  if (!body || typeof body !== "object") {
    throw new Error("JSON body required");
  }
  const b = body as Record<string, unknown>;
  const product_name = String(b.product_name || "").trim();
  if (!product_name) throw new Error("product_name is required");
  const budget = Number(b.budget);
  if (!Number.isFinite(budget) || budget < 500) {
    throw new Error("budget must be at least ₹500");
  }
  if (budget > 10_000_000) throw new Error("budget is implausibly large");
  const city = String(b.city || "").trim();
  if (!city) throw new Error("city is required");
  const goalRaw = String(b.goal || "sales").trim().toLowerCase();
  const goal = (GOAL_IDS.has(goalRaw as GoalId) ? goalRaw : goalRaw) as GoalId | string;
  return {
    domain: String(b.domain || "").trim(),
    product_name,
    budget: Math.round(budget),
    city,
    audience_age: String(b.audience_age || "18-34").trim(),
    audience_notes: String(b.audience_notes || "").trim(),
    goal,
    language: String(b.language || "English").trim() || "English",
  };
}
