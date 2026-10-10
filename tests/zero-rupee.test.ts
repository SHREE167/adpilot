import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { B2B_SAAS, SNACK_CHENNAI } from "@/lib/fixtures";
import { readinessFromTracking } from "@/lib/enrich/site-readiness";
import type { LocalMarket, Signal, SiteReadiness, TrackingSignals } from "@/lib/types";
import { buildZeroRupee, minAge } from "@/lib/zero-rupee";

const ok = <T>(source: string, data: T): Signal<T> => ({
  source,
  status: "ok",
  fetchedAt: "2026-10-10T10:00:00.000Z",
  ms: 1,
  cached: false,
  data,
});

const market = (found: boolean, count = 20): Signal<LocalMarket> =>
  ok("google_places", {
    query: "snack shop in Chennai",
    keyword: "snack shop",
    count,
    more: count === 20,
    avgRating: 4.5,
    ratedCount: count,
    top: [],
    own: { query: "Campus Crunch Chennai", found },
  });

const tracking = (whatsapp: boolean): TrackingSignals => ({
  https: true,
  viewport: true,
  metaPixel: false,
  ga4: false,
  gtmIds: [],
  whatsapp,
  tel: false,
  cta: true,
  ogImage: false,
});
const readiness = (whatsapp: boolean): Signal<SiteReadiness> =>
  ok("site_readiness", readinessFromTracking(tracking(whatsapp), SNACK_CHENNAI));

const ids = (items: { id: string }[]) => items.map((i) => i.id);
const food = { input: SNACK_CHENNAI, category: "food" };

describe("buildZeroRupee", () => {
  it("unlisted on Maps → Business Profile first, citing the real search", () => {
    const items = buildZeroRupee({ ...food, localMarket: market(false) });
    assert.equal(items[0].id, "gbp");
    assert.match(items[0].why, /"Campus Crunch Chennai"/);
    assert.match(items[0].why, /20\+ "snack shop" businesses in Chennai are listed \(avg rating 4\.5\)/);
    assert.deepEqual(items[0].sources, ["google_places"]);
  });

  it("listed on Maps → no 'create a profile' item", () => {
    const items = buildZeroRupee({ ...food, localMarket: market(true) });
    assert.ok(!ids(items).includes("gbp"));
    assert.ok(ids(items).includes("gbp_reviews"), "dense market: keep winning the listing");
  });

  it("items change with the readiness signal", () => {
    const withWa = buildZeroRupee({ ...food, readiness: readiness(true) });
    const without = buildZeroRupee({ ...food, readiness: readiness(false) });
    const wa = (xs: ReturnType<typeof buildZeroRupee>) => xs.find((i) => i.id === "whatsapp_catalog")!;
    assert.match(wa(withWa).why, /already links to WhatsApp/);
    assert.match(wa(without).why, /no WhatsApp link yet/);
    assert.ok(wa(without).steps.some((s) => /wa\.me/.test(s)));
    assert.deepEqual(wa(withWa).sources, ["site_readiness"]);
  });

  it("store_visits puts Maps first even when already listed", () => {
    const items = buildZeroRupee({
      input: { ...SNACK_CHENNAI, goal: "store_visits" },
      category: "food",
      localMarket: market(true, 6),
    });
    assert.equal(items[0].id, "gbp_reviews");
  });

  it("B2B → founder posts, no WhatsApp catalog / Reels / groups", () => {
    const items = buildZeroRupee({ input: B2B_SAAS, category: "saas" });
    assert.deepEqual(ids(items), ["founder_linkedin"]);
  });

  it("Places off → no Maps items and no invented counts", () => {
    const off: Signal<LocalMarket> = {
      source: "google_places",
      status: "skipped",
      fetchedAt: "2026-10-10T10:00:00.000Z",
      ms: 0,
      cached: false,
      reason: "no API key (GOOGLE_PLACES_API_KEY)",
    };
    const items = buildZeroRupee({ ...food, localMarket: off });
    assert.ok(!ids(items).some((id) => id.startsWith("gbp")));
    assert.ok(items.every((i) => !/\d+\+? "snack shop"/.test(i.why)));
  });

  it("zero-key snack brief: only brief-justified items, capped at 4", () => {
    const items = buildZeroRupee(food);
    assert.deepEqual(ids(items), ["whatsapp_catalog", "organic_reels", "local_groups"]);
    assert.match(items.find((i) => i.id === "local_groups")!.why, /"College"/);
    assert.ok(buildZeroRupee({ ...food, localMarket: market(false) }).length <= 4);
  });

  it("no filler: an older audience and no group hints drops Reels and groups", () => {
    const items = buildZeroRupee({
      input: { ...SNACK_CHENNAI, audience_age: "45-60", audience_notes: "Families", budget: 20000 },
      category: "food",
    });
    assert.deepEqual(ids(items), ["whatsapp_catalog"]);
  });

  it("minAge parses the form's ranges", () => {
    assert.equal(minAge("18-24"), 18);
    assert.equal(minAge("all"), null);
  });
});
