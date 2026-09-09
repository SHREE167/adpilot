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

- GitHub: https://github.com/SHREE167/adpilot
- Vercel: set after first deploy (Hobby timeout is 10s; scrape is capped at 4s so a plan still returns).

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

## Vercel env vars

Set these in the Vercel project **Settings → Environment Variables** (or a local `.env.local` copied from `.env.example`).

| Variable | Required | Purpose |
| --- | --- | --- |
| `GROQ_API_KEY` | No | LLM copy (checked first) |
| `OPENAI_API_KEY` | No | LLM copy if Groq is unset |
| `GOOGLE_GENERATIVE_AI_API_KEY` | No | LLM copy if Groq and OpenAI are unset |
| `POSTGRES_URL` | No | Persist plans + rate card across serverless instances |

Optional model overrides: `GROQ_MODEL`, `OPENAI_MODEL`, `GOOGLE_MODEL`.

LLM calls happen **only** inside the server agent (`runAgent`). The browser never sees the key. There is no REST API wrapper around Meta, Google, or the agent.

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
npm run train-model   # retrain XGBoost (needs ml/.venv)
```
