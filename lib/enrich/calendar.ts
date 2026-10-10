import cityStateJson from "@/data/city-state.json";
import festivalsJson from "@/data/festivals-in.json";
import type { FestivalHit, PlanInput, SeasonWindow, Signal } from "@/lib/types";

export const CALENDAR_SOURCE = "festival_calendar";

export interface FestivalEntry {
  name: string;
  date: string;
  /** State codes (IN-TN, ...) or "ALL". */
  states: string[];
  /** ML categories, or "*" for every category. */
  categories: string[];
  cpmMultiplier: number;
  /** Days before `date` when auction pressure starts (default 3). */
  leadDays?: number;
  /** Extra festival days after `date` (default 0). */
  lastDays?: number;
  advice: string;
  verified: boolean;
}

export interface CityStateMap {
  states: Record<string, string>;
  cities: Record<string, string>;
}

const DAY = 86400000;
const IST_OFFSET = 5.5 * 3600000;
const WEEKS = 4;
const UPCOMING_DAYS = 60;

/** Day number of the plan start in IST (so "today" matches an Indian calendar). */
function istDay(d: Date): number {
  return Math.floor((d.getTime() + IST_OFFSET) / DAY);
}

function isoDay(day: number): string {
  return new Date(day * DAY).toISOString().slice(0, 10);
}

function dayOf(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY);
}

export function normalizeCity(city: string): string {
  return city
    .toLowerCase()
    .split(",")[0]
    .replace(/[^a-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stateForCity(city: string, map: CityStateMap): string | null {
  const key = normalizeCity(city);
  if (!key) return null;
  if (map.cities[key]) return map.cities[key];
  const first = key.split(" ")[0];
  return map.cities[first] ?? null;
}

/**
 * Pure: festivals overlapping each of the plan's 4 weeks for the city's state
 * (plus national ones), and what is coming in the next 60 days.
 */
export function buildSeasonWindow(opts: {
  city: string;
  category: string;
  start: Date;
  festivals: FestivalEntry[];
  cityState: CityStateMap;
}): SeasonWindow {
  const state = stateForCity(opts.city, opts.cityState);
  const s = istDay(opts.start);
  const windowEnd = s + WEEKS * 7 - 1;
  const horizon = s + UPCOMING_DAYS;

  const weekMultipliers: number[] = Array(WEEKS).fill(1);
  const weekNames: string[][] = Array.from({ length: WEEKS }, () => []);
  const inWindow: FestivalHit[] = [];
  const upcoming: FestivalHit[] = [];

  for (const f of opts.festivals) {
    const applies = f.states.includes("ALL") || (state !== null && f.states.includes(state));
    if (!applies) continue;
    const main = dayOf(f.date);
    const from = main - (f.leadDays ?? 3);
    const to = main + (f.lastDays ?? 0);
    if (to < s || from > horizon) continue;

    const weeks: number[] = [];
    for (let w = 0; w < WEEKS; w++) {
      const ws = s + w * 7;
      const we = ws + 6;
      if (from <= we && to >= ws) {
        weeks.push(w + 1);
        weekMultipliers[w] = Math.max(weekMultipliers[w], f.cpmMultiplier);
        weekNames[w].push(f.name);
      }
    }

    const hit: FestivalHit = {
      name: f.name,
      date: f.date,
      daysAway: main - s,
      states: f.states,
      cpmMultiplier: f.cpmMultiplier,
      advice: f.advice,
      verified: f.verified,
      relevant: f.categories.includes("*") || f.categories.includes(opts.category),
      weeks,
    };
    if (weeks.length) inWindow.push(hit);
    else if (main > windowEnd) upcoming.push(hit);
  }

  const byDate = (a: FestivalHit, b: FestivalHit) => a.date.localeCompare(b.date);
  return {
    state,
    stateName: state ? opts.cityState.states[state] ?? state : null,
    windowStart: isoDay(s),
    windowEnd: isoDay(windowEnd),
    inWindow: inWindow.sort(byDate),
    upcoming: upcoming.sort(byDate),
    weekMultipliers,
    weekFestivals: weekNames.map((n) => (n.length ? n.join(" + ") : null)),
  };
}

/** Step 3 source: static JSON, so it is always fast and offline. Badged ESTIMATE, never LIVE. */
export function buildCalendar(
  input: PlanInput,
  category: string,
  now: Date = new Date()
): Signal<SeasonWindow> {
  const t0 = Date.now();
  const data = buildSeasonWindow({
    city: input.city,
    category,
    start: now,
    festivals: (festivalsJson as { festivals: FestivalEntry[] }).festivals,
    cityState: cityStateJson as CityStateMap,
  });
  return {
    source: CALENDAR_SOURCE,
    status: "ok",
    fetchedAt: now.toISOString(),
    ms: Date.now() - t0,
    cached: false,
    data,
    ...(data.state ? {} : { reason: "city not mapped to a state; national festivals only" }),
  };
}
