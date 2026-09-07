---
created: 2026-09-06
title: "Steam's refreshInstallState has zero call sites under Tauri — install badges never reconcile with the live Steam client"
area: tauri-sidecar
status: RESOLVED
severity: major
source: "quick-260906-gej, sweep FINDINGS.md section A row A5"
files:
  # CORRECTED 2026-09-08 (quick-260908-ci2): the original list below named
  # `src/backend/storeManagers/steam/games.ts`, which is WRONG -- `refreshInstallState()` is
  # defined on `SteamLibraryManager` in `src/backend/storeManagers/steam/library.ts:1354`, not
  # in `games.ts`. Corrected rather than silently edited, and the three files the fix itself
  # touches are added below.
  - src/backend/storeManagers/steam/library.ts:1354 (SteamLibraryManager.refreshInstallState() definition, D-01/D-02 rationale)
  - src-tauri/src/main.rs (set_focus()/.focused(true) calls, no focus listener forwarded -- NOW FIXED, see Resolution)
  - src/common/types/sidecarTransport.ts (fix: adds the SHELL_WINDOW_FOCUSED channel constant)
  - src/backend/sidecar/steamFlowRegistration.ts (fix: consumes SHELL_WINDOW_FOCUSED, calls refreshInstallState)
  - src/backend/sidecar/__tests__/flowRegistrationCensus.test.ts (fix: updated send-channel count for the new registration)
resolves_phase: quick-260908-ci2
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

## Resolution

Fixed by quick task **260908-ci2** (2026-09-08), across three commits on
`fix/steam-native-install-stability`.

**Mechanism.** A new shell-originated `send` channel, `shellWindowFocused`, restores the
Electron `mainWindow.on('focus', ...)` trigger this todo names, end to end:

1. Rust's `.setup()` attaches a SECOND `on_window_event` listener to the main window (additive —
   confirmed via `tauri-runtime-wry`'s own dispatcher, does not disturb the pre-existing
   `exitToTray` close handler on the same window). It matches `WindowEvent::Focused(true)` ONLY
   (never `Focused(false)` — a blur carries nothing worth reacting to), resolves the sidecar
   state, and spawns a thread that writes a `{ kind: "send", channel: SHELL_WINDOW_FOCUSED }`
   frame via `write_frame`, fail-soft (`eprintln!` WARN) on every degraded path.
2. `src/common/types/sidecarTransport.ts` declares the shared `SHELL_WINDOW_FOCUSED` constant
   (`"shellWindowFocused"`) both sides reference, so the two ends cannot silently disagree on the
   name.
3. `steamFlowRegistration.ts`'s `registerSteamFlows()` registers a THIRD flow —
   `ipcMain.on(SHELL_WINDOW_FOCUSED, ...)` (fire-and-forget, never `ipcMain.handle`) — that calls
   `libraryManagerMap['steam']?.refreshInstallState?.().catch(...)`, preserving both Electron-era
   optional chains and guarding the returned promise against an unhandled rejection.

**Channel name.** `shellWindowFocused` (`common/types/sidecarTransport.ts`'s
`SHELL_WINDOW_FOCUSED`).

**The four gates** (`src/backend/sidecar/__tests__/steamFocusRefreshWire.test.ts`), each
RED-proven at a constant commit before being made to pass:
- **T-A** — cross-side name pin: the Rust `const SHELL_WINDOW_FOCUSED: &str = "...";` declaration
  is asserted against a string templated FROM the TS constant, on a two-stage comment-stripped
  read of `main.rs`, plus a self-check that the stripping is live.
- **T-B** — producer wiring pin: the `Focused(true)` window-event block references both
  `SHELL_WINDOW_FOCUSED` and `write_frame`; `Focused(false)` is absent from that block.
- **T-C** — consumer over the REAL transport (`startRpcServer` + `PassThrough`, never calling the
  registered listener directly): a real `send` frame on `SHELL_WINDOW_FOCUSED` calls
  `refreshInstallState` exactly once via `dispatchSend`/`listenerRegistry`.
- **T-D** — fail-soft consumer: a rejecting `refreshInstallState` is caught (no unhandled
  rejection), and a subsequent frame is still processed afterward.

**Commits:**
- `7f88bf856` — `feat(quick-260908-ci2): add shellWindowFocused send channel, shell producer`
  (Task 1: `sidecarTransport.ts` constant, `main.rs` const mirror + producer block)
- `d2de69532` — `feat(quick-260908-ci2): consume shellWindowFocused, broaden census regex`
  (Task 2: `steamFlowRegistration.ts` consumer, `flowRegistrationCensus.test.ts` count + a
  deviation fix broadening the census gate's regex, which was blind to identifier-based channel
  registrations)
- Task 3 (this correction + closure, plus `steamFocusRefreshWire.test.ts` and a narrowing fix to
  a pre-existing, now-overbroad negative gate in `tauriShellSource.test.ts` that the new,
  unrelated `WindowEvent::Focused(true)` literal tripped) — see the phase SUMMARY for the exact
  commit hash.

## Human Verification

**Status: UNRUN.** The code defect this todo names (zero call sites, no shell event forwarded)
is closed and proven by the four automated gates above. What remains is a live end-to-end
confirmation on real Steam client state, which requires a real Steam install/uninstall on the
operator's own machine — no executor can perform this. This is NOT claimed as measured; recording
it here as the sanctioned disposition for the closed todo, not as cover for skipping any
automated gate.

**Exact gesture, so it can be run without re-derivation:**
1. Launch `pnpm tauri:dev` with `GAMELIB_TRACE_SEND=1` set.
2. With GameLib signed in to Steam, install or uninstall a title in the Steam client itself
   (outside GameLib).
3. Click away from the GameLib window and back (so it loses and regains focus).
4. **Discharge condition:** the shell's stderr trace shows the `[shell] send-trace: window focus
   refresh entered for 'shellWindowFocused'` line, AND the install/uninstall badge on the
   affected title flips to match the live Steam state — without triggering a full library
   refresh.
