---
created: 2026-08-24T00:00:00.000Z
title: "`openDialog` is missing from the shell's `LONG_RUNNING_CHANNELS`, so any file picker the user spends >60s in has its result DROPPED — killing moveInstall, importGame and every install-path flow silently"
area: tauri-shell
status: RESOLVED
severity: major
resolved: 2026-09-02
resolved_by:
  - "Phase 35 plan 07 (item 1: openDialog on LONG_RUNNING_CHANNELS)"
  - "quick 260902-8wc (items 2 and 3, plus the sibling-channel audit)"
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

---

## Closure record (2026-09-02, quick `260902-8wc`)

Closed across **two** pieces of work, five weeks apart. The todo sat in `pending/` for the whole
gap because it deliberately carries no `resolves_phase:` — which is why Phase 35's auto-close
could not see it, exactly as this file's own Notes section intended and did not anticipate.

### Item 1 — shipped by Phase 35 plan 07, NOT by this task

`"openDialog"` is on `LONG_RUNNING_CHANNELS` at `src-tauri/src/main.rs`, added with an inline
rationale and threat id T-35-30, and pinned by
`src/backend/__tests__/longRunningChannels.test.ts` (set-equality plus length, so the entry
cannot be silently dropped OR joined by an unmeasured sibling).

Plan 07 granted membership on a **measurement**, per that list's stated convention: the
`35-AB-RETEST.md` item-3 A/B drove `moveInstall`, left the picker untouched for 65+ seconds, and
recorded `[shell] response for unknown/timed-out id=4465 (dropped)` on the Tauri leg while the
same wait under Electron reached rsync.

### The symptom in this file's title is WRONG — corrected, not smoothed over

"**dies silently**" should not be repeated. The retest operator received a user-visible **"failed
to install"** message — wrong for the action driven (a *move* reported as an install failure) and
carrying no hint that a 60-second transport bound caused it. A misdirecting error is worse for
diagnosis than silence, because it sends the reader to the install path. The original 2026-08-24
observation of a silent `gamelib.log` was accurate for what that operator could see; it was not
the whole picture.

### Item 2 — the picker no longer discards its own options (this task)

`main.rs`'s `dialog_open` arm read **only** `properties`. It now honours:

- `title` → `set_title`
- `defaultPath` → `set_directory`, resolved to the nearest existing directory (Electron lets
  `defaultPath` name a file; AppKit/rfd only accepts a directory). Nothing is passed when no
  existing directory can be derived — handing the panel a nonexistent path is worse than handing
  it none.
- `filters` → `add_filter`, **file pickers only** (a folder picker ignores them). This was a gap
  the original todo did not name: `SideloadDialog` sends image and executable filters today and
  was getting an unfiltered picker.

`buttonLabel` **cannot** be honoured and this is now recorded inline in the arm rather than left
for the next reader to re-derive: tauri-plugin-dialog 2.7.2's `FileDialogBuilder` exposes
`add_filter` / `set_directory` / `set_file_name` / `set_title` / `set_can_create_directories`
and no confirm-button-label setter. Callers that pass `buttonLabel` get the OS default label.

This was the aggravating factor the todo identified: with no start directory the picker opens
wherever macOS last left it, so the user must navigate manually — which is what pushed the
interaction past the (now-removed) bound in the first place.

### The sibling audit this todo asked for — both siblings WERE affected

The todo's item 1 also said to "check `showSaveDialog`/`dialog_save` and `dialog_message` for the
same omission". That audit had never been run. Both fail in the same shape `dialog_open` did —
producing a **wrong answer**, not a visible error:

- **`dialog_message`** — on timeout, `platform/index.ts`'s `showMessageBox` catch resolves
  `{ response: safeIndex }`, the DECLINED branch. Someone deliberating for 60s on a native
  confirm has it answered "no" on their behalf while the panel is still on screen; their real
  click then arrives for an id already deleted from `rustPending` and is dropped.
- **`dialog_save`** — on timeout, `showSaveDialog` resolves `{ canceled: true }`, claiming the
  user cancelled while the save panel is still open.

Both are now in `UNBOUNDED_RUST_CHANNELS` (`sidecarRpc.ts`), which previously held
`RUST_DIALOG_OPEN` alone. Membership granted on **shape**, not measurement — unlike the shell-side
`LONG_RUNNING_CHANNELS`, this list's own stated rule is "completion gated on a human rather than
on machine work", and an OS panel stays open exactly as long as the person in front of it
deliberates.

**Deliberately NOT done — outer `LONG_RUNNING_CHANNELS` entries for these two.** Recorded here
instead of acted on, because that list grants membership on a measurement and there is none:
`showMessageBox`'s live callers sit under `uninstall` (already exempt) and `quit`, and
`showSaveDialog` has **no live backend caller at all** — its only non-test references are the stub
itself and its own tests. If a caller appears, it needs measuring, not assuming.

### Item 3 — a rejected picker is now visible (this task)

All **seven** call sites (five files) went through the promise unguarded: four bare `await`s with
no try/catch, three `.then()` chains with no `.catch()`. They now share
`frontend/hooks/useOpenDialog.ts`, a total wrapper that logs via `window.api.logError`, shows the
user a real error dialog, and resolves `false` — so every call site keeps its single `if (path)`
check and a failure can never again be an unhandled rejection visible only in the devtools
console.

Two pre-existing `no-floating-promises` lint warnings (PathSelectionBox, CustomWineProton) are
retired as a side effect: the hook cannot reject, so `void` is now the honest marker.

Note the changed risk profile, since it is the reason this is worth doing rather than obviously
worth doing: with item 1 shipped, a rejection is now **rare** rather than routine — a dead
sidecar, a closed transport, an unported channel. Rare is the argument for handling it properly,
not for leaving it unhandled.

### Gates

`src/backend/__tests__/dialogOptionForwarding.test.ts` (17 tests). Every source-shape assertion
carries a self-test that feeds the matcher the **pre-fix** text and requires it to fail, plus a
discrimination control proving the gate does not simply reject everything. The frontend census
enumerates call sites by scanning the tree rather than from a fixed list, and was mutation-tested
in both directions — a reintroduced `window.api.openDialog` and an unguarded new file each drove
it red before the change was accepted.

### Still open — the third observation is NOT closed

The "picker renders light under a dark system" item is untouched and remains explicitly
unverified. Its falsification still requires launching the packaged `.app`, and a second instance
splits the `[shell]` sink ([[concurrent-instance-splits-shell-sink]]). If it is worth pursuing it
needs its own todo; it is not covered by this closure.
