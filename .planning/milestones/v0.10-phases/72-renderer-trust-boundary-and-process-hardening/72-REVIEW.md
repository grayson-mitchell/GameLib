---
phase: 72-renderer-trust-boundary-and-process-hardening
reviewed: 2026-11-08T00:00:00Z
depth: standard
files_reviewed: 66
files_reviewed_list:
  - .github/dependabot.yml
  - .github/workflows/audit.yml
  - .github/workflows/rust-test.yml
  - package.json
  - src-tauri/Cargo.toml
  - src-tauri/capabilities/default.json
  - src-tauri/deny.toml
  - src-tauri/src/ipc_contract.rs
  - src-tauri/src/main.rs
  - src-tauri/src/relay_commands.rs
  - src-tauri/src/shell_open.rs
  - src-tauri/src/shell_state.rs
  - src-tauri/src/sidecar.rs
  - src-tauri/src/store_embed.rs
  - src-tauri/tauri.conf.json
  - src/backend/__tests__/capabilitiesDefault.test.ts
  - src/backend/__tests__/launcher_callRunner.test.ts
  - src/backend/__tests__/sidecarShutdownFlagSource.test.ts
  - src/backend/__tests__/tauriConf.test.ts
  - src/backend/__tests__/tauriShellSource.test.ts
  - src/backend/__tests__/trackedChildren.test.ts
  - src/backend/__tests__/utils.test.ts
  - src/backend/downloadmanager/__tests__/downloadqueue.test.ts
  - src/backend/downloadmanager/__tests__/utils.test.ts
  - src/backend/downloadmanager/downloadqueue.ts
  - src/backend/downloadmanager/utils.ts
  - src/backend/launcher.ts
  - src/backend/platform/index.ts
  - src/backend/shortcuts/__tests__/shortcutsExistsFallback.test.ts
  - src/backend/sidecar/__tests__/bootstrap.test.ts
  - src/backend/sidecar/__tests__/electronUntouched.test.ts
  - src/backend/sidecar/__tests__/gameDetailsImportGate.test.ts
  - src/backend/sidecar/__tests__/ipcSchemas/shellFiles.test.ts
  - src/backend/sidecar/__tests__/openPolicy.test.ts
  - src/backend/sidecar/__tests__/rendererPathGuard.test.ts
  - src/backend/sidecar/__tests__/shellFilesFlows.test.ts
  - src/backend/sidecar/__tests__/sidecarRejectionGuard.test.ts
  - src/backend/sidecar/__tests__/testContainment.test.ts
  - src/backend/sidecar/appShellFlowRegistration.ts
  - src/backend/sidecar/bootstrap.ts
  - src/backend/sidecar/openPolicy.ts
  - src/backend/sidecar/processGuards.ts
  - src/backend/sidecar/rendererPathGuard.ts
  - src/backend/sidecar/shellFilesFlowRegistration.ts
  - src/backend/storeManagers/legendary/games.ts
  - src/backend/storeManagers/nile/games.ts
  - src/backend/storeManagers/sideload/games.ts
  - src/backend/storeManagers/steam/__tests__/clientSetup.test.ts
  - src/backend/storeManagers/steam/__tests__/credentialsMissing.test.ts
  - src/backend/storeManagers/steam/__tests__/steamStartupKeyringDeferral.test.ts
  - src/backend/storeManagers/steam/__tests__/tokenStore.test.ts
  - src/backend/storeManagers/steam/__tests__/user.test.ts
  - src/backend/storeManagers/steam/clientSetup.ts
  - src/backend/storeManagers/steam/constants.ts
  - src/backend/storeManagers/steam/tokenStore.ts
  - src/backend/storeManagers/storeManagerCommon/games.ts
  - src/backend/trackedChildren.ts
  - src/backend/utils.ts
  - src/backend/utils/aborthandler/aborthandler.ts
  - src/common/__fixtures__/openPolicyCases.json
  - src/common/types.ts
  - src/common/types/ipc/shellFiles.ts
  - src/frontend/helpers/__tests__/externalLinkClicks.test.ts
  - src/frontend/helpers/externalLinkClicks.ts
  - src/frontend/index.tsx
  - src/preload/api/library.ts
findings:
  critical: 0
  warning: 6
  info: 3
  total: 9
status: issues_found
---

# Phase 72: Code Review Report

**Reviewed:** 2026-11-08
**Depth:** standard
**Files Reviewed:** 66
**Status:** issues_found

## Summary

The trust-boundary core holds up. I traced these and found no blocker:

- **URL scheme policy:** Rust `open_external_scheme_check` and TS `assertOpenableExternalUrl` agree on scheme extraction (first `:`, ASCII lowercase) and on the exact-URL allowance. The shared JSON fixture exercises both.
- **Open-path policy:** Rust `shell_open.rs` is stricter than the sidecar, which is the right direction because Rust is authoritative. The bundle-extension lists are identical. Both canonicalize or realpath before the bundle check, and the symlink-to-`.app` case is rejected.
- **Token store:** the fail-closed `UnconfiguredTokenStore` has no plaintext path.
- **Shutdown flag:** `begin_shutdown` is set at every in-repo exit entry (`ExitRequested`, `AppExit`, `AppRelaunch`, the dialog path).
- **Windows Job Object:** handle lifetime is sound. The handle is owned by the `Arc`-managed `SidecarState` for the whole app life, closed in `shutdown_child`, and the kernel closes it on shell crash.

The defects are in the process-reaping edges the phase added or rewired, not in the policy checks.

## Warnings

### WR-01: Dead-sidecar dialog leaves the sidecar's children orphaned, and Restart bypasses the reap entirely

**File:** `src-tauri/src/sidecar.rs:~620-690` (`surface_dead_sidecar`)
**Issue:** The process-group SIGKILL (Unix) runs only when `!gone`. The usual dead-sidecar case is a Node `exit(1)` from the new fatal `uncaughtException` handler. There `try_wait()` reports the sidecar gone, so the group is never signalled. Its long-lived children (comet, bridge helper, runner CLIs, games) are left running with no supervising sidecar.

The follow-up is also unsafe. `Restart` calls `app.restart()`. Tauri's `restart()` does not emit `RunEvent::Exit`, so `shutdown_child()` never runs and the orphans survive into the new instance. `Quit` goes through `app.exit(0)`, which does reach `shutdown_child`. On that path the SIGTERM/SIGKILL of `-pgid` can still reap the group, but only if the group still has members.

On Windows the job is dropped only inside `shutdown_child`, so the `restart` branch has the same hole until the old process exits.

**Fix:** Reap the group (or drop the job) on the dead-sidecar path before showing the dialog or restarting:
```rust
// in surface_dead_sidecar, after the try_wait loop and before the dialog:
state.shutdown_child(); // SIGTERM/SIGKILL -pgid on unix, drop the Job on windows; it is idempotent via begin_shutdown + wait()
```
`shutdown_child` locks `child` and calls `wait()`. Release the existing `child` lock scope first, as the code already does with its inner block. Alternatively, call `libc::kill(-pgid, SIGKILL)` unconditionally after the loop.

### WR-02: Tracked-PID kill replaces `pkill -f <name>` with a single-PID SIGTERM; wrapper-launched games and legendary's game child can survive

**File:** `src/backend/trackedChildren.ts:56-70`, `src/backend/storeManagers/legendary/games.ts` (`stop`), `src/backend/storeManagers/sideload/games.ts` (`stop`)
**Issue:** `killEntry` sends SIGTERM to the one tracked PID only. Tracked children are deliberately not detached, so they share the sidecar's process group.

- When `wrappers` are prepended (gamemoderun, mangohud, a shell script), the tracked PID is the wrapper and its child is not signalled.
- `legendary launch` spawns the game as a child of legendary. The removed comment said legendary does not handle SIGTERM reliably. The old `pkill -f <appName>` matched the game's own command line, so the game died. It now depends on legendary forwarding the signal.
- Wine and Proton children: SIGTERM to the launcher does not stop the exe. Sideload relies on `shutdownWine` afterwards, but native sideloads have no such backstop.
- There is no escalation to SIGKILL, so a runner that ignores SIGTERM survives both `stop()` and quit.

On Windows, `spawnSync('taskkill', …)` does not throw on a non-zero exit, so `killEntry` returns `true` and the count is overstated when the kill failed.

**Fix:** Kill the tree and escalate. For example, spawn tracked children as their own process group and use `process.kill(-pid, 'SIGTERM')`, then SIGKILL after a bounded `unref()`'d delay. On Windows, check `spawnSync(...).status === 0` before counting. At minimum, document that wrapper-launched and legendary-launched game processes are not covered by `stop()`.

### WR-03: PID-reuse guard untracks only on `close`, which can lag `exit` indefinitely

