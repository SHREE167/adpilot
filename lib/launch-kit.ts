// F7: deterministic launch kit, built from the mix and the enrichment signals.
// Pure and client-safe. Every number shown in text comes from a structured
// field, the plan or a signal, so the grounding guard can trace it.
import { costBand } from "./creator-rates";
import { compactNumber, inr } from "./format";
import { shortDate } from "./sources";
import type {
  AudienceEstimate,
  ChannelAllocation,
  CreatorFinder,
  ChannelId,
  EnrichmentBundle,
  KitChannel,
  LaunchKit,
  PlacementPick,
  PlanInput,
  Signal,
} from "./types";

export interface KitContext {
  input: PlanInput;
  category: string;
  mix: ChannelAllocation[];
  placements: PlacementPick[];
  enrichment?: EnrichmentBundle;
}

const META: ReadonlySet<ChannelId> = new Set(["facebook", "instagram_reels", "instagram_feed"]);
const ALL_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ok<T>(s: Signal<T> | undefined): T | undefined {
  return s && s.status === "ok" ? s.data : undefined;
}

function sameCity(a: string, b: string): boolean {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  return Boolean(x && y) && (x.includes(y) || y.includes(x));
}

/** Meta audience, only when it describes the brief's own city (mock fallbacks may not). */
function audienceOf(ctx: KitContext): AudienceEstimate | undefined {
  const a = ok(ctx.enrichment?.audience);
  return a && sameCity(a.city.name, ctx.input.city) ? a : undefined;
}

/** YouTube creators, only when the search named the brief's own city. */
function creatorsOf(ctx: KitContext): CreatorFinder | undefined {
  const c = ok(ctx.enrichment?.creators);
  return c && c.query.toLowerCase().includes(ctx.input.city.trim().toLowerCase()) && ctx.input.city.trim() ? c : undefined;
}

/** "Fri-Sun", "Mon-Fri", "every day", or "Tue, Thu". */
export function dayRange(days: string[]): string {
  if (days.length === 7) return "every day";
  const idx = days.map((d) => ALL_DAYS.indexOf(d)).sort((a, b) => a - b);
  const contiguous = idx.every((v, i) => i === 0 || v === idx[i - 1] + 1);
  if (contiguous && idx.length > 2) return `${ALL_DAYS[idx[0]]}-${ALL_DAYS[idx[idx.length - 1]]}`;
  return idx.map((i) => ALL_DAYS[i]).join(", ");
}

