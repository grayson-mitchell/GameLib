---
created: 2026-08-24T00:00:00.000Z
title: "`openDialog` is missing from the shell's `LONG_RUNNING_CHANNELS`, so any file picker the user spends >60s in has its result DROPPED — killing moveInstall, importGame and every install-path flow silently"
area: tauri-shell
status: OPEN
severity: major
files:
  - src-tauri/src/main.rs
  - src/backend/sidecar/sidecarRpc.ts
  - src/backend/sidecar/electronStub.ts
  - src/frontend/components/UI/PathSelectionBox/index.tsx
---

## Observed

Found by the operator on 2026-08-24 driving **step 5 of `34.6-LIVE-GATE.md`** (`moveInstall`), on
commit `c13b9e398`, app PID 21682.

The operator opened Endless Sky (GOG, `1829678475`) → submenu → **Move Game**, the native folder
picker appeared, they created and confirmed a destination folder. **Nothing moved.**

- source `~/GameLib/Endless Sky.app` still present, still 419 MB
- destination `~/GameLib/GameLibMoveTestFixture/` created at 20:29, **0 B**, empty
- `gog_store/installed.json` unchanged (mtime 11:51:18, still the old `install_path`)
- `gamelib.log` **completely silent from 20:26:57 onward** — no `moving` status, no "Moving Game"
  notification, no containment rejection, no error
- app alive on the same PID throughout

The stderr/scrollback sink carried exactly one line at **20:30:13**, and it is the whole story:

```
[shell] response for unknown/timed-out id=10023 (dropped)
```

## Root cause

`main.rs:160` bounds every sidecar invoke at `INVOKE_TIMEOUT = 60s` unless the channel appears in
`LONG_RUNNING_CHANNELS` (`main.rs:184`). That list has 12 entries. **`openDialog` is not one of
them.**

`openDialog` is a *human-in-the-loop* channel. Its sidecar handler calls
`dialog.showOpenDialog` → `electronStub.showOpenDialog` → `requestRustInvoke(dialog_open)` → the
Rust arm's `app.dialog().file().blocking_pick_folder()`, which blocks until the human picks. Sixty
seconds in a file picker is ordinary, not pathological.

So the sequence is:

1. renderer `window.api.openDialog(...)` → shell `sidecar_invoke`, pending id `10023`
2. sidecar opens the picker via `dialog_open`; the human deliberates
3. at 60s the shell gives up, removes id `10023`, returns `Err("sidecar invoke timed out")`
4. the renderer's `await window.api.openDialog(...)` **rejects**. `onMoveInstallYesClick`
   (`GameSubMenu/index.tsx:100`) has no `try`/`catch`, so this is an unhandled rejection in the
   renderer — visible in the renderer console only, never in `gamelib.log`
5. `if (path) { await window.api.moveInstall(...) }` is never reached — **`moveInstall` is never
   called at all**
6. the human finally picks; the sidecar resolves and writes the response; the shell's reader
   thread finds no pending id and prints the `(dropped)` line above

`moveInstall` itself is **not implicated** — it was never invoked.

### The exemption exists, but one layer too deep

`sidecarRpc.ts:74` already has `const UNBOUNDED_RUST_CHANNELS = [RUST_DIALOG_OPEN]`, with the
comment *"CR-04: human-in-the-loop channels get no bound at all"*. That correctly exempts the
**inner** sidecar→shell `dialog_open` hop. The **outer** renderer→shell `openDialog` hop, which
wraps it, was never given the matching exemption. Two nested timeouts, one exempted.

