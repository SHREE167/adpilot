import { inr } from "./format";
import type {
  LocalMarket,
  PlanInput,
  Signal,
  SiteReadiness,
  ZeroRupeeId,
  ZeroRupeeItem,
} from "./types";

/** F10 "Before you spend anything": rule-based, pure, client-safe. */

export const MAX_ZERO_RUPEE = 4;

const B2B_CATEGORIES = new Set(["saas", "finance"]);
const SMALL_BUDGET = 5000;
const GROUPS_BUDGET = 10000;
const DENSE_MARKET = 10;

/** Places in the brief's notes that have a WhatsApp/Telegram group culture. */
const GROUP_HINT =
  /\b(hostels?|college|campus|pgs?|apartments?|society|societies|rwa|gated community|colony|tech ?park|office)\b/i;

export interface ZeroRupeeContext {
  input: PlanInput;
  category: string;
  readiness?: Signal<SiteReadiness>;
  localMarket?: Signal<LocalMarket>;
}

interface Candidate extends ZeroRupeeItem {
  weight: number;
}

function okData<T>(s: Signal<T> | undefined): T | undefined {
  return s && s.status === "ok" ? s.data : undefined;
}

/** "18-24" → 18; "25-45" → 25; unknown → null. */
export function minAge(audienceAge: string): number | null {
  const m = /(\d{2})/.exec(audienceAge || "");
  return m ? Number(m[1]) : null;
}

function marketCount(m: LocalMarket): string {
  return m.more ? `${m.count}+` : String(m.count);
}

export function buildZeroRupee(ctx: ZeroRupeeContext): ZeroRupeeItem[] {
  const { input, category } = ctx;
  const goal = String(input.goal);
  const b2b = goal === "b2b" || B2B_CATEGORIES.has(category);
  const small = input.budget < SMALL_BUDGET;
  const market = okData(ctx.localMarket);
  const readiness = okData(ctx.readiness);
  const out: Candidate[] = [];
  const add = (id: ZeroRupeeId, weight: number, item: Omit<ZeroRupeeItem, "id">) =>
    out.push({ id, weight, ...item });

  if (market && !market.own.found) {
    const avg = market.avgRating !== null ? ` (avg rating ${market.avgRating.toFixed(1)})` : "";
    add("gbp", 130 + (goal === "store_visits" ? 50 : 0) + (market.count >= DENSE_MARKET ? 10 : 0), {
      title: "Get on Google Maps with a free Business Profile",
      why:
        market.count > 0
          ? `We searched Google Maps for "${market.own.query}" and found no listing, while ${marketCount(market)} "${market.keyword}" businesses in ${input.city} are listed${avg}.`
          : `We searched Google Maps for "${market.own.query}" and found no listing for you.`,
      steps: [
        "Create the profile at business.google.com and verify it.",
        `Pick "${market.keyword}" as the category; add photos, hours and your WhatsApp number.`,
        "Ask your first 10 customers for a Google review.",
      ],
      sources: [ctx.localMarket!.source],
    });
  }

  if (market && market.own.found && (goal === "store_visits" || market.count >= DENSE_MARKET)) {
    add("gbp_reviews", 60 + (goal === "store_visits" ? 40 : 0), {
      title: "Win the Maps listing you already have",
      why: `You are on Maps, next to ${marketCount(market)} "${market.keyword}" listings in ${input.city}${market.avgRating !== null ? ` averaging ${market.avgRating.toFixed(1)} stars` : ""}. Fresh reviews and photos decide who gets the tap.`,
      steps: [
        "Ask every happy customer for a review; reply to each one.",
        "Post one photo update a week on the profile.",
      ],
      sources: [ctx.localMarket!.source],
    });
  }

  if (!b2b) {
    const wa = readiness?.checks.find((c) => c.id === "whatsapp");
    const why = !readiness
      ? "We could not read a website for this brand, so WhatsApp can be the storefront: a catalog, quick replies and Status cost nothing."
      : wa?.state === "pass"
        ? "Your site already links to WhatsApp, so chats are coming in. A Business catalog lets them order without leaving the chat."
        : "Your site has no WhatsApp link yet. A free WhatsApp Business account adds a catalog, quick replies and Status for repeat buyers.";
    add("whatsapp_catalog", 80 + (goal === "sales" ? 20 : 0) + (small ? 15 : 0), {
      title: "Set up WhatsApp Business: catalog + Status",
      why,
      steps: [
        "Install WhatsApp Business on the shop number; add a catalog with prices.",
        "Post a Status update daily: today's offer, a customer photo, stock left.",
        ...(wa && wa.state !== "pass" ? ["Add a wa.me link next to every button on the site."] : []),
      ],
      sources: readiness ? [ctx.readiness!.source] : [],
    });
  }

  const age = minAge(input.audience_age);
  if (!b2b && age !== null && age < 35) {
    add("organic_reels", 60 + (small ? 15 : 0), {
      title: `Post Reels before you boost any`,
      why: `Your buyers are ${input.audience_age} in ${input.city}.${small ? ` With ${inr(input.budget)} paid reach is small, so` : " Organic Reels"} find which hook works for free; boost only the winner later.`,
      steps: [
        "Post 3 short Reels a week for two weeks, each with a different hook.",
        "Keep the one with the most shares and saves; that is your first ad.",
      ],
      sources: [],
    });
  }

  const hint = GROUP_HINT.exec(input.audience_notes || "");
  if (!b2b && input.budget < GROUPS_BUDGET && (hint || goal === "store_visits")) {
    add("local_groups", 55 + (hint ? 15 : 0), {
      title: "Share an offer in local WhatsApp and Telegram groups",
      why: hint
        ? `Your brief mentions "${hint[0]}": those groups reach your buyers directly and cost nothing.`
        : `Store visits come from the neighbourhood first; area groups around your shop in ${input.city} cost nothing.`,
      steps: [
        "Ask admins of 3 to 5 groups before posting; one post per group per week.",
        "Use a group-only code (e.g. GROUP10) so you can count what it sold.",
      ],
      sources: [],
    });
  }

  if (b2b) {
    add("founder_linkedin", 70, {
      title: "Founder posts on LinkedIn, twice a week",
      why: `The goal is B2B pipeline from ${inr(input.budget)}. Buyers look up the founder before they book a demo, and organic posts cost nothing.`,
      steps: [
        "Write 2 posts a week, each about one customer problem you solved.",
        "Comment usefully on 10 posts by target buyers every weekday.",
      ],
      sources: [],
    });
  }

  return out
    .sort((a, b) => b.weight - a.weight)
    .slice(0, MAX_ZERO_RUPEE)
    .map(({ weight, ...item }) => {
      void weight;
      return item;
    });
}