/** 18 → "6pm", 9 → "9am", 0 → "12am". */
export function hour12(h: number): string {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}${h < 12 || h === 24 ? "am" : "pm"}`;
}

function window(start: number, end: number): string {
  return `${hour12(start)}-${hour12(end)}`;
}

interface Slot {
  days: string[];
  start: number;
  end: number;
}

/** When buyers in this category are on their phones (ESTIMATE rules). */
function slotFor(ch: ChannelId, input: PlanInput, category: string): Slot {
  const notes = `${input.audience_notes} ${input.product_name}`.toLowerCase();
  const goal = String(input.goal);
  if (ch === "google_search") return { days: ALL_DAYS, start: 8, end: 22 };
  if (ch === "whatsapp") return { days: ALL_DAYS, start: 9, end: 21 };
  if (ch === "linkedin" || goal === "b2b" || category === "saas") return { days: ["Tue", "Wed", "Thu"], start: 9, end: 12 };
  if (category === "food") {
    if (/lunch|office|swiggy|zomato/.test(notes)) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], start: 11, end: 14 };
    return { days: ["Fri", "Sat", "Sun"], start: 18, end: 22 };
  }
  if (category === "education") return { days: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], start: 19, end: 22 };
  if (category === "fashion") return { days: ["Thu", "Fri", "Sat", "Sun"], start: 19, end: 23 };
  if (category === "local_service") {
    if (/repair|servic|plumb|electric/.test(notes)) return { days: ALL_DAYS, start: 9, end: 19 };
    return { days: ["Fri", "Sat", "Sun"], start: 10, end: 14 };
  }
  if (ch === "youtube") return { days: ["Fri", "Sat", "Sun"], start: 17, end: 22 };
  return { days: ALL_DAYS, start: 18, end: 22 };
}

interface Format {
  label: string;
  plural: string;
  aspect?: [number, number];
  seconds?: [number, number];
  /** Rupees per creative before a test means anything (ESTIMATE). */
  per: number;
  max: number;
}

const FORMATS: Record<ChannelId, Format> = {
  instagram_reels: { label: "vertical Reel", plural: "vertical Reels", aspect: [9, 16], seconds: [15, 30], per: 600, max: 4 },
  instagram_feed: { label: "square carousel", plural: "square carousels", aspect: [1, 1], per: 600, max: 3 },
  facebook: { label: "square image or video post", plural: "square image or video posts", aspect: [1, 1], per: 600, max: 3 },
  youtube: { label: "vertical Short", plural: "vertical Shorts", aspect: [9, 16], seconds: [15, 60], per: 1500, max: 3 },
  google_search: { label: "responsive search ad", plural: "responsive search ads", per: 1000, max: 3 },
  google_display: { label: "responsive display ad", plural: "responsive display ads", per: 1000, max: 3 },
  whatsapp: { label: "click-to-WhatsApp ad", plural: "click-to-WhatsApp ads", per: 500, max: 3 },
  sharechat: { label: "vertical video", plural: "vertical videos", aspect: [9, 16], seconds: [10, 30], per: 800, max: 3 },
  linkedin: { label: "single-image sponsored post", plural: "single-image sponsored posts", per: 5000, max: 3 },
  telegram: { label: "pinned channel post", plural: "pinned channel posts", per: 1000, max: 2 },
  reddit: { label: "promoted text post", plural: "promoted text posts", per: 2500, max: 2 },
  x: { label: "promoted post", plural: "promoted posts", per: 2500, max: 3 },
};

function creativesFor(row: ChannelAllocation): KitChannel["creatives"] {
  const f = FORMATS[row.channelId];
  const count = Math.max(1, Math.min(f.max, Math.floor(row.budget / f.per)));
  const shape = [
    f.aspect ? `${f.aspect[0]}:${f.aspect[1]}` : "",
    f.seconds ? `${f.seconds[0]}-${f.seconds[1]}s` : "",
  ]
    .filter(Boolean)
    .join(", ");
  const text = `${count} ${count === 1 ? f.label : f.plural}${shape ? ` (${shape})` : ""}${count > 1 ? ", each with a different hook" : ""}`;
  return {
    count,
    format: f.plural,
    ...(f.aspect ? { aspect: f.aspect } : {}),
    ...(f.seconds ? { seconds: f.seconds } : {}),
    text,
  };
}

const STOP = new Set(["and", "the", "for", "with", "near", "from", "our", "your", "a", "an", "of", "in", "at", "to"]);

function productWords(input: PlanInput): string[] {
  return input.product_name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

function searchKeywords(ctx: KitContext): string[] {
  const city = ctx.input.city.trim().toLowerCase();
  const market = ok(ctx.enrichment?.localMarket);
  const words = productWords(ctx.input);
  const head = words.slice(-2).join(" ");
  const out = [
    market ? `${market.keyword} near me` : "",
    market ? `best ${market.keyword} in ${city}` : "",
    head ? `${head} ${city}` : "",
    head ? `${head} price` : "",
    ...ctx.placements.filter((p) => p.channelId === "google_search" && p.kind === "keyword_theme").map((p) => p.target.toLowerCase()),
  ];
  return [...new Set(out.map((s) => s.trim()).filter(Boolean))].slice(0, 6);
}

/** What is sold, short: product name before a comma or " for ". */
export function offerName(input: PlanInput): string {
  const head = input.product_name.split(/,|s+fors+|s+withs+/i)[0].trim();
  return head.length > 48 ? head.split(/s+/).slice(-3).join(" ") : head || "your offer";
}

/** Who buys, short: the first clause of the audience notes. */
export function buyers(input: PlanInput): string {
  const first = (input.audience_notes || "").split(/[.:;]/)[0].replace(/s+/g, " ").trim();
  if (!first) return "your buyers";
  const words = first.split(" ");
  return (words.length > 8 ? words.slice(0, 8).join(" ") : first).replace(/^./, (c) => c.toLowerCase());
}

function metricFor(row: ChannelAllocation, input: PlanInput, mixIds: Set<ChannelId>): KitChannel["metric"] {
  const goal = String(input.goal);
  const f = row.forecast;
  const ctr = `${(f.ctr * 100).toFixed(1)}%`;
  const plan = `For ${offerName(input)} in ${input.city} the plan assumes ${ctr} CTR and ${inr(f.cpc)} per click (ESTIMATE).`;
  switch (row.channelId) {
    case "google_search":
      return goal === "awareness"
        ? { name: "Search impression share", why: `Shows how often you appear when people search. ${plan}` }
        : { name: "Cost per conversion", why: `Search is the high-intent slice: judge it on leads or orders, not clicks. ${plan}` };
    case "whatsapp":
      return { name: "Cost per conversation started", why: "A chat is the sale here: count chats that ask about price or stock." };
    case "instagram_reels":
    case "instagram_feed":
    case "facebook":
      if (mixIds.has("whatsapp")) {
        return { name: "Cost per WhatsApp chat", why: `Send clicks to WhatsApp and count chats, not likes. ${plan}` };
      }
      if (goal === "store_visits") {
        return { name: "Cost per call or directions tap", why: `Store visits start with a call or a map tap. ${plan}` };
      }
      return { name: "Link click-through rate", why: `Low CTR means the hook is wrong: change the first second before adding budget. ${plan}` };
    case "youtube":
      return { name: "View rate", why: "If people skip in the first seconds, the opening shot needs to change." };
    case "google_display":
      return { name: "CTR by placement", why: `Exclude placements with clicks but no visits after week one. ${plan}` };
    case "linkedin":
      return { name: "Cost per lead form", why: `LinkedIn clicks are expensive: only leads justify it. ${plan}` };
    default:
      return { name: "Cost per click", why: plan };
  }
}

function targetingFor(row: ChannelAllocation, ctx: KitContext): KitChannel["targeting"] {
  const { input } = ctx;
  const aud = audienceOf(ctx);
  const creators = creatorsOf(ctx);
  if (META.has(row.channelId)) {
    if (aud) {
      const ints = aud.interests.length ? `; interests: ${aud.interests.map((i) => i.name).join(", ")}` : "";
      return {
        text: `${aud.city.name}, age ${aud.ageMin}-${aud.ageMax}${ints}. Pool ${compactNumber(aud.lower)}-${compactNumber(aud.upper)} people.`,
        spec: aud.targetingSpec,
      };
    }
    return { text: `${input.city}, age ${input.audience_age}. Narrow with interests that match what you sell.` };
  }
  switch (row.channelId) {
    case "google_search":
      return { text: `People in ${input.city} searching the keywords below (location: presence, not interest).` };
    case "google_display": {
      const sites = ctx.placements.filter((p) => p.channelId === "google_display").slice(0, 3).map((p) => p.target);
      return { text: sites.length ? `Managed placements only: ${sites.join("; ")}.` : `Managed placements in ${input.city}; no open network.` };
    }
    case "youtube": {
      const top = creators?.picks[0];
      return {
        text: top
          ? `Shorts and in-stream in ${input.city}, age ${input.audience_age}; or a collab with ${top.title} (${compactNumber(top.subscribers)} subscribers).`
          : `Shorts and in-stream in ${input.city}, age ${input.audience_age}.`,
      };
    }
    case "whatsapp":
      return { text: `Click-to-WhatsApp ads from Instagram/Facebook in ${input.city}, plus a broadcast list of past buyers.` };
    case "sharechat":
      return { text: `${input.language} speakers in and around ${input.city}, age ${input.audience_age}.` };
    case "linkedin":
      return { text: `Job titles from your brief (${input.audience_notes.split(/[.:]/)[0].trim()}), location ${input.city}.` };
    default:
      return { text: `${input.city} communities that match: ${input.audience_notes.split(".")[0].trim()}.` };
  }
}

function checklistFor(row: ChannelAllocation, ctx: KitContext, used: Set<string>): string[] {
  const { input, enrichment: e } = ctx;
  const items: string[] = [];
  const ready = ok(e?.siteReadiness);
  const market = ok(e?.localMarket);
  const cal = ok(e?.calendar);
  const creators = creatorsOf(ctx);
  const isMeta = META.has(row.channelId);

  if (isMeta && ready) {
    const pixel = ready.checks.find((c) => c.id === "meta_pixel");
    const gtm = ready.checks.find((c) => c.id === "gtm");
    if (pixel && pixel.state !== "pass") {
      items.push(
        gtm?.state === "pass"
          ? "Check your GTM container for the Meta Pixel before the first rupee."
          : "Install the Meta Pixel before the first rupee, or results cannot be measured."
      );
      used.add(e!.siteReadiness.source);
    }
  }
  if ((isMeta || row.channelId === "whatsapp") && ready?.funnelHint === "whatsapp_dm") {
    items.push("Send clicks to WhatsApp, not the website: the site is not ready for paid traffic yet.");
    used.add(e!.siteReadiness.source);
  }
  if (market && (row.channelId === "google_search" || row.channelId === "google_display" || input.goal === "store_visits")) {
    if (!market.own.found) {
      items.push(`Create a free Google Business Profile first: "${market.own.query}" has no Maps listing.`);
    } else if (market.top[0]) {
      const t = market.top[0];
      items.push(
        `Read ${t.name}'s listing${typeof t.rating === "number" ? ` (${t.rating.toFixed(1)} stars)` : ""} and say what you do differently in the ad.`
      );
    }
    if (market.count) used.add(e!.localMarket!.source);
  }
  const fest = cal?.inWindow.find((f) => f.relevant) ?? cal?.upcoming.find((f) => f.relevant);
  if (fest && row.channelId !== "google_search") {
    const when = fest.weeks.length ? ` (week ${fest.weeks[0]})` : "";
    items.push(
      `Have ${offerName(input)} ${fest.name} creatives ready before ${shortDate(fest.date)}${when}; CPM runs about ${fest.cpmMultiplier}x that week (ESTIMATE).`
    );
    used.add(e!.calendar.source);
  }
  if (creators?.picks[0] && (row.channelId === "youtube" || row.channelId === "instagram_reels")) {
    const c = creators.picks[0];
    const band = costBand(c.subscribers);
    items.push(
      `DM ${c.title} (${compactNumber(c.subscribers)} subscribers) with a free-sample offer${band?.barter ? " before offering cash" : ""}.`
    );
    used.add(e!.creators!.source);
  }
  const thing = offerName(input);
  const who = buyers(input);
  const base: Partial<Record<ChannelId, string>> = {
    google_search: `Add negative keywords on day one so "${thing}" searches for jobs, recipes or free stuff do not eat the budget.`,
    google_display: `Turn off the open network: show ${thing} only on the placements listed.`,
    instagram_reels: `Post the hooks for ${thing} organically first; boost only the one ${who} share.`,
    instagram_feed: `Lead the carousel with the ${thing} price and one real customer photo from ${input.city}.`,
    facebook: `Pin the ${thing} offer to the Page with the map pin and phone number for ${input.city}.`,
    whatsapp: `Set a greeting and quick replies for ${thing}: price, stock and where in ${input.city}.`,
    youtube: `Show ${thing} in hand in the first second; no logo intro.`,
    sharechat: `Write the ${thing} caption in ${input.language}; keep English to the brand name.`,
    linkedin: `Use a lead form, not a landing page, for the first ${thing} test.`,
    telegram: `Ask admins of groups where ${who} gather before posting about ${thing}.`,
    reddit: `Write like a member, not an ad, when you mention ${thing}; answer every comment.`,
    x: `Promote one founder post about ${thing}, not a banner.`,
  };
  if (base[row.channelId]) items.push(base[row.channelId]!);
  return items.slice(0, 5);
}

