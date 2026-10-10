export const CHANNEL_IDS = [
  "google_search",
  "google_display",
  "youtube",
  "instagram_reels",
  "instagram_feed",
  "facebook",
  "whatsapp",
  "sharechat",
  "linkedin",
  "telegram",
  "reddit",
  "x",
] as const;

export type ChannelId = (typeof CHANNEL_IDS)[number];

export type PriceTier = "low" | "mid" | "high" | "enterprise";

export type GoalId =
  | "awareness"
  | "sales"
  | "leads"
  | "store_visits"
  | "app_installs"
  | "b2b";

export interface RateCardEntry {
  id: ChannelId;
  name: string;
  /** Cost per 1000 impressions, INR. ESTIMATE. */
  cpm: number;
  /** Cost per click, INR. ESTIMATE. */
  cpc: number;
  /** Click-through rate 0–1. ESTIMATE. */
  ctr: number;
}

export interface RateCard {
  version: string;
  region: string;
  year: number;
  currency: "INR";
  disclaimer: string;
  channels: RateCardEntry[];
}

export interface PlanInput {
  domain: string;
  product_name: string;
  budget: number;
  city: string;
  audience_age: string;
  audience_notes: string;
  goal: GoalId | string;
  language: string;
}

export interface SiteSnapshot {
  domain: string;
  url: string;
  title: string | null;
  description: string | null;
  h1: string | null;
  ogTitle?: string | null;
  ogImage?: string | null;
  jsonLdName?: string | null;
  jsonLdType?: string | null;
  textExcerpt?: string | null;
  scraped: boolean;
  scrapeError?: string;
  /** v2: when the page was fetched, and whether it came from a mock fixture. */
  fetchedAt?: string;
  mock?: boolean;
  /** v2 (F1 part A): tracking + funnel detection from the fetched HTML. */
  tracking?: TrackingSignals;
}

export interface TrackingSignals {
  https: boolean;
  viewport: boolean;
  metaPixel: boolean;
  ga4: boolean;
  gtmIds: string[];
  whatsapp: boolean;
  tel: boolean;
  cta: boolean;
  ogImage: boolean;
}

export interface ProductIntel {
  recognizedName: string;
  summary: string;
  category: string;
  priceTier: PriceTier;
  audience: string;
  tone: string;
  differentiators: string[];
  evidence: string[];
  source: "llm" | "heuristic";
  confidence: number;
}

export interface ChannelScore {
  channelId: ChannelId;
  name: string;
  score: number;
  reasons: string[];
  rejected: boolean;
  rejectReason?: string;
}

export interface ChannelForecast {
  impressions: number;
  clicks: number;
  ctr: number;
  cpm: number;
  cpc: number;
  reach: number;
  conversions: number;
  cpa: number | null;
  note: string;
}

export interface ChannelAllocation {
  channelId: ChannelId;
  name: string;
  score: number;
  budget: number;
  percent: number;
  forecast: ChannelForecast;
  explanation: string;
}

export interface AdAngle {
  headline: string;
  primaryText: string;
  cta: string;
  channelHint: string;
}

export interface OutreachScript {
  channel: string;
  title: string;
  body: string;
}

export type PlacementKind =
  | "google_site"
  | "google_app"
  | "keyword_theme"
  | "publisher"
  | "app"
  | "format";

export interface PlacementPick {
  channelId: ChannelId;
  channelName: string;
  kind: PlacementKind;
  name: string;
  target: string;
  action: string;
  why: string;
  fit: number;
}

export interface WeeklyPoint {
  week: number;
  label: string;
  impressions: number;
  clicks: number;
  spend: number;
  /** v2 (F3): set only on festival weeks. */
  cpmMultiplier?: number;
  festival?: string;
}

export interface PlanTotals {
  budget: number;
  impressions: number;
  clicks: number;
  reach: number;
  conversions: number;
  estimatedCpa: number | null;
  estimatedRoas: number | null;
  estimatedAov: number;
}

export interface PlanResult {
  id: string;
  createdAt: string;
  input: PlanInput;
  site: SiteSnapshot;
  product: ProductIntel;
  category: string;
  priceTier: PriceTier;
  scores: ChannelScore[];
  mix: ChannelAllocation[];
  placements: PlacementPick[];
  rejected: ChannelScore[];
  totals: PlanTotals;
  weeklyForecast: WeeklyPoint[];
  adAngles: AdAngle[];
  outreach: OutreachScript[];
  llmUsed: boolean;
  llmProvider: string | null;
  disclaimer: string;
  estimateLabel: "ESTIMATE";
  agentMs: number;
  scorer: "xgboost";
  /** v2 fields are optional so v1 plans (localStorage + Postgres) still render. */
  planVersion?: 2;
  enrichment?: EnrichmentBundle;
  /** F10: free actions before any paid spend (rule-based, from signals + brief). */
  zeroRupee?: ZeroRupeeItem[];
  trace?: PlanTrace;
}

/* ---------- v2 enrichment (client-safe types; logic lives in lib/enrich) ---------- */

export type SignalStatus = "ok" | "skipped" | "timeout" | "error";

/** One optional data source result. Never thrown; always returned. */
export interface Signal<T> {
  /** "site_readiness", "festival_calendar", "google_places", ... */
  source: string;
  status: SignalStatus;
  /** ISO time of the original fetch (kept on cache hits). */
  fetchedAt: string;
  ms: number;
  cached: boolean;
  /** True when read from fixtures/api (ADPILOT_MOCK_APIS=1). Never shown as LIVE. */
  mock?: boolean;
  data?: T;
  /** "no API key", "HTTP 403", ... */
  reason?: string;
}

