import { GOALS, type GoalId, type PlanInput } from "./types";

const GOAL_IDS = new Set(GOALS.map((g) => g.id));

function blank(v: unknown): boolean {
  return v === undefined || v === null || (typeof v === "string" && !v.trim());
}

/**
 * F8 optional pair. Both blank or only one filled: skip the reality check
 * silently. Both filled: price > 0 and margin 1-95 %, else a readable error.
 */
export function parseRealityInputs(
  priceRaw: unknown,
  marginRaw: unknown
): { price?: number; margin?: number } {
  if (blank(priceRaw) || blank(marginRaw)) return {};
  const price = Number(priceRaw);
  const margin = Number(marginRaw);
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("price must be more than ₹0");
  }
  if (price > 100_000_000) throw new Error("price is implausibly large");
  if (!Number.isFinite(margin) || margin < 1 || margin > 95) {
    throw new Error("margin must be between 1% and 95%");
  }
  return { price, margin };
}

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
    ...parseRealityInputs(b.price, b.margin),
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
