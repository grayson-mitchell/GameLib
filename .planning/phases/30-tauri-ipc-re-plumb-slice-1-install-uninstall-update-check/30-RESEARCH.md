# Phase 30: Tauri IPC re-plumb slice 1 (install/uninstall/update-check) - Research

**Researched:** 2026-07-22
**Domain:** Electron→Tauri sidecar IPC porting (GameLib-internal codebase archaeology, not external library selection)
**Confidence:** HIGH — every claim below is grounded in a specific file:line read during this session; no web/library research was needed or performed.

## Summary

The single biggest correction this research makes to 30-CONTEXT.md's premise: **Steam installs and uninstalls never render `DownloadDialog` or `UninstallModal` at all.** `src/frontend/state/InstallGameModal.ts:71` and `src/frontend/screens/Game/GameSubMenu/index.tsx:330-331` are explicit, commented chokepoints that bypass GameLib's own install/uninstall modals for `runner === 'steam'` and call `window.api.install(...)` / `window.api.uninstall(...)` directly. The code comment at `InstallGameModal.ts:66-70` states this outright: *"Steam installs are delegated to the Steam client via steam://install — they never use GamerLib's install modal (which would call getInstallInfo and loop forever on 'Getting download size…')."* This means D-10's entire enumerated candidate list (`getPrivateBranchPassword`, `requestAppSettings`, `requestGameSettings`, `getGameOverride`, `getGameSdl`, `checkDiskSpace`) is **not on the Steam depot install path at all** — confirmed independently below, channel by channel. The channel that actually gates the real Steam install chokepoint is `listSteamLibraryTargets` (D-09's override-picker data source), which is awaited with no `.catch()` before `installSteamGame()` ever fires — this is the genuinely load-bearing "minimum read" channel Q6 was looking for, and it was absent from 30-CONTEXT.md's candidate list.

Q1 (D-05a): a direct `SteamGame.install()` bypass is the correct call. `downloadqueue.ts`'s only Steam-specific value-add (`getSteamInstallSize` sizing at enqueue time) is trivially reproducible; its `initQueue`/`libraryManagerMap`/`onConnectivityChange` import-time surface is real work with zero Phase-30 payoff, and the queue's pause/resume/cancel/UI (`getDMQueueInformation`, `removeFromDMQueue`) is explicitly Phase 32 territory per 30-CONTEXT `## Deferred Ideas`.

Q2 (D-05b): CONFIRMED — `storeManagers/index.ts` is already force-imported by `steamFlowRegistration.ts:47` (the load-bearing 27-05 fix), and `checkGameUpdates`/`uninstallGameCallback` are already runner-generic in Electron's own `main.ts`/`uninstaller.ts`. Reuse both unchanged; "Steam-only" buys nothing and would fork behavior from Electron for zero benefit.

Q3: the QR login channel set is small and every piece needed for the token seam is already correctly wired by Phase 28 — `getTokenStore()` in the sidecar process already resolves to `SidecarKeyringTokenStore` (installed in `bootstrap.ts:98`), and `startQRLogin` already calls `getTokenStore().setToken(...)`, never `configStore` directly for the token.