export type ReadinessCheckId =
  | "https"
  | "viewport"
  | "meta_pixel"
  | "ga4"
  | "gtm"
  | "whatsapp"
  | "tel"
  | "cta"
  | "og_image";

export interface ReadinessCheck {
  id: ReadinessCheckId;
  label: string;
  state: "pass" | "warn" | "fail";
  detail: string;
}

/** F1: "Ready to spend?" The score is a heuristic (ESTIMATE); the checks are LIVE. */
export interface SiteReadiness {
  score: number;
  checks: ReadinessCheck[];
  /** Highest priority first. */
  fixes: string[];
  /** Tiny budget + weak site: send clicks to WhatsApp/DM instead of the site. */
  funnelHint?: "whatsapp_dm";
}

export interface FestivalHit {
  name: string;
  /** ISO yyyy-mm-dd (main day). */
  date: string;
  /** Days from the plan start to the main day; negative = already started. */
  daysAway: number;
  states: string[];
  /** ESTIMATE of festival-week CPM pressure (1.25 = +25%). */
  cpmMultiplier: number;
  advice: string;
  verified: boolean;
  /** Festival matters for this plan's category (CPM pressure applies regardless). */
  relevant: boolean;
  /** 1-based plan weeks this festival overlaps. */
  weeks: number[];
}

/** F3: festival/season window for the plan's 4 weeks (static data, ESTIMATE). */
export interface SeasonWindow {
  state: string | null;
  stateName: string | null;
  windowStart: string;
  windowEnd: string;
  inWindow: FestivalHit[];
  /** After the window, within the next 60 days. */
  upcoming: FestivalHit[];
  /** One per plan week; 1 = normal. */
  weekMultipliers: number[];
  weekFestivals: (string | null)[];
}

/** F1 part B: PageSpeed Insights v5, mobile. Fetched after render (deferred). */
export interface PageSpeedResult {
  url: string;
  strategy: "mobile";
  /** Lighthouse performance score, 0-100 (lab run). */
  score: number;
  /** Largest Contentful Paint from the lab run, ms. */
  lcpMs: number;
  /** Real-user (CrUX) LCP bucket when Google has field data for the page. */
  fieldLcp?: "FAST" | "AVERAGE" | "SLOW";
}

/** One public business from Places Text Search (name + rating only; no address, phone or reviews). */
export interface PlaceSummary {
  name: string;
  rating?: number;
  reviews?: number;
}

/** F2: "{keyword} in {city}" competitors + whether the business itself is on Google Maps. */
export interface LocalMarket {
  /** The exact competitor query sent, e.g. "snack shop in Chennai". */
  query: string;
  keyword: string;
  /** Places returned on the first page (max 20). */
  count: number;
  /** Google had more than one page: show "20+". */
  more: boolean;
  /** Mean rating of the rated places, 1 decimal; null when none are rated. */
  avgRating: number | null;
  ratedCount: number;
  /** Up to 5, best rated among places with at least 10 reviews. */
  top: PlaceSummary[];
  own: {
    query: string;
    found: boolean;
    name?: string;
    mapsUri?: string;
  };
}

export type ZeroRupeeId =
  | "gbp"
  | "gbp_reviews"
  | "whatsapp_catalog"
  | "organic_reels"
  | "local_groups"
  | "founder_linkedin";

/** F10: one free action. `why` cites the signal or brief detail that triggered it. */
export interface ZeroRupeeItem {
  id: ZeroRupeeId;
  title: string;
  why: string;
  steps: string[];
  /** Signal sources quoted in `why` (badged in the UI); empty = from the brief only. */
  sources: string[];
}

/** Every optional data source result attached to a plan (brief section 3). */
export interface EnrichmentBundle {
  siteReadiness: Signal<SiteReadiness>;
  calendar: Signal<SeasonWindow>;
  /* M2+: pageSpeed, localMarket, audience, creators, searchDemand */
  /** Filled after render by the checkPageSpeed action; absent on the first response. */
  pageSpeed?: Signal<PageSpeedResult>;
  localMarket?: Signal<LocalMarket>;
  audience?: Signal<unknown>;
  creators?: Signal<unknown>;
  searchDemand?: Signal<unknown>;
}

export type TraceMeta = Record<string, string | number | boolean>;

/** One agent step or tool call (F15). Times are ms from the trace start. */
export interface TraceSpan {
  name: string;
  parent?: string;
  startMs: number;
  ms: number;
  status: SignalStatus;
  meta?: TraceMeta;
  error?: string;
}

export interface PlanTrace {
  startedAt: string;
  totalMs: number;
  spans: TraceSpan[];
}

export interface PlanListItem {
  id: string;
  createdAt: string;
  product_name: string;
  domain: string;
  city: string;
  budget: number;
  goal: string;
  category: string;
}

export const GOALS: { id: GoalId; label: string; hint: string }[] = [
  { id: "awareness", label: "Awareness", hint: "Reach new people in the city" },
  { id: "sales", label: "Sales", hint: "Orders, checkouts, walk-ins" },
  { id: "leads", label: "Leads", hint: "Forms, WhatsApp, calls" },
  { id: "store_visits", label: "Store visits", hint: "Drive people to a location" },
  { id: "app_installs", label: "App installs", hint: "Get the app downloaded" },
  { id: "b2b", label: "B2B pipeline", hint: "Demos and professional buyers" },
];

export const LANGUAGES = [
  "English",
  "Hindi",
  "Tamil",
  "Telugu",
  "Kannada",
  "Malayalam",
  "Marathi",
  "Bengali",
] as const;

export const ESTIMATE_DISCLAIMER =
  "All metrics are ESTIMATE values from a local India 2026 rate card. AdPilot does not buy ads, does not connect to Meta or Google, and does not report live delivery.";
