# Civic Atlas

An original, browser-powered presidential election sandbox. React + TypeScript + Vite, Pages Functions and KV only. The app works locally with fictional profiles and no key. OpenRouter is optional for grounded profiles and narrative generation. **Educational model, not an election forecast.**

## Start

Node 22+ and npm 10+:

```sh
npm ci
npm run dev
# http://localhost:8788 — Vite build served by wrangler pages dev
```

The dev runner uses Cloudflare's public dummy Turnstile keys, local KV, and a workspace-local Wrangler configuration/log directory. It rebuilds before launching; restart after frontend edits. `npm run dev:ui` is a faster Vite-only UI loop with bundled endpoint fallback.

```sh
MOCK_LLM=1 npm run dev  # full offline fixture flow; no OpenRouter or signal requests
npm run build          # only vite build; committed datasets are copied
npm test
npm run typecheck
npm run check          # typecheck, tests, build, CSP/asset checks
npm run build-data     # deterministic offline rebuild from committed normalized data
npm run benchmark
```

`MOCK_LLM` is a build-time flag. Never deploy a fixture build as if it were live. To return to normal: `npm run build` without the flag. No LLM secret belongs in `.dev.vars`, Pages secrets, source code, or a URL.

## What is implemented

- Original Civic Atlas branding, responsive theme selector with Light, Discord, Dark (black), OLED (true black), Midnight teal, Sepia, and System; the preference is saved and System follows OS changes, custom candidate colors carried through maps/charts/shared results, 2–6 editable profiles, source display, environment overrides, progress, and a persistent disclaimer.
- Real us-atlas county/state geometry with winner/margin views, zoom controls, pointer tooltips, state keyboard controls, and an equivalent sortable state table. Selection exposes shares and modeled votes.
- 2016/2020/2024 returns, ACS education/race/income/age context, integer county votes rolled into 51 state/DC results, 538 electors, Maine/Nebraska splits, contingent outcomes and recount-range labels.
- Seeded browser worker, correlated uncertainty, multinomial choice, 1,000 Monte Carlo trials (250 on low-concurrency devices), state odds and tipping-point electoral unit. No simulation work on the server.
- Browser-only OpenRouter PKCE S256 + state verification, key-info validation, session storage by default, optional remembered key, explicit forgetting, free-model selector, bounded fallback/repair, maximum ten LLM attempts per profile+run pipeline.
- Retrieved-source-only profile prompts, strict Zod schemas, fictional treatment of unverified names, minor/abusive-input screening, plain-text rendering. Screening is deliberately conservative and is not a comprehensive moderation service.
- Numeric narrative validation scoped per state, deterministic recap fallback, gzip/base64url fragment sharing, JSON export/import and deterministic replay without credentials. Links over approximately 8 KB lose narrative first, then require file export.
- Same-origin Pages endpoints, Turnstile verification, capped/timed upstream reads, per-name KV caching, one-source lazy national refresh, best-effort lock, quota-failure fallback, strict CSP and `/api/*`-only function routes.

## Model and data assumptions

See `public/data/provenance.json` for URLs and attribution. Dataset version `2024-v1` is pinned in share payloads; changing the data requires a new version and migration or a new deployment. Sharing replays against the deployment's version; a server retaining old data versions is not implemented.

County prior = 80% 2024 + 15% 2020 + 5% 2016 two-party share; missing years use the latest available record. The engine uses a logit utility: party prior, ideology distance, favorability, recognition, controversy, home state, demographic appeal, and scenario environment. Independent baseline utility starts at a 2.5% protest propensity and is constrained by the same bounded inputs. Multiple candidates of a party compete for that coalition. These are transparent heuristic coefficients, not fitted causal effects.

Noise is shared nationally, regionally, by education, and within each state, plus a small local component. Turnout is modeled as a bounded change in historical vote totals, not a measured eligible-voter turnout percentage. Candidate-specific enthusiasm is approximated through favorability; a fitted participation model is not included. ACS population characteristics must not be interpreted as individual voting behavior. Race/income are retained context, not causal voting effects; urbanicity remains neutral and religion is omitted.

