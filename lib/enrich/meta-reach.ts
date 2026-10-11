import "server-only";
import type { AudienceEstimate, MetaTargetingSpec, PlanInput, ProductIntel, Signal } from "@/lib/types";
import { CACHE_TTL } from "./cache";
import { fetchJson, runSource, skipped } from "./signal";

export const META_SOURCE = "meta_reach";
export const META_ENV = ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_API_VERSION"] as const;

const GRAPH = "https://graph.facebook.com";
const MAX_INTERESTS = 3;
/** Meta allows teen ads, but only targeted by age and location (no interests). */
const ADULT_AGE = 18;
const META_MIN_AGE = 13;
const META_MAX_AGE = 65;

/** search?type=adgeolocation response (subset). */
export interface MetaGeoResponse {
  data?: { key?: string; name?: string; type?: string; region?: string; country_code?: string }[];
}

/** search?type=adinterest response (subset). No size bounds on this type. */
export interface MetaInterestResponse {
  data?: { id?: string; name?: string; path?: string[] }[];
}

/**
 * act_{id}/reachestimate response. Docs show users_lower_bound/upper_bound in a
 * `data` node (array or object across versions); delivery_estimate's
 * estimate_mau_* names are accepted too. -1 means "not available".
 */
export interface MetaReachNode {
  users_lower_bound?: number;
  users_upper_bound?: number;
  estimate_mau_lower_bound?: number;
  estimate_mau_upper_bound?: number;
  estimate_ready?: boolean;
}
export interface MetaReachResponse {
  data?: MetaReachNode | MetaReachNode[];
}

/** Product → Meta interest search terms. Product hints first, then category. */
const INTEREST_HINTS: [RegExp, string[]][] = [
  [/snack|peanut|chips|namkeen|murukku/i, ["Snack food", "Street food"]],
  [/biryani|restaurant|thali|dosa|cloud kitchen|meals?\b/i, ["Restaurants", "Indian cuisine"]],
  [/vada pav|street food|chaat/i, ["Street food", "Fast food"]],
  [/sweets?\b|mithai|halwai|laddu/i, ["Desserts", "Indian cuisine"]],
  [/cafe|café|coffee|\bchai\b|\btea\b/i, ["Coffee", "Tea"]],
  [/millet|healthy|salad/i, ["Healthy diet", "Food delivery"]],
  [/streetwear|tees|t-?shirt/i, ["Streetwear", "T-shirt"]],
  [/thrift|pre-?loved|resale/i, ["Thrift store", "Vintage clothing"]],
  [/saree|sari|kurta|kurti|ethnic|handloom|silk/i, ["Sari", "Handloom"]],
  [/salon|makeup|bridal|beauty|parlou?r/i, ["Beauty salon", "Hairdresser"]],
  [/\bpets?\b|grooming|\bdogs?\b|\bcats?\b/i, ["Pets", "Dogs"]],
  [/neet|medical entrance/i, ["National Eligibility cum Entrance Test", "Medicine"]],
  [/upsc|\bias\b|civil services/i, ["Civil Services Examination", "Union Public Service Commission"]],
  [/spoken english|ielts|interview/i, ["English language", "Job interview"]],
  [/coding|bootcamp|full-?stack|developer/i, ["Computer programming", "Web development"]],
  [/\bac\b|air condition/i, ["Air conditioning", "Home improvement"]],
  [/tailor|stitch|alteration/i, ["Sewing", "Fashion design"]],
  [/payroll|\bhr\b/i, ["Human resources", "Small business"]],
  [/crm|saas|software|analytics/i, ["Software", "Small business"]],
];

const CATEGORY_INTERESTS: Record<string, string[]> = {
  food: ["Food"],
  fashion: ["Fashion"],
  education: ["Education"],
  health: ["Health & wellness"],
  saas: ["Software"],
  finance: ["Personal finance"],
  ecommerce: ["Online shopping"],
  entertainment: ["Entertainment"],
};

