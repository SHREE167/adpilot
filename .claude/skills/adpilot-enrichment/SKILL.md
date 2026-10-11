---
name: adpilot-enrichment
description: How to add or change a data source (enrichment signal) in AdPilot v2. That covers Signal<T>, timeout, cache key + TTL, required env keys, mock fixture, trace span, LIVE/ESTIMATE/Not connected badge, dashboard card and node:test tests. Use this whenever work touches lib/enrich/, EnrichmentBundle, runAgent step 3, fixtures/api/, or adds any external API (PageSpeed, Google Places, Meta reach, YouTube, SerpAPI/Trends, Calendarific) or static dataset to AdPilot, even if the user just says "wire up Places" or "add the YouTube creators feature".
---

# Adding a data source to AdPilot

AdPilot's promise is honesty: a plan **always** returns, zero-key mode works, and every number on screen says where it came from. Every data source therefore follows one pattern, so it can fail, time out, run offline, or lack a key without anyone noticing anything but a muted "Not connected" badge.

Read `CLAUDE.md` first (git rules: local commits on `v2` only, never push). Then follow the steps below in order.

## The moving parts (already built in M1)

| Piece | File | What it gives you |
| --- | --- | --- |
| `Signal<T>` type | `lib/types.ts` | `{source, status: ok/skipped/timeout/error, fetchedAt, ms, cached, mock?, data?, reason?}`. Client-safe. |
| `runSource()` | `lib/enrich/signal.ts` | mock fixture → required env keys → cache hit → fetch with hard timeout → cache. **Never throws.** |
| `fetchJson()` | `lib/enrich/signal.ts` | `fetch` + JSON that throws `HTTP 403`-style reasons. |
| `runEnrichment()` | `lib/enrich/signal.ts` | All sources in parallel via `Promise.allSettled`; a throw becomes `status: "error"`. |
| Cache | `lib/enrich/cache.ts` | `adpilot_cache` (Postgres, TTL) or an in-memory Map. TTLs in `CACHE_TTL`. |
| Mock | `lib/enrich/mock.ts` | `ADPILOT_MOCK_APIS=1` reads `fixtures/api/<source>/<key>.json`, falling back to `default.json`. |
| Trace | `lib/trace.ts` | Every source settles into a child span of `enrich` automatically via `trace.signal()`. |
| Badges | `components/ProvenanceBadge.tsx`, `lib/sources.ts` | LIVE · label · date / MOCK / ESTIMATE / Not connected. |
| Footer | `components/DataSources.tsx` | Lists every signal in `plan.enrichment` with status and ms. Free once it is in the bundle. |

## Step by step

### 1. Types (`lib/types.ts`)
Add the data shape (`PlaceSummary`, `PageSpeedResult`, ...) and an **optional** field on `EnrichmentBundle`, such as `localMarket?: Signal<LocalMarket>`. Fields must stay optional because saved plans in localStorage/Postgres lack them, and the dashboard must render those plans.

### 2. Source module (`lib/enrich/<name>.ts`)
Start it with `import "server-only";`. Keys come from `process.env` only, and this module is never imported by a client component. Shape:

```ts
import "server-only";
import { CACHE_TTL } from "./cache";
import { fetchJson, runSource } from "./signal";
import type { LocalMarket, PlanInput, Signal } from "@/lib/types";

export const PLACES_SOURCE = "google_places";

export function fetchLocalMarket(input: PlanInput, category: string): Promise<Signal<LocalMarket>> {
  const q = `${category} in ${input.city}`;
  return runSource<LocalMarket>(
    PLACES_SOURCE,
    async (signal) => {
      const raw = await fetchJson<PlacesResponse>(URL, signal, {
        method: "POST",
        headers: {
          "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!,
          "X-Goog-FieldMask": "places.displayName,places.rating", // strict masks: rating fields raise the SKU
        },
        body: JSON.stringify({ textQuery: q, regionCode: "IN" }),
      });
      return toLocalMarket(raw); // keep only what the UI needs; no personal data
    },
    {
      requiresEnv: ["GOOGLE_PLACES_API_KEY"],
      cacheKey: `${PLACES_SOURCE}:${q.toLowerCase()}`,
      ttlMs: CACHE_TTL.places,
      mockKey: input.city,
      timeoutMs: 5000,
    }
  );
}
```