**Geography limitations:** 3,113 modeled county/statewide units. Alaska uses the official statewide 2024 total as one unit because election districts do not align to boroughs; boroughs are uncolored in county mode. Connecticut uses eight historical counties and does not misjoin new ACS planning-region estimates; those demographic fields are neutral. Other geometry/return mismatches fall back to 2020 where available or remain uncolored. Maine/Nebraska districts have real 2024 priors, with modeled state swing applied independently; this is not an exact county/precinct district crosswalk. Maine certificate totals include listed candidates and may omit write-ins.

The displayed outcome is one seeded draw, not the median. The tipping point includes separate ME/NE district electors. Tied electoral outcomes remain contingent: the House would choose the president by state delegation under the constitutional process; this app does not simulate that vote. The 0.5% label is a descriptive threshold, not a claim about statutory recount rules.

## Sources and licenses

| Data                    | Source and license                                                                                                                                                                                                                                                                                                 |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Historical county votes | [MIT MEDSL](https://doi.org/10.7910/DVN/VOQCHQ), CC0, via [Matt Stiles compilation](https://github.com/stiles/presidential-elections), repository CC0                                                                                                                                                              |
| 2024 county votes       | Same Stiles compilation, which attributes Dave Leip. Repository CC0 does not independently establish rights to every upstream source; derived factual results are shipped with attribution. Direct MIT V20 download returned HTTP 400 during this build.                                                           |
| County geometry         | [us-atlas 3.0.1](https://github.com/topojson/us-atlas), ISC, Census-derived                                                                                                                                                                                                                                        |
| ACS county fields       | [Census 2023 ACS five-year bulk tables](https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/), US government public-domain data                                                                                                                                             |
| ME/NE district facts    | [Maine certificate](https://www.presidency.ucsb.edu/sites/default/files/election-maps/2024/ascertainment-maine.pdf), [Nebraska canvass](https://sos.nebraska.gov/sites/default/files/doc/elections/2024/2024%20General%20Canvass%20Book.pdf); attributed election facts, no blanket license asserted for documents |
| Electors                | [National Archives 2024](https://www.archives.gov/electoral-college/2024), 2020 apportionment                                                                                                                                                                                                                      |
| Wikipedia summaries     | Wikipedia CC BY-SA text, source links retained; only short excerpts supplied to the browser                                                                                                                                                                                                                        |
| News/public posts       | Google News RSS, GDELT, Bluesky public search; short attributed samples, upstream availability and terms apply                                                                                                                                                                                                     |

The Census JSON API returned a “Missing Key” HTML page; official keyless bulk tables were used instead. `scripts/import-acs.ts` extracts county rows from downloaded B15003, B03002, B19013, B01001 `.dat` files in `work/raw/`. The small normalized `acs-source.json` is committed; the 400+ MB raw files are not needed for build/rebuild. To refresh election data explicitly: `npm run build-data -- --refresh`; review provenance and diffs before committing. Nothing runs this refresh in Cloudflare builds.

## Live data and fallback behavior

`GET /api/environment` reads two independently timestamped KV entries. At most one stale source refreshes in `waitUntil`; stale values return immediately. Google News and GDELT have six-hour TTLs. A 60-second KV lock is best effort and non-atomic. Failed refreshes keep the last good value until its 24-hour retention expires. No cron or durable scheduler is used. Concurrent edge locations can race; this is not a strict distributed rate limiter. GDELT is never retried in a burst within an invocation.

Headlines contribute only to an explicitly labeled attention sample. **Approval, generic ballot, economy and issue salience are neutral manual scenario defaults, not inferred from headlines.** No licensed automated polling source is configured; `polling.json` contains null observed values. Update that file with source URL/date/permission notes and deliberately revise the bundled default when valid polling data is available. The optional LLM national signal digest is omitted. The UI can override every scenario value.

`GET /api/candidate-signals?name=…` requires a fresh `X-Turnstile-Token`; validation occurs even on a cache hit. It retrieves Wikipedia, Google News, Bluesky and Wikimedia pageviews. Post counts are **sample counts**, not total platform volume. Reddit RSS has an adapter but is disabled in the request path because cloud access is unreliable. X is a disabled paid-API stub; optional credential names are placeholders only and never used. No per-IP rate limiter is claimed.

Failures: stale KV → bundled snapshot → neutral constants, with a visible banner. Candidate lookup failure yields an explicitly hypothetical profile. Invalid/unavailable LLM output never changes votes and falls back to a numeric-safe deterministic recap. KV quota errors are swallowed; uncached service can still hit upstream quotas, so fallback is essential.

## Free-tier verification (checked 2026-10-29)

“No charge while staying on free products” is a deployment design, **not a guarantee that vendors will keep these terms forever**.

| Assumption                                       | Verified/current behavior                                                                                                                                                                                                                                                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 100,000 Functions requests/day                   | [Pages Functions](https://developers.cloudflare.com/pages/functions/pricing/): shared with Workers Free, resets midnight UTC; static requests free/unlimited                                                                                                                                            |
| 10 ms CPU / invocation; 50 subrequests           | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/): design target retained; actual deployed CPU must be measured, local timings do not establish Cloudflare CPU billing                                                                                                       |
| KV 100,000 reads / 1,000 writes per day          | [KV limits](https://developers.cloudflare.com/kv/platform/limits/): confirmed; 1 write/second per key and 1 GB storage also matter                                                                                                                                                                      |
| 500 builds/month; 20,000 files; 25 MiB per asset | [Pages limits](https://developers.cloudflare.com/pages/platform/limits/): confirmed; committed data avoids pipeline work during builds                                                                                                                                                                  |
| OpenRouter free models                           | [Official free models](https://openrouter.ai/collections/free-models): 20/minute, 50/day for unfunded accounts; purchasing $10 credits raises daily allowance to 1,000 (docs note a $9 threshold to accommodate fees). Failed attempts count. Purchasing credits is optional, not required by this app. |

Free `:free` defaults were read from the live `/api/v1/models` endpoint and saved in `public/data/models.json`. `openrouter/free` is the default free router. Models can disappear; refresh the list periodically. No paid model is accepted by the client. Model providers' privacy policies apply to material sent directly to OpenRouter.

When Functions exhaust their allowance, data requests fail and the static client falls back. When KV exhausts reads/writes, endpoint helpers fail open and skip caching. Builds stop at their limit; the last deployed static app remains usable. Static-only scenario runs consume no Function calls except the optional environment request on initial load. Turnstile itself is free; configure only that secret. No paid upgrades are enabled by this repository.

**Cache API:** deliberately unused. No authenticated Cloudflare account was available, so a `pages.dev` deployment test could not be performed. Do not rely on Cache API behavior based on local Wrangler success. HTTP browser caching and KV are sufficient for the implemented fallback path. A production cache probe is an outstanding verification item.

## Measured budget and test coverage

`public/data/benchmark.json` records a local Node benchmark: roughly 2.2 seconds for 1,000 trials across 3,113 units on this machine. Browser worker flow was exercised through the UI. Mobile latency varies; low-concurrency devices use 250 trials. No server calls or KV operations occur during engine computation.

| Operation                          | Function requests |       Upstream fetches |     KV reads / writes |
| ---------------------------------- | ----------------: | ---------------------: | --------------------: |
| Initial environment (fresh)        |                 1 |                      0 |                 2 / 0 |
| Environment with one stale refresh |                 1 |                     ≤1 | ≤3 / ≤2 (lock + data) |
| Candidate cache hit                |                 1 |     1 Turnstile verify |                 1 / 0 |
| Candidate cold lookup              |                 1 | ≤5 including Turnstile |                 1 / 1 |
| Simulation, narrative, sharing     |                 0 |         0 from backend |                 0 / 0 |

A two-candidate cold run costs up to 3 Functions, 11 upstream fetches **spread across three invocations**, 5 KV reads and 4 writes. Six candidates: up to 7 Functions, 31 upstream fetches across seven invocations, 9 reads and 8 writes. No invocation approaches 50 subrequests. The LLM uses 0 calls offline; up to 6 profiles + 2 recap/repair attempts, with at most 10 shared attempts including profile retries. Browser HTTP cache can reduce these figures. These counts are measured/asserted with mocked upstreams; production CPU ≤10 ms is **not proven**.

Tests cover 538 electors, 270/contingent handling, ME/NE splits, deterministic seeds, county/state totals, broad swing-state plausibility, multi-candidate probabilities, Zod rejection, narrative numbers, compressed replay, PKCE/state, session/remember/forget, credential request isolation, model retries, Function ceilings, body caps, quota failure and cross-origin refusal. Build checks verify CSP and asset constraints. These are smoke/calibration bounds, not historical backtesting or a statistical validation of win probabilities.

## Deploy to Cloudflare Pages for $0

1. Create a free Cloudflare account. Stay on Workers Free; do not enable paid Workers or any storage product beyond KV. No custom domain is required.
2. Install dependencies and authenticate locally: `npm ci`, then `npx wrangler login`.
3. Create a KV namespace: `npx wrangler kv namespace create SIGNALS`. Replace the all-zero placeholder `id` in `wrangler.toml` with the returned namespace ID. It is not a secret. Only the `SIGNALS` binding is used.
4. Create a free **managed Turnstile** widget for your intended `civic-atlas.pages.dev` hostname (choose your own available Pages project name). Set public build variable `VITE_TURNSTILE_SITE_KEY` to its site key. Do not use dev dummy keys in production.
5. Create Pages project: `npx wrangler pages project create civic-atlas --production-branch main` (or use the dashboard Git integration).
6. Add the only required server secret: `npx wrangler pages secret put TURNSTILE_SECRET_KEY --project-name civic-atlas`. Paste the Turnstile secret interactively. **Never add an OpenRouter secret.**
7. Build/deploy: `VITE_TURNSTILE_SITE_KEY=YOUR_PUBLIC_SITE_KEY npm run build`, then `npx wrangler pages deploy dist --project-name civic-atlas`. Alternatively connect this repo to Pages: build command `npm run build`, output `dist`, Node version 22+, public site-key build variable, KV binding `SIGNALS`, and the Turnstile secret in production/preview environments as appropriate.
8. Verify the returned `*.pages.dev` URL: CSP headers, fallback banner, one hypothetical run, real Turnstile validation, OAuth callback and manual-key validation using your own browser key. No custom domain, standalone Worker, Cron Trigger, Durable Object, R2, D1, Queue, Workers AI or Analytics Engine is configured.
9. Confirm account plan is Free and no paid product is enabled. Test exhausted/unavailable endpoints with the browser's offline/network controls; the static app must still offer bundled scenarios. Measure actual Functions CPU in Cloudflare before claiming the 10 ms target.

No production deployment was made in this session: `wrangler whoami` reported unauthenticated. Real OAuth/Turnstile credentials and production CPU/cache behavior remain unverified. Local Pages compilation/serving and mocked authentication tests passed.

## Security notes

No third-party fonts/scripts/trackers except the explicit Turnstile script/frame. LLM and web text render as text, never raw HTML. Key storage defaults to sessionStorage; remembered localStorage is opt-in and any same-origin script could access it, which is why CSP and no trackers matter. Share JSON is strictly allowlisted, rejects unexpected keys and credential-like text, and has compressed/decompressed size bounds. PKCE verifier expires after ten minutes, state is checked, and callback query parameters are removed before the exchange.

Do not put private personal data in a candidate profile: result links are portable scenario data, not encrypted storage. Unknown names are always fictional; verified profiles are limited to adult public figures from retrieved sources. This is not a comprehensive abuse classifier or a factual biography service.
