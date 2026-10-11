# AdPilot eval report (F16 v0)

- **Date:** 2026-10-11 (2026-10-11T04:41:33.498Z)
- **Git:** `a06d08f` (uncommitted changes)
- **Briefs:** 20 (`eval/golden-briefs.json`)
- **Mode:** `ADPILOT_MOCK_APIS=1`, no API keys, no network, no LLM (template copy)

## v1 vs v2

| Metric | v1 (enrichment off) | v2 |
| --- | --- | --- |
| Specificity (grounded facts / plan) | 0.0 | 12.3 |
| Diversity (mean Jaccard distance of mixes) | 0.65 | 0.65 |
| Unique channel mixes | 12 / 20 | 12 / 20 |
| Signature: ₹3k student vs ₹40k B2B (Jaccard) | 1.00 pass | 1.00 pass |
| Reality coverage (briefs with a verdict) | 0% (0/20) | 70% (14/20) |
| Reality verdicts | — | healthy 9, tight 3, likely loss 2 |
| Explanation additivity (base + Σ = score) | 0.4% (zero-ablation, 240 checks) | n/a (model has no cover yet) |
| Latency p50 / p95 (ms, offline mock) | 0.8 / 3.8 | 1.6 / 3.6 |
| Mix sums to budget | 20 / 20 | 20 / 20 |

## Per brief (v2)

| Brief | Budget | Goal | Category | v2 mix | Same as v1 | Facts | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ₹3k student snack · Chennai | ₹3,000 | sales | food | WhatsApp 21%, Instagram Reels 21%, ShareChat 20%, YouTube 19%, Instagram Feed 19% | yes | 23 | likely loss |
| ₹40k B2B SaaS · Bengaluru | ₹40,000 | b2b | saas | LinkedIn 21%, Google Search 21%, X 20%, Reddit 20%, Telegram 18% | yes | 12 | healthy |
| Biryani restaurant · Chennai | ₹15,000 | store_visits | food | WhatsApp 21%, Instagram Reels 20%, ShareChat 20%, Instagram Feed 20%, Facebook 20% | yes | 18 | tight |
| NEET coaching · Chennai | ₹25,000 | leads | education | YouTube 21%, Instagram Reels 20%, Google Search 20%, ShareChat 20%, WhatsApp 19% | yes | 18 | healthy |
| Tailoring shop · Chennai | ₹2,000 | awareness | general | WhatsApp 22%, Facebook 22%, Google Display 20%, Google Search 18%, Instagram Reels 17% | yes | 17 | — |
| Payroll SaaS · Bengaluru | ₹60,000 | leads | saas | LinkedIn 22%, Google Search 21%, X 20%, Reddit 20%, Telegram 18% | yes | 9 | healthy |
| Cloud kitchen · Bengaluru | ₹8,000 | sales | food | WhatsApp 21%, Instagram Reels 21%, Instagram Feed 20%, YouTube 20%, ShareChat 19% | yes | 10 | likely loss |
| Thrift fashion app · Bengaluru | ₹30,000 | app_installs | education | YouTube 21%, Google Search 20%, Instagram Reels 20%, WhatsApp 20%, Instagram Feed 19% | yes | 8 | — |
| Coding bootcamp · Bengaluru | ₹1,00,000 | leads | saas | Reddit 21%, Google Search 20%, X 20%, LinkedIn 20%, Telegram 19% | yes | 9 | healthy |
| Block-print kurtas · Delhi | ₹12,000 | sales | fashion | Instagram Feed 21%, WhatsApp 20%, Instagram Reels 20%, Google Display 20%, Facebook 19% | yes | 18 | healthy |
| IAS coaching · Delhi | ₹50,000 | awareness | education | YouTube 21%, Instagram Reels 20%, Google Search 20%, WhatsApp 20%, ShareChat 19% | yes | 11 | — |
| AC repair · Delhi | ₹5,000 | leads | local_service | Facebook 22%, WhatsApp 22%, Google Search 20%, Google Display 19%, ShareChat 17% | yes | 11 | tight |
| Sweet shop · Delhi | ₹20,000 | store_visits | ecommerce | Facebook 21%, Google Search 20%, WhatsApp 20%, Google Display 20%, Instagram Feed 19% | yes | 11 | tight |
| Analytics SaaS · Mumbai | ₹80,000 | b2b | saas | LinkedIn 21%, Google Search 21%, X 20%, Reddit 20%, Telegram 18% | yes | 9 | healthy |
| Streetwear · Mumbai | ₹1,000 | sales | education | YouTube 51%, WhatsApp 49% | yes | 10 | healthy |
| Pet grooming · Mumbai | ₹7,000 | store_visits | local_service | Facebook 22%, WhatsApp 21%, Google Search 20%, Google Display 19%, Instagram Feed 18% | yes | 9 | — |
| Vada pav stall · Mumbai | ₹4,000 | awareness | general | WhatsApp 21%, Google Display 20%, YouTube 20%, Instagram Reels 20%, Instagram Feed 19% | yes | 9 | — |
| Unisex salon · Coimbatore | ₹6,000 | store_visits | health | WhatsApp 22%, Google Search 20%, Facebook 20%, Google Display 19%, YouTube 19% | yes | 14 | healthy |
| Silk sarees · Coimbatore | ₹18,000 | sales | general | Facebook 21%, WhatsApp 20%, Google Search 20%, Google Display 20%, Instagram Reels 19% | yes | 10 | healthy |
| Spoken English classes · Coimbatore | ₹3,500 | leads | education | YouTube 21%, WhatsApp 20%, Instagram Reels 20%, ShareChat 20%, Google Search 20% | yes | 9 | — |

## How to read this

- **v1** is `runAgent(input, { baseline: true })`: no enrichment step, no season adjust, no zero-rupee layer, no reality check. Its mix is the v1 mix.
- **Specificity** counts facts a plan cites that trace to an ok signal or to the user's own numbers: readiness fixes, festivals, festival-priced weeks, Google Places facts (only when the query names the brief's city), zero-rupee items that cite a source, and the break-even verdict. Mock fixtures stand in for live APIs here.
- **Diversity** is the mean pairwise Jaccard distance between the channel sets of all briefs (0 = every plan picks the same channels, 1 = no overlap).
- **Explanation additivity** checks that the explanation adds up to the score. v1's zero-ablation uses an all-zero baseline over all 25 features. v2 uses exact TreeSHAP once `ml/model.json` has per-node cover (F9).
- **Latency** is `runAgent` wall time on this machine in offline mock mode, after one warm-up run; production adds the real scrape and API calls.
- M3 does not change which channels are picked (only festival pricing touches allocation), so v1 and v2 diversity are expected to match. The live audience caps (F4), critic (F12) and explore slice (F20) are what move diversity later.
