# AdPilot

India-first media planner. You enter a domain, monthly budget (INR), city, audience, and goal. AdPilot returns a **channel mix**, **budget split**, **estimated forecast**, **3 ad angles**, **8 outreach scripts**, and charts.

AdPilot **does not buy ads**. It does **not** OAuth to Meta or Google. Every number is labelled **ESTIMATE** and is computed from a **local rate card**.

Built as a **Next.js 15 App Router + TypeScript** app, meant to deploy on **Vercel**.

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Live

- App: https://adpilot-olive-nine.vercel.app
- GitHub: https://github.com/SHREE167/adpilot

Hobby functions time out at ~10s. Scrape is capped at 4s so a plan still returns. Add `GROQ_API_KEY` (or OpenAI/Gemini) and `POSTGRES_URL` in the Vercel project env if you want LLM copy and durable saves.

Load a sample from the form:

- ₹3,000 student snack · Chennai
- ₹40,000 B2B SaaS · Bengaluru

No API key is required. Channel mix comes from a trained **XGBoost** model. Without an LLM key, copy still fills from templates.

## Roadmap (what we are building)

**Now (this pass)**
1. Maximalist + glass UI (Fraunces/Syne, gold foil, blur panels, grain, floating orbs).
2. Motion with **anime.js v4** (`animate` + `stagger`) on form and dashboard.
3. **Product recognition** before scoring: scrape title/H1/JSON-LD/excerpt → heuristic intel → optional LLM refine → XGBoost uses that category/tier.
4. Ads and outreach must name the recognized product, not a generic “try us”.

**Next**
5. Vision pass on `og:image` when present (still ESTIMATE, still no ad-network login).
6. Grounded “why this mix” narrative on the dashboard in the user’s language.
7. Compare view in the same glass language; reduced-motion fallback.

**Not on the map**
- Hosting a second server (Next.js is the whole app).
- Live Meta/Google buying or OAuth.

## v2 roadmap (branch `v2`)

Brief: `docs/AdPilot_v2_Build_Brief_Advanced.pdf`. Goal: the honest media planner for India's smallest businesses, grounded in live local data, explainable, self-critiquing, and willing to say when not to spend.

| # | Scope | Status |
| --- | --- | --- |
| M1 | Enrichment framework (Signal, timeouts, cache, mock mode), agent trace, LIVE/ESTIMATE badges, site readiness (tracking + funnel), festival calendar | done |
| M2 | PageSpeed (deferred), Google Places local market, zero-rupee layer | done |
| M3 | Reality check (break-even), exact TreeSHAP, eval harness v0 | in progress |
| M4 | Meta reach, YouTube creators, launch kit + grounding guard | |
| M5 | Budget slider, forecast ranges | |
| M6 | Critic, actuals loop, calibrated intervals, explore slice | |
| M7 | Ad previews, share/print, trace page | |
| M8 | Eval v2 vs v1 report, demo script | |

What M1 adds to every plan:

- **Step 3 enrich** runs every data source in parallel (`Promise.allSettled`). Each source has a hard timeout and is optional; a failed source is recorded, never an error page.
- **Ready to spend?**: Meta Pixel / GA4 / GTM, HTTPS, viewport, WhatsApp click-to-chat, tap-to-call, CTA and og:image checks, read from the page we already fetch. If GTM is present we say "a pixel may be inside it", never "no pixel".
- **Timing**: `data/festivals-in.json` (2026–2027, dates `verified: false` until checked) and `data/city-state.json`. Festival weeks raise the CPM (ESTIMATE), so the weekly forecast and totals buy fewer impressions for the same spend.
- **Data sources** footer and an agent **trace** (`PlanResult.trace`): every step with ms and status.
- Badges: **LIVE · source · date** (fetched now), **ESTIMATE** (rate card, model, static calendar), **MOCK** (fixtures), **Not connected**.
- Old saved plans have no `planVersion` and render exactly as before.

What M2 adds:

- **Mobile speed (PageSpeed, deferred)**: after the dashboard renders, it asks the server for a PageSpeed Insights v5 mobile run (score + LCP, cached 24h). The plan never waits on it. LCP over 4s becomes the first fix in "Ready to spend?". Needs `PAGESPEED_API_KEY`.
- **Your street (Google Places)**: "{keyword} in {city}" competitors (count, average rating, top 5) and a search for the business itself ("Not on Google Maps: create a free Business Profile"). Strict field masks, 7-day cache, only public names and ratings kept. Skipped for SaaS/B2B/online-only briefs. Needs `GOOGLE_PLACES_API_KEY`.
- **Before you spend anything (zero-rupee)**: up to 4 free actions ranked from signals and the brief (Business Profile, WhatsApp Business catalog + Status, organic Reels, local groups, founder LinkedIn). Each item says why; no item fires without a reason.
- Market density feeds the zero-rupee layer and the store_visits ranking. Using it in ad copy waits for the grounded launch kit (F7, M4), so copy never quotes a number the LLM could change.

What M3 adds:

