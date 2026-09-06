---
created: 2026-09-06
title: "Steam's refreshInstallState has zero call sites under Tauri — install badges never reconcile with the live Steam client"
area: tauri-sidecar
status: OPEN
severity: major
source: "quick-260906-gej, sweep FINDINGS.md section A row A5"
files:
  - src/backend/storeManagers/steam/games.ts (refreshInstallState definition, D-01/D-02 rationale, 8 unit tests)
  - src-tauri/src/main.rs (set_focus()/.focused(true) calls, no focus listener forwarded)
resolves_phase: null
---

# Steam's refreshInstallState has zero call sites under Tauri — install badges never reconcile with the live Steam client

## The unported side effect

Old `main.ts` wired `mainWindow.on('focus', () => libraryManagerMap['steam']?.refreshInstallState?.())`
(`main.ts:272-274`, D-01/D-02), so every time the window regained focus, Steam install state was
reconciled against live ACF data.

## Bundle-level evidence

Evidence taken against `build/main/sidecar.js` (1351269 bytes, 2026-09-06 10:27):

`refreshInstallState` in the bundle: `:15063` (doc comment) and `:15102` (the method definition).
**Zero call sites.**

## Consequence

Steam install badges never reconcile against live ACF data while GameLib runs. Install/uninstall
performed in the Steam client itself is invisible until a full library refresh. The method, its
D-01/D-02 rationale, and its 8 unit tests all survive — only the trigger is gone. No Tauri
window-focus event is wired to the sidecar at all: `src-tauri/src/main.rs` has `set_focus()` /
`.focused(true)` calls but forwards no focus **listener** to the sidecar.

This is one of the two findings from this sweep (with A1) that has a live user-visible
consequence on the operator's own macOS machine — the operator's platform — which is the reason
FINDINGS.md ranks it `major` rather than `medium`.

## Fix sketch

The trigger is gone at two levels, not one: there is no sidecar-side call site AND no
shell-side focus event forwarded from Tauri to the sidecar in the first place. A fix needs a
shell-side window-focus listener in `src-tauri/src/main.rs` (or equivalent Tauri event) forwarded
to the sidecar, before the sidecar-side `refreshInstallState()` call can be reinstated. Fixing
only the sidecar side (e.g. adding a call site with no shell event to trigger it) would not
restore the original behavior.