Rules that matter:
- **Cache key**: prefix it with the source name and include every input that changes the answer (query, city, strategy, API version). Normalize case. Never put a key or token in it.
- **TTL**: PageSpeed 24h; Places, Meta, YouTube and Trends 7d. Add new TTLs to `CACHE_TTL`.
- **Timeout**: the default is 5s. If a source is slower (PageSpeed is often 10–30s), do not raise the budget: make it *deferred*. That means a separate server action the dashboard calls after render, with a cached result, and the plan never waits on it.
- **Pure parsing** (`toLocalMarket`) goes in an exported function so tests can hit it without network.
- Put any rate-limit or quota cost in a comment next to the call (YouTube `search.list` costs 100 of 10,000 units, so cache hard).
- **Never fabricate**. If the API returns nothing, return empty data and let the UI say so. Do not invent volumes, counts or names.
- A **static dataset** (like `data/festivals-in.json`) skips `runSource`. Build the Signal directly (see `lib/enrich/calendar.ts`), and add the source to `ESTIMATE_SOURCES` in `lib/sources.ts` so it is never badged LIVE.

### 3. Wire it into step 3 (`lib/agent.ts`)
Add one line to the `runEnrichment({...})` task map. The `onSettled` callback already records a trace span under `enrich`. If the signal should change numbers (reach caps, multipliers), do that in the `signal_adjust` span, and only when `status === "ok"`. With the signal off, output must equal the v1 output.

### 4. Mock fixture (`fixtures/api/<source>/default.json`)
```json
{ "fetchedAt": "2026-10-04T09:30:00.000Z", "data": { "...": "same shape as T" } }
```
Add `<key>.json` files (named after `mockKey`, slugified) for city- or domain-specific demos. Mock mode must run with **no keys and no network**, and mock signals are badged MOCK, never LIVE. Once real keys work, record one real response per API as a fixture (strip anything personal).

### 5. UI (`components/<Name>Card.tsx`)
- Use the **frontend-design** skill. Extend the Midnight Pro look (`.card` + `.panel`, `display` = Geist, `num` = Geist Mono, `text-sand` (violet accent) / `text-mint` / `text-fog`). Place the card in a `grid-2` cell of a `StoryScene` section in `Dashboard.tsx` with a `SectionHead`; keep card type card-sized (titles `text-2xl`-`text-4xl`). Do not redesign. Go mobile-first (360px) and respect reduced motion (`StoryScene` handles it).
- Put `<ProvenanceBadge signal={s} />` next to every number from the source, and `<ProvenanceBadge estimate />` next to anything derived or guessed. A number without a badge is a bug.
- Handle `status !== "ok"` with a quiet, useful state (what is missing and how to connect it). Never show an error page.
- Add a label to `SOURCE_LABELS` in `lib/sources.ts`, and add the chapter id to `chapterIds` in `Dashboard.tsx` only when the signal exists.
- Client components import **types only** from `lib/types.ts`, never from `lib/enrich/*`.

### 6. Env + docs
Add the variable to `.env.example` (commented, empty) and the README env table. Update the README roadmap row.

### 7. Tests (`tests/<name>.test.ts`, node:test, run with `npm test`)
At minimum:
- pure parser: a real-looking API payload → expected `T`
- no key → `status: "skipped"` and the fetcher is not called
- slow fetcher → `status: "timeout"` (use `timeoutMs: 30`)
- mock mode reads the fixture (set `ADPILOT_MOCK_APIS=1`, or point `ADPILOT_FIXTURE_DIR` at a temp dir)
- any number the signal changes: on vs off, and off == v1

Tests run with `--conditions=react-server` (so `server-only` is a no-op) and the `@/` resolver in `scripts/test-hooks.mjs`. Write erasable TypeScript only (no `enum`, no parameter properties), because Node strips types and does not compile them. `npm test` clears `*_API_KEY`, `POSTGRES_URL` and the mock flag, so tests are always zero-key.

### 8. Gate + commit
`npm run lint`, `npx tsc --noEmit`, `npm run build` and `npm test` must all pass. Then make one local commit per feature on `v2`. Never push.

## Checklist
- [ ] optional `EnrichmentBundle` field + data type in `lib/types.ts`
- [ ] `lib/enrich/<name>.ts` with `server-only` and `runSource` (keys, cache key, TTL, timeout, mockKey)
- [ ] task added to `runEnrichment` in `runAgent`; numeric effects only in `signal_adjust`
- [ ] `fixtures/api/<source>/default.json`
- [ ] card with badges; `SOURCE_LABELS` entry; graceful non-ok state
- [ ] `.env.example` + README
- [ ] tests: parse, skip, timeout, mock, on/off
- [ ] zero-key `npm run dev` plan still returns; an old plan still renders
