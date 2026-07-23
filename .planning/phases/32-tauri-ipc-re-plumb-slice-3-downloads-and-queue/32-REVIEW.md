---
phase: 32-tauri-ipc-re-plumb-slice-3-downloads-and-queue
reviewed: 2026-07-24T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - src/backend/sidecar/downloadQueueFlowRegistration.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/__tests__/downloadQueueFlows.test.ts
  - src/backend/sidecar/__tests__/installFlows.test.ts
findings:
  critical: 0
  warning: 3
  info: 1
  total: 4
status: issues_found
---

# Phase 32: Code Review Report

**Reviewed:** 2026-07-24T00:00:00Z
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Reviewed the download-queue channel registration (`downloadQueueFlowRegistration.ts`), the re-routed install/update/uninstall channel registration (`installFlowRegistration.ts`), the registration order change in `handlers.ts`, and both new wiring test suites.

The transport-kind split (4× `ipcMain.on` send, 1× `ipcMain.handle` invoke) is copied correctly from `downloadmanager/ipc_handler.ts`, matches the real function signatures, and is exercised by real end-to-end tests against the actual `downloadqueue.ts` singleton (not a reimplementation) — this part is solid. `sidecarRpc.ts`'s `dispatchInvoke`/`dispatchSend` both wrap handler/listener execution in try/catch, so a thrown error inside any of these new handlers degrades to an `ok:false` response or a logged stderr line rather than crashing the process; no new unhandled-rejection surface was found in the reviewed files themselves.

The install/updateGame re-route onto the real `addToQueue()` (D-01, "restoring Electron parity") is the one place cross-file tracing surfaced a real, provable regression: retiring the Phase 30 D-05a bypass also retires a Tauri-only bugfix (Gap-1 / `hadError` badge-clearing + the "Installation failed" dialog) that the new code's own docstring claims is "already reproduced unmodified" by `installQueueElement` — it is not. See CR/WR-01 below. A second, related gap: dropping the non-steam runner guard entirely (documented intentionally) without also porting the Legendary DLC fan-out loop from `ipc_handler.ts` silently breaks DLC installs for non-Steam runners now reachable through this channel (WR-02). Both are real user-visible defects on the Tauri build, not pattern-matching false positives — traced through `downloadmanager/utils.ts` and `downloadmanager/__tests__/utils.test.ts` to confirm.

## Warnings

### WR-01: Steam install failures silently leave the "installing" badge stuck forever (lost Gap-1 dialog + hadError badge-clear fix)

**File:** `src/backend/sidecar/installFlowRegistration.ts:12-28` (docstring), effective behavior via `src/backend/downloadmanager/utils.ts:102-146` (`installQueueElement`, unmodified but now reachable from the sidecar for the first time via `addToQueue()`)

**Issue:** The docstring claims: *"`addToQueue()` -> `initQueue()` -> `installQueueElement()` ... already reproduces every one of those transitions unmodified"*, referring to the retired D-05a bypass's `deferredToSetup`/`wasAborted`/`hadError` status-suppression logic and its "Installation failed" `showDialogBoxModalAuto` dialog (Gap-1, Phase 30 Plan 05). This claim is false for the plain-error case:

- The retired bypass cleared the badge on **any** of `deferredToSetup || wasAborted || hadError` (see the pre-diff version of this file), and showed an "Installation failed" dialog for a genuine depot error (suppressed only for the "Steam client not ready" case).
- The real, shared `installQueueElement` (`downloadmanager/utils.ts:139`) only force-clears the badge on `runner !== 'steam' || deferredToSetup || wasAborted` — a plain `status === 'error'` (not abort, not deferred) is **not** in that list. It also never calls `showDialogBoxModalAuto` for this path (grep confirms `showDialogBoxModalAuto` is only called for the legendary/Epic-offline case in this file, never for a Steam depot error).
- `downloadmanager/__tests__/utils.test.ts:152` even has an explicit "regression guard" test named *"a genuine ERROR (status: 'error', never a user cancel) is unaffected by this fix — pre-existing behavior for a real failure is unchanged"* — i.e. the shared code's own test suite documents that this exact case is NOT handled.

Net effect: on the Tauri/sidecar build, a Steam install that fails with a genuine depot/network error (not a user cancel, not a bottle setup deferral) now shows no error dialog and leaves the game's status stuck on "installing"/"downloading" indefinitely — the exact class of user-facing bug the "debug/steam-cancel-abort-thread-a" and Gap-1 fixes were created to close, reintroduced for this one status value. This regressed silently: no test in either `downloadQueueFlows.test.ts` or `installFlows.test.ts` exercises an `addToQueue`/`installQueueElement` error-status outcome for `runner: 'steam'`, so nothing caught it.

