---
phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config
reviewed: 2026-07-23T09:33:51Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/backend/sidecar/electronStub.ts
  - src/backend/sidecar/settingsFlowRegistration.ts
  - src/backend/sidecar/__tests__/dialogStub.test.ts
  - src/backend/sidecar/__tests__/settingsFlows.test.ts
findings:
  critical: 0
  warning: 2
  info: 1
  total: 3
status: issues_found
---

# Phase 31: Code Review Report (Gap-Closure Re-Review)

**Reviewed:** 2026-07-23T09:33:51Z
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This is a re-review of commits `ccb15138` (CR-01: de-wire `dialog.showMessageBox`) and `6214cbea` (WR-01: path-containment guard on `setSetting`/`writeConfig`'s per-game write branch). Both fixes were traced against their actual call sites (not just their own file) and both hold up as **correct and effective** for the scenarios they were designed to close:

- **CR-01 verified correct:** `dialog.showMessageBox` now unconditionally resolves `{ response: -1, checkboxChecked: false }`, never forwards to `RUST_DIALOG_MESSAGE`, and never throws/rejects (no `await`, no promise chain that can reject — the body is a synchronous `console.warn` + object literal wrapped in an `async` function). Traced both documented live callers: `promptI386Recovery` (`storeManagers/steam/library.ts:1266,1281`, decline = `response !== 0`) and `askForceUninstall` (`utils.ts:294,304`, decline = `response !== 1`) — `-1` correctly declines both. `mapMessageBoxKind` was correctly removed as dead code alongside the RUST_DIALOG_MESSAGE forwarding it only served.
- **WR-01 verified correct:** `isContainedGameConfig()` uses genuine `resolve()`+`relative()` containment (not a `join()`/`startsWith()` string check), which correctly rejects traversal (`../../etc/passwd`), absolute paths, and the prefix-collision case (`gamesConfigPath-evil`) that a naive string-prefix check would wrongly allow — verified by hand-tracing `path.relative()`'s behavior for all three cases. The guard's target computation (`resolve(gamesConfigPath, appName + '.json')`) matches `game_config.ts:36,48`'s actual write-path construction (`join(gamesConfigPath, appName + '.json')`) exactly, so the containment check and the real write path can't diverge. Both `setSetting` (a `send` channel) and `writeConfig` (an `invoke` channel) are dispatched through `sidecarRpc.ts`'s `dispatchSend`/`dispatchInvoke`, both of which wrap the listener/handler call in `try/catch` — so even a pathological `appName` that makes `resolve()` throw synchronously (e.g. an embedded NUL byte, which Node's `path` module rejects) fails closed (dropped/rejected) rather than crashing the sidecar or reaching the filesystem.

Two gaps found while tracing the *actual* reachable surface of these fixes (not just the lines that changed) — neither undermines the fixes' core correctness, but both are real, demonstrable defects in completeness/consistency left unaddressed by this gap-closure round.

## Warnings

### WR-A: `writeConfig`'s WR-01 guard is bypassed entirely by a non-string `appName`, unlike `setSetting`'s

**File:** `src/backend/sidecar/settingsFlowRegistration.ts:179-198`

**Issue:** The `writeConfig` handler's containment guard is conditioned on `typeof appName === 'string'`:

```ts
if (
  typeof appName === 'string' &&
  appName !== 'default' &&
  !isContainedGameConfig(appName)
) {
  process.stderr.write(...)
  return
}
return writeConfig(appName as string, config ?? {})
```

If `appName` is missing (payload `{ config: {...} }` with no `appName` key) or is any non-string JSON value, the `typeof appName === 'string'` check short-circuits `false` and the entire guard — including the `appName !== 'default'` dispatch — is skipped. Execution falls straight through to `writeConfig(appName as string, config ?? {})` with a **type-unsafe cast**, and the real `writeConfig()` (`backend/utils.ts:1607`) then does:

```ts
GameConfig.get(appName).config = config as GameSettings   // appName = undefined
GameConfig.get(appName).flush()                            // writes gamesConfigPath/undefined.json
```

