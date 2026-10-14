---
created: 2026-10-14T00:00:00.000Z
title: "G-50-16's loadTimedOut latch fix needs a macOS live-gate re-run of UAT Item 16"
area: epic-embed
severity: major
platform: macos
ready: live-gate
found_by: "quick-261014-rso, following the Phase 50 live gate's G-50-16 gap (50-UAT.md Item 16): the backend timeout literal fired 3 times but StoreEmbedTimeoutBanner never became visible"
files:
  - src/frontend/screens/WebView/useStoreEmbedHost.ts
  - src-tauri/src/epic_embed_state.rs
  - src-tauri/src/macos_epic_embed.rs
  - .planning/phases/50-epic-store-in-app-on-macos-a-rust-managed-raw-wkwebview-subv/50-UAT.md
---

## What to re-run

UAT Item 16 (`50-UAT.md:443-446`): a scoped `/etc/hosts` blackhole of `store.epicgames.com` and
`www.epicgames.com` (reverted immediately after the arm), opening Stores -> Epic, watching the
slot through the first 45s window.

## What now has to be observed

- `StoreEmbedTimeoutBanner` appears, with Reload and Open in browser both visible on one row at
  the app's minimum window width (UI-SPEC E3). This is the fix: the renderer's GAP-D drain now
  merges `loadTimedOut` stickily across every event in a 250ms batch instead of applying only the
  last event, and a navigation failure in `macos_epic_embed.rs` no longer clears the raise.
- The three UI-SPEC items the original failure left unverified (`50-UAT.md`'s
  `also_unverified_because_of_this` list under `G-50-16`):
  - Reload and Open in browser on one row at minimum window width
  - the longest-of-49-translations single-row shape for the banner message
  - the recovery half: revert the hosts entry, click Reload, store repaints

## Recovery half

Revert the hosts entry, click Reload in the banner, and confirm the store repaints normally
(D-05/D-07/D-08).

## Known hazard from this project's own live-gate history

A running `pnpm tauri:dev` relaunches on every commit and will consume an as-found fixture before
the arm starts. Ask the operator to quit any live dev instance before this run.

## Why this is a todo and not closed in-plan

The code fix landed in quick task 261014-rso (two jest properties, one of them observed-red before
the fix, plus four new Rust unit tests), but no code-only verification can observe whether the
banner actually paints on a real hung Epic store -- that needs the macOS live gate. `G-50-16`
stays `status: failed` in `50-UAT.md` until this re-run lands a result.
