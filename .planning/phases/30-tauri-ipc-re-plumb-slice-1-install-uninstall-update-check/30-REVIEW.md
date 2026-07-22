---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
reviewed: 2026-07-22T00:00:00Z
depth: standard
files_reviewed: 15
files_reviewed_list:
  - src-tauri/Cargo.toml
  - src-tauri/capabilities/default.json
  - src-tauri/src/main.rs
  - src/backend/dialog/dialog.ts
  - src/backend/main.ts
  - src/backend/sidecar/__tests__/dialogStub.test.ts
  - src/backend/sidecar/__tests__/installFlows.test.ts
  - src/backend/sidecar/__tests__/steamAuthFlows.test.ts
  - src/backend/sidecar/electronStub.ts
  - src/backend/sidecar/handlers.ts
  - src/backend/sidecar/installFlowRegistration.ts
  - src/backend/sidecar/keyringTokenStore.ts
  - src/backend/sidecar/steamAuthFlowRegistration.ts
  - src/backend/utils/checkGameUpdates.ts
  - src/common/types/sidecarTransport.ts
findings:
  critical: 4
  warning: 7
  info: 4
  total: 15
  fixed: 2
  open: 13
fixed_findings:
  - id: CR-01
    commit: 236638f6
    note: "install/updateGame now reject runner !== 'steam' with UNPORTED_CHANNEL_MARKER rather than mis-installing. Scope-limited per D-05a; full libraryManagerMap dispatch remains Phase 32's work."
  - id: CR-02
    commit: 75bb3630
    note: "install now pushes 'installing' after 'queued', captures SteamGame.install()'s InstallResult, logs on error, pushes terminal 'done' for deferredToSetup/abort, and returns {status} instead of discarding it."
status: issues_found
---

# Phase 30: Code Review Report

**Reviewed:** 2026-07-22
**Depth:** standard
**Files Reviewed:** 15
**Status:** issues_found

## Summary

Phase 30 ports `checkSteamInstalled`/`steamStartQR`/`steamPollQR` (30-01),
`install`/`uninstall`/`updateGame`/`checkGameUpdates`/`listSteamLibraryTargets` (30-02),
and a `dialog_open` rustInvoke channel (30-03) onto the Node sidecar.

The registration plumbing itself is sound and the project-specific hazards were
respected: no synchronous `require('backend/...')` anywhere in the new code (all
static top-level imports), no `readFileSync(join(__dirname,...))` JSON loading,
`electronStub.ts` still does not import `backend/logger` (its `console.warn` is
correct and is NOT reported here), the load-bearing `import '../storeManagers'`
first-import fix is replicated per-file, and **all three new test files correctly
redirect `os.homedir()` to a per-pid tmp directory before touching electron-store**
— no test in scope can reach the developer's real `~/Library/Application Support/GameLib`.

The defects are in the *semantics* of the ported channels, not the wiring:

- The `install` and `updateGame` handlers ignore the `runner` field entirely and
  unconditionally construct a `SteamGame`. These are all-runner channels. Installing
  an Epic/GOG/Amazon game under Tauri will drive the Steam depot installer against a
  non-Steam appName.
- The `install` handler emits `queued` and then never emits a terminal status, so
  the Tauri build reproduces the exact stuck-badge bug class this repo has fought
  repeatedly (`steam-install-slow-start`, Thread A cancel/abort).
- Every long-running invoke (`install`, `updateGame`, `checkGameUpdates`) rides a
  transport with a hard 60-second timeout on BOTH legs.
- The `dialog_open` human-in-the-loop modal shares that same 60-second bound, so a
  user who takes >60s to pick a folder silently loses their selection.
- The only backend caller of `dialog.showOpenDialog` (`main.ts`'s `openDialog`
  handler) is *not* registered in the sidecar, so plan 30-03's picker is currently
  unreachable dead code in the Tauri build.

### On G-30-01 (Steam logon button unresponsive / QR tab never reached)

**Not re-filed as a finding.** Evidence gathered while reviewing this scope:

**Refuted:** the "unresponsive button" is not a failed route transition. `Runner`'s
login button (`src/frontend/screens/Login/components/Runner/index.tsx:34-40`) is a
plain `navigate(props.loginUrl)` → `/loginweb/steam`, and `App.tsx:129-136`'s
`makeLazyFunc` receives an **already-started** `import()` promise created at module
scope, so the `SteamLogin` chunk is loaded at boot, not on click. Neither the
navigation nor the chunk load can be the stall. `disabled` is driven only by
`oldMac`, which needs `systemInfo.get` to resolve with a darwin version < 12; if that
channel is unported it stays `null` and `disabled` is `false`.

**Supported (highest-confidence lead):** `SteamLogin`'s mount effect
(`src/frontend/screens/Login/components/SteamLogin/index.tsx:167-174`) is
`window.api.checkSteamInstalled().then(...)` with **no `.catch`**. `step` starts as
`'checking'` and is only ever advanced by that `.then`. If the invoke rejects *or
never settles*, the screen pins on the `'checking'` render forever — the QR tab
(`step === 'tab'`) is never reached and, to a user, the button "did nothing". Merely
registering the channel is necessary but **not sufficient**: the same stall occurs if
the invoke rejects for any transport reason. See CR-03 (60s invoke timeout) and CR-04
for two mechanisms that can produce exactly this. Recommended next diagnostic step: in
the Tauri devtools console, run `await window.api.checkSteamInstalled()` directly and
observe resolve vs. reject vs. hang — that single call discriminates all remaining
hypotheses.

**Second candidate worth one minute of checking:** if the store snapshot carries a
stale `steam.username`, the tile renders the **Logout** button instead, and
`Runner.handleLogout` (`index.tsx:28-33`) does `await props.logoutAction()` with no
`try/finally`. `logoutSteam` is explicitly left unported by
`steamAuthFlowRegistration.ts`'s docstring, so it rejects, `setIsLoggingOut(false)`
never runs, and the button latches permanently at "Logging out" — also indistinguishable
from "unresponsive". Note the Phase 30 D-03 two-token divergence means Tauri is normally
signed out, which makes this the less likely branch.

## Critical Issues

### CR-01: `install` handler ignores `runner` and always constructs a `SteamGame`

**File:** `src/backend/sidecar/installFlowRegistration.ts:116-146`
**Issue:** `install` is a runner-generic IPC channel. `frontend/helpers/library.ts:88`
calls `window.api.install({ appName, runner, ... })` for **every** runner (epic, gog,
nile, zoom, sideload, steam), and Electron's own path dispatches through
`libraryManagerMap[runner].getGame(appName).install(...)`
(`src/backend/downloadmanager/utils.ts:104-115`). The sidecar handler destructures
`runner` but uses it **only** for the status push, then hardcodes
`new SteamGame(appName)`. Installing an Epic or GOG title under the Tauri build will
run the Steam depot installer against a non-Steam appName — a wrong-store install with
filesystem side effects, not a clean rejection.

`updateGame` (lines 175-191) has the identical defect via `new SteamGame(appName).update()`.

**Fix:**
```ts
import { libraryManagerMap } from '../storeManagers'
// ...
ipcMain.handle('install', async (_e: unknown, ...args: unknown[]) => {
  const params = (args[0] ?? {}) as InstallParams
  const { appName, runner, path } = params
  if (runner !== 'steam') {
    // Out of this slice's scope — reject honestly rather than mis-installing.
    throw new Error(`${UNPORTED_CHANNEL_MARKER} install: runner '${runner}' not ported`)
  }
  ...
})
```
(Or dispatch through `libraryManagerMap[runner].getGame(appName)` if other runners are
meant to work.) Note `steamFlowRegistration.ts:66-80`'s `launch` handler carries the
same Steam-hardcoded assumption; that precedent does not make a *destructive* install
path safe.

### CR-02: `install` emits `queued` and never a terminal status — permanently stuck badge

**File:** `src/backend/sidecar/installFlowRegistration.ts:125-145`
**Issue:** The handler pushes exactly one `sendGameStatusUpdate({status: 'queued'})`
and then awaits `SteamGame.install()`. `SteamGame.install()` does **not** emit any
status updates itself (`grep sendGameStatusUpdate src/backend/storeManagers/steam/games.ts`
returns only a comment at line 1402). Electron's `installQueueElement`
(`downloadmanager/utils.ts:69-160`) does three things this bypass drops:

1. pushes `{status: 'installing', folder: path}` before the call, so the badge leaves "queued";
2. in its `finally`, pushes `{status: 'done'}` when `deferredToSetup` or `wasAborted`
   — the two Steam cases where **no ACF poller ever starts**;
3. logs the failure when `installResult.status === 'error'`.

The sidecar handler does none of them. `SteamGame.install()` returns
`{status: 'error' | 'abort' | 'done'}` **without throwing**, and the handler discards
the return value entirely, so a failed/aborted/deferred install resolves `ok: true`
and the game is left showing "queued" forever. This is the same stuck-badge class as
`debug/steam-cancel-abort-thread-a` and the Phase 17 `deferredToSetup` fix, reintroduced.

**Fix:**
```ts
sendGameStatusUpdate({ appName, runner, status: 'queued', folder: path })
sendGameStatusUpdate({ appName, runner, status: 'installing', folder: path })
let deferredToSetup = false
let wasAborted = false
try {
  const result = await new SteamGame(appName).install({ ... })
  deferredToSetup = result.deferredToSetup ?? false
  wasAborted = result.status === 'abort'
  if (result.status === 'error') {
    logError(['Installation of', appName, 'failed with:', result.error ?? ''], LogPrefix.Backend)
  }
  return { status: result.status }
} catch (error) {
  sendGameStatusUpdate({ appName, runner, status: 'done' })
  throw error
} finally {
  if (runner !== 'steam' || deferredToSetup || wasAborted) {
    sendGameStatusUpdate({ appName, runner, status: 'done' })
  }
}
```

### CR-03: 60-second hard invoke timeout applied to long-running install/update channels

**File:** `src-tauri/src/main.rs:51` (`INVOKE_TIMEOUT`), consumed at `main.rs:133-139`
**Issue:** Every `sidecar_invoke` is bounded at 60 seconds. Phase 30 puts `install`,
`updateGame` and `checkGameUpdates` on that transport. A Steam depot download takes
minutes to hours. At t=60s the Rust side removes the pending entry and returns
`Err("sidecar invoke timed out")` to the renderer while the install keeps running in
the sidecar; when the real response finally arrives, `main.rs:389-407` finds no sender
and drops it **silently**. Result: the renderer sees a spurious install failure, the
sidecar has an orphaned in-flight install, and `frontend/state/InstallGameModal.ts:33`'s
`void window.api.install(...)` turns it into an unhandled rejection.

`checkGameUpdates` iterating six library managers (each shelling out to legendary/gogdl/nile)
can also plausibly exceed 60s on a cold cache.

**Fix:** Make the timeout per-channel, or drop it for a declared long-running set:
```rust
const INVOKE_TIMEOUT: Duration = Duration::from_secs(60);
const LONG_RUNNING_CHANNELS: &[&str] = &["install", "updateGame", "uninstall", "checkGameUpdates", "refreshLibrary"];

fn timeout_for(channel: &str) -> Option<Duration> {
    if LONG_RUNNING_CHANNELS.contains(&channel) { None } else { Some(INVOKE_TIMEOUT) }
}
```
and use `rx.recv()` (unbounded) for the `None` case. Also add an
`eprintln!` diagnostic in the reader when a response arrives for an unknown id, so a
timed-out-then-completed invoke is not invisible.

### CR-04: `dialog_open` inherits the 60-second rustInvoke timeout — a slow user loses their folder choice

