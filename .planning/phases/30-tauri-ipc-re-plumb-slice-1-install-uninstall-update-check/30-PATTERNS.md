# Phase 30: Tauri IPC re-plumb slice 1 (install/uninstall/update-check) - Pattern Map

**Mapped:** 2026-07-22
**Files analyzed:** 5 (2 new sidecar modules, 1 modified registry, 1 modified Rust file, 1 modified transport-contract file) + 2 test files to extend
**Analogs found:** 5 / 5

This map is scoped by RESEARCH.md's corrections to CONTEXT.md's D-10 premise —
`DownloadDialog`'s six candidate channels are NOT in scope; `listSteamLibraryTargets`
is. See RESEARCH.md Q6 before assigning any `DownloadDialog`-adjacent file to a plan.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/sidecar/steamAuthFlowRegistration.ts` (NEW) | controller (IPC registration module) | request-response | `src/backend/sidecar/steamFlowRegistration.ts` | exact — same layer, same author intent (D-08 sibling module) |
| `src/backend/sidecar/installFlowRegistration.ts` (NEW) | controller (IPC registration module) | request-response + CRUD (install/uninstall/update as lifecycle ops) | `src/backend/sidecar/steamFlowRegistration.ts` | exact — same layer; `install`/`uninstall` bypass mirrors `launch`'s "reuse the real backend class, no queue" shape |
| `src/backend/sidecar/handlers.ts` (MODIFIED — add 2 call sites) | controller (registry bootstrap) | request-response | itself (existing `registerSteamFlows()` call site) | exact — same file, same pattern, just two more calls |
| `src/backend/sidecar/electronStub.ts` (MODIFIED — `dialog.showOpenDialog` real body; `Notification`/`notify()` logged no-op) | middleware (Electron-API shim) | request-response (dialog) / event (notify) | itself — `shell.openExternal`'s forward-to-transport pattern (lines 156-159) | exact — same file, same forwarding idiom, different Electron API |
| `src-tauri/src/main.rs` (MODIFIED — `dispatch_rust_channel` new arm + `AppHandle` threading + plugin registration) | controller (Rust command dispatch) | request-response | itself — the four `keyring_*` match arms (lines 206-277) + the `openExternal` dispatch-fix precedent (lines 457-466) | exact — same function, same file |
| `src/common/types/sidecarTransport.ts` (MODIFIED — new `RUST_INVOKE_CHANNELS` entry) | config (wire-protocol constants) | N/A (types+constants only) | itself — `RUST_KEYRING_*` constant block (lines 133-155) | exact |
| New test coverage for `installFlowRegistration`/`steamAuthFlowRegistration` | test | request-response | `src/backend/sidecar/__tests__/skeletonFlows.test.ts` | exact — same harness, same mock preamble, same `startSidecar()`/`writeInvoke()`/`flush()` helpers |
| New `notify()`-logs test | test | event | `src/backend/sidecar/__tests__/electronUntouched.test.ts`'s by-construction gate tests (lines 289-306) | role-match — "grep stripped source for a forbidden/required string" idiom |

## Pattern Assignments

### `src/backend/sidecar/steamAuthFlowRegistration.ts` (NEW — controller, request-response)

**Analog:** `src/backend/sidecar/steamFlowRegistration.ts` (full file, 84 lines — reproduced in full below since the planner needs the whole shape, not a slice)

**Module docstring pattern to copy verbatim in structure** (`steamFlowRegistration.ts` lines 1-29):
```typescript
/**
 * Curated Steam E2E flow channel registration (Phase 27 Plan 04).
 *
 * Registers exactly the two invoke handlers the skeleton's real Steam flows
 * need onto electronStub's `ipcMain` recorder, importing the REAL backend
 * code paths unchanged (per the plan's own objective — prove the real logic
 * runs behind the new transport, not a reimplementation):
 *
 *   - `refreshLibrary` -> the real `SteamLibraryManager.refresh()`, which
 *     ALREADY calls `sendFrontendMessage('pushGameToLibrary', gameInfo)`
 *     once per resolved game (backend/storeManagers/steam/library.ts) —
 *     that existing call is what reaches the renderer as a
 *     `SidecarNotification` once `backend/ipc.ts`'s `sendFrontendMessage`
 *     -> `getMainWindow()` -> electronStub's fake
 *     `BrowserWindow.webContents.send` is wired to the RPC transport
 *     (27-02). Nothing here re-implements that push.
 *   - `launch` -> the real `SteamGame.launch()`, whose native branch
 *     already funnels through `buildSteamProtocolUrl` (T-27-08's
 *     numeric-appId guard) + `shell.openExternal` (bridged to the Rust
 *     opener by electronStub's `shell.openExternal` forwarder, 27-02).
 *
 * Deliberately does NOT import `launcher.ts`'s `launchEventCallback` (the
 * full Wine/GameConfig/DownloadManager pipeline the Electron build's own
 * 'launch' handler delegates to) or `storeManagers/index.ts`'s eagerly
 * constructed `libraryManagerMap` (every OTHER store manager) — only
 * `SteamLibraryManager` and `SteamGame` are imported here, holding the
 * sidecar's import graph to exactly what these two flows touch (must_haves:
 * "only the 2–4 channels... not the 220-endpoint surface").
 */
