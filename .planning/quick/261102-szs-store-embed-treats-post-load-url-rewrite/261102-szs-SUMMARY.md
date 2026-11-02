---
phase: quick-261102-szs
plan: 01
status: complete-pending-live-retest
commits:
  - 9e182b84a test (RED, compile-fail)
  - 6d0d11343 fix settle window (main.rs)
  - 5e78b0252 fix luna.amazon.com in AMAZON_HOSTS
files_modified:
  - src-tauri/src/main.rs
  - src/frontend/screens/WebView/storeExitRefresh.ts
  - src/frontend/screens/WebView/__tests__/storeExitRefresh.test.ts
---

# Quick 261102-szs: store embed post-landing URL rewrite settle window

## What changed
- `StoreEmbedState` gains `settle_until`, `push_at`, `observe_live_url_at`, `StoreEmbedHistoryChange` (recorded|replaced|moved) and `STORE_EMBED_LANDING_SETTLE` (3 s). A suppressed Finished (back/forward/reload/navigate landing) opens the window; within it a new URL (same-origin via the drain, any origin via a Finished push) replaces `history[cursor]` in place, collapsing an adjacent duplicate. Legacy `push`/`observe_live_url` keep sk8 semantics.
- Shell logs now `same-document navigation <outcome> host=...` and `page load replaced host=...` (host only).
- `luna.amazon.com` added to `AMAZON_HOSTS` (exact-host, https; lookalikes rejected).

## Verification
- RED: Rust new tests failed to compile (missing push_at etc.); jest luna yes rows failed (2) before the fix.
- GREEN: `cargo test --bin gamelib-shell store_embed` 62 passed (6 new settle tests + all pre-existing, unmodified); `cargo fmt -- --check` clean; jest storeExitRefresh 93 passed; prettier --check clean on both paths (not ignored).
- Not run: full cargo test suite, live app.

## Deviations
None. Note: running jest with the file path argument matched more than this suite (4 failures pre-fix instead of 2); the `--testPathPattern storeExitRefresh` run is the authoritative one.

## Live retest (operator; `tauri dev` rebuilds the Rust shell automatically on save -- no sidecar change, so no sidecar rebuild needed)
1. /store/amazon: wait for the grid, open a claim. Back enables.
2. Press Back repeatedly: returns to the grid, then Back disables. Shell log shows `store_embed: same-document navigation replaced host=luna.amazon.com` (or `page load replaced`) after the Back, not a stream of `recorded`.
3. Press Forward: the claim view returns.
4. If a Back still yields `recorded` right after landing, note the delay -- the rewrite is slower than STORE_EMBED_LANDING_SETTLE.
5. Regression: /store/steam and /store/gog -- click a product, Back, Forward, one step each; switch Amazon -> GOG -> Amazon, GOG's Back never reaches Amazon pages.
