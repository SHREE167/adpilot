import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { cacheClearMemory } from "@/lib/enrich/cache";
import {
  adAccountPath,
  buildTargetingSpec,
  fetchAudience,
  interestSeeds,
  META_SOURCE,
  parseAgeRange,
  pickCity,
  pickInterests,
  readBounds,
  toAudienceEstimate,
} from "@/lib/enrich/meta-reach";
import { runSource } from "@/lib/enrich/signal";
import { capMetaReach } from "@/lib/forecast";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import type { ChannelAllocation, ChannelId } from "@/lib/types";

const KEYS = ["META_ACCESS_TOKEN", "META_AD_ACCOUNT_ID", "META_API_VERSION"] as const;

function setKeys() {
  process.env.META_ACCESS_TOKEN = "secret-token";
  process.env.META_AD_ACCOUNT_ID = "123456";
  process.env.META_API_VERSION = "v26.0";
}

afterEach(() => {
  cacheClearMemory();
  delete process.env.ADPILOT_MOCK_APIS;
  for (const k of KEYS) delete process.env[k];
});

const GEO = { data: [{ key: "1035921", name: "Chennai", type: "city", region: "Tamil Nadu", country_code: "IN" }] };
const SNACK = { data: [{ id: "6003", name: "Snack food", path: ["Food and drink"] }] };
const STREET = { data: [{ id: "6004", name: "Street food" }] };
const REACH = { data: { users_lower_bound: 1100000, users_upper_bound: 1300000, estimate_ready: true } };

describe("targeting inputs", () => {
  it("parses age ranges into Meta's 13-65", () => {
    assert.deepEqual(parseAgeRange("18-24"), { min: 18, max: 24 });
    assert.deepEqual(parseAgeRange("25 to 45"), { min: 25, max: 45 });
    assert.deepEqual(parseAgeRange("21+"), { min: 21, max: 65 });
    assert.deepEqual(parseAgeRange("8-70"), { min: 13, max: 65 });
    assert.deepEqual(parseAgeRange(""), { min: 18, max: 65 });
  });

  it("interest seeds come from what is sold (max 3)", () => {
    assert.deepEqual(interestSeeds(SNACK_CHENNAI, "food"), ["Snack food", "Street food"]);
    assert.ok(interestSeeds({ ...SNACK_CHENNAI, product_name: "Glow", audience_notes: "" }, "food").includes("Food"));
    assert.ok(interestSeeds(SNACK_CHENNAI, "food").length <= 3);
  });

  it("adds act_ to the account id once", () => {
    assert.equal(adAccountPath("123"), "act_123");
    assert.equal(adAccountPath("act_123"), "act_123");
  });
});

describe("buildTargetingSpec", () => {
  const interests = [{ id: "6003", name: "Snack food" }];

  it("city key + age + interests + FB/IG placements", () => {
    const { spec, interestsNote } = buildTargetingSpec("1035921", { min: 18, max: 24 }, interests);
    assert.deepEqual(spec, {
      geo_locations: { cities: [{ key: "1035921" }] },
      age_min: 18,
      age_max: 24,
      flexible_spec: [{ interests }],
      publisher_platforms: ["facebook", "instagram"],
    });
    assert.equal(interestsNote, undefined);
  });

  it("under-18 audiences: no interests, with the reason", () => {
    const { spec, interestsNote } = buildTargetingSpec("1", { min: 15, max: 19 }, interests);
    assert.equal(spec.flexible_spec, undefined);
    assert.match(interestsNote || "", /under-18/);
  });
});

describe("parsers", () => {
  it("pickCity / pickInterests keep ids, dedupe, skip empties", () => {
    assert.deepEqual(pickCity(GEO), { key: "1035921", name: "Chennai", region: "Tamil Nadu" });
    assert.equal(pickCity({ data: [] }), null);
    assert.deepEqual(pickInterests([SNACK, { data: [] }, STREET, SNACK]), [
      { id: "6003", name: "Snack food" },
      { id: "6004", name: "Street food" },
    ]);
  });

  it("readBounds: object or array data, MAU names, -1 = no estimate", () => {
    assert.deepEqual(readBounds(REACH), { lower: 1100000, upper: 1300000 });
    assert.deepEqual(readBounds({ data: [{ users_lower_bound: 5, users_upper_bound: 9 }] }), { lower: 5, upper: 9 });
    assert.deepEqual(readBounds({ data: { estimate_mau_lower_bound: 7, estimate_mau_upper_bound: 8 } }), { lower: 7, upper: 8 });
    assert.equal(readBounds({ data: { users_lower_bound: -1, users_upper_bound: -1 } }), null);
    assert.equal(readBounds({}), null);
  });

  it("toAudienceEstimate: real-looking payloads → bounds + exact spec", () => {
    const a = toAudienceEstimate({ geo: GEO, interests: [SNACK, STREET], reach: REACH }, SNACK_CHENNAI, "v26.0");
    assert.equal(a.lower, 1100000);
    assert.equal(a.upper, 1300000);
    assert.equal(a.city.name, "Chennai");
    assert.equal(a.interests.length, 2);
    assert.deepEqual(a.targetingSpec.geo_locations, { cities: [{ key: "1035921" }] });
  });

  it("no city or no estimate → a readable error (signal becomes status error)", () => {
    assert.throws(() => toAudienceEstimate({ geo: { data: [] }, interests: [], reach: REACH }, SNACK_CHENNAI, "v26.0"), /no city match/);
    assert.throws(() => toAudienceEstimate({ geo: GEO, interests: [], reach: null }, SNACK_CHENNAI, "v26.0"), /no reach estimate/);
  });
});

