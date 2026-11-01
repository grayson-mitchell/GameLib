---
phase: quick-261101-llf
plan: 01
subsystem: steam-bridge
tags: [tauri, window, capability, invite-picker, macos]
requires: []
provides:
  - bridge_invite_picker_open Rust arm and dedicated `bridge-invite` window
  - bridge-invite-picker.json capability (one label, four permissions)
  - picker-only renderer root (BridgeInvitePickerRoot)
affects: [steam-bridge, tauri-shell]
key-files:
  created:
    - src-tauri/capabilities/bridge-invite-picker.json
    - src/common/bridgeInvitePicker.ts
    - src/frontend/bridgeInvitePicker/BridgeInvitePickerRoot.tsx
  modified:
    - src-tauri/src/main.rs
    - src/backend/storeManagers/steam/bridge/helperProcess.ts
    - src/backend/platform/index.ts
    - src/frontend/index.tsx
    - src/preload/tauriAttach.ts
decisions:
  - "Bridge-notice dialogs keep main_window_raise and stay in the main window; only the invite picker moved"
metrics:
  completed: 2026-11-01
---

# Quick 261101-llf: Host the bridge invite picker in its own window

The invite picker now opens in a dedicated always-on-top, focused, 520x640 `bridge-invite` Tauri window instead of raising the whole main window. On macOS it re-activates the previously frontmost app (the game) when the picker closes.

## Commits

- 9331c186f: Task 1, Rust arm, capability, shell gates
- 7cebc8c99: Tasks 2 and 3 together (codecheck is red between them, as the plan allowed)

## Bridge-notice decision

Bridge-notice dialogs (route notice, setup, Go Offline) keep `main_window_raise` and render in the main window. They show before or around launch, are tied to main-window state, and nobody reported them. Only the invite picker, which opens mid-game, moved.

## Test and check results (real output)

- `cargo test --bin gamelib-shell bridge_invite`: 3 passed. `cargo check --bin gamelib-shell`: clean.
- jest capabilitiesDefault + tauriShellSource: 261 passed.
- jest helperProcess, backend/dialog, flowRegistrationCensus, src/preload, common/bridgeInvitePicker, BridgeInvitePickerRoot, SteamBridgeInvite store, SteamBridgeInviteDialog: 18 suites, 357 tests passed.
- `pnpm exec jest src/backend/__tests__ src/common`: 70 of 72 suites pass. Two failures, both pre-existing and unrelated to this change: `cargoFeatures.test.ts` (Cargo.lock crate-name pin; Cargo.lock untouched here) and `getDefaultLegendarySavePathRefresh.test.ts` (`platform_1.app.getAppPath is not a function`).
- `pnpm codecheck`: my `RUST_BRIDGE_INVITE_PICKER_OPEN` type error was fixed (channel added to the exported channel list). Remaining errors are two BigInt-literal TS2737 errors in `helperNetHarness.test.ts` (from commit 56f46ff7a, phase 58, not touched here), so `tsc --noEmit` still exits non-zero. `tsc -p tsconfig.meta.json --noEmit` is clean.
- `pnpm planning-gates`: 11/12. The failing gate is the STATE.md field-anchor check (`Plan: Not started`), pre-existing and orchestrator-owned. The todo-frontmatter gate passes.
- prettier --check: clean on every written TS/TSX/JSON path. The todo `.md` is prettier-ignored (`--file-info`), so it was omitted from the check.
- `graphify update .` run.

## Deviations from Plan

**1. [Rule 3 - Blocking] F-4 `always_on_top` gate in tauriShellSource.test.ts**
- The plan mandates `.always_on_top(true)` but an existing gate asserted the string never appears in main.rs, and the plan did not list it.
- Fix: the gate now exempts exactly the picker chain (found via `BRIDGE_INVITE_WINDOW_LABEL`), asserts exactly one occurrence inside it, and still asserts none anywhere else.

**2. [Rule 3 - Blocking] Close-handler slice locator**
- `closeHandlerSlice` takes the FIRST `WindowEvent::CloseRequested` substring in main.rs. The picker's handler sits earlier in the file, so the main-window quit-routing test read the wrong handler.
- Fix: the picker handler uses `use tauri::WindowEvent as PickerEvt` so it does not match. No gate was changed for this.

**3. Tasks 2 and 3 committed as one commit.** Removing the preload slot (Task 2) breaks GlobalState until Task 3, and the plan forbids a red codecheck commit.

**4. Tests are element-graph style, not rendered.** The frontend jest project has no jsdom, so `BridgeInvitePickerRoot.test.tsx` calls the component as a function with `useEffect`, the store and `getCurrentWindow` mocked. The "dialogDisplayed called on a visible render" assertion is covered by the existing SteamBridgeInviteDialog tests, not re-proven in the root test.

**5. `tauriAttach.ts`** reads `window.location?.search ?? ''` so the existing node-environment tests (window stub with no `location`) still pass.

Security-gate scope held: the capability has exactly the four listed permissions, no `remote`, no `webviews`. Nothing was widened. No permission failure was observed (the live gate is the first real webview load).

## Open live-gate items (operator-run, NOT claimed)

All seven items in the plan's success criteria remain open, including: only the picker comes forward (main open and main minimized), the Cmd+H-hidden case restores correctly, "Invite sent" and `display=confirmed` in the log, focus returns to the game on Close/Esc/red X, frameless OFF and ON, and a check for an ACL-denied bootstrap error. The macOS native-fullscreen-Space case is an observation only. Unproven by any automated test: the window build, focus behaviour, always-on-top float, and the AppKit activate/Cmd+H restore. The first load of the picker bundle also still needs a visual check (themes and Dialog styling in a non-main window were not exercised). The todo stays in `pending/` with a "Code landed" section carrying the checklist; it is uncommitted for the orchestrator.

## Self-Check: PASSED

Commits 9331c186f and 7cebc8c99 exist; created files verified present.