export function interestSeeds(input: PlanInput, category: string): string[] {
  const text = `${input.product_name} ${input.audience_notes}`;
  const seeds: string[] = [];
  for (const [re, terms] of INTEREST_HINTS) {
    if (re.test(text)) seeds.push(...terms);
    if (seeds.length >= MAX_INTERESTS) break;
  }
  if (!seeds.length) seeds.push(...(CATEGORY_INTERESTS[category] || []));
  return [...new Set(seeds)].slice(0, MAX_INTERESTS);
}

/** "18-24", "25 to 45", "21+" → Meta's 13-65 range. Defaults to 18-65. */
export function parseAgeRange(audienceAge: string): { min: number; max: number } {
  const clamp = (n: number) => Math.min(META_MAX_AGE, Math.max(META_MIN_AGE, n));
  const range = (audienceAge || "").match(/(\d{1,2})\s*(?:-|–|to)\s*(\d{1,2})/i);
  if (range) {
    const a = clamp(Number(range[1]));
    const b = clamp(Number(range[2]));
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  const single = (audienceAge || "").match(/(\d{1,2})/);
  if (single) return { min: clamp(Number(single[1])), max: META_MAX_AGE };
  return { min: ADULT_AGE, max: META_MAX_AGE };
}

/** Pure: the exact targeting_spec AdPilot sends (and shows in the card). */
export function buildTargetingSpec(
  cityKey: string,
  age: { min: number; max: number },
  interests: { id: string; name: string }[]
): { spec: MetaTargetingSpec; interestsNote?: string } {
  const teen = age.min < ADULT_AGE;
  const use = teen ? [] : interests.slice(0, MAX_INTERESTS);
  const spec: MetaTargetingSpec = {
    geo_locations: { cities: [{ key: cityKey }] },
    age_min: age.min,
    age_max: age.max,
    ...(use.length ? { flexible_spec: [{ interests: use }] } : {}),
    publisher_platforms: ["facebook", "instagram"],
  };
  const interestsNote = teen
    ? "Audience includes under-18s: Meta only allows age and location targeting for teens, so no interests were used."
    : interests.length
      ? undefined
      : "No matching Meta interests: the pool is everyone in the city and age range.";
  return interestsNote ? { spec, interestsNote } : { spec };
}

/** Pure: first city hit, or null. */
export function pickCity(geo: MetaGeoResponse): AudienceEstimate["city"] | null {
  const hit = (geo.data || []).find((g) => g.key && g.name && (!g.type || g.type === "city"));
  if (!hit) return null;
  return { key: hit.key!, name: hit.name!, ...(hit.region ? { region: hit.region } : {}) };
}

/** Pure: best interest per search (first result with an id). Kept by id: names can change. */
export function pickInterests(responses: MetaInterestResponse[]): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  for (const r of responses) {
    const hit = (r.data || []).find((d) => d.id && d.name && !out.some((o) => o.id === d.id));
    if (hit) out.push({ id: hit.id!, name: hit.name! });
  }
  return out.slice(0, MAX_INTERESTS);
}

/** Pure: reach response → bounds, or null when Meta has no estimate. */
export function readBounds(reach: MetaReachResponse): { lower: number; upper: number } | null {
  const node = Array.isArray(reach.data) ? reach.data[0] : reach.data;
  if (!node) return null;
  const lower = node.users_lower_bound ?? node.estimate_mau_lower_bound;
  const upper = node.users_upper_bound ?? node.estimate_mau_upper_bound;
  if (typeof lower !== "number" || typeof upper !== "number" || lower < 0 || upper < 0) return null;
  return { lower: Math.min(lower, upper), upper: Math.max(lower, upper) };
}

export function adAccountPath(id: string): string {
  const clean = id.trim();
  return clean.startsWith("act_") ? clean : `act_${clean}`;
}

/** The token travels in a header, never in the URL (keeps it out of logs and cache keys). */
export function metaInit(token: string): RequestInit {
  return { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } };
}

export function geoUrl(version: string, city: string): string {
  const p = new URLSearchParams({
    type: "adgeolocation",
    q: city,
    location_types: JSON.stringify(["city"]),
    country_code: "IN",
    limit: "1",
  });
  return `${GRAPH}/${version}/search?${p}`;
}

