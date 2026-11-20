# Sidecar bootstrap sweep — unported non-handler side effects

Discharges todo `2026-09-05-sidecar-bootstrap-never-swept-for-unported-non-handler-side-effects.md`
(residue of `2026-08-24-installed-json-watcher-never-ported-to-the-tauri-sidecar.md`'s third
suggested-fix clause).

## Method

The todo said the sweep target no longer exists. It does — in history, not in the tree:

```
$ git log --oneline --all --diff-filter=D -- src/backend/main.ts
5643c7583 feat(35-14)!: delete the Electron entry points — POINT OF NO RETURN (commit A)

$ git show 5643c7583^:src/backend/main.ts   # 1561 lines
```

That recovers the exact pre-cutover file the parent todo wanted diffed, so the sweep did NOT have
to fall back to the todo's suggested "grep the sidecar and guess" approach. Candidates were taken
from the deleted file's non-handler side effects (`app.whenReady()` body, `initializeWindow()`
body, module-scope `app.on(...)` / `process.on(...)` / `watch(...)`, and the two bare
`setTimeout`s), deliberately excluding `addListener(...)` / `ipcMain.handle(...)` — those carry a
channel name and are already covered by `.planning/IPC-PORT-INVENTORY.md`.

Each candidate was then discharged against the **shipping bundle**, not the source tree, per the
parent todo's own cheap-decisive test:

```
$ ls -la build/main/sidecar.js
-rw-r--r--@ 1 graysonmitchell staff 1351269 Sep 6 10:27 build/main/sidecar.js
```

A symbol present only as a definition (or only in a comment) with no call site in the bundle is
proof the effect cannot fire under Tauri, regardless of what the source tree looks like.

## Ledger

### A. Confirmed UNPORTED — new defects, not previously ledgered

| # | Side effect (old `main.ts`) | Bundle evidence | Consequence |
|---|---|---|---|
| A1 | `playtimeSyncQueue.delete('lock')` at startup (`:469`) | `playtimeSyncQueue.delete("lock")` appears **exactly once**, at `sidecar.js:23940`, inside `syncQueuedPlaytime()` itself | The lock is only ever cleared on the success path. A crash/kill/throw mid-sync leaves `lock` persisted in the CacheStore, and `syncQueuedPlaytime()`'s `if (playtimeSyncQueue.has('lock')) return` guard (`gog/library.ts:170`) then short-circuits **forever**. `main.ts` cleared the stale lock on every boot; nothing does now. GOG playtime sync is permanently dead after one interrupted sync. |
| A2 | `runOnceWhenOnline(() => libraryManagerMap['gog'].syncQueuedPlaytime())` at startup (`:471`) | only caller in bundle is `sidecar.js:23753` (`gog/games.ts:1346`, post-game-session) | Sessions queued while offline never drain at boot — they wait for the *next* completed GOG game session. A user who plays offline and then never launches another GOG game never uploads that playtime. |
| A3 | `runOnceWhenOnline(gogPresence.setPresence)` at startup (`:477`) | `setPresence` call sites in bundle: `:2434` (its own 5-min `setInterval`, armed only from inside a first call), `:2496` (`settingChanged` listener), `:8205`/`:8220` (`launcher.ts`, game start/stop). **No startup call.** | GOG presence never goes online while GameLib runs. Because the 5-minute keep-alive interval is armed *inside* `setPresence`, nothing arms it either. The feature only works after the user launches a GOG game. |
| A4 | `runOnceWhenOnline(async () => { if (!LegendaryUser.isLoggedIn()) configStore.delete('userInfo'); if (GOGUser.isLoggedIn()) GOGUser.getUserDetails() })` (`:442-457`) | log string `User Not Found, removing it from Store` → **0 occurrences** in bundle | Two effects lost: (a) a stale Epic `userInfo` is never reconciled away, so the UI can show a phantom logged-in Epic user after legendary's own credentials go bad; (b) GOG user details are never refreshed at boot, so username/avatar go stale until the next login. |
| A5 | `mainWindow.on('focus', () => libraryManagerMap['steam']?.refreshInstallState?.())` (`:272-274`, D-01/D-02) | `refreshInstallState` in bundle: `:15063` (doc comment) and `:15102` (the method definition). **Zero call sites.** | Steam install badges never reconcile against live ACF data while GameLib runs. Install/uninstall performed in the Steam client itself is invisible until a full library refresh. The method, its D-01/D-02 rationale and its 8 unit tests all survive — only the trigger is gone. No Tauri window-focus event is wired to the sidecar (`src-tauri/src/main.rs` has `set_focus()`/`.focused(true)` calls but no focus-*listener* forwarding). |
| A6 | `checkRosettaInstall()` on macOS (`:241`) | **0 occurrences** in bundle; in-tree it is defined at `utils.ts:1395` and referenced only by its own test file | Apple Silicon is now the only supported Mac target, and every Steam title GameLib runs is a Windows binary under Wine/GPTK — all of which need Rosetta. The boot-time probe and its "install Rosetta" guidance dialog are gone, so a machine without Rosetta fails opaquely at launch instead of being told. |
| A7 | `detectVCRedist(mainWindow)` (`:288`, Windows) | **0 occurrences** in bundle; in-tree defined at `utils.ts:775`, re-exported at `utils.ts:1789`, no caller | Windows users are never prompted to install the VC++ redistributable. Windows is not the operator's primary OS, so this is unverifiable locally — same class as the existing single-instance todo. |

