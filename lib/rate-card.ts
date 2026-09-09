import type { ChannelId, RateCard, RateCardEntry } from "./types";

export type { RateCard, RateCardEntry };

/** India 2026 planning ESTIMATES — not live auction prices. */
export const DEFAULT_RATE_CARD: RateCard = {
  version: "2026.1-in",
  region: "India",
  year: 2026,
  currency: "INR",
  disclaimer:
    "CPM / CPC / CTR are planning ESTIMATES for India 2026, not live bids.",
  channels: [
    { id: "google_search", name: "Google Search", cpm: 180, cpc: 12, ctr: 0.04 },
    { id: "google_display", name: "Google Display", cpm: 40, cpc: 4, ctr: 0.005 },
    { id: "youtube", name: "YouTube", cpm: 70, cpc: 6, ctr: 0.012 },
    { id: "instagram_reels", name: "Instagram Reels", cpm: 90, cpc: 8, ctr: 0.015 },
    { id: "instagram_feed", name: "Instagram Feed", cpm: 80, cpc: 9, ctr: 0.008 },
    { id: "facebook", name: "Facebook", cpm: 60, cpc: 7, ctr: 0.007 },
    { id: "whatsapp", name: "WhatsApp", cpm: 20, cpc: 3, ctr: 0.03 },
    { id: "sharechat", name: "ShareChat", cpm: 35, cpc: 3, ctr: 0.01 },
    { id: "linkedin", name: "LinkedIn", cpm: 250, cpc: 40, ctr: 0.006 },
    { id: "telegram", name: "Telegram", cpm: 25, cpc: 3, ctr: 0.02 },
    { id: "reddit", name: "Reddit", cpm: 80, cpc: 15, ctr: 0.008 },
    { id: "x", name: "X", cpm: 70, cpc: 10, ctr: 0.007 },
  ],
};

export function cloneRateCard(card: RateCard = DEFAULT_RATE_CARD): RateCard {
  return {
    ...card,
    channels: card.channels.map((c) => ({ ...c })),
  };
}

export function getEntry(
  card: RateCard,
  id: ChannelId
): RateCardEntry {
  const found = card.channels.find((c) => c.id === id);
  if (!found) {
    throw new Error(`Unknown channel ${id}`);
  }
  return found;
}

export function validateRateCard(data: unknown): RateCard {
  if (!data || typeof data !== "object") {
    throw new Error("Rate card must be an object");
  }
  const raw = data as Partial<RateCard>;
  if (!Array.isArray(raw.channels) || raw.channels.length === 0) {
    throw new Error("Rate card needs a channels array");
  }
  const channels: RateCardEntry[] = raw.channels.map((ch, i) => {
    if (!ch || typeof ch !== "object") {
      throw new Error(`Channel ${i} is invalid`);
    }
    const id = String(ch.id) as ChannelId;
    const cpm = Number(ch.cpm);
    const cpc = Number(ch.cpc);
    const ctr = Number(ch.ctr);
    if (!id) throw new Error(`Channel ${i} missing id`);
    if (!Number.isFinite(cpm) || cpm <= 0) {
      throw new Error(`${id} CPM must be a positive number`);
    }
    if (!Number.isFinite(cpc) || cpc <= 0) {
      throw new Error(`${id} CPC must be a positive number`);
    }
    if (!Number.isFinite(ctr) || ctr <= 0 || ctr >= 1) {
      throw new Error(`${id} CTR must be between 0 and 1`);
    }
    return {
      id,
      name: String(ch.name || id),
      cpm,
      cpc,
      ctr,
    };
  });
  return {
    version: String(raw.version || "custom"),
    region: String(raw.region || "India"),
    year: Number(raw.year) || 2026,
    currency: "INR",
    disclaimer:
      String(raw.disclaimer || DEFAULT_RATE_CARD.disclaimer),
    channels,
  };
}