export function interestUrl(version: string, q: string): string {
  const p = new URLSearchParams({ type: "adinterest", q, limit: "3", locale: "en_US" });
  return `${GRAPH}/${version}/search?${p}`;
}

export function reachUrl(version: string, account: string, spec: MetaTargetingSpec): string {
  const p = new URLSearchParams({ targeting_spec: JSON.stringify(spec) });
  return `${GRAPH}/${version}/${adAccountPath(account)}/reachestimate?${p}`;
}

/** Raw responses kept together so the recorder can save exactly what the parser saw. */
export interface MetaRaw {
  geo: MetaGeoResponse;
  interests: MetaInterestResponse[];
  reach: MetaReachResponse | null;
}

/** Pure: raw responses → AudienceEstimate. Throws a readable reason when Meta has no answer. */
export function toAudienceEstimate(raw: MetaRaw, input: PlanInput, apiVersion: string): AudienceEstimate {
  const city = pickCity(raw.geo);
  if (!city) throw new Error(`Meta has no city match for "${input.city}"`);
  const age = parseAgeRange(input.audience_age);
  const { spec, interestsNote } = buildTargetingSpec(city.key, age, pickInterests(raw.interests));
  const bounds = raw.reach ? readBounds(raw.reach) : null;
  if (!bounds) throw new Error("Meta returned no reach estimate");
  return {
    city,
    ageMin: spec.age_min,
    ageMax: spec.age_max,
    interests: spec.flexible_spec?.[0]?.interests ?? [],
    ...(interestsNote ? { interestsNote } : {}),
    targetingSpec: spec,
    lower: bounds.lower,
    upper: bounds.upper,
    apiVersion,
  };
}

/**
 * Live calls: geo search → interest searches (parallel) → reachestimate.
 * Exported for the fixture recorder; plans go through fetchAudience.
 */
export async function fetchMetaRaw(input: PlanInput, category: string, signal?: AbortSignal): Promise<MetaRaw> {
  const version = process.env.META_API_VERSION!.trim();
  const init = metaInit(process.env.META_ACCESS_TOKEN!);
  const age = parseAgeRange(input.audience_age);
  const seeds = age.min < ADULT_AGE ? [] : interestSeeds(input, category);
  const opts = signal ?? AbortSignal.timeout(15000);
  const [geo, ...interests] = await Promise.all([
    fetchJson<MetaGeoResponse>(geoUrl(version, input.city.trim()), opts, init),
    ...seeds.map((s) => fetchJson<MetaInterestResponse>(interestUrl(version, s), opts, init)),
  ]);
  const city = pickCity(geo);
  if (!city) return { geo, interests, reach: null };
  const { spec } = buildTargetingSpec(city.key, age, pickInterests(interests));
  const reach = await fetchJson<MetaReachResponse>(reachUrl(version, process.env.META_AD_ACCOUNT_ID!, spec), opts, init);
  return { geo, interests, reach };
}

/** F4 source: Meta audience pool for city + age + interests. Server-side system-user token only. Never throws. */
export async function fetchAudience(
  input: PlanInput,
  product: Pick<ProductIntel, "category">
): Promise<Signal<AudienceEstimate>> {
  const city = input.city.trim();
  if (!city) return skipped(META_SOURCE, "no city in the brief");
  const age = parseAgeRange(input.audience_age);
  const seeds = interestSeeds(input, product.category);
  const version = (process.env.META_API_VERSION || "").trim();
  return runSource<AudienceEstimate>(
    META_SOURCE,
    async (signal) => toAudienceEstimate(await fetchMetaRaw(input, product.category, signal), input, version),
    {
      requiresEnv: [...META_ENV],
      // Free calls (no spend), but rate-limited per ad account: cache 7 days.
      cacheKey: `${META_SOURCE}:v1:${version}|${city.toLowerCase()}|${age.min}-${age.max}|${seeds.join(",").toLowerCase()}`,
      ttlMs: CACHE_TTL.metaReach,
      mockKey: city,
      timeoutMs: 5000,
    }
  );
}