```
For `steamAuthFlowRegistration.ts`, write the equivalent docstring naming
`checkSteamInstalled` / `steamStartQR` / `steamPollQR` (RESEARCH Q3's
enumerated minimum set) as the three handlers, and state explicitly that
`steamStartCredentials`/`steamSubmitGuard`/`steamPollCredential`/
`getSteamUserInfo`/`logoutSteam` are OUT of scope (D-02) — the analog's
docstring pattern is "name exactly what's in, name what's deliberately
excluded and why", not just "name what's in".

**The load-bearing first-import block — copy structurally, do not omit**
(`steamFlowRegistration.ts` lines 31-49):
```typescript
import { ipcMain } from './electronStub'
// Load-bearing FIRST import (Phase 27 Plan 05 circular-dep fix): force
// `storeManagers/index.ts` to be the INITIALIZATION ENTRY before the direct
// `steam/library`/`steam/games` imports below resolve. `storeManagers/index.ts`
// imports `steam/library` at its OWN top and only THEN constructs its eager
// `libraryManagerMap` (`new SteamLibraryManager()` ...), so entering through it
// lets `steam/library.ts` finish defining its class export first. Entering
// through `steam/library` DIRECTLY (as this file's own imports below do) makes
// `steam/library`'s transitive `utils.ts -> storeManagers/index.ts` chain
// re-enter `index.ts` while `steam/library` is still mid-evaluation — so
// `index.ts`'s `new SteamLibraryManager()` sees an undefined class and throws
// `SteamLibraryManager is not a constructor`, crashing the sidecar on boot
// (only in the esbuild bundle's init order; ts-jest's differs, which is why
// 27-04's tests passed). This mirrors 27-02's own convention of routing every
// `libraryManagerMap` access through `storeManagers/index.ts`, never the
// individual manager modules.
import '../storeManagers'
import SteamLibraryManager from '../storeManagers/steam/library'
import SteamGame from '../storeManagers/steam/games'
import type { LaunchParams, StatusPromise } from 'common/types'
import type LogWriter from '../logger/log_writer'
```
**Important nuance from RESEARCH.md Assumption A3**: `handlers.ts` already
runs `import '../storeManagers'` transitively via `steamFlowRegistration.ts`
BEFORE this new module is imported (see `handlers.ts` pattern below) — but
the plan should still include this exact `import '../storeManagers'` line as
the literal first import in `steamAuthFlowRegistration.ts` too, defensively,
rather than relying on import order across files (matches the analog's own
"this mirrors 27-02's convention" framing — the convention is per-file, not
"once is enough").

**Registration function signature + `ipcMain.handle` shape to mirror**
(`steamFlowRegistration.ts` lines 55-83):
```typescript
/**
 * Registers the read-flow (`refreshLibrary`) and action-flow (`launch`)
 * invoke handlers. Called once from `handlers.ts` — this module owns no
 * side effects at import time beyond constructing the manager instance;
 * the caller decides when registration onto the handler registry happens.
 */
