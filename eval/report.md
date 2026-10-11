# AdPilot eval report (F16, M8 final)

- **Date:** 2026-10-11 (2026-10-11T14:42:34.715Z)
- **Git:** `85f2093` (uncommitted changes)
- **Briefs:** 20 (`eval/golden-briefs.json`)
- **Mode:** `ADPILOT_MOCK_APIS=1`, no API keys, no network, no LLM (template copy)
- **Reproduce:** `npm run eval` (exits non-zero if a gated check fails)

## Headline

| Metric | v1 | v2 |
| --- | --- | --- |
| Category accuracy | 100% (20/20) | 100% (20/20) |
| Specificity (grounded facts per plan) | 0.0 | 13.9 |
| Grounding (numbers traceable) | 100% (88/88) | 100% (1805/1805) |
| English-only lines | 100% (597/597) | 100% (1302/1302) |
| Explanation additivity | 0% (zero-ablation, 240 checks) | 100% (TreeSHAP, 240 checks) |
| Slider: every gated check passes | — (no slider) | 20 / 20 briefs |
| Ranges ordered (low ≤ mid ≤ high) | 100% (351/351) | 100% (365/365) |
| Reality check coverage | 0% (0/20) | 70% (14/20) |
| Diversity (mean Jaccard distance) | 0.62 | 0.62 |
| Latency p50 / p95 (ms, offline mock) | 11.3 / 20.3 | 73.5 / 118.6 |

v2 beats v1 on specificity (0.0 → 13.9 grounded facts per plan), explanation additivity (0% → 100%) and reality coverage, with 100% grounding. Diversity is equal (0.62 vs 0.62), so F16's "beats v1 on diversity" is **not met yet**: the scorer that picks channels is unchanged, and the critic and explore slice (M6) are what move it.

## v1 vs v2 (full)

| Metric | v1 (enrichment off) | v2 |
| --- | --- | --- |
| Category accuracy (vs expectedCategory) | 100% (20/20) | 100% (20/20) |
| Specificity (grounded facts / plan) | 0.0 | 13.9 |
| Diversity (mean Jaccard distance of mixes) | 0.62 | 0.62 |
| Unique channel mixes | 11 / 20 | 11 / 20 |
| Signature: ₹3k student vs ₹40k B2B (Jaccard) | 1.00 pass | 1.00 pass |
| Reality coverage (briefs with a verdict) | 0% (0/20) | 70% (14/20) |
| Reality verdicts | — | healthy 8, tight 3, likely loss 3 |
| Explanation additivity (base + Σ = score) | 0% (zero-ablation, 240 checks) | 100% (TreeSHAP, 240 checks) |
| Latency p50 / p95 (ms, offline mock) | 11.3 / 20.3 | 73.5 / 118.6 |
| Mix sums to budget | 20 / 20 | 20 / 20 |
| Slider: briefs with a budget grid | — (no slider) | 20 / 20 (1807 slider steps) |
| Slider: totals = slider budget at every step | — (no slider) | 20 / 20 |
| Slider: 1× reproduces the saved plan | — (no slider) | 20 / 20 |
| Slider: 1-5 channels, none > 50% from ₹3,000; LinkedIn policy | — (no slider) | 20 / 20 |
| Slider: channel count never falls as budget rises | — (no slider) | 20 / 20 |
| Slider: impressions never fall as budget rises (reported, not gated) | — (no slider) | 12 / 20 |
| Slider: recompute p50 / p95 (ms per move) | — (no slider) | 0.027 / 0.093 |
| Signature ₹3k vs ₹40k mixes at 0.25× and 4× (Jaccard) | — (no slider) | 1.00 at 0.25× / 1.00 at 4× |
| Ranges ordered (low ≤ mid ≤ high) | 100% (351/351) | 100% (365/365) |
| Reach bands backed by a signal (Meta pool) / high within pool | 0 / 20 of 20 | 32 / 20 of 20 |
| Launch-kit text similarity (3-gram Jaccard, lower = more specific) | — no kit (v1 template copy: 0.23) | 0.21 |
| Grounding rate (numbers in kit + copy + outreach traceable) | 100% (88/88) | 100% (1805/1805) |
| Guard: numbers checked / removed (kit rewrite + copy) | — (no guard) | 190 / 0 |
| Ad copy + outreach scripts: numbers traceable | 100% (88/88) | 100% (88/88) |
| English-only lines (kit + copy + outreach) | 100% (597/597) | 100% (1302/1302) |

## Per brief (v2)

