---
phase: 31-tauri-ipc-re-plumb-slice-2-settings-and-config
reviewed: 2026-07-23T08:17:15Z
depth: standard
files_reviewed: 7
files_reviewed_list:
  - src-tauri/src/main.rs
  - src/backend/sidecar/__tests__/dialogStub.test.ts
  - src/backend/sidecar/__tests__/settingsFlows.test.ts
  - src/backend/sidecar/__tests__/storeLayer.test.ts
  - src/backend/sidecar/electronStub.ts
  - src/backend/sidecar/settingsFlowRegistration.ts
  - src/common/types/sidecarTransport.ts
findings:
  critical: 1
  warning: 3
  info: 2
  total: 6
status: issues_found
---

# Phase 31: Code Review Report

**Reviewed:** 2026-07-23T08:17:15Z
**Depth:** standard
**Files Reviewed:** 7
**Status:** issues_found

## Summary

Reviewed the settings/config WRITE path port (`settingsFlowRegistration.ts`), the async
dialog cluster added to `electronStub.ts` (`showMessageBox`/`showErrorBox`/`showSaveDialog`),
the Rust dialog dispatch arms in `main.rs` (`dialog_message`/`dialog_save`), the shared
transport contract, and the three test suites.

The write-path plumbing itself is sound: wire formats match the real frontend call sites
(`writeConfig({appName, config})`, `setSetting({appName, key, value})`, `isNative({appName, runner})`
are all single-object payloads — verified against `ThemeSelector`, `useSettingsContext`,
`GamesSettings`), the store allow-list correctly excludes secrets on both snapshot and
lazy-fetch paths, and `setSetting` is correctly registered via `ipcMain.on` (not `handle`).

However, the dialog cluster contains a **BLOCKER**: the `dialog_message` Rust arm drops the
Electron `buttons` array and renders an OK-only dialog, so `blocking_show()` always returns
`true`, which `electronStub` maps to `response: 0` — auto-confirming every backend confirm
dialog, including destructive ones (force-uninstall+reinstall, remove-from-library). The
"accepted gap" comment misjudges the blast radius by discussing only `checkboxChecked` while
`response` is the field ~10 backend callers actually branch on. Three WARNINGs and two INFO
items round out the report.

## Critical Issues

### CR-01: `showMessageBox` confirm dialogs auto-confirm — `buttons`/`response` contract dropped end-to-end

**File:** `src-tauri/src/main.rs:368-394`, `src/backend/sidecar/electronStub.ts:193-220`
**Issue:**
Backend confirm dialogs use `dialog.showMessageBox({ buttons: [confirmLabel, cancelLabel], ... })`
and branch on the returned `response` index (0 = first button). At least these call sites do so,
all reachable from the sidecar under Tauri:

- `storeManagers/steam/library.ts:1266` `promptI386Recovery` — `response !== 0` = decline;
  on `0` it **force-uninstalls the native copy and reinstalls via CrossOver** (destructive).
- `utils.ts:294` `askForceUninstall` — removes the game from the installed list.
- `utils.ts:256` `handleExit`, `utils.ts:768/903`, `updater.ts:35/61`, `protocol.ts:153` — all
  read `response` to gate an action.

The new transport does not preserve this contract:

1. `electronStub.showMessageBox` (electronStub.ts:200-207) forwards only `{ message, title, kind }`
   to `RUST_DIALOG_MESSAGE` — the `buttons` array is silently discarded.
2. The Rust `dialog_message` arm (main.rs:368-394) builds `app.dialog().message(message).kind(kind)`
   with **no `.buttons(...)`** call, so the plugin renders its default OK-only dialog.
   `blocking_show()` on an OK-only dialog returns `true` unconditionally (there is no Cancel
   button that can return `false`).
3. `electronStub` maps `true → response: 0` (electronStub.ts:211).

Net effect under the Tauri build: **every confirm dialog returns `response: 0`** — the first
button, which for `promptI386Recovery`/`askForceUninstall` is the destructive/affirmative action.
The user is never able to decline; destructive operations run without consent. For `handleExit`
(button[0] = "No") the direction inverts instead, permanently blocking quit-with-pending-ops.

The accepted-gap comment (electronStub.ts:208-210, sidecarTransport.ts:156-159) states "zero real
callers read `checkboxChecked`" — true but irrelevant. The field callers actually read is
`response`, and the mapping is wrong for any dialog with more than one button.

**Fix:** Forward and honor `buttons`. In `electronStub.showMessageBox`, include
`buttons: options?.buttons` (and `defaultId`/`cancelId`) in the forwarded payload. In the Rust
`dialog_message` arm, when a two-element `buttons` array is present, set
`.buttons(MessageDialogButtons::OkCancelCustom(ok_label, cancel_label))` and map
`blocking_show()`'s bool back to the correct index (`true → index of the affirmative/OK button`,
`false → index of the cancel button`) rather than a hardcoded `0`/`1`. If forwarding `buttons` is
out of scope, the dialog cluster must not be wired for `showMessageBox` at all this phase, because
an OK-only auto-confirm of destructive flows is worse than the prior unimplemented state.

