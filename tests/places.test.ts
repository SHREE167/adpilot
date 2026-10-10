import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { cacheClearMemory } from "@/lib/enrich/cache";
import {
  COMPETITOR_MASK,
  fetchLocalMarket,
  isSameBusiness,
  marketQuery,
  OWN_MASK,
  toLocalMarket,
  type PlacesResponse,
} from "@/lib/enrich/places";
import { runSource } from "@/lib/enrich/signal";
import { B2B_SAAS, SNACK_CHENNAI } from "@/lib/fixtures";

const rawFile = (name: string) =>
  JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "api-raw", name), "utf8")) as PlacesResponse;

const FOOD = { category: "food", recognizedName: SNACK_CHENNAI.product_name };

afterEach(() => {
  cacheClearMemory();
  delete process.env.ADPILOT_MOCK_APIS;
  delete process.env.GOOGLE_PLACES_API_KEY;
});

describe("marketQuery", () => {
  it("snack brief → 'snack shop in Chennai' + own-name search", () => {
    const q = marketQuery(SNACK_CHENNAI, FOOD)!;
    assert.equal(q.competitorQuery, "snack shop in Chennai");
    assert.equal(q.ownQuery, "Campus Crunch Chennai");
    assert.equal(q.brand, "Campus Crunch");
  });

  it("B2B / SaaS / online-only briefs make no Places call", () => {
    assert.equal(marketQuery(B2B_SAAS, { category: "saas", recognizedName: "Pipeboard" }), null);
    assert.equal(marketQuery({ ...SNACK_CHENNAI, goal: "b2b" }, FOOD), null);
    assert.equal(marketQuery(SNACK_CHENNAI, { category: "ecommerce", recognizedName: "" }), null);
    assert.equal(marketQuery({ ...SNACK_CHENNAI, product_name: "Thing", city: "Pune" }, { category: "general", recognizedName: "" }), null);
  });

  it("category fallback when the product has no hint", () => {
    const q = marketQuery({ ...SNACK_CHENNAI, product_name: "Asha Designs" }, { category: "fashion", recognizedName: "" })!;
    assert.equal(q.competitorQuery, "clothing store in Chennai");
  });
});

describe("field masks", () => {
  it("request only the fields the card shows", () => {
    assert.equal(COMPETITOR_MASK, "places.displayName,places.rating,places.userRatingCount,nextPageToken");
    assert.equal(OWN_MASK, "places.displayName,places.googleMapsUri");
  });
});

describe("toLocalMarket", () => {
  it("parses the recorded real responses (unlisted business)", () => {
    const comp = rawFile("places-competitors.json");
    const own = rawFile("places-own.json");
    const m = toLocalMarket(comp, own, marketQuery(SNACK_CHENNAI, FOOD)!);
    assert.equal(m.count, (comp.places || []).length);
    assert.equal(m.more, Boolean(comp.nextPageToken));
    assert.ok(m.avgRating === null || (m.avgRating >= 1 && m.avgRating <= 5));
    assert.ok(m.top.length <= 5);
    assert.equal(m.own.found, false, "'We Crunch' etc. must not count as Campus Crunch");
    const kept = new Set(m.top.flatMap((p) => Object.keys(p)));
    assert.ok([...kept].every((k) => ["name", "rating", "reviews"].includes(k)), "no extra place fields stored");
  });

  it("averages rated places only, ranks 10+ review places first, finds own listing", () => {
    const q = marketQuery(SNACK_CHENNAI, FOOD)!;
    const m = toLocalMarket(
      {
        places: [
          { displayName: { text: "Tiny New Shop" }, rating: 5, userRatingCount: 2 },
          { displayName: { text: "Big Snacks" }, rating: 4.2, userRatingCount: 900 },
          { displayName: { text: "Unrated Stall" } },
          { displayName: { text: "Campus Crunch Anna Nagar" }, rating: 4.0, userRatingCount: 12 },
        ],
        nextPageToken: "x",
      },
      { places: [{ displayName: { text: "Campus Crunch Anna Nagar" }, googleMapsUri: "https://maps.google.com/?cid=1" }] },
      q
    );
    assert.equal(m.count, 3, "own business is not its own competitor");
    assert.equal(m.more, true);
    assert.equal(m.ratedCount, 2);
    assert.equal(m.avgRating, 4.6);
    assert.equal(m.top[0].name, "Big Snacks");
    assert.equal(m.own.found, true);
    assert.equal(m.own.mapsUri, "https://maps.google.com/?cid=1");
  });

  it("empty response → zero, never invented", () => {
    const m = toLocalMarket({}, {}, marketQuery(SNACK_CHENNAI, FOOD)!);
    assert.equal(m.count, 0);
    assert.equal(m.avgRating, null);
    assert.deepEqual(m.top, []);
    assert.equal(m.own.found, false);
  });

  it("name match needs every brand word", () => {
    assert.equal(isSameBusiness("CAMPUS CRUNCH – Velachery", "Campus Crunch"), true);
    assert.equal(isSameBusiness("We Crunch", "Campus Crunch"), false);
  });
});

describe("fetchLocalMarket", () => {
  it("skips without a key and never calls out", async () => {
    const s = await fetchLocalMarket(SNACK_CHENNAI, FOOD);
    assert.equal(s.status, "skipped");
    assert.match(s.reason || "", /no API key \(GOOGLE_PLACES_API_KEY\)/);
  });

  it("skips non-local businesses even with a key", async () => {
    process.env.GOOGLE_PLACES_API_KEY = "test-key";
    const s = await fetchLocalMarket(B2B_SAAS, { category: "saas", recognizedName: "Pipeboard" });
    assert.equal(s.status, "skipped");
    assert.equal(s.reason, "not a local-storefront business");
  });

  it("a slow Places call becomes status timeout", async () => {
    const s = await runSource(
      "google_places",
      (signal) =>
        new Promise((_, reject) => signal.addEventListener("abort", () => reject(new Error("aborted")))),
      { timeoutMs: 30 }
    );
    assert.equal(s.status, "timeout");
  });

  it("mock mode reads fixtures/api/google_places/chennai.json", async () => {
    process.env.ADPILOT_MOCK_APIS = "1";
    const s = await fetchLocalMarket(SNACK_CHENNAI, FOOD);
    assert.equal(s.status, "ok");
    assert.equal(s.mock, true);
    assert.equal(s.data?.query, "snack shop in Chennai");
    assert.equal(s.data?.own.found, false);
  });
});
