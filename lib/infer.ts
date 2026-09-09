import type { PlanInput, PriceTier, SiteSnapshot } from "./types";

export interface Inference {
  category: string;
  priceTier: PriceTier;
  reasons: string[];
}

const CATEGORY_RULES: { category: string; pattern: RegExp }[] = [
  {
    category: "food",
    pattern:
      /\b(snack|snacks|food|chips|namkeen|bakery|cafe|café|restaurant|beverage|drink|tea|coffee|tiffin|biryani|pizza|burger|cloud kitchen|fmcg)\b/i,
  },
  {
    category: "saas",
    pattern:
      /\b(saas|software|b2b|platform|api|crm|cloud|dashboard|workflow|automation|devtool|developer)\b/i,
  },
  {
    category: "education",
    pattern:
      /\b(course|coaching|tuition|edtech|university|college|exam|upsc|neet|class|learning|academy)\b/i,
  },
  {
    category: "fashion",
    pattern:
      /\b(fashion|apparel|clothing|jewellery|jewelry|saree|ethnic|footwear|boutique)\b/i,
  },
  {
    category: "health",
    pattern:
      /\b(clinic|hospital|pharma|wellness|fitness|ayurveda|dental|skin|healthcare)\b/i,
  },
  {
    category: "finance",
    pattern:
      /\b(loan|insurance|fintech|bank|nbfc|mutual fund|upi|credit|trading)\b/i,
  },
  {
    category: "ecommerce",
    pattern:
      /\b(shop|store|buy|cart|marketplace|delivery|d2c|ecommerce|e-commerce)\b/i,
  },
  {
    category: "local_service",
    pattern:
      /\b(salon|plumber|electrician|repair|tuition|tuition|real estate|interior|packers)\b/i,
  },
  {
    category: "entertainment",
    pattern: /\b(game|gaming|ott|movie|music|event|concert|comedy)\b/i,
  },
];

function haystack(input: PlanInput, site: SiteSnapshot): string {
  return [
    input.product_name,
    input.domain,
    input.audience_notes,
    input.goal,
    site.title,
    site.description,
    site.h1,
  ]
    .filter(Boolean)
    .join(" ");
}

export function inferCategoryAndTier(
  input: PlanInput,
  site: SiteSnapshot
): Inference {
  const text = haystack(input, site);
  const reasons: string[] = [];
  let category = "general";

  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) {
      category = rule.category;
      reasons.push(`Matched ${rule.category} keywords in site/product copy`);
      break;
    }
  }

  if (category === "general") {
    if (/b2b/i.test(input.goal) || /professional/i.test(input.audience_notes)) {
      category = "saas";
      reasons.push("Goal/audience reads as B2B, defaulted to saas");
    } else if (input.city && /store|visit/i.test(input.goal)) {
      category = "local_service";
      reasons.push("City + store-visit goal treated as local service");
    } else {
      reasons.push("No strong keyword match; category = general");
    }
  }

  let priceTier: PriceTier = "mid";
  if (
    category === "food" ||
    /student|college|campus|snack/i.test(text) ||
    input.budget < 5000
  ) {
    priceTier = "low";
    reasons.push("Low ticket inferred from food/student/small budget");
  }
  if (category === "fashion" || category === "education") {
    priceTier = input.budget >= 20000 ? "mid" : "low";
  }
  if (category === "saas" || /b2b|enterprise|professional/i.test(text)) {
    priceTier = input.budget >= 50000 ? "enterprise" : "high";
    reasons.push("B2B/SaaS mapped to high or enterprise price tier");
  }
  if (category === "finance") {
    priceTier = "high";
  }
  if (/premium|luxury|enterprise/i.test(text)) {
    priceTier = priceTier === "low" ? "mid" : "enterprise";
    reasons.push("Premium/enterprise language lifted the price tier");
  }

  return { category, priceTier, reasons };
}

export function isB2B(input: PlanInput, category: string): boolean {
  return (
    input.goal === "b2b" ||
    category === "saas" ||
    /b2b|enterprise|saas/i.test(`${input.goal} ${input.audience_notes} ${input.product_name}`)
  );
}

export function isProfessionalAudience(input: PlanInput): boolean {
  return /professional|founder|cxo|manager|decision[- ]?maker|b2b|linkedin|saas|hr|it team/i.test(
    `${input.audience_notes} ${input.goal} ${input.audience_age}`
  );
}

const METROS = [
  "mumbai",
  "delhi",
  "new delhi",
  "bengaluru",
  "bangalore",
  "chennai",
  "hyderabad",
  "kolkata",
  "pune",
  "ahmedabad",
  "kochi",
  "noida",
  "gurgaon",
  "gurugram",
];

export function isMetro(city: string): boolean {
  const c = city.trim().toLowerCase();
  return METROS.some((m) => c.includes(m));
}

export function isVernacular(language: string): boolean {
  return !/^english$/i.test(language.trim());
}
