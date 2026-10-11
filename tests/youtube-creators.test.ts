import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { costBand } from "@/lib/creator-rates";
import { cacheClearMemory } from "@/lib/enrich/cache";
import { runSource } from "@/lib/enrich/signal";
import {
  creatorQuery,
  fetchCreators,
  toCreatorFinder,
  YOUTUBE_SOURCE,
  type CreatorQuery,
  type YtChannelsResponse,
  type YtSearchResponse,
} from "@/lib/enrich/youtube-creators";
import { B2B_SAAS, SNACK_CHENNAI } from "@/lib/fixtures";

const raw = <T>(name: string) =>
  (JSON.parse(readFileSync(path.join(process.cwd(), "fixtures", "api-raw", name), "utf8")) as { response: T }).response;

const Q: CreatorQuery = { q: "food Chennai", topic: "food", language: "ta", city: "Chennai" };

function channel(id: string, title: string, subs: number | null, extra: Record<string, unknown> = {}) {
  return {
    id,
    snippet: { title, description: "", ...extra },
    statistics:
      subs === null
        ? { hiddenSubscriberCount: true, videoCount: "10" }
        : { subscriberCount: String(subs), videoCount: "120", viewCount: "900000" },
  };
}

afterEach(() => {
  cacheClearMemory();
  delete process.env.ADPILOT_MOCK_APIS;
  delete process.env.ADPILOT_FIXTURE_DIR;
  delete process.env.YOUTUBE_API_KEY;
});

describe("creatorQuery", () => {
  it("snack brief → 'food Chennai' in Tamil", () => {
    assert.deepEqual(creatorQuery(SNACK_CHENNAI, { category: "food" }), {
      q: "food Chennai",
      topic: "food",
      language: "ta",
      city: "Chennai",
    });
  });

  it("product hint beats category; unknown language falls back to en", () => {
    const q = creatorQuery({ ...B2B_SAAS, product_name: "NEET crash course", language: "Klingon" }, { category: "saas" })!;
    assert.equal(q.q, "NEET Bengaluru");
    assert.equal(q.language, "en");
  });

  it("no city → no query (no quota spent)", () => {
    assert.equal(creatorQuery({ ...SNACK_CHENNAI, city: " " }, { category: "food" }), null);
  });
});

