# AdPilot v2 architecture

This document explains how a brief becomes a plan and why it is built this way. The source of truth for scope is `docs/AdPilot_v2_Build_Brief_Advanced.pdf`. The file-by-file map is in `CLAUDE.md`.

## 1. Shape of the system

- **One Next.js 15 app** (App Router, TypeScript) on Vercel. There is no second server and no Python at runtime.
- **One server function, `runAgent(input)`** (`lib/agent.ts`), builds every plan. Two entry points call it:
  - `POST /api/plan` (`app/api/plan/route.ts`) streams trace events as NDJSON, then the plan. The form uses this to show live progress.
  - The `createPlan` Server Action (`app/actions.ts`) is the fallback when streaming is unavailable.
- **The `PlanResult` contract** (`lib/types.ts`) is shared by the agent, the dashboard, localStorage and Postgres JSONB. Every v2 field is optional (`enrichment?`, `shap?`, `realityCheck?`, `zeroRupee?`, `launchKit?`, `budgetGrid?`, `trace?`), and `planVersion: 2` marks new plans. Plans saved by v1 still render.
- **Pure, client-safe modules** (`allocate`, `forecast`, `ranges`, `reality-check`, `scenario`, `grounding-guard`) hold the math, so the browser can re-run it for the budget slider.
- **Server-only modules** (`lib/enrich/*`, `lib/budget-grid.ts`, `lib/llm.ts`) start with `import "server-only"`. They hold keys and the model.

## 2. Data flow (`runAgent`)

| # | Trace span | Module | What happens |
| --- | --- | --- | --- |
| 1 | `scrape` | `lib/scrape.ts` | Fetch the domain (4s timeout) and parse title, meta, H1, OG and JSON-LD. `detectTracking()` finds Pixel / GA4 / GTM / WhatsApp / tel links. On failure the agent continues with `product_name`. |
| 2 | `recognize`, `recognize_llm` | `lib/recognize.ts`, `lib/infer.ts` | Category = **what is sold** (product name and title outweigh the description, which outweighs the audience; buyer words are ignored) and price tier. An optional LLM refine (Groq first) runs if more than 4s of budget remain. |
| 3 | `enrich` (+ one child span per source) | `lib/enrich/*` | All sources run in parallel through `runEnrichment` (`Promise.allSettled`): `siteReadiness`, `calendar`, `localMarket` (Places), `creators` (YouTube), `audience` (Meta). |
| — | `rate_card` | `lib/rate-card.ts` | India 2026 CPM / CPC / CTR. Postgres edits override the static card. |
| 4 | `score`, `shap`, `budget_grid` | `lib/scoring.ts`, `lib/ml/*`, `lib/budget-grid.ts` | XGBoost scores 12 channels (25 features), then the policy rules apply. TreeSHAP explains each channel in the mix. The grid holds scores at 11 budgets. |
| 5 | `signal_adjust` | `lib/agent.ts`, `lib/forecast.ts` | Festival-week CPM multipliers from the calendar. The Meta pool upper bound becomes a reach cap. This only happens when the signal is `ok`. |
| — | `zero_rupee` | `lib/zero-rupee.ts` | Up to 4 free actions, ranked by rules over the signals and the brief. Each one names its source. |
| 6 | `allocate` | `lib/allocate.ts` | 2–5 channels, at most 50% each (unless the budget is under ₹3,000), largest-remainder rupees. `capMetaReach` applies the pool. |
| 7 | `forecast` | `lib/forecast.ts`, `lib/ranges.ts` | Rate-card math, weekly rollup with season multipliers, low / mid / high bands. |
| 8 | `reality_check` | `lib/reality-check.ts` | Only when price and margin are given: break-even units, required CVR, verdict against `data/benchmarks.json`. |
| 9 | `copy_template`, `placements`, `launch_kit`, `copy_llm`, `launch_kit_llm` | `lib/copy-templates.ts`, `lib/launch-kit.ts`, `lib/llm.ts` | A deterministic kit and template copy first. An optional LLM rewrite runs if there is budget (Gemini first, then Groq). |
| 10 | `grounding_guard` | `lib/grounding-guard.ts` | Every number in the kit, copy and outreach is checked against the evidence. Any number that cannot be traced is removed or reverted. |

