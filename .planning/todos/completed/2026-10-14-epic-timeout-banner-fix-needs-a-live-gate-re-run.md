---
created: 2026-10-14T00:00:00.000Z
title: "G-50-16's loadTimedOut latch fix needs a macOS live-gate re-run of UAT Item 16"
area: epic-embed
severity: major
platform: macos
ready: live-gate
status: CLOSED
resolves_phase: 50
closed_by: "Live gate Launch 5, 2026-10-14T21:05-21:30Z — the banner was OBSERVED on real macOS hardware. Residual sub-criteria carried to two new todos rather than left here."
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

## 2026-10-14 — CLOSED: the banner was observed on hardware

**Launch 5, dev pid 40514, ~21:05-21:30Z.** The question this todo existed to answer — *does
`StoreEmbedTimeoutBanner` actually paint?* — is answered **yes**.

Provenance was tied by symbol table, not timestamp: `nm` found **2** `epic_embed_clears_load_timeout`
symbols in `target/debug/gamelib-shell`, mtime 21:01:26, postdating both fix commits (20:17:31,
20:20:14). (`strings` finds 0 — the symbol is in the symbol table, not the string table. A zero
there is not a missing fix.)

**Method change that mattered:** the hosts blackhole was applied **before** the app launched, not
mid-session. Launch 3's result named Epic's cached SPA 404 as a second, independent way the banner
could be correct-but-invisible — a main-frame finish legitimately clears it per D-07. Blocking first
left no cached page to serve, removing that confound instead of arguing about it.

**Observed:**

- the pinned literal `load timed out past 45s` (`terminal.log:59`)
- the banner visible — icon, message, `Reload` and `Open in browser` on one row
  (`live-gate-261014-item16/item16-banner-visible.png`)
- **the banner surviving a later `didFailProvisionalNavigation -- The request timed out`**
  (`terminal.log:60`), which is precisely the regression the Rust half targets
- the banner rendering *while the slot behind it was suppressed*, empirically confirming G-50-16's
  reasoned-from-source `ruled_out` claim that suppression was never the explanation

**Carried forward, not closed here** — two new todos, because neither is about this fix:

- `2026-10-14-store-embed-suppression-sticks-with-no-visible-holder.md` — the recovery half
  (revert hosts → click Reload → store repaints) is STILL unobserved. The click landed; the embed
  was suppressed, and a hidden subview cannot paint. Same defect that confounded UAT Item 3.
- `2026-10-14-store-embed-banner-actions-clip-and-the-app-declares-no-minimum-window-width.md` —
  found during this run: `Open in browser` clips at 600px, and the app declares no minimum width,
  so UI-SPEC E3's criterion has no defined test point.

The longest-of-49-translations shape was **not run** — it needs a language switch and is not
scoreable by eye.
