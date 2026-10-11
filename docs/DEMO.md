# AdPilot v2: 5-minute demo

**Story:** a ₹3,000 student snack brand in Chennai. AdPilot grounds the plan in local facts, explains itself, and then tells the owner that this spend will probably lose money and what to do instead.

The demo runs **offline in mock mode**: no keys, no network, the same result every time. Mocked data is badged **MOCK** on screen. Say so; it is part of the honesty pitch.

## Before you start (2 minutes, once)

1. In `.env.local` set `ADPILOT_MOCK_APIS=1`. Leave every key empty, or keep them; mock mode ignores live APIs.
2. Run `npm run dev` and open http://localhost:3000. Use a desktop width, dark theme.
3. Build the demo brief once, so first-compile delay doesn't happen live.
4. Keep `eval/report.md` open in a second tab (VS Code preview or GitHub).

> **Timing depends on today's date.** The calendar shows the festival window for the next 4 weeks. Around October–November that is Navratri, Dussehra and Diwali. In January it is **Pongal**. Read whatever festivals the Timing chapter shows.

## Script

| Time | Click / show | Say |
| --- | --- | --- |
| **0:00** | Home page. | "Small businesses in India get the same generic advice: run Instagram ads. AdPilot is an honest media planner. It uses live local data, explains every number, and will tell you when *not* to spend." |
| **0:20** | Click the sample **₹3,000 student snack · Chennai**. Point at the fields: price ₹20, margin 30%, Tamil audience, goal *sales*. | "Campus Crunch masala peanuts, ₹3,000 a month, for college students in Anna Nagar and Velachery. I've also given it the price and margin. Most planners never ask for those." |
| **0:40** | Submit. Watch **Agent progress** stream. | "This is the agent working live. It scrapes the site, recognizes the product, then calls five data sources in parallel, each with a timeout and a cache. If one fails, the plan still comes back." |
| **1:00** | Result hero + KPI tiles. | "Five channels, the rupees add up to exactly ₹3,000. Reach, clicks and conversions are **ranges**, low / mid / high, because a single number would be false precision." |
| **1:20** | Scroll to **Ready to spend?** | "Before money goes out: the site has HTTPS and WhatsApp, but Google Tag Manager is there and no visible pixel. We say 'a pixel *may* be inside GTM', not 'no pixel', because static scraping can't see inside GTM." Mobile speed loads after the page (PageSpeed is deferred). |
| **1:45** | **Timing** chapter. | "It knows Chennai is in Tamil Nadu and which festivals fall in the next four weeks. Festival weeks cost more per thousand impressions, so the weekly forecast buys fewer impressions in those weeks. Every multiplier is labelled ESTIMATE." |
| **2:05** | **Who else is on the map?** (Your street) | "Google Maps: 20+ snack shops in Chennai, average rating 4.5. And Campus Crunch isn't on Maps at all." |
| **2:20** | **Before you spend anything** (zero-rupee). | "So the first advice costs nothing: create a free Google Business Profile, set up the WhatsApp catalog. Every item says *why*, using the data we just saw." |
| **2:35** | **Who already talks to…** (YouTube) and **How many people can you reach…** (Meta). | "Real local food YouTubers with 2k to 200k subscribers, with a collab cost band. Meta gives the audience pool, 1.1–1.3 million. That one is a hand-written mock until we have a Meta token. The badge says MOCK, and we never pretend it's live." |
| **3:00** | **Can this pay for itself?** (reality card, *Likely loss*). | "This is the honest part. At ₹20 and 30% margin you make ₹6 a sale, so you need 500 sales to break even. That's a 46% conversion rate. Typical is about 1%. AdPilot says: this will likely lose money. Start with a ₹500 test, or do the free actions first." |
| **3:30** | Open **Why this channel?** on WhatsApp. | "Every channel score is explained with exact TreeSHAP. Start at the average score, add each feature's push up or down, and you land exactly on the model's score. It also says plainly the model was trained on synthetic data, so it explains the model, not the market." |
| **4:00** | **Budget slider**: drag to about ₹1,000, then to about ₹10,000; read **Where the mix changes**; click Reset. | "What if they spend less or more? The browser re-runs allocation, forecast and the break-even check instantly, without calling the server. Below ₹2,000 it drops to two channels, and the notes say exactly where channels enter or leave." |
| **4:20** | **Launch kit: what to set up on day one**, then the **Data sources** footer. | "A concrete day-one kit per channel: targeting, timing, creative count, first-week checklist. 'Every number below comes from the plan or a data source': a grounding guard checks every number the AI writes and deletes any it can't trace. The footer lists every source with its status and time." |
| **4:40** | Switch to `eval/report.md` (Headline table). | "And we measure it. 20 test briefs, v1 against v2: grounded facts per plan from 0 to about 14, 100% of numbers traceable, explanations that add up 100% versus 0%. And where v2 *doesn't* win yet, diversity, the report says so." |
| **5:00** | Stop. | "AdPilot: grounded, explainable, and honest enough to say don't spend yet." |

## If something goes wrong

- **No MOCK badges or empty cards:** `ADPILOT_MOCK_APIS=1` is not set, or the dev server was not restarted after editing `.env.local`.
- **No progress animation:** the stream fell back to the Server Action. The plan is the same; carry on.
- **Mobile speed says no check:** the PageSpeed fixture is keyed by domain. Narrate it as "deferred, runs after render" and move on.
- **Backup:** run `npm run eval` live (about 10 seconds) and show the scorecard in the terminal.
