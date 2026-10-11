import type { PlanInput, PriceTier, SiteSnapshot } from "./types";

export interface Inference {
  category: string;
  priceTier: PriceTier;
  reasons: string[];
}

/**
 * Category = what the business SELLS, never who buys it. Strong terms name the
 * product itself (weight 3); weak terms only hint (weight 1). Order breaks ties.
 */
const CATEGORY_TERMS: { category: string; strong: RegExp; weak?: RegExp }[] = [
  {
    category: "food",
    strong:
      /\b(snacks?|food|chips|namkeen|bakery|bakes|cafe|café|restaurants?|beverages?|tea|coffee|chai|tiffin|biryani|pizzas?|burgers?|cloud kitchen|fmcg|sweets?|mithai|halwai|laddus?|vada pav|pav bhaji|dosa|idli|thali|meals|millet|bowls|juices?|ice cream|cakes?|peanuts|dhaba|catering|caterers?)\b/i,
    weak: /\b(masala|kitchen|stall|eatery|healthy)\b/i,
  },
  {
    category: "saas",
    strong: /\b(saas|software|crm|erp|payroll|devtools?|api|invoicing)\b/i,
    weak: /\b(platform|dashboard|workflow|automation|analytics|developers?|b2b)\b/i,
  },
  {
    category: "education",
    strong:
      /\b(courses?|coaching|tuitions?|edtech|bootcamps?|academy|neet|jee|upsc|ias|ielts|exam prep|spoken english|institute|school)\b/i,
    weak: /\b(class|classes|learning|training|coding|skills|exams?)\b/i,
  },
  {
    category: "fashion",
    strong:
      /\b(fashion|apparel|clothing|clothes|jewell?ery|jewelry|sarees?|saris?|ethnic wear|footwear|boutique|kurtas?|kurtis?|tees|t-?shirts?|streetwear|thrift|pre-loved|preloved|lehengas?|dresses|denim|sneakers|handloom)\b/i,
    weak: /\b(silk|resale|wear|label|ethnic)\b/i,
  },
  {
    category: "health",
    strong:
      /\b(clinic|hospital|pharma|pharmacy|wellness|fitness|gym|yoga|ayurveda|dental|dentist|healthcare|physio(therapy)?|diagnostics?|dermatolog\w*)\b/i,
  },
  {
    category: "finance",
    strong: /\b(loans?|insurance|fintech|bank|nbfc|mutual funds?|upi|credit cards?|trading|tax filing)\b/i,
  },
  {
    category: "ecommerce",
    strong: /\b(d2c|ecommerce|e-commerce|marketplace|online store)\b/i,
    weak: /\b(shop|store|buy|cart|delivery|online orders?)\b/i,
  },
  {
    category: "local_service",
    strong:
      /\b(salon|spa|parlou?r|barber|plumbers?|plumbing|electricians?|repairs?|servicing|tailor(ing)?|alterations|real estate|interiors?|packers|movers|grooming|laundry|pest control|car wash|photographers?)\b/i,
  },
  {
    category: "entertainment",
    strong: /\b(game|gaming|ott|movies?|music|concerts?|comedy)\b/i,
    weak: /\b(events?)\b/i,
  },
];

/** schema.org @type on the page → category (a strong, product-level signal). */
const JSONLD_CATEGORY: [RegExp, string][] = [
  [/restaurant|food|bakery|cafe|coffee|bar(?!ber)/i, "food"],
  [/salon|barber|beauty|homeandconstruction|repair|plumb|electrician|laundry|dryclean/i, "local_service"],
  [/clothing|jewel|shoe/i, "fashion"],
  [/medical|dentist|physician|hospital|pharmacy|health/i, "health"],
  [/softwareapplication|webapplication/i, "saas"],
  [/educational|school|college|university|course/i, "education"],
];

/** Buyer words describe WHO buys, not WHAT is sold: ignored in audience text. */
const BUYER_WORDS =
  /\b(college|university|campus|hostels?|students?|parents?|families|kids|children|professionals?|founders?|aspirants?|job seekers?|graduates?|engineers?|homemakers?|commuters?|office (goers?|crowd)|gen z|teams?|buyers?|managers?)\b/gi;

const FIELD_WEIGHT = { product: 3, site: 1.5, audience: 0.5 } as const;

/** Product name split at " for ": the head is what is sold, the tail is who it is for. */
function splitFor(name: string): { head: string; tail: string } {
  const m = name.match(/^(.*?)\s+for\s+(.*)$/i);
  return m ? { head: m[1], tail: m[2] } : { head: name, tail: "" };
}

function termsIn(re: RegExp, text: string): string[] {
  if (!text) return [];
  const g = new RegExp(re.source, "gi");
  return [...new Set([...text.matchAll(g)].map((m) => m[0].toLowerCase()))];
}

export interface CategoryScore {
  category: string;
  score: number;
  terms: string[];
}

/** Pure: weighted category scores, best first. Exported for tests. */
export function scoreCategories(input: PlanInput, site: SiteSnapshot): CategoryScore[] {
  const name = splitFor(input.product_name || "");
  const fields: { text: string; w: number }[] = [
    {
      text: [name.head, site.jsonLdName, site.h1, site.ogTitle, site.title].filter(Boolean).join(" · "),
      w: FIELD_WEIGHT.product,
    },
    { text: site.description || "", w: FIELD_WEIGHT.site },
    {
      text: `${name.tail} ${input.audience_notes || ""}`.replace(BUYER_WORDS, " "),
      w: FIELD_WEIGHT.audience,
    },
  ];
  const out: CategoryScore[] = CATEGORY_TERMS.map(({ category, strong, weak }) => {
    let score = 0;
    const terms: string[] = [];
    for (const f of fields) {
      for (const t of termsIn(strong, f.text)) {
        score += 3 * f.w;
        terms.push(t);
      }
      if (weak) {
        for (const t of termsIn(weak, f.text)) {
          score += 1 * f.w;
          terms.push(t);
        }
      }
    }
    return { category, score, terms: [...new Set(terms)] };
  });
  const ld = site.jsonLdType || "";
  const ldHit = ld ? JSONLD_CATEGORY.find(([re]) => re.test(ld)) : undefined;
  if (ldHit) {
    const row = out.find((r) => r.category === ldHit[1])!;
    row.score += 3 * FIELD_WEIGHT.product;
    row.terms.push(`schema:${ld}`);
  }
  // Stable sort keeps rule order on ties.
  return out.filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
}

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

  const best = scoreCategories(input, site)[0];
  if (best) {
    category = best.category;
    reasons.push(`Matched ${best.category} terms (${best.terms.slice(0, 3).join(", ")}) in what the business sells`);
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