describe("fetchAudience signal", () => {
  it("missing any of the three env vars → skipped, no fetch", async () => {
    process.env.META_ACCESS_TOKEN = "t";
    let called = false;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("no");
    }) as typeof fetch;
    try {
      const s = await fetchAudience(SNACK_CHENNAI, { category: "food" });
      assert.equal(s.status, "skipped");
      assert.match(s.reason || "", /META_AD_ACCOUNT_ID/);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("slow fetcher → timeout", async () => {
    setKeys();
    const s = await runSource(META_SOURCE, () => new Promise((r) => setTimeout(r, 200)), { timeoutMs: 30 });
    assert.equal(s.status, "timeout");
  });

  it("mock mode reads the fixture (no keys, no network), badged mock", async () => {
    process.env.ADPILOT_MOCK_APIS = "1";
    const s = await fetchAudience(SNACK_CHENNAI, { category: "food" });
    assert.equal(s.status, "ok");
    assert.equal(s.mock, true);
    assert.ok(s.data && s.data.upper >= s.data.lower);
  });

  it("lights up with keys: geo + interests + reachestimate, token in a header only, cached", async () => {
    setKeys();
    const urls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      urls.push(u);
      assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer secret-token");
      const body = u.includes("adgeolocation") ? GEO : u.includes("adinterest") ? (u.includes("Street") ? STREET : SNACK) : REACH;
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    try {
      const a = await fetchAudience(SNACK_CHENNAI, { category: "food" });
      const b = await fetchAudience(SNACK_CHENNAI, { category: "food" });
      assert.equal(a.status, "ok");
      assert.equal(a.data?.upper, 1300000);
      assert.equal(b.cached, true);
      assert.equal(urls.length, 4, "geo + 2 interests + reach, then cache");
      assert.ok(urls.every((u) => !u.includes("secret-token")));
      const reach = urls.find((u) => u.includes("reachestimate"))!;
      assert.ok(reach.includes("/v26.0/act_123456/reachestimate?targeting_spec="));
    } finally {
      globalThis.fetch = orig;
    }
  });
});

describe("capMetaReach (signal adjust)", () => {
  function row(channelId: ChannelId, reach: number): ChannelAllocation {
    return {
      channelId,
      name: channelId,
      score: 60,
      budget: 1000,
      percent: 25,
      explanation: "",
      forecast: { impressions: reach * 3, clicks: 10, ctr: 0.01, cpm: 100, cpc: 5, reach, conversions: 1, cpa: 1000, note: "ESTIMATE" },
    };
  }
  const mix = [row("facebook", 60000), row("instagram_reels", 40000), row("google_search", 30000)];

  it("off (no pool) returns the same rows: output equals v1", () => {
    assert.equal(capMetaReach(mix, undefined), mix);
  });

  it("pool above forecast: reach numbers unchanged, only the band narrows (F14)", () => {
    const out = capMetaReach(mix, 1_000_000);
    assert.deepEqual(
      out.map((r) => r.forecast.reach),
      mix.map((r) => r.forecast.reach)
    );
    assert.ok(out.every((r) => !r.forecast.reachCapped));
    assert.equal(out[0].forecast.ranges?.reachBand?.label, "backed by Meta pool");
    assert.deepEqual(out[2], mix[2], "non-Meta rows untouched");
  });

  it("pool below forecast: FB + IG scaled to the pool, others untouched", () => {
    const out = capMetaReach(mix, 50000);
    const meta = out.filter((r) => r.channelId !== "google_search");
    assert.ok(meta.reduce((s, r) => s + r.forecast.reach, 0) <= 50000);
    assert.ok(meta.every((r) => r.forecast.reachCapped));
    assert.equal(out[0].forecast.reach, 30000);
    assert.deepEqual(out[2], mix[2]);
    assert.equal(out.reduce((s, r) => s + r.budget, 0), 3000, "budget untouched");
  });
});
