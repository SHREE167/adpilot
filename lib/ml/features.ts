import { parseAgeMidpoint } from "@/lib/format";
import {
  isB2B,
  isMetro,
  isProfessionalAudience,
  isVernacular,
} from "@/lib/infer";
import type { PlanInput, PriceTier } from "@/lib/types";

export const ML_CATEGORIES = [
  "food",
  "saas",
  "education",
  "fashion",
  "health",
  "finance",
  "ecommerce",
  "local_service",
  "entertainment",
  "general",
] as const;

export const ML_GOALS = [
  "awareness",
  "sales",
  "leads",
  "store_visits",
  "app_installs",
  "b2b",
] as const;

export const ML_FEATURE_NAMES: string[] = [
  "log_budget",
  "age",
  "price_tier",
  "metro",
  "vernacular",
  "student",
  "professional",
  "b2b",
  "local",
  ...ML_CATEGORIES.map((c) => `cat_${c}`),
  ...ML_GOALS.map((g) => `goal_${g}`),
];

const TIER_NUM: Record<PriceTier, number> = {
  low: 0,
  mid: 1,
  high: 2,
  enterprise: 3,
};

export function isStudent(input: PlanInput): boolean {
  return /student|college|campus|gen ?z/i.test(
    `${input.audience_notes} ${input.product_name} ${input.audience_age}`
  );
}

export function isLocalBrief(input: PlanInput, category: string): boolean {
  const goal = String(input.goal).toLowerCase();
  return Boolean(input.city) &&
    (goal.includes("store") ||
      category === "food" ||
      category === "local_service" ||
      /local|nearby|area|neighbour/i.test(input.audience_notes));
}

export function extractFeatures(
  input: PlanInput,
  category: string,
  priceTier: PriceTier
): number[] {
  const age = parseAgeMidpoint(input.audience_age);
  const goal = String(input.goal).toLowerCase();
  const cat = ML_CATEGORIES.includes(category as (typeof ML_CATEGORIES)[number])
    ? category
    : "general";
  const goalId = ML_GOALS.includes(goal as (typeof ML_GOALS)[number])
    ? goal
    : "sales";

  const x: number[] = [
    Math.log(Math.max(input.budget, 1)),
    age,
    TIER_NUM[priceTier],
    isMetro(input.city) ? 1 : 0,
    isVernacular(input.language) ? 1 : 0,
    isStudent(input) ? 1 : 0,
    isProfessionalAudience(input) ? 1 : 0,
    isB2B(input, category) ? 1 : 0,
    isLocalBrief(input, category) ? 1 : 0,
  ];
  for (const c of ML_CATEGORIES) x.push(c === cat ? 1 : 0);
  for (const g of ML_GOALS) x.push(g === goalId ? 1 : 0);
  return x;
}
