---
phase: quick-261102-sk8
plan: 01
status: complete
requirements: [TODO-2026-11-02-amazon-store-no-back-navigation-after-claim]
key-files:
  modified: [src-tauri/src/main.rs]
commits: [db6236f99, f8782dbbf]
---

# Quick 261102-sk8: Store embed records SPA same-document navigations

Added `StoreEmbedState::observe_live_url` (pure reconcile) plus `page_loading` / `nav_generation`
tracking. `store_embed_take_nav_events(app)` now reads the embed's live URL via native
`Webview::url()` with no lock held, then reconciles under the lock. `on_page_load` Started calls
`begin_page_load()`. Host-only diagnostic log on a recorded navigation. No page-side JS.

## TDD

- RED (db6236f99): 11 new tests added first; build failed with E0599 (`begin_page_load`,
  `nav_generation`, `observe_live_url` missing), i.e. tests could not pass before the implementation.
- GREEN (f8782dbbf): `cargo test --bin gamelib-shell` 405 passed, 0 failed, 2 ignored (56 store_embed tests).
  `cargo fmt -- --check` clean. Only `src-tauri/src/main.rs` changed.

## Back/forward check (plan step 4)

Read-only confirmation: `store_embed_back/forward` still call `go_back()/go_forward()` then
`webview.navigate(recorded_url)`, a full load of the recorded SPA URL; its Finished push is
consumed by suppress, so no double entry.

## Deviations

None. Note: the RED commit does not compile on its own (intended TDD state).

## Live retest

1. Stop and restart `tauri dev` (a Rust change rebuilds the shell; per memory, `tauri dev` does not rebuild the sidecar, but no sidecar code changed here).
2. Open `/store/amazon`, wait for the grid, then open a game/claim view.
3. Within about a quarter second, the embed's Back becomes enabled. Shell log shows `store_embed: same-document navigation recorded host=gaming.amazon.com`.
4. Press Back: the grid returns. Press Forward: the claim view returns. Repeat Back twice in a row from a deeper view and confirm no ping-pong.
5. Use the page's own close/back control in a claim view if it has one: the embed's Forward becomes enabled and Back does not point at the claim view.
6. Regression: on `/store/steam` and `/store/gog`, click into a product page, then Back and Forward. Each moves one step, with no duplicate entries (one Back press per page). Also check a Steam app URL that redirects to its slug form.
7. Switch Amazon -> GOG -> Amazon: Back on GOG never reaches Amazon pages.
