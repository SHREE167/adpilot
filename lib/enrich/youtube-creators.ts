import "server-only";
import { CREATOR_MAX_SUBS, CREATOR_MIN_SUBS } from "@/lib/creator-rates";
import type { CreatorFinder, CreatorPick, PlanInput, ProductIntel, Signal } from "@/lib/types";
import { CACHE_TTL } from "./cache";
import { fetchJson, runSource, skipped } from "./signal";

export const YOUTUBE_SOURCE = "youtube";

export const YT_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search";
export const YT_CHANNELS_URL = "https://www.googleapis.com/youtube/v3/channels";

const MAX_RESULTS = 25;
const TOP_N = 5;

/** Raw search.list (type=channel) response, only the fields we read. */
export interface YtSearchResponse {
  items?: { id?: { channelId?: string }; snippet?: { channelId?: string; title?: string } }[];
}

/** Raw channels.list (part=snippet,statistics) response. Counts arrive as strings. */
export interface YtChannelsResponse {
  items?: {
    id?: string;
    snippet?: { title?: string; description?: string; customUrl?: string; country?: string; defaultLanguage?: string };
    statistics?: { subscriberCount?: string; hiddenSubscriberCount?: boolean; videoCount?: string; viewCount?: string };
  }[];
}

/** Form language → YouTube relevanceLanguage (ISO 639-1). */
const LANGUAGE_CODE: Record<string, string> = {
  english: "en",
  hindi: "hi",
  tamil: "ta",
  telugu: "te",
  kannada: "kn",
  malayalam: "ml",
  marathi: "mr",
  bengali: "bn",
};

/** Unicode script per language, to spot channels that post in it. */
const SCRIPT: Record<string, RegExp> = {
  hi: /[ऀ-ॿ]/,
  mr: /[ऀ-ॿ]/,
  ta: /[஀-௿]/,
  te: /[ఀ-౿]/,
  kn: /[ಀ-೿]/,
  ml: /[ഀ-ൿ]/,
  bn: /[ঀ-৿]/,
};

/** What local creators in this space make videos about. Product hints first, then category. */
const TOPIC_HINTS: [RegExp, string][] = [
  [/neet|jee/i, "NEET"],
  [/upsc|\bias\b|civil services/i, "UPSC"],
  [/spoken english|ielts/i, "spoken English"],
  [/coding|bootcamp|developer/i, "coding"],
  [/salon|makeup|bridal|beauty|parlou?r/i, "beauty"],
  [/\bpets?\b|grooming|dog|cat\b/i, "pets"],
  [/streetwear|tees|thrift|sneakers/i, "streetwear"],
  [/saree|kurta|kurti|ethnic|handloom|silk/i, "ethnic wear"],
  [/tailor/i, "stitching"],
  [/repair|servicing|plumb|electric/i, "home tips"],
  [/biryani|restaurant|street food|vada pav|chai|dosa|thali|cloud kitchen|snack|sweets?|mithai/i, "food"],
];

const CATEGORY_TOPIC: Record<string, string> = {
  food: "food",
  fashion: "fashion",
  education: "education",
  health: "fitness",
  saas: "tech",
  finance: "finance",
  ecommerce: "shopping",
  entertainment: "entertainment",
  local_service: "vlog",
  general: "vlog",
};

export interface CreatorQuery {
  q: string;
  topic: string;
  language: string;
  city: string;
}

/** Pure: the single search.list query for a brief, or null without a city. */
export function creatorQuery(input: PlanInput, product: Pick<ProductIntel, "category">): CreatorQuery | null {
  const city = input.city.trim();
  if (!city) return null;
  const text = `${input.product_name} ${input.audience_notes}`;
  const topic = TOPIC_HINTS.find(([re]) => re.test(text))?.[1] ?? CATEGORY_TOPIC[product.category] ?? "vlog";
  const language = LANGUAGE_CODE[input.language.trim().toLowerCase()] ?? "en";
  return { q: `${topic} ${city}`, topic, language, city };
}

function toInt(s: string | undefined): number {
  const n = Number.parseInt(s || "", 10);
  return Number.isFinite(n) ? n : 0;
}

function round(n: number): number {
  return Math.round(n);
}

/** "48.2k", "1.2M": the same rounding the UI uses, so `why` text stays traceable. */
export function shortCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

const SWEET_SPOT = 20_000;

/**
 * Pure: search + channel stats → CreatorFinder. Keeps 2k-200k public
 * subscribers, ranks by fit, top 5. Never invents a channel.
 */
