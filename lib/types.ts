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
