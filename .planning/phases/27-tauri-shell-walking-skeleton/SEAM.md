# Phase 27 Seam Map — Ported vs Stubbed vs Deferred

**Purpose:** Boundary map for the Tauri walking skeleton (27-01..05). Read this before starting
any later phase that ports more of the 220-endpoint Electron IPC surface onto the Tauri/sidecar
architecture. It records exactly what this phase wired for real, what it stubbed to the minimum
needed for those two flows, and what remains — keyed off spike 009's 16-API / 44-file coupling
map so the next slice can be picked without re-deriving the surface from scratch.

Source of truth for the underlying numbers: `.planning/spikes/009-node-backend-headless-sidecar/README.md`.

---

## 1. Ported (real, wired, hardware-provable)

### Transport contract
- `src/common/types/sidecarTransport.ts` — the stdio JSON-RPC frame shapes (`SidecarRpcRequest`/
  `SidecarRpcResponse`/`SidecarNotification`), the four Tauri command-name constants
  (`SIDECAR_INVOKE`, `SIDECAR_SEND`, `OPEN_EXTERNAL`, `SIDECAR_STORE_SNAPSHOT`), and
  `READY_SENTINEL`. Preserves the three preload factories' invoke/send/on shapes exactly.
- `src-tauri/src/main.rs` — Rust shell: spawns the Node sidecar over stdio, exposes the four
  `#[tauri::command]`s (`sidecar_invoke`, `sidecar_send`, `open_external`,
  `sidecar_store_snapshot`), relays `frontendMessage` notifications to the webview as the
  `frontend_message` event.

