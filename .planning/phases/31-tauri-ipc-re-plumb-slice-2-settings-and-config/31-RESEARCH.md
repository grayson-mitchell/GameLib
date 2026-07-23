# Phase 31: Tauri IPC re-plumb slice 2 — settings and config - Research

**Researched:** 2026-07-23
**Domain:** Electron→Tauri sidecar IPC porting (GameLib-internal codebase archaeology; no external library selection needed beyond confirming a dependency already present)
**Confidence:** HIGH — every claim below is grounded in a specific file:line read during this session (graphify-oriented, then confirmed by direct read/grep), or a docs.rs page fetched this session for the one external-API detail needed. No claim rests on training-knowledge recall alone except where explicitly marked `[ASSUMED]`.

## Summary

**All three grep-and-decide questions resolve cleanly, and two of them overturn a premise in 31-CONTEXT.md the way Phase 30's research overturned 30-CONTEXT's `DownloadDialog` premise.**

**Q1 (D-01 — which reads does the Steam Settings screen actually render):** Traced every `window.api.*` call site under `src/frontend/screens/Settings/` component-by-component. D-01's candidate list (`getUserInfo`, `getSystemInfo`, `getLogContent`, `getMaxCpus`, `hasExecutable`, `showUpdateSetting`) is **half wrong**: `getUserInfo` is **never called by the Settings screen at all** — its only call site is `Login/components/SIDLogin/index.tsx` (Epic SID login), an unrelated screen. Meanwhile `isNative` (`GamesSettings/index.tsx:124`) and `writeConfig` (reached via `ThemeSelector`, mounted inside `GeneralSettings`) are genuinely reached but **absent from D-01's list**. `readConfig` is confirmed NOT reached (its only frontend caller is a Legendary-library helper, `frontend/helpers/index.ts:67-68`, unrelated to Settings). The corrected channel table is in "Q1" below.

**Q2 (D-03 — which async `dialog` members do ported settings/config flows reach):** **None.** Grepped every real (non-test, non-stub) call site of `dialog.showMessageBox`/`showErrorBox`/`showSaveDialog`/`showMessageBoxSync`/`showOpenDialogSync` in the backend. All seven real call sites belong to flows entirely outside Phase 31's D-01 scope: app-quit confirm (`utils.ts:handleExit`), Snap/VCRuntime/Rosetta platform-sanity dialogs (`main.ts`, `utils.ts`), the Steam mac32 CrossOver-recovery prompt (`storeManagers/steam/library.ts:promptI386Recovery`), EOS overlay (`legendary/eos_overlay.ts`, explicitly out of scope per D-01), and a sideload browser-game quit confirm (`storeManagerCommon/games.ts:89`, the one `showMessageBoxSync` call site in the whole codebase). **`showSaveDialog` has ZERO real call sites anywhere in the repository** — only the electronStub's own stub definition references the name. No settings/config handler body (`setSetting`, `writeConfig`, `getUserInfo`\*, `getSystemInfo`, `getLogContent`, `getMaxCpus`, `hasExecutable`, `showUpdateSetting`, `isNative`) imports `dialog` or `showDialogBoxModalAuto` at all — confirmed by direct inspection of `config.ts`, `game_config.ts`, and every handler body in `main.ts`/`utils/ipc_handler.ts`/`logger/ipc_handler.ts`. **No escalation is needed** (no ported flow reaches a Sync member — the corruption risk D-03's planner note warned about does not materialize), but the corollary is that D-03's three async members are being built as **pure infrastructure** for SEAM.md §3's `dialog ×9` cluster, not because any Phase 31 user flow needs them — this must be named explicitly so the plan's validation claim isn't overstated (mirrors Phase 30's Notification-no-op honesty requirement).