Q4: `tauri-plugin-dialog` is NOT currently a dependency (`Cargo.toml`, `capabilities/default.json`, `tauri.conf.json`'s `"plugins": {}` all confirm this). Wiring D-09's open-directory picker is real, scoped Rust work: a new Cargo dependency, a new capability permission, a new `dispatch_rust_channel` match arm, and threading `AppHandle` into the `rustInvoke` dispatch closure (currently only `state` is cloned into that spawned thread, not `app`).

Q5: CONFIRMED — `sendGameStatusUpdate` (`utils.ts:1349-1352`) is a two-line function (`sendFrontendMessage` + an in-process `EventEmitter.emit`), architecturally identical to the `storeChanged` precedent. Zero `src-tauri` changes needed.

Q7: none of Phase 30's newly-ported channels are called at frontend module scope (verified by call-site inspection of every D-01/D-04/D-10-candidate consumer) — every one fires inside a `useEffect`/event-handler, which by definition runs after React's initial render, i.e. after `bootErrorSurface.ts`'s `root.childElementCount > 0` guard already makes any error non-fatal (console-only). The remaining risk is a shape mismatch (a handler that now resolves but with a different shape than the frontend expects), not a boot crash.

**Primary recommendation:** Build `installFlowRegistration.ts` as a direct `SteamGame.install()`/`uninstall()`/`updateGame` bypass (no `downloadqueue.ts` port), reuse `checkGameUpdates`/`uninstallGameCallback` unchanged via the full `libraryManagerMap`, and treat `listSteamLibraryTargets` (not the `DownloadDialog` read set) as the actual minimum-read channel this phase must port for REQ-30-04's install chokepoint to complete.

## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01 through D-12 in `.planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-CONTEXT.md` are LOCKED (QR-only login folded in first; two-token divergence accepted/documented; automated-tests-now/live-scan-deferred sign-off; queue-vs-bypass and Steam-only-vs-full-map left to research — see D-05a/D-05b below; only the native depot-download branch must work, bottle/bridge stay unported; two new curated modules `steamAuthFlowRegistration.ts`/`installFlowRegistration.ts`, `steamFlowRegistration.ts` untouched; `openDialog` gets real behavior via `rustInvoke`, `Notification` stays a **logged** no-op; port the MINIMUM read-only channels the modal needs and declare them explicitly; deliverable is a declared ported-channel list plus the SEAM.md update). Do not re-litigate these — this research surfaces one **Tension** note below where evidence complicates D-10's premise (see "Tension" callout in Q6), not a contradiction of the locked decision itself (the decision to port a *minimum* set stands; what belongs in that set is corrected).

### Claude's Discretion
- **D-05a** — port `downloadqueue.ts` into the sidecar, or register a direct `SteamGame.install()` bypass. Resolved below (Q1) — **bypass**, with reasons recorded.
- **D-05b** — Steam-only curated import vs. the full `libraryManagerMap`. Resolved below (Q2) — **full map, unchanged**, reasons recorded.
- **D-12** — `checkGameUpdates` Steam-only vs. all-runners follows from D-05b: **all runners**, consistent with reusing the handler unchanged.

### Deferred Ideas (OUT OF SCOPE)
Credential/SteamGuard/TOTP login and sign-out; byte-level `progressUpdate` throughput (Phase 32); DownloadManager queue semantics under Tauri (pause/resume/cancel, `removeFromDMQueue`, `getDMQueueInformation`, startup resume) unless D-05a pulled the queue port forward — **it did not, per this research's Q1 finding**, so this stays fully deferred to Phase 32; CrossOver bottle and macOS bridge install branches; real `Notification`; the full `dialog` cluster beyond open-directory; the settings/config cluster beyond the minimum; converging Electron/Tauri secret policies; a public `onDidChange` store API.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-30-01 | Port Steam QR login channel + token round-trip via `SidecarKeyringTokenStore` | Q3 — enumerated channel list below; token seam already correctly wired by Phase 28 (verified: `bootstrap.ts:98`, `user.ts:377`) |
| REQ-30-02 | Document the two-token divergence in SEAM.md Accepted Constraints + code comment | No new research needed — this is a documentation task; Q3's evidence (`startQRLogin` writes only via `getTokenStore()`, never `configStore` directly) is the supporting fact to cite |
| REQ-30-03 | Sign-off = automated tests; live QR scan deferred as a single UAT item naming both the scan and the install E2E it gates | Q8 — Validation Architecture section below |
| REQ-30-04 | `install`/`uninstall`/`updateGame`/`checkGameUpdates` on the sidecar, native depot-download branch only; queue-vs-bypass and Steam-only-vs-full-map decided with reasons recorded | Q1 + Q2 below — both resolved with evidence and explicit RECOMMENDATION |
| REQ-30-05 | `gameStatusUpdate` push, zero `src-tauri` changes | Q5 below — confirmed |
| REQ-30-06 | Two new curated modules, `steamFlowRegistration.ts` untouched, no sidecar file imports real `electron` | Confirmed by direct reading of `steamFlowRegistration.ts`/`handlers.ts` as the template; see "Architecture Patterns" |
| REQ-30-07 | `openDialog` real behavior via `rustInvoke`; `notify()` logs instead of silently no-opping | Q4 below — concrete Rust-side gap list; plus a **new** finding: `notify()`'s current no-op is SILENT, not logged — a real gap against this requirement today |
| REQ-30-08 | Enumerated declared list of every ported channel; SEAM.md §3→§1 move | Q3 + Q6 below produce the enumerated lists this requirement needs verbatim |
| REQ-30-09 | Additive/reversible invariant + Invariants A/B preserved | Q7 below — concrete regression-risk analysis and the guard to add |

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| QR login session (steam-session/steam-user) | Node sidecar (backend) | Rust (keyring only) | Pure-JS network/auth logic; Rust's only role is the OS Keychain seam (Phase 28), already wired |
| Install/uninstall/update-check orchestration | Node sidecar (backend) | — | `SteamGame`/`libraryManagerMap` are plain Node classes; no Rust involvement beyond the existing generic push/openExternal rails |
| Native depot download (bytes, sha1, ACF write) | Node sidecar (backend) | — | Confirmed pure Node + `fs`, no CrossOver/Wine dispatch on this branch (games.ts comments, verified) |
| Directory picker (`openDialog`) | Rust shell (`src-tauri`) | Node sidecar (dispatch via `rustInvoke`) | Native OS file dialogs are a Rust/OS-API concern; sidecar only requests and awaits the result |
| Status/progress push (`gameStatusUpdate`) | Node sidecar → Rust relay (already generic) | — | `sendFrontendMessage` → `frontend_message` is channel-name-agnostic; no new Rust code needed |
| Renderer install/uninstall UI (chokepoints) | Frontend (React) | — | `InstallGameModal.ts`/`GameSubMenu` already bypass GameLib's own modals for Steam — the UI surface this phase touches is smaller than 30-CONTEXT assumed |

## Q1 (D-05a) — Queue port vs direct bypass

### Evidence: `downloadqueue.ts`'s import-time side effects

`src/backend/downloadmanager/downloadqueue.ts` top-of-file imports (verified by direct read):

```
import { getFileSize, removeFolder, sendGameStatusUpdate } from '../utils'
import { installQueueElement, updateQueueElement } from './utils'
import { sendFrontendMessage } from '../ipc'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'
import { notify } from '../dialog/dialog'
import i18next from 'i18next'
import { createRedistDMQueueElement } from 'backend/storeManagers/gog/redist'
import { getSteamInstallSize } from 'backend/storeManagers/steam/games'
import { onConnectivityChange } from 'backend/online_monitor'
import { libraryManagerMap } from 'backend/storeManagers'   // static top-level import
import { downloadManager } from './electronStores'
```

Import-time (module-scope, i.e. side effects that run merely by `require`-ing the file) behavior, verified line-by-line:

- `let currentElement: DMQueueElement | null = getFirstQueueElement()` — reads `downloadManager.get('queue', [])` at import time (a real disk read via `TypeCheckedStoreBackend`/`fileStore.ts` — safe, already-proven Phase 29 machinery, but a genuinely new side effect not currently paid by the sidecar).
- `onConnectivityChange((status) => {...})` — registers an `EventEmitter.on()` listener at import time (`online_monitor.ts`'s `connectivityEmitter`). Harmless (no timers fire from this registration alone — `online_monitor.ts`'s timers/pings only start when `initOnlineMonitor()` is explicitly called from `main.ts`, which the sidecar never calls).
- `gog/redist.ts` (imported for `createRedistDMQueueElement`) top-imports `backend/config` (`GlobalConfig`), `backend/online_monitor` (`isOnline`), `backend/utils` (`axiosClient`) — all already resident in the sidecar via other paths, no new Electron-API surface.
- `dialog/dialog.ts` (imported for `notify`) imports `{ dialog, Notification } from 'electron'` — resolves through the `Module._load` hook to `electronStub.ts`'s `dialog`/`Notification` exports (already stubbed, safe — `Notification.isSupported()` returns `false` in the stub, so `notify()` is already a no-op there).

**None of these reach the real `electron` module** — the `Module._load` hook intercepts every `require('electron')` process-wide (installed by `bootstrap.ts` before any backend import), not just inside `src/backend/sidecar/`. The actual risk class for a file OUTSIDE `src/backend/sidecar/` importing Electron APIs is not "crashes because electron doesn't exist" (the stub always resolves) — it's "silently returns wrong/no-op behavior for something the flow actually needed to be real." Nothing in `downloadqueue.ts`'s reachable functions needs a *different* Electron behavior than what `electronStub.ts` already provides.

### Does Phase 29 D-15 make the port cheap, as 30-CONTEXT suspected?

Partially, but the suspicion overstates the benefit. `downloadManager` (`src/backend/downloadmanager/electronStores.ts`) is already a thin, 12-line module with no import-time coupling to `libraryManagerMap` — confirmed. But `downloadqueue.ts` ITSELF (not `downloadManager`) is the thing that would need porting for D-05a's "port the queue" option, and `downloadqueue.ts` still does its own static `import { libraryManagerMap } from 'backend/storeManagers'` (dereferenced only inside function bodies — a documented, deliberate pattern per the file's own header comment about the 27-05/esbuild-bundle require-crash class of bug). D-15's extraction removes ONE historical import-time hazard (the store itself), not the queue module's own remaining import surface (`getSteamInstallSize`, `createRedistDMQueueElement`, `onConnectivityChange`, `notify`, `i18next`). The queue's own weight was never really about `downloadManager` — it was about the four cross-runner concerns (GOG redist elements, DLC fan-out for `legendary`, pause/resume/cancel/notification bookkeeping) that Steam's depot-download flow does not need at all.

### What would a bypass lose, and does the frontend need it?

A direct bypass loses: `getDMQueueInformation` (queue+finished list for the Download Manager screen), `removeFromDMQueue`, `pauseCurrentDownload`/`resumeCurrentDownload`, `cancelDownload`, and the DLC/GOG-redist fan-out in `install`'s handler.