describe("toCreatorFinder", () => {
  it("recorded real response → 5 picks in the 2k-200k band, city matches first", () => {
    const f = toCreatorFinder(raw<YtSearchResponse>("youtube-search.json"), raw<YtChannelsResponse>("youtube-channels.json"), Q);
    assert.equal(f.query, "food Chennai");
    assert.ok(f.found > 0);
    assert.ok(f.picks.length <= 5 && f.picks.length > 0);
    for (const p of f.picks) {
      assert.ok(p.subscribers >= 2000 && p.subscribers <= 200000, `${p.title} ${p.subscribers}`);
      assert.match(p.url, /^https:\/\/www\.youtube\.com\//);
    }
    const fits = f.picks.map((p) => p.fit);
    assert.deepEqual(fits, [...fits].sort((a, b) => b - a));
  });

  it("drops hidden counts and out-of-band channels; never invents one", () => {
    const search: YtSearchResponse = { items: ["a", "b", "c", "d"].map((id) => ({ id: { channelId: id } })) };
    const channels: YtChannelsResponse = {
      items: [
        channel("a", "Tiny", 900),
        channel("b", "Huge", 2_500_000),
        channel("c", "Hidden", null),
        channel("d", "Chennai Eats", 20_000, { customUrl: "@chennaieats" }),
      ],
    };
    const f = toCreatorFinder(search, channels, Q);
    assert.equal(f.found, 4);
    assert.equal(f.inBand, 1);
    assert.equal(f.picks.length, 1);
    assert.equal(f.picks[0].title, "Chennai Eats");
    assert.equal(f.picks[0].url, "https://www.youtube.com/@chennaieats");
    assert.equal(f.picks[0].cityMatch, true);
    assert.ok(f.picks[0].why.some((w) => /Chennai/.test(w)));
  });

  it("city mention + language script outrank a bigger generic channel", () => {
    const search: YtSearchResponse = { items: [{ id: { channelId: "big" } }, { id: { channelId: "local" } }] };
    const channels: YtChannelsResponse = {
      items: [channel("big", "Cooking Daily", 150_000), channel("local", "சென்னை food Chennai", 15_000)],
    };
    const f = toCreatorFinder(search, channels, Q);
    assert.equal(f.picks[0].channelId, "local");
    assert.ok(f.picks[0].why.includes("Posts in the brief's language"));
  });

  it("empty search → empty picks, no throw", () => {
    const f = toCreatorFinder({}, {}, Q);
    assert.deepEqual([f.found, f.inBand, f.picks.length], [0, 0, 0]);
  });
});

describe("costBand (ESTIMATE)", () => {
  it("maps subscribers to nano / micro / mid; outside the band → null", () => {
    assert.equal(costBand(5000)?.id, "nano");
    assert.equal(costBand(10_000)?.id, "micro");
    assert.equal(costBand(200_000)?.id, "mid");
    assert.equal(costBand(1999), null);
    assert.equal(costBand(200_001), null);
  });
});

describe("fetchCreators signal", () => {
  it("no key → skipped, fetch never called", async () => {
    let called = false;
    const orig = globalThis.fetch;
    globalThis.fetch = (async () => {
      called = true;
      throw new Error("should not fetch");
    }) as typeof fetch;
    try {
      const s = await fetchCreators(SNACK_CHENNAI, { category: "food" });
      assert.equal(s.status, "skipped");
      assert.match(s.reason || "", /YOUTUBE_API_KEY/);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = orig;
    }
  });

  it("slow fetcher → timeout", async () => {
    process.env.YOUTUBE_API_KEY = "test";
    const s = await runSource(YOUTUBE_SOURCE, () => new Promise((r) => setTimeout(r, 200)), {
      requiresEnv: ["YOUTUBE_API_KEY"],
      timeoutMs: 30,
    });
    assert.equal(s.status, "timeout");
  });

  it("mock mode reads fixtures/api/youtube/<city>.json, badged mock", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "adpilot-yt-"));
    mkdirSync(path.join(dir, YOUTUBE_SOURCE));
    const data = { query: "food Chennai", topic: "food", language: "ta", found: 1, inBand: 1, picks: [] };
    writeFileSync(path.join(dir, YOUTUBE_SOURCE, "chennai.json"), JSON.stringify({ fetchedAt: "2026-10-11T00:00:00.000Z", data }));
    process.env.ADPILOT_MOCK_APIS = "1";
    process.env.ADPILOT_FIXTURE_DIR = dir;
    const s = await fetchCreators(SNACK_CHENNAI, { category: "food" });
    assert.equal(s.status, "ok");
    assert.equal(s.mock, true);
    assert.deepEqual(s.data, data);
  });

  it("live path: one search + one channels call, key in a header not the URL, then cached", async () => {
    process.env.YOUTUBE_API_KEY = "secret-test-key";
    const urls: string[] = [];
    const orig = globalThis.fetch;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      urls.push(String(url));
      assert.equal((init?.headers as Record<string, string>)["X-Goog-Api-Key"], "secret-test-key");
      const body = String(url).includes("/search")
        ? { items: [{ id: { channelId: "d" } }] }
        : { items: [channel("d", "Chennai Eats", 20_000)] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as typeof fetch;
    try {
      const a = await fetchCreators(SNACK_CHENNAI, { category: "food" });
      const b = await fetchCreators(SNACK_CHENNAI, { category: "food" });
      assert.equal(a.status, "ok");
      assert.equal(a.data?.picks[0].title, "Chennai Eats");
      assert.equal(b.cached, true);
      assert.equal(urls.length, 2, "second plan hits the cache: max one search");
      assert.ok(urls.every((u) => !u.includes("secret-test-key")));
      assert.ok(urls[0].includes("relevanceLanguage=ta") && urls[0].includes("regionCode=IN"));
    } finally {
      globalThis.fetch = orig;
    }
  });
});