(`game_config.ts:48`: `join(gamesConfigPath, appName + '.json')` → `undefined + '.json'` → the literal filename `undefined.json`.) This does not escape `gamesConfigPath` (JSON values coerce to comma/bracket strings, not path separators, so it isn't a new traversal vector), but it is a real, demonstrable inconsistency: a malformed `writeConfig` request silently **succeeds** (`ok: true`) and writes a real file to a fixed, predictable filename inside the config directory, where `setSetting`'s sibling handler (12 lines above, same file) explicitly type-guards and **drops** the exact same malformed-payload shape:

```ts
if (typeof appName !== 'string' || typeof key !== 'string') {
  process.stderr.write('...rejected a non-string appName or key\n')
  return
}
```

There is no test covering a missing/non-string `appName` on the `writeConfig` path (only the string-traversal case `'../../etc/passwd'` is tested at `settingsFlows.test.ts:475-487`).

**Fix:** Guard `writeConfig` the same unconditional way `setSetting` does — reject non-string `appName` before the `'default'` dispatch, not only before the containment check:

```ts
ipcMain.handle('writeConfig', async (_event: unknown, payload: unknown) => {
  const { appName, config } = (payload ?? {}) as {
    appName?: unknown
    config?: Partial<AppSettings>
  }
  if (typeof appName !== 'string') {
    process.stderr.write(
      '[settingsFlowRegistration] writeConfig rejected a non-string appName\n'
    )
    return
  }
  if (appName !== 'default' && !isContainedGameConfig(appName)) {
    process.stderr.write(
      '[settingsFlowRegistration] writeConfig dropped a path-escaping appName\n'
    )
    return
  }
  return writeConfig(appName, config ?? {})
})
```

### WR-B: CR-01's "two live callers" rationale misses a third reachable `dialog.showMessageBox` call site

**File:** `src/backend/sidecar/electronStub.ts:167-183` (rationale comment); actual call site at `src/backend/dialog/dialog.ts:45`

**Issue:** The CR-01 doc comment states the fix is safe because there are exactly "two live callers" (`promptI386Recovery`, `askForceUninstall`), both of which `await` the call unguarded. That claim is incomplete. `showDialogBoxModalAuto` (`backend/dialog/dialog.ts:8-54`) is imported into the sidecar's module graph via `installFlowRegistration.ts:86` (`import { showDialogBoxModalAuto } from 'backend/dialog/dialog'`), and its `catch` fallback branch also calls `dialog.showMessageBox`:

```ts
} catch (error) {
  ...
  const window = getMainWindow()
  switch (props.type) {
    case 'ERROR':
      dialog.showErrorBox(props.title, props.message)
      break
    default:
      if (!window) break
      dialog.showMessageBox(window, { title: props.title, message: props.message, buttons: ... })
      break
  }
}
```

Traced reachability end-to-end under the sidecar:
- `getMainWindow()` (`backend/main_window.ts:8-11`) falls back to `BrowserWindow.getAllWindows().at(0)`, which under `electronStub.ts:343-345` always returns the truthy `fakeWindow` — so the `if (!window) break` guard never blocks this branch under the sidecar.
- The `try` block calls `sendFrontendMessage(...)` (`backend/ipc.ts:68-83`), which does **not** wrap `mainWindow.webContents.send(...)` in its own `try/catch`. Under the sidecar, `webContents.send` is `fakeWebContents.send` (`electronStub.ts:333-335`), which calls `transport?.pushFrontendMessage(...)` → `sidecarRpc.ts`'s `pushFrontendMessage` → `writeLine()` → `JSON.stringify(notification)`. A non-JSON-serializable arg (e.g. a circular reference or a `BigInt` reaching `props.buttons`) throws synchronously here, which propagates up through `sendFrontendMessage` into `showDialogBoxModalAuto`'s `catch`, which then calls `dialog.showMessageBox(window, {...})` — **without ever awaiting or reading its return value.**

This third call site is not "awaited unguarded" as the rationale describes — it isn't awaited at all. That means the "await + no try/catch" framing used to justify the never-reject requirement doesn't cover this site's actual risk shape: if `showMessageBox` ever rejected (it doesn't, post-fix), the resulting unhandled promise rejection would still risk crashing the sidecar (no `process.on('unhandledRejection')` guard exists, per the same comment block's own admission). The fix's actual "never reject" property does still make this call site safe in practice, and since its return value is discarded, the CR-01 destructive-auto-confirm risk doesn't apply here either — but the documentation undercounts the reachable surface, which risks a Phase 33 "real multi-button behavior" implementation reasoning from an incomplete caller inventory (e.g. re-introducing a rejecting/throwing path without covering this third, un-awaited site).

**Fix:** Update the rationale comment at `electronStub.ts:167-183` to include `showDialogBoxModalAuto`'s fallback branch (`dialog/dialog.ts:45`) as a third reachable-but-inert call site (inert because its return value is discarded), and add a regression test exercising `showDialogBoxModalAuto`'s catch-fallback path to lock in that it also never crashes the sidecar.

## Info

### IN-01: WR-01 test coverage exercises only the traversal case, not absolute-path or prefix-collision

**File:** `src/backend/sidecar/__tests__/settingsFlows.test.ts:461-487`

**Issue:** Both new WR-01 tests use `appName: '../../etc/passwd'`. The `isContainedGameConfig` implementation is also relied on to reject an absolute `appName` (e.g. `/etc/passwd`) and the prefix-collision case the `resolve()`+`relative()` idiom was specifically chosen to defeat (e.g. `appName: '../GamesConfig-evil/x'`, where a naive `path.join(...).startsWith(gamesConfigPath)` check would wrongly allow it since the string `gamesConfigPath` is a literal prefix of `gamesConfigPath-evil`). These were verified correct by manual trace in this review, but there is no test locking that guarantee in for future refactors.

**Fix:** Add two more cases to the WR-01 `describe` block: one with an absolute `appName`, one with a sibling-directory-prefix `appName` (e.g. `${basename(gamesConfigPath)}-evil/x`), each asserting `mockedGameConfigGet` is never called.

---

_Reviewed: 2026-07-23T09:33:51Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
