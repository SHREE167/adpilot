import { parseAgeMidpoint } from "@/lib/format";
import { isMetro, isVernacular } from "@/lib/infer";
import type {
  ChannelAllocation,
  ChannelId,
  PlacementKind,
  PlacementPick,
  PlanInput,
  ProductIntel,
} from "@/lib/types";

interface CatalogRow {
  channelId: ChannelId;
  kind: PlacementKind;
  name: string;
  target: string;
  action: string;
  tags: string[];
  cities?: string[];
  languages?: string[];
}

/**
 * India 2026 planning inventory — not a live Google Ads lookup.
 * Used to turn "Display" into actual sites/apps to add as placements.
 */
const CATALOG: CatalogRow[] = [
  // Google Search — query themes + partners
  {
    channelId: "google_search",
    kind: "keyword_theme",
    name: "Near-me / local intent",
    target: "[product] near me, [city] [category]",
    action: "Exact + phrase match in Google Search campaigns",
    tags: ["local", "food", "store_visits", "sales"],
  },
  {
    channelId: "google_search",
    kind: "keyword_theme",
    name: "High-intent category queries",
    target: "best [category] India, [product type] price",
    action: "Search campaign, brand + non-brand split",
    tags: ["sales", "leads", "ecommerce"],
  },
  {
    channelId: "google_search",
    kind: "keyword_theme",
    name: "B2B software queries",
    target: "CRM for Indian B2B, inbound to demo, GST-ready [category]",
    action: "Search + exact match on competitor and category terms",
    tags: ["saas", "b2b", "leads"],
  },
  {
    channelId: "google_search",
    kind: "google_app",
    name: "Google Search app",
    target: "com.google.android.googlequicksearchbox",
    action: "Search Network — include Google Search app inventory",
    tags: ["all"],
  },
  {
    channelId: "google_search",
    kind: "google_app",
    name: "Google Maps",
    target: "Google Maps search + local pack",
    action: "Search partners + location assets; Maps for store visits",
    tags: ["store_visits", "food", "local_service", "local"],
  },

  // Google Display Network — specific SITES
  {
    channelId: "google_display",
    kind: "google_site",
    name: "Times of India",
    target: "timesofindia.indiatimes.com",
    action: "GDN managed placement (website)",
    tags: ["awareness", "english", "metro", "news"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "NDTV",
    target: "ndtv.com",
    action: "GDN managed placement (website)",
    tags: ["awareness", "english", "metro"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "Indian Express",
    target: "indianexpress.com",
    action: "GDN managed placement (website)",
    tags: ["english", "metro", "awareness"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "Cricbuzz",
    target: "cricbuzz.com",
    action: "GDN managed placement — cricket inventory",
    tags: ["youth", "food", "entertainment", "male"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "Moneycontrol",
    target: "moneycontrol.com",
    action: "GDN managed placement",
    tags: ["saas", "finance", "b2b", "professional"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "YourStory",
    target: "yourstory.com",
    action: "GDN managed placement — startup/SaaS readers",
    tags: ["saas", "b2b", "english"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "Inc42",
    target: "inc42.com",
    action: "GDN managed placement",
    tags: ["saas", "b2b", "english"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "Vikatan",
    target: "vikatan.com",
    action: "GDN managed placement — Tamil news/entertainment",
    tags: ["tamil", "food", "chennai", "vernacular"],
    languages: ["tamil"],
    cities: ["chennai", "coimbatore", "madurai"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "The Hindu",
    target: "thehindu.com",
    action: "GDN managed placement",
    tags: ["english", "chennai", "education", "metro"],
    cities: ["chennai", "hyderabad", "bengaluru", "kochi"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "News18 Tamil",
    target: "tamil.news18.com",
    action: "GDN managed placement",
    tags: ["tamil", "chennai", "vernacular"],
    languages: ["tamil"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "Filmibeat Tamil",
    target: "tamil.filmibeat.com",
    action: "GDN managed placement — cinema + youth",
    tags: ["tamil", "youth", "food", "entertainment"],
    languages: ["tamil"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "Jagran",
    target: "jagran.com",
    action: "GDN managed placement — Hindi belt",
    tags: ["hindi", "vernacular", "food"],
    languages: ["hindi"],
  },
  {
    channelId: "google_display",
    kind: "google_site",
    name: "The News Minute",
    target: "thenewsminute.com",
    action: "GDN managed placement — South metros",
    tags: ["english", "bengaluru", "chennai", "hyderabad"],
    cities: ["bengaluru", "bangalore", "chennai", "hyderabad"],
  },

  // Google APPS on Display / Video
  {
    channelId: "google_display",
    kind: "google_app",
    name: "Gmail",
    target: "Gmail Promotions + native GDN in Gmail",
    action: "Display campaign → Google app: Gmail",
    tags: ["b2b", "saas", "leads", "professional", "english"],
  },
  {
    channelId: "google_display",
    kind: "google_app",
    name: "Google Discover",
    target: "Discover feed (Google app)",
    action: "Display / Demand Gen — Discover inventory",
    tags: ["awareness", "food", "youth", "all"],
  },
  {
    channelId: "google_display",
    kind: "google_app",
    name: "Google News",
    target: "Google News app",
    action: "GDN app placement: Google News",
    tags: ["awareness", "english", "metro"],
  },
  {
    channelId: "google_display",
    kind: "google_app",
    name: "Google Play Store",
    target: "Play Store browse + search ads",
    action: "App campaign or GDN on Play",
    tags: ["app_installs", "youth"],
  },
  {
    channelId: "google_search",
    kind: "google_app",
    name: "Google Shopping / Search shopping units",
    target: "Shopping units on Search",
    action: "If you have a product feed; else skip",
    tags: ["ecommerce", "sales", "food"],
  },

  // YouTube = Google app inventory
  {
    channelId: "youtube",
    kind: "google_app",
    name: "YouTube app — in-stream skippable",
    target: "YouTube Android/iOS in-stream",
    action: "Video campaign, in-stream, 6s bumper + 15s",
    tags: ["awareness", "all"],
  },
  {
    channelId: "youtube",
    kind: "google_app",
    name: "YouTube Shorts",
    target: "YouTube Shorts feed (Google app family)",
    action: "Demand Gen / Shorts ads, vertical 9:16",
    tags: ["youth", "food", "entertainment", "tamil"],
  },
  {
    channelId: "youtube",
    kind: "format",
    name: "YouTube in-feed",
    target: "Home / suggested next to food or tech videos",
    action: "In-feed video ads, topic: food OR software",
    tags: ["food", "saas", "education"],
  },
  {
    channelId: "youtube",
    kind: "format",
    name: "Tamil cinema + food creator adjacency",
    target: "Place against Tamil entertainment + street-food channels",
    action: "YouTube topics + placement on similar channels",
    tags: ["tamil", "food", "chennai", "youth"],
    languages: ["tamil"],
  },
  {
    channelId: "youtube",
    kind: "format",
    name: "Indian SaaS / founder channels",
    target: "Tech review + startup podcast inventory",
    action: "YouTube placements on B2B/creator videos",
    tags: ["saas", "b2b", "english"],
  },

  // Instagram specifics
  {
    channelId: "instagram_reels",
    kind: "format",
    name: "Reels + Stories + Explore",
    target: "Instagram Reels (primary), Stories sticker, Explore",
    action: "Advantage+ placements off — Reels first",
    tags: ["youth", "food", "fashion"],
  },
  {
    channelId: "instagram_reels",
    kind: "publisher",
    name: "Campus / food creator lookalikes",
    target: "Creators posting hostel food, Chennai reels",
    action: "Spark / collab, not only brand ads",
    tags: ["food", "youth", "tamil", "chennai"],
  },
  {
    channelId: "instagram_feed",
    kind: "format",
    name: "Feed carousel + shop card",
    target: "Instagram Feed",
    action: "Carousel of pack / price / pickup",
    tags: ["sales", "ecommerce", "food"],
  },

  // Facebook
  {
    channelId: "facebook",
    kind: "format",
    name: "Facebook Feed + local Groups adjacent",
    target: "Facebook app Feed, Audience Network off unless cheap reach",
    action: "Boost with map pin + 18–45 in city",
    tags: ["local", "store_visits", "food"],
  },
  {
    channelId: "facebook",
    kind: "app",
    name: "Facebook app (not Messenger)",
    target: "Facebook Android/iOS",
    action: "Placements: Feed, not Reels-on-FB first for 30+",
    tags: ["all"],
  },

  // WhatsApp
  {
    channelId: "whatsapp",
    kind: "app",
    name: "WhatsApp Click-to-WhatsApp ads",
    target: "WhatsApp Business click from IG/FB",
    action: "CTWA destination, pre-filled message",
    tags: ["sales", "food", "local", "leads"],
  },
  {
    channelId: "whatsapp",
    kind: "format",
    name: "WhatsApp Status + broadcast",
    target: "Status from existing buyers, labelled broadcast",
    action: "Organic + paid CTWA, not spam lists",
    tags: ["food", "local", "tamil"],
  },

  // ShareChat
  {
    channelId: "sharechat",
    kind: "app",
    name: "ShareChat app — Tamil / Hindi feed",
    target: "in.mohalla.sharechat",
    action: "In-app video, regional language creative",
    tags: ["vernacular", "youth", "food", "tamil", "hindi"],
  },
  {
    channelId: "sharechat",
    kind: "app",
    name: "Moj short video",
    target: "ShareChat Moj",
    action: "Same account group, Shorts-like",
    tags: ["youth", "food", "vernacular"],
  },

  // LinkedIn
  {
    channelId: "linkedin",
    kind: "format",
    name: "LinkedIn Feed + Document ads",
    target: "linkedin.com / LinkedIn app",
    action: "Job titles: Founder, Head of Sales, RevOps, India",
    tags: ["saas", "b2b", "leads", "professional"],
  },
  {
    channelId: "linkedin",
    kind: "format",
    name: "Sponsored InMail / Conversation ads",
    target: "LinkedIn Messaging",
    action: "Only if CPC budget can clear ₹40",
    tags: ["saas", "b2b"],
  },

  // Telegram, Reddit, X
  {
    channelId: "telegram",
    kind: "publisher",
    name: "India startup / city Telegram channels",
    target: "Relevant public channels, not random groups",
    action: "Sponsored post or admin collab",
    tags: ["saas", "education", "community"],
  },
  {
    channelId: "reddit",
    kind: "publisher",
    name: "r/india, r/developersIndia, r/SaaS",
    target: "reddit.com/r/developersIndia",
    action: "Reddit ads — interest + subreddit placements",
    tags: ["saas", "b2b", "english"],
  },
  {
    channelId: "x",
    kind: "format",
    name: "X / Twitter India tech lists",
    target: "x.com — follower lookalikes of Indian SaaS founders",
    action: "Promoted posts, not Super Follows",
    tags: ["saas", "b2b", "english", "awareness"],
  },
];

function blobOf(input: PlanInput, product: ProductIntel): string {
  return [
    product.category,
    product.priceTier,
    product.summary,
    product.audience,
    product.differentiators.join(" "),
    input.goal,
    input.city,
    input.language,
    input.audience_notes,
    input.product_name,
  ]
    .join(" ")
    .toLowerCase();
}

function scoreRow(
  row: CatalogRow,
  input: PlanInput,
  product: ProductIntel
): number {
  const blob = blobOf(input, product);
  const age = parseAgeMidpoint(input.audience_age);
  const city = input.city.trim().toLowerCase();
  const lang = input.language.trim().toLowerCase();
  let s = 40;
  for (const tag of row.tags) {
    if (tag === "all") s += 8;
    if (blob.includes(tag)) s += 14;
    if (tag === "youth" && age <= 26) s += 12;
    if (tag === "professional" && age >= 26) s += 10;
    if (tag === "metro" && isMetro(input.city)) s += 8;
    if (tag === "vernacular" && isVernacular(input.language)) s += 12;
    if (tag === "local" && (product.category === "food" || input.goal === "store_visits")) s += 10;
  }
  if (row.cities?.some((c) => city.includes(c))) s += 22;
  if (row.languages?.some((l) => lang.includes(l))) s += 20;
  return s;
}

export function lookupPlacements(
  mix: ChannelAllocation[],
  input: PlanInput,
  product: ProductIntel
): PlacementPick[] {
  const allocated = new Set(mix.map((m) => m.channelId));
  const names = Object.fromEntries(mix.map((m) => [m.channelId, m.name]));
  const picked: PlacementPick[] = [];

  for (const id of allocated) {
    const rows = CATALOG.filter((r) => r.channelId === id)
      .map((r) => ({
        r,
        fit: scoreRow(r, input, product),
      }))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 5);
    for (const { r, fit } of rows) {
      picked.push({
        channelId: r.channelId,
        channelName: names[r.channelId] || r.channelId,
        kind: r.kind,
        name: r.name,
        target: r.target,
        action: r.action,
        why: whyLine(r, input, product),
        fit,
      });
    }
  }

  if (!allocated.has("google_display")) {
    const extra = CATALOG.filter((r) => r.channelId === "google_display")
      .map((r) => ({ r, fit: scoreRow(r, input, product) }))
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 3);
    for (const { r, fit } of extra) {
      picked.push({
        channelId: r.channelId,
        channelName: "Optional: add Google Display",
        kind: r.kind,
        name: r.name,
        target: r.target,
        action: r.action,
        why: `Your mix did not include Display, but ${pName(input, product)} still belongs on this Google site/app if you extend the plan.`,
        fit: fit - 8,
      });
    }
  }

  const ranked = picked.sort((a, b) => b.fit - a.fit);
  const sites = ranked.filter((p) => p.kind === "google_site").slice(0, 4);
  const apps = ranked.filter((p) => p.kind === "google_app").slice(0, 4);
  const rest = ranked
    .filter((p) => p.kind !== "google_site" && p.kind !== "google_app")
    .slice(0, 6);
  const seen = new Set<string>();
  const out: PlacementPick[] = [];
  for (const p of [...sites, ...apps, ...rest].sort((a, b) => b.fit - a.fit)) {
    const k = `${p.kind}:${p.target}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

function pName(input: PlanInput, product: ProductIntel): string {
  return product.recognizedName || input.product_name;
}

function whyLine(row: CatalogRow, input: PlanInput, product: ProductIntel): string {
  const p = product.recognizedName || input.product_name;
  if (row.kind === "google_site") {
    return `Don't buy generic Display. Add ${row.target} as a managed GDN placement so ${p} shows on that site.`;
  }
  if (row.kind === "google_app") {
    return `This is a Google app, not a random website. Target ${row.name} in Google Ads inventory.`;
  }
  if (row.kind === "keyword_theme") {
    return `Search is not “Google”. These are the query themes ${p} should bid on in ${input.city}.`;
  }
  return `Specific inventory for ${row.channelId.replace(/_/g, " ")} — ${p} in ${input.city}.`;
}
