---
phase: 47-migrate-aggregated-store-search-from-cheapshark-to-istherean
plan: 14
subsystem: store-embed/tauri-shell
tags: [gap-closure, G-47-9, store-embed, wry, offline, crash-fix]
requires: [47-13]
provides:
  - store_embed_take_nav_events never reads Webview::url() on an embed that has not delivered a Finished
  - page_finished flag on StoreEmbedState (note_page_finished / has_finished_page / reset_for_new_webview)
  - take_nav_events_with drain core with an injected URL reader, plus five store_embed_finished_guard regression tests
  - offline variant of StoreEmbedTimeoutBanner (notice row with Try again) driven by uiState.connectivity
affects: []
tech-stack:
  added: []
  patterns: [inject the native-handle read into a pure drain core so a crash guard is testable without a webview, reuse the existing in-flow notice row instead of a new grid child]
key-files:
  created:
    - .planning/todos/pending/2026-11-18-store-embed-online-first-load-failure-surface.md
    - .planning/todos/pending/2026-11-18-invite-picker-url-read-panics-on-failed-first-load.md
  modified:
    - src-tauri/src/store_embed/state.rs
    - src-tauri/src/store_embed/controls.rs
    - src-tauri/src/store_embed/open.rs
    - src/frontend/screens/WebView/useStoreEmbedHost.ts
    - src/frontend/screens/WebView/components/StoreEmbedTimeoutBanner.tsx
    - src/frontend/screens/WebView/components/__tests__/StoreEmbedTimeoutBanner.test.tsx
    - src/frontend/screens/WebView/index.tsx
    - public/locales/en/translation.json
key-decisions:
  - 'The guard keys on an observed PageLoadEvent::Finished for the current webview, not on current_url(), because prepare_open seeds a home entry before the first load'
  - 'The offline surface reuses the existing WebView__embedNoticeRow (no new grid track) and takes precedence over the timeout variant'
  - 'Online first-load failure stays a blank embed (no crash); a generic failed-load signal needs a new nav-event wire field, filed as a pending todo'
requirements-completed: [PRICE-03]
duration: 40min
completed: 2026-11-18
status: complete
actuals:
  tokens: 14000
  tasks: 2
  commits: 2
plan_head_before: d4278f3a483547c6e9ceed2e5c85b5317de8f987
plan_head_after: e83918c2f974d61815bcb9e5d488c5444b99e91e
---

# Phase 47 Plan 14: Offline Stores tab crash (G-47-9) Summary

The 250 ms nav-event drain now reads the store embed's live URL only after that webview has delivered a page Finished, so a first navigation that failed offline can no longer panic the shell, and the store screen shows an offline notice row with Try again while connectivity is offline.

## What was built

**Task 1 (commit 0d42ad32b, tracer).** `StoreEmbedState` gained a private `page_finished` flag with `note_page_finished`, `has_finished_page` and `reset_for_new_webview`; `clear()` resets it, while `select_store`, `prepare_open`, `push`, `push_at` and the history arms leave it alone (a store switch reuses the same webview). `open.rs` notes it in the `on_page_load` Finished arm before `push_at` (so a suppressed Finished still counts) and resets it on the create path before `add_child`. `controls.rs` extracted `take_nav_events_with(state, read_live_url)`, which snapshots generation and the flag under one lock, drops the lock, and calls the reader only when the flag is set; the single live `.url()` read is the closure passed from `store_embed_take_nav_events`. The doc comment now records the wry 0.55.1 nil-URL unwrap and why the guard cannot key on `current_url()`. The stale drain comment in `useStoreEmbedHost.ts` was corrected (comment only).

**Task 2 (commit e83918c2f).** `StoreEmbedTimeoutBanner` takes `offline` and `onTryAgain`; offline renders the same notice row with "You're offline, so this store can't load." and a single Try again action (fail-soft disabled without a handler) and wins over `timedOut`. `index.tsx` reads `uiState.connectivity`, adds `retryEmbedLoad` (calls `onNavigate(currentUrl)`, no new `openExternalUrl`), and passes both props. Strings added to `translation.json` after `controls`. Two todos filed (online first-load failure surface; invite-picker `existing.url()` latent panic).

## Verification

- `cargo test --bin gamelib-shell store_embed_finished_guard`: 5 passed. Full `gamelib-shell` suite: 494 passed, 0 failed.
- Guard sensitivity: temporarily forcing the reader to always run (`if true || finished_page`) made `store_embed_finished_guard_drain_skips_url_read_before_finished` fail while the other four passed; reverted before commit. (Tests and guard were written together, so this mutation check is the RED evidence rather than a separate failing-test commit.)
- Clippy ratchet (toolchain 1.99.1): PASS. The one `state.rs` `type_complexity` entry is the pre-existing `parked` field, not new.
- `pnpm codecheck`, `pnpm lint:src` (0 errors, ceilings PASS), `pnpm planning-gates` (12/12), `backendDiCeilings` + `hardcodedStringGate` Meta tests, `pnpm i18n-churn-guard` (clean, run after the commit), `prettier --check` over the three `.tsx`/`.ts` paths written: all green. `.rs` files, `translation.json` and the `.planning` todos are prettier-ignored or have no parser; style matched by hand.
- Whole Frontend jest project: 6121 passed, 1 failed (see Deferred Issues); every `src/frontend/screens/WebView` test passes, with no `jest.mock` count change.
- Acceptance greps: `note_page_finished()` 1 and `reset_for_new_webview()` 1 in open.rs; `has_finished_page()` present in controls.rs; non-comment `.url()` count in controls.rs is 1; stale comment count 0; `webview.offline.message` 1; `unavailable.open-in-browser` 1; `timedOut={embedHost.loadTimedOut}` 1; `openExternalUrl` 3; `"tryAgain": "Try again"` 1.
- Phase 81's files (`main.rs`, `rust_dispatch.rs`, `ipc_contract.rs`, `steampoll_dispatch.rs`) untouched; cargo compiled cleanly, so no blocker from that session.

## Deviations from Plan

None - plan executed as written.

Notes, not deviations:

- `uiState.connectivity` defaults to `{ status: 'offline' }` until the sidecar sync lands (`uiState.ts:67`), so the offline row can show briefly at startup before the first connectivity snapshot arrives. The plan specified wiring to this status as written; if the live gate shows a flash, seed or gate on a "known" state in a follow-up.
- Task 2's `<human-check>` (macOS live offline run: no crash, notice row shown, Try again recovers, no new `gamelib-shell-panic.log` entry) is not run here; it needs a rebuilt `pnpm tauri:dev` and a live Wi-Fi toggle, and is harvested at the end of the phase.

## Deferred Issues

`src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` "render-site census" expects 34 `.is-link` text sites and finds 39 (extra hits in `Accessibility/ThemeEditor/index.tsx` and others). It is in no file this plan touched and fails independently, so it was not fixed here.

## Known Stubs

None.

## Threat Flags

None. T-47-49 is mitigated by the Finished guard and its regression tests; no new endpoints, channels, auth paths or log lines (the drain log stays host-only).

## Self-Check: PASSED

Files present: state.rs, controls.rs, open.rs, useStoreEmbedHost.ts, StoreEmbedTimeoutBanner.tsx and its test, index.tsx, translation.json, both pending todos. Commits `0d42ad32b` and `e83918c2f` are ancestors of HEAD.