- **Can this pay for itself? (reality check)**: two optional form fields, price of one sale (₹) and margin %. AdPilot works out `breakEvenUnits = ceil(budget / (price × margin))` and `requiredCvr = units / forecast clicks`, then compares that to a per-goal band in `data/benchmarks.json` (ESTIMATE, editable). The verdict is **Healthy** (at or under typical), **Tight** (up to 2× typical) or **Likely loss** (more than 2×). Tight and Likely loss suggest a smaller first test and link to the free actions. Leave the fields empty and the check is skipped; it never blocks the plan.
- **Eval harness v0** (`npm run eval`): runs 20 golden briefs (`eval/golden-briefs.json`) through the v1 path (`runAgent(input, { baseline: true })`, no enrichment) and through v2, in mock mode with no keys and no network. It writes `eval/report.md` with the date, git hash and a v1 vs v2 table covering specificity (grounded facts per plan), diversity (mean Jaccard distance of mixes), the ₹3k student vs ₹40k B2B signature check, reality coverage, explanation additivity and latency p50/p95. It exits non-zero if a mix does not sum to its budget or the signature briefs collapse to the same mix.

`ADPILOT_MOCK_APIS=1` makes every source read `fixtures/api/<source>/*.json` (`{ "fetchedAt", "data" }`), so demos and tests run offline. Mock mode is for local use; fixture files are not bundled into Vercel functions.

## Vercel env vars