export function registerSteamFlows(): void {
  ipcMain.handle('refreshLibrary', async () => {
    await steamLibraryManager.refresh()
  })

  ipcMain.handle(
    'launch',
    async (
      _event: unknown,
      ...args: unknown[]
    ): Promise<Awaited<StatusPromise>> => {
      const { appName } = (args[0] ?? {}) as LaunchParams
      const game = new SteamGame(appName)
      const launched = await game.launch(undefined as unknown as LogWriter)
      return { status: launched ? 'done' : 'error' }
    }
  )
}
```
The new `registerSteamAuthFlows()` reuses `SteamUser` (backend implementations
already exist verbatim at `src/backend/main.ts:925-927,947`):
```typescript
addHandler('steamStartQR', async () => SteamUser.startQRLogin())
addHandler('steamPollQR', async () => SteamUser.pollQRLogin())
addHandler('checkSteamInstalled', async () => SteamUser.isSteamClientInstalled())
```
Translate `addHandler` → `ipcMain.handle` (electronStub's registry, not
`backend/ipc`'s typed one — see `handlers.ts`'s own docstring rule below).

---

### `src/backend/sidecar/installFlowRegistration.ts` (NEW — controller, CRUD/request-response)

**Analog:** `src/backend/sidecar/steamFlowRegistration.ts` (structural template, same as above) **plus** these three existing backend functions to import and register UNCHANGED per RESEARCH.md's Q1/Q2 RECOMMENDATIONs (bypass the queue; reuse the runner-generic handlers):

**1. `install`/`updateGame` — direct bypass, NOT `downloadqueue.ts`.**
The Electron pattern being bypassed (`src/backend/downloadmanager/ipc_handler.ts` lines 1-44, DO NOT COPY — this is what the bypass avoids):
```typescript
import { addHandler, addListener } from '../ipc'
import {
  addToQueue,
  cancelCurrentDownload,
  getQueueInformation,
  pauseCurrentDownload,
  removeFromQueue,
  resumeCurrentDownload
} from './downloadqueue'

addHandler('install', async (_e, args) => {
  const dmQueueElement: DMQueueElement = {
    params: args,
    type: 'install',
    addToQueueTime: Date.now(),
    endTime: 0,
    startTime: 0
  }
  await addToQueue(dmQueueElement)
  // ... DLC fan-out for legendary — irrelevant to Steam, skip ...
})
```
Instead, `installFlowRegistration.ts` should call `SteamGame.install()`
directly (its real signature and the native-depot-only branch it must reach):
```typescript
// src/backend/storeManagers/steam/games.ts:678
async install(args: InstallArgs): Promise<InstallResult> {
  // ... resume-pending check, ensurePlatformsCaptured() ...
  if (this.isBottleEligible()) { /* D-07: OUT OF SCOPE, this branch must stay reachable but untested */ }
  // falls through to installNative() -> installDepotDownload() for the plain case
}

