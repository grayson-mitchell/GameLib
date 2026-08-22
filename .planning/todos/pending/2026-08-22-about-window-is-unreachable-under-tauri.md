---
created: 2026-08-22T16:56:00.000Z
title: "The About window has no entry point under Tauri — tauriShowAboutWindow is fully implemented and cannot be invoked by any user action"
area: tauri
severity: low
found_by: "Phase 34.1 UAT item 8, reachability check before running the gate, 2026-08-22"
source: ".planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-HUMAN-UAT.md item 8b"
files:
  - src/preload/api/tauriChildWindows.ts
  - src-tauri/src/main.rs
  - src/backend/tray_icon/tray_icon.ts
  - public/about.html
---

## Problem

`tauriShowAboutWindow` (`tauriChildWindows.ts:98`) is fully implemented — it resolves the version
via a bounded `getHeroicVersion()` race, reuses an existing `about` window if present, and loads
the first-party static `public/about.html` (which exists, 1909 bytes). It is also **unreachable**.

The only caller of `showAboutWindow` anywhere in the tree is
`src/backend/tray_icon/tray_icon.ts:124` — the **Electron** tray menu. There is no frontend call
site. Tauri's tray deliberately omits it; `main.rs:18` and `:5852` both record:

> "Deliberately out of scope: recent-games submenu, About/Reload/Debug, the macOS dock menu"

So under Tauri no user action can invoke it. Phase 34.1's UAT item 8 asked an operator to "open
the About window (from wherever it's triggered in the UI)" — there is nowhere.

## Why this matters beyond the missing window

The item also carried the only live check on the **About version string**, which item 10e passed
under Electron and which was the user-visible symptom of the T-34.1-17 fix (`getHeroicVersion`
reporting `0.0.0` because `process.env.npm_package_version` is unset in the packaged SEA sidecar).
Under Tauri that string has never been observed, and cannot be until an entry point exists.

Note that even with an entry point, `pnpm tauri:dev` **cannot** falsify the `0.0.0` mode: dev runs
a plain bundled `sidecar.js` with the env var set, so pre-fix and post-fix code both report the
right version. Only a packaged build discriminates. Current expected string: `0.7.0`.

## Same class as the vacuous 'releases' pass

Phase 34.1's item 10f was recorded as part of a passing item for six weeks while
`getLatestReleases()` had already returned `[]` unconditionally since before the session that
recorded it. This is the same shape found one step earlier — before an operator was sent to look
rather than after. The ledger's own warning ("check source-level reachability before sending an
operator to look at anything") is what caught it.

## Fix

Add an About entry point to the Tauri build — the natural place is the tray menu, matching where
Electron put it (`tray_icon.ts:124`), alongside the existing "Show GameLib" / "Quit GameLib"
items. Then UAT item 8b becomes runnable and should be moved back out of
`human_verification_resolved` in `34.1-VERIFICATION.md`, where it currently sits recorded as
STRUCTURALLY UNREACHABLE rather than passed.
