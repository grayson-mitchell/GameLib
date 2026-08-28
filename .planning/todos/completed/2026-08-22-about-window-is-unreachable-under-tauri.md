---
created: 2026-08-22T16:56:00.000Z
title: "The About window has no entry point under Tauri — tauriShowAboutWindow is fully implemented and cannot be invoked by any user action"
area: tauri
severity: low
status: completed
completed: 2026-08-28
completed_by: "Phase 35 plan 06 task 1 (tray About item) + task 2 (static chain confirmation)"
resolves_phase: "35"
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


---

## 2026-08-28 CLOSED (Phase 35 plan 06, D-06/REQ-35-04)

Closed on a **static caller path plus a pending live check** — stated that way deliberately,
because the two are not the same thing and this todo exists precisely because a fully-implemented
function was assumed reachable for six weeks without anyone tracing it.

**What landed.** Plan 35-06 task 1 (`d2ec066ae`) added an `about` item to the Tauri tray, exactly
where this todo's own Fix section said to put it and exactly where Electron put it
(`tray_icon.ts:124`). `tauriShowAboutWindow` now has its first caller under Tauri.

**The caller chain, every link with a line number, re-confirmed at close:**

| # | Step | Location |
|---|------|----------|
| 1 | tray menu event, id `"about"` | `src-tauri/src/main.rs:6730` |
| 2 | `open_about_window_from_tray()` | `src-tauri/src/main.rs:602` |
| 3 | `window.eval("window.api?.showAboutWindow?.()")` | `src-tauri/src/main.rs:609` |
| 4 | `window.api = api` (Tauri has no preload/contextBridge) | `src/preload/tauriAttach.ts:67` |
| 5 | default export spreads `...Helpers` | `src/preload/api/index.ts:15` |
| 6 | `showAboutWindow = () => isTauri() ? tauriShowAboutWindow() : showAboutWindowIpc()` | `src/preload/api/helpers.ts:17` |
| 7 | `tauriShowAboutWindow` | `src/preload/api/tauriChildWindows.ts:139` |

**Why an eval and not an IPC channel.** Nothing in the renderer listens for an INBOUND
`showAboutWindow` push — it has only ever been an outbound call
(`makeListenerCaller('showAboutWindow')`), and `appShellFlowRegistration.ts`'s own docstring
records `showAboutWindow` as explicitly NOT registered sidecar-side. Emitting a
`FRONTEND_MESSAGE_EVENT` on that channel would therefore have been a send with **no registered
listener** — a live silent no-op, a shape this repo has shipped before. The evaluated script is a
fixed literal with zero interpolation and is fully optional-chained.

**NOT yet verified live.** Plan 35-06 task 3 is a blocking human gate that has not run. Its step 3
opens the About window from the tray and reads the version number. Until that passes, this todo is
closed on a traced source-level caller path — which is strictly more than it had before, and
strictly less than an observation.

**Deliberately NOT done here, flagged instead.** This todo's Fix section also asks that UAT item 8b
be moved back out of `human_verification_resolved` in `34.1-VERIFICATION.md`, where it sits
recorded as STRUCTURALLY UNREACHABLE. Plan 35-06 did not touch that file. Editing a closed phase's
verification record to say an item is now runnable — before the gate that would run it has
actually run — would be writing a forward-dated claim into a historical record. That edit should
follow 35-06 task 3's live result, not precede it.