Set these in the Vercel project **Settings → Environment Variables** (or a local `.env.local` copied from `.env.example`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | No | LLM copy (checked first) |
| `OPENAI_API_KEY` | No | LLM copy if Groq is unset |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | LLM copy if Groq and OpenAI are unset |
| `POSTGRES_URL` | No | Persist plans + rate card across serverless instances; also the `adpilot_cache` table for v2 data sources |
| `PAGESPEED_API_KEY` | No | Mobile speed score + LCP in "Ready to spend?" (deferred after render, cached 24h). Restrict the key to the PageSpeed Insights API |
| `GOOGLE_PLACES_API_KEY` | No | Local market scan: competitors for "{keyword} in {city}" + whether the business is on Google Maps (2 Text Search calls, 7-day cache, strict field masks). Restrict the key to Places API (New); set a daily quota and budget alert |
| `ADPILOT_MOCK_APIS` | No | `1` = data sources read `fixtures/api/` instead of live APIs (local/demo/tests) |

Optional model overrides: `GROQ_MODEL`, `OPENAI_MODEL`, `GOOGLE_MODEL`.

LLM calls happen **only** inside the server agent (`runAgent`). The browser never sees the key. There is no REST API wrapper around Meta or Google. The form calls one route, `POST /api/plan`, which runs the same `runAgent` as the `createPlan` Server Action and streams each pipeline step as NDJSON so the UI can show real progress (it falls back to the Server Action if the stream is unavailable).

Deploy:

```bash
npx vercel
```

## Enable Postgres on Vercel

Serverless functions do not share a writable filesystem. **Do not persist plans as a JSON file** — it will not survive deploys or jump between instances.

1. In the Vercel dashboard open the project.
2. Go to **Storage** → create a **Postgres** database (Neon / Vercel Postgres).
3. Connect it to the project. Vercel injects `POSTGRES_URL`.
4. Redeploy.

With `POSTGRES_URL` set, AdPilot:

- creates `adpilot_plans` and `adpilot_rate_card` on first use
- stores each `PlanResult` as JSONB
- stores rate-card edits from the `/rate-card` page so CPM/CPC/CTR survive

Without Postgres (local demo / first Vercel deploy):

- the server keeps `lastResult` and a plan map **in memory** (lost on cold start)
- the browser also saves plans in **localStorage**
- `/plans` and `/plans/[id]` merge server memory + localStorage

## Routes

| Path | What |
| --- | --- |
| `/` | New plan form |
| `/plans` | List |
| `/plans/[id]` | Result dashboard |
| `/compare?a=&b=` | Side-by-side |
| `/rate-card` | Edit CPM / CPC / CTR |

The form posts to a **Server Action** (`createPlan` in `app/actions.ts`), which calls `runAgent` in-process. No `/api/*` routes. No Meta/Google client.

Goals: `awareness` | `sales` | `leads` | `store_visits` | `app_installs` | `b2b`.

## Viva: agent vs rate card

This is the distinction examiners should hear.

### Rate card (data)

A **static table of India 2026 planning estimates**: CPM, CPC, CTR per channel.

```
Google Search  180 / 12 / 0.04
Display         40 /  4 / 0.005
YouTube         70 /  6 / 0.012
Instagram Reels 90 /  8 / 0.015
Instagram Feed  80 /  9 / 0.008
Facebook        60 /  7 / 0.007
WhatsApp        20 /  3 / 0.03
ShareChat       35 /  3 / 0.01
LinkedIn       250 / 40 / 0.006
Telegram        25 /  3 / 0.02
Reddit          80 / 15 / 0.008
X               70 / 10 / 0.007
```

Forecast math (all ESTIMATE):

- `impressions = (spend / CPM) × 1000`
- `clicks = impressions × CTR`
- `reach ≈ impressions / 3.2`
- conversions = clicks × goal CVR × **channel quality weight** (Search/LinkedIn count more than Telegram/Display)
- B2B / leads ROAS applies an 8% close rate × AOV; snack sales ROAS uses AOV directly
- CPA = spend / conversions

The rate card is **not** live bidding. Editing it on `/rate-card` changes tomorrow’s estimates, not anyone’s real campaign.

### Agent (orchestration)

One server function, `runAgent`, target **&lt; 15s**:

1. **Scrape** the domain with `fetch()` (8s timeout). Parse title, meta description, H1. If the site blocks or times out, **continue with `product_name`**.
2. **Infer** category (food, saas, …) and price tier (low → enterprise) from keywords.
3. **Score** every channel **0–100 with a trained XGBoost model** (one regressor per channel, `ml/model.json`). Not the LLM. Then apply budget policy:
   - budget &lt; ₹2,000 → at most **2** channels
   - LinkedIn score **0** if budget &lt; ₹15,000 unless **goal is B2B and audience is professional**
   - no channel **&gt; 50%** unless budget &lt; ₹3,000
   - reject score **&lt; 40**
4. **Allocate** rupees to **2–5** channels so the **sum equals budget** (largest-remainder rounding).
5. **Forecast** from the rate card math above.
6. **LLM (optional)** fills explanations, 3 ad angles, 8 outreach scripts from the **already computed JSON**. It is **not allowed to change scores or rupees**. If no key (or the call fails / times out at 6s), **templates** fill the same slots.
7. Return a typed **`PlanResult`**.

**One-liner for viva:** *XGBoost scores which channels fit the brief; policy rules split the rupees; the rate card turns rupees into estimated impressions; the LLM only writes the words.*

### XGBoost (the scorer)

Tabular problem, so gradient boosting — not a deep net, not a live ads API.

- **Features (25):** log budget, age, price tier, metro, vernacular, student, professional, B2B, local, category one-hot, goal one-hot.
- **Labels:** synthetic India planning scores (audience × category × CPM affordability). There is no Meta/Google delivery history to train on, and we do not scrape advertisers.
- **Model:** 12 `XGBRegressor`s, 48 trees, depth 4. Holdout **mean R² ≈ 0.88**, MAE ≈ 3 points.
- **Runtime:** trees walk in TypeScript (`lib/ml/infer.ts`). Python is only for retraining: `npm run train-model`.
- **Policy after the model:** LinkedIn floor, 40-point cutoff, 50% cap, mix sums to budget.

Retrain:

```bash
python -m venv ml/.venv
ml/.venv/Scripts/pip install -r ml/requirements.txt
npm run train-model
```

## Sample fixtures

Checked into `fixtures/`:

| File | Brief | What you should see |
| --- | --- | --- |
| `fixtures/snack-chennai.json` | ₹3,000, student snack, Chennai, Tamil | Reels / WhatsApp / ShareChat heavy. LinkedIn = 0. Mix ≤ 50% per channel. |
| `fixtures/b2b-saas.json` | ₹40,000, B2B SaaS, Bengaluru, English | LinkedIn + Search (+ Reddit/X). ShareChat rejected. |
| `fixtures/*.plan.json` | Full `PlanResult` snapshots from XGBoost + rate card | Same mix/forecast as the form with no LLM key. |

Load the inputs from the home-page buttons.

## Type-safe result

`PlanResult` lives in `lib/types.ts`. It is the contract between the agent, the dashboard, and Postgres JSONB.

## Stack

- Next.js 15 App Router, React 19, TypeScript
- Tailwind CSS v4
- Recharts (pie = mix, bar = impressions, line = weekly pacing)
- `@vercel/postgres` when `POSTGRES_URL` exists
- Optional LLM copy from `runAgent` on the server (Groq → OpenAI → Gemini). Not required.

## Project map

```
app/actions.ts                 Server Actions (createPlan, loadPlan, …)
lib/agent.ts                   runAgent (the 7 steps)
lib/ml/infer.ts                XGBoost tree walker
ml/model.json                  trained booster (committed)
ml/train.py                    retrains the booster
lib/scoring.ts                 model scores + policy rules
lib/allocate.ts                2–5 channels, sum == budget
lib/forecast.ts                rate-card math
lib/reality-check.ts           break-even verdict (data/benchmarks.json)
lib/rate-card.ts               India 2026 ESTIMATES
lib/llm.ts                     optional copy
lib/copy-templates.ts          no-key fallback
lib/types.ts                   PlanResult
```

## Scripts

```bash
npm run dev      # local
npm run build    # production build
npm run start    # serve the build
npm run lint
npm test         # node:test unit tests (no extra deps)
npm run eval     # v1 vs v2 on 20 golden briefs (mock mode) → eval/report.md
npm run train-model   # retrain XGBoost (needs ml/.venv)
```
