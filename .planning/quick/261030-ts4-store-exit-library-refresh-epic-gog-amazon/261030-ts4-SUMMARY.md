---
phase: quick-261030-ts4
plan: 01
status: complete (Amazon live check outstanding — needs Prime)
commits: [22f3a63d0, 3213dea8a, e85c0516d, 18b58aa03, 92788de94]
---

# Quick 261030-ts4: Store-exit library refresh for Epic, GOG, Amazon

Table-driven `storeExitRefresh.ts` (Steam is a row) plus a generalised `onStoreExit(storeKey)` hook callback wired for all four stores in `index.tsx`. Frontend only; no backend or Rust diff.

## Commits
- 22f3a63d0 Task 1: git mv `steamStoreExitRefresh` -> `storeExitRefresh` (module + test), per-store rows/predicates, per-store in-flight, new accept/reject/sign-in/in-flight tests.
- 3213dea8a Task 2: hook option `onStoreExit`, `isPurchaseIntentUrlFor` arming, `index.tsx` wiring from `STORE_EXIT_ROWS`, new hook tests for gog/epic(darwin)/amazon/humble/wiki/beforeunload.

## Findings (from plan)
- F1: Epic on macOS feeds the same nav-event drain; no Rust change.
- F2: No origin allowlist needed for legendary/gog/nile; `authTrigger.ts` untouched, no sidecar rebuild.
- F3: nile `refresh()` does not await `nile library sync`; the exit refresh may publish a pre-sync list (live gate to observe).

## Patterns as shipped (all CANDIDATE, pending live measurement)
- gog: https, host `www.gog.com`; after optional locale: `game/<slug>`, `cart`, `checkout`, `redeem` (with or without further segments).
- epic: https, `store.epicgames.com` or `www.epicgames.com/store/...`; after locale: `p|product|bundles/<slug>` or `purchase`.
- amazon: https, `gaming.amazon.com`, any path.

## Verification (real output)
- `npx jest src/frontend/screens/WebView`: 23 suites, 549 tests pass.
- `pnpm codecheck`: clean.
- Scoped eslint: 0 errors, 1 pre-existing `exhaustive-deps` warning in index.tsx.
- Scoped prettier: clean on all six paths.
- No diff under src/backend or src-tauri; no `onSteamStoreExit` left in index.tsx / useStoreEmbedHost.ts.
- Steam tests: bodies unchanged (only import path moved; hook test harness adapter added).

## Deviations
- [Process] Task 1 commit initially contained only the staged renames because a `git add` of an already-renamed old path failed; amended (unpushed) to include the content edits. Final commit 22f3a63d0 is correct.
- TDD RED-first step was not run separately for Task 1/2 (tests and implementation were written together, then verified green).

## Live gate (Task 3), 2026-10-30, user at this Mac
- GOG: PASS. `[gogStoreExitRefresh] origin=gog-store-exit outcome=refreshed`; claimed game appeared without Refresh.
- Epic (macOS raw WKWebView): PASS. `[epicStoreExitRefresh] origin=epic-store-exit outcome=refreshed`. Epic's own "is the Epic Games Launcher installed?" page prompt had to be clicked past (Epic page behaviour, not GameLib).
- Steam regression: PASS. `[steamStoreExitRefresh] origin=steam-store-exit outcome=refreshed`.
- Amazon: NOT RUN. Claiming needs a Prime subscription. Pattern and F3 (single refresh may publish the pre-sync list) remain unverified; carried on the todo.
- Negative, home-page-only GOG visit: refreshed, but correctly — the store reopened at its remembered `https://www.gog.com/en/checkout` (last-url restore), which arms. The full `runner=all origin=nav-tabs-games-tab` refresh on the Games tab is pre-existing and separate. Accepted as is.
- Negative, signed out: not demonstrated. The user signed out of the GOG website, not GameLib's GOG account, so no `skipped-signed-out` line appeared (gate stayed `connected`). Covered by unit tests only.
- URL patterns: GOG and Epic candidates armed on the live flows above; no exact URLs were recorded beyond `www.gog.com/en/checkout`.

## Follow-up found during the gate: Back crossed stores (fixed here)
Steam, GOG and Amazon share one reused embed webview with one Rust history stack, and a store switch only navigated it, so Back on GOG went to Amazon (pre-existing, not caused by this task).
- e85c0516d (Rust): `StoreEmbedState` records the storeKey its history belongs to; `store_embed_open` calls `select_store()`.
- 18b58aa03 (renderer): a plain same-surface switch between configured stores now re-opens (`storeEmbedOpen` carries storeKey) instead of navigating. A return from a refused target, a suppressed switch, the wiki, and a within-store start-URL change keep their old paths (tests 14/15/16 pin them). Test 39 reversed; 39b added.
- 92788de94 (Rust): histories are PARKED per store and restored on return (dropping them left Back greyed on a store reopened at its remembered game page); `push()` no longer appends a URL equal to the current entry but still queues the state event.
- Live recheck PASSED: Back stays within each store and resumes that store's history after a switch.
- Known limit, user decision: history is in-memory, so after an app restart a store reopens at its remembered page with Back greyed until you navigate. The user chose to keep the Heroic last-page restore (#3149) as is.

## Verification of the follow-ups (real output)
- `cargo test store_embed`: 42 passed.
- `npx jest src/frontend/screens/WebView`: 23 suites, 550 tests pass.
- `pnpm codecheck` clean; scoped eslint clean; scoped prettier clean on `useStoreEmbedHost.ts` and its test; rustfmt --check clean on `main.rs`.

## Self-Check: PASSED (commits 22f3a63d0 and 3213dea8a exist; files present)