### Sidecar bootstrap shims (headless walls from spike 009, closed)
- `pathShim.ts` — `app.getPath()` equivalent (import-time wall #1).
- `fileStore.ts` — minimal sync file-backed `electron-store` replacement (import-time wall #2).
- `electronStub.ts` — full 16-API Electron-module replacement (`Module._load` hook target),
  because `storeManagers/index.ts` eagerly constructs every store manager at import time so the
  whole 16-API surface must not throw at import, even though only a handful have real behavior.
- `bootstrap.ts` — installs the `Module._load` hook before any backend import, calls
  `backend/logger`'s new `initHeadless()`, starts the RPC server, prints `READY_SENTINEL`.

### The renderer bridge (three factories + store snapshot, byte-identical Electron path preserved)
- `src/preload/tauriTransport.ts` — invoke/send/listen over `@tauri-apps/api` + synchronous
  in-memory store-snapshot bridge (`hydrateStoreSnapshot`/`snapshotGet`/`snapshotHas`/
  `snapshotSet`/`snapshotDelete`), `SECRET_STORE_KEYS` deny-list preserved (T-27-06).
- `src/preload/ipc.ts` + `src/preload/api/misc.ts` — the three factories re-pointed behind
  `isTauri()`; Electron access lazily/guarded `require()`'d only in the non-Tauri branch. Zero
  changes to the 379 `window.api.*` call-sites.
- `src/preload/tauriAttach.ts` — attaches `window.api` + the 6 preload globals directly to the
  Tauri webview (no `contextBridge` there); imported first in `src/frontend/index.tsx`.

### The four wired channels (exactly these — nothing else)
1. **`refreshLibrary`** — sidecar invoke handler (`steamFlowRegistration.ts`) calls the real,
   unmodified `SteamLibraryManager.refresh()`.
2. **`pushGameToLibrary`** — the frontend-push notification `refresh()` already emits per
   resolved game via `sendFrontendMessage` → `electronStub`'s fake `BrowserWindow.webContents.send`
   → `frontend_message` Tauri event → renderer's `on()` listener. Not a separate handler; it is
   `refreshLibrary`'s own push side-channel.
3. **`launch`** — sidecar invoke handler calls the real, unmodified `SteamGame.launch()`'s native
   branch (`buildSteamProtocolUrl` T-27-08 numeric-appId guard + `shell.openExternal`), bridged
   through `electronStub`'s `shell.openExternal` forwarder → `open_external` Tauri command →
   `tauri-plugin-opener` → `/usr/bin/open steam://rungameid/{id}`.
4. **`sidecar:store-snapshot`** — sidecar-side handler serving the eager `BOOT_SET_STORES`
   (generalized in Phase 29 — see `### The store layer (real, Phase 29)` below; originally just
   `configStore` + `steamConfigStore.raw_store`, refreshToken excluded at the source, T-27-09) —
   the store the renderer's synchronous `window.api.storeGet(...)` bridge needs on first paint
   (`GlobalState.tsx`'s Steam login-gate read).

`grep -c "refreshLibrary\|pushGameToLibrary\|launch"` over this document ≥ 3 (see the list above
plus references throughout §3).

### `safeStorage` (real, Phase 28) — CLOSED, moved out of §2

**Graduated from stubbed to ported in Phase 28** (`tauri-keyring-real-safestorage-via-the-keyring-crate`).
Full proof pair recorded in `.planning/phases/28-tauri-keyring-real-safestorage-via-the-keyring-crate/28-PROOF.md`.

- **Rust shell** (`src-tauri/src/main.rs`): `keyring` v3 (`apple-native` feature) backs a real
  macOS Keychain entry at `KEYRING_SERVICE = "com.gamelib.launcher"` /
  `KEYRING_ACCOUNT = "steam-refresh-token"`, dispatched via `dispatch_rust_channel()`
  (`keyring_get`/`keyring_set`/`keyring_delete`/`keyring_available`).
- **Transport**: a new, generic, symmetric sidecar→Rust `rustInvoke` request/response frame
  (mirroring the existing Rust→sidecar `invoke` byte-for-byte, just reversed) — the reusable
  infrastructure D-05 asked for, not a keyring-specific one-off. Dispatched on a spawned worker
  thread (not the reader thread itself) so a blocking Keychain access prompt cannot head-of-line
  block unrelated pending `invoke`s.
- **Sidecar** (`src/backend/sidecar/keyringTokenStore.ts`): `SidecarKeyringTokenStore` implements
  the `TokenStore` seam (`src/backend/storeManagers/steam/tokenStore.ts`) entirely over
  `requestRustInvoke()`. It structurally cannot write `configStore`'s `TOKEN_STORE_KEY` — it does
  not import `configStore` or the storage-key constants at all (REQ-28-02/D-04, enforced by
  construction and hardware-proven byte-identical before/after in `28-PROOF.md` § 2 Step 4).
- **Failure policy (D-06)**: `NoEntry` (no token stored yet) is the healthy first-run case, not a
  failure. Every other outcome — including a real Deny click, hardware-confirmed to surface as
  `keyring::Error::PlatformFailure` wrapping OSStatus `-128` (`errSecUserCanceled`), NOT
  `NoStorageAccess` (closes RESEARCH Assumption A1 / Open Question 1) — collapses to a clean
  signed-out state (`isAvailable()` → `false`, `getToken()` → `''`), one logged warning, and
  **never** a plaintext write. No env-var or in-memory dev escape hatch exists (D-08/REQ-28-07).

> **Historical failure note (27-05, kept for context) — CLOSED.** The passthrough stub described
> below this line used to block Steam sign-in entirely and carried a live write-direction
> corruption trap for whoever ported the login channel next. Both are now closed by the real
> keyring port above; the note is retained verbatim as the historical record of why Phase 28 was
> order-constrained ahead of any token-writing channel.
>
> Original text: the stub's plain passthrough (`Buffer.from(plainText, 'utf-8')` /
> `toString('utf-8')`) made `isEncryptionAvailable()` lie (`true`), so `decryptToken()` at connect
> time base64-decoded real Keychain ciphertext into garbage — the sidecar could not authenticate
> and the Tauri window showed an empty, signed-out library even when Electron was signed in
> (Phase 27 UAT steps 2/3 BLOCKED). The write-direction trap: because the sidecar and Electron
> share one store (`pathShim` resolves `userData` to the same folder by design), a token WRITE
> under the stub would have written `TOKEN_PREFIX` + plaintext, which Electron would then fail to
> Keychain-decrypt and silently sign the user out of the real app — corrupting a working session.
> This never fired in Phase 27 (no login channel was registered), but is exactly why "port the
> keyring before wiring any token-writing channel" was locked as Phase 28's ordering constraint.

**Phase 27 UAT steps 2/3 remain BLOCKED, NOT unblocked by Phase 28** — Phase 28 proved the storage
mechanism, not a login channel. See `28-PROOF.md` § 4. The login-channel port
(`startQRLogin`/`startCredentialLogin`) is the next natural slice; see the deferred-backlog row
below.

### Steam QR login + native install slice (real, Phase 30) — CLOSED, moved out of §3

**Ported in Phase 30** (`tauri-ipc-re-plumb-slice-1-install-uninstall-update-check`, plans
30-01..30-03). Full enumerated list in
`.planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-PORTED-CHANNELS.md`.

- **`steamAuthFlowRegistration.ts`** — `checkSteamInstalled`/`steamStartQR`/`steamPollQR`, real
  `SteamUser` behavior, the refresh token proven to round-trip through
  `SidecarKeyringTokenStore`'s real `rustInvoke` wire protocol and never surface in a store
  snapshot. QR only — credential/SteamGuard/TOTP/logout branches stay deferred (D-02).
- **`installFlowRegistration.ts`** — `install`/`uninstall`/`updateGame`/`checkGameUpdates`/
  `listSteamLibraryTargets`, covering the native depot-download install branch only (D-07). `install`
  is a direct `SteamGame.install()` bypass, not a `downloadqueue.ts` port (D-05a); `uninstall`/
  `checkGameUpdates` reuse Electron's own runner-generic handlers unchanged, all runners (D-05b/D-12).
- **`gameStatusUpdate`** push — rides the existing generic `frontendMessage` → `frontend_message`
  relay, the third rider after `pushGameToLibrary` (Phase 27) and `storeChanged` (Phase 29). Needed
  **zero Rust changes**.
- **`dialog_open`** `rustInvoke` channel (plan 30-03) — real `dialog.showOpenDialog` behavior in
  `electronStub.ts`, backed by `tauri-plugin-dialog`'s `blocking_pick_folder()`. Only the
  open-directory path; the other five `dialog.*` members stay unported (Phase 31).

**Claim level (D-04/REQ-30-03): "wired and unit-proven", NOT "hardware-proven".** Every channel
above is registered on the sidecar and proven non-fatal (`UNPORTED_CHANNEL_MARKER` no longer
fires for `checkSteamInstalled`/`steamStartQR`/`listSteamLibraryTargets`, human-confirmed 30-04
Task 3). **Registration is not the same claim as "the flow works."** The Steam QR login UI flow
is a **known defect** under Tauri, not merely deferred: the Manage Accounts screen renders but its
logon button is unresponsive, so the QR tab is never reached (**G-30-01**, human-observed
2026-07-22, `30-HUMAN-UAT.md`). Because the install slice's own reachability precondition is a
populated library, the install slice's own hardware proof was not reached this session as a
direct consequence of G-30-01 — this is not an independent gap.

### settings/config + dialog cluster (real, Phase 31) — CLOSED, moved out of §3

**Ported in Phase 31** (`tauri-ipc-re-plumb-slice-2-settings-and-config`, plans 31-01..31-02).
Full enumerated list in
`.planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/31-PORTED-CHANNELS.md`.

- **`settingsFlowRegistration.ts`** — the write path (`setSetting` as a `send`/listener via
  `ipcMain.on`, never `.handle` — a `send` channel registered as a handler fails 100% silently;
  `writeConfig` as an `invoke`), reaching `GlobalConfig.setSetting`/`GameConfig.setSetting` and the
  real `writeConfig()` function. Six confirmed-reachable generic reads (`getMaxCpus`,
  `showUpdateSetting`, `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative`) registered
  and returning real values. `getUserInfo`/`readConfig` deliberately stay unported — traced call
  sites (31-RESEARCH.md Q1) proved neither is reached by the Steam Settings screen (Epic-only /
  Legendary-only respectively), correcting the original D-01 candidate list.
- **`RUST_DIALOG_MESSAGE`/`RUST_DIALOG_SAVE`** — two new allowlisted `rustInvoke` channels, with
  matching `dispatch_rust_channel` match arms in `main.rs` calling `tauri-plugin-dialog`'s
  `blocking_show()`/`blocking_save_file()`. `electronStub.ts`'s `dialog.showErrorBox`/
  `showSaveDialog` are real, forwarding through this transport with a never-throws safe-default
  catch. **`dialog.showMessageBox` is deliberately NOT wired to this transport (Phase 31 Plan
  04, CR-01)** — Rust's dialog is OK-only (`blocking_show()` returns a single bool), but the
  real backend callers (`promptI386Recovery`, `askForceUninstall`) present multi-button
  destructive/non-destructive confirms and branch on the returned `response`; forwarding to the
  OK-only dialog auto-confirmed the destructive branch every time, an already-shipped-path
  correctness/security bug (Phase-30 native install reaches both callers). `showMessageBox` now
  logs a `console.warn` and resolves the safe sentinel `{ response: -1, checkboxChecked: false
  }` — never forwarding to `RUST_DIALOG_MESSAGE`, never rejecting (its two live callers `await`
  it unguarded and fire-and-forget, and the sidecar has no `unhandledRejection` guard, so a
  reject would crash the process). Real multi-button `showMessageBox` behavior is deferred to
  Phase 33. **DECLARED INFRASTRUCTURE, not flow-driven** (D-05 below), applies to
  `showErrorBox`/`showSaveDialog`: 31-RESEARCH.md Q2 traced every real call site of the five
  `dialog.*` members and found zero Phase 31 settings/config flow reaches any of them; they were
  built anyway to close this document's own §3 `dialog ×9` cluster. Proven by a direct
  `electronStub.dialog.*` unit test (`dialogStub.test.ts`), never a settings-screen E2E.
- **D-04 no-ops upgraded from silent to logged** — `dialog.showMessageBoxSync`/
  `showOpenDialogSync` and `shell.showItemInFolder`/`clipboard.writeText` now emit `console.warn`
  naming the no-op, D-04, and the Phase 33 deferral, instead of doing nothing with zero signal.

**Claim level (D-05, Phase 31): "wired and unit-proven", NOT "hardware-proven".** Every channel
above is registered on the sidecar (or, for the dialog trio, backed by real Tauri behavior) and
proven by jest coverage (`settingsFlows.test.ts`, `storeLayer.test.ts`, `dialogStub.test.ts`).
**Registration/real-behavior is not the same claim as "the Settings screen or a native dialog
works end-to-end under `tauri:dev`."** The settings write/reflect flow and native dialog
rendering have not been live-UAT'd this phase — that verification is deferred, mirroring Phase
30's D-04 claim-level precedent for the QR login/install slice.

### Download-queue cluster (real, Phase 32) — CLOSED, moved out of §3

**Ported in Phase 32** (`tauri-ipc-re-plumb-slice-3-downloads-and-queue`, plans 32-01..32-02). Full
enumerated list in
`.planning/phases/32-tauri-ipc-re-plumb-slice-3-downloads-and-queue/32-PORTED-CHANNELS.md`.

- **`downloadQueueFlowRegistration.ts`** — the five DownloadManager queue-management channels
  (`getDMQueueInformation` as `ipcMain.handle`; `removeFromDMQueue`/`pauseCurrentDownload`/
  `resumeCurrentDownload`/`cancelDownload` as `ipcMain.on`, never `.handle`), reaching the real,
  unmodified `downloadmanager/downloadqueue.ts` functions — **this closes the D-05a boundary Phase
  30 deferred to this slice**, below. `pauseCurrentDownload`/`resumeCurrentDownload` are real but
  implemented as abort-then-reconciled-restart (Phase 23 `reconcilePartialState`), never true
  in-flight suspend — declared, not silently overclaimed.
- **`install`/`updateGame`** — re-routed in `installFlowRegistration.ts` onto the real
  `addToQueue()`, retiring the Phase 30 D-05a direct `SteamGame.install()`/`.update()` bypass
  entirely (deleted, not wrapped). Both now resolve `Promise<void>` once QUEUED, matching the real
  typed contract. **Deviation beyond the plan's literal framing:** the Phase 30 CR-01 non-steam-
  runner guard was dropped completely — full Electron `ipc_handler.ts` parity, ALL runners now
  enqueue through the sidecar, not just Steam (see `32-02-SUMMARY.md`).
- **`progressUpdate`** push — `depot.ts`'s already-throttled `emitProgress()` (500ms/1%/1000ms
  cadence, unchanged) rides the existing generic `frontendMessage` → `frontend_message` relay.
  Zero new sidecar throttle/coalescer, zero Rust changes.
- **`changedDMQueueInformation`** push — a second, research-surfaced push channel (5 call sites
  inside `downloadqueue.ts`) that was undeclared by this phase's own CONTEXT.md going in; without
  it the Download Manager screen / Sidebar queue badge renders once at mount and never updates.
  Also rides the existing generic relay, zero new code.
- Boot-time auto-resume (`main.ts:579`'s `initQueue(isStartup=true)`) is deliberately **NOT**
  replicated under the sidecar (D-05) — install is parked on **G-30-02** and the CrossOver-bottle
  resume path is a known, out-of-scope bug (D-07, below). Pre-`initQueue()` cancelability
  (`downloadqueue.ts:49`'s module-scope `currentElement` seed) is preserved regardless; only the
  5-second auto-resume timer is suppressed, and its suppression is logged, never silent.

**Claim level (D-06, Phase 32): "wired and unit-proven", NOT "hardware-proven" — doubly gated.**
Every channel above is registered on the sidecar (or, for `install`/`updateGame`, re-routed onto
the real queue) and proven by jest coverage (`downloadQueueFlows.test.ts`, the unmodified
`downloadqueue.test.ts` contract, the existing `depot.test.ts` throttle suite). **Unlike Phase
30/31's single-blocker deferred-UAT framing, this slice's own live-E2E verification is gated by
TWO pre-existing blockers at once:** **G-30-01** (Tauri QR login unresponsive — blocks reaching a
signed-in library to enqueue anything) AND **G-30-02** (install-hang, parked to Phase 33 — blocks a
running install for the queue channels to act on). See `32-HUMAN-UAT.md` for the doubly-gated
deferred item naming both.

### The store layer (real, Phase 29) — CLOSED, moved out of §2/§3

**Generalized from a two-store stub to a full read/write layer in Phase 29**
(`tauri-store-layer-generalize-the-sidecar-store-beyond-the-tw`). Full proof trail across
`29-01-SUMMARY.md` through `29-06-SUMMARY.md`.

- **`fileStore.ts`** (`src/backend/sidecar/fileStore.ts`) is no longer a two-store stub covering
  only `configStore`/`steamConfigStore`. It is now a path-keyed shared data cell
  (`cellRegistry` — closes D-14, the in-process `steamConfigStore`/`steamBottleConfigStore`
  same-on-disk-path clobber), honours `options.defaults` (an on-disk value wins over a default),
  and persists atomically (temp-file `writeFileSync` + `renameSync`, with a direct-write
  fallback so a crash mid-persist can never truncate the file).
- **`sidecar:store-snapshot`** now serves the DECLARED boot set from
  `src/common/types/storePolicy.ts`'s `BOOT_SET_STORES` (11 typed stores + the four D-13
  cache-store names), not a hardcoded `configStore`/`steamConfigStore` pair. A new
  **`sidecar:store-fetch`** handler serves the lazy tier — every other `ValidStoreName` — one
  store at a time, on renderer demand.
- **`storeSet`/`storeDelete`/`storeNew`** are REAL registered handlers behind a single choke
  point, `src/backend/sidecar/storeWriteHandlers.ts`'s `applyStoreWrite()` — previously these
  three renderer-emitted frames vanished into an empty listener array with zero signal. A
  successful write now emits **`storeChanged`**, a new `frontendMessage` push channel the
  renderer patches its in-memory snapshot from — with ZERO Rust changes, because
  `src-tauri/src/main.rs`'s `frontend_message` relay is already generic over the channel name.
- **`src/backend/sidecar/storeRegistration.ts`**'s `ensureStoresRegistered()` is what makes
  every store instance actually exist in the sidecar process (side-effect imports of every thin
  store-declaration module). A store whose declaration module is missing from this file
  silently reads as `{}` on both the eager snapshot and the lazy fetch path — the two documented
  dead/gap entries (`fontsStore`, `zoomSyncStore`) and the cache-backed `wikigameinfo` special
  case are recorded in that file's own comments.
- The Tauri path's secret policy is now a single fail-closed ALLOW-LIST,
  `src/common/types/storePolicy.ts`'s `STORE_ALLOWLIST`/`isAllowedStoreField()`/
  `filterStoreSnapshot()`, replacing the three duplicated deny-lists that previously lived in
  `tauriTransport.ts`, `misc.ts`, and the sidecar's own hand-strip in `handlers.ts`. Enforced
  identically on both the read side (`filterStoreSnapshot`) and the write side (guard (c) of
  `applyStoreWrite`).

The `sidecar:store-snapshot` channel referenced in item 4 of "The four wired channels" above is
this subsection's eager half; `sidecar:store-fetch`/`storeSet`/`storeDelete`/`storeNew`/
`storeChanged` are the channels Phase 29 added on top of it.

### Lifecycle cluster: dialog/Notification/shell/app + G-30-02 install-hang fix (real, Phase 33) — CLOSED, moved out of §3

**Ported in Phase 33** (`tauri-lifecycle-cluster-app-dialog-window-notifications-tray`, plans
33-01..33-05). Full enumerated list in
`.planning/phases/33-tauri-lifecycle-cluster-app-dialog-window-notifications-tray/33-PORTED-CHANNELS.md`.
Unlike Phase 30/31/32, this phase does not add to the sidecar-endpoint tally below — it is a
cluster-completion phase, not another IPC-endpoint slice.

- **`dialog.showMessageBox`** — real multi-button behavior via `MessageDialogButtons::OkCancelCustom`
  on the existing `RUST_DIALOG_MESSAGE` `rustInvoke` channel, retiring the Phase 31 Plan 04 CR-01
  `{response:-1}` safe-sentinel stopgap. Per-caller `cancelId` fail-safe (D-07): `askForceUninstall`
  and `promptI386Recovery` each declare their OWN safe button index — a shared positional heuristic
  would have been wrong for one of them, since their two real destructive-confirm button orders are
  opposite. Never rejects (total-method convention extended).
- **`Notification`** — first real behavior this phase, via the new first-party
  `tauri-plugin-notification` Cargo/npm plugin. `isSupported()` → `true`; `.show()` forwards
  title/body through a new `notification_show` `rustInvoke` channel.
- **`shell.showItemInFolder`/`openPath`** — real, via two new `rustInvoke` channels backed by
  `tauri-plugin-opener` (already installed for `open_external`) — no new Cargo dependency needed.
  `shell.trashItem` stays a LOGGED no-op (see Accepted Constraints below) — no vetted Tauri v2 plugin
  has trash capability, confirmed by reading the installed `tauri-plugin-fs` 2.5.1 crate source.
- **`app.quit`/`exit`/`relaunch`** — real, via two new `rustInvoke` channels (`RUST_APP_EXIT`/
  `RUST_APP_RELAUNCH`) forwarding to Tauri's `AppHandle::exit()`/`restart()`. Fixes the "zombie
  sidecar" gap where the real Tauri process never actually exited or relaunched. Tray, custom-protocol
  registration, and updater hooks remain deferred (see §3 row 1, annotated Phase 34/35) — this closes
  only the lifecycle-essentials slice of the `app` cluster, not the whole 26-file touch-count.
- **The G-30-02 install-hang fix (headline item, hardware-proven live)** — the parked install-hang
  (Phase 30) is resolved: `installQueueElement`'s finally-guard now clears the badge and shows a
  failure dialog on Steam `status:'error'`, a bounded watchdog force-terminates a never-settling
  `.install()` await, and `ensureConnected()` self-heals a stale-but-rehydrated CM socket via a
  bounded canary probe + `client.relog()`. Proven on real hardware under `npm run tauri:dev` (D-13
  gate, 33-05): a Steam install (Baldur's Gate II: Enhanced Edition) never hung, reached
  `Connectivity: online`, and completed. Three latent Tauri-parity gaps were found and fixed DURING
  this live gate (not in the original 33-01..33-04 plan text) — see Accepted Constraints below for
  the `net`/connectivity item; the notification-capability-grant and `windowControlsOverlay` fixes
  are recorded in `33-PORTED-CHANNELS.md`, not repeated here as they add no new deferred-backlog row.
- **`net`/connectivity — moved toward real.** `initOnlineMonitor()` is now wired into the sidecar's
  own `bootstrap.ts` `init()` (once-guarded), not only Electron's `main.ts` `app.whenReady()` which
  the headless sidecar never runs; the electron stub's `net.isOnline()` now exists and falls through
  to the real axios `pingSites()` check. Before this fix (found during the 33-05 live gate, not
  planned in 33-01..33-04), the sidecar was permanently "offline" and every install failed fast with
  "App offline, skipping install" — this is why §3 row 8 below is annotated, not fully closed
  (`screen`/`Menu` remain untouched; only `net`'s online-monitor half moved).

**Claim level (Phase 33): mixed.** The `dialog`/`Notification`/`shell`/`app` forwards are
"wired and unit-proven" (jest: `dialogStub.test.ts`, `lifecycleStub.test.ts`), same claim level as
Phase 31/32. The G-30-02 fix and the three live-gate gap fixes are **hardware-proven** — the first
time this document can make that stronger claim for any row, via the 33-05 D-13 human-approved
live gate.

---

### App shell + window chrome cluster (real, Phase 34.1) — CLOSED, moved out of §3

**Ported in Phase 34.1** (`tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome`, plans
34.1-01..34.1-08). Full enumerated list, one row per channel with its kind/backed-by/proof-level,
in `.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-PORTED-CHANNELS.md`.
This slice wires/re-routes 33 more channels — see the headline-cost tally below.

- **A third port kind joins the vocabulary: `renderer-side (Tauri JS)`.** Alongside the existing
  `sidecar invoke`/`send` (Phases 30–33) and `rustInvoke` (Phase 28+) kinds, 13 of this slice's 33
  channels — the ten D-01 window-chrome verbs (`minimizeWindow`/`maximizeWindow`/
  `unmaximizeWindow`/`closeWindow`/`isMaximized`/`isMinimized`/`isFullscreen`/`setFullscreen`/
  `isFrameless`/`setZoomFactor`), `gamepadAction`, and `createNewWindow`/`showAboutWindow` — call a
  Tauri JS API (or, for `gamepadAction`, plain DOM APIs) directly from the preload with no sidecar
  hop at all. The sidecar registers nothing for these channels; `UNPORTED_CHANNEL_MARKER` is never
  reached because the preload short-circuits first under `isTauri()`. Later slices meeting a
  webview-context-only Tauri JS API (no headless-sidecar equivalent) should expect this same shape,
  not force it through a sidecar registration.
- **Rust side: the `tray-icon` Cargo feature, a bounded `TrayIcon`, and one new
  `dispatch_rust_channel` arm.** `TrayIconBuilder` constructs a real tray non-fatally at `.setup()`
  (tooltip, left-click show/focus, a two-item Show GameLib / Quit menu); both icon variants are
  embedded via `include_bytes!` rather than resolved at runtime (sidestepping this repo's recurring
  publicDir/getAppPath path-resolution failure family). `tray_set_icon` is the slice's **only** new
  arm, bringing the `dispatch_rust_channel` count from 10 to 11; it backs the `changeTrayColor`
  sidecar-send channel via a 500ms collapsing settle timer. Bounded scope only — recent-games
  submenu, About/Reload/Debug items, macOS dock menu, `languageChanged` rebuilds, and
  `noTrayIcon`/`exitToTray` honouring are re-deferred to Phase 35 (see `34.1-PORTED-CHANNELS.md`
  §5), pinned mechanically by a negative source gate proving `main.rs` names none of that scope.
- **New capability grants and a fail-closed child-window boundary.** `src-tauri/capabilities/default.json`
  gained the twelve explicit `core:window:*`/`core:webview:*` commands D-01's window chrome calls,
  plus `core:webview:allow-create-webview-window` for D-12's `WebviewWindow` primitive — both
  scoped to `windows: ["main"]`, with `core:window:default`/`core:webview:default`/`core:tray:default`
  deliberately never granted. Child windows created by `createNewWindow`/`showAboutWindow` are
  labelled from a monotonic counter (`external-<n>`) or the fixed `about` label — **never** derived
  from caller-supplied input and **never** `main` — so a child window's label matches nothing in the
  capability scope and it inherits zero Tauri command access by construction, not by convention.
- **First slice to modify `src/backend/main.ts`.** Every prior Tauri phase left `main.ts`
  byte-identical; this slice converts six handler registrations (`getCustomThemes`/`getThemeCSS`/
  `getCustomCSS`/`getLatestReleases`/`getCurrentChangelog`/`changeLanguage`) to one-line delegations
  into new `src/backend/appshell/*.ts` modules (D-07/D-08), so the additive/reversible invariant
  this seam has relied on since Phase 27 is now **behavioral** (the Electron path calls the same
  extracted function the sidecar does, proven by direct-call tests) rather than **textual**
  (`main.ts` unchanged byte-for-byte). `electronUntouched.test.ts` was inspected during this slice
  and found to be Phase 28's narrow keyring/`configStore` byte-identity proof — it asserts nothing
  about `main.ts` — and was left byte-unchanged; a genuinely new `appShellImportGate.test.ts` gates
  D-09's curated-import discipline (no `electron` import under `src/backend/sidecar/`, no
  side-effect import of `utils/ipc_handler.ts`, and `main.ts`'s six app-shell handlers stay
  delegations) instead of repurposing the Phase 28 file.
- **Claim level (Phase 34.1): unit-proven only, ALL live UAT deferred (D-15).** Unlike Phase 33,
  this slice adds no hardware-proven row. Every one of the 33 channels above is "wired and
  unit-proven," the same claim level as Phase 30–32, and D-15 deliberately declines a Phase
  33-D-13-style live gate for this slice's own headline deliverable — the frameless toggle, the
  titlebar buttons, the tray appearing and its colour changing, gamepad navigation, and macOS
  traffic lights vs custom buttons are all **unobserved**. The ten deferred items with their
  reproduction steps are recorded in
  `.planning/phases/34.1-tauri-ipc-re-plumb-slice-4-app-shell-and-window-chrome/34.1-HUMAN-UAT.md`.
  Do not read "wired and unit-proven" as "seen working" for this cluster.

---

### Game details, settings and overrides cluster (real, Phase 34.2) — CLOSED, moved out of §3

**Ported in Phase 34.2** (`tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid`, plans
34.2-01..34.2-07). Full enumerated list, one row per channel with its kind/backed-by/proof-level,
in `.planning/phases/34.2-tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid/34.2-PORTED-CHANNELS.md`.
This slice wires 26 more channels — see the headline-cost tally below.

- **No new port kind.** This slice uses exactly the two kinds Phases 30–33 established:
  `sidecar invoke` (23 channels) and `sidecar send` (3 channels). Zero `rustInvoke` rows, zero
  `renderer-side (Tauri JS)` rows. **Zero new `dispatch_rust_channel` arms — the count stays at
  11** (last changed by Phase 34.1's `tray_set_icon`). The only Rust-adjacent change is one string
  (`"getCrossoverIndex"`) added to the existing `LONG_RUNNING_CHANNELS` array
  (`src-tauri/src/main.rs`) — a timeout-policy edit extending Phase 30's CR-03 mechanism, not a
  new arm.
- **The slice's actual content: two startup wirings, not 26 delegations.** i18next was never
  initialized in the sidecar, so `i18next.t()` returned `undefined` (not a throw, not the inline
  default) at every backend call site reachable from the sidecar since Phase 30; and
  `fetchLastestReleases()` — the sole emitter of `releasesInfoReady` — was never called, so
  `getAnticheatInfo` structurally could not return data. Both are now wired in `bootstrap.ts`
  (D-02, D-07), alongside the re-homed `releasesInfoReady` → `downloadAntiCheatData` listener that
  `anticheat/ipc_handler.ts` cannot supply to the sidecar (that file's module scope calls
  `addHandler` from `backend/ipc`, forbidden under `src/backend/sidecar/`). **Generalize the
  lesson for later slices: Electron `app.whenReady()` inits are not auto-run in the sidecar, and
  the ones that fail QUIETLY are the dangerous ones** — 34.1's CR-01 caught the loud half of the
  same bug (`changeLanguage()` throwing); this slice found the silent half (`i18next.t()`
  returning `undefined`).
- **Three more Electron-side extractions**, continuing the behavioral-not-textual invariant 34.1
  established: `main.ts`'s 19 game-details/settings/override handler bodies → two new
  `src/backend/gamedetails/{dispatch,overrides}.ts` modules; `readKnownFixes` out of
  `launcher.ts` → `knownFixes.ts` (kept `launcher.ts`'s 2170-line Wine pipeline out of the sidecar
  graph for a 20-line JSON reader); `buildCrossoverRatingMap` out of
  `crossover_index/ipc_handler.ts` → `crossoverRatingMap.ts` (that file co-located the function
  with its own `addHandler` side effect). `electronUntouched.test.ts` was again inspected and left
  byte-unchanged — it remains Phase 28's narrow keyring/`configStore` byte-identity proof, asserts
  nothing about `main.ts`, and was not repurposed. A genuinely new
  `gameDetailsImportGate.test.ts` carries this slice's curated-import, delegation-shape,
  transport-kind and do-not-touch gates, mirroring `appShellImportGate.test.ts`'s shape rather
  than extending it.
- **Claim level (Phase 34.2): unit-proven, and genuinely STRONGER than 34.1's.** Unlike 34.1's
  visual/interactive deliverable (which jest structurally could not see), this slice is almost
  entirely data-in/data-out — 26 channels with assertable return shapes, exercised over the real
  sidecar RPC loop, so "wired and unit-proven" is genuinely close to "works" here. It has exactly
  **two named live-UAT exceptions, D-02 and D-07** — the two bootstrap wirings above, whose
  effects (a rendered notification string; a downloaded anticheat data file) only appear in a live
  sidecar boot and are deliberately deferred, recorded with reproduction steps in
  `.planning/phases/34.2-tauri-ipc-re-plumb-slice-5-game-details-settings-and-overrid/34.2-HUMAN-UAT.md`.
  Do not read "wired and unit-proven" as "seen working" for this cluster either — that is exactly
  how G-30-02 was declared fixed twice while the live build hung.

### Shell, files, logs and diagnostics cluster (real, Phase 34.3) — CLOSED, moved out of §3

**Ported in Phase 34.3** (`tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics`, plans
34.3-01..34.3-07). Full enumerated list, one row per channel with its kind/backed-by/proof-level,
in `.planning/phases/34.3-tauri-ipc-re-plumb-slice-6-shell-files-logs-and-diagnostics/34.3-PORTED-CHANNELS.md`.
This slice wires 29 more channels, but — state this plainly, the same correction that document's
own opening section makes — the 29-channel count is not this slice's real cost. 15 of the 29
reduce to `openUrlOrFile()`/`showItemInFolder()` in `utils.ts`, already in the sidecar's import
graph and already reaching Rust arms (`open_external`/`shell_open_path`/`reveal_item_in_dir`) that
existed before this slice started. The slice's actual content is three pieces: **a new clipboard
platform seam** (the one genuinely missing Electron-API capability this project had), **a
JS-side `app.relaunch()`/`app.quit()` ordering fix** contained entirely inside `electronStub.ts`,
and **this re-plumb series' first blocking live gate** (5 named items, not a 29-channel UAT).

- **Channel-kind breakdown.** No new port kind — this slice uses exactly the two kinds Phases
  30–34.2 established: `sidecar send` (20 channels) and `sidecar invoke` (9 channels). **Two new
  `dispatch_rust_channel` arms** — `clipboard_write_text` and `clipboard_read_text` — the only Rust
  arms this slice adds, taking the running arm count to 13 (last changed by Phase 34.1's
  `tray_set_icon`). Both arms call `app.clipboard()` from `tauri-plugin-clipboard-manager`,
  registered with **zero** `clipboard-manager:*` renderer capability grant — the capability file's
  own stated principle (capabilities gate webview→Rust IPC only, not Rust-side plugin calls, the
  same reasoning Phase 33's WR-03 used to refuse `dialog:allow-open`) still holds.
- **Accepted-gap riders**, all declared in `34.3-PORTED-CHANNELS.md`, not left to a reviewer's
  memory: `deleteUploadedLogFile`'s both-builds structural deadness (`uploader.ts:74-77`'s
  hardcoded `token = '1'` — an inherited upstream Heroic defect, not port-introduced, distinct from
  34.2's D-07 which *was* port-introduced); the Humble key-copy silent-failure risk on
  `clipboardWriteText` (log-only failure at Electron parity, D-03, a known accepted risk against
  `HumbleClaimWizard/index.tsx:120,366`); `electronStub.clipboard.readText()`'s documented,
  deliberately-dead synchronous no-op stub (D-04 — the real Rust-backed `clipboardReadText`
  handler bypasses it entirely); and the filed-not-audited log-redaction security todo (D-09 — no
  audit was performed, by explicit user instruction, and the question is open, not answered).
- **Invariants A and B still hold.** No channel outside this slice's 29 gained a registration this
  phase, so every channel Phase 35 has not yet reached still rejects non-fatally exactly as
  Invariant B requires. Invariant A (`window.api` attachment order) is unaffected — this slice adds
  no new module that reads `window.api` at module scope.
- **Incremental-Port Checklist step 3** (give a stubbed Electron API real behavior bound to a real
  Tauri command, rather than leaving it a silent no-op) was executed for `clipboard`: 34.3-03 added
  the `tauri-plugin-clipboard-manager` plugin + the two dispatch arms above, and 34.3-05 replaced
  `electronStub.clipboard.writeText`'s Phase 31 D-04 logged no-op with a real fire-and-forget
  forward, mirroring `shell.showItemInFolder`'s existing template.
- **Checklist step 4** (declare a new persisted-config store in `storePolicy.ts`'s tier lists and
  `storeRegistration.ts`'s side-effect import list) was a **no-op this slice** — `uploadedLogFileStore`
  and `gogAchievementStore` were already registered by Phase 29's D-15 extraction, so this slice
  needed zero new store plumbing.
- **D-05 resolved to NO FIX, not a fix that shipped.** Research verified, at HIGH confidence via a
  direct read of `tauri = 2.11.5` (as pinned by `Cargo.lock`), that `AppHandle::restart()` already
  fires `RunEvent::Exit` for this codebase's worker-thread `dispatch_rust_channel` calling pattern
  — so the existing Phase 33 `shutdown_child()` handler already runs before the process re-execs.
  The orphan-sidecar scenario was an inference from Tauri's API semantics, not a measured defect;
  34.3-03 recorded the verified finding as a code comment above the `app_relaunch` arm rather than
  adding a `state.shutdown_child()` call, which would have been dead code.
- **Claim level (Phase 34.3): this slice DELIBERATELY BREAKS the unit-proven-only precedent.**
  Phase 30's D-04 → 34.1's D-15 → 34.2's D-11 all deferred a live gate because jest's assertion-only
  evidence was close enough to "works" for those slices' data-in/data-out channels. This slice
  cannot make that claim for its own headline content: most of these channels' *entire purpose* is
  an observable OS side effect (a browser window opening, Finder revealing a file, a real clipboard
  round-trip, a process actually exiting) that jest structurally cannot see, plus two Rust arms CI
  never compiles and one destructive channel (`resetHeroic`) whose failure mode is only visible in
  the process table. A **blocking** 5-item live gate (34.3-09, `34.3-LIVE-GATE.md`) is the phase's
  closing condition for exactly this reason — this is the gate 34.2 itself named as its
  "highest-value optional gate" and deferred. Do not read "wired and unit-proven" as "seen working"
  for this cluster either — that is exactly how G-30-02 was declared fixed twice while the live
  build hung.

---

## 2. Stubbed / Minimal (intentionally cut down to what these two flows need)

- **`fileStore.ts`** — graduated to §1 in Phase 29; see `### The store layer (real, Phase 29)`
  above.
- **`shell`** — only `openExternal` has real behavior (forwarded to the Rust opener);
  `showItemInFolder`/`trashItem`/`openPath` are no-ops. **Phase 28 fix:** the sidecar→Rust
  `openExternal` frame was previously silently dropped on the Rust side (`start_reader()` had no
  branch for it — see the historical `safeStorage` note above for how this was discovered).
  `start_reader()` now has an explicit `kind == "openExternal"` branch that actually dispatches
  the URL through the same opener facility `open_external` uses, fire-and-forget (Open Question 2,
  resolved as a minimal fix — see `28-PROOF.md` § 5). Not hardware-verified end-to-end this phase
  (no login channel exists yet to reach a launchable game) — see `28-PROOF.md` § 2 Step 5,
  recorded as NOT VERIFIED rather than assumed.
- **`BrowserWindow`** — only `getAllWindows()[0].webContents.send` has real behavior (the push
  path); no real window management exists in the sidecar process.
- **Tauri-path preload globals** (`isSteamDeck`, `isFlatpak`, `platform`, etc., 27-03) — hardcoded/
  navigator-derived fallbacks, not the real Node-based detection (`os.cpus()`, `graceful-fs`);
  neither Steam Deck nor Flatpak detection is load-bearing for either flow.
- **`pathShim.ts`'s `userData`** — resolves to `join(appData, 'GameLib')` by convention (matches
  the `'GameLib'` literal already used in `paths.ts`), not observed from a real
  `app.getName()`-derived Electron value — flagged in 27-02 for later verification against a real
  packaged build.

---

## 3. Deferred (out of scope this phase, the incremental-port backlog)

Ranked by spike 009's own 16-API touch-count (`app` ×26, `dialog` ×9, `BrowserWindow` ×7,
`shell` ×5, `nativeImage` ×4, `Notification` ×3, `session`/`screen`/`net`/
`Menu` ×2, `protocol`/`powerSaveBlocker`/`clipboard`/`Tray`/`ipcMain` ×1). `safeStorage` is
removed from this table — it graduated to §1 Ported in Phase 28.

| Priority | API / cluster | Files touched | What's needed to port |
|---|---|---|---|
| 1 | `app` (lifecycle beyond getPath/getName) | 26 | **Partially closed, Phase 33 + Phase 34.1** — `quit`/`exit`/`relaunch` are real since Phase 33 (`AppHandle::exit()`/`restart()`), fixing the "zombie sidecar" gap. **Tray registration is now CLOSED (Phase 34.1, bounded)** — see the new §1 subsection and `34.1-PORTED-CHANNELS.md`'s re-deferral list for exactly what's still out of scope (recent-games submenu, dock menu, etc., target Phase 35). Updater hooks and custom-protocol registration remain deferred — target **Phase 34/35** |
| 2 | `dialog` | 9 | **Fully closed, Phase 33.** `showMessageBox` now real multi-button (`MessageDialogButtons::OkCancelCustom`, per-caller `cancelId` fail-safe, D-07) — retires the Phase 31 CR-01 safe-sentinel stopgap. Joins `showErrorBox`/`showSaveDialog` (Phase 31) and `dialog_open` (Phase 30). Only `showMessageBoxSync`/`showOpenDialogSync` remain deferred — logged no-ops, sync-over-async, no in-scope caller re-examined this phase, target **Phase 35** |
| 3 | `BrowserWindow` (full window management) | 7 | **Partially closed, Phase 34.1** — real multi-window now exists via `WebviewWindow` for `createNewWindow`/`showAboutWindow` (D-12, renderer-side Tauri JS, zero new Rust arms). What remains deferred is the `<webview>` login story (navigation interception, OAuth redirect capture, session/cookie access) — target **Phase 34.4** |
| 4 | `shell` (remaining methods) | 5 | **Mostly closed, Phase 33** — `showItemInFolder`/`openPath` now real via `tauri-plugin-opener`. `trashItem` stays a LOGGED no-op (Accepted Constraint below, no vetted Tauri v2 plugin has trash capability) — target **Phase 35 revisit** |
| 5 | Login channel (`startQRLogin`/`startCredentialLogin`) | n/a — new sidecar handler(s), not a stubbed Electron API | **CLOSED for the QR branch, Phase 30** (`checkSteamInstalled`/`steamStartQR`/`steamPollQR`, wired and unit-proven, live scan deferred per D-04). The credential/SteamGuard/TOTP prompt path and sign-out (`steamStartCredentials`/`steamSubmitGuard`/`steamPollCredential`/`getSteamUserInfo`/`logoutSteam`) remain deferred (D-02) — natural home is whichever future phase needs sign-in without a phone |
| 6 | `nativeImage` | 4 | **Partially addressed, Phase 34.1** — the new tray (see §1) uses compile-time `include_bytes!` images rather than a `nativeImage` API call; per-platform icon resizing stays deferred — target **Phase 34/35** |
| 7 | `Notification` | 3 | **Fully closed, Phase 33** — real via the new `tauri-plugin-notification` plugin (`isSupported()` → `true`, `.show()` forwards title/body) |
| 8 | `session`/`screen`/`net`/`Menu` | 2 each | **Partially closed, Phase 33** — `net`'s online-monitor half moved toward real (`initOnlineMonitor()` wired into sidecar `bootstrap.ts`, `net.isOnline()` added to the stub); `session` stays a LOGGED no-op (Accepted Constraint below, D-09). `screen`/`Menu` untouched — target **Phase 34/35** |
| 9 | `protocol`/`powerSaveBlocker`/`clipboard`/`Tray`/`ipcMain` (remaining) | 1 each | **`Tray` is now CLOSED (Phase 34.1, bounded)** — a real `TrayIconBuilder` tray exists (see the new §1 subsection); scope beyond the bounded minimum is re-deferred to Phase 35. `powerSaveBlocker` remains the existing LOGGED no-op (Accepted Constraint below, D-08, carried forward unchanged this phase). **`clipboard` is now CLOSED (Phase 34.3, real seam)** — see the new §1 subsection; `protocol`/`ipcMain` (remaining) untouched — target **Phase 34/35** |

**The IPC re-plumb (the headline cost):** ~208 of the 220 total IPC endpoints (158 `addHandler` +
62 `addListener`, `AsyncIPCFunctions` ≈335 typed entries per spike 009) remain on the Electron
`ipcMain`/`ipcRenderer` transport, unported. This skeleton wired exactly 4 (`refreshLibrary`,
`pushGameToLibrary` push, `launch`, `sidecar:store-snapshot`); Phase 30 wired 9 more
(`checkSteamInstalled`, `steamStartQR`, `steamPollQR`, `install`, `uninstall`, `updateGame`,
`checkGameUpdates`, `listSteamLibraryTargets`, `gameStatusUpdate` push — enumerated in
`30-PORTED-CHANNELS.md`); Phase 31 wired 8 more (`setSetting`, `writeConfig`, `getMaxCpus`,
`showUpdateSetting`, `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative` — enumerated in
`31-PORTED-CHANNELS.md`), for 21 wired total; Phase 32 wired/re-routed 7 more (`getDMQueueInformation`,
`removeFromDMQueue`, `pauseCurrentDownload`, `resumeCurrentDownload`, `cancelDownload` newly
registered; `install`/`updateGame` re-routed off the Phase 30 D-05a bypass onto the real queue —
enumerated in `32-PORTED-CHANNELS.md`, which also declares the two push channels
`progressUpdate`/`changedDMQueueInformation` riding the existing relay with zero new registration),
for 28 wired/re-routed total; Phase 34.1 wired/re-routed 33 more (13 renderer-side (Tauri JS), 8
sidecar invoke, 11 sidecar send including `changeTrayColor`'s new `tray_set_icon` rustInvoke arm,
and 1 confirmed-already-live-via-bootstrap — enumerated in `34.1-PORTED-CHANNELS.md`), for 61
wired/re-routed total; Phase 34.2 wired 26 more (23 sidecar invoke, 3 sidecar send, zero new port
kinds, zero new `dispatch_rust_channel` arms — enumerated in `34.2-PORTED-CHANNELS.md`, which also
records the two bootstrap wirings, D-02 and D-07, as this slice's actual load-bearing content),
for **87 wired/re-routed total**. The `callTool` channel (`src/backend/tools/ipc_handler.ts:25`,
Winetricks/winecfg/runExe) was reassigned out of the Slice 4 grouping to the Phase 34.5 slice by
Phase 34.1's own CONTEXT decision D-14 before this tally — it was never counted in Phase 34.1's 33.
(`showMessageBox`/`showErrorBox`/`showSaveDialog`
are `rustInvoke` channels, not sidecar `invoke`/`send` channels, and are counted alongside
`dialog_open` outside this tally — same convention Phase 30 established.) Porting the rest is
mechanical per endpoint (curate a sidecar invoke handler like `steamFlowRegistration.ts` did) but
large in volume — pick the next slice by user-facing value, not API-touch-count alone.

**The `electron-store` project-wide swap:** this WAS the phase-sized unit of work predicted
above, and it is now done — Phase 29 generalized `fileStore.ts` into a full read/write store
layer covering every `ValidStoreName` plus the four D-13 cache stores (see
`### The store layer (real, Phase 29)` in §1). What remains deferred: full `electron-store`
semantics parity (schema validation, migrations — `fileStore.ts` still implements neither), a
public `onDidChange`/reactive store API (Phase 29's `storeChanged` push is a fixed internal
mechanism, not a general subscription API exposed to callers), and flipping the ELECTRON preload
path (`misc.ts`'s `SECRET_STORE_KEYS` deny-list) onto the same fail-closed allow-list the Tauri
path now uses — deferred to the Phase 35 Electron cutover per D-08 below.

**The 44-file lifecycle/dialog/tray/updater/protocol cluster:** beyond `app.getPath`/`getName`, the
opener path, and Phase 33's dialog/Notification/shell/app-lifecycle closures (see the ranked table
above and the Phase 33 §1 subsection), tray/protocol/updater/multi-window/`nativeImage` still have
no real Tauri-side behavior.

**Also deferred (per 27-CONTEXT):**
- Windows/Linux Tauri packaging, auto-update, code signing, notarization.
- Electron removal from the repo — the Electron build (`npm start`) stays intact and byte-identical.
- `session`/`powerSaveBlocker` — **upgraded to LOGGED no-ops in Phase 33** (D-08/D-09, Accepted
  Constraints below); still no real Tauri v2 parity behind either. Multi-account flows and the
  macOS Steam bridge (Idea B, Phase 24) remain unrelated, untouched arcs.
- **`launcher.ts`'s full Wine/GameConfig/DownloadManager pipeline (STILL deferred).** Corrected
  2026-07-25, Phase 34.2: this bullet previously claimed `steamFlowRegistration.ts` deliberately
  imports only `SteamLibraryManager`/`SteamGame`, never `storeManagers/index.ts`'s
  `libraryManagerMap` — **that claim is now partially stale.** As of Phase 34.2,
  `gameDetailsFlowRegistration.ts` dispatches runner-generically through `libraryManagerMap` for
  all six managers (D-01), resting on the Phase 32 D-02 finding that `storeManagers/index.ts`
  force-constructs all six managers in the sidecar regardless — so narrowing would buy nothing and
  would mean shipping a runner guard Electron does not have. What genuinely remains deferred:
  `launcher.ts`'s own 2170-line Wine/GameConfig/DownloadManager pipeline itself — only
  `readKnownFixes` (a 20-line, fully self-contained JSON reader) was extracted out of it
  (`knownFixes.ts`, Phase 34.2 D-05), precisely to avoid importing the rest of that module into the
  sidecar graph. `prepareWineLaunch`/`runWineCommand`/`callRunner` and the full pipeline remain
  unported — target Phase 34.5/35.

---

## Accepted Constraints (Phase 29)

- **D-07 — cross-process write clobber (ACCEPTED).** Running the Electron build and the Tauri
  build concurrently against the same `userData` folder can silently erase each other's config
  writes: each process caches the whole JSON file in memory at construction and rewrites it
  wholesale on every `set`. This is a dev-only situation — the shipped product is one app, never
  both builds live at once against the same profile. Rejected alternatives: re-read-before-write
  (adds latency to every hot-path `.get()` caller), an advisory lock file (adds a failure mode —
  a stale lock from a crashed process — worse than the clobber it prevents), and a separate Tauri
  `userData` folder (would break the shared-folder property D-01 depends on and Phase 28's
  Keychain proof shape deliberately relied on). Recorded identically in
  `src/backend/sidecar/fileStore.ts`'s module docstring.
- **D-14 — in-process same-path sharing (FIXED).** `steamConfigStore` and
  `steamBottleConfigStore` (`src/backend/storeManagers/steam/electronStores.ts`) both resolve to
  `steam_store/config.json` (neither passes `options.name`; `fileStore.ts` defaults it to
  `'config'`). Real Electron's `electron-store`/`conf` survives this because it re-reads the file
  from disk on every access; `fileStore.ts` previously cached the loaded JSON once per instance,
  so constructing `steamBottleConfigStore` would have armed a silent same-process clobber. Fixed
  in Phase 29 Plan 01 with a path-keyed shared data cell (`cellRegistry`) — every `FileStore`
  instance at the same resolved path now reads/writes the SAME in-memory object. In-process only
  — the cross-process case remains D-07, above.
- **D-08 — divergent secret policies (ACCEPTED, TEMPORARY).** The Tauri path
  (`tauriTransport.ts`/`storeWriteHandlers.ts`) enforces a fail-closed ALLOW-LIST
  (`src/common/types/storePolicy.ts`'s `STORE_ALLOWLIST`); the Electron path (`misc.ts`) keeps
  its original 2-key `SECRET_STORE_KEYS` deny-list, kept byte-identical because flipping the
  shipped build to fail-closed today risks blocking a legitimate read among the 379
  `window.api.*` call-sites — an untested blast radius this phase deliberately did not take on.
  Both sites carry a cross-referencing comment naming this divergence. Converge at the Electron
  cutover (Phase 35), per the Phase 28 D-11 precedent for the same class of deferred
  reunification.
- **D-01 — persistence stays in the Node sidecar (LOCKED).** Rust / `tauri-plugin-store` was
  evaluated and rejected for Phase 29's store-layer generalization: it would make every sidecar
  store read async and cross-process, forcing a refactor of every synchronous module-scope
  `.get()` caller across the many files that route through `electron_store.ts`/`fileStore.ts`.
  Rust's role stays "the platform seam" (keyring, opener — see `### safeStorage (real, Phase 28)`
  above), not "the database". Do not re-litigate this in a later phase without a concrete new
  requirement `tauri-plugin-store` uniquely satisfies.
- **D-03 (Phase 30) — two-token divergence (ACCEPTED, document-only).** Signing in under Tauri
  does not sign you in under Electron: the sidecar stores a keyring-native Keychain entry,
  Electron stores Chromium OSCrypt ciphertext in `configStore`. Correct consequence of Phase 28
  D-01, not a bug. Convergence rejected (would require hand-rolling OSCrypt in the sidecar).
  Mirrored in `src/backend/sidecar/keyringTokenStore.ts`'s docstring. No new proof artifact.
- **D-05a (Phase 30) — install is a direct `SteamGame` bypass, NOT a `downloadqueue.ts` port.**
  ~~Reason from 30-02: the queue's only Steam-relevant behavior is a status push plus install
  sizing (two direct calls); everything else is runner-irrelevant or Phase 32's cluster. Phase 32
  inherits this boundary and should build its own curated queue port when it needs
  pause/resume/cancel.~~ **CLOSED/SUPERSEDED by Phase 32.** The direct bypass is fully deleted
  (not wrapped) — `install`/`updateGame` now build the same `DMQueueElement` Electron's
  `ipc_handler.ts` builds and call the same real `addToQueue()`, and the five queue-management
  channels (`getDMQueueInformation`/`removeFromDMQueue`/`pauseCurrentDownload`/
  `resumeCurrentDownload`/`cancelDownload`) are registered on the sidecar reaching
  `downloadqueue.ts` unchanged. See `### Download-queue cluster (real, Phase 32)` in §1 and
  `32-PORTED-CHANNELS.md` for the full enumerated boundary.
- **D-05b/D-12 (Phase 30) — `uninstall`/`checkGameUpdates` reuse the runner-generic handlers
  unchanged, all runners.** Reason: `libraryManagerMap`'s import cost is already sunk via
  `steamFlowRegistration.ts`'s load-bearing first import (verified), so a Steam-only reshape buys
  zero import savings and only forks Tauri's behavior from Electron's.
- **D-02 (Phase 31) — Tauri/Electron settings divergence (ACCEPTED, document-only).** The
  sidecar persists settings locally through the real Phase 29 store layer (`configStore`/
  `STORE_ALLOWLIST`, global branch) or a raw `graceful-fs` write (`GameConfig.flush()`, per-game
  branch), and pushes no `settingsChanged` reflect notification to the Electron build. A setting
  changed under Tauri is not live-reflected in a concurrently running Electron instance, and vice
  versa. Consistent with the Phase 30 D-03 two-token divergence and the Phase 29 D-07
  cross-process write-clobber acceptance — same class of "one app, never both builds live at once
  against the same profile" reasoning. `useSettingsContext` already holds the just-written value
  locally and never re-reads after `setSetting`, so no push channel is architecturally required
  for the Tauri UI's own correctness. Cross-referenced in `settingsFlowRegistration.ts`'s block
  comment above the write path. Converge at the Phase 35 Electron cutover, per the Phase 28 D-11
  precedent for the same class of deferred reunification.
- **D-08/D-09 (Phase 33) — `session`/`powerSaveBlocker` accepted parity gaps (ACCEPTED, TEMPORARY).**
  Spike 011 flagged both as "soft spots" with no full Tauri v2 parity available. Phase 33 did not
  close either — it upgraded both from silent-or-absent to LOGGED no-ops so a future reachable call
  fails loudly (a `console.warn` naming the gap) instead of an opaque `undefined`/`TypeError`.
  `session` was previously not even exported by `electronStub.ts`; it now has a `fromPartition()`
  stub. `powerSaveBlocker.start` now logs instead of silently doing nothing. Neither has real Tauri
  behavior. Revisit at Phase 35 if/when Tauri v2 closes the parity gap upstream. Full enumerated
  detail in `33-PORTED-CHANNELS.md`.
- **D-11 (Phase 33) — WR-02 non-Steam DLC fan-out re-scope (ACCEPTED, document-only).** The
  sidecar's `installQueueElement` install path is Steam-focused, not runner-generic for DLCs. A
  non-Steam runner (Epic/GOG/Amazon) reaching this path with `installDlcs` populated logs a
  `logWarning` naming the re-scope explicitly (`downloadmanager/utils.ts`) rather than silently
  dropping the DLC fan-out. This is a declared boundary matching the phase's stated Steam-focused
  scope, not a discovered gap — the Epic/GOG DLC fan-out logic itself is unported and untouched.
  Not scheduled for a future phase; revisit only if a non-Steam DLC install becomes a real user
  flow requirement.

---

## Incremental-Port Checklist (for the next phase that extends this seam)

1. Pick the next channel(s) from spike 009's ranked table above (prefer high-value user-facing
   flows: install, uninstall, update-check are natural next E2E slices reusing this skeleton's own
   pattern).
2. Add a curated `ipcMain.handle(...)` registration in a new `<domain>FlowRegistration.ts`
   (mirrors `steamFlowRegistration.ts`) importing only the real backend code the new flow needs —
   do not eagerly pull in `storeManagers/index.ts`'s full `libraryManagerMap` unless the flow
   genuinely spans multiple store managers.
3. If the new flow needs a new Electron API behavior beyond what `electronStub.ts` already
   stubs (real `dialog`, real `safeStorage`, etc.), give that API real behavior in `electronStub.ts`
   bound to a real Tauri command in `src-tauri/src/main.rs` (mirrors `openExternal`'s
   forward-to-transport pattern) rather than leaving it a silent no-op.
4. If the new flow needs additional persisted config, declare the store in `storePolicy.ts`'s
   tier lists (`BOOT_SET_STORES`/`LAZY_STORES`) and allow-list (`STORE_ALLOWLIST`), and add its
   declaration module to `storeRegistration.ts`'s side-effect import list — do NOT hand-extend
   `sidecar:store-snapshot` or `sidecar:store-fetch` ad hoc; both are now generic and read the
   declared lists (Phase 29).
5. Re-run this document's own acceptance shape: list the newly wired channel(s) under §1, move
   them out of the deferred table in §3, and re-verify `npm run tauri:dev` + `npm start` both work
   (the additive/reversible invariant, REQ-27-06 pattern) before calling the slice done.
6. If the new flow needs the sidecar to ASK Rust something and get a real answer back (not just
   fire-and-forget), reuse the generic `rustInvoke` sidecar→Rust request/response channel Phase 28
   built for the keyring calls (`requestRustInvoke()` in `src/backend/sidecar/sidecarRpc.ts`,
   dispatched by `dispatch_rust_channel()` in `src-tauri/src/main.rs`) rather than inventing a new
   correlated-request mechanism. This is the reusable pattern for any future API needing a real
   Rust-side answer — `dialog`, `clipboard`, `notification`, `screen` were the motivating examples
   when it was built.

---

## Load-Bearing Invariants (learned the hard way in the 27-05 live run)

Two non-obvious rules the skeleton depends on. Both were discovered only by running the real
build — every automated test passed while the window rendered blank.

### A. `window.api` attachment order is a DEPENDENCY, not a convention

The renderer has no Electron preload under Tauri, so `preload/tauriAttach.ts` must assign
`window.api` before any module that reads it at module scope (`frontend/helpers/index.ts` captures
`window.api.readConfig`; `frontend/helpers/electronStores.ts` calls `window.api.storeNew` from
constructors at module scope).

Declaring the attach as the entry's first import in `index.tsx` is **not sufficient in a built
bundle.** Source order governs modules; Rollup's *chunking* governs what actually executes first.
In the failing build, Rollup inlined `tauriAttach` into the entry chunk while `helpers/index.ts`
landed in a shared chunk the entry chunk imports — and an imported chunk is evaluated in full
before any of the importing chunk's own module bodies. The attach ran second, `window.api` was
undefined, and the module-scope read threw *inside the module graph*, producing a silent blank
window (it surfaced as a rejected dynamic import, which the on-page error surface cannot catch).

**Rule:** any module that touches `window.api` at module scope must `import '../../preload/tauriAttach'`
itself. Evaluation order between a module and its dependency is fixed by the spec regardless of
chunk boundaries. Do not rely on entry-file import order. Symptom of a violation: blank window,
`undefined is not an object (evaluating 'window.api.<anything>')`, and NO `[GameLib] tauriAttach
evaluating` line in the console.

### B. Unported channels must stay non-fatal

Much of the frontend invokes IPC at module scope with an uncaught `.then()` (e.g.
`frontend/state/UploadedLogFiles.ts` → `getUploadedLogFiles()`). Under Electron those can never
reject — every handler exists. Against this sidecar, which registers only a curated handful of
channels, each one rejects as an unhandled rejection during boot. Treating those as fatal makes the
skeleton unusable until all ~217 endpoints are ported, i.e. it defeats the point of a walking
skeleton.

**Contract:** `sidecarRpc.ts` tags handler-missing rejections with `UNPORTED_CHANNEL_MARKER`
(`common/types/sidecarTransport.ts`). The response is still `ok: false` — the promise rejects
honestly, only the *reason* is classified. `frontend/bootErrorSurface.ts` matches that marker and
logs a warning instead of painting over the page, and additionally never clobbers an
already-mounted app. As channels are ported, these warnings disappear on their own.

Note `bootErrorSurface.ts` duplicates the marker as a literal rather than importing it: that
module's zero-import property is what guarantees its handlers register before anything they need to
catch — precisely the invariant rule A shows is fragile. Keep the two in sync by hand.
