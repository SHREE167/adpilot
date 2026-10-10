import "server-only";
import type { LocalMarket, PlaceSummary, PlanInput, ProductIntel, Signal } from "@/lib/types";
import { CACHE_TTL } from "./cache";
import { fetchJson, runSource, skipped } from "./signal";

export const PLACES_SOURCE = "google_places";

export const PLACES_URL = "https://places.googleapis.com/v1/places:searchText";

/**
 * Strict field masks: request only what LocalMarketCard shows.
 * rating/userRatingCount move Text Search to the Enterprise SKU (smaller free cap),
 * so only the competitor search asks for them. The own-name lookup stays on Pro.
 */
export const COMPETITOR_MASK = "places.displayName,places.rating,places.userRatingCount,nextPageToken";
export const OWN_MASK = "places.displayName,places.googleMapsUri";

const MIN_REVIEWS_FOR_TOP = 10;

/** Raw Places API (New) Text Search response, limited by the masks above. */
export interface PlacesResponse {
  places?: {
    displayName?: { text?: string };
    rating?: number;
    userRatingCount?: number;
    googleMapsUri?: string;
  }[];
  nextPageToken?: string;
}

/** Business types that have no storefront to find on Maps: no call, no quota. */
const NOT_LOCAL_CATEGORIES = new Set(["saas", "finance", "ecommerce"]);
const NOT_LOCAL_GOALS = new Set(["b2b", "app_installs"]);

/** Product hints first (more specific), then a category fallback. */
const HINTS: [RegExp, string][] = [
  [/peanut|snack|chips|namkeen|mixture|murukku|chakli/i, "snack shop"],
  [/cafe|café|coffee|\bchai\b|\btea\b/i, "cafe"],
  [/cake|bakery|bread|cookie|brownie/i, "bakery"],
  [/biryani|restaurant|tiffin|thali|dosa|meals?\b|cloud kitchen/i, "restaurant"],
  [/sweets?\b|mithai|laddu/i, "sweet shop"],
  [/salon|spa\b|hair|beauty parlou?r|nail/i, "salon"],
  [/gym|fitness|yoga|zumba/i, "gym"],
  [/tuition|coaching|classes|academy/i, "coaching centre"],
  [/clinic|dental|dentist|physio/i, "clinic"],
  [/boutique|saree|kurti|clothing|apparel|tailor/i, "clothing store"],
];

const CATEGORY_KEYWORD: Record<string, string> = {
  food: "food shop",
  fashion: "clothing store",
  health: "clinic",
  education: "coaching centre",
};

const STOP = new Set(["the", "a", "an", "and", "&", "of", "by", "for"]);

function words(s: string): string[] {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w));
}