### B. Confirmed unported but DEGRADED-NOT-LOST — deferred, not dropped

| Side effect | Where it went |
|---|---|
| `void DXVK.getLatest()` (`:233`) | now only runs lazily from `tools/index.ts:250`, when DXVK is found missing at use time |
| `Winetricks.download()` (`:235`) | now only runs lazily from `tools/index.ts:577`, when winetricks is found missing at use time |
| `downloadDefaultWine()` when no Wine present (`:237`) | now only runs from the launch path (`utils.ts:1094`) |

The 2.5s background pre-fetch is gone, so the *first* Wine-dependent action pays a download it
used to have already paid in the background. Correctness is intact. Recorded so this is a
deliberate, known cost rather than an unexplained omission.

### C. Already ledgered elsewhere — sweep confirms, files nothing new

| Side effect | Existing record |
|---|---|
| `watch(legendaryInstalled, ...)` (`:1039`) | **PORTED** — `bootstrap.ts` Block C, `installedJsonWatcher.ts` (the parent todo's headline fix) |
| `initImagesCache()` (`:415`) | accepted gap D-05 / 35-PREFLIGHT PD-B. 0 occurrences in bundle, but the consumer is neutralised at a single named predicate — `imageCacheSchemeAvailable()` returns `false` (`preload/tauriTransport.ts`), and `platform/index.ts:954` explicitly forbids deleting the no-op shim |
| `refreshCrossoverRatingMap()` (`:416`) | explicitly NOT PORTED with rationale at `sidecar/steamFlowRegistration.ts:223-234` |
| `initStoreManagers()` (`:414`) | dead under Tauri (`initstoremanagers-dead-under-tauri`) |
| `app.on('before-quit')` → `stopRunningPoll()` + `shutdownBridgeHelper()` (`:720`) | `2026-09-01-helper-processes-orphan-on-app-quit-no-before-quit-hook-under-tauri.md` |
| `app.on('second-instance')` (`:399`) + `app.setAsDefaultProtocolClient` (`:511`) | `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` |
| `startPlausible()` on `analyticsOptIn` (`:461`) | telemetry removed wholesale — quick task `260901-w9e` |
| `initTrayIcon(mainWindow)` (`:558`) | **PORTED to Rust** — `TrayIconBuilder` at `src-tauri/src/main.rs:42`, Phase 34.1 Plan 06 D-11 |
| `protocol.handle('gamelib', ...)` (`:502`) + `app.on('open-url')` (`:728`) | **PORTED** — `deliverStartupProtocolUrl()` (cold) + `registerProtocolUrlHandler()` (warm), Phase 34.5 gap cycle 6 plan 44 |
| `setTimeout(() => initQueue(true), 5000)` (`:607`) | **PORTED** — `appShellFlowRegistration.ts` `frontendReady`, Phase 35 plan 11 |
| `process.on('uncaughtException')` (`:618`) | **PORTED** — `processGuards.ts` + `setUncaughtExceptionLogSink`, D-35-10-01 |
| `initLogger` / `applyMigrations` / `initOnlineMonitor` / i18next / `fetchLastestReleases` / `releasesInfoReady` anticheat listener | **PORTED** — `bootstrap.ts` `init()`, each with its own idempotency guard |

### D. Electron-only, no Tauri analogue — correctly absent

`session.defaultSession.webRequest.onBeforeSendHeaders` (`--spoof-windows`, `:425`),
`app.setAppUserModelId('GameLib')` (`:437`),
`app.commandLine.appendSwitch('disable-smooth-scrolling')` (`:465`),
`app.commandLine.appendSwitch('enable-spatial-navigation')` (`:250`),
`app.on('window-all-closed')` (`:711`).

All are Electron-process configuration with no sidecar equivalent. Noted only so a future reader
does not re-derive them as gaps.

**One residue:** the `disableSmoothScrolling` setting still renders a live toggle in
`src/frontend/screens/Accessibility/index.tsx:51,232`, but its only consumer was the deleted
Electron switch. The control is now inert. Filed as a minor todo.

### E. Not swept — out of scope, stated explicitly

`mainWindow.on('maximize'|'unmaximize'|'enter-full-screen'|'leave-full-screen'|'restore'|'close')`
and the `configStore.set('window-props', ...)` save on close (`:275-296`, `:347-352`) are window
concerns owned by the Tauri shell, not the sidecar bootstrap. Grep found no window-bounds
persistence in `src-tauri/src/main.rs`, so window size/position/maximized state is likely no
longer restored across launches — but proving that belongs to a shell-side sweep, not this one,
and it is recorded here so the next sweeper starts from a named suspicion rather than zero.

## Answer to the todo's question

> Does the sidecar's own bootstrap carry every non-handler side effect the old Electron main
> process once had?

**No.** Seven are unported and unledgered (A1–A7), three are silently degraded (B), one whole
class (E) was not in scope. A1 (permanently-wedged playtime lock) and A5 (Steam install badges
never reconcile) are the two with live user-visible consequences on the operator's own platform.

The parent todo's generalisation held: every one of A1–A7 is invisible to a channel-by-channel
IPC inventory because none of them has a channel name.
