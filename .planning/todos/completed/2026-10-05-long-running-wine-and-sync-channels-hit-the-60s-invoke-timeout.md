---
created: 2026-10-05T00:00:00.000Z
title: "runWineCommand, callTool, installWineVersion, downloadRuntime, syncSaves, syncGOGSaves and addToSteam are missing from LONG_RUNNING_CHANNELS — they reject at 60s while still running"
area: tauri-shell
severity: major
platform: any
ready: code
found_by: "Code review of phase 34.5 (non-Steam runners, Wine and shortcuts), 2026-10-05"
files:
  - src-tauri/src/main.rs:1155-1202
  - src/frontend/screens/Library/components/InstallModal/SideloadDialog/index.tsx:250-264
  - src/frontend/components/UI/Winetricks/index.tsx:172-178
  - src/frontend/screens/Game/GamePage/components/CloudSavesSync.tsx:95-131
  - src/frontend/screens/Settings/components/EacRuntime.tsx:45-49
  - src/frontend/screens/Game/GameSubMenu/index.tsx:326-338
---

## Problem

None of these channels is in the Rust `LONG_RUNNING_CHANNELS` list (`main.rs:1155+`), so each is
bounded by the 60s invoke timeout although the work routinely takes longer.

Same root, separate symptom: `handleAddToSteam` (`GameSubMenu/index.tsx:326-338`) has no try/finally,
so any rejection (timeout, `GAMELIB_SHELL_EXE` unset, corrupt `shortcuts.vdf`) leaves `steamRefresh`
true and the button replaced by a spinner until remount.

## Failure scenario

- Sideload "Run Installer First" (`wait: true`): an installer running past 60s rejects,
  `runningSetup` goes false and the button re-enables mid-install — a second installer can start
  into the same prefix.
- The winetricks GUI (`callTool`) clears `guiOpen` at 60s while the GUI is still open.
- `CloudSavesSync.tsx` and `EacRuntime.tsx` lack try/finally, so `isSyncing` / `installing` stay
  true forever.
- `WineItem.install()` produces an unhandled rejection on every Proton/Wine download over 60s.

## Suggested fix

Add the channels to the Rust list and to `longRunningChannels.test.ts`; add try/finally (and an
error surface) at the listed frontend call sites.

## Provenance

Found by reading the code; no test was run (the review container had no `node_modules`). The orchestrating session re-checked the cited lines itself and the mechanism holds. Line numbers are as of `5927806` on `main`.

## Resolution (2026-10-05)

**Verification of the claim, per channel.** All seven are `makeHandlerInvoker` channels
(`src/preload/api/{helpers,wine,misc,menu}.ts`) -> `tauriInvoke('sidecar_invoke')` -> Rust
`SidecarState::invoke` -> `timeout_for(channel)`, so all seven were on the 60s bound. Whether each
can legitimately exceed 60s:

| channel | handler awaits | verdict |
| --- | --- | --- |
| `runWineCommand` | the Wine process when `wait: true` (sideload "Run Installer First") | added |
| `callTool` | `Winetricks.run` -> `runWithArgs([... '--gui'])`, resolves on the GUI process's `exit` | added |
| `installWineVersion` | `installWineVersionForRelease` (Wine/Proton download + extract) | added |
| `downloadRuntime` | Lutris lookup + `downloadFile` + `extractTarFile` | added |
| `syncSaves` / `syncGOGSaves` | legendary `sync-saves` / gogdl `save-sync` over the network | added |
| `addToSteam` | `getWikiGameInfo` (measured ~1s, see the list's own doc comment) + icon + up to 4 small artwork downloads | **left bounded** |

`addToSteam` does not routinely exceed 60s; only a stalled CDN gets it there, and a 60s rejection
is the better failure than a never-settling spinner. Its real defect (no try/finally) is fixed at
the call site instead. A test pins the exclusion so the decision is legible if it is revisited.

**What changed.**
- `src-tauri/src/main.rs`: six channels appended to `LONG_RUNNING_CHANNELS`, with a rationale
  comment (list region only).
- `src/backend/__tests__/longRunningChannels.test.ts`: expected set extended; per-channel
  membership tests; `addToSteam` non-membership test.
- `EacRuntime.tsx`: `downloadRuntime` in try/catch/finally; `installing` always cleared; an
  `ERROR` dialog via the component's existing `showDialogModal`.
- `CloudSavesSync.tsx`: `executeSync` body in try/catch/finally; `isSyncing` always cleared and
  the menu closed; `ERROR` dialog via the existing `showDialogModal`.
- `GameSubMenu/index.tsx` `handleAddToSteam`: try/catch/finally; `steamRefresh` always cleared;
  `ERROR` dialog via the existing `showDialogModal`.
- `SideloadDialog/index.tsx` `handleRunExe`: `setRunningSetup(false)` moved to `finally` (this also
  fixes the `!gameSettings` early return, which left the button disabled); rejection logged via
  `window.api.logError` (no error surface exists in that dialog; the old code only `console.log`ged).
- `Winetricks/index.tsx` `launchWinetricks`: `.catch` before the existing `.finally` -- the error
  is appended to the dialog's own log pane and logged, instead of an unhandled rejection.
- `WineItem/index.tsx` `install()`: `.catch` -> `logError`. Progress/outcome already arrive by push
  (`progressOfWineManager` + backend `notify()`), so no local state was stuck there.
- 3 new en catalogue keys in `public/locales/en/gamelib.json` (`pnpm i18n`).

**RED evidence (run before the product edits).**
- `longRunningChannels.test.ts`: 7 failed / 43 passed (the exact-set test + the six membership tests).
- `eacRuntimeInstallFailure.test.tsx` (new, hook-harness behavioural): rejection case failed --
  spinner `<span>... Installing EAC Runtime...</span>` still rendered after the rejection.
- `cloudSavesSyncFailure.test.tsx` (new, hook-harness behavioural): rejection case failed --
  the sync menu item's `disabled` was still `true` (`isSyncing` stuck).
- `GameSubMenu/__tests__/longRunningCallSiteGuard.test.ts` (new, source-shape gate for the
  four components too large for the hook harness): 4 failed / 1 passed (self-test).

**GREEN evidence.** All four suites pass (50 + 2 + 2 + 5). Neighbouring suites
(GameSubMenu, Settings components, GamePage components, Winetricks, SideloadDialog: 29 suites,
410 tests; `abandonedInvokeAttribution`, `dialogOptionForwarding`, `tauriShellSource`) pass.
`pnpm codecheck` exit 0; `npx eslint` on touched files: 0 errors, no new warnings on touched
lines; `npx prettier --check` on every touched non-ignored path: clean; `pnpm i18n
--fail-on-update` exit 0; `cargo fmt --check` exit 0; `cargo test --bin gamelib-shell
long_running` -> `every_long_running_channel_is_exempt_and_a_non_member_is_bounded ... ok`;
`cargo clippy`: no warnings in the edited region.

**Not verified.** No live app run on any OS: nobody drove a >60s installer, winetricks GUI,
Proton download, EAC runtime install or save sync through the real shell. The GameSubMenu,
SideloadDialog, Winetricks and WineItem fixes are pinned by a source-shape gate, not a runtime
test. The exempted channels now inherit the list's documented trade-off: a genuinely wedged
child process surfaces as a never-settling promise rather than a 60s rejection.
