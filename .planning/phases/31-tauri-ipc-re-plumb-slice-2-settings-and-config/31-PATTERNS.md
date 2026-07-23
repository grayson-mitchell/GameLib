# Phase 31: Tauri IPC re-plumb slice 2 — settings and config - Pattern Map

**Mapped:** 2026-07-23
**Files analyzed:** 3 sidecar modules touched (no net-new files except possibly `31-PORTED-CHANNELS.md`, a doc artifact) + 3 extended test files
**Analogs found:** 6 / 6 work items — this is a mechanical extend-in-place slice; every analog lives in the SAME file being edited (the Phase 30 precedent) or its immediate sibling.

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `src/backend/sidecar/settingsFlowRegistration.ts` (write path + generic reads added) | route/handler registration | request-response (invoke) + event-driven (send) | Same file's existing `requestAppSettings`/`requestGameSettings` registrations (Phase 30) | exact — same module, same registration idiom |
| `src/backend/sidecar/electronStub.ts` (`dialog.showMessageBox`/`showErrorBox`/`showSaveDialog` real; D-04 no-ops logged) | middleware/stub (Electron-API shim) | request-response (rustInvoke forward) | Same file's existing `dialog.showOpenDialog` (Phase 30 D-09) | exact — same file, same forward-to-transport shape |
| `src-tauri/src/main.rs` (`dispatch_rust_channel()` two new match arms) | controller (Rust command dispatch) | request-response | Same file's existing `"dialog_open"` match arm | exact — same function, same match-arm shape |
| `src/common/types/sidecarTransport.ts` (two new `RUST_DIALOG_*` constants in `RUST_INVOKE_CHANNELS`) | config/constants | n/a | Same file's existing `RUST_DIALOG_OPEN` constant + `RUST_INVOKE_CHANNELS` array | exact |
| `src/backend/sidecar/__tests__/settingsFlows.test.ts` (extended: write-path + `writeSend` helper) | test | event-driven (send) + request-response (invoke) | `skeletonFlows.test.ts`'s `writeSend()` helper + `storeSet` `send`-frame test shape | role-match — the `send`-kind test pattern lives in a sibling test file, not this one yet |
| `src/backend/sidecar/__tests__/dialogStub.test.ts` (extended: 3 new real-dialog cases) | test | request-response | Same file's existing `showOpenDialog` mocked-`requestRustInvoke` test cases | exact — same file, same programmed-outcome harness |
| `31-PORTED-CHANNELS.md` (new doc artifact) | doc | n/a | `30-PORTED-CHANNELS.md` | exact — explicit mirror per CONTEXT.md |

**No new store declaration is needed** (`storePolicy.ts`/`storeRegistration.ts` step 4 is a no-op this phase — see Write-Path Mechanics below); listed for completeness per the assignment brief.

---

## Pattern Assignments

### 1. Settings write path — `setSetting` (send/listener) + `writeConfig` (invoke)

**Target file:** `src/backend/sidecar/settingsFlowRegistration.ts`

**Analog A (read-side registration shape to mirror for `writeConfig`, an invoke):** the same file, `registerSettingsFlows()`, lines 66-81:

```typescript
export function registerSettingsFlows(): void {
  ipcMain.handle('requestAppSettings', async () =>
    GlobalConfig.get().getSettings()
  )

  ipcMain.handle(
    'requestGameSettings',
    async (_event: unknown, ...args: unknown[]) => {
      const appName = args[0] as string
      if (steamLibrary.has(appName)) {
        return libraryManagerMap['steam'].getGame(appName).getSettings()
      }
      return GameConfig.get(appName).getSettings()
    }
  )
}
```

