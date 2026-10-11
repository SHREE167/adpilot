# AdPilot eval report (F16 v0)

- **Date:** 2026-10-11 (2026-10-11T05:30:55.820Z)
- **Git:** `91473ef` (uncommitted changes)
- **Briefs:** 20 (`eval/golden-briefs.json`)
- **Mode:** `ADPILOT_MOCK_APIS=1`, no API keys, no network, no LLM (template copy)

## v1 vs v2

| Metric | v1 (enrichment off) | v2 |
| --- | --- | --- |
| Category accuracy (vs expectedCategory) | 100% (20/20) | 100% (20/20) |
| Specificity (grounded facts / plan) | 0.0 | 13.3 |
| Diversity (mean Jaccard distance of mixes) | 0.62 | 0.62 |
| Unique channel mixes | 11 / 20 | 11 / 20 |
| Signature: ₹3k student vs ₹40k B2B (Jaccard) | 1.00 pass | 1.00 pass |
| Reality coverage (briefs with a verdict) | 0% (0/20) | 70% (14/20) |
| Reality verdicts | — | healthy 8, tight 3, likely loss 3 |
| Explanation additivity (base + Σ = score) | 0% (zero-ablation, 240 checks) | 100% (TreeSHAP, 240 checks) |
| Latency p50 / p95 (ms, offline mock) | 10.0 / 26.4 | 20.6 / 51.9 |
| Mix sums to budget | 20 / 20 | 20 / 20 |

## Per brief (v2)

| Brief | Budget | Goal | Category | v2 mix | Same as v1 | Facts | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ₹3k student snack · Chennai | ₹3,000 | sales | food |WhatsApp 21%, Instagram Reels 21%, ShareChat 20%, Instagram Feed 19%, YouTube 19% | yes | 28 | likely loss |
| ₹40k B2B SaaS · Bengaluru | ₹40,000 | b2b | saas |LinkedIn 21%, Google Search 21%, Reddit 20%, X 20%, Telegram 18% | yes | 12 | healthy |
| Biryani restaurant · Chennai | ₹15,000 | store_visits | food |WhatsApp 21%, Instagram Reels 20%, Facebook 20%, ShareChat 20%, Instagram Feed 20% | yes | 23 | tight |
| NEET coaching · Chennai | ₹25,000 | leads | education |YouTube 21%, Instagram Reels 20%, Google Search 20%, ShareChat 20%, WhatsApp 19% | yes | 23 | healthy |
| Tailoring shop · Chennai | ₹2,000 | awareness | local_service |WhatsApp 22%, Facebook 22%, Google Display 20%, Google Search 20%, Instagram Reels 16% | yes | 22 | — |
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
- **Specificity** counts facts a plan cites that trace to an ok signal or to the user's own numbers: readiness fixes, festivals, festival-priced weeks, Google Places facts and YouTube creators (each only when the query names the brief's city),zero-rupee items that cite a source, and the break-even verdict. Mock fixtures stand in for live APIs here.
- **Diversity** is the mean pairwise Jaccard distance between the channel sets of all briefs (0 = every plan picks the same channels, 1 = no overlap).
- **Explanation additivity** checks that the explanation adds up to the score. v1's zero-ablation uses an all-zero baseline over all 25 features. v2 uses exact TreeSHAP (Lundberg et al. 2018) over per-node cover: average score + Σ drivers + other features must equal the model's raw output within 1e-3.
- **Latency** is `runAgent` wall time on this machine in offline mock mode, after one warm-up run; production adds the real scrape and API calls.
- M3 does not change which channels are picked (only festival pricing touches allocation), so v1 and v2 diversity are expected to match. The live audience caps (F4), critic (F12) and explore slice (F20) are what move diversity later.