/** Plan weeks to push: relevant festivals in the 4-week window (ESTIMATE timing). */
function pushWeeks(ctx: KitContext): { weeks: number[]; festival?: string } {
  const cal = ok(ctx.enrichment?.calendar);
  const hit = cal?.inWindow.find((f) => f.relevant && f.weeks.length);
  return hit ? { weeks: hit.weeks, festival: hit.name } : { weeks: [] };
}

/** Pure: the deterministic kit (wording "template"). */
export function buildLaunchKit(ctx: KitContext): LaunchKit {
  const mixIds = new Set(ctx.mix.map((m) => m.channelId));
  const push = pushWeeks(ctx);
  const channels: KitChannel[] = ctx.mix.map((row) => {
    const used = new Set<string>();
    const slot = slotFor(row.channelId, ctx.input, ctx.category);
    const targeting = targetingFor(row, ctx);
    if (targeting.spec) used.add(ctx.enrichment!.audience!.source);
    const creatives = creativesFor(row);
    const keywords =
      row.channelId === "google_search"
        ? searchKeywords(ctx)
        : META.has(row.channelId)
          ? (audienceOf(ctx)?.interests.map((i) => i.name) ?? [])
          : row.channelId === "youtube"
            ? [creatorsOf(ctx)?.topic].filter((x): x is string => Boolean(x))
            : [];
    if (row.channelId === "google_search" && ok(ctx.enrichment?.localMarket)) used.add(ctx.enrichment!.localMarket!.source);
    const checklist = checklistFor(row, ctx, used);
    const pushText = push.weeks.length ? `; push harder in week${push.weeks.length > 1 ? "s" : ""} ${push.weeks.join(" and ")} (${push.festival})` : "";
    const scheduleText = `${dayRange(slot.days)}, ${window(slot.start, slot.end)}${pushText}.`;
    const where = targeting.spec
      ? `${audienceOf(ctx)!.city.name} ${targeting.spec.age_min}-${targeting.spec.age_max}`
      : `${ctx.input.city} ${ctx.input.audience_age}`;
    const firstStep = checklist[0] && /Pixel|WhatsApp, not|Business Profile/.test(checklist[0]) ? ` · ${checklist[0].split(/[:,]/)[0].replace(/\.$/, "")}` : "";
    const headline = `${row.name} · ${inr(row.budget)} · ${where} · ${creatives.count} ${creatives.count === 1 ? FORMATS[row.channelId].label : FORMATS[row.channelId].plural} ${dayRange(slot.days)} ${window(slot.start, slot.end)}${push.festival ? ` · ${push.festival} week` : ""}${firstStep}`;
    return {
      channelId: row.channelId,
      name: row.name,
      budget: row.budget,
      percent: row.percent,
      headline,
      targeting,
      schedule: { days: slot.days, startHour: slot.start, endHour: slot.end, pushWeeks: push.weeks, text: scheduleText },
      creatives,
      keywords,
      checklist,
      metric: metricFor(row, ctx.input, mixIds),
      sources: [...used],
    };
  });
  return {
    language: ctx.input.language,
    channels,
    wording: "template",
    guard: { checked: 0, removed: 0, samples: [] },
  };
}

