# AdPilot v2: notes for the project report and PPT

Bullet material to copy into the report or slides. All numbers are from `eval/report.md` (20 golden briefs, offline mock mode). Re-run `npm run eval` before submitting and update any number that changed.

## 1. Problem statement

- India has tens of millions of micro and small businesses. Most have monthly ad budgets of ₹1,000–₹50,000 and no marketer.
- The tools they can use are built for big advertisers or are generic:
  - Ad platforms only plan inside their own network (Google plans Google, Meta plans Meta), and only after login and billing setup.
  - Agencies have minimum retainers far above these budgets.
  - Generic AI chat gives plausible text with **invented numbers** and no local data.
- AdPilot v1 already produced a mix and a forecast, but:
  - Two different snack shops in Chennai with ₹3,000 got nearly the same plan.
  - It knew nothing about the business's website, competitors, festival timing, audience size or local creators.
  - Its explanations were zero-ablation guesses, its forecasts were single numbers, and it never asked whether spending would pay off.
- **Goal:** a planner that is *grounded* (cites real local facts), *explainable* (exact attributions), *honest* (labels every estimate, says when not to spend) and *measurable* (an eval harness proves it).

## 2. Existing systems (and their gaps)

| System | What it does | Gap for a ₹3,000 local business |
| --- | --- | --- |
| Google Ads Performance Planner / Keyword Planner | Forecasts for Google campaigns | Google channels only; needs an account; no WhatsApp, ShareChat or creators |
| Meta Ads Manager estimates | Audience size and reach estimate | Meta only; needs an ad account; no break-even or cross-channel split |
| Media agencies | Full planning and buying | Minimum fees far above the budget |
| General LLM chatbots | A plan written in prose | Invented numbers, no local data, no provenance, not reproducible |
| AdPilot v1 | XGBoost mix + rate-card forecast | Generic, no live data, explanations don't add up, single-point forecasts |

## 3. Proposed system

- **Input:** website, monthly ₹ budget, city, audience age and notes, goal (awareness / sales / leads / store visits / app installs / B2B), audience language, and optionally price and margin.
- **Output:**
  - channel mix (2–5 of 12 Indian channels), with a rupee split that sums exactly to the budget
  - low / mid / high forecast
  - break-even verdict
  - zero-rupee actions
  - per-channel launch kit, ad angles, outreach scripts
  - a "why" waterfall per channel
  - provenance badges and a full agent trace
- **Four layers:**
  1. **Grounding:** live APIs (PageSpeed, Google Places, Meta reach, YouTube) plus a festival calendar.
  2. **Intelligence:** XGBoost + exact TreeSHAP, reality check, zero-rupee layer, launch kit.
  3. **Interaction:** budget slider and forecast ranges.
  4. **Proof:** agent trace, grounding guard, eval harness.
- **Non-negotiables:**
  - No ad buying and no user OAuth.
  - Keys stay on the server.
  - A plan always returns, even if every API fails.
  - Every number is LIVE (source + date), ESTIMATE or MOCK.

## 4. Architecture / modules

Pipeline (one server function `runAgent`, every step a trace span):

`scrape → recognize → enrich (parallel) → XGBoost + TreeSHAP → signal adjust → allocate → forecast (ranges) → reality check → launch kit + copy → grounding guard`