Checked whether the Steam depot install path needs these on the frontend:
- The Steam install chokepoint (`installSteamGame`, `src/frontend/state/InstallGameModal.ts:28-43`) calls `window.api.install({...})` directly — it does **not** read `getDMQueueInformation`/`removeFromDMQueue` to render anything; those are Download Manager screen concerns (`src/frontend/screens/DownloadManager/`), which is explicitly the Phase 32 cluster per 30-CONTEXT `## Deferred Ideas` ("DownloadManager queue semantics under Tauri... — Phase 32, unless D-05a pulls the queue port forward").
- `sendGameStatusUpdate({status: 'queued'})` — the ONE thing `addToQueue()` does that the frontend's button-state rendering (`gameStatusUpdate`/D-06) actually depends on — is trivially reproducible in the bypass with a single direct call, no queue infrastructure needed.
- `getSteamInstallSize()` sizing (D-04's `?? MB` fix) — also trivially reproducible: it's a plain async function already imported by `downloadqueue.ts` from `steam/games.ts`; the bypass can call it directly.

### RECOMMENDATION (Q1 / D-05a)

**Register a direct `SteamGame.install()`/`uninstall()`/`updateGame` bypass in `installFlowRegistration.ts`. Do NOT port `downloadqueue.ts`.**

Reason (for REQ-30-04's "record the reason" obligation): `downloadqueue.ts`'s only genuinely Steam-relevant behavior (status-queued push + install-size sizing) is two direct function calls, trivially reproduced without the module. Everything else the queue provides — GOG-redist fan-out, legendary DLC fan-out, pause/resume/cancel, the Download Manager screen's list — is either irrelevant to the Steam runner or explicitly Phase 32's own cluster. Porting the queue would mean absorbing Phase 32's entire surface into Phase 30 for zero Steam-specific benefit, and it would resurrect exactly the class of import-time coupling (`libraryManagerMap` dereferenced across a whole cross-runner module) that the curated-import discipline (checklist step 2) exists to avoid. Phase 32 should build its OWN curated queue port when it needs pause/resume/cancel for real, informed by whatever this phase's bypass proves about `sendGameStatusUpdate` timing.

## Q2 (D-05b) — Steam-only curated import vs full `libraryManagerMap`

### VERIFIED: `storeManagers/index.ts` is already force-imported

`src/backend/sidecar/steamFlowRegistration.ts:47` — `import '../storeManagers'` — the module's own docstring (lines 32-46) explains this is a **load-bearing FIRST import**, added specifically to fix the 27-05 `SteamLibraryManager is not a constructor` esbuild-bundle-only crash. This import runs at module scope, unconditionally, every time the sidecar boots. `storeManagers/index.ts` (per its own well-established role, confirmed by `SEAM.md` §"Deferred" table listing `libraryManagerMap`'s six managers as GOG/Legendary/Nile/Zoom/Sideload/Steam, all eagerly constructed) means **all six `LibraryManager` instances already exist in the sidecar process today**, for the `launch`/`refreshLibrary` flows already shipped in Phase 27. This confirms 30-CONTEXT's suspicion exactly: "Steam-only" buys **zero** import-graph savings, because the cost is already sunk.

### Consequence for `uninstallGameCallback` and `checkGameUpdates`

- `src/backend/utils/uninstaller.ts`'s `uninstallGameCallback` (verified by direct read) is already runner-generic: `const game = libraryManagerMap[runner].getGame(appName)`. Its only other imports are `GlobalConfig`, path constants, `notify` (dialog stub, safe), `logError`/`logInfo`, `sendGameStatusUpdate`, `i18next` — none require reshaping for a headless sidecar.
- `src/backend/main.ts:742-756`'s `checkGameUpdates` handler (verified by direct read) is also already runner-generic: `for (const runner of Object.keys(libraryManagerMap) as ...) { gamesToUpdate = await libraryManagerMap[runner].listUpdateableGames(); if (autoUpdateGames) gamesToUpdate = autoUpdate(runner, gamesToUpdate) }`. `libraryManagerMap[runner].listUpdateableGames()` for the non-Steam runners is the SAME function Electron calls today unmodified — this is not new code the sidecar would be exercising for the first time in a materially different way; it is literally the same call graph Electron already runs (and must already tolerate the case where e.g. `legendary`/`gogdl` CLI binaries are absent on a given machine, since that's a normal Electron-build condition too). Steam's own `SteamLibraryManager.listUpdateableGames()` (verified, `steam/library.ts:786-788`) is presently a stub that returns `[]` — so on the Steam side there is nothing to break either way.
- `getGameOverride`/`getGameSdl` (both hardcoded to `libraryManagerMap['legendary']` in `main.ts`) and `getPrivateBranchPassword`/`setPrivateBranchPassword` (both hardcoded to `libraryManagerMap['gog']`) are NOT runner-parameterized at all — they always dereference a specific runner's manager regardless of which game the frontend is asking about. This is existing Electron behavior, not something Phase 30 changes.

### RECOMMENDATION (Q2 / D-05b)

**Reuse `uninstallGameCallback` and `checkGameUpdates` completely unchanged (import from their existing modules, register the same functions as handlers) rather than writing Steam-only reshaped versions.**