/** The text fields an LLM may reword, keyed "<channelId>.<field>[.i]". */
export function kitTexts(kit: LaunchKit): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of kit.channels) {
    out[`${c.channelId}.headline`] = c.headline;
    out[`${c.channelId}.targeting`] = c.targeting.text;
    out[`${c.channelId}.schedule`] = c.schedule.text;
    out[`${c.channelId}.creatives`] = c.creatives.text;
    out[`${c.channelId}.metric`] = c.metric.why;
    c.checklist.forEach((t, i) => {
      out[`${c.channelId}.checklist.${i}`] = t;
    });
  }
  return out;
}

/** Pure: writes reworded texts back by key (unknown keys and non-strings ignored). */
export function applyKitTexts(kit: LaunchKit, texts: Record<string, string>): LaunchKit {
  const get = (k: string, fallback: string) => {
    const v = texts[k];
    return typeof v === "string" && v.trim() ? v.trim() : fallback;
  };
  return {
    ...kit,
    channels: kit.channels.map((c) => ({
      ...c,
      headline: get(`${c.channelId}.headline`, c.headline),
      targeting: { ...c.targeting, text: get(`${c.channelId}.targeting`, c.targeting.text) },
      schedule: { ...c.schedule, text: get(`${c.channelId}.schedule`, c.schedule.text) },
      creatives: { ...c.creatives, text: get(`${c.channelId}.creatives`, c.creatives.text) },
      metric: { ...c.metric, why: get(`${c.channelId}.metric`, c.metric.why) },
      checklist: c.checklist.map((t, i) => get(`${c.channelId}.checklist.${i}`, t)),
    })),
  };
}

