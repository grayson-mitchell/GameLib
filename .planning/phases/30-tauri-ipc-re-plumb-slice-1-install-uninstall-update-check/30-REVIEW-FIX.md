---
phase: 30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check
fixed_at: 2026-07-23T00:00:00Z
review_path: .planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 9
skipped: 2
status: partial
---

# Phase 30: Code Review Fix Report

**Fixed at:** 2026-07-23
**Source review:** `.planning/phases/30-tauri-ipc-re-plumb-slice-1-install-uninstall-update-check/30-REVIEW.md`
**Iteration:** 1
**Scope:** critical_warning (CR-01..04, WR-01..07). Info findings IN-01..04 were out of scope and are untouched.

**Summary:**
- Findings in scope: 11
- Fixed: 9
- Skipped: 2 (both already fixed before this run — verified, not re-applied)

All 9 fix commits landed on `fix/steam-native-install-stability`, one commit per finding,
`323753a5..81f5303a`.

**Verification performed per fix:**
- `cargo check` (with the frontendDist stub dir present) — clean, for every Rust change.
- `rustfmt --emit stdout` parse check on `main.rs` after each Rust edit.
- `tsc --noEmit` (whole project) — clean after each TypeScript change.
- `jest src/backend/sidecar` — 10 suites / 125 tests green (including `electronUntouched.test.ts`,
  which enforces the "no file under `src/backend/sidecar/` imports the real electron module" rule
  that constrained the WR-02 fix).
- `esbuild` sidecar bundle rebuild — 893 KB, **no unresolved alias/relative `require()` survived**
  (the repo's recurring `sync-require-alias-unresolved-in-build` gotcha), and `openDialog` is
  present in the bundle.
- `graphify update .` run after the code changes (5249 nodes, 9756 edges).

## Fixed Issues

### CR-03: 60-second hard invoke timeout applied to long-running install/update channels

**Files modified:** `src-tauri/src/main.rs`
**Commit:** `02280fa3`
**Applied fix:** Added `LONG_RUNNING_CHANNELS` (`install`, `updateGame`, `uninstall`,
`checkGameUpdates`, `refreshLibrary`) and `timeout_for(channel) -> Option<Duration>`.
`SidecarState::invoke` now resolves the bound before the channel is moved into the request frame
and uses `rx.recv()` (unbounded) for the `None` case. A dead sidecar still fails fast, because
dropping the sender wakes `recv()` with a disconnect error — mapped to
`"sidecar closed before responding"`. Every other channel keeps the 60s guardrail.

### CR-04: `dialog_open` inherits the 60-second rustInvoke timeout

**Files modified:** `src/backend/sidecar/sidecarRpc.ts`
**Commit:** `ab303338`
**Applied fix:** Added `UNBOUNDED_RUST_CHANNELS = [RUST_DIALOG_OPEN]`. `requestRustInvoke` skips
`setTimeout` entirely for those channels; `rustPending`'s `timer` is now `NodeJS.Timeout | null`
and both `clearTimeout` sites are guarded. The old behavior was worse than a plain failure —
`electronStub.showOpenDialog`'s catch converted the timeout into a silent
`{canceled: true, filePaths: []}` while the picker was still on screen.

### WR-01: `dialog.showOpenDialog` ignored its `options` — always a folder picker

**Files modified:** `src-tauri/src/main.rs`
**Commit:** `122b1a75`
**Applied fix:** The `dialog_open` arm now inspects the forwarded `args[0].properties` and calls
`blocking_pick_file()` when `openFile` is present without `openDirectory`, otherwise
`blocking_pick_folder()`. Default remains "folder", so plan 30-03's install-location path is
unchanged when no properties are supplied. This unblocks the real `properties: ['openFile']`
call sites (CustomWineProton's Wine/Proton binary, SideloadDialog's exe + cover images,
GameSubMenu, Tools, PathSelectionBox).

### WR-02: plan 30-03's dialog path was unreachable — `openDialog` unregistered in the sidecar

**Files modified:** `src/backend/utils/openDialog.ts` (new),
`src/backend/sidecar/dialogFlowRegistration.ts` (new), `src/backend/sidecar/handlers.ts`,
`src/backend/main.ts`
**Commit:** `81f5303a`
**Applied fix:** Extracted `main.ts`'s handler body into a shared `openDialogCallback` (the same
single-implementation discipline `checkGameUpdates.ts` follows, so the two builds cannot fork on
picker behavior), and added a curated `registerDialogFlows()` module called from `handlers.ts`.
`main.ts` keeps its Electron-specific `if (!mainWindow) return false` guard; the sidecar passes
`undefined`, which `electronStub.showOpenDialog` ignores.

Two project constraints shaped this fix:
- The electron import lives in `backend/utils/openDialog.ts`, **outside** `src/backend/sidecar/`
  — that directory may not name the electron module even in a type-only position, so the
  registration module calls through a widened cast, mirroring `installFlowRegistration.ts`'s
  existing treatment of `uninstallGameCallback`'s Electron `Event` parameter.
- Both new files use static top-level imports (no synchronous `require()` of alias/relative
  paths), and the rebuilt sidecar bundle was checked to confirm no literal unresolvable require
  survived.