The internal time budget is 14s (`BUDGET_MS`), and each route sets `maxDuration = 60`. LLM steps are skipped and recorded as `skipped: time budget` when too little time remains. `runAgent(input, { baseline: true })` is the v1 path used by the eval: no enrichment, season adjust, zero-rupee layer or reality check.

**Deferred work:** PageSpeed is often slow (10–30s), so the plan never waits for it. After render, `components/SpeedCheck.tsx` calls the `checkPageSpeed` Server Action (45s timeout, 24h cache). An LCP above 4s becomes the first readiness fix.

## 3. The Signal contract

Every data source returns a `Signal<T>` and never throws:

```ts
interface Signal<T> {
  source: string;          // "google_places", "meta_reach", ...
  status: "ok" | "skipped" | "timeout" | "error";
  fetchedAt: string;       // ISO time of the original fetch (kept on cache hits)
  ms: number;
  cached: boolean;
  mock?: boolean;          // read from fixtures/api/
  data?: T;
  reason?: string;         // "no API key (YOUTUBE_API_KEY)", "HTTP 403", "no response in 5s"
}
```

`runSource()` (`lib/enrich/signal.ts`) always resolves in the same order:

1. **Mock mode** (`ADPILOT_MOCK_APIS=1`): read `fixtures/api/<source>/<mockKey>.json`, otherwise `default.json`. Result: `ok` + `mock: true`, or `skipped`.
2. **Required env keys missing**: `skipped`, with a reason naming the variable.
3. **Cache hit**: `ok` + `cached: true`, keeping the original `fetchedAt`.
4. **Live fetch** with a hard `AbortSignal` timeout (5s by default): `ok` or `timeout`.
5. **Cache write** on success.
6. Anything thrown becomes `error` with a short reason.

`runEnrichment()` runs the task map through `Promise.allSettled`, so even a task that throws outside `runSource` becomes an `error` signal. Site readiness builds its Signal directly from the page the scrape already fetched. The static festival calendar does too, and it is listed in `ESTIMATE_SOURCES` (`lib/sources.ts`), so it is never badged LIVE.

**Provenance in the UI:** `components/ProvenanceBadge.tsx` turns a signal into a badge: **LIVE · source · date**, **MOCK**, **ESTIMATE** or **Not connected**. `components/DataSources.tsx` lists every signal with its status and ms.

## 4. Caching

- `lib/enrich/cache.ts` uses the `adpilot_cache` table (`key text PK, value jsonb, expires_at timestamptz`) when `POSTGRES_URL` is set. Otherwise it uses an in-memory `Map`. It never throws.
- TTLs (`CACHE_TTL`): PageSpeed 24h; Places, Meta, YouTube and Trends 7 days.
- Cache keys start with the source name and include every input that changes the answer (query, city, API version), lower-cased. Keys and tokens never go into a cache key.
- Quota notes sit next to each call. For example, YouTube `search.list` costs 100 of 10,000 daily units, so it is cached hard.

## 5. Trace (F15)

- `createTrace(now, onEvent)` / `trace.span(name, fn, { meta })` in `lib/trace.ts` record start, end, status and meta for every step. `trace.skip(name, reason)` records a step that did not run. `trace.signal()` turns each settled source into a child span of `enrich`.
- The trace is saved on the plan (`PlanResult.trace`). The total ms matches `agentMs`.
- `onEvent` drives the streamed progress UI (`lib/plan-progress.ts`, `components/PipelineProgress.tsx`).
- The meta records what happened, for example: `{ provider: "google", fallback: "groq: echo" }` on LLM spans, `{ checked, removed }` on `grounding_guard`, and `{ seasonFactor, reachPool }` on `signal_adjust`.

## 6. Grounding guard (F7)

The LLM may only rewrite words. Numbers have to come from the plan.

