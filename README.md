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
1. Midnight Pro UI (v2): dark by default with a light toggle, one violet accent, Geist type, a centered 1200px layout with paired cards (v1 used a maximalist gold/glass look).
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
| M3 | Reality check (break-even), exact TreeSHAP, eval harness v0 | done |
| M4 | Meta reach, YouTube creators, launch kit + grounding guard | done (Meta runs on a mock fixture until keys are added) |
| M5 | Budget slider, forecast ranges | in progress (ranges done) |
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
- **Why this channel? (exact TreeSHAP)**: each channel in the mix has a collapsible waterfall. It starts at the average score, shows the top 5 drivers ("Audience age ~21 +6.2", "Not a SaaS brand −3.1"), then the other features combined, and ends at the model score. Values come from exact TreeSHAP (Lundberg et al. 2018, Algorithm 2) in `lib/ml/shap.ts`, using per-node cover exported by `ml/train.py`; they add up to the score exactly. The waterfall says plainly that the model was trained on synthetic briefs, so it explains the model, not the market.
- **Eval harness v0** (`npm run eval`): runs 20 golden briefs (`eval/golden-briefs.json`) through the v1 path (`runAgent(input, { baseline: true })`, no enrichment) and through v2, in mock mode with no keys and no network. It writes `eval/report.md` with the date, git hash and a v1 vs v2 table covering specificity (grounded facts per plan), diversity (mean Jaccard distance of mixes), the ₹3k student vs ₹40k B2B signature check, reality coverage, explanation additivity and latency p50/p95. It exits non-zero if a mix does not sum to its budget or the signature briefs collapse to the same mix.

What M4 adds:

- **Category fix**: the product category is what the business sells, not who buys it. Product name and page title outweigh the audience notes, buyer words ("college students", "parents") are ignored, and text after " for " in the product name counts as audience. The eval reports category accuracy against hand labels.
- **Local voices (YouTube)**: one `search.list` (type=channel, "{topic} {city}", regionCode=IN, relevanceLanguage from the form) and one `channels.list` per plan, cached 7 days. Keeps 2k to 200k public subscribers and ranks by city mention, topic, language and size. Each creator shows a link, why they fit and a collab cost band from `data/creator-rates.json` (ESTIMATE). YouTube only: AdPilot does not search Instagram creators. Needs `YOUTUBE_API_KEY`.
- **Who you can reach (Meta)**: resolves the city (`search?type=adgeolocation`), up to 3 interests from what is sold (`type=adinterest`, kept by id) and calls `act_{id}/reachestimate` for the monthly lower/upper bounds. The card shows the bounds and the exact `targeting_spec`. Facebook + Instagram forecast reach is capped at the pool (signal adjust; off = v1 numbers). Under-18 audiences get no interests (Meta allows only age + location for teens). We use `reachestimate` rather than `delivery_estimate`, whose DAU fields Meta removed in v26 (all versions from 27 Oct 2026). Needs `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID`, `META_API_VERSION`; until then it runs on a hand-written MOCK fixture in mock mode.
- **Launch kit**: per channel in the mix, exact targeting (the Meta `targeting_spec` when the audience signal is live), days and times, creative count + format, search keywords, a first-week checklist and the one metric to watch. Built deterministically from the mix and the signals (pixel/GTM checks, WhatsApp funnel hint, Maps listing and top competitor, festival weeks, creators); every number in it sits in a structured field. With an LLM key it is reworded for tone in plain English (Gemini first, Groq if Gemini fails, times out or echoes the input back), and copy is never allowed to add numbers. A rewrite where 80% or more of the lines come back unchanged counts as a failure (gpt-oss-20b did this in every recording). All plan text is English; the form's language only describes the audience (e.g. regional YouTube creators, ShareChat).
- **Grounding guard** (`lib/grounding-guard.ts`): extracts every number from LLM text (₹, 1,00,000, K/L/Cr/M, %, 6-10pm, Devanagari/Tamil digits) and checks it against the plan's structured numbers and the signals at the precision shown. A kit line with an untraceable number falls back to its deterministic version; ad angles and outreach scripts (template or LLM) lose the token. The v1 template scripts no longer contain invented offers or numbers; the owner fills `{{offer}}` / `{{price}}`. Every removal is logged in the `grounding_guard` trace span. Template copy (no key) still works.
- Groq default model is now `openai/gpt-oss-20b`: Groq moved the Llama models to its Enterprise tier, and free keys get HTTP 404 on `llama-3.1-8b-instant`. Override with `GROQ_MODEL`.
- `npm run eval` adds category accuracy, launch-kit text similarity (lower = more specific) and grounding rate (target 100%).
- `npm run record -- <youtube|groq|gemini|meta>` makes one real call with the keys in `.env.local` and saves the response as a mock fixture (prints status and counts only, never keys).