// L809 — the branch D-07 says MUST work:
private async installNative(args: InstallArgs): Promise<InstallResult> {
  return this.installDepotDownload(args, { os: hostSteamDepotOs() })
}
```
Reproduce the two things `addToQueue` did that the frontend actually depends
on (RESEARCH.md Q1 "What would a bypass lose"), as two direct calls inside
the new handler — a `sendGameStatusUpdate({status:'queued', ...})` call
before invoking `SteamGame.install()`, and, if sizing is needed,
`getSteamInstallSize()` (already imported by `downloadqueue.ts` from
`steam/games.ts`, same trivial import for this file).

**2. `uninstall` — reuse `uninstallGameCallback` UNCHANGED** (per RESEARCH Q2).
Full existing implementation to import as-is (`src/backend/utils/uninstaller.ts`
lines 94-150):
```typescript
export const uninstallGameCallback = async (
  event: Event,
  appName: string,
  runner: Runner,
  shouldRemovePrefix: boolean,
  shouldRemoveSetting: boolean
) => {
  sendGameStatusUpdate({ appName, runner, status: 'uninstalling' })
  const game = libraryManagerMap[runner].getGame(appName)
  const { title } = game.getGameInfo()
  let uninstalled = false
  try {
    await game.uninstall({ shouldRemovePrefix })
    uninstalled = true
  } catch (error) {
    notify({ title, body: i18next.t('notify.uninstalled.error', 'Error uninstalling') })
    logError(error, LogPrefix.Backend)
  }
  if (uninstalled) {
    if (shouldRemovePrefix) { removePrefix(appName, runner) }
    if (shouldRemoveSetting) { removeSettingsAndLogs(appName) }
    removeFixFile(appName, runner)
    // GAME-03: Steam uninstall is confirmed by the ACF poller — suppress duplicate toast
    if (runner !== 'steam') {
      notify({ title, body: i18next.t('notify.uninstalled') })
    }
    logInfo('Finished uninstalling', LogPrefix.Backend)
  }
  // Steam: ACF poller emits the real done signal — suppress it here (GAME-03)
  if (runner !== 'steam') {
    sendGameStatusUpdate({ appName, runner, status: 'done' })
  }
}
```
Electron's own registration site to mirror the `ipcMain.handle` translation of
(`src/backend/main.ts:1144`):
```typescript
addHandler('uninstall', uninstallGameCallback)
```
`ipcMain.handle('uninstall', uninstallGameCallback)` is a direct, unmodified
substitution — no reshaping needed (RESEARCH Q2's whole point: the function is
already runner-generic and `libraryManagerMap` is already resident via the
first-import fix).

**3. `checkGameUpdates` — reuse UNCHANGED, all runners** (D-12 follows D-05b).
Electron's existing handler body to import as-is (`src/backend/main.ts:742-756`):
```typescript
addHandler('checkGameUpdates', async (): Promise<string[]> => {
  let oldGames: string[] = []
  const { autoUpdateGames } = GlobalConfig.get().getSettings()
  for (const runner of Object.keys(
    libraryManagerMap
  ) as (keyof typeof libraryManagerMap)[]) {
    let gamesToUpdate = await libraryManagerMap[runner].listUpdateableGames()
    if (autoUpdateGames) {
      gamesToUpdate = autoUpdate(runner, gamesToUpdate)
    }
    oldGames = [...oldGames, ...gamesToUpdate]
  }
  return oldGames
})
```
Register the SAME logic under `ipcMain.handle('checkGameUpdates', ...)` —
either by importing this handler body's function directly if it is factored
out, or reproducing it verbatim with the same `libraryManagerMap` iteration
(the planner should check whether `main.ts` exports this as a standalone
function or only as an inline `addHandler` callback; if inline, extracting it
to a shared function both Electron's `main.ts` and the sidecar's
`installFlowRegistration.ts` import is the cleanest single-source-of-truth
move, consistent with `uninstallGameCallback`'s already-exported shape).

**4. `listSteamLibraryTargets` — the ACTUAL minimum read-gate (RESEARCH Q6),
NOT any `DownloadDialog` channel.** Existing implementation to import as-is
(`src/backend/storeManagers/steam/installLocation.ts` lines 60-67):
```typescript
export async function listSteamLibraryTargets(): Promise<SteamLibraryTarget[]> {
  const libraries = await getSteamLibraries()
  return libraries.map((path, index) => ({
    path,
    steamappsDir: join(path, 'steamapps'),
    isPrimary: index === 0
  }))
}
```
Electron's gating call to mirror (`src/backend/main.ts:954-962`):
```typescript
addHandler('listSteamLibraryTargets', async () =>
  isSteamNativeInstallEnabled() ? listSteamLibraryTargets() : []
)
```
This channel is load-bearing: `src/frontend/state/InstallGameModal.ts:51-58`
(`startSteamInstall`) awaits it uncaught before `installSteamGame()` — i.e.
before `window.api.install(...)` — ever fires:
```typescript
export const startSteamInstall = async (appName: string, gameInfo: GameInfo) => {
  const libraries = await window.api.listSteamLibraryTargets()
  if (libraries.length > 1) {
    useSteamInstallLocation.getState().open(appName, gameInfo, libraries)
    return
  }
  installSteamGame(appName, gameInfo)
}
```
Leaving `listSteamLibraryTargets` unported means REQ-30-04's install E2E
never reaches `install` at all (Invariant B keeps it non-fatal, but the
button silently never installs). **Do not port `DownloadDialog`'s six
channels instead of this one** — RESEARCH.md Q6 confirms
`openInstallGameModal` returns before `DownloadDialog` ever mounts for
`runner === 'steam'` (see `src/frontend/state/InstallGameModal.ts:66-74`'s
own code comment: *"Steam installs are delegated to the Steam client via
steam://install — they never use GamerLib's install modal..."*).

**Push side — `sendGameStatusUpdate`, zero new code needed beyond calling it**
(`src/backend/utils.ts:1351-1354`, the exact push primitive to call from the
new `install`/`uninstall`/`updateGame` handlers, already generic — confirmed
architecturally identical to Phase 29's `storeChanged` precedent):
```typescript
function sendGameStatusUpdate(payload: GameStatus) {
  sendFrontendMessage('gameStatusUpdate', payload)
  backendEvents.emit('gameStatusUpdate', payload)
}
```

---

### `src/backend/sidecar/handlers.ts` (MODIFIED — the call site where the two new registrations land)

**Analog:** itself. Current call sequence (`handlers.ts` lines 27-59):
```typescript
import { ipcMain } from './electronStub'
import { registerSteamFlows } from './steamFlowRegistration'
import { ensureStoresRegistered } from './storeRegistration'
import { registerStoreWriteHandlers } from './storeWriteHandlers'
// ... storePolicy / sidecarTransport imports ...

