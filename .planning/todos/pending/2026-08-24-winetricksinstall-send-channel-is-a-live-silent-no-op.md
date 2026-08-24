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

## Narrowing measured 2026-08-24 (same app instance, PID 21682)

Four further exclusions, all measured rather than reasoned:

- **The send transport is NOT globally broken.** `frontendReady` — this phase's OTHER send-kind
  channel, which uses the SAME `makeListenerCaller` (`src/preload/api/misc.ts:93`), the SAME
  `tauriTransport.send()`, the SAME Rust `sidecar_send`, the SAME `ipcMain.on` stub and the SAME
  `dispatchSend` — **DID fire its D-11 observable in this very instance**:
  `(11:51:18) [INFO]: [Backend]: [GAMELIB_SIDECAR_SEND_HANDLER] frontendReady`.
  This REFUTES the worst case of candidate 3 below (every send-channel rejection being discarded
  app-wide) and substantially weakens candidates 2 and 4 as *general* failures.
- **`dispatchSend` demonstrably delivers ARGS to listeners.** The `setSetting` listener throwing
  `Cannot use 'in' operator to search for 'wineVersion' in undefined` proves the frame arrived,
  the listener was found, and it was invoked with an argument list — a send channel WITH args
  reaching its handler. So neither "send channels carry no args" nor "listeners are never matched"
  holds generally.
- **`window.api.winetricksInstall` EXISTS in the running preload bundle.** `build/preload/index.js`
  (mtime 11:51, i.e. the running build) contains both the wire literal `"winetricksInstall"` and
  the exposed api-object key `winetricksInstall:di`. So this is NOT an
  `undefined is not a function` TypeError in the renderer — a hypothesis that would otherwise have
  fit every symptom (renderer-console-only, zero bytes to `gamelib.log`, app survives).
- **The renderer's own `declined` guard is not implicated** — `WINETRICKS_DECLINED_GUARD` is
  `declined`, and `declined` false is what allows the search rows to render at all.

Consequently the defect is **specific to this one channel**, and lives in one of exactly two places:

  **(A)** `ipcMain.on('winetricksInstall', ...)` at `wineToolsFlowRegistration.ts:335` never
  EXECUTES at runtime, despite being present in the bundle — i.e. `registerWineToolsFlows()`
  aborts somewhere between the `ipcMain.handle` at `:316` and that line; or
  **(B)** the registration exists but the frame never reaches `dispatchSend` for this channel.

### RESOLVED 2026-08-24: it is (B). (A) is eliminated by construction.

`electronStub.ts:130`'s `ipcMain.on` is an unconditional three-line `Map` insert:

```ts
on(channel: string, listener: IpcListener): void {
  const listeners = listenerRegistry.get(channel) ?? []
  listeners.push(listener)
  listenerRegistry.set(channel, listeners)
}
```

It has no failure mode — no I/O, no validation, no throw. And `registerWineToolsFlows()`
demonstrably executed through `:316` (both `ipcMain.handle` registrations before the send one
resolve live with real data). A statement that cannot throw, on a path already proven to execute,
**must** have run. Therefore `listenerRegistry` DOES contain `winetricksInstall`, and `dispatchSend`
would find it if a frame ever arrived.

**The frame does not arrive.** The defect is strictly between the renderer's
`window.api.winetricksInstall(...)` call and the sidecar's `handleFrame`.

The renderer-side guard is also excluded — now confirmed against the render tree rather than
inferred: the search rows the operator clicked live inside `{!declined && !loadingInstalled && ...}`
(`Winetricks/index.tsx:155`), so `declined` was necessarily false and the early return in `install()`
did not fire. The parent's `install` IS what the row's button invokes (`onInstallClicked={install}`),
and the three args are all plain strings — so the SyntheticEvent JSON-serialization failure mode
from the `open-external-frame-noop` session does not apply either.

What remains, and needs runtime instrumentation rather than code reading:
- `tauriInvoke(SIDECAR_SEND, ...)` rejects AND the `.catch`'s `window.api.logError` ALSO fails,
  leaving only renderer `console.error` (invisible in `gamelib.log`); or
- the Rust `sidecar_send` accepts the call but the frame is never written to the sidecar's stdin.

Next instrumentation step: instrument `tauriTransport.ts:118`'s `send()` and observe whether it is
entered at all for this channel.

### (superseded) The cheap diagnostic that separated (A) from (B)

`runWineCommandForGame` is registered at `wineToolsFlowRegistration.ts:363` — **AFTER** the send
registration at `:335`, in the same function. It is invoke-kind, so its failure mode is loud.

- If `runWineCommandForGame` resolves live -> execution passed `:335`, the listener IS registered,
  and the defect is **(B)**, in transport routing for this channel alone.
- If `runWineCommandForGame` is ALSO dead -> `registerWineToolsFlows()` aborts between `:316` and
  `:363`, and the defect is **(A)** — which would silently un-register everything after the abort
  point, a materially larger problem than one button.

Step 5 of `34.6-LIVE-GATE.md` was expected to drive `runWineCommandForGame`, making this
diagnostic free. It turns out that channel has **no renderer call site at all** (see the separate
finding recorded against live-gate step 5), so the diagnostic was never available — and is now
unnecessary, the stub-level argument above having settled it.

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

Candidate 3's GLOBAL form is now refuted (see the narrowing above -- `frontendReady` proves send
works end-to-end in this instance). Its NARROW form survives: a rejection on THIS channel's invoke
would route to `window.api.logError`, and if that particular call also failed the rejection falls
back to renderer `console.error`, which does not reach `gamelib.log`. Run the (A)/(B) diagnostic
above FIRST -- it is cheaper and it partitions the space.

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