**Q3 (whether `dialog_open` already generalized the Rust side):** **Yes, completely.** `tauri-plugin-dialog = "2"` is already a `Cargo.toml` dependency (locked at `2.7.2` in `Cargo.lock` — matches Phase 30's own verified version), already registered via `.plugin(tauri_plugin_dialog::init())` in `main.rs`, `dispatch_rust_channel()` already takes `&AppHandle` as its third parameter (added for `dialog_open`), and the `rustInvoke` dispatch site already runs every request on a spawned worker thread (not the reader thread) — exactly the threading requirement `blocking_show()`/`blocking_save_file()` need. Adding `showMessageBox`/`showSaveDialog` is a **pure data change**: two new match arms in `dispatch_rust_channel()`, two new `RUST_DIALOG_*` constants added to `RUST_INVOKE_CHANNELS`, two new `electronStub.ts` methods calling `requestRustInvoke()`. **No new Cargo dependency, no new plugin registration, no new capability permission, no new AppHandle threading.** This is NOT a divergence from the Phase 29/30 zero-Rust-change precedent in spirit — the Rust *infrastructure* is zero-new-work; only two match arms are new, which is the same class of change `dialog_open` itself was.

**Primary recommendation:** Register `setSetting` (a `send`/listener channel — verify it lands via `ipcMain.on`, NOT `.handle`, or it fails **completely silently**, per the documented `dispatchSend` empty-listener-array behavior) and `writeConfig`, `getMaxCpus`, `showUpdateSetting`, `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative` in `settingsFlowRegistration.ts`; drop `getUserInfo`/`readConfig` from the port list (not reached); add `showMessageBox`/`showErrorBox`/`showSaveDialog` to `electronStub.ts` + two `dispatch_rust_channel()` match arms as declared infrastructure (no settings/config flow will exercise them in any test that isn't a direct unit call); upgrade the D-04 `showLogFileInFolder`/`copySystemInfoToClipboard`/`showConfigFileInFolder` no-ops from silent to **logged** (currently 100% silent, confirmed by reading `electronStub.ts`'s `shell`/`clipboard` stubs).

## User Constraints (from CONTEXT.md)

### Locked Decisions
D-01 through D-05 in `.planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/31-CONTEXT.md` are LOCKED:
- **D-01** — Port the write path (`setSetting`/`writeConfig`) plus the generic reads. Runner-specific (Epic/GOG/Amazon tool-version) and EOS-overlay channels, and `egsSync`, stay rejecting non-fatally. This research corrects the *membership* of the generic-reads set (see Q1) but does not relitigate the boundary itself — no runner-specific or EOS channel is added.
- **D-02** — Persist through Phase 29's store layer; accept Tauri↔Electron divergence; no new push channel (confirmed below: `SettingsContext`/`useSettingsContext` already hold the changed value locally and never re-read after `setSetting`).
- **D-03** — Real behavior for `showMessageBox`/`showErrorBox`/`showSaveDialog`; `showMessageBoxSync`/`showOpenDialogSync` stay logged no-ops. This research found **zero** in-scope flows reach any of the five — see Q2 above. The decision stands (build the three real, per SEAM §3 priority-2 cluster completion); the *justification* changes from "flows depend on it" to "closes the declared dialog cluster."
- **D-04** — `shell`/`clipboard` conveniences (`showLogFileInFolder`, `copySystemInfoToClipboard`) stay **logged** no-ops, deferred to Phase 33. Currently these are **silent** no-ops (confirmed in `electronStub.ts`) — this is a real, concrete gap against D-04 that Phase 31 must close, mirroring Phase 30's Pitfall 3 (`notify()`) fix.
- **D-05** — Automated tests now; live UAT deferred.

### Claude's Discretion
- The exact set of async dialog members getting real behavior follows from what ported flows reach — **resolved below: none of the three are reached by any Phase 31 flow; build all three anyway per the locked D-03 text, but log this as infrastructure-only, not flow-driven.**
- Whether `writeConfig`/`setSetting` share one registration or are wired separately — no constraint found either way; both are cheap, single-purpose registrations and can go in either shape as long as both land in `settingsFlowRegistration.ts`.

### Deferred Ideas (OUT OF SCOPE)
Epic/GOG/Amazon runner tool-version channels, EOS-overlay group, `egsSync` (D-01); `showMessageBoxSync`/`showOpenDialogSync` (D-03); `shell.showItemInFolder`/rest of `shell`, `clipboard` (D-04, Phase 33); `changeTrayColor`/tray; live cross-build settings sync (D-02, Phase 35); full `electron-store` semantics (Phase 29 deferred).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REQ-31-01 | Steam-focused generic settings reads ported (`getUserInfo`/`getSystemInfo`/`getLogContent`/`getMaxCpus`/`hasExecutable`/`showUpdateSetting`, confirmed set) | Q1 below — corrected, evidenced channel table; `getUserInfo` dropped, `isNative` added |
| REQ-31-02 | Write path (`setSetting`/`writeConfig`) persists through the store layer | "Write-Path Mechanics" below — confirms `configStore`/`GamesConfig` targets, the `GamesConfig/` directory precondition, and the `send`-channel silent-failure landmine |
| REQ-31-03 | Real behavior for `showMessageBox`/`showErrorBox`/`showSaveDialog`; Sync pair stays no-op | Q2 + Q3 below — zero in-scope reachability (no escalation needed), Rust side already generalized (pure data change) |
| REQ-31-04 | `shell`/`clipboard` no-ops upgraded from silent to logged | "D-04 Gap" below — concrete, currently-silent stubs identified with exact line numbers |
| REQ-31-05 | Declared ported-channel list (`31-PORTED-CHANNELS.md`) + SEAM.md §1/§3 update | Q1/Q2/Q3 tables below produce this list verbatim |
| REQ-31-06 | No new store declarations needed / `SECRET_STORE_KEYS` deny-list untouched | "Write-Path Mechanics" below — `configStore.settings` already in `STORE_ALLOWLIST`; per-game write bypasses the store layer entirely (raw `fs.writeFileSync`), confirmed not a secrets path |
| REQ-31-07 | Automated tests prove wiring; live UAT deferred | "Validation Architecture" below |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Settings read/write orchestration (`setSetting`, `writeConfig`, generic reads) | Node sidecar (backend) | — | Plain Node classes (`GlobalConfig`/`GameConfig`) + `graceful-fs`; zero Rust involvement |
| Global settings persistence (`appName: 'default'`) | Node sidecar → `configStore` (electron-store-shaped, `fileStore.ts`) | — | Goes through the Phase 29 store layer; already allow-listed (`STORE_ALLOWLIST.configStore` includes `'settings'`) |
| Per-game settings persistence (`appName !== 'default'`) | Node sidecar → raw `graceful-fs` write | — | `GameConfigV0.flush()`/`writeToFile()` bypasses `electron-store`/`fileStore.ts` entirely — a direct `writeFileSync(gamesConfigPath/<appName>.json)`. Not part of the store-layer allow-list system at all (see "Write-Path Mechanics") |
| Native message/save dialogs (`showMessageBox`/`showErrorBox`/`showSaveDialog`) | Rust shell (`src-tauri`) | Node sidecar (dispatch via `rustInvoke`) | Native OS dialogs are a Rust/OS-API concern; `tauri-plugin-dialog` already wired for the open-directory case (Phase 30), same pattern extends |
| System info reads (`getSystemInfo`, `hasExecutable`, `getMaxCpus`) | Node sidecar (backend) | — | Pure Node (`os.cpus()`, `child_process.spawn`) — no Electron API involvement at all |
| Settings screen UI (mount-time reads, optimistic local write) | Frontend (React) | — | `useSettingsContext` already holds the just-written value locally; no reflect-push is architecturally required (confirms D-02) |

## Q1 — The confirmed generic-reads set (correcting D-01's candidate list)

### Method
Traced every `window.api.*` call site inside `src/frontend/screens/Settings/` (top-level `index.tsx`, `SettingsContext.tsx`, `useSettingsContext.ts`, and every `sections/*`/`components/*` file that mounts under the Settings route), then checked each channel's Electron-side handler implementation for any dependency this phase's D-01 boundary would need to reason about.

### Corrected table

| Channel | Kind | Frontend call site | In D-01's original list? | Verdict |
|---|---|---|---|---|
| `requestAppSettings` | invoke | `Settings/index.tsx:68`, `useSettingsContext.ts:57` | n/a | Already ported (Phase 30) |
| `requestGameSettings` | invoke | `useSettingsContext.ts:58` | n/a | Already ported (Phase 30) |
| `setSetting` | **send (listener)** | `useSettingsContext.ts:87` (every `useSetting`-backed toggle in `GeneralSettings`, `GamesSettings`, etc.) | Yes (D-02's write path) | **In scope — confirmed the write path for virtually every Settings toggle** |
| `writeConfig` | invoke | `frontend/components/UI/ThemeSelector/index.tsx:54`, mounted inside `GeneralSettings` | Yes (D-02's write path) | **In scope — confirmed reachable via ThemeSelector; NOT reachable via `DownloadDialog`/`SideloadDialog`/`ConsoleMode` install flows (those are out of Settings scope and mostly non-Steam anyway)** |
| `getMaxCpus` | invoke | `Settings/components/MaxWorkers.tsx:14` | Yes | **Confirmed in scope** |
| `showUpdateSetting` | invoke | `Settings/components/CheckUpdatesOnStartup.tsx:16` | Yes | **Confirmed in scope** |
| `getLogContent` | invoke | `Settings/sections/LogSettings/index.tsx:106` | Yes | **Confirmed in scope** |
| `systemInfo.get` → `getSystemInfo` | invoke | `Settings/sections/SystemInfo/index.tsx:93` | Yes (named `getSystemInfo`) | **Confirmed in scope** |
| `hasExecutable` | invoke | `Settings/components/Gamescope.tsx:42` | Yes | **Confirmed in scope, but gated `isLinux` in the render tree (`GamesSettings/index.tsx:170-175`) — reachable, low traffic** |
| `isNative` | invoke | `Settings/sections/GamesSettings/index.tsx:124` | **No — missing from D-01's list** | **NEW FINDING: must be added.** Handler = `libraryManagerMap[runner].getGame(appName).isNative()` (`main.ts:1567`) — runner-generic, and `libraryManagerMap` is already fully resident in the sidecar (Phase 30 Q2 finding, re-confirmed this session: `installFlowRegistration.ts`'s load-bearing `import '../storeManagers'`). Zero extra import cost. |
| `getUserInfo` | invoke | **NONE inside Settings.** Only real call site: `Login/components/SIDLogin/index.tsx:44` (Epic SID login) | Yes | **DROP from the port list — the Steam Settings screen never calls this channel.** Electron's own handler (`main.ts:880`) returns `LegendaryUser.getUserInfo()` — an Epic-specific read that happens to share a generic-sounding name; porting it would add zero value to the Settings screen and would misleadingly suggest Epic user info is a "settings/config" concern. |
| `readConfig` | invoke | **NONE inside Settings.** Only real call site: `frontend/helpers/index.ts:67-68` (`readFile('library')`/`readFile('user')`, a Legendary-library helper) | Flagged "confirm" in CONTEXT | **DROP — not reached by the Steam Settings screen.** Electron's handler (`main.ts:989`) is entirely Legendary-specific (`libraryManagerMap['legendary'].refresh()` / `LegendaryUser.getUserInfo()`). |
| `getGameOverride`/`getGameSdl` | invoke | `AdvancedSettings/index.tsx` — **NOT present**; these are `DownloadDialog`-only per Phase 30's own research, hardcoded to `libraryManagerMap['legendary']` | Not in D-01's list | Correctly excluded, no change |
| `getEosOverlayStatus`/`getLatestEosOverlayVersion`/`installEosOverlay`/`removeEosOverlay`/`enableEosOverlay`/`disableEosOverlay`/`updateEosOverlayInfo`/`isEosOverlayEnabled` | invoke/listener | `AdvancedSettings/index.tsx` (entire file is EOS-overlay UI) | Explicitly out of scope (D-01) | Confirmed correctly excluded — `AdvancedSettings` has no non-EOS reads besides `clipboardWriteText` (D-04 cluster) |
| `clipboardWriteText` | listener | `Settings/index.tsx:106` (context-menu "copy all settings"), `AdvancedSettings/index.tsx:340` | Not in D-01's list | Out of scope — `clipboard` cluster, SEAM §3 Priority 9, Phase 33. Currently a silent no-op in `electronStub.ts` (`clipboard.writeText: () => {}`) — **not this phase's D-04 (that names `showLogFileInFolder`/`copySystemInfoToClipboard` specifically)**, but the plan should note it stays silent rather than accidentally "fixing" it out of scope. |
| `showConfigFileInFolder` | listener | `Settings/index.tsx:114` (context-menu "open config file") | Not in D-01's list | Out of scope — implemented via `openUrlOrFile` (`main.ts:725-729`), the `shell` cluster (SEAM §3 Priority 4), Phase 33, NOT the `dialog` cluster. Currently silent in `electronStub.ts` (`shell.openPath`/`openExternal` stub paths) — same "stays silent, not this phase's job" note as `clipboardWriteText`. |
| `showLogFileInFolder` | listener | `LogSettings/index.tsx:127` | D-04 (named explicitly) | **In scope for D-04's logged-no-op upgrade** (currently silent — `shell.showItemInFolder: (): void => {}` in `electronStub.ts:204`) |
| `systemInfo.copyToClipboard` → `copySystemInfoToClipboard` | listener | `SystemInfo/index.tsx:130` | D-04 (named explicitly) | **In scope for D-04's logged-no-op upgrade** (currently silent — `clipboard.writeText: (): void => {}` in `electronStub.ts:269`) |

### Corrected minimum port list for REQ-31-01/REQ-31-02 (for the `31-PORTED-CHANNELS.md` deliverable)

**Invoke:** `getMaxCpus`, `showUpdateSetting`, `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative`, `writeConfig`
**Send (listener):** `setSetting`

**Explicitly dropped from D-01's original candidate list, with reason:** `getUserInfo` (not reached by Settings — Epic-only, wrong screen), `readConfig` (not reached by Settings — Legendary-only helper).

## Q2 — Dialog reachability from settings/config flows (D-03)

### Every real (non-stub, non-test, non-mock) call site of the five `dialog.*` members in the backend

| Call site | Member | Reachable from a Phase 31 in-scope flow? |
|---|---|---|
| `backend/updater.ts:35,61` | `showMessageBox` | No — auto-updater confirm, `app` lifecycle cluster (SEAM §3 Priority 1) |
| `backend/utils.ts:256` (`handleExit`) | `showMessageBox` | No — app-quit confirm |
| `backend/utils.ts:294` (`askForceUninstall`) | `showMessageBox` | No — uninstall flow (Phase 30/32 territory) |
| `backend/utils.ts:768,788` (VCRuntime check) | `showMessageBox` | No — Windows runtime prerequisite check, unrelated to settings |
| `backend/utils.ts:903` (`ContinueWithFoundWine`) | `showMessageBox` | No — Wine-resolution fallback during launch |
| `backend/utils.ts:1316` (Rosetta check) | `showMessageBox` | No — macOS Apple Silicon startup check |
| `backend/protocol.ts:153` | `showMessageBox` | No — custom-protocol-URL handler |
| `backend/storeManagers/steam/library.ts:1266` (`promptI386Recovery`) | `showMessageBox` | No — Steam mac32-bit CrossOver recovery prompt (Phase 18/23 territory) |
| `backend/storeManagers/legendary/eos_overlay/eos_overlay.ts:162,197` | `showMessageBox` | No — EOS overlay, explicitly out of scope (D-01) |
| `backend/main.ts:557` (Snap warning) | `showMessageBox` | No — app-startup platform-limitation warning |
| `backend/storeManagers/storeManagerCommon/games.ts:89` (browser-game `will-prevent-unload`) | `showMessageBoxSync` | No — sideload browser-game quit confirm. **This is the ONLY `showMessageBoxSync` call site in the entire repository.** |
| `backend/dialog/dialog.ts:39,45` (`showDialogBoxModalAuto`'s catch-fallback) | `showErrorBox`, `showMessageBox` | No — fires ONLY when `sendFrontendMessage` itself throws (an exceptional edge case), and `showDialogBoxModalAuto` is imported by many backend modules but not by any settings/config handler (`config.ts`, `game_config.ts`, `main.ts`'s `setSetting`/`writeConfig`/generic-read handler bodies were checked directly — none import `dialog` or `showDialogBoxModalAuto`) |
| **(none found)** | `showSaveDialog` | **No call site exists anywhere in the repository** — only `electronStub.ts`'s own stub definition references the name |

**Conclusion:** Zero of the settings/config flows Phase 31 ports (`setSetting`, `writeConfig`, `getMaxCpus`, `showUpdateSetting`, `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative`) reach any `dialog.*` member, sync or async. No escalation is warranted (the Sync-corruption risk D-03's planner note flagged does not occur, because nothing in scope calls `showMessageBoxSync`/`showOpenDialogSync` either). **Recommendation for the plan:** implement `showMessageBox`/`showErrorBox`/`showSaveDialog` as real (per the locked D-03 text — this closes SEAM §3's `dialog ×9` deferred-cluster row for real), but validate them with a **direct unit test against `electronStub.dialog.*`** (mirroring `dialogStub.test.ts`'s existing pattern for `showOpenDialog`), not via any settings/config E2E path — there isn't one to exercise them through. State this plainly in `VALIDATION.md` so a later reader doesn't conclude these were proven by a settings-screen flow.

## Q3 — Rust-side generalization status (dialog_open → showMessageBox/showSaveDialog)

**Fully generalized already — this is a pure data change, not new Rust wiring.**

Verified directly in `src-tauri/`:

1. **`Cargo.toml:17`** — `tauri-plugin-dialog = "2"` is already a dependency. `Cargo.lock` pins it at `2.7.2` (matches Phase 30's own research finding — the version has not drifted).
2. **`main.rs:585`** — `.plugin(tauri_plugin_dialog::init())` is already registered on the `tauri::Builder`.
3. **`main.rs:259`** — `fn dispatch_rust_channel(channel: &str, args: &[Value], app: &AppHandle) -> Result<Value, String>` already takes `&AppHandle` as its third parameter (added specifically for `dialog_open` in Plan 30-03) — no signature change needed for new dialog arms.
4. **`main.rs:341-361`** — the existing `"dialog_open"` match arm already calls `app.dialog().file().blocking_pick_folder()`/`blocking_pick_file()` and is already dispatched from a **spawned worker thread** (`main.rs:547`, `let result = dispatch_rust_channel(&channel, &args, &worker_app);` inside the `rustInvoke` branch of `start_reader()`), not the reader thread — the exact threading precondition `MessageDialogBuilder::blocking_show()` and `FileDialogBuilder::blocking_save_file()` require (both explicitly documented as "must not run on the main/event-loop thread").
5. **`capabilities/default.json`** — confirmed via the file's own docstring: Tauri v2 capabilities gate **webview→Rust IPC only**; they are **not consulted** for Rust-side plugin API calls made from `dispatch_rust_channel` (which calls `app.dialog()...` directly from Rust, never through the webview). No new capability permission is needed for message/save dialogs, exactly as none was needed for the existing folder picker.

**What the plan actually needs to add (all in the "data change" category):**
- `common/types/sidecarTransport.ts` — two new constants (e.g. `RUST_DIALOG_MESSAGE = 'dialog_message'`, `RUST_DIALOG_SAVE = 'dialog_save'`), added to `RUST_INVOKE_CHANNELS`.
- `main.rs`'s `dispatch_rust_channel()` — two new match arms.
- `electronStub.ts`'s `dialog` object — replace the `showMessageBox`/`showErrorBox`/`showSaveDialog` stub bodies with `requestRustInvoke(...)` calls, mirroring `showOpenDialog`'s existing try/catch-to-clean-cancel pattern exactly (never throw to the caller — a `rustInvoke` failure resolves as a safe default, matching `keyringTokenStore.ts`'s "total method" convention).

### Rust API shapes needed (CITED: docs.rs, fetched this session)

- `Dialog::message(msg) -> MessageDialogBuilder` — chain `.title(t)`, `.kind(MessageDialogKind::Error|Warning|Info)`, `.buttons(...)`, then `.blocking_show() -> bool` (true = affirmative/OK, false = cancel/negative). Electron's `showMessageBox` returns `{response: number, checkboxChecked: boolean}` — map `blocking_show()`'s `bool` to `response: 0` (true) / `response: 1` (false); `checkboxChecked` has no Tauri v2 equivalent exposed by this builder and should map to `false` always (document this as a known, accepted shape gap — no in-scope caller reads `checkboxChecked` regardless, per Q2's finding of zero real callers).
- `Dialog::file() -> FileDialogBuilder`, chain `.set_file_name(...)`, `.add_filter(...)`, then `.blocking_save_file() -> Option<FilePath>` (`None` = cancel, `Some(path)` = chosen save path) — same `Option`-shaped return as the already-wired `blocking_pick_folder()`/`blocking_pick_file()`, so `electronStub.ts`'s existing null-vs-string translation pattern extends verbatim.
- `showErrorBox(title, content)` in Electron returns `void` and has no cancel semantics — map to `.message(msg).kind(MessageDialogKind::Error).title(title).blocking_show()` and discard the return value.

`[CITED: docs.rs/tauri-plugin-dialog]` — method names/signatures confirmed against the crate's official docs.rs pages this session (`Dialog`, `FileDialogBuilder`, `MessageDialogBuilder` struct pages). Exact parameter order for `.buttons()`'s `MessageDialogButtons` enum was not independently re-verified against the pinned `2.7.2` source (the fetched pages reflect "latest," which may be a later patch — the struct/method names themselves are stable across the v2 line and match the `dialog_open` precedent's own already-working `FileDialogBuilder` usage, so this is LOW risk, not blocking).

## Write-Path Mechanics (REQ-31-02/REQ-31-06)

### `setSetting` is a `send` (listener) channel — a silent-failure landmine if mis-registered

`src/frontend/hooks/useSettingsContext.ts:87` calls `window.api.setSetting({appName, key, value})`, which resolves through `makeListenerCaller('setSetting')` (`src/preload/api/settings.ts:5`) — a fire-and-forget `send`, not an `invoke`. Confirmed in `src/backend/sidecar/sidecarRpc.ts:138-150`:

```typescript
function dispatchSend(request: SidecarRpcRequest): void {
  const listeners = listenerRegistry.get(request.channel) ?? []
  for (const listener of listeners) { /* ... */ }
}
```

An unregistered `send` channel resolves `listeners` to an empty array and does **nothing** — no error, no log line, no rejection (unlike an unregistered `invoke`, which gets the greppable `UNPORTED_CHANNEL_MARKER`). This exact landmine is documented in project memory (`sidecar-send-channels-fail-silently.md`, diagnosed 2026-07-23 against the unrelated `logoutSteam` channel) and confirmed independently this session by reading `sidecarRpc.ts` directly. **The plan MUST register `setSetting` via `ipcMain.on('setSetting', ...)` (electronStub's listener API), never `ipcMain.handle`, and the plan's test MUST assert the underlying `GlobalConfig.setSetting`/`GameConfig.setSetting` mock was actually invoked — asserting "no `UNPORTED_CHANNEL_MARKER` in the response" is meaningless here because there IS no response frame for a `send`.**

### Two structurally different persistence paths — global vs per-game

Electron's `setSetting` listener (`main.ts:1042-1048`) and `writeConfig` handler (`main.ts:1042` header, body at `utils.ts:1607`) both branch on `appName === 'default'`:

- **Global (`appName: 'default'`)** — `GlobalConfig.get().setSetting(key, value)` writes to `configStore.set('settings', {...})` (`config.ts:385-388`), going through the real Phase 29 store layer (`fileStore.ts`, atomic write, `STORE_ALLOWLIST`). `configStore`'s `'settings'` field is **already** in `STORE_ALLOWLIST` (`storePolicy.ts:293`) — confirmed no new allow-list entry is needed. `writeConfig`'s global branch additionally calls `GlobalConfig.get().flush()` and re-syncs `configStore.set('settings', {...currentConfigStore, ...config})` — both already-safe, already-resident operations (no new import cost; `backend/utils.ts` — where `writeConfig` and the already-imported `sendGameStatusUpdate` both live — is already force-imported into the sidecar via `installFlowRegistration.ts:110`, confirmed this session).
- **Per-game (`appName !== 'default'`)** — `GameConfig.get(appName).setSetting(key, value)` mutates an in-memory `this.config` object, then `flush()` → `writeToFile()` → a **raw `graceful-fs` `writeFileSync(this.path, ...)`** at `join(gamesConfigPath, appName + '.json')` (`game_config.ts:145-146`, `36`). This bypasses `electron-store`/`fileStore.ts`/`STORE_ALLOWLIST` entirely — it is not part of the store-layer abstraction at all, just a direct filesystem write using a pure-Node API already proven safe in the sidecar (`pathShim.ts` resolves `gamesConfigPath` correctly since Phase 27). **No new store declaration is needed for this path** because it was never a "store" in the `storePolicy.ts` sense — confirming REQ-31-06's "no new store declarations" premise, but for a different reason than a naive read of `storePolicy.ts` alone would suggest.

### A load-bearing ordering precondition for the per-game write path

`gamesConfigPath` (`appFolder/GamesConfig`) is **not** created anywhere at sidecar bootstrap. The only place it gets `mkdirSync(gamesConfigPath, {recursive: true})`'d is inside `GlobalConfigV0.getSettings()` (`config.ts:294-296`), as a side effect of the **first real call** to `GlobalConfig.get().getSettings()`. In the live UI flow this precondition is always satisfied — `useSettingsContext`'s mount-time `useEffect` always calls `requestAppSettings`/`requestGameSettings` (which resolves through `GlobalConfig.get().getSettings()`, already ported since Phase 30) **before** any `setSetting` can fire from user interaction. **A test that calls `writeConfig`/`setSetting` for a non-`'default'` `appName` in isolation, without first invoking `requestAppSettings`, will hit `ENOENT`** unless the test's own fixture pre-creates the directory or first drives a real `requestAppSettings` call. This is the Phase 31 analogue of Phase 30's `listSteamLibraryTargets` blocking-dependency finding — a genuinely load-bearing ordering fact absent from CONTEXT.md, worth naming explicitly in the plan's test-design task.

### `writeConfig`'s frontend call sites — none are Settings-screen-exclusive except `ThemeSelector`

Grepped every frontend caller of the module-scope-captured `writeConfig` (`frontend/helpers/index.ts:30`, `const writeConfig = window.api.writeConfig`): `ThirdPartyDialog`, `DownloadDialog`, `SideloadDialog`, `ConsoleMode/InstallOverlay` (all non-Steam install-flow modals, confirmed out of Phase 31's scope and — per Phase 30's own research — largely unreached by the Steam runner anyway), and `ThemeSelector` (`frontend/components/UI/ThemeSelector/index.tsx:54`, `writeConfig({appName: 'default', config: newAppConfig})`). `ThemeSelector` is mounted inside `Settings/sections/GeneralSettings/index.tsx:38` (and also `Accessibility` and the app shell header) — this is the **one** genuinely Settings-screen-reachable `writeConfig` call site, always with `appName: 'default'` (the global branch only).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sidecar→Rust request/response for message/save dialogs | A bespoke correlated-request mechanism | `requestRustInvoke()`/`dispatch_rust_channel()` (Phase 28/30) | Already generalized for exactly this purpose — see Q3; a new mechanism would duplicate proven, working infrastructure |
| Message/save dialog worker-thread dispatch | New thread-spawning logic in `main.rs` | The existing spawned-worker-thread dispatch site `dialog_open` already uses | `blocking_show()`/`blocking_save_file()` share the exact "must not run on the reader/main thread" constraint `dialog_open` already solved |
| Per-game settings write persistence | A new store-layer entry / `storePolicy.ts` declaration | The existing raw `graceful-fs writeFileSync` path `GameConfig.flush()` already uses | It was never part of the `electron-store` abstraction to begin with — adding a `storePolicy.ts` entry would be solving a problem that doesn't exist for this write |

**Key insight:** every "does this need new infrastructure" question this phase raises resolves the same way Phase 30's did: check what's already resident and already wired before assuming new plumbing is needed. The dialog Rust side is 100% pre-generalized; the settings write path's persistence targets are both already store-layer-safe (one via `STORE_ALLOWLIST`, one by never being in the store layer at all).

## Common Pitfalls

### Pitfall 1: Trusting D-01's candidate read list without tracing actual call sites
**What goes wrong:** Porting `getUserInfo` and `readConfig` as "generic settings reads" because they sound generic, while missing `isNative` because it wasn't on the list.
**Why it happens:** The roadmap-level description names channels by their generic-sounding function, not their actual frontend reachability.
**How to avoid:** Trust the traced call-site table in Q1 above, not the name alone.
**Warning signs:** A plan task that ports `getUserInfo` "for Settings" — grep its only real call site (`SIDLogin/index.tsx`) and it will be obviously wrong.

### Pitfall 2: Registering `setSetting` with `ipcMain.handle` instead of `ipcMain.on`
**What goes wrong:** The registration compiles, tests that check for `UNPORTED_CHANNEL_MARKER` absence pass (there's no marker either way for a `send`), but the real write never happens — worse than an unported channel, because there is zero signal of failure anywhere (console, test, or UI).
**Why it happens:** `setSetting`'s Electron-side registration (`addListener`) and its preload wrapper (`makeListenerCaller`) both look superficially like `writeConfig`'s (`addHandler`/`makeHandlerInvoker`), inviting a copy-paste of the wrong registration call.
**How to avoid:** Use `ipcMain.on`, and write a test that asserts the underlying `GlobalConfig.setSetting`/`GameConfig.setSetting` mock was called — not a response-frame assertion.
**Warning signs:** A `setSetting` test that only checks "no error thrown" — that passes even with zero registration.

### Pitfall 3: Building `showMessageBox`/`showSaveDialog` and believing an E2E can validate them
**What goes wrong:** Writing a Settings-screen E2E test expecting a dialog to appear when saving a setting — it never will, because no in-scope flow calls these members (Q2).
**Why it happens:** D-03's phrasing ("real Tauri behavior for the async dialog members... those flows depend on") reads as if some in-scope flow needs them; research found none does.
**How to avoid:** Validate with a direct `electronStub.dialog.*` unit test (mirror `dialogStub.test.ts`), and say so explicitly in `VALIDATION.md`.
**Warning signs:** A VALIDATION.md claim that the settings write path "proves" dialog wiring — it cannot, because it never touches `dialog`.

### Pitfall 4: A per-game `setSetting`/`writeConfig` test that skips the `GamesConfig/` directory precondition
**What goes wrong:** `ENOENT` on `writeFileSync` in a test that calls the per-game write path in isolation.
**Why it happens:** The directory-creation side effect lives inside `GlobalConfig.getSettings()`, not anywhere near `GameConfig`'s own code path — a genuinely non-obvious cross-module dependency.
**How to avoid:** Either call `requestAppSettings` first in the test (mirrors the real UI ordering) or have the test fixture `mkdirSync(gamesConfigPath, {recursive: true})` directly.
**Warning signs:** A per-game write test that passes in isolation but fails when run before any `requestAppSettings` call has warmed the directory — or vice versa, flakes depending on jest test order.

## Code Examples

### The existing real-dialog forwarding pattern to mirror for showMessageBox/showSaveDialog
```typescript
// Source: src/backend/sidecar/electronStub.ts:139-164 (this session, verified) —
// showOpenDialog's existing pattern; showMessageBox/showErrorBox/showSaveDialog
// should follow this exact try/catch-to-safe-default shape.
showOpenDialog: async (_window?: unknown, options?: unknown) => {
  try {
    const result = await requestRustInvoke(RUST_DIALOG_OPEN, [options])
    if (typeof result === 'string') return { canceled: false, filePaths: [result] }
    return { canceled: true, filePaths: [] }
  } catch (error) {
    console.warn(`[electronStub] dialog.showOpenDialog(): ${RUST_DIALOG_OPEN} failed:`, error)
    return { canceled: true, filePaths: [] }
  }
}
```

### The existing Rust dialog_open match arm to mirror
```rust
// Source: src-tauri/src/main.rs:341-361 (this session, verified)
"dialog_open" => {
    let picked = app.dialog().file().blocking_pick_folder(); // or blocking_pick_file()
    match picked {
        Some(path) => Ok(Value::String(path.to_string())),
        None => Ok(Value::Null),
    }
}
```

### The unit-test pattern to mirror for the new dialog members (no real Rust process)
```typescript
// Source: src/backend/sidecar/__tests__/dialogStub.test.ts:40-42, 66-80 (this session, verified)
jest.mock('../sidecarRpc', () => ({ requestRustInvoke: jest.fn() }))
// ...script a resolve/reject outcome per test, assert electronStub.dialog.showMessageBox()
// returns the correctly-mapped {response, checkboxChecked} shape.
```

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (`ts-jest`), existing project-wide config, unchanged |
| Config file | root `jest.config` |
| Quick run command | `npm test -- --testPathPattern=sidecar` |
| Full suite command | `npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| REQ-31-01 | Corrected generic-reads set resolves real values, not `UNPORTED_CHANNEL_MARKER` | unit | `npm test -- settingsFlows.test.ts` | ✅ (extend existing) |
| REQ-31-02 | `setSetting` invokes `GlobalConfig.setSetting`/`GameConfig.setSetting` (listener-dispatch assertion, not response-frame) | unit | `npm test -- settingsFlows.test.ts` | ✅ (extend existing) |
| REQ-31-02 | `writeConfig` persists through `configStore` for the global branch | unit | `npm test -- storeLayer.test.ts` | ✅ (extend existing) |
| REQ-31-03 | `showMessageBox`/`showErrorBox`/`showSaveDialog` forward to `requestRustInvoke` with the correct channel + correctly map the Rust response shape | unit | `npm test -- dialogStub.test.ts` | ✅ (extend existing) |
| REQ-31-03 | `showMessageBoxSync`/`showOpenDialogSync` remain synchronous no-ops returning the documented safe default | unit | `npm test -- dialogStub.test.ts` | ✅ (extend existing) |
| REQ-31-04 | `showLogFileInFolder`/`copySystemInfoToClipboard`/(and any other D-04 no-op) log instead of silently no-op | unit | `npm test -- dialogStub.test.ts` (or a new `electronStub` no-op logging test) | ✅ pattern exists (mirrors Phase 30's `notify()` logged-no-op test) |
| REQ-31-05 | Invariant B: channels this phase deliberately does not port (`getUserInfo`, `readConfig`, runner/EOS channels) still reject non-fatally | unit | `npm test -- settingsFlows.test.ts` | ✅ (extend existing "Invariant B guard" pattern) |
| REQ-31-06 | No new store declaration required — `configStore.settings` write round-trips through the real allow-list | unit | `npm test -- storeLayer.test.ts` | ✅ (extend existing) |

### Sampling Rate
- **Per task commit:** `npm test -- --testPathPattern=sidecar`
- **Per wave merge:** `npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
None — `settingsFlows.test.ts`, `storeLayer.test.ts`, and `dialogStub.test.ts` already exist with the exact real-shim, mocked-boundary pattern this phase's new assertions extend. No new test file or fixture is required; every new assertion is an addition to an existing `describe` block.

### The one genuinely new test-infrastructure need
A `setSetting` (send/listener) assertion pattern does not yet exist in `settingsFlows.test.ts` (that file currently only exercises `invoke`-kind channels via `writeInvoke`). The plan needs a `writeSend()` helper analogous to `installFlows.test.ts`'s pattern (per the `30-RESEARCH.md` precedent referencing a `writeSend` helper) to drive a `kind: 'send'` frame and assert the mocked `GlobalConfig.setSetting`/`GameConfig.setSetting` was called with the right arguments — this is new test *code*, not new test *infrastructure* (the RPC transport already supports `send` frames; only the specific channel's own test coverage is missing).

## Package Legitimacy Audit

**No new packages are required this phase.** `tauri-plugin-dialog = "2"` (locked `2.7.2`) is already a `Cargo.toml` dependency, installed and registered since Phase 30 (verified this session — see Q3). No new npm package, no new Cargo crate. This section is included per protocol but has nothing to audit.

| Package | Registry | Age | Downloads | Source Repo | slopcheck | Disposition |
|---------|----------|-----|-----------|-------------|-----------|-------------|
| tauri-plugin-dialog | crates.io | N/A (already installed, Phase 30) | N/A | github.com/tauri-apps/plugins-workspace | N/A — not a new install | Not applicable — already present, no new audit needed |

**Packages removed due to slopcheck [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** none

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The docs.rs pages fetched this session (`Dialog`, `FileDialogBuilder`, `MessageDialogBuilder`) reflect an API compatible with the pinned `2.7.2` version, not a materially different later version | Q3 "Rust API shapes needed" | Low — the pinned version is the SAME one Phase 30 already verified and is already working in production for `dialog_open`'s `blocking_pick_folder`/`blocking_pick_file`, which come from the identical `FileDialogBuilder`; only the message-dialog builder's exact API is new territory, and struct/method names are stable across the Tauri v2 plugin line. If wrong, the fix is a small method-name adjustment, not a redesign. |
| A2 | `getSystemInfo`'s internal implementation (`backend/utils/systeminfo/index.ts`) has no Electron-API dependency that would need stubbing beyond what's already in `electronStub.ts` | REQ-31-01 | Not independently deep-read this session (only its export signature and `hasExecutable`'s implementation were directly verified as pure-Node). If it turns out to call an unstubbed Electron API, the plan's port would surface that as either a thrown error (visible immediately in the unit test) or an already-covered stub — low risk either way since the whole backend module graph already survives import through `electronStub.ts`. |

**If this table is empty:** N/A — see above; both entries are low-risk, non-blocking.

## Open Questions

None outstanding — all three grep-and-decide questions and every "confirm during research" note in 31-CONTEXT.md were resolved with direct evidence this session.

## Sources

### Primary (HIGH confidence — direct file reads this session)
- `src-tauri/src/main.rs` (`dispatch_rust_channel`, plugin registration, worker-thread dispatch site)
- `src-tauri/Cargo.toml` / `Cargo.lock` (dependency + pinned version confirmation)
- `src-tauri/capabilities/default.json` (capability-gating scope docstring)
- `src/common/types/sidecarTransport.ts` (`RUST_INVOKE_CHANNELS`, `RUST_DIALOG_OPEN`)
- `src/backend/sidecar/electronStub.ts`, `settingsFlowRegistration.ts`, `dialogFlowRegistration.ts`, `installFlowRegistration.ts`, `handlers.ts`, `sidecarRpc.ts`
- `src/backend/main.ts`, `src/backend/utils.ts`, `src/backend/config.ts`, `src/backend/game_config.ts`, `src/backend/dialog/dialog.ts`
- `src/backend/utils/ipc_handler.ts`, `src/backend/logger/ipc_handler.ts`, `src/backend/utils/os/path/index.ts`
- `src/frontend/screens/Settings/**` (every component under the Settings route), `src/frontend/hooks/useSettingsContext.ts`, `src/frontend/hooks/useSetting.ts`
- `src/preload/api/settings.ts`, `src/preload/ipc.ts`
- `src/backend/sidecar/__tests__/settingsFlows.test.ts`, `dialogStub.test.ts` (existing test patterns to mirror)
- `.planning/phases/30-.../30-CONTEXT.md`, `30-RESEARCH.md`, `30-PORTED-CHANNELS.md`, `.planning/phases/27-.../SEAM.md` (governing precedent documents)

### Secondary (MEDIUM confidence)
- `docs.rs/tauri-plugin-dialog` `Dialog`/`FileDialogBuilder`/`MessageDialogBuilder` pages, fetched via WebFetch this session — `[CITED: docs.rs/tauri-plugin-dialog]`

### Tertiary (LOW confidence)
None used.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all infrastructure already installed and verified in-repo
- Architecture: HIGH — every claim traced to a specific file:line this session
- Pitfalls: HIGH — each pitfall grounded in a specific, directly-read code path (silent-send landmine independently confirmed against `sidecarRpc.ts`, not just cited from memory)

**Research date:** 2026-07-23
**Valid until:** 30 days (internal codebase archaeology, stable unless the sidecar transport or dialog plugin version changes)