| Module | Files | Role |
| --- | --- | --- |
| Scraper + tracking detection | `lib/scrape.ts` | Site meta, Pixel / GA4 / GTM / WhatsApp / tel detection |
| Product recognition | `lib/recognize.ts`, `lib/infer.ts` | Category = what is sold; price tier; optional LLM refine |
| Enrichment framework | `lib/enrich/signal.ts`, `cache.ts`, `mock.ts` | `Signal<T>`, timeouts, Postgres / memory cache, offline fixtures |
| Data sources | `lib/enrich/*.ts` | Site readiness, PageSpeed (deferred), Places, festival calendar, Meta reach, YouTube creators |
| Scorer | `lib/ml/infer.ts`, `lib/scoring.ts`, `lib/policy.ts` | XGBoost tree walk + budget policy |
| Explainer | `lib/ml/shap.ts` | Exact TreeSHAP waterfall |
| Allocator | `lib/allocate.ts` | 2–5 channels, 50% cap, largest-remainder rupees |
| Forecaster | `lib/forecast.ts`, `lib/ranges.ts` | Rate-card math, festival multipliers, low / mid / high |
| Reality check | `lib/reality-check.ts` | Break-even units, required CVR, verdict |
| Zero-rupee layer | `lib/zero-rupee.ts` | Free actions ranked by rules over signals |
| Launch kit + LLM | `lib/launch-kit.ts`, `lib/llm.ts` | Deterministic kit; optional Gemini / Groq rewording |
| Grounding guard | `lib/grounding-guard.ts` | Number extraction + evidence check |
| Budget grid + slider | `lib/budget-grid.ts`, `lib/scenario.ts` | Server scores at 11 budgets; client re-plan |
| Trace + streaming | `lib/trace.ts`, `app/api/plan/route.ts` | Spans, NDJSON progress |
| Eval harness | `eval/run.ts`, `eval/metrics.ts` | v1 vs v2 on 20 golden briefs |

## 5. Algorithms

### 5.1 XGBoost channel scorer
- Supervised regression: **12 gradient-boosted tree regressors**, one per channel. Each predicts a 0–100 fit score.
- **25 features:** log budget, audience age, price tier, metro, vernacular, student, professional, B2B, local, category one-hot, goal one-hot.
- Trained in Python (`ml/train.py`) on **synthetic** India planning briefs. Holdout mean R² ≈ 0.88, MAE ≈ 3 points.
- Exported to JSON with per-node `cover`. Inference walks the trees in TypeScript, so there is no Python at runtime.
- After the model come the policy rules:
  - drop any channel scoring under 40
  - LinkedIn only from ₹15,000 (unless B2B with a professional audience)
  - at most 2 channels under ₹2,000
  - at most 50% per channel from ₹3,000
- Reference: Chen & Guestrin, *XGBoost*, KDD 2016.

### 5.2 Exact TreeSHAP
- Shapley values assign each feature its fair share of a prediction: the average marginal contribution over all feature orderings. Brute force costs O(2^M).
- **TreeSHAP (Lundberg, Erion & Lee 2018, Algorithm 2)** computes exact values in O(T·L·D²) by tracking the fraction of paths through each tree. When a feature is not fixed, it weights both branches by node `cover`.
- **Additivity:** base value (expected score) + Σ contributions = model output. The eval verifies this on 240 channel explanations (100%), against 0% for v1's zero-ablation.
- The UI shows a waterfall: average score → top 5 drivers → "other features" → model score.

