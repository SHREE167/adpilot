// F7 grounding guard: every number in generated text must trace to the plan's
// structured data or an enrichment signal. Pure and client-safe; unit-tested.

/** Devanagari + Tamil digits → ASCII, so "५००" and "௫" are checked too. */
const DIGIT_BLOCKS = [0x0966, 0x0be6, 0x09e6, 0x0c66, 0x0ce6, 0x0d66, 0x0ae6, 0x0a66];

export function asciiDigits(text: string): string {
  return text.replace(/[०-९௦-௯০-৯౦-౯೦-೯൦-൯૦-૯੦-੯]/g, (ch) => {
    const code = ch.charCodeAt(0);
    const base = DIGIT_BLOCKS.find((b) => code >= b && code <= b + 9)!;
    return String(code - base);
  });
}

const MULT: Record<string, number> = {
  k: 1e3,
  K: 1e3,
  m: 1e6,
  M: 1e6,
  mn: 1e6,
  l: 1e5,
  L: 1e5,
  lac: 1e5,
  lakh: 1e5,
  lakhs: 1e5,
  cr: 1e7,
  Cr: 1e7,
  crore: 1e7,
  crores: 1e7,
};

export interface NumberToken {
  /** Exact text that would be removed, e.g. "₹1,800", "1.2M", "25%", "6pm". */
  raw: string;
  index: number;
  /** Numeric value in base units (rupees, people, hours 0-23, percent points). */
  value: number;
  /** Half a unit of the last shown digit, in base units. */
  tolerance: number;
  kind: "plain" | "percent" | "time";
}

// currency? mantissa (Indian or western grouping, or hh:mm) suffix? meridiem?
const TOKEN =
  /(?<![\p{L}\d.])(₹\s?|rs\.?\s?|inr\s?)?(\d{1,2}:\d{2}|\d{1,3}(?:,\d{2,3})+(?:\.\d+)?|\d+(?:\.\d+)?)(?:\s?(lakhs?|lac|crores?|cr|mn|k|m|l)(?![\p{L}]))?(\s?%)?(?:\s?(am|pm|a\.m\.|p\.m\.))?(?:x|×|secs?|s|st|nd|rd|th)?(?![\p{L}\d]|[.,]\d)/giu;

const RANGE_TAIL = /^\s?(?:-|–|—|to)\s?\d{1,2}(?::\d{2})?\s?(am|pm)/i;

function to24(hour: number, meridiem: string): number {
  const pm = /^p/i.test(meridiem);
  const h = hour % 12;
  return pm ? h + 12 : h;
}

/** Pure: every number in text with its value and display tolerance. */
export function extractNumbers(text: string): NumberToken[] {
  const src = asciiDigits(text || "");
  const out: NumberToken[] = [];
  for (const m of src.matchAll(TOKEN)) {
    const [raw, , mantissa, suffix, pct, meridiem] = m;
    const index = m.index ?? 0;
    if (mantissa.includes(":")) {
      const [h] = mantissa.split(":").map(Number);
      const hour = meridiem ? to24(h, meridiem) : h;
      out.push({ raw, index, value: hour, tolerance: 0.5, kind: "time" });
      continue;
    }
    const digits = mantissa.replace(/,/g, "");
    const decimals = digits.includes(".") ? digits.split(".")[1].length : 0;
    const base = Number(digits);
    if (!Number.isFinite(base)) continue;
    const tail = src.slice(index + raw.length);
    const inherited = !meridiem && !suffix && !pct && base <= 12 ? RANGE_TAIL.exec(tail)?.[1] : undefined;
    const mer = meridiem || inherited;
    if (mer && base <= 12 && !suffix && !pct) {
      out.push({ raw, index, value: to24(base, mer), tolerance: 0.5, kind: "time" });
      continue;
    }
    const mult = suffix ? (MULT[suffix] ?? MULT[suffix.toLowerCase()] ?? 1) : 1;
    out.push({
      raw,
      index,
      value: base * mult,
      tolerance: 0.5 * 10 ** -decimals * mult,
      kind: pct ? "percent" : "plain",
    });
  }
  return out;
}

/** Keys whose values are generated or volatile text/timings: never evidence. */
const NOT_EVIDENCE = new Set([
  "adAngles",
  "outreach",
  "explanation",
  "product",
  "trace",
  "agentMs",
  "ms",
  "id",
  "createdAt",
  "fetchedAt",
  "startedAt",
  "launchKit",
  "disclaimer",
  "llmProvider",
]);

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Pure: the set of numbers generated text may use. Walks numbers and strings in
 * the given sources, skipping NOT_EVIDENCE keys. ISO dates contribute year,
 * month and day, so "14 Jan" traces to "2027-01-14".
 */
export function groundingSet(...sources: unknown[]): number[] {
  const seen = new Set<number>();
  const visit = (v: unknown, depth: number) => {
    if (depth > 12 || v === null || v === undefined) return;
    if (typeof v === "number") {
      if (Number.isFinite(v)) seen.add(v);
      return;
    }
    if (typeof v === "string") {
      const d = ISO_DATE.exec(v);
      if (d) {
        seen.add(Number(d[1]));
        seen.add(Number(d[2]));
        seen.add(Number(d[3]));
        return;
      }
      for (const t of extractNumbers(v)) seen.add(t.value);
      return;
    }
    if (Array.isArray(v)) {
      for (const x of v) visit(x, depth + 1);
      return;
    }
    if (typeof v === "object") {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        if (!NOT_EVIDENCE.has(k)) visit(x, depth + 1);
      }
    }
  };
  for (const s of sources) visit(s, 0);
  return [...seen];
}

/** A token is grounded when some evidence value matches it at the shown precision. */
export function isGrounded(token: NumberToken, evidence: readonly number[]): boolean {
  const tol = token.tolerance + 1e-9;
  for (const a of evidence) {
    if (Math.abs(token.value - a) <= tol) return true;
    // Fractions shown as percent (CTR 0.012 → "1.2%").
    if (token.kind === "percent" && Math.abs(token.value - a * 100) <= tol) return true;
  }
  return false;
}

export interface GuardResult {
  text: string;
  /** Raw tokens removed, in order. */
  removed: string[];
  /** Number tokens checked. */
  checked: number;
}

/** Pure: drops every ungrounded number token from text and tidies the spacing. */
export function guardText(text: string, evidence: readonly number[]): GuardResult {
  const src = asciiDigits(text || "");
  const tokens = extractNumbers(src);
  const bad = tokens.filter((t) => !isGrounded(t, evidence));
  if (!bad.length) return { text: text || "", removed: [], checked: tokens.length };
  let out = "";
  let at = 0;
  for (const t of bad) {
    out += src.slice(at, t.index);
    at = t.index + t.raw.length;
  }
  out += src.slice(at);
  out = out
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\s+([,.;:!?)])/g, "$1")
    .replace(/\(\s*\)/g, "")
    .trim();
  return { text: out, removed: bad.map((t) => t.raw.trim()), checked: tokens.length };
}

/** Share of number tokens across texts that trace to evidence (1 when there are none). */
export function groundingRate(texts: readonly string[], evidence: readonly number[]): { grounded: number; total: number; rate: number } {
  let grounded = 0;
  let total = 0;
  for (const t of texts) {
    for (const tok of extractNumbers(t)) {
      total++;
      if (isGrounded(tok, evidence)) grounded++;
    }
  }
  return { grounded, total, rate: total ? grounded / total : 1 };
}
