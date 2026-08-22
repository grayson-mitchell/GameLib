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

## Resolution (2026-08-22, quick task `260822-tv4`)

**Entry point added — but NOT the one this todo proposed.** The About window is reached from an
**About row in the Settings tier-2 nav panel** (between Documentation and Ko-fi), not from the
Tauri tray menu.

### Why not the tray

1. **The Rust tray cannot call the code this todo wanted to make reachable.**
   `tauriShowAboutWindow` is preload/renderer code. A Rust tray item would have to either
   duplicate the `WebviewWindow` construction in `main.rs` — leaving `tauriShowAboutWindow` still
   dead, so the defect would have survived its own fix — or add Rust→frontend event plumbing that
   does not exist. Both are far past a `severity: low` todo.
2. **Phase 34.1 declared the tray About item out of scope in writing** (`main.rs:18`, `:5856`).
   The Tauri tray is a deliberately bounded two-item Show/Quit menu. Reopening that boundary is a
   phase decision, not a quick task. (Checked and worth recording: the `REQ-34.1-07` scope-boundary
   gate in `tauriShellSource.test.ts:350` bans `recent`/`dock`/`Reload`/`Debug`/`openDevTools` in
   `main.rs` — it does **not** ban `About`. The gate was not the obstacle; reasons 1 and 2 were.)
3. **The nav row is strictly more reachable** — all three platforms, primary window, both shells.
   `helpers.ts:17` already routes `showAboutWindow()` to `tauriShowAboutWindow()` under Tauri and
   to the IPC listener under Electron, so no new routing was added.

### Label

Minted a new fork-owned key `gamelib:about.navLabel` rather than reusing the already-translated
`tray.about`. Several of that key's shipped translations still carry the pre-fork brand name
(`de` = "Über Heroic", `ja` = "Heroicについて"), which has no business on a new GameLib surface.
The Electron tray keeps `tray.about` untouched.

### NOT closed by this change

The **version-string** half of this todo stands. `pnpm tauri:dev` still cannot falsify the `0.0.0`
mode — dev runs a plain bundled `sidecar.js` with `npm_package_version` set, so pre-fix and
post-fix code both report the right version. Only a packaged build discriminates. That caveat was
carried INTO the reopened UAT item's text (`34.1-VERIFICATION.md`, `human_verification`) rather
than dropped, so the next operator cannot read a dev-run pass as proof of the version string.

### Follow-on state

`34.1-VERIFICATION.md` item 8b moved OUT of `human_verification_resolved` and back into
`human_verification`; `status:` flipped `passed` → `human_needed` to match. Confirmed via
`gsd-sdk query audit-uat` (not by reading the file): 34.1 reports exactly 1 open item, named.
It is **open and runnable, not passed** — nobody has yet watched the window open under Tauri.
