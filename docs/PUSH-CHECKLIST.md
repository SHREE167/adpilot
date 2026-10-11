# Push checklist: branch `v2` → PR to `SHREE167/adpilot`

**Do nothing in this file until Sai says "push now".** Until then everything stays local: no `git push`, `pull`, `fetch` or `gh`.

- Remote: `origin` = `https://github.com/SHREE167/adpilot`
- Default branch: `master`. Never merge into it locally. The merge happens on GitHub, after review.
- `v2` is 30+ commits ahead of `master`, one commit per feature (M1–M8).

## 1. Final local check (before pushing)

```powershell
git status                 # must be clean, on branch v2
git branch --show-current  # v2
npm run lint
npx tsc --noEmit
npm test
npm run build
npm run eval               # exits 0; eval/report.md unchanged except date/latency
```

Then confirm no secrets are staged or tracked:

```powershell
git ls-files | findstr /i ".env"    # only .env.example
```

The M8 history scan of all commits found no real keys (only dummy test values like `"secret-token"`). Re-run it if any commit is added after M8.

## 2. Push and open the PR (only after "push now")

```powershell
git fetch origin
git log --oneline origin/master..v2     # what the PR will contain
git log --oneline v2..origin/master     # should be empty; if not, see below
git push -u origin v2
```

Open the PR, either on github.com (Compare & pull request, base `master` ← compare `v2`) or with the GitHub CLI:

```powershell
gh pr create --repo SHREE167/adpilot --base master --head v2 --title "AdPilot v2: grounded, explainable media planner (M1-M5, M8)" --body-file docs/PR-BODY.md
```

(`docs/PR-BODY.md` does not exist yet. Write it at push time from the README "Key features" and "v1 vs v2 in numbers" sections, or paste them into the web form.)

If `origin/master` has new commits, **do not merge locally**. Push `v2` anyway and let GitHub show the conflicts, or ask before rebasing.

Suggested PR body outline:
1. What v2 is (the positioning line).
2. Features shipped (M1–M5) and what was deferred (M6, M7).
3. The v1 vs v2 eval table from `eval/report.md`.
4. Env vars to add on Vercel (section 3 below). All are optional.
5. How to test the preview (section 4 below).
6. Screenshots from `docs/screenshots/`.

## 3. Vercel environment variables

Vercel → Project → **Settings → Environment Variables**. Add them to **Preview** first and test there; add them to **Production** only once the PR is merged. Every variable is optional, and with none of them the app still works.

| Variable | Environments | Notes |
| --- | --- | --- |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Preview, Production | Gemini for the kit/copy rewrite. |
| `GROQ_API_KEY` | Preview, Production | Recognition + fallback wording. |
| `POSTGRES_URL` | Preview, Production | Use Vercel Storage → Postgres (Neon) → Connect; it is injected automatically. Ideally use a separate database or branch for Preview. |
| `PAGESPEED_API_KEY` | Preview, Production | Restrict the key to the PageSpeed Insights API. HTTP referrer restrictions don't apply to server calls, so use API restrictions. |
| `GOOGLE_PLACES_API_KEY` | Preview, Production | **Billing.** Set a daily quota and a budget alert in Google Cloud before adding it. |
| `YOUTUBE_API_KEY` | Preview, Production | 10,000 units a day; each uncached plan uses 101. |
| `META_ACCESS_TOKEN` | Preview, Production | System-user token with `ads_read`. Mark it **Sensitive**. |
| `META_AD_ACCOUNT_ID` | Preview, Production | With or without the `act_` prefix. |
| `META_API_VERSION` | Preview, Production | e.g. `v26.0`. |
| `GROQ_MODEL`, `GOOGLE_MODEL` | optional | Only to override the default models. |
| `ADPILOT_MOCK_APIS` | **never** | The fixtures are not bundled into functions, so mock mode on Vercel would make every source "skipped". |

Mark every key as **Sensitive**. Redeploy the preview after adding variables, because env changes only apply to new deployments.

**Function duration:** the routes set `maxDuration = 60`. Check that the project's plan allows 60s in Settings → Functions. The agent's internal budget is 14s either way, so only the deferred PageSpeed check (45s timeout) needs the extra time.

## 4. What to test on the Vercel preview

Use the preview URL from the PR's Vercel bot comment.

**Zero-key path** (first deploy, before any env vars, or a preview without them):
- [ ] The home page loads and **Agent progress** streams while a plan builds (NDJSON route working).
- [ ] The ₹3,000 snack sample returns a full plan in under ~15s.
- [ ] The data cards say **Not connected**, not an error. Timing still shows festivals (static data, ESTIMATE).
- [ ] The rupee mix sums to the budget. KPI tiles show low / mid / high.
- [ ] The reality card shows **Likely loss** for the snack sample.
- [ ] The **Why this channel?** waterfall opens.
- [ ] The budget slider moves instantly, and Reset returns to the original.

**With keys:**
- [ ] Places / YouTube / Meta cards show **LIVE · source · date** (not MOCK).
- [ ] Mobile speed fills in a few seconds *after* the page renders. A second plan for the same domain is instant (cache).
- [ ] The trace / Data sources footer shows each source as `ok` with ms. A second run shows `cached`.
- [ ] The launch kit reads as reworded English. The trace's `launch_kit_llm` span names the provider. The `grounding_guard` span shows checked and removed counts.
- [ ] With `POSTGRES_URL`: open the plan in a private window via `/plans/[id]`. It loads from Postgres, and `/rate-card` edits survive a redeploy.

**Compatibility and layout:**
- [ ] A plan saved by v1 (in browser localStorage from the production site, or an old Postgres row) still renders.
- [ ] `/plans`, `/compare?a=&b=` and `/rate-card` all load.
- [ ] At 360px width nothing overflows. Check the slider, KPI tiles and the SHAP waterfall.
- [ ] Light theme toggle works. With reduced motion turned on in the OS, there are no animations.
- [ ] The browser devtools Network tab shows no API keys in any response or page source.

**After the checks pass:** review the PR, merge on GitHub (not locally), then add the env vars to Production and check the production URL once.
