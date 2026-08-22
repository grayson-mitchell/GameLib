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

> **Two independent resolutions.** This todo was closed twice, on branches that had already
> diverged: quick `260822-tv4` added a Settings-panel row on `main` (2026-08-22), and Phase 35
> plan 06 added a Tauri tray item on `fix/steam-native-install-stability` (2026-08-28). Neither
> author could see the other. Both are recorded below in the order they happened, unedited.
> Note the 08-22 entry argues the tray route was infeasible and out of scope; 35-06 then did it
> anyway and it worked, so that reasoning is superseded on the facts — but it is left standing
> because it is why the Settings row exists at all, and the two entry points are complementary,
> not duplicates. Merged 2026-09-02 by quick `260902-ucw`.

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
