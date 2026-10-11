import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  asciiDigits,
  extractNumbers,
  groundingRate,
  groundingSet,
  guardText,
  isGrounded,
} from "@/lib/grounding-guard";

const values = (s: string) => extractNumbers(s).map((t) => t.value);

describe("extractNumbers", () => {
  it("rupees with Indian and western grouping", () => {
    assert.deepEqual(values("₹1,800 then Rs. 1,00,000 and INR 25000"), [1800, 100000, 25000]);
  });

  it("k / M / lakh / crore suffixes and decimals", () => {
    assert.deepEqual(values("1.2M people, 12k views, 3 lakh, 1.5 Cr"), [1.2e6, 12000, 3e5, 1.5e7]);
    const [t] = extractNumbers("1.2M");
    assert.equal(t.tolerance, 50000);
  });

  it("percent and times (12h → 24h, ranges inherit am/pm, hh:mm)", () => {
    const toks = extractNumbers("CTR 1.2%, post 6–10pm or 9am, at 18:30");
    assert.deepEqual(
      toks.map((t) => [t.kind, t.value]),
      [
        ["percent", 1.2],
        ["time", 18],
        ["time", 22],
        ["time", 9],
        ["time", 18],
      ]
    );
  });

  it("ignores digits glued to words (GA4, M3, GTM-5X)", () => {
    assert.deepEqual(values("Install GA4 and GTM, milestone M3"), []);
  });

  it("reads Devanagari and Tamil digits", () => {
    assert.equal(asciiDigits("₹५००"), "₹500");
    assert.deepEqual(values("₹५०० और ௩ रील"), [500, 3]);
  });
});

describe("groundingSet", () => {
  it("collects numbers and numbers inside strings; ISO dates give y/m/d", () => {
    const set = groundingSet({ budget: 3000, city: "Chennai", hit: { date: "2027-01-14", name: "Class 11-12" } });
    for (const n of [3000, 2027, 1, 14, 11, 12]) assert.ok(set.includes(n), String(n));
  });

  it("never uses generated text, trace timings or ids as evidence", () => {
    const set = groundingSet({
      adAngles: [{ headline: "Save 777 today" }],
      launchKit: { channels: [{ checklist: ["Spend 888"] }] },
      trace: { spans: [{ ms: 999 }] },
      agentMs: 555,
      mix: [{ budget: 1500, explanation: "only 666 left" }],
    });
    assert.deepEqual(set, [1500]);
  });
});

describe("isGrounded", () => {
  const ev = [1812, 1300000, 0.012, 18, 22];

  it("matches at shown precision only", () => {
    const [m] = extractNumbers("1.3M");
    assert.ok(isGrounded(m, ev));
    const [r] = extractNumbers("₹1,800");
    assert.equal(isGrounded(r, ev), false, "₹1,800 is not ₹1,812");
  });

  it("percent matches a fraction (CTR 0.012 → 1.2%)", () => {
    const [p] = extractNumbers("1.2%");
    assert.ok(isGrounded(p, ev));
  });

  it("times match 24h hours", () => {
    assert.ok(extractNumbers("6–10pm").every((t) => isGrounded(t, ev)));
  });
});

describe("guardText", () => {
  const ev = groundingSet({ budget: 1800, hours: [18, 22], count: 3 });

  it("keeps grounded numbers untouched", () => {
    const r = guardText("Spend ₹1,800 on 3 Reels, 6–10pm.", ev);
    assert.equal(r.text, "Spend ₹1,800 on 3 Reels, 6–10pm.");
    assert.deepEqual(r.removed, []);
    assert.equal(r.checked, 4);
  });

  it("removes invented numbers and logs them", () => {
    const r = guardText("Spend ₹1,800 for 40% more sales (2.5x ROAS) in 7 days.", ev);
    assert.deepEqual(r.removed, ["40%", "2.5x", "7"]);
    assert.ok(!/40|2\.5|7/.test(r.text), r.text);
    assert.ok(r.text.includes("₹1,800"));
  });

  it("handles LLM output in Hindi with Devanagari digits", () => {
    const r = guardText("₹१,८०० में ५ रील", ev);
    assert.deepEqual(r.removed, ["5"]);
    assert.ok(r.text.includes("₹1,800"));
  });
});

describe("groundingRate", () => {
  it("counts traceable numbers across texts; no numbers = 100%", () => {
    const ev = [3000, 3];
    assert.deepEqual(groundingRate(["₹3,000 on 3 Reels", "add 5 more"], ev), { grounded: 2, total: 3, rate: 2 / 3 });
    assert.equal(groundingRate(["no numbers here"], ev).rate, 1);
  });
});