### 5.3 Largest-remainder allocation
- Weights: `w_i = score_i^1.2` for the picked channels. Shares are capped at 50% and the excess is redistributed (`cappedShares`).
- Ideal rupees are `share_i × budget`. Take the floor of each, then hand the leftover rupees one by one to the largest fractional remainders (Hamilton's method).
- Guarantee: whole rupees that **sum exactly to the budget**, with the smallest possible rounding error. Checked on every plan and every slider step.

### 5.4 Forecast with ranges
- `impressions = spend / (CPM × festival multiplier) × 1000`; `clicks = impressions × CTR`; `reach ≈ impressions / 3.2`; `conversions = clicks × goal CVR × channel quality`.
- Band: ±30% by default. Facebook + Instagram reach uses ±15% when the Meta pool signal is live, and its high end is capped at the pool.

### 5.5 Reality check (break-even)
- `profit per sale = price × margin`, `break-even units = ⌈budget / profit per sale⌉`, `required CVR = units / forecast clicks`.
- Compared with the per-goal benchmark band, the verdict is: **Healthy** (≤ typical), **Tight** (≤ 2× typical) or **Likely loss** (> 2×).
- Demo brief: ₹20 × 30% = ₹6 per sale, so 500 sales are needed. That is a 46% required CVR against a typical 1%, so **Likely loss**.

### 5.6 Grounding guard
- Extract every numeric token from generated text, written as ₹, Indian grouping, K/L/Cr, %, times or Indic digits. Each token keeps the precision it was written at.
- Evidence: the plan's structured numbers plus the live signals. Free text never counts.
- A token is grounded if some evidence value matches it within the precision shown.
- Ungrounded tokens are removed. A launch-kit line with one reverts to its deterministic template. Lines that are not English also revert.
- Result: 100% of 1,805 numbers in v2 plan text are traceable.

### 5.7 Enrichment reliability pattern
- Each source runs: mock → key check → cache → fetch with hard timeout → cache write. It always returns a Signal (ok / skipped / timeout / error) and never throws.
- `Promise.allSettled` runs the sources in parallel. Slow PageSpeed is deferred until after render.

## 6. Results (v1 vs v2, `npm run eval`)

| Metric | v1 | v2 |
| --- | --- | --- |
| Category accuracy | 100% (20/20) | 100% (20/20) |
| Specificity (grounded facts per plan) | 0.0 | 13.9 |
| Grounding (numbers traceable) | 100% (88/88) | 100% (1805/1805) |
| English-only lines | 100% (597/597) | 100% (1302/1302) |
| Explanation additivity | 0% (zero-ablation) | 100% (TreeSHAP, 240 checks) |
| Slider: every gated check passes | no slider | 20 / 20 briefs (~1,800 steps) |
| Ranges ordered (low ≤ mid ≤ high) | 100% (351/351) | 100% (365/365) |
| Reality check coverage | 0% | 70% (14/20) |
| Diversity (mean Jaccard distance) | 0.62 | 0.62 |
| Latency p50 (ms, offline; varies by machine) | ~9 | ~64 |

Talking points:
- Specificity goes from 0 to about 14 local, sourced facts per plan.
- Explanations go from 0% to 100% additive.
- Every number in generated text is traceable.
- Diversity is honestly unchanged, because the scorer is the same model; that is the critic / explore work in M6.
- Slider recompute is under 1 ms per move.
- Quality gates: 200+ unit tests (`node:test`), lint, type check, production build and eval all pass.

## 7. Limitations

- The model is trained on **synthetic** data. It explains the model, not the market.
- The rate card, benchmarks, festival multipliers and creator rates are **estimates**. Festival dates are not yet verified.
- The Meta audience fixture is **hand-written** until a Meta token is available.
- Channel picks match v1, so mix diversity is unchanged.
- Ranges are a fixed band, not calibrated intervals.
- Impressions can dip when the slider adds a channel (12/20 briefs are monotone).
- The 20 golden briefs are small and hand-labelled; there is no held-out set.
- Static scraping cannot see pixels inside GTM.
- Creator search is YouTube only.

## 8. Future scope

- **M6 learning loop:**
  - an LLM **critic** with allow-listed fixes
  - an **actuals** feedback loop (real spend, clicks, sales) that shrinks the rate card toward observed results
  - **calibrated intervals** once 5 or more data points exist
  - a **Thompson-sampling explore slice** that tests an under-tried channel (Chapelle & Li 2011)
  - search demand from Google Trends via SerpAPI
- **M7 sharing:**
  - **ad previews** (Instagram, WhatsApp, Google search mockups with character limits)
  - a **print / share page** and a WhatsApp summary
  - a **trace timeline page**
- Replace synthetic training with real campaign outcomes as actuals build up.
- Regional-language copy once a reliable checker exists (today, all plan text is English).

## 9. Slide outline (suggested, 12 slides)

1. Title + positioning line
2. Problem: generic plans, invented numbers, no local data
3. Existing systems table
4. Proposed system: four layers
5. Architecture pipeline diagram (Mermaid in README → screenshot)
6. Grounding: data sources + provenance badges (screenshot 3)
7. XGBoost + TreeSHAP waterfall (screenshot 4)
8. Allocation + ranges + reality check
9. Grounding guard (before / after example)
10. Budget slider + launch kit (screenshot 5)
11. Results table (section 6)
12. Limitations + future scope