ipcMain.handle('health', async () => 'ok')

registerSteamFlows()
ensureStoresRegistered()
registerStoreWriteHandlers()
```
Add the two new imports and calls immediately after `registerSteamFlows()`
(same module-scope, unconditional call shape — no lazy registration, no
conditional gating):
```typescript
import { registerSteamAuthFlows } from './steamAuthFlowRegistration'
import { registerInstallFlows } from './installFlowRegistration'
// ...
registerSteamFlows()
registerSteamAuthFlows()
registerInstallFlows()
ensureStoresRegistered()
registerStoreWriteHandlers()
```
**Governing rule from this file's own docstring** (lines 20-24, copy this
constraint into both new modules' own docstrings too): *"Uses electronStub's
own `ipcMain` directly (not `backend/ipc`'s typed `addHandler`) because none
of this file's channels are entries in the existing `AsyncIPCFunctions`
contract — and no file under this directory may import the real electron
module."* — i.e. every `addHandler(...)` pattern excerpted above must be
translated to `ipcMain.handle(...)` from `./electronStub`, never
`backend/ipc`'s `addHandler`.

---

### `src/backend/sidecar/electronStub.ts` (MODIFIED — real `dialog.showOpenDialog`; logged `Notification`/`notify()` no-op)

**Analog:** itself — `shell.openExternal`'s forward-to-transport pattern
(lines 154-163), the exact shape D-09 says the dialog wiring must mirror:
```typescript
export const shell = {
  openExternal: async (url: string): Promise<void> => {
    transport?.openExternal(url)
  },
  showItemInFolder: (): void => {},
  trashItem: async (): Promise<void> => {},
  openPath: async (): Promise<string> => ''
}
```
**Current stub to replace** (lines 111-120 — DO NOT keep this canceled-always
shape for `showOpenDialog`, but DO preserve its exact return TYPE shape):
```typescript
export const dialog = {
  showErrorBox: (): void => {},
  showMessageBox: async () => ({ response: 0, checkboxChecked: false }),
  showMessageBoxSync: (): number => 0,
  showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
  showOpenDialogSync: (): undefined => undefined,
  showSaveDialog: async () => ({ canceled: true, filePath: undefined })
}
```
RESEARCH.md Q4's prescribed real implementation forwards through
`requestRustInvoke()` (imported from `./sidecarRpc`, mirroring how
`shell.openExternal` forwards through `transport.openExternal` — but note
`requestRustInvoke` is req/resp, `transport.openExternal` is fire-and-forget,
so this is a `rustInvoke`-shaped forward, not an `openExternal`-shaped one):
```typescript
showOpenDialog: async (
  _window?: unknown,
  options?: unknown
): Promise<{ canceled: boolean; filePaths: string[] }> => {
  const result = await requestRustInvoke('dialog_open', [options])
  // Rust returns a single path or null; translate into Electron's shape —
  // preserve EXACTLY, callers destructure { filePaths, canceled }.
  return {
    canceled: result === null,
    filePaths: result ? [result as string] : []
  }
}
```
Only `showOpenDialog` gets real behavior — the other five `dialog.*` members
stay stubbed (D-09 scopes to open-directory only; the rest is Phase 31).

**Current SILENT no-op — the live REQ-30-07 gap RESEARCH.md's Pitfall 3
identifies** (`src/backend/dialog/dialog.ts` lines 61-72, DO NOT leave
as-is):
```typescript
function notify({ body, title }: NotifyType) {
  if (Notification.isSupported() && !isSteamDeckGameMode) {
    const mainWindow = getMainWindow()
    const notify = new Notification({ body, title })
    notify.on('click', () => mainWindow?.show())
    notify.show()
  }
}
```
No `else` branch — under the sidecar, `Notification.isSupported()` is
already `false` (`electronStub.ts` lines 124-127), so this silently does
nothing. The fix (either site works; `dialog.ts` is the one place Electron
AND the sidecar both funnel through, so fixing it there benefits both
builds — matches RESEARCH.md's "State of the Art" table row):
```typescript
function notify({ body, title }: NotifyType) {
  if (Notification.isSupported() && !isSteamDeckGameMode) {
    const mainWindow = getMainWindow()
    const notify = new Notification({ body, title })
    notify.on('click', () => mainWindow?.show())
    notify.show()
  } else {
    logInfo(`notify() skipped (Notification unsupported or Game Mode): ${title}`, LogPrefix.Backend)
  }
}
```

---

### `src-tauri/src/main.rs` (MODIFIED — `dispatch_rust_channel` new arm, `AppHandle` threading, plugin registration)

**Analog:** itself — the existing four `keyring_*` match arms and their
error-mapping convention (lines 206-277, excerpted for the flat-`String`
error convention and the trailing catch-all only — full arms omitted, they
are unrelated to dialog):
```rust
fn dispatch_rust_channel(channel: &str, args: &[Value]) -> Result<Value, String> {
    match channel {
        "keyring_get" => match Entry::new(KEYRING_SERVICE, KEYRING_ACCOUNT) {
            Ok(entry) => match entry.get_password() {
                Ok(secret) => Ok(Value::String(secret)),
                Err(keyring::Error::NoEntry) => Ok(Value::Null),
                Err(e) => {
                    eprintln!("[shell] keyring {channel} failed: {e:?}");
                    Err(format!("keyring:unavailable:{e}"))
                }
            },
            Err(e) => { /* same error-mapping shape */ Err(format!("keyring:unavailable:{e}")) }
        },
        // ... keyring_set / keyring_delete / keyring_available ...
        _ => Err(format!("rustInvoke:unknown-channel:{channel}")),
    }
}
```
**Signature change needed** (RESEARCH.md Q4, item 5): current signature has
no `AppHandle` parameter; the dialog plugin's blocking folder-picker needs
one. Widen to:
```rust
fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String> {
    match channel {
        // ... existing keyring_* arms unchanged, app unused there ...
        "dialog_open" => {
            let result = app.dialog().file().blocking_pick_folder();
            Ok(match result {
                Some(path) => Value::String(path.to_string()),
                None => Value::Null,
            })
        }
        _ => Err(format!("rustInvoke:unknown-channel:{channel}")),
    }
}
```
**The dispatch call site to update** (`start_reader`'s `rustInvoke` branch,
lines 424-449) — currently only clones `state`, NOT `app`, into the spawned
worker thread:
```rust
// CURRENT — app not available in this closure:
let worker_state = state.clone();
thread::spawn(move || {
    let result = dispatch_rust_channel(&channel, &args);
    let response = match result {
        Ok(v) => serde_json::json!({ "id": id, "ok": true, "result": v }),
        Err(e) => serde_json::json!({ "id": id, "ok": false, "error": e }),
    };
    let _ = worker_state.write_raw(&response);
});
```
Add `let worker_app = app.clone();` alongside `worker_state` and pass
`&worker_app` into the widened `dispatch_rust_channel(&channel, &args, &worker_app)`
call — this is the concrete, scoped patch; `AppHandle` is already `Clone`
(used elsewhere in this file's `.emit()` calls).

**Precedent shape to model the whole addition on** (`27-PROOF.md` / this
file's own header comment, lines 337-341): the `openExternal` frame was
previously silently dropped because `start_reader()` had no branch for it —
fixed by adding an explicit branch (lines 452-466, excerpted as the
"previously-missing dispatch arm, fixed minimally" precedent):
```rust
if kind == Some("openExternal") {
    if let Some(url) = value.get("args").and_then(|v| v.as_array()).and_then(|a| a.first()).and_then(|v| v.as_str()) {
        if let Err(e) = app.opener().open_url(url, None::<&str>) {
            eprintln!("[shell] openExternal failed: {e}");
        }
    } else {
        eprintln!("[shell] openExternal frame missing a string URL in args[0]");
    }
    continue;
}
```
`dialog_open` differs from this precedent in one respect the plan must not
miss: `openExternal` is fire-and-forget (`kind == "openExternal"`, no
response frame), but `dialog_open` is a `rustInvoke` req/resp — it already
rides the EXISTING `rustInvoke` branch (lines 424-449) once
`dispatch_rust_channel`'s new match arm exists; no new frame-kind branch is
needed in `start_reader`, only the new match arm + the `app` threading fix.

**Plugin registration site** (`main.rs` line 478-479, the pattern a dialog
plugin registration mirrors — confirm exact line before writing the task,
per RESEARCH.md Open Question 1):
```rust
fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        // ADD: .plugin(tauri_plugin_dialog::init())
```
**Cargo/capability additions needed** (RESEARCH.md Q4, `[ASSUMED]` per the
Package Legitimacy Audit — gate behind `checkpoint:human-verify`):
- `Cargo.toml`: add `tauri-plugin-dialog = "2.7.2"` (name/version confirmed
  on crates.io this research session, but flagged `[ASSUMED]` — not sourced
  from official docs/Context7).
- `capabilities/default.json`: currently
  `"permissions": ["core:default", "opener:default", "opener:allow-open-url"]`
  — add the dialog plugin's default permission (or a scoped
  `dialog:allow-open` equivalent) or the call is permission-denied even
  though registered.

---

### `src/common/types/sidecarTransport.ts` (MODIFIED — new `RUST_INVOKE_CHANNELS` entry)

**Analog:** itself — the existing `RUST_KEYRING_*` constant block + the
allowlist array (lines 133-155):
```typescript
/** Rust-side channel name: read the Steam refresh token from the OS Keychain via `keyring`. */
export const RUST_KEYRING_GET = 'keyring_get' as const
// ... RUST_KEYRING_SET / RUST_KEYRING_DELETE / RUST_KEYRING_AVAILABLE ...