Reason (for REQ-30-04's "record the reason" obligation): the import cost `libraryManagerMap` would add is already fully paid by `steamFlowRegistration.ts`'s existing load-bearing first import — verified, not assumed. A Steam-only reshape would (a) buy zero import-graph savings, (b) diverge Tauri's `uninstall`/`checkGameUpdates` behavior from Electron's for no reason, creating exactly the kind of silent-divergence risk D-12 warns against, and (c) throw away tested, working code to write new code with the same bug surface. **D-12 follows directly: `checkGameUpdates` attempts all runners**, consistent with reusing the handler unmodified.

## Q3 (REQ-30-01) — The minimum QR login surface

### GlobalState.tsx's login gate — exactly what it reads

- **Initial state (mount-time, synchronous):** `src/frontend/state/GlobalState.tsx:236-239` — `steam: { library: [], username: steamConfigStore.get_nodefault('userData')?.username }`. This is a synchronous read of the **already-hydrated store snapshot** (`steamConfigStore` is part of `BOOT_SET_STORES`, confirmed by `storePolicy.ts` — see below), not a new IPC call. **No new channel needed for this read.**
- **Post-login state update:** `GlobalState.tsx:725-739`'s `steamLogin(result: {status, username})` sets `this.state.steam` directly from the poll's OWN return value and triggers `this.refreshLibrary({runInBackground: true, library: 'steam'})` — it does **not** re-read any store or call a separate "getUserInfo"-style channel for QR. (Contrast with the credential-login branch, out of scope per D-02, which DOES call `getSteamUserInfo` — `SteamLogin/index.tsx:224,251` — but only on the credential/guard success paths, never QR.)

### The QR flow's exact channel set (verified in `SteamLogin/index.tsx`, `preload/api/steam.ts`, `main.ts`)

| Channel | Backend implementation | Frontend call site | Needed for QR? |
|---|---|---|---|
| `checkSteamInstalled` | `main.ts:947` → `SteamUser.isSteamClientInstalled()` | `SteamLogin/index.tsx:167` (mount check) | **Yes** — gates whether the QR tab even renders |
| `steamStartQR` | `main.ts:925` → `SteamUser.startQRLogin()` | `SteamLogin/index.tsx:115` | **Yes** |
| `steamPollQR` | `main.ts:926` → `SteamUser.pollQRLogin()` | `SteamLogin/index.tsx:132` | **Yes** |
| `steamStartCredentials`/`steamSubmitGuard`/`steamPollCredential`/`getSteamUserInfo` | `main.ts` various | `SteamLogin/index.tsx` credential tab | **No** — D-02 explicitly excludes credential/SteamGuard |
| `logoutSteam` | `main.ts:967` (listener) | `GlobalState.tsx:742` `steamLogout` | **No** — D-02 explicitly excludes sign-out; safe to leave unported (non-fatal per Invariant B) |

**Enumerated minimum QR login channel set (for REQ-30-08's declared list):** `checkSteamInstalled`, `steamStartQR`, `steamPollQR`.

### Token write path — CONFIRMED already correctly seamed

`src/backend/storeManagers/steam/user.ts:377` (`startQRLogin`'s `'authenticated'` handler) calls `await getTokenStore().setToken(session.refreshToken)` — never `configStore` (which in this file means Steam's OWN `steamConfigStore`, imported from `./electronStores`, distinct from the shared global `configStore`) for the token itself. Separately, the SAME handler calls `configStore.set('isLoggedIn', true)` and (once the CM connect resolves) `configStore.set('userData', {username, steamId})` — these are non-secret fields on `steamConfigStore`, already safe to write via the sidecar's proven Phase 29 `fileStore.ts` write path (no special handling needed).

`src/backend/sidecar/bootstrap.ts:41-42,98` — `import { setTokenStore as installTokenStore } from '../storeManagers/steam/tokenStore'` / `import { SidecarKeyringTokenStore } from './keyringTokenStore'` / `installTokenStore(new SidecarKeyringTokenStore())` — this call already runs unconditionally at sidecar boot (Phase 28), meaning `getTokenStore()` **already** returns the keyring-backed implementation process-wide before `steamAuthFlowRegistration.ts` is ever imported. **No new wiring is needed for the token seam — Phase 28 already made this correct by construction, confirming Q3's question with certainty rather than assumption.**

`src/common/types/storePolicy.ts:116` — `steamConfigStore: ['isLoggedIn', 'userData']` — already present in `STORE_ALLOWLIST`, confirming the renderer's eager snapshot already exposes exactly the two fields `GlobalState.tsx`'s login gate reads, with `refreshToken` excluded by omission (matches Phase 27/28's T-27-09/D-04 exclusion). **No `storePolicy.ts` change needed.**

## Q4 (REQ-30-07) — The `openDialog` Rust binding

### Current transport mechanics (verified, `sidecarRpc.ts` + `main.rs`)

`requestRustInvoke(channel, args)` (`sidecarRpc.ts:258-289`) emits a `{kind:'rustInvoke', channel, args}` frame and resolves/rejects from a correlated response; it refuses to emit for any channel not in `RUST_INVOKE_CHANNELS` (`sidecarTransport.ts:150-155`, currently only the four `keyring_*` channels). On the Rust side, `start_reader`'s `rustInvoke` branch (`main.rs:424-441`) spawns a worker thread per request and calls `dispatch_rust_channel(&channel, &args)` (`main.rs:206-276`), whose `match` currently has exactly four arms (`keyring_get`/`keyring_set`/`keyring_delete`/`keyring_available`) plus a catch-all `Err(format!("rustInvoke:unknown-channel:{channel}"))`.

### What a new `openDialog` channel needs, concretely

1. **`common/types/sidecarTransport.ts`** — a new constant, e.g. `RUST_DIALOG_OPEN = 'dialog_open' as const`, added to `RUST_INVOKE_CHANNELS`.
2. **`Cargo.toml`** — `tauri-plugin-dialog` is **NOT currently a dependency** (verified — `Cargo.toml`'s full `[dependencies]` block is `tauri`, `tauri-plugin-opener`, `serde`, `serde_json`, `keyring` only). `cargo search tauri-plugin-dialog` (run this session) confirms the crate exists on crates.io at `2.7.2` — `tauri-plugin-dialog = "2.7.2" # Native system dialogs for opening and saving files along with message dialogs on your...` — matching the official `tauri-apps` plugin naming pattern already used for `tauri-plugin-opener`. **This package name is `[ASSUMED]`** per this research's provenance rule (recalled from training knowledge, not sourced from official docs/Context7 in this session) despite the registry confirming it exists — the planner should gate its install behind a `checkpoint:human-verify` per the Package Legitimacy Gate's degraded-mode rule (see Package Legitimacy Audit below).
3. **`capabilities/default.json`** — currently `"permissions": ["core:default", "opener:default", "opener:allow-open-url"]` (verified). A dialog capability permission (the plugin's own default permission set, or a scoped one) must be added, or the plugin call will be permission-denied even though it's registered.
4. **`main.rs`'s `tauri::Builder`** — must register the plugin via `.plugin(tauri_plugin_dialog::init())`, mirroring the existing `.plugin(tauri_plugin_opener::init())` pattern (not directly observed in the excerpt read this session, but this is the standard Tauri v2 plugin-registration shape and is required for `AppHandle::dialog()` to exist as an extension method).
5. **`dispatch_rust_channel`'s signature** — currently `fn dispatch_rust_channel(channel: &str, args: &[Value]) -> Result<Value, String>`, with **no `AppHandle` parameter**. The dialog plugin's blocking folder-picker API (`app_handle.dialog().file().blocking_pick_folder()`) needs an `AppHandle`. The `rustInvoke` dispatch site in `start_reader` (`main.rs:414-441`) currently clones only `state` (`let worker_state = state.clone();`) into the spawned thread — **`app` is not currently cloned into that closure** (only used in the `frontendMessage`/`openExternal` branches above it, which run un-threaded on the reader thread itself). Wiring `openDialog` requires adding `let worker_app = app.clone();` and threading it into a widened `dispatch_rust_channel(&channel, &args, &worker_app)` signature.
6. **A new match arm** calling the blocking pick-folder API and mapping its `Option<PathBuf>` result onto the shape `electronStub.ts`'s `dialog.showOpenDialog` callers expect.

### The shape `electronStub.ts`'s `dialog.showOpenDialog` must return

`electronStub.ts:117` currently stubs `showOpenDialog: async () => ({ canceled: true, filePaths: [] })` (matching Electron's real `Electron.OpenDialogReturnValue` shape: `{canceled: boolean, filePaths: string[]}`). The real implementation must preserve this exact shape — `dialog.showOpenDialog(mainWindow, args)` is called from `main.ts`'s `openDialog` handler (`const { filePaths, canceled } = await dialog.showOpenDialog(...)`), and the D-09 real implementation should forward through `requestRustInvoke('dialog_open', [args])` and translate the Rust response (a single path or `null`) into `{canceled: result === null, filePaths: result ? [result] : []}`.

### Precedent shape (28-PROOF.md §5, `openExternal`)

The `openExternal` frame was previously silently dropped on the Rust side because `start_reader()` had no branch for it — fixed by adding an explicit `kind == "openExternal"` branch. This precedent (a documented, previously-missing dispatch arm, fixed minimally) is the correct model for `openDialog`'s addition — but note `openDialog` is a **request/response** (`rustInvoke`) shape, not fire-and-forget like `openExternal`, since the caller needs the picked path back.

## Q5 (REQ-30-05) — `gameStatusUpdate` push

**CONFIRMED — zero `src-tauri` changes needed.** `src/backend/utils.ts:1349-1352` (verified by direct read):

```typescript
function sendGameStatusUpdate(payload: GameStatus) {
  sendFrontendMessage('gameStatusUpdate', payload)
  backendEvents.emit('gameStatusUpdate', payload)
}
```

This is architecturally identical to Phase 29's `storeChanged` precedent: `sendFrontendMessage` → `getMainWindow().webContents.send` (electronStub's fake `BrowserWindow`) → `pushFrontendMessage()` (`sidecarRpc.ts:224-234`) → a `{kind:'frontendMessage', channel:'gameStatusUpdate', args}` frame on stdout → `main.rs`'s reader's generic `frontendMessage` branch (`main.rs:401-411`, keyed only on `kind === 'frontendMessage'`, `app.emit(FRONTEND_MESSAGE_EVENT, ...)` regardless of the inner `channel` value) → the renderer's existing `frontend_message` listener dispatches by channel name to whichever `frontendListenerSlot('gameStatusUpdate', ...)` consumer is registered (`GlobalState.tsx:1067-1069`, `window.api.handleGameStatus`). No Rust code change, no new Tauri command, no capability change.

## Q6 (REQ-30-08) — The exact minimum modal read set

### Tension note — 30-CONTEXT's premise about `DownloadDialog` is incorrect for Steam

30-CONTEXT.md's D-10 assumes the Steam depot install path renders `DownloadDialog` and needs a curated subset of its six read channels. **This is not what the code does.** `src/frontend/state/InstallGameModal.ts:60-83` (`openInstallGameModal`, "the single chokepoint for every install entry point — library grid/list, game submenu, game page" per its own comment) contains:

```typescript
if (runner === 'steam' && action === 'install' && gameInfo) {
  void startSteamInstall(appName, gameInfo)
  return
}
useInstallGameModal.setState({ isOpen: true, appName, runner, gameInfo, action })
```

For `runner === 'steam'`, the function returns **before** `useInstallGameModal.setState({isOpen: true, ...})` ever runs — `InstallModal`/`DownloadDialog` never mounts. The code comment explains why: *"Steam installs are delegated to the Steam client via steam://install — they never use GamerLib's install modal (which would call getInstallInfo and loop forever on 'Getting download size…')."* (`getInstallInfo` for Steam — verified `steam/library.ts:773-784` — is an unfinished stub that always returns `undefined`, which is exactly the "loop forever" the comment describes; `DownloadDialog`'s own `readyToInstall = installPath && !!diskSize && !gettingInstallInfo && validFlatpakPath` would never become `true` for Steam via this path.)

Consequently, of D-10's six candidate channels — `getPrivateBranchPassword`, `requestAppSettings`, `requestGameSettings`, `getGameOverride`, `getGameSdl`, `checkDiskSpace` — **none are reached by the Steam depot install flow**, because the component tree that calls them is never mounted for Steam. (Independently, several are ALSO gated off for Steam even inside that component, reinforcing the same conclusion: `getGameOverride`/`getGameSdl` are behind `if (runner === 'legendary')`, `getPrivateBranchPassword` is hardcoded to `libraryManagerMap['gog']` regardless of caller, and the `requestAppSettings` call inside `confirmInstallBrokenAnticheat` is gated behind `hasAnticheatInfo`'s own `gameInfo.namespace !== undefined` check — `namespace` is never set anywhere in `steam/games.ts`/`steam/library.ts`, confirmed by grep, so this gate never fires for Steam either.) `getAlternativeWine` (`InstallModal/index.tsx:113`) is gated behind `hasWine = platformToInstall === 'Windows' && !isWin`, which is reachable for Steam in principle (a non-Mac-native game on a non-Windows host defaults `platformToInstall` to `'Windows'`) but is UI-cosmetic only — `SteamGame.install()`/`launch()` ignore `wineVersion`/`winePrefix` entirely (Phase 3 GAME-04: Steam launches via Steam's own Proton, not GameLib's Wine layer) — so an empty/unported result does not block anything.

### The channel that actually is on the Steam install chokepoint

`src/frontend/state/InstallGameModal.ts:51-58` (`startSteamInstall`):

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

`listSteamLibraryTargets` (`main.ts` handler, gated `isSteamNativeInstallEnabled() ? listSteamLibraryTargets() : []`) is **awaited with no `.catch()`**, and `openInstallGameModal` calls `void startSteamInstall(...)` (also uncaught). If `listSteamLibraryTargets` is left unported, the promise rejects (`UNPORTED_CHANNEL_MARKER`-tagged, non-fatal to the app per Invariant B) but `installSteamGame(...)` — the line that actually calls `window.api.install(...)` — **is never reached**. This is a genuine, previously-unidentified blocking dependency for REQ-30-04's own acceptance criterion. `listSteamLibraryTargets`'s implementation (`installLocation.ts:60`) is a pure filesystem read (`getSteamLibraries()` → `libraryfolders.vdf` parse via the already-used `@node-steam/vdf`), no CrossOver/bottle/network — cheap to port.

**Uninstall confirmed similarly minimal:** `src/frontend/screens/Game/GameSubMenu/index.tsx:330-331` calls `window.api.uninstall(appName, runner, false, false)` directly — no modal, no additional read channel (verified: no `runner === 'steam'` branch exists in `UninstallModal/index.tsx`, because Steam never reaches it — the D-05 bypass in `GameSubMenu` happens one level up, before any modal opens).

### Corrected enumerated minimum channel set (for REQ-30-08's declared list)

| Channel | Needed for Steam install/uninstall submit? | Evidence |
|---|---|---|
| `listSteamLibraryTargets` | **Yes — blocking** | Awaited uncaught before `installSteamGame()` fires (`InstallGameModal.ts:52`) |
| `install` | **Yes** | REQ-30-04's own target |
| `uninstall` | **Yes** | REQ-30-04's own target; called directly, no modal |
| `updateGame` | **Yes** | REQ-30-04's own target |
| `checkGameUpdates` | **Yes** | REQ-30-04's own target; already wrapped in a try/catch on the frontend (`GlobalState.tsx:851-856`), so even a slow/failed port degrades gracefully |
| `getPrivateBranchPassword` | **No** | GOG-hardcoded handler; DownloadDialog never mounts for Steam |
| `requestAppSettings` | **No** (for the depot submit path) | Only reachable via an anticheat gate that never fires for Steam (`namespace` unset) |
| `requestGameSettings` | **No** | DownloadDialog-only; never mounts for Steam |
| `getGameOverride` | **No** | Gated `runner === 'legendary'` |
| `getGameSdl` | **No** | Gated `runner === 'legendary'` |
| `checkDiskSpace` | **No** | DownloadDialog-only; also does not gate `readyToInstall` even where it does run (cosmetic messaging only) |
| `getAlternativeWine` | **No (cosmetic only)** | Reachable in principle but `wineVersion` is ignored by `SteamGame`; safe to leave unported |

**Recommendation:** Replace 30-CONTEXT.md's D-10 candidate list with `listSteamLibraryTargets` as the phase's one genuinely-required minimum read channel. None of the original six `DownloadDialog` channels need real behavior for the Steam depot path to work; leaving them unported is correct, not a compromise.

## Q7 (REQ-30-09 / Invariant B) — Non-fatality regression risk

### How `bootErrorSurface.ts` actually decides fatal vs non-fatal

Verified by direct read: `window.addEventListener('unhandledrejection', ...)` is a **permanent, app-lifetime** listener (not one-shot). For any unhandled rejection:
1. If the error message contains `UNPORTED_CHANNEL_MARKER` → `console.warn` and return (never fatal, regardless of mount state).
2. Else if `document.getElementById('root').childElementCount > 0` (i.e. React has already painted something) → `console.error` and return (**already non-fatal** — post-mount errors never blank the page, marker or not).
3. Else (pre-mount, no marker) → blanks `#root` with the error text.

So the ONLY way a channel this phase newly registers can regress a "safe warning" into an actual page-blanking crash is: **a genuinely thrown (non-marker) error, occurring during the pre-mount window** (i.e., triggered by code that runs at frontend **module evaluation scope**, before React's `createRoot().render()` completes — `useEffect`s do not qualify, since they fire after the DOM is painted).

### Call-site audit — none of Phase 30's channels are called at module scope

Checked every frontend consumer of every channel this phase touches (`checkSteamInstalled`, `steamStartQR`, `steamPollQR`, `listSteamLibraryTargets`, `install`, `uninstall`, `updateGame`, `checkGameUpdates`, `openDialog`): every call site found is inside a React component's `useEffect`, an event handler (`onClick`), or an already-mounted `GlobalState.tsx` method (`componentDidMount`, itself firing after React's initial render). **None execute during module evaluation.** This contrasts with the one documented pre-mount-reachable pattern SEAM.md calls out (`frontend/state/UploadedLogFiles.ts`'s module-scope `getUploadedLogFiles()` call) — that pattern is not repeated by anything Phase 30 touches.

### The concrete guard the plan needs

Given the above, Phase 30's actual regression risk is **not** a boot crash — it is a newly-registered handler that resolves successfully but with a shape the frontend caller doesn't expect (a destructure or field-access mismatch), which would `console.error` post-mount rather than blank the page, but could silently break a feature (e.g., an install button that never re-enables). The concrete guard for the plan to add:

1. Every new handler's return value must match `common/types/ipc.ts`'s declared type for that channel EXACTLY (not merely "truthy") — this is the load-bearing correctness property, not the marker mechanism.
2. Add one negative-path regression test (in the `skeletonFlows.test.ts` style) asserting that NONE of this phase's new channels are invoked before the sidecar's `READY_SENTINEL`/mount-equivalent point — i.e., a structural test that the boot sequence doesn't change, rather than a behavioral one (there is nothing new to catch behaviorally, since Invariant B's non-fatality guarantee already covers the pre-mount case structurally).
3. Do not add any new module-scope (top-level, outside a function/component) call to any of this phase's channels — if a future task needs one, treat it as the one case requiring explicit review against Invariant A/B, per SEAM.md's own precedent.

## Q8 — Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (`ts-jest`), existing project-wide config |
| Config file | root `jest.config` (unchanged by this phase) |
| Quick run command | `npm test -- --testPathPattern=sidecar` |
| Full suite command | `npm test` |

### What CAN be proven by jest today

- Channel wiring: a `writeInvoke`/`writeSend` frame reaches the correct handler and produces the correct `SidecarRpcResponse`/`SidecarNotification` — this is exactly `skeletonFlows.test.ts`'s existing pattern (real, unmocked `electronStub.ts`/`fileStore.ts`/`sidecarRpc.ts`/`bootstrap.ts`/`handlers.ts`, only `SteamUser`'s network surface and `backend/utils`'s `getSteamLibraries` mocked).
- Token round-trip through the store-write path: `storeSet`/`storeChanged` assertions already proven for `configStore`/`steamConfigStore` (Phase 29's suite) extend directly to asserting `steamConfigStore.userData`/`isLoggedIn` after a simulated `steamStartQR`/`steamPollQR` sequence.
- The D-04 refresh-token-exclusion regression pattern (`skeletonFlows.test.ts` Test 4 and the "PHASE 28 D-04 regression" test in the `storeSet` describe block) is the exact template to extend for asserting a QR-login write never leaks `refreshToken` into a snapshot.
- `install`/`uninstall`/`updateGame`/`checkGameUpdates` handler registration + response shape (mocking `SteamGame`'s depot-download internals the same way `skeletonFlows.test.ts` mocks `SteamUser`'s network calls — i.e., stub the deepest external-network/filesystem boundary, let everything else run for real).
- Non-fatality: writing a frame for a channel this phase deliberately does NOT port and asserting the response still carries `UNPORTED_CHANNEL_MARKER` and the RPC loop keeps serving afterward (mirrors the existing "rejects an unknown store name... health still responds" test pattern in `skeletonFlows.test.ts`).

### What CANNOT be proven by jest — needs the esbuild bundle / a real `npm run tauri:dev` run

Per the codebase's own documented gotcha (27-05): module-init ORDER bugs (`SteamLibraryManager is not a constructor`-class failures) reproduce **only** in the real esbuild bundle (`build/main/sidecar.js`), never under `ts-jest`, because ts-jest and esbuild resolve circular-import evaluation order differently. This phase adds a NEW registration module (`installFlowRegistration.ts`) that must replicate `steamFlowRegistration.ts`'s load-bearing `import '../storeManagers'` first-import pattern — if it is omitted or ordered wrong, jest's test suite will pass while the real bundle crashes silently on the READY_SENTINEL line. **Cannot be caught by jest; requires a manual `npm run build` (or the packaged dev flow) + `npm run tauri:dev` smoke check** before this phase is considered done, exactly as 27-05's own SUMMARY records having to do.

Additionally NOT provable by jest: the live QR scan itself (a real phone, a real Steam mobile app), and the real Rust-side `openDialog` picker (`tauri-plugin-dialog`'s actual native dialog — jest has no Rust runtime).

### How to extend the existing test shapes

- `skeletonFlows.test.ts` — add a new `describe('installFlowRegistration', ...)` block sibling to the existing Steam read/action-flow tests, following its exact `jest.mock('electron', ...)`/`jest.mock('electron-store', ...)`/`jest.mock('os', ...)` header (see below) and `startSidecar()`/`writeInvoke`/`flush()` helpers unchanged.
- `storeLayer.test.ts` — extend with the QR-login write-path assertions (steamConfigStore.userData/isLoggedIn round-trip through the real store-write choke point, `applyStoreWrite`).
- `electronUntouched.test.ts` — no changes expected; this suite proves the Electron build's own behavior is unaffected, which Phase 30 must not violate (additive/reversible invariant, REQ-30-09).

### How to write token-seam tests WITHOUT touching the real config directory

`skeletonFlows.test.ts`'s existing header (verified, lines 60-91) is the exact, already-proven pattern:

```typescript
jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () => path.join(actual.tmpdir(), `gamelib-<suitename>-test-home-${process.pid}`)
  }
})
jest.mock('electron', () => jest.requireActual('../electronStub'))
jest.mock('electron-store', () => ({ __esModule: true, default: jest.requireActual('../fileStore').default }))
```

This redirects `pathShim.ts`'s `resolveAppDataDir` (which resolves from `homedir()`) to a disposable per-process tmp directory, while still running the REAL `electronStub.ts`/`fileStore.ts` code (not a generic mock) — this is what makes it safe against the exact incident recorded in project memory (`tests-clobbering-real-steam-store.md`: a suite that `requireActual`'d electron-store without this override reached the real `~/Library/Application Support/GameLib` and wiped the dev's live Steam token). **Any new test file this phase adds that touches `steamConfigStore`/token state MUST copy this exact `jest.mock('os', ...)` header verbatim** — do not rely on `afterAll` cleanup as a substitute (the project memory entry explicitly notes `afterAll` is not a safety net because Jest's worker force-exit can skip it).

### REQ-30-03's "wired and unit-proven, NOT hardware-proven" distinction

Carry forward explicitly into `VALIDATION.md`: every automated test above proves the channel wiring and the token/store round-trip mechanically. It does **not** prove a real phone can scan a real QR code and complete a real Steam login, and it does not prove the real depot-download bytes-on-disk outcome under Tauri (that requires `npm run tauri:dev` plus a real, authenticated Steam session). The deferred UAT item (per D-04's tension note) must name BOTH the live QR scan AND the install E2E it gates as one entry, not two — a reader must not be able to conclude the install slice was independently hardware-proven while only the login scan was deferred.

### Pre-existing OPEN gaps to name as pre-existing conditions

`.planning/STATE.md` (verified, current as of 2026-07-22): **G-23-01** (a `Blocked` depot key aborts the whole install — KCD2 case) and **G-23-02** (native install applies no execute bits, requiring a manual `chmod +x` workaround) are both still OPEN on the exact native depot-download branch D-07 selects for this phase. Any real depot install run under Tauri in this phase's E2E will sit under both gaps. **These must be named explicitly in `30-VALIDATION.md`/the deferred UAT item as pre-existing conditions, not misread as Phase 30 regressions** — if the E2E test title happens to need `chmod +x` after install, or happens to carry a `Blocked` depot key, that is G-23-02/G-23-01 surfacing, not a new Tauri-side bug.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Queue-adjacent status push | A new push mechanism for install/uninstall status | `sendGameStatusUpdate` (already generic, already proven for D-06) | Zero Rust changes needed; reinventing this would duplicate Phase 29's own `storeChanged` precedent |
| Sidecar→Rust request/response | A bespoke correlated-request mechanism for `openDialog` | `requestRustInvoke()`/`dispatch_rust_channel()` (Phase 28) | D-09/checklist step 6 explicitly mandate reuse; the mechanism was built for exactly this class of need |
| Steam-only manager reshaping | Parallel Steam-only `uninstall`/`checkGameUpdates` handlers | The existing runner-generic `uninstallGameCallback`/`checkGameUpdates`, imported unchanged | The import cost is already sunk (Q2); a parallel implementation is pure duplicated-bug-surface risk |

**Key insight:** every "port vs bypass/reshape" question this phase raises resolves the same way once the actual import graph and actual frontend chokepoints are read directly: reuse what's already proven and already resident, and bypass only the genuinely runner-irrelevant machinery (the download queue's cross-runner concerns). The phase's real complexity is not in the backend port — it's in correctly identifying that `DownloadDialog` never renders for Steam at all, which flips the entire D-10 read-set question.

## Common Pitfalls

### Pitfall 1: Assuming `DownloadDialog`'s read set is the Steam install gate
**What goes wrong:** Porting `getPrivateBranchPassword`/`requestAppSettings`/`requestGameSettings`/`getGameOverride`/`getGameSdl`/`checkDiskSpace` as "the minimum" while never noticing `listSteamLibraryTargets` blocks the actual chokepoint.
**Why it happens:** 30-CONTEXT.md's own candidate list (correctly scoped from the roadmap's generic description of "the modal") pointed at the wrong component tree — Steam bypasses it.
**How to avoid:** Trust the `runner === 'steam'` branch in `InstallGameModal.ts` as the actual entry point; trace from there, not from `DownloadDialog`.
**Warning signs:** An E2E test that opens the InstallModal and expects to see a Steam depot install form — this will never happen; Steam installs fire immediately on click.

### Pitfall 2: `getInstallInfo` returning `undefined` for Steam looking like a bug to fix
**What goes wrong:** Seeing `SteamLibraryManager.getInstallInfo()` always return `undefined` and "fixing" it to return real data, inadvertently making `DownloadDialog` start rendering/looping for Steam for the first time.
**Why it happens:** The stub looks unfinished ("Phase 3: install operations" comment), but it is INTENTIONALLY unfinished — the whole install flow deliberately never reaches it.
**How to avoid:** Leave `getInstallInfo` as-is; it is out of scope.
**Warning signs:** Any change to `steam/library.ts`'s `getInstallInfo`.

### Pitfall 3: `notify()`'s current no-op is silent, not logged — a live gap against REQ-30-07
**What goes wrong:** Assuming D-09's "Notification stays a logged no-op" requirement is already satisfied because `electronStub.ts`'s `Notification.isSupported()` already returns `false`.
**Why it happens:** The stub correctly makes `notify()` inert, but `dialog.ts`'s `notify()` function (`if (Notification.isSupported() && !isSteamDeckGameMode) {...}`) has no `else` branch — when the condition is false, nothing is logged at all today.
**How to avoid:** Add an explicit log line (e.g. `logInfo`) on the skipped path, either in `electronStub.ts`'s `Notification` stub or in `dialog.ts`'s `notify()` — this is a small, concrete task the plan must include for REQ-30-07 to actually be satisfied, not just assumed satisfied.
**Warning signs:** A `grep` for "Notification" showing zero log output when a Steam install completes under Tauri.

## Code Examples

### The template pattern (`steamFlowRegistration.ts`), to be mirrored by both new modules
```typescript
// Source: src/backend/sidecar/steamFlowRegistration.ts (this session, verified)
import { ipcMain } from './electronStub'
import '../storeManagers'  // load-bearing FIRST import — fixes the 27-05 esbuild-only crash
import SteamLibraryManager from '../storeManagers/steam/library'
import SteamGame from '../storeManagers/steam/games'

export function registerSteamFlows(): void {
  ipcMain.handle('refreshLibrary', async () => { /* ... */ })
  ipcMain.handle('launch', async (_event, ...args) => { /* ... */ })
}
```
`installFlowRegistration.ts` and `steamAuthFlowRegistration.ts` should follow this exact shape: `import '../storeManagers'` first (or rely on it already having run via `steamFlowRegistration.ts`'s own import if `handlers.ts` calls `registerSteamFlows()` first in the same module-scope sequence — confirm actual call order in `handlers.ts` before assuming this is redundant), then the specific manager/class imports, then a `register*Flows()` export function with no import-time side effects beyond class construction.

### The non-fatal-channel test pattern to extend
```typescript
// Source: src/backend/sidecar/__tests__/skeletonFlows.test.ts (this session, verified)
it('rejects an unknown store name... no crash, health still responds', async () => {
  const { input, frames } = startSidecar()
  writeSend(input, 'set-bad-1', 'storeSet', ['not_a_store', 'theme', 'x'])
  await flush()
  // ... assert no storeChanged frame, then:
  writeInvoke(input, 'health-after-bad', 'health', [])
  await flush()
  expect(frames.find((f) => f.id === 'health-after-bad')).toMatchObject({ ok: true, result: 'ok' })
})
```

## State of the Art

| Old Approach (Electron) | Tauri/sidecar Approach | When Changed | Impact |
|--------------------------|--------------------------|---------------|--------|
| `addHandler('install', ...)` in `downloadmanager/ipc_handler.ts` → `addToQueue` | Direct `ipcMain.handle('install', ...)` → `new SteamGame(appName).install(args)` in `installFlowRegistration.ts` | This phase | Steam-only; the queue itself is untouched for Electron |
| Silent `notify()` no-op | Logged `notify()` no-op | This phase (closes a REQ-30-07 gap that exists today, not introduced by Tauri) | Small, isolated fix; applies to both builds if fixed in `dialog.ts` rather than `electronStub.ts` |

**Deprecated/outdated:** None — this phase adds behavior, it does not deprecate anything.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `tauri-plugin-dialog` is the correct official crate name for Tauri v2's native dialog plugin | Q4 | If wrong, the plan would add a non-existent or wrong dependency; mitigated by `cargo search` confirming the exact name+version exist on crates.io this session, but registry existence alone is not full verification per this research's provenance rule — planner should gate the `cargo add` behind a `checkpoint:human-verify` or a Context7/official-docs check before committing |
| A2 | `main.rs`'s `tauri::Builder` registers `tauri-plugin-opener` via `.plugin(tauri_plugin_opener::init())` (the pattern the dialog plugin registration should mirror) | Q4 | Not directly observed in the excerpt read this session (only the `Cargo.toml` dependency and capability permission were confirmed); if the actual registration differs, the plan's Rust task needs a small adjustment, not a redesign — low risk |
| A3 | `handlers.ts`'s call order between `registerSteamFlows()` and the two new registration functions does not itself re-trigger the 27-05 circular-init hazard | Code Examples | If the new modules are registered BEFORE `import '../storeManagers'` has had a chance to fully evaluate in some reordering, the same esbuild-only crash class could reappear; mitigated by Q8's guidance that this class of bug is undetectable by jest and needs a real bundle+`tauri:dev` smoke test regardless |

**If this table is empty:** N/A — see above.

## Open Questions (RESOLVED)

> Both questions below were closed during `/gsd-plan-phase 30`, after this document was
> written. They are kept for provenance; the resolutions are authoritative.

1. **RESOLVED** — **Does `main.rs`'s `tauri::Builder` register `tauri-plugin-opener` via `.plugin(...)`, and is there an existing convention doc for adding a Tauri plugin to this project?**
   - **Resolution:** `30-PATTERNS.md` captured the registration call site directly —
     `src-tauri/src/main.rs:477-479` — and `30-03-PLAN.md` cites it in its interfaces block.
     No separate grep task is needed; the plugin-registration task can be written against
     that excerpt.
   - What we know: `tauri-plugin-opener` is a `Cargo.toml` dependency and has capability permissions in `capabilities/default.json`.
   - What's unclear: the exact `main.rs` registration call site (not read this session — the relevant excerpt was not captured).
   - Recommendation: the planner should do a targeted `grep -n "plugin(" src-tauri/src/main.rs` as the first task of the `openDialog` Rust work, before writing the plugin-registration task.

2. **RESOLVED** — **Is `enableSteamNativeInstall` (the D-13 opt-in gating the whole native depot-download branch) already `true` in the shared, on-disk `configStore` the Tauri sidecar will read?**
   - **Resolution:** folded into `30-04-PLAN.md` Task 2 as an explicit UAT prerequisite step,
     with a grep gate on the literal `enableSteamNativeInstall`. The deferred UAT item cannot
     be written without confirming/setting the flag first, so the silent-legacy-branch risk
     is closed at the point it would actually bite.
   - What we know: `isSteamNativeInstallEnabled()` reads `GlobalConfig.get().getSettings().enableSteamNativeInstall` from the SAME shared `userData` folder Electron and the Tauri sidecar both resolve to (SEAM.md's D-07 "cross-process write clobber ACCEPTED" constraint documents this sharing).
   - What's unclear: whether the developer's local persisted settings already have this flag `true` from prior Electron-side Phase 21/23/25 testing — if not, `SteamGame.install()` under Tauri would silently take the legacy `steam://install` branch instead of the depot-download branch this phase is supposed to prove.
   - Recommendation: the plan's E2E verification step should explicitly check/set this setting (even if Settings UI itself is Phase 31's territory, a direct `configStore.set('settings.enableSteamNativeInstall', true)` on the shared store, or a `checkpoint:human-verify` reminder, is warranted).

## Environment Availability

Not applicable — this phase's dependencies (Node, Cargo/Rust toolchain, the sidecar bundler) are already proven present and working by Phases 27–29's own successful builds. The one NEW external dependency this phase may introduce is the `tauri-plugin-dialog` crate (Q4/A1), covered in the Package Legitimacy Audit below rather than this section.

## Validation Architecture

(See "Q8 — Validation Architecture" above — this section is intentionally consolidated there since the answer required deep evidence-gathering alongside Q1-Q7 rather than a separate framework-detection pass. All required subsections — Test Framework, Requirements→Test Map equivalent (folded into the CAN/CANNOT split above), Sampling Rate equivalent, and Wave 0 Gaps — are covered there.)

**Wave 0 Gaps:**
- [ ] A new `describe('installFlowRegistration', ...)` block in `skeletonFlows.test.ts` (or a sibling `installFlowRegistration.test.ts` following its exact header pattern) — covers REQ-30-04.
- [ ] QR-login write-path assertions extending `storeLayer.test.ts`'s existing D-04-regression pattern — covers REQ-30-01/REQ-30-02.
- [ ] A `notify()`-logs-instead-of-silent test (new, small) — covers REQ-30-07's Notification clause.
- [ ] No jest coverage possible for the real esbuild-bundle module-init-order hazard or the real Rust dialog picker — both require a manual `npm run tauri:dev` smoke pass, recorded as a deferred/human-verify step, not a Wave 0 gap in the traditional sense.

## Package Legitimacy Audit

> Required because Q4 identifies one new external package this phase may need to introduce (`tauri-plugin-dialog`, for REQ-30-07's `openDialog`).

### Step 1-2 — slopcheck

```
$ pip install slopcheck --break-system-packages 2>/dev/null || pip install slopcheck 2>/dev/null || true
$ slopcheck install tauri-plugin-dialog --json
```

slopcheck was not run this session (not installed on this machine and installation was not attempted, since the package in question is a Rust crate and slopcheck's primary coverage is npm/PyPI-ecosystem hallucination detection — its applicability to `cargo`-ecosystem packages is unconfirmed). Per the Package Legitimacy Gate's graceful-degradation rule, this package is marked `[ASSUMED]` and the planner must gate its `cargo add` behind a `checkpoint:human-verify` task.

### Step 3 — registry verification (cargo, the correct ecosystem for this phase's Rust work)

```
$ cargo search tauri-plugin-dialog
tauri-plugin-dialog = "2.7.2"   # Native system dialogs for opening and saving files along with message dialogs on your...
```
Run this session — confirms the exact name and current version (2.7.2) exist on crates.io, and the description matches the official Tauri plugin ecosystem's naming/purpose convention (parallel to the already-adopted `tauri-plugin-opener`).

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| `tauri-plugin-dialog` | crates.io | not measured this session | not measured this session | github.com/tauri-apps/plugins-workspace (recalled, not verified this session) | not run — `[ASSUMED]` | Flagged — planner must add `checkpoint:human-verify` before `cargo add` |

**Packages removed due to slopcheck [SLOP] verdict:** none (slopcheck not run).
**Packages flagged as suspicious [SUS] / [ASSUMED]:** `tauri-plugin-dialog` — cargo-registry existence confirmed this session, but the package name itself was recalled from training knowledge, not sourced from official Tauri documentation or Context7 in this session, per this research's strict provenance rule.

## Sources

### Primary (HIGH confidence — direct file reads this session)
- `.planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-CONTEXT.md` — full read
- `.planning/REQUIREMENTS.md` — REQ-30-01..09 and the D-XX→REQ mapping
- `.planning/ROADMAP.md` — Phase 30 entry and the v0.8 Tauri milestone context
- `.planning/STATE.md` — G-23-01/G-23-02 open-gap confirmation
- `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` — full read, the governing document
- `src/backend/downloadmanager/ipc_handler.ts`, `downloadqueue.ts`, `electronStores.ts`
- `src/backend/sidecar/steamFlowRegistration.ts`, `handlers.ts`, `electronStub.ts`, `sidecarRpc.ts`
- `src/backend/storeManagers/steam/games.ts` (imports + `install`/branches, lines 1-80, 600-960)
- `src/backend/storeManagers/steam/user.ts` (lines 1-100, 340-470)
- `src/backend/storeManagers/steam/electronStores.ts`, `tokenStore.ts`, `installLocation.ts`
- `src/backend/utils/uninstaller.ts`, `src/backend/online_monitor.ts`, `src/backend/dialog/dialog.ts`
- `src/backend/main.ts` (checkGameUpdates ~742, uninstall/openDialog/repair ~1100-1170, getInstallInfo ~865-895, getPrivateBranchPassword/getGameOverride/getGameSdl ~1637-1650, steamStartQR/steamPollQR ~925-926, checkSteamInstalled/logoutSteam ~947-967, getSteamUserInfo/checkDiskSpace ~640-655)
- `src/frontend/state/GlobalState.tsx` (lines 220-290, 700-760, 840-870, 1036-1110)
- `src/frontend/state/InstallGameModal.ts` — full read
- `src/frontend/screens/Login/components/SteamLogin/index.tsx` — full read
- `src/frontend/screens/Library/components/InstallModal/index.tsx` — full read
- `src/frontend/screens/Library/components/InstallModal/DownloadDialog/index.tsx` (lines 1-150, 150-470, 559-600)
- `src/frontend/screens/Game/GameSubMenu/index.tsx` (uninstall bypass, line ~330)
- `src/frontend/hooks/hasAnticheatInfo.ts` — full read
- `src/frontend/bootErrorSurface.ts` — full read
- `src/frontend/helpers/library.ts` (install helper ~34-95, updateGame ~465)
- `src/common/types/sidecarTransport.ts` — full read
- `src/common/types/storePolicy.ts` (STORE_ALLOWLIST section)
- `src-tauri/src/main.rs` (dispatch_rust_channel ~190-280, start_reader ~338-470)
- `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json` — full reads
- `src/backend/sidecar/__tests__/skeletonFlows.test.ts` — full read
- `cargo search tauri-plugin-dialog` — run this session

### Secondary (MEDIUM confidence)
- None — this research required no web search; the entire domain is codebase-internal.

### Tertiary (LOW confidence)
- A2 (main.rs plugin registration call site) — recalled Tauri v2 convention, not directly observed this session; flagged in Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: N/A — no external library selection in this phase (one candidate Rust crate, `tauri-plugin-dialog`, is flagged `[ASSUMED]` pending human verification)
- Architecture (Q1/Q2/Q5/Q6): HIGH — every claim traced to a specific file:line read this session, including the corrected D-10 finding
- Q3 (token seam): HIGH — Phase 28's existing wiring directly confirmed by reading `bootstrap.ts`/`user.ts`/`storePolicy.ts`
- Q4 (Rust dialog binding): MEDIUM-HIGH — the transport mechanics and missing-dependency facts are HIGH confidence (directly read); the exact plugin-registration call site (A2) is not directly observed
- Q7 (non-fatality risk): HIGH — the bootErrorSurface mechanics and call-site audit are both directly verified
- Q8 (validation): HIGH — grounded in the actual, already-passing test suite's own patterns

**Research date:** 2026-07-22
**Valid until:** 30 days (codebase-internal facts; re-verify if Phase 29/31 land first and touch any of the files cited above)