export function toCreatorFinder(search: YtSearchResponse, channels: YtChannelsResponse, q: CreatorQuery): CreatorFinder {
  const order = (search.items || [])
    .map((it) => it.id?.channelId || it.snippet?.channelId)
    .filter((x): x is string => Boolean(x));
  const city = q.city.toLowerCase();
  const topic = q.topic.toLowerCase();
  const script = SCRIPT[q.language];

  const all = (channels.items || []).filter((c) => c.id && !c.statistics?.hiddenSubscriberCount);
  const inBand = all.filter((c) => {
    const subs = toInt(c.statistics?.subscriberCount);
    return subs >= CREATOR_MIN_SUBS && subs <= CREATOR_MAX_SUBS;
  });

  const picks: CreatorPick[] = inBand.map((c) => {
    const s = c.snippet || {};
    const subs = toInt(c.statistics?.subscriberCount);
    const videos = toInt(c.statistics?.videoCount);
    const views = toInt(c.statistics?.viewCount);
    const text = `${s.title || ""} ${s.description || ""}`;
    const lower = text.toLowerCase();
    const cityMatch = lower.includes(city);
    const topicMatch = lower.includes(topic);
    const langMatch = script ? script.test(text) : s.defaultLanguage?.startsWith(q.language) ?? false;
    // Closeness to ~20k subscribers on a log scale: big enough to matter, small enough to reply.
    const size = Math.max(0, 1 - Math.abs(Math.log10(subs) - Math.log10(SWEET_SPOT)) / 2);
    const rank = order.indexOf(c.id!);
    const relevance = rank >= 0 ? 1 - rank / Math.max(order.length, 1) : 0;
    const fit = round(
      30 * Number(cityMatch) + 15 * Number(topicMatch) + 10 * Number(langMatch) + 25 * size + 15 * relevance + 5 * Number(videos >= 30)
    );
    const why: string[] = [];
    if (cityMatch) why.push(`Names ${q.city} on the channel`);
    if (langMatch && q.language !== "en") why.push(`Posts in the brief's language`);
    if (topicMatch) why.push(`Channel is about ${q.topic}`);
    why.push(`${shortCount(subs)} subscribers: ${subs < 10_000 ? "small enough to reply to a DM" : subs < 50_000 ? "a real local following" : "big reach for a local collab"}`);
    if (videos) why.push(`${videos.toLocaleString("en-IN")} videos posted`);
    const handle = s.customUrl?.trim();
    return {
      channelId: c.id!,
      title: (s.title || "").trim().slice(0, 100),
      url: handle ? `https://www.youtube.com/${handle.startsWith("@") ? handle : `@${handle}`}` : `https://www.youtube.com/channel/${c.id}`,
      subscribers: subs,
      videos,
      views,
      ...(s.country ? { country: s.country } : {}),
      cityMatch,
      fit: Math.min(100, fit),
      why,
    };
  });

  picks.sort((a, b) => b.fit - a.fit || b.subscribers - a.subscribers);
  return {
    query: q.q,
    topic: q.topic,
    language: q.language,
    found: order.length,
    inBand: inBand.length,
    picks: picks.slice(0, TOP_N),
  };
}

/** URLs for the two calls (exported so fixtures are recorded with the same params). */
export function searchUrl(q: CreatorQuery): string {
  const p = new URLSearchParams({
    part: "snippet",
    type: "channel",
    q: q.q,
    regionCode: "IN",
    relevanceLanguage: q.language,
    maxResults: String(MAX_RESULTS),
  });
  return `${YT_SEARCH_URL}?${p}`;
}

export function channelsUrl(ids: string[]): string {
  const p = new URLSearchParams({ part: "snippet,statistics", id: ids.join(","), maxResults: "50" });
  return `${YT_CHANNELS_URL}?${p}`;
}

/** The key travels in a header, never in the URL (so it never lands in logs or cache keys). */
export function ytInit(key: string): RequestInit {
  return { headers: { "X-Goog-Api-Key": key, Accept: "application/json" } };
}

/** F5 source: ONE search.list per plan + one channels.list, 7-day cache. Never throws. */
export async function fetchCreators(
  input: PlanInput,
  product: Pick<ProductIntel, "category">
): Promise<Signal<CreatorFinder>> {
  const q = creatorQuery(input, product);
  if (!q) return skipped(YOUTUBE_SOURCE, "no city in the brief");
  return runSource<CreatorFinder>(
    YOUTUBE_SOURCE,
    async (signal) => {
      const init = ytInit(process.env.YOUTUBE_API_KEY!);
      // Quota: search.list = 100 of 10,000 daily units; channels.list = 1. Cache hard.
      const search = await fetchJson<YtSearchResponse>(searchUrl(q), signal, init);
      const ids = [
        ...new Set(
          (search.items || []).map((it) => it.id?.channelId || it.snippet?.channelId).filter((x): x is string => Boolean(x))
        ),
      ];
      if (!ids.length) return toCreatorFinder(search, {}, q);
      const channels = await fetchJson<YtChannelsResponse>(channelsUrl(ids), signal, init);
      return toCreatorFinder(search, channels, q);
    },
    {
      requiresEnv: ["YOUTUBE_API_KEY"],
      cacheKey: `${YOUTUBE_SOURCE}:v1:${q.q.toLowerCase()}|${q.language}`,
      ttlMs: CACHE_TTL.youtube,
      mockKey: input.city,
      timeoutMs: 5000,
    }
  );
}