/**
 * Single source of truth for the sidecar→Rust `rustInvoke` channel allowlist (T-28-03).
 * `requestRustInvoke()` in sidecarRpc.ts refuses to emit a frame for any channel not listed
 * here. Must be kept in sync with Rust's `dispatch_rust_channel` match arms (plan 28-02).
 */
export const RUST_INVOKE_CHANNELS = [
  RUST_KEYRING_GET,
  RUST_KEYRING_SET,
  RUST_KEYRING_DELETE,
  RUST_KEYRING_AVAILABLE
] as const
```
Add, following the identical naming/doc convention:
```typescript
/** Rust-side channel name: open a native folder-picker dialog via tauri-plugin-dialog. */
export const RUST_DIALOG_OPEN = 'dialog_open' as const

export const RUST_INVOKE_CHANNELS = [
  RUST_KEYRING_GET,
  RUST_KEYRING_SET,
  RUST_KEYRING_DELETE,
  RUST_KEYRING_AVAILABLE,
  RUST_DIALOG_OPEN
] as const
```
This is the exact "kept in sync with Rust's `dispatch_rust_channel` match
arms" comment already on the block — the plan's Rust task and TS task must
land the new channel name identically on both sides in the same change, or
`requestRustInvoke('dialog_open', ...)` rejects before ever reaching Rust.

**Caller shape to mirror** (`src/backend/sidecar/sidecarRpc.ts:258-289`,
`requestRustInvoke()`'s full signature — already generic, no change needed
here beyond the allowlist entry above):
```typescript
export function requestRustInvoke(
  channel: RustInvokeChannel,
  args: unknown[]
): Promise<unknown> {
  if (!(RUST_INVOKE_CHANNELS as readonly string[]).includes(channel)) {
    return Promise.reject(new Error(`rustInvoke: channel not allowed: ${String(channel)}`))
  }
  return new Promise((resolve, reject) => {
    const id = randomUUID()
    const timer = setTimeout(() => {
      rustPending.delete(id)
      reject(new Error(`rustInvoke timed out after ${RUST_INVOKE_TIMEOUT_MS}ms: ${channel}`))
    }, RUST_INVOKE_TIMEOUT_MS)
    timer.unref()
    rustPending.set(id, {
      resolve: (value: unknown) => { clearTimeout(timer); resolve(value) },
      reject: (error: Error) => { clearTimeout(timer); reject(error) },
      timer
    })
    const request: SidecarRpcRequest = { id, kind: 'rustInvoke', channel, args }
    writeLine(request)
  })
}
```
One existing caller to model the `electronStub.ts` `dialog.showOpenDialog`
forward on (any `keyring_*` call site in `src/backend/sidecar/keyringTokenStore.ts`
follows the identical `await requestRustInvoke(RUST_KEYRING_GET, [])`
call shape — same file family, not re-excerpted here since the shape is
already shown inline above in the `showOpenDialog` replacement).

---

## Shared Patterns

### No file under `src/backend/sidecar/` imports the real `electron` module
**Source:** `src/backend/sidecar/handlers.ts` lines 20-24 (docstring), enforced
structurally by `bootstrap.ts`'s `Module._load` hook.
**Apply to:** Both new registration modules — always `import { ipcMain } from
'./electronStub'`, never `backend/ipc`'s typed `addHandler`.

### Curated-import discipline — only import what the flow needs
**Source:** `steamFlowRegistration.ts`'s docstring, paragraph 3 (lines 22-28).
**Apply to:** Both new modules. `installFlowRegistration.ts` is the one
exception the discipline itself anticipates — `uninstall`/`checkGameUpdates`
"genuinely span multiple store managers" (checklist step 2's own carve-out,
confirmed cost-free per RESEARCH Q2), so importing `libraryManagerMap` there
is correct, not a discipline violation.

### The load-bearing `import '../storeManagers'` first-import fix
**Source:** `steamFlowRegistration.ts` lines 32-46 (the 27-05 esbuild-only
crash class).
**Apply to:** Both new modules, defensively, even though `handlers.ts`'s call
order already triggers it once via `steamFlowRegistration.ts` — RESEARCH.md
Assumption A3 flags this ordering as unverified against jest (jest cannot
catch a module-init-order regression; only a real `npm run build` +
`npm run tauri:dev` smoke test can, per RESEARCH Q8).

### Status-transition push — `sendGameStatusUpdate`, zero Rust changes
**Source:** `src/backend/utils.ts:1351-1354`, confirmed architecturally
identical to Phase 29's `storeChanged` precedent (`STORE_CHANGED_CHANNEL`,
`src/common/types/sidecarTransport.ts:236-242`).
**Apply to:** `installFlowRegistration.ts`'s `install`/`uninstall`/`updateGame`
handlers — call it directly, do not build a new push mechanism.

### Sidecar→Rust request/response — reuse `requestRustInvoke()`/`dispatch_rust_channel()`
**Source:** `src/backend/sidecar/sidecarRpc.ts:258-289` +
`src-tauri/src/main.rs:206-277`.
**Apply to:** `electronStub.ts`'s new `dialog.showOpenDialog` body. Do not
invent a new correlated-request mechanism (checklist step 6 / D-09
explicit).

### Invariant B — unported channels stay non-fatal
**Source:** `src/common/types/sidecarTransport.ts:160-176`
(`UNPORTED_CHANNEL_MARKER` doc comment) + `sidecarRpc.ts:84-99`
(`dispatchInvoke`'s no-handler branch).
**Apply to:** Every handler this phase does NOT add (e.g. the five
`DownloadDialog` channels RESEARCH.md confirms are out of scope) — they must
keep rejecting with this marker, not start throwing or crashing.

---

## No Analog Found

None. Every file in this phase's scope has an exact, same-layer analog
already in the codebase (`steamFlowRegistration.ts` for both new modules,
`handlers.ts`/`electronStub.ts`/`sidecarRpc.ts`/`main.rs` for their own
modifications). This is a porting phase, not a new-pattern phase — RESEARCH.md's
own framing ("reuse what's already proven and already resident") holds for
100% of the file list.

## Metadata

**Analog search scope:** `src/backend/sidecar/`, `src/backend/downloadmanager/`,
`src/backend/storeManagers/steam/`, `src/backend/utils/`, `src/backend/main.ts`,
`src/frontend/state/`, `src-tauri/src/main.rs`, `src/common/types/`.
**Files scanned (direct reads this session):** `steamFlowRegistration.ts`,
`handlers.ts`, `electronStub.ts`, `sidecarRpc.ts`, `sidecarTransport.ts`,
`downloadmanager/ipc_handler.ts`, `utils/uninstaller.ts`,
`storeManagers/steam/games.ts` (install/installNative/installDepotDownload
regions), `storeManagers/steam/installLocation.ts`, `utils.ts`
(`sendGameStatusUpdate`), `dialog/dialog.ts` (`notify`), `main.ts`
(QR login handlers, `checkGameUpdates`, `uninstall` registration),
`frontend/state/InstallGameModal.ts`, `src-tauri/src/main.rs`
(`dispatch_rust_channel`, `start_reader`, plugin registration),
`__tests__/skeletonFlows.test.ts`, `__tests__/electronUntouched.test.ts`.
**Pattern extraction date:** 2026-07-22