```ts
// electronStub.ts — forward the button labels the caller supplied
const result = await requestRustInvoke(RUST_DIALOG_MESSAGE, [
  {
    message: options?.message,
    title: options?.title,
    kind: mapMessageBoxKind(options?.type),
    buttons: options?.buttons // NEW — Rust decides Ok vs OkCancel from this
  }
])
```

## Warnings

### WR-01: Per-game config write path has no path-traversal containment

**File:** `src/backend/sidecar/settingsFlowRegistration.ts:143-145` and `152-158`
**Issue:**
Both write handlers route an untrusted `appName` into `GameConfig.get(appName)` /
`writeConfig(appName, ...)`, which resolves to `join(gamesConfigPath, appName + '.json')`
(`game_config.ts:36,48`) with no containment check. An `appName` such as
`../../../../Library/Application Support/GameLib/config` escapes `GamesConfig/` and clobbers an
arbitrary `.json` under the user profile via `flush()`. The team clearly treats this class as
in-scope: `storeLayer.test.ts:374` explicitly asserts `invokeStoreFetch('../../etc/passwd')`
returns `{}` — but that guard lives only on the store-fetch path, not on the config-write path
this phase added. The exposure is parity-inherited from the Electron `setSetting`/`writeConfig`
handlers and `appName` normally originates from first-party renderer code (Steam AppIDs), so
real-world exploitability is low, but the inconsistency (one write surface guarded, the adjacent
one not) is a latent defense-in-depth gap.
**Fix:** Before the per-game branch in both handlers, reject any `appName` that is not a bare
identifier — e.g. `resolve(gamesConfigPath, appName + '.json')` must still be inside
`gamesConfigPath` (mirror the `resolve`+`relative` containment idiom already noted in project
memory for `library.set`), otherwise drop the frame.

### WR-02: `writeConfig` handler omits the malformed-frame type guard that `setSetting` has

**File:** `src/backend/sidecar/settingsFlowRegistration.ts:152-158`
**Issue:**
`setSetting` (lines 135-140) type-guards `appName`/`key` as strings and drops malformed frames
"rather than throwing," per the stated `storeWriteHandlers.ts` convention. The `writeConfig`
handler directly below performs no such guard — it blindly casts `writeConfig(appName as string, config ?? {})`.
A frame missing `appName` yields `writeConfig(undefined, {})`, which (since `undefined !== 'default'`)
falls into the per-game branch and writes a bogus `undefined.json`; a non-string `appName`
(object/number) produces `[object Object].json` / `123.json`. Inconsistent hardening across two
adjacent handlers with identical trust boundaries.
**Fix:** Add the same `typeof appName !== 'string'` (and object-typed `config`) guard used by
`setSetting`, returning/rejecting a malformed frame instead of writing it.

### WR-03: `dialog_save` drops the directory component of Electron's `defaultPath`

**File:** `src-tauri/src/main.rs:399-407`
**Issue:**
Electron's `showSaveDialog` `defaultPath` is a full path (directory + suggested filename) used to
seed both the starting directory and the filename. The Rust arm passes it only to
`set_file_name(file_name)`, so the directory component is discarded and the save dialog opens in
the plugin's default location rather than the caller's intended directory. Callers passing an
absolute `defaultPath` get the whole path stuffed into the filename field. Behavior degradation,
not a crash.
**Fix:** Split `defaultPath` into directory + filename; call `set_directory(dir)` for the parent
and `set_file_name(basename)` for the leaf when `defaultPath` is an absolute/rooted path.

## Info

### IN-01: `getSystemVersion` polyfill returns the kernel release, not the OS product version

**File:** `src/backend/sidecar/electronStub.ts:59-66`
**Issue:**
Electron's `process.getSystemVersion()` returns the OS *product* version (e.g. macOS `14.5`,
Windows `10.0.22631`). The polyfill substitutes `os.release()`, which returns the *kernel/build*
release (e.g. Darwin `23.5.0`). `getSystemInfo` will therefore report a materially different OS
version string on the Tauri build than on Electron — a data-fidelity divergence in the System
Info panel, not a crash. The comment already acknowledges it as "closest analog"; flagging so the
displayed-value drift is a conscious, documented divergence rather than an unnoticed one.
**Fix:** If accurate OS version matters, resolve it per-platform (`sw_vers -productVersion` on
macOS, `os.version()`/registry on Windows) or document the System Info version field as
best-effort under Tauri.

### IN-02: `isNative` handler does not validate `runner` before indexing `libraryManagerMap`

**File:** `src/backend/sidecar/settingsFlowRegistration.ts:192-200`
**Issue:**
`libraryManagerMap[runner as keyof typeof libraryManagerMap].getGame(...)` throws
`Cannot read properties of undefined (reading 'getGame')` when `runner` is absent or not a valid
manager key. It rejects cleanly (the RPC loop catches it), so this is not fatal, and it is parity
with the Electron handler at `main.ts:1567-1568` — but neither validates, so a malformed frame
surfaces as an opaque TypeError string rather than a meaningful rejection.
**Fix:** Guard `runner`/`appName` and reject with a descriptive message when `runner` is not a key
of `libraryManagerMap`.

---

_Reviewed: 2026-07-23T08:17:15Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
