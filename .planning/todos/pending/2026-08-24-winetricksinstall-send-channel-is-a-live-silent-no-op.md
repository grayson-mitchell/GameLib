---
created: 2026-08-24T00:00:00.000Z
title: "`winetricksInstall` is a LIVE SILENT NO-OP under Tauri — the send channel is registered, bundled and declared, yet clicking Install produces nothing in either log sink"
area: sidecar-ipc
status: OPEN
severity: major
files:
  - src/backend/sidecar/wineToolsFlowRegistration.ts
  - src/frontend/components/UI/Winetricks/index.tsx
  - src/frontend/components/UI/Winetricks/WinetricksSearch/index.tsx
  - src/preload/ipc.ts
  - src/preload/tauriTransport.ts
---

## Observed

Found by the operator on 2026-08-24 driving **step 4 of `34.6-LIVE-GATE.md`**, on commit
`c13b9e398`, app PID 21682, sidecar bundle built 11:51:07 and launched 11:51:16.

Opening the Winetricks panel works: `winetricksAvailable` and `winetricksInstalled` (both
**invoke**-kind) resolve with real data, the component list populates, and search returns rows.

Clicking **Install** on the `corefonts` row produces **NOTHING**:

- no `[GAMELIB_SIDECAR_SEND_HANDLER] winetricksInstall` line (the D-11 observable)
- no `winetricks -q corefonts` invocation
- no error, in `gamelib.log` **or** in the shell/stderr scrollback sink
- `gamelib.log`'s mtime stayed at **19:37:40** — 14 minutes stale at the time of checking, i.e.
  not one byte was written after the click
- `grep -c winetricksInstall` across BOTH sinks returns **0**

The app remained alive on the same PID throughout.

## Why the obvious explanations are already excluded

- **Not unported.** `ipcMain.on('winetricksInstall', ...)` is registered in
  `wineToolsFlowRegistration.ts`, in the SAME function and immediately after the two
  `ipcMain.handle` registrations that demonstrably work. There is no early return between them.
- **Not missing from the build.** The running `build/main/sidecar.js` contains `winetricksInstall`
  (registration, observable and failure-logger references present).
- **Not a stale build.** Bundle mtime 11:51:07 precedes app start 11:51:16, and the port commit
  `04f62f3c6` is an ancestor of the running commit.
- **Not a missing type/channel declaration.** `winetricksInstall` is declared in
  `SyncIPCFunctions` (`src/common/types/ipc.ts:137`).
- **Not a Rust allowlist drop.** `sidecar_send` (`src-tauri/src/main.rs:436`) performs no channel
  filtering — it builds a frame and writes it.
- **Not the `declined` guard.** `install()` early-returns when `declined` is true, but `declined`
  also gates the entire render branch containing the search bar. The operator SAW the search bar
  and Install rows, so `declined` was false.
- **Not the wrong button.** An earlier attempt did hit "Open Winetricks GUI" (`callTool`), which
  logged `winetricks -q --gui`. The corefonts attempt logged nothing at all, which is a different
  and stronger signal.

## Why this matters more than one broken button

`winetricksInstall` is **send**-kind. Per this repo's own hard-won lesson, an unwired send channel
fails **completely silently** — `dispatchSend` finds zero listeners and returns, and Rust's
`sidecar_send` has no pending/timeout machinery. It can NEVER emit `UNPORTED_CHANNEL_MARKER`.

Consequently **every automated check in Phase 34.6 passes against this defect**:

- jest asserts the channel is present in `listenerRegistry` — it is; that is registration, not transport
- the "no `UNPORTED_CHANNEL_MARKER`" assertion is vacuous for send-kind by construction
- `flowRegistrationCensus`, `invokeReturnValueSweep` and `runnerSliceRegistration` all count and
  classify it correctly — counting is not exercising

Only the **D-11 observable** (`logSendHandlerReached`, added by plan 34.6-05 precisely for this
hazard) could detect it, and only when driven live. It did. This is the observable earning its
existence on its first real outing.

Shape precedent: [[sidecar-send-channels-fail-silently]] — the Phase 30 Steam logout button
presented identically (button does nothing, zero console output) and cost a full debug session.

## Not yet determined

Root cause lies somewhere between the React `onClick` and `dispatchSend`. Candidates, none
confirmed:

1. the click handler is not bound as expected (`WinetricksSearchBar`'s local `install()` clears
   the search — which the operator DID observe — then calls `onInstallClicked`; the search
   clearing proves the SearchBar handler ran, but not that the parent's call reached the preload)
2. `makeListenerCaller` -> `tauriSend` drops the call
3. `tauriTransport.send()`'s `tauriInvoke(SIDECAR_SEND, ...)` rejects and the `.catch` routes to
   `window.api.logError` — itself a send channel — and is lost (the file's own recursion-guard
   comment flags this class of loss)
4. `dispatchSend` fails to match the listener despite registration

Candidate 3 is worth checking FIRST: if `logError` is also broken, every send-channel rejection in
the app is being silently discarded, which would make this defect one instance of a much larger
blind spot.

## Related live observation, same session, same class

The stderr sink (NOT `gamelib.log`) also carried:

```
[sidecarRpc] listener for 'setSetting' threw:
  TypeError: Cannot use 'in' operator to search for 'wineVersion' in undefined
```

`setSetting` is also send-kind. A listener throwing inside a send handler surfaced in **neither**
`gamelib.log` nor the UI. Likely fired when the operator changed a game's Wine version. May share
a root cause; should be triaged alongside.

## Notes

No `resolves_phase:` — this is NOT resolved by Phase 34.6 and must not be auto-closed by it.
Phase 34.6 correctly *registered* the channel; the failure is in reaching that registration at
runtime. Step 4 of `34.6-LIVE-GATE.md` is recorded FAIL on this evidence.

Related: [[sidecar-send-channels-fail-silently]] · [[preload-send-catch-regression-r01]]
