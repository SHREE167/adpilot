// Human labels for the 25 XGBoost features (lib/ml/features.ts), so SHAP
// drivers read as plain language. Client-safe.
import { ML_CATEGORIES, ML_GOALS } from "./features";

const TIERS = ["low", "mid", "high", "enterprise"];

const CATEGORY_NAME: Record<(typeof ML_CATEGORIES)[number], string> = {
  food: "food",
  saas: "SaaS",
  education: "education",
  fashion: "fashion",
  health: "health",
  finance: "finance",
  ecommerce: "e-commerce",
  local_service: "local service",
  entertainment: "entertainment",
  general: "general",
};

const GOAL_NAME: Record<(typeof ML_GOALS)[number], string> = {
  awareness: "awareness",
  sales: "sales",
  leads: "leads",
  store_visits: "store visits",
  app_installs: "app installs",
  b2b: "B2B pipeline",
};

/** Binary flags: [label when 1, label when 0]. */
const FLAGS: Record<string, [string, string]> = {
  metro: ["Metro city", "Non-metro city"],
  vernacular: ["Regional-language audience", "English-language audience"],
  student: ["Student audience", "Not a student audience"],
  professional: ["Professional audience", "Not a professional audience"],
  b2b: ["B2B buyers", "Consumer buyers"],
  local: ["Local, nearby audience", "Not tied to one area"],
};

/** Neutral name of a feature, e.g. "Monthly budget", "Category: food". */
export const FEATURE_LABELS: Record<string, string> = {
  log_budget: "Monthly budget",
  age: "Audience age",
  price_tier: "Price tier",
  metro: "Metro city",
  vernacular: "Regional language",
  student: "Student audience",
  professional: "Professional audience",
  b2b: "B2B buyers",
  local: "Local audience",
  ...Object.fromEntries(ML_CATEGORIES.map((c) => [`cat_${c}`, `Category: ${CATEGORY_NAME[c]}`])),
  ...Object.fromEntries(ML_GOALS.map((g) => [`goal_${g}`, `Goal: ${GOAL_NAME[g]}`])),
};

/** The feature as it applies to this brief, e.g. "Budget ₹3,000", "Not a food brand". */
export function describeFeature(name: string, value: number): string {
  if (name === "log_budget") {
    return `Budget ₹${Math.round(Math.exp(value)).toLocaleString("en-IN")}`;
  }
  if (name === "age") return `Audience age ~${Math.round(value)}`;
  if (name === "price_tier") return `${TIERS[Math.round(value)] ?? "unknown"} price tier`.replace(/^./, (c) => c.toUpperCase());
  const flag = FLAGS[name];
  if (flag) return value >= 0.5 ? flag[0] : flag[1];
  if (name.startsWith("cat_")) {
    const c = CATEGORY_NAME[name.slice(4) as keyof typeof CATEGORY_NAME] ?? name.slice(4);
    return value >= 0.5 ? `A ${c} brand` : `Not a ${c} brand`;
  }
  if (name.startsWith("goal_")) {
    const g = GOAL_NAME[name.slice(5) as keyof typeof GOAL_NAME] ?? name.slice(5);
    return value >= 0.5 ? `Goal is ${g}` : `Goal is not ${g}`;
  }
  return FEATURE_LABELS[name] ?? name;
}
