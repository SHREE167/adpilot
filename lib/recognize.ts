import "server-only";
import { inferCategoryAndTier } from "@/lib/infer";
import type { PlanInput, ProductIntel, SiteSnapshot } from "@/lib/types";

function evidenceFrom(site: SiteSnapshot, input: PlanInput): string[] {
  const bits = [
    site.jsonLdName ? `JSON-LD: ${site.jsonLdName}` : null,
    site.jsonLdType ? `schema: ${site.jsonLdType}` : null,
    site.h1 ? `H1: ${site.h1}` : null,
    site.ogTitle ? `og:title: ${site.ogTitle}` : null,
    site.title ? `title: ${site.title}` : null,
    site.description ? `meta: ${site.description.slice(0, 140)}` : null,
    input.product_name ? `form: ${input.product_name}` : null,
  ].filter((x): x is string => Boolean(x));
  return bits.slice(0, 6);
}

function differentiators(input: PlanInput, site: SiteSnapshot): string[] {
  const blob = `${input.product_name} ${input.audience_notes} ${site.description || ""} ${site.h1 || ""}`;
  const found: string[] = [];
  if (/masala|spicy|chilli|mirchi/i.test(blob)) found.push("spicy / masala flavour");
  if (/student|campus|hostel|college/i.test(blob)) found.push("campus / student occasion");
  if (/whatsapp|chat/i.test(blob)) found.push("chat-first buying");
  if (/crm|pipeline|demo|inbound/i.test(blob)) found.push("inbound-to-demo workflow");
  if (/india|gst|gstin/i.test(blob)) found.push("built for Indian ops");
  if (/cheap|pocket|budget|₹|rs\.?/i.test(blob)) found.push("price-sensitive pack");
  if (/premium|enterprise/i.test(blob)) found.push("premium / enterprise positioning");
  if (input.city) found.push(`city-local: ${input.city}`);
  if (input.language && !/^english$/i.test(input.language)) {
    found.push(`${input.language}-first copy`);
  }
  return found.slice(0, 5);
}

export function recognizeHeuristic(
  input: PlanInput,
  site: SiteSnapshot
): ProductIntel {
  const inferred = inferCategoryAndTier(input, site);
  const recognizedName =
    site.jsonLdName ||
    site.h1 ||
    site.ogTitle ||
    site.title ||
    input.product_name;
  const audience = [
    input.audience_age,
    input.audience_notes || "not specified",
    input.city,
  ]
    .filter(Boolean)
    .join(" · ");
  const diffs = differentiators(input, site);
  const evidence = evidenceFrom(site, input);
  const fromPage = Boolean(site.scraped && (site.h1 || site.description || site.jsonLdName));
  const summary = fromPage
    ? `This reads as ${recognizedName} — a ${inferred.priceTier}-ticket ${inferred.category} offer for ${audience}. Page signals: ${(site.h1 || site.title || "title")} / ${site.description || "no meta description"}.`
    : `No live page (or scrape blocked). Treating the form as ground truth: ${input.product_name} is a ${inferred.priceTier}-ticket ${inferred.category} play in ${input.city} for ${input.audience_age}.`;

  const tone =
    inferred.category === "saas" || input.goal === "b2b"
      ? "direct, founder-to-operator"
      : inferred.category === "food"
        ? "local, snacky, group-chat"
        : "plainspoken India performance";

  return {
    recognizedName: recognizedName.slice(0, 120),
    summary,
    category: inferred.category,
    priceTier: inferred.priceTier,
    audience,
    tone,
    differentiators: diffs.length ? diffs : [`goal: ${input.goal}`],
    evidence,
    source: "heuristic",
    confidence: fromPage ? 0.72 : 0.55,
  };
}

export function mergeIntel(
  base: ProductIntel,
  patch: Partial<ProductIntel> | null
): ProductIntel {
  if (!patch) return base;
  return {
    recognizedName: patch.recognizedName || base.recognizedName,
    summary: patch.summary || base.summary,
    category: patch.category || base.category,
    priceTier: patch.priceTier || base.priceTier,
    audience: patch.audience || base.audience,
    tone: patch.tone || base.tone,
    differentiators:
      patch.differentiators && patch.differentiators.length
        ? patch.differentiators
        : base.differentiators,
    evidence:
      patch.evidence && patch.evidence.length ? patch.evidence : base.evidence,
    source: patch.source || base.source,
    confidence:
      typeof patch.confidence === "number" ? patch.confidence : base.confidence,
  };
}