What M5 adds:

- **Forecast ranges (F14)**: reach, clicks and conversions are low / mid / high everywhere they appear (KPI tiles, channel tiles and cards, the weekly chart as a shaded clicks band, the markdown export). The default band is ±30% on rate-card math; Facebook + Instagram reach narrows to ±15% when the Meta pool signal is ok ("backed by Meta pool") and the combined high never exceeds the pool. Totals sum the channel lows and highs. The reality check keeps its verdict on the middle estimate and adds the conversion rate needed across the click range. Bands are data (`kind: default | signal | calibrated`), so M6 can switch to intervals calibrated from real results. Plans saved before M5 get a default band derived on the fly.

`ADPILOT_MOCK_APIS=1` makes every source read `fixtures/api/<source>/*.json` (`{ "fetchedAt", "data" }`), so demos and tests run offline. Mock mode is for local use; fixture files are not bundled into Vercel functions.

## Vercel env vars

Set these in the Vercel project **Settings → Environment Variables** (or a local `.env.local` copied from `.env.example`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | No | Product recognition (first) and fallback for copy / launch-kit wording. Default model `openai/gpt-oss-20b` (`GROQ_MODEL` overrides) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | Launch-kit rewrite + ad copy (first); fallback for recognition. Default model `gemini-3.5-flash-lite` (`GOOGLE_MODEL` overrides) |
| `POSTGRES_URL` | No | Persist plans + rate card across serverless instances; also the `adpilot_cache` table for v2 data sources |
| `PAGESPEED_API_KEY` | No | Mobile speed score + LCP in "Ready to spend?" (deferred after render, cached 24h). Restrict the key to the PageSpeed Insights API |
| `GOOGLE_PLACES_API_KEY` | No | Local market scan: competitors for "{keyword} in {city}" + whether the business is on Google Maps (2 Text Search calls, 7-day cache, strict field masks). Restrict the key to Places API (New); set a daily quota and budget alert |
| `YOUTUBE_API_KEY` | No | Local voices: up to 5 YouTube channels for "{topic} {city}" with 2k-200k subscribers (search.list 100 units + channels.list 1 unit per uncached plan, 7-day cache). Restrict the key to YouTube Data API v3 |
| `META_ACCESS_TOKEN` | No | F4 audience size: system-user token with `ads_read` (server only, no user OAuth, no spend). Needs the two below as well |
| `META_AD_ACCOUNT_ID` | No | Ad account for `act_{id}/reachestimate` (with or without `act_`) |
| `META_API_VERSION` | No | Pinned Marketing API version, e.g. `v26.0` |
| `ADPILOT_MOCK_APIS` | No | `1` = data sources read `fixtures/api/` instead of live APIs (local/demo/tests) |

Optional model overrides: `GROQ_MODEL`, `GOOGLE_MODEL`. OpenAI is not used.

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

If Python cannot run locally (on Windows, Smart App Control can block numpy's DLLs), retrain in Google Colab: `pip install xgboost==3.4.1 scikit-learn==1.9.1`, upload `ml/train.py` to `ml/`, run `python ml/train.py`, download `ml/model.json`. The app's self-check confirms every node has cover and that SHAP adds up on the self-check rows. The October 2026 Colab retrain moved mean R² from 0.8792 to 0.8791 (library-version drift); the trees differ slightly from the original export.

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
ml/train.py                    retrains the booster (exports per-node cover)
lib/ml/shap.ts                 exact TreeSHAP for the waterfall
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