/** The first two significant words of the product name, e.g. "Campus Crunch". */
export function brandName(input: PlanInput): string {
  return input.product_name
    .replace(/[^\p{L}\p{N}\s&'-]/gu, " ")
    .split(/\s+/)
    .filter((w) => w && !STOP.has(w.toLowerCase()))
    .slice(0, 2)
    .join(" ");
}

export interface MarketQuery {
  keyword: string;
  competitorQuery: string;
  ownQuery: string;
  brand: string;
}

/** Pure: the two Text Search queries for a brief, or null when Maps is not relevant. */
export function marketQuery(input: PlanInput, product: Pick<ProductIntel, "category" | "recognizedName">): MarketQuery | null {
  const city = input.city.trim();
  if (!city) return null;
  if (NOT_LOCAL_CATEGORIES.has(product.category) || NOT_LOCAL_GOALS.has(String(input.goal))) return null;
  const text = `${input.product_name} ${product.recognizedName || ""}`;
  const keyword = HINTS.find(([re]) => re.test(text))?.[1] ?? CATEGORY_KEYWORD[product.category];
  if (!keyword) return null;
  const brand = brandName(input);
  return {
    keyword,
    competitorQuery: `${keyword} in ${city}`,
    ownQuery: `${brand} ${city}`.trim(),
    brand,
  };
}

/** Same business? Every brand word appears in the place name. */
export function isSameBusiness(placeName: string, brand: string): boolean {
  const b = words(brand);
  if (!b.length) return false;
  const p = new Set(words(placeName));
  return b.every((w) => p.has(w));
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Pure: two masked Text Search responses → LocalMarket. Never invents a place. */
export function toLocalMarket(
  competitors: PlacesResponse,
  own: PlacesResponse,
  q: MarketQuery
): LocalMarket {
  const ownHit = (own.places || []).find((p) => isSameBusiness(p.displayName?.text || "", q.brand));
  const list: PlaceSummary[] = (competitors.places || [])
    .map((p) => ({
      name: (p.displayName?.text || "").trim(),
      ...(typeof p.rating === "number" ? { rating: p.rating } : {}),
      ...(typeof p.userRatingCount === "number" ? { reviews: p.userRatingCount } : {}),
    }))
    .filter((p) => p.name && !isSameBusiness(p.name, q.brand));

  const rated = list.filter((p) => typeof p.rating === "number");
  const avg = rated.length ? round1(rated.reduce((s, p) => s + p.rating!, 0) / rated.length) : null;
  const solid = (p: PlaceSummary) => (p.reviews ?? 0) >= MIN_REVIEWS_FOR_TOP;
  const top = [...list]
    .sort(
      (a, b) =>
        Number(solid(b)) - Number(solid(a)) ||
        (b.rating ?? 0) - (a.rating ?? 0) ||
        (b.reviews ?? 0) - (a.reviews ?? 0)
    )
    .slice(0, 5);

  return {
    query: q.competitorQuery,
    keyword: q.keyword,
    count: list.length,
    more: Boolean(competitors.nextPageToken),
    avgRating: avg,
    ratedCount: rated.length,
    top,
    own: {
      query: q.ownQuery,
      found: Boolean(ownHit),
      ...(ownHit?.displayName?.text ? { name: ownHit.displayName.text } : {}),
      ...(ownHit?.googleMapsUri ? { mapsUri: ownHit.googleMapsUri } : {}),
    },
  };
}

/** Request init for one Text Search call (exported so fixtures are recorded with the same masks). */
export function placesRequest(textQuery: string, fieldMask: string, pageSize: number, key: string): RequestInit {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": fieldMask,
    },
    body: JSON.stringify({ textQuery, regionCode: "IN", languageCode: "en", pageSize }),
  };
}

/** F2 source: two Text Searches in parallel, 7-day cache. Never throws. */
export async function fetchLocalMarket(
  input: PlanInput,
  product: Pick<ProductIntel, "category" | "recognizedName">
): Promise<Signal<LocalMarket>> {
  const q = marketQuery(input, product);
  if (!q) return skipped(PLACES_SOURCE, "not a local-storefront business");
  return runSource<LocalMarket>(
    PLACES_SOURCE,
    async (signal) => {
      const key = process.env.GOOGLE_PLACES_API_KEY!;
      // Billing: competitor search = Text Search Enterprise (rating fields); own lookup = Text Search Pro.
      // Two requests per uncached plan; the 7-day cache and a daily quota in Google Cloud cap spend.
      const [competitors, own] = await Promise.all([
        fetchJson<PlacesResponse>(PLACES_URL, signal, placesRequest(q.competitorQuery, COMPETITOR_MASK, 20, key)),
        fetchJson<PlacesResponse>(PLACES_URL, signal, placesRequest(q.ownQuery, OWN_MASK, 5, key)),
      ]);
      return toLocalMarket(competitors, own, q);
    },
    {
      requiresEnv: ["GOOGLE_PLACES_API_KEY"],
      cacheKey: `${PLACES_SOURCE}:v1:${q.competitorQuery.toLowerCase()}|${q.ownQuery.toLowerCase()}`,
      ttlMs: CACHE_TTL.places,
      mockKey: input.city,
      timeoutMs: 5000,
    }
  );
}