| Brief | Budget | Goal | Category | v2 mix | Same as v1 | Facts | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ₹3k student snack · Chennai | ₹3,000 | sales | food |WhatsApp 21%, Instagram Reels 21%, ShareChat 20%, Instagram Feed 19%, YouTube 19% | yes | 31 | likely loss |
| ₹40k B2B SaaS · Bengaluru | ₹40,000 | b2b | saas |LinkedIn 21%, Google Search 21%, Reddit 20%, X 20%, Telegram 18% | yes | 12 | healthy |
| Biryani restaurant · Chennai | ₹15,000 | store_visits | food |WhatsApp 21%, Instagram Reels 20%, Facebook 20%, ShareChat 20%, Instagram Feed 20% | yes | 26 | tight |
| NEET coaching · Chennai | ₹25,000 | leads | education |YouTube 21%, Instagram Reels 20%, Google Search 20%, ShareChat 20%, WhatsApp 19% | yes | 26 | healthy |
| Tailoring shop · Chennai | ₹2,000 | awareness | local_service |WhatsApp 22%, Facebook 22%, Google Display 20%, Google Search 20%, Instagram Reels 16% | yes | 25 | — |
| Payroll SaaS · Bengaluru | ₹60,000 | leads | saas |LinkedIn 22%, Google Search 21%, X 20%, Reddit 20%, Telegram 18% | yes | 9 | healthy |
| Cloud kitchen · Bengaluru | ₹8,000 | sales | food |WhatsApp 21%, Instagram Reels 21%, Instagram Feed 20%, YouTube 20%, ShareChat 19% | yes | 10 | likely loss |
| Thrift fashion app · Bengaluru | ₹30,000 | app_installs | fashion |Instagram Reels 21%, Instagram Feed 21%, YouTube 20%, WhatsApp 19%, ShareChat 19% | yes | 8 | — |
| Coding bootcamp · Bengaluru | ₹1,00,000 | leads | education |YouTube 21%, Google Search 20%, Instagram Reels 20%, WhatsApp 20%, Instagram Feed 19% | yes | 10 | healthy |
| Block-print kurtas · Delhi | ₹12,000 | sales | fashion |WhatsApp 21%, Instagram Feed 20%, Instagram Reels 20%, Google Display 20%, Facebook 19% | yes | 18 | healthy |
| IAS coaching · Delhi | ₹50,000 | awareness | education |YouTube 21%, Instagram Reels 20%, WhatsApp 20%, Google Search 20%, ShareChat 20% | yes | 11 | — |
| AC repair · Delhi | ₹5,000 | leads | local_service |Facebook 22%, WhatsApp 22%, Google Search 20%, Google Display 19%, ShareChat 17% | yes | 11 | tight |
| Sweet shop · Delhi | ₹20,000 | store_visits | food |WhatsApp 21%, Facebook 21%, Instagram Reels 20%, ShareChat 19%, Google Display 19% | yes | 12 | tight |
| Analytics SaaS · Mumbai | ₹80,000 | b2b | saas |LinkedIn 21%, Google Search 21%, Reddit 20%, X 20%, Telegram 18% | yes | 9 | healthy |
| Streetwear · Mumbai | ₹1,000 | sales | fashion |Instagram Reels 51%, Instagram Feed 49% | yes | 10 | likely loss |
| Pet grooming · Mumbai | ₹7,000 | store_visits | local_service |Facebook 22%, WhatsApp 21%, Google Search 20%, Google Display 19%, Instagram Feed 18% | yes | 9 | — |
| Vada pav stall · Mumbai | ₹4,000 | awareness | food |WhatsApp 21%, Instagram Reels 20%, ShareChat 20%, YouTube 20%, Instagram Feed 19% | yes | 9 | — |
| Unisex salon · Coimbatore | ₹6,000 | store_visits | local_service |WhatsApp 21%, Facebook 21%, Google Search 20%, Google Display 19%, ShareChat 19% | yes | 14 | healthy |
| Silk sarees · Coimbatore | ₹18,000 | sales | fashion |Instagram Feed 20%, Facebook 20%, Instagram Reels 20%, WhatsApp 20%, Google Display 20% | yes | 10 | healthy |
| Spoken English classes · Coimbatore | ₹3,500 | leads | education |YouTube 21%, WhatsApp 20%, Instagram Reels 20%, ShareChat 20%, Google Search 19% | yes | 9 | — |

## How to read this

