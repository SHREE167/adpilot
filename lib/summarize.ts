import type { PlanListItem, PlanResult } from "./types";

export function summarize(plan: PlanResult): PlanListItem {
  return {
    id: plan.id,
    createdAt: plan.createdAt,
    product_name: plan.input.product_name,
    domain: plan.input.domain,
    city: plan.input.city,
    budget: plan.input.budget,
    goal: String(plan.input.goal),
    category: plan.category,
  };
}
