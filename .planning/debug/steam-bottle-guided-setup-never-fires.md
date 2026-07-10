---
status: diagnosed
trigger: "Issue 2 (MAJOR, Test 3, MACSTEAM-04): macOS Install/Play on Windows-only Steam game goes straight to 'steam installing' — no consent dialog, no WineSelector engine choice. Guided-setup UI never appears."
created: 2026-07-11
updated: 2026-07-11
---

## Current Focus

hypothesis: isBottleEligible() gate returns false because platformsCaptured !== true, so backend never emits steamBottleSetupRequired and install falls through to the native steam://install path.
test: Trace emit gate in games.ts install()/launch() + verify full frontend IPC chain is intact.
expecting: If the frontend chain is intact and the emit is gated, the missing-dialog symptom is caused by the gate, not the frontend.
next_action: Return diagnosis (find_root_cause_only mode).

## Symptoms

expected: macOS Install/Play on a confirmed Windows-only Steam game opens a consent dialog, then WineSelector engine/version choice, then steamBottleProvision with polled progress — from every entry point.
actual: Button flips straight to "steam installing"; no consent dialog and no WineSelector ever render.
errors: none reported in symptom text
reproduction: On macOS, click Install/Play on a Windows-only Steam game from game-details button, library grid tile, or install modal.
started: Phase 17 guided flow (17-06) — first UAT of the guided flow.

## Evidence

- checked: full IPC chain for steamBottleSetupRequired
  found: backend sendFrontendMessage('steamBottleSetupRequired', {appName}) (ipc.ts:55-63 -> webContents.send) -> preload frontendListenerSlot('steamBottleSetupRequired') registers ipcRenderer.on, exported as handleSteamBottleSetupRequired (preload/api/steam.ts:21) and merged into window.api via ...Steam (preload/api/index.ts) -> GlobalState.componentDidMount registers window.api.handleSteamBottleSetupRequired(handleSteamBottleSetupRequiredSignal) (GlobalState.tsx:1061) -> handler opens zustand store (SteamBottleSetup.ts:30-35) -> <SteamBottleSetup/> mounted in App.tsx:97 renders consent Dialog when isOpen.
  implication: Frontend + preload + IPC types are fully and correctly wired. The guided UI WILL render if the signal fires.
- checked: backend emit gate in games.ts install() (368-398) and launch() (481-497)
  found: signal is emitted ONLY when this.isBottleEligible() && !isBottleProvisioned(). Otherwise install() falls to native steam://install branch (400-418) = shell.openExternal + startInstallPolling (which produces the ordinary 'installing' badge).
  implication: A false isBottleEligible() means NO emit and native install path — exactly the observed "no dialog + stuck installing".
- checked: isBottleEligible() (games.ts:446-450)
  found: returns isMac && meta?.platformsCaptured === true && meta?.is_mac_native === false. is_mac_native defaults false for Windows-only, so the deciding variable is platformsCaptured===true.
  implication: If platformsCaptured is not true at install time, the gate is false.
- checked: sole writer of platformsCaptured
  found: only set true inside fetchMetadataIfNeeded (games.ts:292-300) on a SUCCESSFUL Steam appdetails fetch. This is a throttled, fire-and-forget lazy fetch triggered by getGameInfo() (games.ts:190-191). Library sync (library.ts:227-271) only READS metadata, never sets platformsCaptured.
  implication: If the appdetails fetch fails (recent ETIMEDOUT/throttle history) or hasn't completed before the install click, platformsCaptured stays false -> gate false -> native install -> no dialog.
- checked: install-state signature
  found: bottle-eligible+unprovisioned path returns {status:'done', deferredToSetup:true} and downloadmanager/utils.ts:123 CLEARS the 'installing' badge to 'done'. Native path instead starts ACF polling that SETS/keeps 'installing'.
  implication: Observed "stuck/steam installing" is the native path's signature, confirming the gate returned false (not the deferred bottle path).

## Resolution

root_cause: isBottleEligible() D-11 gate (games.ts:446-450) requires platformsCaptured===true; that flag is only set by a successful appdetails fetch (games.ts:292-300), which is failing/racing. With the gate false, install()/launch() take the native steam:// branch and never call sendFrontendMessage('steamBottleSetupRequired'), so the (correctly wired) frontend guided-setup listener never fires.
fix: (deferred — diagnose-only)
verification: (deferred)
files_changed: []