- **v1** is `runAgent(input, { baseline: true })`: no enrichment step, no season adjust, no zero-rupee layer, no reality check. Its mix is the v1 mix.
- **Category accuracy** compares the recognized category (heuristic only here; no LLM in eval) with each brief's hand-labelled `expectedCategory`: what the business sells, not who buys it. The labels were written alongside the M4 recognizer fix, so 100% here is a regression floor, not proof of generalisation.
- **Specificity** counts facts a plan cites that trace to an ok signal or to the user's own numbers: readiness fixes, festivals, festival-priced weeks, Google Places facts, YouTube creators and the Meta audience pool + interests (each only when the query names the brief's city; the Meta fixture is hand-written until `npm run record -- meta` replaces it), zero-rupee items that cite a source, and the break-even verdict. Mock fixtures stand in for live APIs here.
- **Diversity** is the mean pairwise Jaccard distance between the channel sets of all briefs (0 = every plan picks the same channels, 1 = no overlap).
- **Explanation additivity** checks that the explanation adds up to the score. v1's zero-ablation uses an all-zero baseline over all 25 features. v2 uses exact TreeSHAP (Lundberg et al. 2018) over per-node cover: average score + Σ drivers + other features must equal the model's raw output within 1e-3.
- **Latency** is `runAgent` wall time on this machine in offline mock mode, after one warm-up run; production adds the real scrape and API calls.
- Channel picks are the same in v1 and v2 (signals change prices, reach caps and words, not the scorer), so mix diversity matches. The critic (F12) and explore slice (F20) are what move it later. The Meta reach cap (F4) only binds when forecast reach exceeds the pool, which these mock budgets never do.
- **Slider (F11)**: each v2 plan carries scores at 11 budgets (0.25×-4×). For every slider step (~60-110 per brief) the eval re-runs the same pure client code (`scenarioAt`): allocation must sum to the slider budget, 1× must equal the saved plan, shares and the LinkedIn rule must hold, and the channel count must never fall as the budget rises. "Impressions never fall" is reported but not gated: the planner optimises channel fit, so when a budget unlocks more channels (2 → 5 at ₹2,000) or a pricier channel enters, impressions can dip while the mix gets broader. Recompute time is per slider move in Node on this machine.
- **Ranges (F14)**: every reach / clicks / conversions forecast is low / mid / high. Default band ±30% on rate-card math; Facebook + Instagram reach narrows to ±15% when the Meta pool signal is ok, with the combined high capped at the pool. Totals sum the channel lows/mids/highs. The eval fails if any range is out of order or a Meta-backed high exceeds the pool.
- **Launch-kit text similarity** is the mean pairwise Jaccard similarity of word 3-gram sets of each plan's launch-kit text (lower = less boilerplate shared across briefs). v1 has no kit; its column shows the same measure over v1's template ad copy for reference.
- **Grounding rate** extracts every number (₹, K/L/Cr/M, %, times, Indian digit scripts) from the launch kit, ad angles, outreach scripts and channel explanations and checks it against the plan's structured numbers and the signals, at the precision shown. Free text is never evidence. It proves numbers trace to the plan, not that they are used correctly: small integers (weeks, ages) are usually traceable.
- **Guard: checked / removed** sums the `grounding_guard` trace span: every v2 plan's ad copy and outreach, plus the launch-kit rewrite when an LLM wrote it. In eval only the demo brief has a rewrite: a real Gemini response recorded by `npm run record -- gemini`, kept in `fixtures/api/llm_gemini/` and replayed offline. With the English-only prompt it is English and passes the guard (Gemini's first, pre-fix answer was Hinglish and is kept inline in the tests as a rejection case). The launch-kit rewrite is Gemini first: mock mode replays the Gemini recording, then Groq's, with the same echo rule (80%+ unchanged lines = failure). gpt-oss-20b returned its input unchanged in all three of its recordings.
- **Ad copy + outreach scripts** are the template scripts (no LLM in eval). Since M4 they contain no invented offers or numbers: the owner fills `{{offer}}` / `{{price}}`. Before the fix they traced 74% in v1 (168/227) because of lines like "10% off on 3+ packs".
- **English-only lines** checks every kit, copy and outreach line with `isEnglishText` (no Indic script, no Hinglish function words). The form's language describes the audience only.

## Limitations

- **Synthetic training data.** The XGBoost scorer was trained on generated briefs, so TreeSHAP explains the generator's rules, not the Indian ad market. Additivity proves the explanation is exact for the model, not that the model is right. Real results (M6 actuals loop) are the fix.
- **Mock data, not live data.** Every signal here comes from `fixtures/api/`. The Places, YouTube and PageSpeed fixtures are recorded real responses; the **Meta reach fixture is still hand-written** until a Meta token exists and `npm run record -- meta` replaces it.
- **Mix diversity is unchanged** from v1 (same scorer, same picks). v2 changes prices, ranges, timing, words and verdicts, not which channels win.
- **Impressions can dip as the budget rises** (12 / 20 briefs are monotone): when a budget unlocks more channels or a pricier channel, the mix gets broader and total impressions can fall. Reported, not gated.
- **Ranges are a default band** (±30%, ±15% when Meta-backed), not calibrated intervals. Calibration needs real actuals (M6).
- **Category labels are a regression floor.** The 20 golden briefs were labelled while fixing the recognizer; there is no held-out set.
- **Almost no LLM in eval.** Only the demo brief replays one recorded Gemini rewrite, so grounding and English-only mostly measure the templates and the guard, not live LLM behaviour.
- **Latency is offline.** Production adds the 4s scrape and up to 5s per live source (in parallel); PageSpeed is deferred and not counted.