**File:** `src/backend/trackedChildren.ts:44-50`
**Issue:** The registry entry is removed on `'close'`/`'error'`. `'close'` waits for stdio to end. A grandchild that inherited the pipes (a wrapper's daemon, a long-lived helper) delays `'close'` long after the tracked PID has exited and been reaped. The OS may then reuse that PID, and `killTracked`/`killAllTracked` will SIGTERM an unrelated process. That is exactly the failure the module header says it prevents.

**Fix:** Also untrack on `'exit'`:
```ts
child.once('exit', untrack)
child.once('close', untrack)
child.once('error', untrack)
```

### WR-04: Fatal `uncaughtException` path does not set the exit code, so a stalled flush can end in a natural exit with code 0

**File:** `src/backend/sidecar/processGuards.ts` (the `uncaughtException` listener, `capTimer`/`Promise.race` block)
**Issue:** The cap timer is correctly `unref()`'d. That keeps the sidecar exit contract, but it means nothing in the handler itself keeps the loop alive. Exit 1 depends on the timer or the stderr/sink promises firing. If stdin has already reached EOF (the normal-shutdown race) and the stderr callback and sink never settle, the loop drains. Node then exits with code 0, because a registered `uncaughtException` listener suppresses Node's default exit code 7/1. The shell then sees a clean exit, not a crash.

The process also keeps executing other callbacks for up to 1.5 s after an uncaught exception, which is the state Node says is unknown.

**Fix:** Set the code immediately, before any async work:
```ts
process.exitCode = 1 // at the top of the handler, guarded by try/catch
```
The `exit` parameter is injectable for tests, so use `target as NodeJS.Process` only when it is the real process.

### WR-05: `removeFolder` lost its settle delay; deletion can race an aborting runner and leave a partial folder

**File:** `src/backend/utils.ts` (`removeFolder`, ~1498-1527); caller `src/backend/downloadmanager/downloadqueue.ts:410`
**Issue:** The old code waited 2 s or 5 s so an aborted legendary/gogdl could finish releasing and writing files. The new `rm(..., { maxRetries: 5, retryDelay: 200 })` retries only on EBUSY/EMFILE/ENFILE/ENOTEMPTY/EPERM. A runner that is still creating files after `rm` has emptied the directory recreates it, and `force: true` hides ENOENT. The result is a silently leftover folder. A Windows file lock beyond ~3 s of linear backoff rejects, and the caller only logs the failure.

The caller also does not await abort completion before issuing the delete.

**Fix:** Delete after the aborted runner promise settles (await the abort or `callRunner` rejection before `removeFolder`), or run a second `rm` after the runner's `close`. If the timing is kept, state it as best-effort in the helper doc comment.

### WR-06: `openFolder` / `ShellOpenPath` open the un-canonicalized path after the check (time-of-check/time-of-use)

**File:** `src-tauri/src/shell_open.rs:62-66` (`open_path_policy_check` returns `p.to_path_buf()`), `src/backend/sidecar/shellFilesFlowRegistration.ts:148-157`
**Issue:** Both layers classify the canonical/real path but then act on the caller-supplied path. A path component can be swapped between check and open (a symlink repointed to a `.app` or other target). The sidecar then opens `target`, not `real`. Rust opens `p`, not `canonical`. The policy is therefore a point-in-time check, not a binding one. The comment explains the Windows `\\?\` reason for returning the original path. That reason applies only on Windows.

**Fix:** On non-Windows, return `canonical` from `open_path_policy_check` and open that. In the sidecar, pass `real` out of `classifyFolderTarget` (return `{ mode, path }`) and open it. On Windows keep the original, or strip the `\\?\` prefix with `dunce`-style logic.

## Info

### IN-01: Supply-chain gate workflow uses mutable action tags

**File:** `.github/workflows/audit.yml:~25-45`, `.github/workflows/rust-test.yml`
**Issue:** `actions/checkout@v6`, `pnpm/action-setup@v4`, `actions/setup-node@v6` and `EmbarkStudios/cargo-deny-action@v2` are tag-pinned. A workflow whose purpose is supply-chain assurance runs third-party code from movable tags. `dependabot.yml` has no `github-actions` ecosystem entry, so these pins are never refreshed.
**Fix:** Pin third-party actions to commit SHAs and add a `github-actions` ecosystem entry (with `open-pull-requests-limit: 0` for security-only if desired).

### IN-02: `UnconfiguredTokenStore.clearToken` resolves silently

**File:** `src/backend/storeManagers/steam/tokenStore.ts:~145-150`
**Issue:** `setToken` fails closed, but `clearToken` only warns and resolves. A sign-out issued before the real store is installed will report success while a token that exists in the Keychain remains. The ordering window is small, but this is a fail-open on the destructive-credential side.
**Fix:** `throw new Error('Steam token store not installed')` for symmetry, and have `SteamSignOut` surface the failure.

### IN-03: Link-click handler gaps

**File:** `src/frontend/helpers/externalLinkClicks.ts:34-47`
**Issue:** The handler routes `click` only. `auxclick` (middle-click) on a `target=_blank` link, which the removed opener script also did not cover specifically, falls to default navigation. `<a download>` and an SVG `<a>` are not special-cased. This is routing only, since the sidecar and Rust checks remain authoritative. Not a security issue, but a behaviour parity gap with the removed script.
**Fix:** Optionally add an `auxclick` listener for `button === 1`.

---

_Reviewed: 2026-11-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