**Electron parity source for `writeConfig`** — `src/backend/main.ts:1042-1044`:
```typescript
addHandler('writeConfig', (event, { appName, config }) =>
  writeConfig(appName, config)
)
```
(`writeConfig` the function lives in `backend/utils.ts:1607`, already force-imported into the sidecar's graph via `installFlowRegistration.ts:110` per RESEARCH.md — no new import cost.)

**Electron parity source for `setSetting`** — `src/backend/main.ts:1046-1052` (THIS IS A LISTENER, not a handler — critical):
```typescript
addListener('setSetting', (event, { appName, key, value }) => {
  if (appName === 'default') {
    GlobalConfig.get().setSetting(key, value)
  } else {
    GameConfig.get(appName).setSetting(key, value)
  }
})
```

**Analog B — the `ipcMain.on(...)` registration shape to copy exactly** (this codebase's one existing `send`-kind registration cluster), `src/backend/sidecar/storeWriteHandlers.ts:222-233`:
```typescript
ipcMain.on(
  STORE_SET_CHANNEL,
  (_event: unknown, storeName: unknown, key: unknown, value: unknown) => {
    if (typeof storeName !== 'string' || typeof key !== 'string') {
      process.stderr.write(
        '[storeWriteHandlers] storeSet rejected a non-string store name or key\n'
      )
      return
    }
    applyStoreWrite('set', storeName, key, value)
  }
)
```
`setSetting`'s registration must use `ipcMain.on('setSetting', ...)`, mirroring this exact shape — never `ipcMain.handle`, per RESEARCH.md's Pitfall 2 (an unregistered/mis-registered `send` channel fails 100% silently, no `UNPORTED_CHANNEL_MARKER`, no rejection).

**Data-flow role:** event-driven (send, fire-and-forget) for `setSetting`; request-response (invoke) for `writeConfig`. Both persist through Phase 29's store layer (global branch) or a raw `graceful-fs` write (per-game branch) — see Write-Path Mechanics below.

---

### 2. Generic reads — `getMaxCpus`, `showUpdateSetting`, `getLogContent`, `getSystemInfo`, `hasExecutable`, `isNative`

**Target file:** `src/backend/sidecar/settingsFlowRegistration.ts` (added alongside the write path, same module, same `ipcMain.handle` idiom as Analog A above).

**Electron parity sources (exact bodies to port, each a one-line `addHandler` in `main.ts` or a co-located `ipc_handler.ts`):**

- `getMaxCpus` — `src/backend/main.ts:744`:
  ```typescript
  addHandler('getMaxCpus', () => cpus().length)
  ```
- `showUpdateSetting` — `src/backend/main.ts:755`:
  ```typescript
  addHandler('showUpdateSetting', () => !isFlatpak)
  ```
- `getLogContent` — `src/backend/logger/ipc_handler.ts:17-20`:
  ```typescript
  addHandler('getLogContent', (event, appNameOrRunner) => {
    const logPath = getLogFilePath(appNameOrRunner)
    return existsSync(logPath) ? readFileSync(logPath, 'utf-8') : ''
  })
  ```
- `getSystemInfo` — `src/backend/utils/ipc_handler.ts:22`:
  ```typescript
  addHandler('getSystemInfo', async (e, cache) => getSystemInfo(cache))
  ```
  (`getSystemInfo` imported from `./systeminfo`, pure Node per RESEARCH.md Assumption A2 — no unstubbed Electron API expected.)
- `hasExecutable` — `src/backend/utils/ipc_handler.ts:28-30`:
  ```typescript
  addHandler('hasExecutable', async (event, executable) => {
    return hasExecutable(executable)
  })
  ```
  (`hasExecutable` imported from `./os/path`.)
- `isNative` — `src/backend/main.ts:1567-1569` (NEW FINDING per RESEARCH.md Q1, not in CONTEXT.md's original list, but confirmed reached by `GamesSettings/index.tsx:124`):
  ```typescript
  addHandler('isNative', (e, { appName, runner }) => {
    return libraryManagerMap[runner].getGame(appName).isNative()
  })
  ```
  `libraryManagerMap` is already imported in `settingsFlowRegistration.ts` (line 54) — zero extra import cost, runner-generic.

**DO NOT port** `getUserInfo` (`main.ts:880`) or `readConfig` (`main.ts:989`) — RESEARCH.md Q1 confirmed neither is reached by the Settings screen (Epic-only / Legendary-only respectively). They must keep rejecting non-fatally via `UNPORTED_CHANNEL_MARKER` (Invariant B).

**Data-flow role:** request-response (invoke), all six. Pure reads — no store-layer write concerns.

---

### 3. Real async dialog members — `showMessageBox`, `showErrorBox`, `showSaveDialog`

**Target file:** `src/backend/sidecar/electronStub.ts`

**Analog — the exact forward-to-transport shape to copy** (`showOpenDialog`, same file, lines 139-161):
```typescript
showOpenDialog: async (
  _window?: unknown,
  options?: unknown
): Promise<{ canceled: boolean; filePaths: string[] }> => {
  try {
    const result = await requestRustInvoke(RUST_DIALOG_OPEN, [options])
    if (typeof result === 'string') {
      return { canceled: false, filePaths: [result] }
    }
    // `null` (or anything else non-string) is the healthy cancel case.
    return { canceled: true, filePaths: [] }
  } catch (error) {
    // Never throw to the caller (mirrors keyringTokenStore.ts's total-method convention) --
    // a rejection (timeout, unknown channel, permission denial) resolves as a clean cancel.
    console.warn(
      `[electronStub] dialog.showOpenDialog(): ${RUST_DIALOG_OPEN} failed:`,
      error instanceof Error ? error.message : String(error)
    )
    return { canceled: true, filePaths: [] }
  }
}
```
The three new members (`showMessageBox`, `showErrorBox`, `showSaveDialog`) replace their current no-op stub bodies (lines 136-137, 163) with this exact try/catch-to-safe-default shape, each calling `requestRustInvoke(RUST_DIALOG_MESSAGE, [...])` / `requestRustInvoke(RUST_DIALOG_SAVE, [...])` and mapping the Rust response per RESEARCH.md's "Rust API shapes needed" section (bool→`{response, checkboxChecked: false}` for message; `Option<FilePath>`→`{canceled, filePath}` for save, same null-vs-string translation `showOpenDialog` already uses).

**Rust side — the exact match-arm shape to copy**, `src-tauri/src/main.rs:341-361` (`dispatch_rust_channel()`):
```rust
"dialog_open" => {
    let wants_file = args
        .first()
        .and_then(|v| v.get("properties"))
        .and_then(|v| v.as_array())
        .map(|props| {
            let has_dir = props.iter().any(|p| p.as_str() == Some("openDirectory"));
            let has_file = props.iter().any(|p| p.as_str() == Some("openFile"));
            has_file && !has_dir
        })
        .unwrap_or(false);
    let picked = if wants_file {
        app.dialog().file().blocking_pick_file()
    } else {
        app.dialog().file().blocking_pick_folder()
    };
    match picked {
        Some(path) => Ok(Value::String(path.to_string())),
        None => Ok(Value::Null),
    }
}
_ => Err(format!("rustInvoke:unknown-channel:{channel}")),
```
Two new arms (`"dialog_message"`, `"dialog_save"`) are added BEFORE the `_ =>` catch-all, calling `app.dialog().message(...).blocking_show()` and `app.dialog().file().blocking_save_file()` respectively — pure data change per RESEARCH.md Q3 (plugin already registered, `AppHandle` param already present, worker-thread dispatch already correct — no new Cargo dep, no new capability).

**Constants** — `src/common/types/sidecarTransport.ts:151,158-164` (`RUST_DIALOG_OPEN` + `RUST_INVOKE_CHANNELS`):
```typescript
export const RUST_DIALOG_OPEN = 'dialog_open' as const

export const RUST_INVOKE_CHANNELS = [
  RUST_KEYRING_GET,
  RUST_KEYRING_SET,
  RUST_KEYRING_DELETE,
  RUST_KEYRING_AVAILABLE,
  RUST_DIALOG_OPEN
] as const
```
Add `RUST_DIALOG_MESSAGE = 'dialog_message'` and `RUST_DIALOG_SAVE = 'dialog_save'` following the exact same `as const` + array-membership pattern — this is `requestRustInvoke()`'s allowlist (T-28-03); a channel absent here is refused before a frame is even emitted.

**Data-flow role:** request-response (sidecar→Rust rustInvoke). Per RESEARCH.md Q2, this is **declared infrastructure**, not flow-driven — no in-scope settings/config handler body reaches `dialog.*`. State this explicitly in the plan's validation claims (mirrors Phase 30's Notification-no-op honesty requirement) — validate via `dialogStub.test.ts`'s existing mocked-`requestRustInvoke` unit pattern, never a settings-screen E2E.

---

### 4. D-04 native no-ops — `showLogFileInFolder`, `copySystemInfoToClipboard` (silent → logged)

**Target file:** `src/backend/sidecar/electronStub.ts`

**Current silent stubs** (must become logged):
```typescript
// shell (line 204)
showItemInFolder: (): void => {},
// clipboard (line 269)
writeText: (): void => {},
```

**Analog — the logged-no-op precedent already proven in this codebase**, `src/backend/dialog/dialog.ts`'s `notify()` else-branch (verified indirectly via `dialogStub.test.ts:147-161`'s by-construction source gate, which asserts the shape rather than reprinting it):
```typescript
// dialogStub.test.ts's own assertion of the required shape (REQ-30-07/D-09 precedent):
const notifyMatch = stripped.match(/function notify\([^)]*\)\s*{[\s\S]*?\n}/)
expect(notifyMatch).not.toBeNull()
const notifyBody = notifyMatch ? notifyMatch[0] : ''
expect(notifyBody).toMatch(/}\s*else\s*{/)
expect(notifyBody).toMatch(/logInfo\(/)
```
The pattern to replicate: an `else` branch (or equivalent no-op path) that calls a log function rather than doing nothing. Since `electronStub.ts` must NOT import `backend/logger` (see the file's own header comment, lines 35-41 — `console.warn` is used instead, exactly as `showOpenDialog`'s catch block does at line 155), the D-04 fix shape is:
```typescript
showItemInFolder: (): void => {
  console.warn('[electronStub] shell.showItemInFolder(): no-op in the sidecar (D-04, deferred to Phase 33)')
},
```
and identically for `clipboard.writeText`. This is a **logged** no-op, not real behavior — Phase 33 owns the real `shell`/`clipboard` clusters.

**Data-flow role:** event-driven (listener, fire-and-forget) — `showLogFileInFolder`/`copySystemInfoToClipboard` are both `addListener` on the Electron side (`logger/ipc_handler.ts:22-24`, `utils/ipc_handler.ts:23-27`), so on the sidecar side these remain UNREGISTERED channels (rejecting via `UNPORTED_CHANNEL_MARKER`, Invariant B) — the `electronStub.ts` no-op fix is about the underlying `shell`/`clipboard` STUB members these unregistered handlers would call if some other already-ported code path reached them, not a new IPC registration. (Confirm during planning whether any Phase 31-ported handler body actually calls `shell.showItemInFolder`/`clipboard.writeText` directly — if not, this is purely a stub-hygiene fix, independent of channel registration.)

---

### 5. Store declaration (checklist step 4) — NOT NEEDED this phase

**Target file:** N/A — no new entry required in `src/common/types/storePolicy.ts` or `src/backend/sidecar/storeRegistration.ts`.

**Why (per RESEARCH.md "Write-Path Mechanics"):** the write path has two structurally different persistence targets:
- **Global** (`appName: 'default'`) → `configStore.set('settings', {...})`, already in `STORE_ALLOWLIST` — `src/common/types/storePolicy.ts:84-100` (excerpt):
  ```typescript
  export const STORE_ALLOWLIST: Record<string, readonly string[] | '*'> = {
    configStore: [
      // ...
      'settings',
      // ...
    ],
  ```
- **Per-game** (`appName !== 'default'`) → a raw `graceful-fs writeFileSync` in `GameConfig.flush()`/`writeToFile()` (`game_config.ts:145-146`) — this NEVER went through `electron-store`/`storePolicy.ts` at all, so there is nothing to declare.

**Analog for reference only (not to be extended):** `src/backend/sidecar/storeRegistration.ts` — the module where a genuinely NEW store would be declared, if one were ever needed. `ensureStoresRegistered()` is called once from `handlers.ts:71`, after `registerSettingsFlows()` — this is why the write handlers (`storeWriteHandlers.ts`) must register AFTER store instances exist (see `handlers.ts:71-77`'s ordering comment), a load-bearing ordering fact worth naming even though this phase adds no new store.

**Data-flow role:** N/A (no store declaration produced this phase).

---

### 6. Tests

**Target files:** `src/backend/sidecar/__tests__/settingsFlows.test.ts` (extend), `storeLayer.test.ts` (extend), `electronUntouched.test.ts` (do-not-break guard), `dialogStub.test.ts` (extend).

**A. The `writeSend()` helper — does NOT yet exist in `settingsFlows.test.ts`, must be copied from its sibling `skeletonFlows.test.ts:174-181`:**
```typescript
/** Writes a well-formed `send` (fire-and-forget) request frame to the sidecar's stdin. */
function writeSend(
  input: PassThrough,
  id: string,
  channel: string,
  args: unknown[]
): void {
  input.write(`${JSON.stringify({ id, kind: 'send', channel, args })}\n`)
}
```
(`settingsFlows.test.ts` currently only has `writeInvoke()`, lines 177-184 — this is the "one genuinely new test-infrastructure need" RESEARCH.md flags: new test *code*, not new transport plumbing — the RPC transport already supports `send` frames.)

**B. The `send`-frame assertion shape to mirror** — `skeletonFlows.test.ts:488-513` (a `storeSet` write test, structurally identical to what `setSetting` needs — write, flush, then assert no error signal / assert the mock was called, since a `send` has no response frame to inspect):
```typescript
writeSend(input, 'set-settings-1', 'storeSet', [
  'configStore',
  'settings.wineVersion.bin',
  '/tmp/evil.sh'
])
await flush()

const changed = frames.filter(
  (frame) =>
    frame.kind === 'frontendMessage' && frame.channel === 'storeChanged'
)
expect(changed.length).toBe(0)
```
For `setSetting`, the equivalent-shaped test (per RESEARCH.md Pitfall 2's explicit instruction) must assert the underlying `GlobalConfig.setSetting`/`GameConfig.setSetting` **mock was called with the right key/value** — not merely "no error" — because a `send` produces no response frame at all to assert against.

**C. The existing `settingsFlows.test.ts` mock/harness preamble to extend (not replace)** — same file, lines 46-134: the `jest.mock('os', ...)`/`jest.mock('electron', ...)`/`jest.mock('backend/config', ...)`/`jest.mock('backend/game_config', ...)` preamble already exists and already exposes `mockedGlobalConfigGet`/`mockedGameConfigGet` — the write-path tests reuse these same mocks, asserting `.setSetting` was called on them (currently the mocks only stub `.getSettings`).

**D. `storeLayer.test.ts` round-trip shape** — `describe('round-trip', ...)` block at line 148 is the existing test-group shape to extend for asserting `writeConfig`'s global branch persists through the real `configStore`/`STORE_ALLOWLIST` path end-to-end.

**E. `dialogStub.test.ts` — the programmed-outcome mock harness to extend for the 3 new real dialog members**, same file, lines 56-90 (mocked `requestRustInvoke`, `program`/`callLog` fixtures) and the existing per-member assertion shape at lines 92-127 (`showOpenDialog`'s resolve/cancel/reject cases) — write three analogous `describe` blocks for `showMessageBox`/`showErrorBox`/`showSaveDialog`, reusing `program`/`callLog`/`warnSpy` verbatim. The now-stale assertion at lines 129-141 (`'the other five dialog.* stub members are unchanged'`, asserting `showMessageBox`/`showSaveDialog` are still stubs) MUST be updated/removed since this phase makes those three real — flag this explicitly to the planner as a test this phase will BREAK if not touched.

**F. `electronUntouched.test.ts`** — read-only do-not-break guard (STRICTLY READ-ONLY per its own header, lines 4-11). No new assertions needed from this phase; just confirm `npm test` still passes it (additive/reversible invariant, both Electron and Tauri builds must keep working).

**Data-flow role:** test files — request-response (invoke assertions) + event-driven (send assertions, the new `writeSend` pattern).

---

## Shared Patterns

### `ipcMain` from `electronStub.ts`, never `backend/ipc`
**Source:** `src/backend/sidecar/handlers.ts:27-31` (module docstring) — every file under `src/backend/sidecar/` uses `electronStub`'s own `ipcMain` (the `{handle, on, once}` recorder at `electronStub.ts:79-101`), never the real-Electron-typed `backend/ipc.ts` (`addHandler`/`addListener`), because none of these channels are entries in the existing `AsyncIPCFunctions` contract and no sidecar file may import the real `electron` module.
**Apply to:** all of items 1 and 2 above (`settingsFlowRegistration.ts`).

### Never throw to the caller — total-method convention
**Source:** `src/backend/sidecar/electronStub.ts:150-160` (`showOpenDialog`'s catch block) — "mirrors `keyringTokenStore.ts`'s total-method convention": a `requestRustInvoke` rejection (timeout, unknown channel, permission denial) resolves as a safe default (clean cancel / `response: 1`), never a thrown rejection to the handler caller.
**Apply to:** item 3 (`showMessageBox`/`showErrorBox`/`showSaveDialog`).

### `console.warn`, never `backend/logger`, inside `electronStub.ts`
**Source:** `src/backend/sidecar/electronStub.ts:35-41` (module-scope comment) — `backend/logger`'s own import chain calls `app.getPath('appData')` at module scope, which requires the `Module._load` hook to already be installed; that hook installs itself by requiring `electronStub.ts` FIRST, so importing `backend/logger` from within this file would reintroduce the exact bootstrap "second wall" problem. `console.warn` is the only logging primitive available inside this specific file.
**Apply to:** item 4 (D-04 logged no-ops) and item 3's error path.

### Invariant B — unported channels stay non-fatal
**Source:** `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md` (Load-Bearing Invariant B), proven in test form at `settingsFlows.test.ts:262-283` ("Invariant B guard" — `checkDiskSpace` still rejects with `UNPORTED_CHANNEL_MARKER`, and the RPC loop keeps serving afterward via a follow-up `health` check).
**Apply to:** every deliberately-NOT-ported channel this phase touches by omission — `getUserInfo`, `readConfig`, the runner-tool-version channels, the EOS-overlay group, `egsSync`, `showMessageBoxSync`/`showOpenDialogSync`.

### Guarded-set store write choke point (relevant if any future write touches `storePolicy.ts`, NOT needed this phase)
**Source:** `src/backend/sidecar/storeWriteHandlers.ts:100-205` (`applyStoreWrite()`'s four ordered guards: universe-membership, secret-key deny (`TOKEN_STORE_KEY`), safe-key-path, writable-field allow-list). Included for completeness — the settings write path bypasses this entirely (it calls `GlobalConfig.setSetting`/`GameConfig.setSetting` directly, not `applyStoreWrite`), but the planner should know this is the existing precedent if a future gap surfaces a need to route settings writes through the generic store-write choke point instead.
**Apply to:** none of this phase's files directly — reference only.

---

## No Analog Found

None. Every work item in this slice has a direct analog inside the SAME file it extends (Phase 30's precedent) or an immediate sibling file (`storeWriteHandlers.ts` for the `send`-listener shape, `skeletonFlows.test.ts` for the `writeSend()` test helper). This is the expected shape for a "mechanical re-plumb, extend don't create" phase per CONTEXT.md's framing.

## Metadata

**Analog search scope:** `src/backend/sidecar/*.ts` and `src/backend/sidecar/__tests__/*.test.ts` (curated sidecar module set), `src/backend/main.ts` + `src/backend/{utils,logger,config,game_config}*` (Electron parity sources), `src-tauri/src/main.rs`, `src/common/types/{sidecarTransport,storePolicy}.ts`.
**Files scanned:** ~16 (via graphify-oriented BFS traversal + direct reads: `settingsFlowRegistration.ts`, `electronStub.ts`, `handlers.ts`, `storeWriteHandlers.ts`, `storeRegistration.ts` (referenced), `main.ts` (5 line ranges), `logger/ipc_handler.ts`, `utils/ipc_handler.ts`, `main.rs` (dispatch_rust_channel), `sidecarTransport.ts`, `storePolicy.ts` (referenced), `settingsFlows.test.ts`, `dialogStub.test.ts`, `skeletonFlows.test.ts` (2 ranges), `electronUntouched.test.ts`, `storeLayer.test.ts` (describe-block scan)).
**Pattern extraction date:** 2026-07-23

---

## PATTERN MAPPING COMPLETE

**Phase:** 31 - tauri-ipc-re-plumb-slice-2-settings-and-config
**Files classified:** 7 (3 sidecar/Rust modules extended, 1 constants file extended, 3 test files extended; zero net-new source files)
**Analogs found:** 6 / 6 work items

### Coverage
- Files with exact analog (same file, same idiom, Phase 30 precedent): 5
- Files with role-match analog (sibling file, same idiom): 1 (`writeSend()` helper, sourced from `skeletonFlows.test.ts` into `settingsFlows.test.ts`)
- Files with no analog: 0

### Key Patterns Identified
- Every read/write handler registers via `electronStub.ts`'s own `ipcMain` (`.handle` for invoke, `.on` for send) — never `backend/ipc`'s typed `addHandler`/`addListener`, and no sidecar file imports the real `electron` module.
- `setSetting` is a fire-and-forget `send` channel — MUST use `ipcMain.on`, mirroring `storeWriteHandlers.ts`'s `STORE_SET_CHANNEL` registration shape exactly; a `.handle` registration would compile but fail 100% silently at runtime (no marker, no rejection).
- The three new real dialog members forward to Rust via the existing generic `requestRustInvoke()`/`dispatch_rust_channel()` channel, copying `showOpenDialog`'s exact try/catch-to-safe-default shape — the Rust side needs only two new match arms (pure data change, zero new Cargo/plugin/capability wiring, per RESEARCH.md Q3).
- D-04's silent-no-op stubs (`shell.showItemInFolder`, `clipboard.writeText`) must become logged no-ops via `console.warn` (electronStub.ts cannot import `backend/logger` — module-scope import-order constraint documented in the file's own header).
- No new store declaration is needed: the global settings branch already sits in `STORE_ALLOWLIST`, and the per-game branch was never part of the `electron-store` abstraction at all (raw `graceful-fs` write).
- `dialogStub.test.ts`'s existing "the other five dialog.* stub members are unchanged" assertion (lines 129-141) will need updating/removal since 3 of those 5 become real this phase — flagged as a test this phase will break if untouched.

### File Created
`/Users/graysonmitchell/Projects/GameLib/.planning/phases/31-tauri-ipc-re-plumb-slice-2-settings-and-config/31-PATTERNS.md`

### Ready for Planning
Pattern mapping complete. Planner can now reference analog patterns in PLAN.md files.
