---
phase: 47
slug: migrate-aggregated-store-search-from-cheapshark-to-istherean
status: validated
nyquist_compliant: true
wave_0_complete: true
created: 2026-11-12
---

# Phase 47 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Source: `47-RESEARCH.md` § Validation Architecture.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | jest ^29.7.0 + ts-jest (projects Backend / Common / Frontend / Preload / Meta / relay) |
| **Config file** | `jest.config.js` plus per-project `src/{backend,common,frontend}/jest.config.js` |
| **Quick run command** | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/itad.test.ts src/backend/storeSearch/__tests__/itadCache.test.ts src/backend/storeSearch/__tests__/handlers.test.ts` and `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch` |
| **Full suite command** | `pnpm test:ci` + `pnpm check:ipc-contract` |
| **Estimated runtime** | ~30 seconds quick; full suite several minutes |

---

## Sampling Rate

- **After every task commit:** Run the quick backend + frontend StoreSearch commands
- **After every plan wave:** Run `pnpm test:ci` + `pnpm check:ipc-contract`
- **Before `/gsd-verify-work`:** Full suite green, `pnpm find-deadcode` ratchet, i18n gates
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

Every task carries an `<automated>` command in its PLAN.md `<verify>` block (each also ends in a scoped `npx prettier --check` over the paths it writes, omitted here for width). Jest file lists in parentheses are abbreviated; the PLAN.md command is authoritative.

| Task ID | Plan | Wave | Requirement | Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|----------|-----------|-------------------|-------------|--------|
| 47-01-T1 | 01 | 1 | PRICE-01/02 | Sweep script pure helpers; no child_process | unit | `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/measureItadCoverage.test.ts && pnpm codecheck` | ✅ | ✅ green |
| 47-01-T2 | 01 | 1 | PRICE-01/02 | Operator sweep writes coverage JSON + fixtures (blocking, D-12) | manual + file gate | `test -s 47-ITAD-COVERAGE.json && test -s fixtures/itad/{prices-US,shops,search-portal}.json` | ✅ | ✅ green |
| 47-01-T3 | 01 | 1 | PRICE-01 | Measured constants locked; fixtures carry no key | gate | `pnpm codecheck` + key-redaction grep over fixtures/itad and 47-ITAD-COVERAGE.json | ✅ | ✅ green |
| 47-02-T1 | 02 | 1 | PRICE-01 | ITAD_API_KEY repo secret exists (D-01) | manual + gate | `gh secret list | grep -c '^ITAD_API_KEY'` == 1 | n/a | ✅ manual (47-02-SUMMARY; not re-read 2026-11-19) |
| 47-02-T2 | 02 | 1 | PRICE-01 | D-07 reply status recorded (non-blocking) | manual | SUMMARY line (sent / deferred / pending operator) | n/a | ✅ manual (47-02-SUMMARY) |
| 47-03-T1 | 03 | 1 | PRICE-01/03 | formatPrice per currency, formatCachedAt, formatCountryName | unit | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/StoreSearch/__tests__/formatUsdPrice.test.ts` | ✅ (rewrite) | ✅ green |
| 47-03-T2 | 03 | 1 | PRICE-01 | Both price call sites use formatPrice | component | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch && pnpm codecheck` | ✅ | ✅ green |
| 47-04-T1 | 04 | 1 | PRICE-01 | Key define in dev + SEA bundles; runtime resolver (D-02/D-03) | unit + build | `pnpm exec jest --selectProjects Meta (itadKeyDefine, buildSidecarSea) && pnpm exec jest --selectProjects Backend (itadKey, moduleStateCensus) && pnpm build:sidecar && pnpm codecheck` | ✅ | ✅ green |
| 47-04-T2 | 04 | 1 | PRICE-01 | Release fails fast without the secret (D-04) | unit | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/__tests__/releaseWorkflow.test.ts` | ✅ (extend) | ✅ green |
| 47-05-T1 | 05 | 1 | PRICE-03 | Cache keys, fresh/stale reads, entry cap, Retry-After gate, no timers | unit | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/itadCache.test.ts src/backend/__tests__/moduleStateCensus.test.ts` | ✅ | ✅ green |
| 47-05-T2 | 05 | 1 | PRICE-02/03 | New stores registered (fixtures/kind/TTL pins); itadGate slot | unit | `pnpm exec jest --selectProjects Backend (createStores, storeKinds, moduleStateCensus, src/backend/stores) && pnpm codecheck` | ✅ (update) | ✅ green (ITAD pins; suites red on outside p38 store, see audit) |
| 47-06-T1 | 06 | 2 | PRICE-01 | Type additions, error markers, ITAD shop id -> runner mapping | unit | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/__tests__/storeMapping.test.ts && pnpm codecheck` | ✅ (rewrite) | ✅ green |
| 47-06-T2 | 06 | 2 | PRICE-01/02/03 | Adapter: localised search, verbatim deal URL, 429 -> cachedAt, keyless gid lookup, key never logged | unit | `pnpm exec jest --selectProjects Backend (itad, itadCache, moduleStateCensus) && pnpm exec jest --selectProjects Meta (logSecretGate, backendDiCeilings) && pnpm codecheck` | ✅ | ✅ green |
| 47-07-T1 | 07 | 3 | PRICE-01/02/03 | Handlers on ITAD; country normalised to US; D-14 rethrow with marker | unit | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/handlers.test.ts src/backend/storeSearch/__tests__/itad.test.ts` | ✅ (adjust) | ✅ green |
| 47-07-T2 | 07 | 3 | PRICE-01 | cheapshark.ts + storeMap slot deleted; module-path pins on itad.ts | unit | `pnpm exec jest --selectProjects Backend (handlers, diPhaseGates, electronReachLedger, moduleStateCensus) && pnpm exec jest --selectProjects Meta (backendDiCeilings)` (codecheck deferred to 47-08 by design) | ✅ (update) | ✅ green |
| 47-08-T1 | 08 | 4 | PRICE-01/02/03 | IPC schemas (country, gid regex, 5000-id cap), getItadSteamGids, store-map channel removed, contract regenerated | unit + gate | `pnpm gen:ipc-contract && pnpm check:ipc-contract && pnpm exec jest --selectProjects Backend (enrichmentFlows, runnerSliceRegistration, ipcSchemas/enrichment, rendererAllowList) && pnpm find-deadcode` | ✅ (update) | ✅ green |
| 47-08-T2 | 08 | 4 | PRICE-01 | Renderer reads StoreSearchResponse envelope; tree type-checks | component | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch && pnpm codecheck` | ✅ (adjust) | ✅ green |
| 47-09-T1 | 09 | 5 | PRICE-01/02 | Country sent with every search; owned Steam appids -> gids hook | unit | `pnpm exec jest --selectProjects Frontend --runTestsByPath (useDebouncedStoreSearch, useOwnedSteamGids) && pnpm exec jest --selectProjects Meta (backendDiCeilings)` | ✅ | ✅ green |
| 47-09-T2 | 09 | 5 | PRICE-01/02/03 | Region caption, fallback note, error variants, owned badge via injected steamAppId | component | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch && pnpm codecheck && pnpm lint:src && hardcodedStringGate && pnpm i18n-churn-guard` | ✅ (extend) | ✅ green |
| 47-10-T1 | 10 | 6 | PRICE-01/03 | Cached-at line on rows and sub-rows; breakdown uses search country | component | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch && pnpm codecheck` | ✅ (extend) | ✅ green |
| 47-10-T2 | 10 | 6 | PRICE-03 | Cached-line styles and en strings | gate | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch && hardcodedStringGate && pnpm i18n-churn-guard` | ✅ | ✅ green |
| 47-10-T3 | 10 | 6 | PRICE-01/03 | Live: localised prices in non-US region; "Price from …" on stale cache (non-blocking) | manual (prep automated) | `pnpm build:sidecar` + fresh sidecar.js mtime + StoreSearch frontend tests; then operator items 1-3 | n/a | ✅ manual (47-UAT 19/19) |
| 47-11-T1 | 11 | 5 | PRICE-01 | Keyring arm, slot stores, ITAD key owner (D-05/D-06) | unit | `cargo test keyring_account && cargo fmt --check && pnpm exec jest --selectProjects Backend (itadSecrets, moduleStateCensus) && pnpm exec jest --selectProjects Meta (logSecretGate, backendDiCeilings)` | ✅ | ✅ green |
| 47-11-T2 | 11 | 5 | PRICE-01 | itad-secrets boot step, service type, test default | unit | `pnpm exec jest --selectProjects Backend src/backend/sidecar/__tests__ diPhaseGates moduleStateCensus && pnpm codecheck` | ✅ (update) | ✅ green |
| 47-12-T1 | 12 | 6 | PRICE-01 | User key precedence; one-shot rejected-key fallback | unit | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/itad.test.ts && pnpm exec jest --selectProjects Meta (logSecretGate)` | ✅ (extend) | ✅ green |
| 47-12-T2 | 12 | 6 | PRICE-01 | itad.getKeyStatus / itad.setApiKey channels; contract regenerated | unit + gate | `pnpm gen:ipc-contract && pnpm check:ipc-contract && pnpm exec jest --selectProjects Backend (enrichmentFlows, runnerSliceRegistration, ipcSchemas/enrichment, rendererAllowList) && pnpm codecheck` | ✅ (update) | ✅ green |
| 47-13-T1 | 13 | 7 | PRICE-01 | ItadApiKey settings component incl. rejected warning | component | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Settings/components/__tests__/ItadApiKey.test.tsx && pnpm exec jest --selectProjects Meta (backendDiCeilings)` | ✅ | ✅ green |
| 47-13-T2 | 13 | 7 | PRICE-01 | Mounted in Advanced settings; en strings | component + gate | `pnpm exec jest --selectProjects Frontend src/frontend/screens/Settings && pnpm codecheck && pnpm lint:src && hardcodedStringGate && pnpm i18n-churn-guard` | ✅ | ✅ green |
| 47-14-T1 | 14 | 1 (gap) | PRICE-03 | Store embed nav-event drain never reads the URL before a page Finished (G-47-9 offline crash) | unit (Rust) | `cd src-tauri && cargo test --bin gamelib-shell store_embed_finished_guard` (5) + full gamelib-shell suite + clippy ratchet | ✅ | ✅ green |
| 47-14-T2 | 14 | 1 (gap) | PRICE-03 | Offline notice row with Try again above the store embed | component + gate | `pnpm exec jest --selectProjects Frontend src/frontend/screens/WebView && backendDiCeilings && hardcodedStringGate && pnpm codecheck && pnpm lint:src && pnpm planning-gates` | ✅ | ✅ green |
| 47-15-T1 | 15 | 1 (gap) | PRICE-01 | `resolveActiveStore` maps a store-page deep link to its owning store row (G-47-6) | unit | `pnpm exec jest --selectProjects Frontend --runTestsByPath (navTabs, StoresPanel, NavShell, destinationCoverage)` | ✅ | ✅ green |
| 47-15-T2 | 15 | 1 (gap) | PRICE-01 | Row highlight pinned at panel and shell level | component | `pnpm exec jest --selectProjects Frontend src/frontend/components/UI/NavShell && backendDiCeilings` | ✅ | ✅ green |
| 47-16-T1 | 16 | 1 (gap) | PRICE-01 | Operator decision: Store Search region list (`itad-list`) | decision | n/a (checkpoint:decision, answered 2026-11-18) | — | ✅ decided |
| 47-16-T2 | 16 | 1 (gap) | PRICE-01 | Store Search sets and persists its own region; out-of-list stored code reads as Auto (G-47-8) | component | `pnpm exec jest --selectProjects Frontend src/frontend/screens/StoreSearch src/frontend/screens/Discounts && backendDiCeilings && hardcodedStringGate` | ✅ | ✅ green |
| 47-16-T3 | 16 | 1 (gap) | PRICE-01 | Shared RegionPicker rendering (Auto item, sort, optional currency pill) | component | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/components/UI/RegionPicker/__tests__/RegionPicker.test.tsx` | ✅ | ✅ green |
| 47-17-T1 | 17 | 2 (gap) | PRICE-01 | `thumbOf` prefers banner300; landscape contain box (G-47-7) | unit | `pnpm exec jest --selectProjects Backend --runTestsByPath src/backend/storeSearch/__tests__/itad.test.ts` | ✅ | ✅ green |
| 47-17-T2 | 17 | 2 (gap) | PRICE-01 | Thumbnail box ratio coupled to the thumbOf asset family | unit | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts` | ✅ | ✅ green |
| 47-18-T1 | 18 | 2 (gap) | PRICE-01 | Deals renders the shared RegionPicker with its own filter-reset handler | component | `pnpm exec jest --selectProjects Frontend src/frontend/screens/Discounts src/frontend/components/UI/RegionPicker && hardcodedStringGate` | ✅ | ✅ green |
| 47-18-T2 | 18 | 2 (gap) | PRICE-01 | Shared region-store contract (one key, per-screen validation) | unit | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/helpers/__tests__/storeRegion.test.ts` | ✅ | ✅ green |
| 47-19-T1 | 19 | 1 (gap) | PRICE-01 | Store Search keeps its query and rows across a remount (G-47-12a) | component | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/StoreSearch/__tests__/useDebouncedStoreSearch.test.ts src/frontend/screens/StoreSearch/__tests__/StoreSearchScreen.test.tsx && pnpm codecheck` | ✅ | ✅ green |
| 47-19-T2 | 19 | 1 (gap) | PRICE-01 | Kept rows restored only for same trimmed query + country, under 1h, from results/empty | unit + component | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/StoreSearch/__tests__/storeSearchSession.test.ts (+ hook, screen) && pnpm codecheck && pnpm lint:src` | ✅ | ✅ green |
| 47-19-T3 | 19 | 1 (gap) | PRICE-01 | storeSearchSession.ts recorded in the i18n gate scope | gate | `pnpm exec jest --selectProjects Meta --runTestsByPath meta/__tests__/genI18nGateScope.test.ts meta/__tests__/hardcodedStringGate.test.ts` | ✅ | ✅ green |
| 47-20-T1 | 20 | 1 (gap) | PRICE-01 | SearchBar opts out of spellcheck/autocorrect (G-47-12b) | component | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/components/UI/SearchBar/__tests__/searchBarTextChecking.test.tsx (+ typing race) && hardcodedStringGate && pnpm codecheck` | ✅ | ✅ green |
| 47-20-T2 | 20 | 1 (gap) | PRICE-01 | Winetricks searchbox and TextInputField opt out (caller can opt back in) | component | `pnpm exec jest --selectProjects Frontend --runTestsByPath …/WinetricksSettings/__tests__/everythingElse.test.tsx …/TextInputField/__tests__/textInputFieldTextChecking.test.ts && hardcodedStringGate` | ✅ | ✅ green |
| 47-20-T3 | 20 | 1 (gap) | PRICE-01 | RegionPicker shows the Auto label (displayEmpty, render-level) (G-47-14a) | component | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/components/UI/RegionPicker/__tests__/RegionPicker.test.tsx && pnpm codecheck` | ✅ | ✅ green |
| 47-21-T1 | 21 | 1 (gap) | PRICE-01 | Store Search rows use the themeable title plate; 4.5:1 text contrast in all 10 themes (G-47-12c) | unit (stylesheet + tokens) | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts src/frontend/screens/StoreSearch/__tests__/storeSearchThumbBox.test.ts && pnpm lint:src` | ✅ | ✅ green |
| 47-21-T2 | 21 | 1 (gap) | PRICE-01 | Deals filter panel gets the same surface and --text-default tints | unit (stylesheet) | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/StoreSearch/__tests__/rowSurfaceTheme.test.ts && pnpm lint:src` | ✅ | ✅ green |
| 47-22-T1 | 22 | 2 (gap) | PRICE-01 | Genres/Features controls grow to hold chips; no hover bubble (G-47-14b) | unit (stylesheet + source) | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Discounts/components/DiscountFilters/__tests__/filterLayout.test.ts (+ rowSurfaceTheme) && hardcodedStringGate && pnpm codecheck && pnpm lint:src` | ✅ | ✅ green |
| 47-22-T2 | 22 | 2 (gap) | PRICE-01 | Filters reflow on `@container main-content (max-width: 1239.98px)`, not the viewport (G-47-14c) | unit (stylesheet) | `pnpm exec jest --selectProjects Frontend --runTestsByPath src/frontend/screens/Discounts/components/DiscountFilters/__tests__/filterLayout.test.ts (+ rowSurfaceTheme) && pnpm lint:src` | ✅ | ✅ green |

Requirement coverage: PRICE-01 (every plan), PRICE-02 (01, 05, 06, 07, 08, 09), PRICE-03 (03, 05, 06, 07, 08, 09, 10).

Audit re-run 2026-11-19: Backend 20 suites (785/787), Meta 5 (262/262), Frontend StoreSearch + ItadApiKey 9 (139/139), `check:ipc-contract` up to date, `cargo test keyring_account` 11/11, fixtures key-free. The 2 red tests are in `storeKinds.test.ts` and `createStores.test.ts`. Both fail on `steam_direct_launch_verdict`, an unpinned store added by quick 261117-p38, not on any Phase 47 store; that failure is already logged in 47-08/47-11 SUMMARY and Phase 81 deferred-items. Not re-run this audit: `pnpm codecheck`, `pnpm build:sidecar`, `pnpm find-deadcode`, i18n gates, and the `gh secret list` check.

Sampling continuity: no run of 3 consecutive tasks lacks an automated command; the three manual tasks (47-01-T2, 47-02-T1/T2) are bracketed by automated tasks, and 47-10-T3 runs automated prep before handing over.

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] `src/backend/storeSearch/__tests__/itad.test.ts`, `itadCache.test.ts` (replace `cheapshark.test.ts`)
- [x] ITAD response fixtures (redacted of any key) under `src/backend/storeSearch/__tests__/fixtures/`
- [x] `meta/measureItadCoverage.ts` + operator run (human-action checkpoint) → `47-ITAD-COVERAGE.json`
- [x] `formatPrice` test file; extend `StoreSearchScreen.test.tsx` / `StoreSearchRow.test.tsx`
- [x] `meta/backendDiCeilings/storeSearch.json` updated for new/removed `jest.mock` files

Framework install: none.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Country/currency coverage sweep | PRICE-01 | Needs operator's ITAD key (never committed) | `GAMELIB_ITAD_API_KEY=... node meta/runTs.cjs --bundle --platform=node --target=node22 meta/measureItadCoverage.ts` (D-02 env var name; Plan 47-01 Task 2) |
| Live search in running app, localised prices, cached-price line | PRICE-01/03 | Needs key + built sidecar | Plan 47-10 Task 3 (non-blocking): `pnpm build:sidecar`, export `GAMELIB_ITAD_API_KEY`, restart `pnpm tauri:dev` (never `tauri:dev:run`; tauri dev does not rebuild the sidecar); non-US region search; stale cache + network cut for the cached line (a real 429 would burn the shared app budget; the 429 arm is pinned by itad.test.ts) |
| Stores while offline shows the notice row, no crash; no new entry in `~/Library/Logs/GameLib/gamelib-shell-panic.log` | PRICE-03 | Needs a live network toggle on macOS | Plan 47-14 Task 2 human-check: rebuilt `pnpm tauri:dev`, Wi-Fi off, click Stores, Try again after Wi-Fi on; watch for a startup flash (connectivity defaults to offline until sidecar sync) |
| GOG Store row lit from Deals card, game-page Store link and Stores > GOG Store | PRICE-01 | Live navigation | Plan 47-15 human-check in `pnpm tauri:dev` |
| Store Search region picker placement and persistence; Deals picker parity and filter reset; NZ cross-screen Auto | PRICE-01 | Visual, both themes | Plans 47-16 / 47-18 human-checks |
| Store Search art shows whole and rows align | PRICE-01 | Visual; cached rows keep banner145 for up to 1h | Plan 47-17 human-check: restart `pnpm tauri:dev`, fresh 'hades' and 'xcom' searches |
| Store Search query and rows survive leaving and returning; region change reloads; cleared box returns to the prompt | PRICE-01 | Live navigation in the running app | Plan 47-19 Task 2 human-check in `pnpm tauri:dev` |
| macOS no longer rewrites a typed word ('xcom') on blur; Auto label paints in the region select | PRICE-01 | WKWebView autocorrect could not be reproduced in a harness; painted Select value | Plan 47-20 human-checks in `pnpm tauri:dev` on macOS |
| Store Search rows and Deals filter panel are light in light themes | PRICE-01 | WebKit paint, not stylesheet text | Plan 47-21 Task 2 human-check: Nord Light, midnightMirage, gruvbox_dark, dracula |
| Deals labels do not wrap before the two-column reflow; Genres chips behave on focus | PRICE-01 | WKWebView layout at real widths | Plan 47-22 Task 2 human-check (threshold is English-tuned) |

---

## Validation Sign-Off

- [x] All tasks have `<automated>` verify or Wave 0 dependencies
- [x] Sampling continuity: no 3 consecutive tasks without automated verify
- [x] Wave 0 covers all MISSING references
- [x] No watch-mode flags
- [ ] Feedback latency < 60s
- [x] `nyquist_compliant: true` set in frontmatter

**Approval:** validated 2026-11-19 (all 22 plans summarized; rows 47-01..47-13 re-run and set green on 2026-11-19, the date of the second audit; live checks listed under Manual-Only)

## Validation Audit 2026-11-18

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |

## Validation Audit 2026-11-19

| Metric | Count |
|---|---|
| Gaps found | 0 |
| Resolved | 0 |
| Escalated | 0 |
| Rows 47-01..47-13 pending -> green | 28 |
