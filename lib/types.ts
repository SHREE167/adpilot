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
  /** F8 (optional): price of one sale in INR. Both price and margin are needed for the reality check. */
  price?: number;
  /** F8 (optional): gross margin per sale, percent (1-95). */
  margin?: number;
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
  /** F4: reach was cut to fit Meta's audience pool for the targeting. */
  reachCapped?: boolean;
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
  /** F8: break-even verdict; absent when the brief has no price/margin. */
  realityCheck?: RealityCheck;
  /** F9: exact TreeSHAP per channel; absent on plans made before M3. */
  shap?: PlanShap;
  trace?: PlanTrace;
}

/** One feature's SHAP contribution, in score points. */
export interface ShapDriver {
  feature: string;
  /** The feature as it applies to this brief, e.g. "Audience age ~21". */
  label: string;
  value: number;
}

/** base + Σ drivers + other == prediction (raw model output, before the 0-100 clamp). */
export interface ChannelShap {
  channelId: ChannelId;
  base: number;
  prediction: number;
  /** The plan's final score for the channel (clamped, rounded, after policy rules). */
  score: number;
  /** Top drivers by |value|. */
  drivers: ShapDriver[];
  /** Sum of every other feature's contribution. */
  other: number;
  otherCount: number;
}

export interface PlanShap {
  method: "treeshap";
  note: string;
  channels: ChannelShap[];
}

export type RealityVerdict = "healthy" | "tight" | "likely_loss";

/** One goal's click -> paying-customer conversion band (data/benchmarks.json, ESTIMATE). */
export interface ConversionBenchmark {
  goal: string;
  /** Fractions 0-1. */
  low: number;
  typical: number;
  high: number;
}

/** F8: can this budget pay for itself? Pure math on the brief + forecast clicks (ESTIMATE). */
export interface RealityCheck {
  price: number;
  marginPct: number;
  profitPerSale: number;
  budget: number;
  breakEvenUnits: number;
  /** Forecast clicks the conversion rate is measured against. */
  clicks: number;
  /** breakEvenUnits / clicks as a fraction; null when the forecast has no clicks. */
  requiredCvr: number | null;
  benchmark: ConversionBenchmark;
  /** requiredCvr / benchmark.typical; null when there are no clicks. */
  ratio: number | null;
  verdict: RealityVerdict;
  headline: string;
  detail: string;
  advice: string;
  /** Suggested smaller first test (tight / likely loss only). */
  testBudget?: number;
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

/** F5: one public YouTube channel (no personal data; channel stats only). */
export interface CreatorPick {
  channelId: string;
  title: string;
  url: string;
  subscribers: number;
  videos: number;
  views: number;
  /** Channel country as set by the creator, when public. */
  country?: string;
  /** Channel title/description names the brief's city. */
  cityMatch: boolean;
  /** 0-100 ranking score (heuristic, ESTIMATE). */
  fit: number;
  /** Facts behind the pick, each from the API response. */
  why: string[];
}

/** F5: "{topic} {city}" channel search → 2k-200k subscribers → top 5 by fit. */
export interface CreatorFinder {
  /** The exact search.list q sent. */
  query: string;
  topic: string;
  /** relevanceLanguage, e.g. "ta". */
  language: string;
  /** Channels search.list returned. */
  found: number;
  /** Of those, how many had 2k-200k public subscribers. */
  inBand: number;
  picks: CreatorPick[];
}

/** Meta targeting_spec as sent to reachestimate (subset AdPilot builds). */
export interface MetaTargetingSpec {
  geo_locations: { cities: { key: string }[] };
  age_min: number;
  age_max: number;
  flexible_spec?: { interests: { id: string; name: string }[] }[];
  publisher_platforms: string[];
}

/** F4: Meta's monthly audience size for the brief's city + age + interests. */
export interface AudienceEstimate {
  city: { key: string; name: string; region?: string };
  ageMin: number;
  ageMax: number;
  interests: { id: string; name: string }[];
  /** Why interests were left out, e.g. under-18 targeting rules. */
  interestsNote?: string;
  targetingSpec: MetaTargetingSpec;
  /** users_lower_bound / users_upper_bound from act_{id}/reachestimate. */
  lower: number;
  upper: number;
  apiVersion: string;
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
  audience?: Signal<AudienceEstimate>;
  creators?: Signal<CreatorFinder>;
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

/** Live pipeline progress (streamed while a plan builds). Mirrors TraceSpan as it happens. */
export interface TraceEvent {
  name: string;
  parent?: string;
  status: "running" | SignalStatus;
  /** ms since the run started. */
  atMs: number;
  /** Step duration; absent while running. */
  ms?: number;
  reason?: string;
}

/** NDJSON lines from POST /api/plan. */
export type PlanStreamEvent =
  | ({ type: "step" } & TraceEvent)
  | { type: "done"; plan: PlanResult }
  | { type: "error"; message: string };

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