**File:** `src/backend/sidecar/electronStub.ts:139-161` + `src/backend/sidecar/sidecarRpc.ts:57`
(`RUST_INVOKE_TIMEOUT_MS = 60_000`) + `src-tauri/src/main.rs:286-289`
**Issue:** `dialog_open` blocks on `blocking_pick_folder()` — a modal the human must
interact with. The sidecar side rejects it after 60 seconds. `showOpenDialog`'s catch
then returns `{ canceled: true, filePaths: [] }`, i.e. **it silently reports "user
cancelled" while the picker is still on screen**. When the user then picks a folder,
Rust writes a response for an id already removed from `rustPending`, which is dropped.
The user picks a directory, sees nothing happen, and no error is surfaced anywhere in
the UI (only a `console.warn` in the sidecar's stderr). 60 seconds is well within
normal human file-browsing time.

**Fix:** Give human-in-the-loop channels their own (or no) bound:
```ts
const RUST_INVOKE_TIMEOUT_MS = 60_000
const UNBOUNDED_RUST_CHANNELS: readonly string[] = [RUST_DIALOG_OPEN]
// ...
const timer = UNBOUNDED_RUST_CHANNELS.includes(channel)
  ? null
  : setTimeout(() => { ... }, RUST_INVOKE_TIMEOUT_MS)
```
and guard the `clearTimeout` calls. At minimum raise the dialog bound to something
like 15 minutes and surface the timeout to the user rather than disguising it as a cancel.

## Warnings

### WR-01: `dialog.showOpenDialog` ignores its `options` — always a folder picker, even for `properties: ['openFile']` callers

**File:** `src/backend/sidecar/electronStub.ts:139-161`; `src-tauri/src/main.rs:286-289`
**Issue:** `options` is forwarded across the wire as `args[0]` and then **completely
ignored** by `dispatch_rust_channel`, which unconditionally calls
`blocking_pick_folder()`. Real callers of the `openDialog` channel request files, not
folders — e.g. `Settings/components/CustomWineProton.tsx:30-34`
(`properties: ['openFile']`, select the Wine/Proton binary),
`InstallModal/SideloadDialog/index.tsx:162-174` (`properties: ['openFile']` + image
`filters`), `Game/GameSubMenu/index.tsx:94,119`. Under Tauri every one of those gets a
directory picker and therefore a path that cannot be a valid binary/image.

**Fix:** Branch in Rust on the forwarded options:
```rust
"dialog_open" => {
    let wants_dir = args.first()
        .and_then(|v| v.get("properties"))
        .and_then(|v| v.as_array())
        .map(|a| a.iter().any(|p| p.as_str() == Some("openDirectory")))
        .unwrap_or(true);
    let picked = if wants_dir { app.dialog().file().blocking_pick_folder().map(|p| p.to_string()) }
                 else { app.dialog().file().blocking_pick_file().map(|p| p.to_string()) };
    Ok(picked.map(Value::String).unwrap_or(Value::Null))
}
```
If file-picking is deliberately out of scope, then reject non-`openDirectory` requests
explicitly instead of silently substituting a folder picker.

### WR-02: Plan 30-03's dialog path is unreachable — `openDialog` is not registered in the sidecar

**File:** `src/backend/sidecar/electronStub.ts:139-161` (dead in the sidecar);
`src/backend/main.ts:1112-1123` (the only caller)
**Issue:** `dialog.showOpenDialog` has exactly one backend caller repo-wide —
`main.ts`'s `addHandler('openDialog', ...)`. `main.ts` is **not** in the sidecar's
import graph (`bootstrap.ts` imports only `./handlers`, which imports the four curated
registration modules), and no registration module registers `openDialog`. So under
Tauri the `openDialog` channel still rejects with `UNPORTED_CHANNEL_MARKER` and the new
`showOpenDialog` body is never executed in production. The Cargo dependency, the
capability grant, the allowlist entry and the stub are all currently dead weight, and
`dialogStub.test.ts` proves only the stub in isolation — it cannot catch this.

**Fix:** Register the channel in a curated module so the path is actually live:
```ts
ipcMain.handle('openDialog', async (_e: unknown, ...args: unknown[]) => {
  const { filePaths, canceled } = await dialog.showOpenDialog(undefined, args[0])
  return canceled ? false : filePaths[0]
})
```
(and factor `main.ts`'s handler body into a shared function the same way
`checkGameUpdates.ts` was extracted, so the two builds cannot fork).

### WR-03: `dialog:allow-open` widens the webview's capability surface unnecessarily

**File:** `src-tauri/capabilities/default.json:10`
**Issue:** Tauri v2 capabilities gate **webview→Rust IPC**, not Rust-side plugin API
calls. `dispatch_rust_channel` calls `app.dialog().file()` from Rust, which does not
consult the ACL. Adding `dialog:allow-open` therefore does nothing for the intended
path and instead exposes `plugin:dialog|open` directly to renderer JavaScript. Any
script executing in the webview (including anything injected through the store WebView
surface) can now pop native file dialogs. The capability's own `description` field
even documents the correct rule two sentences earlier ("registered via invoke_handler
and do not require capability permissions").

**Fix:** Remove `"dialog:allow-open"` from `permissions` and verify the folder picker
still works (it will — it is a Rust-side call). Update the description accordingly.
While there, `opener:allow-open-url` is redundant with `opener:default`.

### WR-04: `updateGame` discards the update result — a failed update reports success

**File:** `src/backend/sidecar/installFlowRegistration.ts:175-191`
**Issue:** `SteamGame.update()` returns `{status: 'error', ...}` without throwing (it
is a stub today, per the module docstring — it *always* returns error). The handler
awaits it, ignores the value, and returns `void`, so the invoke resolves `ok: true`.
Electron's `updateQueueElement` (`downloadmanager/utils.ts:198-213`) checks
`status === 'error'` and logs it, and returns `{status}` to the queue. Every update
under Tauri will silently "succeed" while doing nothing.

**Fix:** Return the status and log the error, mirroring `updateQueueElement`:
```ts
const result = await new SteamGame(appName).update()
if (result.status === 'error') {
  logError(['Update of', appName, 'failed with:', result.error ?? ''], LogPrefix.Backend)
}
return { status: result.status }
```

### WR-05: `checkGameUpdates` has no per-runner error isolation, but its test asserts that it does

**File:** `src/backend/utils/checkGameUpdates.ts:27-35`;
`src/backend/sidecar/__tests__/installFlows.test.ts:348-361`
**Issue:** The loop `await libraryManagerMap[runner].listUpdateableGames()` is
unguarded — one runner whose CLI or credentials are missing rejects and the whole
`checkGameUpdates()` call rejects, discarding the results already collected from the
other five runners. Test 5's comment claims the opposite ("a manager whose
CLI/credentials are absent must not make the whole call reject (D-12, all runners)"),
but the test only passes because nothing in the mocked environment happens to throw.
The assertion does not exercise the property it documents. This behavior was extracted
verbatim from `main.ts`, so it is pre-existing — but extraction into a new shared,
sidecar-facing module is the right moment to fix it, and the misleading test comment
is new.

**Fix:**
```ts
for (const runner of ...) {
  try {
    let gamesToUpdate = await libraryManagerMap[runner].listUpdateableGames()
    if (autoUpdateGames) gamesToUpdate = autoUpdate(runner, gamesToUpdate)
    oldGames = [...oldGames, ...gamesToUpdate]
  } catch (error) {
    logWarning([`checkGameUpdates: ${runner} failed:`, error], LogPrefix.Backend)
  }
}
```
and add a test that makes one manager reject and asserts the others' results still come back.

### WR-06: `install` drops Electron's argument sanitation (`path` apostrophes, empty `sdlList` entries)

**File:** `src/backend/sidecar/installFlowRegistration.ts:135-144`
**Issue:** Electron's `installQueueElement` passes
`path: path.replaceAll("'", '')` and `sdlList: sdlList.filter((el) => el !== '')`
(`downloadmanager/utils.ts:106-109`). The sidecar bypass forwards both raw. The
apostrophe strip exists because the path is interpolated into shell-ish command
construction downstream; forwarding an unstripped path is a shell-metacharacter
exposure on the depot/bottle branches, and empty `sdlList` entries change the SDL
selection semantics.

**Fix:** Apply the identical normalization in the bypass:
```ts
path: (path ?? '').replaceAll("'", ''),
sdlList: (params.sdlList ?? []).filter((el) => el !== ''),
```

### WR-07: Rust drops correlated responses for unknown ids with no diagnostic

**File:** `src-tauri/src/main.rs:388-409`
**Issue:** When a response frame's `id` is not in `pending` (the normal outcome after
a CR-03 timeout), the branch falls through and `continue`s with no logging. The file's
own convention two blocks down (`main.rs:484-488`) is explicitly "log a diagnostic
instead of silently dropping it, so this class of gap cannot recur unnoticed" — the
response path violates its own stated rule, which is precisely how a
registered-but-dead channel stays invisible.

**Fix:**
```rust
if let Some(tx) = sender { let _ = tx.send(outcome); }
else { eprintln!("[shell] response for unknown/timed-out id={id}"); }
```
Also handle the case where `id` is absent or non-string (currently the whole frame is
dropped with no trace).

## Info

### IN-01: `install`/`updateGame` accept `args[0] ?? {}` and will construct `new SteamGame(undefined)`

**File:** `src/backend/sidecar/installFlowRegistration.ts:119-120, 178-179`
**Issue:** A malformed frame (`args: []`) yields `params = {}` → `appName` is
`undefined` → `new SteamGame(undefined as unknown as string)`. The failure mode is a
confusing downstream error rather than an honest rejection.
**Fix:** `if (typeof appName !== 'string' || !appName) throw new Error('install: missing appName')`.

### IN-02: Electron-only install side effects not reproduced (documented, but worth tracking)

**File:** `src/backend/sidecar/installFlowRegistration.ts:115-146`
**Issue:** `downloadFixesFor(appName, runner)` (`downloadmanager/utils.ts:104`) and the
epic-offline / gog-manifest pre-checks are not run in the bypass. The docstring
enumerates deliberate omissions but does not mention `downloadFixesFor`.
**Fix:** Either call it or add it to the docstring's explicit "deliberately does NOT" list.

### IN-03: Rust spawns an unbounded thread per `rustInvoke`, with no concurrency guard on `dialog_open`

**File:** `src-tauri/src/main.rs:455-465`
**Issue:** Each `rustInvoke` frame spawns a fresh OS thread. For `dialog_open` this
means N concurrent frames produce N stacked native modal pickers. Correct for the
keyring arms (and correctly off the reader thread per T-28-05), but unbounded.
**Fix:** Add a single-flight guard (`AtomicBool`) around `dialog_open`, returning
`Value::Null` if a picker is already open.

### IN-04: Test tmp home directories are never cleaned up

**File:** `src/backend/sidecar/__tests__/installFlows.test.ts:62-70`,
`steamAuthFlows.test.ts:52-60`, `dialogStub.test.ts:22-30`
**Issue:** `os.tmpdir()/gamelib-*-test-home-<pid>` directories accumulate across runs.
Harmless but untidy. (The `homedir()` redirect itself is **correct and load-bearing** —
it is what keeps these suites away from the developer's real config directory. Verified
against `src/backend/sidecar/pathShim.ts:16,33-54`, which resolves every path from
`os.homedir()`.)
**Fix:** `afterAll(() => rmSync(homedir(), { recursive: true, force: true }))`.

## Verified Clean

Checked and found correct — recording so a re-review does not redo the work:

- **No test file in scope touches electron-store unmocked.** All three new suites do
  `jest.mock('electron-store', () => ({ __esModule: true, default: jest.requireActual('../fileStore').default }))`
  *and* redirect `os.homedir()` to a per-pid tmp dir before it. `steamAuthFlows.test.ts`'s
  `afterEach(() => steamConfigStore.clear())` is therefore safe. No data-loss hazard.
- No synchronous `require('backend/...')` / `require('./...')` in any new main-process
  code — all static top-level imports, dereferenced in function bodies.
- No `readFileSync(join(__dirname, ...))` for bundled JSON in main-process code.
  (`dialogStub.test.ts:150` reads `dialog.ts` source, but that is a test-only
  by-construction gate, not shipped main-process code.)
- `electronStub.ts` still does not import `backend/logger`; its `console.warn` is the
  correct, deliberate choice. Not a defect.
- The load-bearing `import '../storeManagers'` first-import fix is correctly replicated
  per-file in both `steamAuthFlowRegistration.ts:42` and `installFlowRegistration.ts:100`.
- `checkGameUpdates` extraction from `main.ts` is behavior-preserving; the now-unused
  `autoUpdate` import was correctly removed from `main.ts` and no other `autoUpdate`
  reference remains there (only the unrelated `autoUpdater` from `electron-updater`).
- `notify()`'s logged no-op (`dialog/dialog.ts:71-78`) correctly logs the title and
  reason but never the body.
- `keyringTokenStore.ts`'s only change is a documentation block (Phase 30 D-03
  two-token divergence); its total-method error handling is unchanged and correct.
- `dispatch_rust_channel`'s keyring arms still source service/account from compile-time
  constants only, never from `args` (T-28-03 preserved).
- No hardcoded secrets, no `eval`, no command interpolation, no empty catch blocks in scope.

---

_Reviewed: 2026-07-22_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