### WR-03: `dialog:allow-open` widened the webview's capability surface

**Files modified:** `src-tauri/capabilities/default.json`
**Commit:** `b130e72d`
**Applied fix:** Removed both `dialog:allow-open` (which exposed `plugin:dialog|open` to renderer
JavaScript while doing nothing for the Rust-side `app.dialog().file()` call) and the redundant
`opener:allow-open-url`. `permissions` is now `["core:default", "opener:default"]`. The
description was rewritten to state the Tauri v2 rule explicitly. Verified by `cargo check`
(the capability file is parsed by `generate_context!`).

### WR-04: `updateGame` discarded the update result

**Files modified:** `src/backend/sidecar/installFlowRegistration.ts`
**Commit:** `c6e57e4c`
**Applied fix:** The handler now captures `SteamGame.update()`'s `InstallResult`, logs
`result.error` via `logError` when `status === 'error'` (mirroring `updateQueueElement`), and
returns `{status}` instead of `void`. Return type widened to
`Promise<{ status: InstallResult['status'] }>`.

### WR-05: `checkGameUpdates` had no per-runner error isolation

**Files modified:** `src/backend/utils/checkGameUpdates.ts`,
`src/backend/sidecar/__tests__/installFlows.test.ts`
**Commit:** `061d395f`
**Applied fix:** Wrapped the per-runner body in `try/catch` with a `logWarning`, so one runner
whose CLI/credentials are missing no longer discards the results already collected from the other
five. Added a test that spies on every `libraryManagerMap[runner].listUpdateableGames`, makes the
first one reject, and asserts the invoke still resolves `ok: true` with exactly the other runners'
results. Also corrected Test 5's misleading comment, which claimed to prove this property but
could not.

### WR-06: `install` dropped Electron's argument sanitation

**Files modified:** `src/backend/sidecar/installFlowRegistration.ts`
**Commit:** `4fadfc54`
**Applied fix:** The bypass now applies `installQueueElement`'s identical normalization:
`path: (path ?? '').replaceAll("'", '')` and
`sdlList: (params.sdlList ?? []).filter((el) => el !== '')`.

### WR-07: Rust dropped correlated responses for unknown ids with no diagnostic

**Files modified:** `src-tauri/src/main.rs`
**Commit:** `124404f1`
**Applied fix:** The response branch now `match`es explicitly: a missing pending sender logs
`[shell] response for unknown/timed-out id={id} (dropped)`, and a missing/non-string `id` logs
`[shell] response frame with a missing or non-string id (dropped)`. Diagnostics carry the id
only, never `result`/`error` bodies (T-28-04). This brings the response path in line with the
file's own stated convention at the unrecognized-frame branch.

## Skipped Issues

### CR-01: `install` handler ignores `runner` and always constructs a `SteamGame`

**File:** `src/backend/sidecar/installFlowRegistration.ts:116-146`
**Reason:** skipped — already fixed before this run (REVIEW.md frontmatter records commit
`236638f6`). **Verified in the current source:** both `install` and `updateGame` throw
`` `${UNPORTED_CHANNEL_MARKER} <channel>: runner '<runner>' not ported` `` when
`runner !== 'steam'`, and the two `CR-01:` tests in `installFlows.test.ts` assert the rejection
happens before any `SteamGame` is constructed and before the `queued` status push. No further
change applied.

### CR-02: `install` emits `queued` and never a terminal status

**File:** `src/backend/sidecar/installFlowRegistration.ts:125-145`
**Reason:** skipped — already fixed before this run (REVIEW.md frontmatter records commit
`75bb3630`). **Verified in the current source:** the handler pushes `installing` after `queued`,
captures the `InstallResult`, logs `status === 'error'`, pushes a terminal `done` in a `catch`
and (for `deferredToSetup` / `wasAborted`) in a `finally`, and returns `{status}`. Four `CR-02:`
tests cover error / abort / deferredToSetup / no-extra-done-on-success. No further change applied.

## Notes for the verifier

- **Logic-fix flag (human verification recommended):** CR-03 and CR-04 change *when a promise is
  allowed to never settle*. Both pass `cargo check` / `tsc` / the sidecar suite, but neither tier
  of automated verification can prove the runtime behavior on real hardware. The concrete UAT is:
  start a Steam depot install that runs longer than 60s under Tauri and confirm the renderer no
  longer sees `sidecar invoke timed out`; and leave the folder picker open for >60s and confirm
  the selection is still honored.
- **WR-02 is now live code on both builds.** `openDialog` previously rejected with
  `UNPORTED_CHANNEL_MARKER` under Tauri; every `window.api.openDialog(...)` call site is now
  reachable there. Combined with WR-01, the `openFile` call sites should be exercised at least
  once during UAT.
- **Pre-existing prettier drift left alone.** `sidecarRpc.ts` and `installFlows.test.ts` were
  already not prettier-clean at the phase baseline (`323753a5`); running `prettier --write` would
  have mixed unrelated reformatting hunks into these commits, so it was deliberately not applied.
- Info findings IN-01..IN-04 remain open (out of scope for `critical_warning`). IN-01 in
  particular is cheap and adjacent to the CR-01/CR-02 guards already in place.

---

_Fixed: 2026-07-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