/** The kit's structured (non-text) fields: evidence for its own wording. */
export function kitEvidence(kit: LaunchKit): unknown {
  return kit.channels.map((c) => ({
    budget: c.budget,
    percent: c.percent,
    spec: c.targeting.spec,
    schedule: { startHour: c.schedule.startHour, endHour: c.schedule.endHour, pushWeeks: c.schedule.pushWeeks },
    creatives: { count: c.creatives.count, aspect: c.creatives.aspect, seconds: c.creatives.seconds },
    keywords: c.keywords,
  }));
}

export interface KitGuardResult {
  kit: LaunchKit;
  checked: number;
  removed: string[];
}

/**
 * Grounding guard for reworded kit text: any field whose rewrite carries a
 * number not in the evidence falls back to the deterministic line (which is
 * grounded by construction), and the removed numbers are reported.
 */
export function guardKitTexts(
  base: LaunchKit,
  reworded: Record<string, string>,
  evidence: readonly number[],
  guard: (text: string, ev: readonly number[]) => { removed: string[]; checked: number }
): KitGuardResult {
  const baseTexts = kitTexts(base);
  const safe: Record<string, string> = {};
  const removed: string[] = [];
  let checked = 0;
  for (const [k, v] of Object.entries(reworded)) {
    if (!(k in baseTexts)) continue;
    const r = guard(v, evidence);
    checked += r.checked;
    if (r.removed.length) {
      removed.push(...r.removed);
      safe[k] = baseTexts[k];
    } else {
      safe[k] = v;
    }
  }
  return { kit: applyKitTexts(base, safe), checked, removed };
}
