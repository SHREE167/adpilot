# CLAUDE.md — AdPilot

## Summary

AdPilot is an India-first media planner (Next.js 15 App Router + TypeScript, deployed on Vercel). A brief (domain, ₹ budget, city, audience, goal, language) goes through one server function, `runAgent`. It returns a channel mix, a rupee split, a forecast, ad angles and outreach scripts. An XGBoost model (trees walked in TS) scores channels. Policy rules split the money, and a static India 2026 rate card turns rupees into estimates. An optional LLM only writes the words.

v2 makes it **the honest media planner for India's smallest businesses**: grounded in live local data, explainable, self-critiquing, and willing to say when not to spend.

**Source of truth:** `docs/AdPilot_v2_Build_Brief_Advanced.pdf`. Read sections 3–9 before starting a milestone. For how to add a data source, use the `adpilot-enrichment` skill (`.claude/skills/adpilot-enrichment/SKILL.md`).

## Commands

```
npm run dev          # local dev (turbopack) on http://localhost:3000
npm run build        # production build
npm run lint         # eslint
npx tsc --noEmit     # type check
npm test             # node:test unit tests (scripts/run-tests.mjs, no deps)
npm run train-model  # retrain XGBoost (needs ml/.venv with Python)
```

Set `ADPILOT_MOCK_APIS=1` in `.env.local` to make every enrichment source read `fixtures/api/<source>/*.json` (fully offline).

## File map

| Path | Role |
| --- | --- |
| `lib/agent.ts` | `runAgent()`: scrape → recognize → **enrich** → score → signal adjust → allocate → forecast → copy. Every step is a trace span. 14s internal budget. |
| `lib/trace.ts` | `createTrace()` / `span()`: records each step into `PlanResult.trace` (F15). |
| `lib/enrich/signal.ts` | `Signal<T>`, `withTimeout`, `runSource` (mock → cache → fetch with timeout), `runEnrichment` (allSettled). |
| `lib/enrich/cache.ts` | `adpilot_cache` in Postgres with TTL, or an in-memory Map fallback. |
| `lib/enrich/mock.ts` | `ADPILOT_MOCK_APIS=1` fixture reader. |
| `lib/enrich/site-readiness.ts` | F1 part A: tracking + funnel checks → readiness score + fixes. |
| `lib/enrich/pagespeed.ts`, `lib/speed-rules.ts`, `components/SpeedCheck.tsx` | F1 part B: PSI v5 mobile score + LCP. Deferred: `checkPageSpeed` action runs after render (45s timeout, 24h cache); LCP > 4s becomes the first fix. |
| `lib/enrich/calendar.ts` | F3: festival/season window + weekly CPM multipliers. |
| `data/festivals-in.json`, `data/city-state.json` | Static festival calendar (`verified:false` until checked) and city → state map. |
| `lib/scrape.ts` | Fetches the domain (4s timeout), parses meta, and runs `detectTracking()`. |
| `lib/recognize.ts`, `lib/llm.ts` | Heuristic product intel + optional LLM (Groq → OpenAI → Gemini). |
| `lib/scoring.ts`, `lib/ml/infer.ts`, `lib/ml/features.ts` | XGBoost per channel (25 features, 12 channels) + policy rules. `explainScore()` is zero-ablation (F9 replaces it with TreeSHAP). |
| `ml/train.py`, `ml/model.json` | Synthetic training; nodes have no `cover` yet (needed for F9). |
| `lib/allocate.ts`, `lib/forecast.ts` | Pure: 2–5 channels, 50% cap, sum == budget; rate-card math + weekly rollup with season multipliers. |
| `lib/storage.ts`, `lib/rate-card.ts` | Postgres (`adpilot_plans`, `adpilot_rate_card`) or memory + localStorage. |
| `lib/types.ts` | `PlanResult` contract, including Signal/Enrichment/Trace types (client-safe). |
| `app/actions.ts`, `app/page.tsx` | Server Actions (`createPlan` → `runAgent`); `maxDuration = 60`. |
| `components/Dashboard.tsx` | Story-scroll result view (glass/gold, Fraunces + Syne, anime.js). |
| `components/ProvenanceBadge.tsx`, `ReadinessCard.tsx`, `TimingCard.tsx`, `DataSources.tsx` | LIVE / ESTIMATE / Not connected badges and the v2 cards. |
| `fixtures/` | Sample briefs, v1 plan snapshots, `fixtures/api/<source>/` mock fixtures. |
| `tests/`, `scripts/` | node:test unit tests + a no-dependency TS test runner (resolve hooks). |

## Engineering rules (brief section 5)

- Zero-key mode must keep working exactly as today. Check after every feature.
- Every external call: server-only, timeout, try/catch, cache, returns a `Signal`, wrapped in a trace span. Never throw out of an enrichment.
- Keys only from `process.env` on the server. Never import `lib/enrich/*` into a client component.
- New `PlanResult` fields are optional; old saved plans (localStorage + Postgres) must still render. `planVersion: 2`.
- No new npm dependency without asking. Prefer fetch + small helpers. Unit tests use `node:test` (built in).
- UI: use the frontend-design skill; extend the existing glass/gold look; respect `prefers-reduced-motion`; mobile width first.
- Every number in the UI is LIVE (source + date) or ESTIMATE. Never present an estimate as live data. Mock data is badged MOCK.
- After each feature, `npm run lint`, `npx tsc --noEmit`, `npm run build` and `npm test` must all pass. One local commit per feature.
- Keep the README roadmap and `.env.example` in sync with every new env var.

## GIT RULES (strict, permanent)

- Work only on local branch `v2`. One local commit per feature.
- NEVER run `git push`, `git pull`, `git fetch`, `gh`, or anything that touches a remote or GitHub until the user says exactly "push now".
- Never merge into main. (This repo's default branch is `master`; never merge into it either.)

## ENVIRONMENT

- Windows 10/11, cmd/PowerShell. Use Windows-safe commands and paths. npm scripts must work on Windows (no `rm -rf`, no bash-only syntax; prefer node scripts).
- `.claude/skills/` contains vendored skills (frontend-design, webapp-testing, skill-creator). Do not modify them.
- webapp-testing needs Python + Playwright. They are **not installed** (as of M1). Ask before installing anything.
- Ignore npm deprecation/audit warnings. Do NOT run `npm audit fix` or upgrade packages (recharts, @vercel/postgres).

## Milestones (brief section 7)

| # | Scope | Needs keys | Est. |
| --- | --- | --- | --- |
| M1 | Enrichment framework (Signal, timeouts, cache, mock mode), F15 trace spans, provenance badges, F1 part A, F3 calendar | None | 2–3 days |
| M2 | F1 part B (PageSpeed, deferred), F2 Places, F10 zero-rupee | #3 PageSpeed, #4 Places | 2 days |
| M3 | F8 reality check, F9 TreeSHAP (retrain with cover), F16 eval harness v0 (v1 baseline) | None | 3 days |
| M4 | F4 Meta reach, F5 YouTube, F7 launch kit + grounding guard | #2 Groq, #5 YouTube, #6 Meta | 3–4 days |
| M5 | F11 budget slider, F14 ranges (default band) | None | 2 days |
| M6 | F12 critic, F13 actuals loop, F14 calibrated intervals, F20 explore slice, (F6) | #1 Postgres, #2 Groq, (#7 SerpAPI) | 4 days |
| M7 | F17 ad previews, F18 share/print, F15 trace page UI | None | 2 days |
| M8 | Eval v2 vs v1 report, fixtures, tests, README, demo script, report/PPT material | — | 2 days |

Each milestone ships alone. Run one milestone per session.