1. **Evidence**: `groundingSet(...)` walks the plan's structured numbers (budget, mix, rupees, forecast and ranges, reality check, kit fields) and the ok signals. Free text is never evidence.
2. **Extraction**: `extractNumbers(text)` finds ₹ amounts, Indian grouping (1,00,000), K / L / Cr / M suffixes, percentages, times (6–10pm) and Devanagari / Tamil digits. Each token carries the precision it was written at.
3. **Check**: `isGrounded` accepts a token when an evidence value matches within that precision. A percentage may also match a fraction (CTR 0.012 = "1.2%").
4. **Action**: a launch-kit line with an untraceable number reverts to its deterministic version (`guardKitTexts`). Ad angles and outreach lose the token (`guardText`). Lines that are not English (Indic script or Hinglish function words) also revert.
5. **Logging**: the `grounding_guard` span records the numbers checked and removed. The eval reports the grounding rate.

LLM order (`lib/llm.ts`): the kit rewrite and copy go to Gemini first, then Groq. Recognition goes to Groq first. A provider counts as failed and the next one is tried on an HTTP error, a timeout, unusable JSON, or an **echo** (80% or more of the lines unchanged).

## 7. Budget grid and slider (F11)

- **On the server** (`lib/budget-grid.ts`): for 11 log-spaced budgets from 0.25× to 4×, extract features, predict raw scores for all 12 channels, and keep TreeSHAP only for the channels in the mix at that point. The model (`ml/model.json`) never ships to the browser.
- **In the browser** (`lib/scenario.ts`): `scenarioAt(plan, budget)` snaps the scores to the nearest grid point. It re-applies the budget policy exactly (`lib/policy.ts`, LinkedIn below ₹15,000), then re-runs `allocateBudget`, `rollupForecast` and the reality check. `transitions()` produces notes such as "LinkedIn appears above ₹15,000".
- **Guarantees** checked by the eval at roughly 1,800 slider steps: totals equal the slider budget, 1× equals the saved plan, the share and LinkedIn rules hold, and the channel count never falls as the budget rises. Recompute takes well under 1 ms.

## 8. Model and explanations

- `ml/train.py` trains 12 `XGBRegressor`s on synthetic India planning briefs and exports trees with per-node `cover`. `lib/ml/infer.ts` walks those trees in TypeScript.
- `lib/ml/shap.ts` is exact TreeSHAP (Lundberg 2018, Algorithm 2) over cover. The base value plus all contributions equals the raw prediction. `assertModelSelfCheck()` verifies cover and additivity on load.
- `lib/ml/feature-labels.ts` turns the 25 features into human labels ("Audience age ~21", "Not a SaaS brand").

## 9. Key decisions

| Decision | Why |
| --- | --- |
| Walk the XGBoost trees in TS instead of a Python service | One deploy, no cold-start sidecar, and TreeSHAP can run in the same process. |
| Exact TreeSHAP, not zero-ablation | Zero-ablation explanations do not add up (0% additivity in the eval). TreeSHAP is exact and consistent. |
| Each source optional, time-boxed, cached, `allSettled` | A plan always returns. Zero-key mode stays identical to v1. Places / YouTube quotas are protected. |
| PageSpeed deferred after render | It is too slow for the plan's time budget. |
| Mock fixtures recorded from real calls (`npm run record`) | Demo, tests and eval run offline and are reproducible. |
| Deterministic kit first, LLM only rewrites words | Numbers live in structured fields. The guard can verify every number. |
| Gemini first for rewrites; echo counts as failure | gpt-oss-20b on Groq returned its input unchanged in every recording. |
| English-only plan text | Mixed-script output was unreliable and could not be checked. The form's language is an audience hint (regional creators, ShareChat). |
| Largest-remainder allocation | The rupee split sums exactly to the budget with whole rupees. |
| Budget grid instead of calling the server on every slider move | The slider stays instant and offline, and the model stays on the server. |
| No new npm dependencies; `node:test` | A small surface. Everything is fetch plus small helpers. |
