import assert from "node:assert/strict";
import { describe, it } from "node:test";
import cityStateJson from "@/data/city-state.json";
import festivalsJson from "@/data/festivals-in.json";
import {
  buildCalendar,
  buildSeasonWindow,
  stateForCity,
  type CityStateMap,
  type FestivalEntry,
} from "@/lib/enrich/calendar";
import { forecastChannel, rollupForecast, seasonFactor } from "@/lib/forecast";
import { SNACK_CHENNAI } from "@/lib/fixtures";
import { DEFAULT_RATE_CARD } from "@/lib/rate-card";
import type { ChannelAllocation } from "@/lib/types";

const festivals = (festivalsJson as { festivals: FestivalEntry[] }).festivals;
const cityState = cityStateJson as CityStateMap;
// 5 Jan 2027, 09:00 IST: the 4-week window covers Lohri, Pongal, Sankranti.
const JAN = new Date("2027-01-05T03:30:00Z");

function names(city: string, start = JAN) {
  const w = buildSeasonWindow({ city, category: "food", start, festivals, cityState });
  return { w, names: w.inWindow.map((f) => f.name) };
}

describe("festival data", () => {
  it("covers 2026-2027, every entry unverified and well-formed", () => {
    assert.ok(festivals.length >= 30);
    for (const f of festivals) {
      assert.match(f.date, /^202[67]-\d\d-\d\d$/, f.name);
      assert.equal(f.verified, false, f.name);
      assert.ok(f.cpmMultiplier >= 1 && f.cpmMultiplier < 2, f.name);
      for (const s of f.states) assert.ok(s === "ALL" || s in cityState.states, `${f.name}: ${s}`);
    }
  });
});

describe("city -> state", () => {
  it("maps names, aliases and 'City, State' input", () => {
    assert.equal(stateForCity("Chennai", cityState), "IN-TN");
    assert.equal(stateForCity("Bangalore", cityState), "IN-KA");
    assert.equal(stateForCity("New Delhi", cityState), "IN-DL");
    assert.equal(stateForCity("Kolkata, West Bengal", cityState), "IN-WB");
    assert.equal(stateForCity("Atlantis", cityState), null);
  });
});

describe("regional festivals differ by city", () => {
  it("Chennai gets Pongal, not Lohri or Sankranti", () => {
    const { names: n } = names("Chennai");
    assert.ok(n.includes("Pongal"));
    assert.ok(!n.includes("Lohri"));
    assert.ok(!n.includes("Makar Sankranti"));
  });

  it("Bengaluru gets Makar Sankranti, not Pongal", () => {
    const { names: n } = names("Bengaluru");
    assert.ok(n.includes("Makar Sankranti"));
    assert.ok(!n.includes("Pongal"));
  });

  it("Delhi gets Lohri, neither Pongal nor Sankranti", () => {
    const { names: n } = names("Delhi");
    assert.ok(n.includes("Lohri"));
    assert.ok(!n.includes("Pongal"));
    assert.ok(!n.includes("Makar Sankranti"));
  });

  it("unknown city: national festivals only, with a reason", () => {
    const { w, names: n } = names("Atlantis");
    assert.equal(w.state, null);
    assert.ok(n.includes("Republic Day sales"));
    assert.ok(!n.includes("Pongal"));
    const s = buildCalendar({ ...SNACK_CHENNAI, city: "Atlantis" }, "food", JAN);
    assert.equal(s.status, "ok");
    assert.match(s.reason || "", /not mapped/);
  });
});

describe("weekly multipliers", () => {
  it("festival weeks get > 1, quiet weeks stay 1", () => {
    const { w } = names("Chennai");
    assert.equal(w.windowStart, "2027-01-05");
    assert.equal(w.weekMultipliers.length, 4);
    // Week 2 (12-18 Jan) holds Pongal at 1.25.
    assert.equal(w.weekMultipliers[1], 1.25);
    assert.match(w.weekFestivals[1] || "", /Pongal/);
    // Week 4 (26 Jan - 1 Feb) is after the Republic Day sale weekend (24-27 Jan overlaps week 3).
    assert.equal(w.weekMultipliers[3], 1.1);
  });

  it("a quiet window is flat", () => {
    const w = buildSeasonWindow({
      city: "Chennai",
      category: "food",
      start: new Date("2027-06-01T03:30:00Z"),
      festivals,
      cityState,
    }).weekMultipliers;
    assert.deepEqual(w, [1, 1, 1, 1]);
  });

  it("puts later festivals in upcoming, not in the window", () => {
    const { w } = names("Chennai");
    assert.ok(w.upcoming.some((f) => f.name === "Valentine's Day"));
    assert.ok(!w.inWindow.some((f) => f.name === "Valentine's Day"));
  });
});

describe("forecast with season multipliers", () => {
  const entry = DEFAULT_RATE_CARD.channels.find((c) => c.id === "instagram_reels")!;
  const row = (season?: { weekMultipliers: number[] }): ChannelAllocation => ({
    channelId: "instagram_reels",
    name: entry.name,
    score: 80,
    budget: 3000,
    percent: 100,
    forecast: forecastChannel(3000, entry, SNACK_CHENNAI, "low", season),
    explanation: "",
  });

  it("flat season is identical to v1 (no season)", () => {
    const flat = { weekMultipliers: [1, 1, 1, 1] };
    assert.equal(seasonFactor(flat), 1);
    assert.deepEqual(row(flat).forecast, row().forecast);
    assert.deepEqual(
      rollupForecast([row(flat)], SNACK_CHENNAI, "low", flat),
      rollupForecast([row()], SNACK_CHENNAI, "low")
    );
  });

  it("festival week buys fewer impressions for the same spend", () => {
    const season = { weekMultipliers: [1, 1.25, 1, 1], weekFestivals: [null, "Pongal", null, null] };
    const base = rollupForecast([row()], SNACK_CHENNAI, "low");
    const adj = rollupForecast([row(season)], SNACK_CHENNAI, "low", season);
    assert.ok(adj.totals.impressions < base.totals.impressions);
    assert.deepEqual(
      adj.weeklyForecast.map((w) => w.spend),
      base.weeklyForecast.map((w) => w.spend)
    );
    assert.equal(adj.weeklyForecast.reduce((s, w) => s + w.spend, 0), 3000);
    const wk2 = adj.weeklyForecast[1];
    assert.equal(wk2.cpmMultiplier, 1.25);
    assert.equal(wk2.festival, "Pongal");
    assert.ok(wk2.impressions < base.weeklyForecast[1].impressions);
    assert.equal(adj.weeklyForecast[0].cpmMultiplier, undefined);
    const weekSum = adj.weeklyForecast.reduce((s, w) => s + w.impressions, 0);
    assert.ok(Math.abs(weekSum - adj.totals.impressions) <= 4, "weeks add up to the total");
  });
});