**Fix:** Either (a) restore the Tauri-only enhancement at this layer (react to `installQueueElement`'s returned status by clearing the badge / surfacing a dialog directly from `installFlowRegistration.ts`, since it no longer has the return value — it resolves `void` from `addToQueue()`), or (b) fix `installQueueElement` itself to force-clear on `status === 'error'` too (this would fix both builds and remove the divergence this docstring incorrectly claims doesn't exist). At minimum, correct the docstring to stop claiming full behavioral parity, and add a wiring test that drives `mockedInstallQueueElement.mockResolvedValue({status:'error', error:'boom'})` for a steam runner through the `install` invoke and asserts what actually happens to the badge.

### WR-02: Dropping the runner guard without porting the Legendary DLC fan-out loop silently drops DLC installs for non-Steam runners

**File:** `src/backend/sidecar/installFlowRegistration.ts:109-133`

**Issue:** The docstring explicitly says the non-steam-runner guard was removed "for full Electron parity" so that `install`/`updateGame` are now runner-generic, matching `ipc_handler.ts`. But `ipc_handler.ts`'s real `install` handler (see `downloadmanager/ipc_handler.ts:12-42`) does more than a single `addToQueue()` call — after enqueuing the base game, it loops over `args.installDlcs` and calls `addToQueue()` again for each DLC **only when `args.runner === 'legendary'`**. This loop is explicitly omitted here with the comment "not Steam-relevant to this slice" — but since the runner guard is now gone, this channel IS reachable for `runner === 'legendary'` from the Tauri build (any caller of `window.api.install(...)`, not just Steam-specific UI). The result: a Legendary/Epic install invoked through the Tauri sidecar with `installDlcs` populated enqueues only the base game — the selected DLCs are silently never installed, with no error, no log, and no difference in the resolved response.

**Fix:** Either re-add the DLC fan-out loop (full parity, matching the stated intent), or keep the non-steam-runner guard for `install`/`updateGame` (restricting scope to Steam, as the module previously did) so a channel this file doesn't fully port isn't opened up to runners whose full behavior it doesn't implement.

### WR-03: Coverage gap — no test exercises the enqueue-side error/failure path for either `install` or `updateGame`

**File:** `src/backend/sidecar/__tests__/installFlows.test.ts:274-298`, `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts:456-537`

**Issue:** `installFlows.test.ts` explicitly removed its former Test 2/3 (CR-02/Gap-1 error/abort/deferredToSetup coverage) with a comment claiming the behavior "lives UNMODIFIED in `installQueueElement`... already covered by `downloadmanager/__tests__/utils.test.ts`'s own suite". As shown in WR-01, that referenced suite documents the plain-error case as explicitly *unfixed*, not covered as a passing/intended behavior for this new call path. Meanwhile the new `downloadQueueFlows.test.ts` install/updateGame tests (lines 456-537) only ever mock `installQueueElement`/`updateQueueElement` to resolve `{status: 'done'}` — no test drives an `error` or `abort` resolution through the actual `install`/`updateGame` invoke channels to observe the resulting frame/badge sequence. This is exactly the gap that let WR-01 land unnoticed.

**Fix:** Add a test in `downloadQueueFlows.test.ts` (or `installFlows.test.ts`) that resolves `installQueueElement`/`updateQueueElement` with `{status: 'error', error: '...'}` for a `runner: 'steam'` element enqueued via the `install`/`updateGame` invoke, and asserts what `gameStatusUpdate` frames (if any) are pushed afterward — this will either confirm the regression is acceptable and intentional, or catch it going forward.

## Info

### IN-01: Stale rationale comment for the `SteamGame`/`getSteamInstallSize` mock in `downloadQueueFlows.test.ts`

**File:** `src/backend/sidecar/__tests__/downloadQueueFlows.test.ts:135-143`

**Issue:** The comment justifying `jest.requireActual` preservation of the real `SteamGame` default export says this is needed for *"installFlowRegistration.ts's own transitively-loaded import"*. As of this phase's diff, `installFlowRegistration.ts` no longer imports `SteamGame` at all (that import was removed along with the retired D-05a bypass — see the git diff removing `import SteamGame from '../storeManagers/steam/games'`). The real dependency chain that still needs the real class is `../storeManagers` (this file's own load-bearing first import) -> `steam/library.ts` -> `steam/games.ts`, not `installFlowRegistration.ts` directly.

**Fix:** Update the comment to attribute the need to the `storeManagers/index.ts` -> `steam/library.ts` chain (this test file's own `import '../storeManagers'`-equivalent transitive load), not to `installFlowRegistration.ts`, so a future reader doesn't go looking for a `SteamGame` import in a file that no longer has one.

---

_Reviewed: 2026-07-24T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