This is the third recurrence of a failure mode `LONG_RUNNING_CHANNELS`'s own doc comment describes
twice, in the exact words that fit here: for `install` ("the real (late) response was then dropped
by the reader thread as an unknown id") and for `oauthCaptureLogin` ("drives a HUMAN interaction …
with the bound in place the shell returns Err at 60s AND the real late response is dropped … so the
outcome can never arrive"). Both were added only after a live gate failed on them. The file picker
was never gate-driven until today.

## Blast radius — every file-picker flow in the app

Anything routing through `openDialog`, which includes all of `PathSelectionBox`
(`PathSelectionBox/index.tsx:65`):

- `moveInstall` (Move Game)
- `changeGameInstallPath` (Change Install Path)
- `importGame` — via `ImportDialog`'s `PathSelectionBox` (`ImportDialog/index.tsx:97`)
- install-path selection in the install modal
- every other `PathSelectionBox` consumer

All fail the same way: silent, no log line, no UI error. Two of these (`moveInstall`, `importGame`)
are scored channels in live-gate step 5.

## Aggravating factor — the picker also discards its own options, making >60s LIKELY

`main.rs`'s `dialog_open` arm reads **only** `properties` (to choose file vs folder). The caller's
`title`, `buttonLabel` and `defaultPath` are received and ignored:

```rust
let picked = if wants_file {
    app.dialog().file().blocking_pick_file()
} else {
    app.dialog().file().blocking_pick_folder()   // no .set_title(), no .set_directory()
};
```

`onMoveInstallYesClick` deliberately fetches `defaultInstallPath` and passes it as `defaultPath`;
it is thrown away. So the picker opens wherever macOS last left it rather than at the install root,
the window has no title telling the user what they are choosing, and the confirm button reads
generically instead of "Choose". **The user must navigate manually — which is exactly what pushes
the interaction past the 60s bound.** The two defects compound.

## Third, weaker observation — the picker renders LIGHT under a dark system

Operator: *"its styling was jarring — it was a light theme when GameLib AND my macOS are dark
themes."*

Measured: macOS `AppleInterfaceStyle = Dark`; no `NSRequiresAquaSystemAppearance` in
`tauri.conf.json` or the release bundle's `Info.plist`; no `NSAppearance` handling anywhere in
`src-tauri/src/*.rs`. The running process is `target/debug/gamelib-shell` — an **unbundled binary
with no `Info.plist` at all**, which is the most likely reason AppKit falls back to default Aqua
for the panel while the webview content stays dark under its own CSS.

**Explicitly unverified:** whether this reproduces in the packaged `.app`. The falsification is to
launch `src-tauri/target/release/bundle/macos/GameLib.app` and open the same picker — deliberately
NOT done during the gate run, because a second instance splits the `[shell]` sink
([[concurrent-instance-splits-shell-sink]]). Do that before treating this third item as real.

## Suggested fix

1. Add `"openDialog"` to `LONG_RUNNING_CHANNELS` in `main.rs`, with an inline rationale matching
   the list's stated convention (membership is granted on a reason recorded next to the entry).
   Check `showSaveDialog`/`dialog_save` and `dialog_message` for the same omission — all three are
   human-in-the-loop, and only `dialog_open` got the inner exemption.
2. Independently, honour `title` / `buttonLabel` / `defaultPath` in the `dialog_open` arm
   (`set_title`, `set_directory`). This is worth doing on its own merits and it materially reduces
   how often anyone reaches the timeout in the first place.
3. Consider whether `onMoveInstallYesClick` and its siblings should catch a rejected `openDialog`
   rather than dying as an unhandled rejection — a rejected picker currently produces no user-
   visible signal whatsoever.

Steps 1 and 2 are independent and can land separately; step 1 alone unblocks the gate.

## Workaround for gate purposes

Completing the pick in **under 60 seconds** lets the response arrive before the shell drops it, so
the flow proceeds normally. Any gate step driving a file picker must be run that way until this is
fixed, and should say so.

## Notes

No `resolves_phase:` — this is a shell/transport defect, not a Phase 34.6 port defect, and must not
be auto-closed by that phase. Live-gate step 5's `moveInstall`/`importGame` are BLOCKED on it rather
than failing on their own merits.

Related: [[sidecar-send-channels-fail-silently]] ·
[[withtimeout-rejects-outer-promise-only]] · [[keyring-timeout-races-keychain-approval]]
