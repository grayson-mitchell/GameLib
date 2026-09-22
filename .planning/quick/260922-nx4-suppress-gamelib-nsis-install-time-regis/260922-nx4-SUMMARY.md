---
status: complete
phase: quick-260922-nx4
plan: 01
subsystem: infra
tags: [tauri, nsis, deep-link, windows, jest, config]

requires: []
provides:
  - "Explicit `\"schemes\": []` override in `src-tauri/tauri.windows.conf.json` so the Tauri CLI's NSIS/WiX install-time bundling never writes `Software\\Classes\\gamelib` on Windows"
  - "Jest regression suite (`windowsDeepLinkSuppression.test.ts`) pinning the override, its own-property shape, and macOS/Linux non-interference, mutation-proven"
  - "Corrected `main.rs` / `Cargo.toml` comments naming both the install-time and runtime reasons Windows stays unregistered"
  - "Updated Windows single-instance-guard todo recording the install-time finding and rewritten unblock steps"
affects: [windows-release, deep-link-registration, single-instance-guard]

tech-stack:
  added: []
  patterns:
    - "Platform-specific Tauri config overlays (tauri.<platform>.conf.json) can and should carry explicit empty-array overrides rather than omitted keys, when the base config's non-empty default would otherwise leak into a platform where it is unsafe"

key-files:
  created:
    - src/backend/__tests__/windowsDeepLinkSuppression.test.ts
    - .planning/quick/260922-nx4-suppress-gamelib-nsis-install-time-regis/deferred-items.md
  modified:
    - src-tauri/tauri.windows.conf.json
    - src-tauri/src/main.rs
    - src-tauri/Cargo.toml
    - .planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md

key-decisions:
  - "Explicit `\"schemes\": []` in tauri.windows.conf.json, never a deleted key, because DeepLinkProtocol.schemes is #[serde(default)] and only the explicit form's meaning is independent of that default"
  - "Installer-level check (generated installer.nsi with/without the override) was attempted but NOT achieved on this machine -- vite build fails before reaching the Tauri CLI due to a pre-existing, unrelated Windows symlink-privilege limitation (EPERM), not this change. Weaker evidence (jest merge-patch simulation + compiled CLI binary string evidence) substituted instead and stated as weaker, not as installer-level proof"

requirements-completed: [QUICK-260922-nx4]

duration: ~25min
completed: 2026-09-22
---

# Quick 260922-nx4: Suppress GameLib NSIS install-time gamelib:// registration on Windows Summary

**Added an explicit `"schemes": []` override in `tauri.windows.conf.json` so the Tauri CLI's NSIS/WiX bundler stops writing `Software\Classes\gamelib` at install time on Windows — closing a gap the runtime-only `register_all()` Linux gate never covered — pinned by a 5-test mutation-proven jest suite.**

## Performance

- **Duration:** ~25 min (not precisely instrumented — no explicit start timestamp captured for this quick task)
- **Completed:** 2026-09-22T05:23:41Z
- **Tasks:** 3/3 completed
- **Files modified:** 4 (2 created, 4 modified — see key-files; `tauri.windows.conf.json` and `main.rs`/`Cargo.toml`/the todo overlap between "modified" listings above)

## Accomplishments

- Closed the actual D-05 hazard: the runtime `register_all()` being `#[cfg(target_os = "linux")]` was **not** sufficient — the Tauri CLI independently feeds `plugins.deep-link.desktop` into its NSIS/WiX bundler, which would have written `Software\Classes\gamelib` at Windows install time regardless. An explicit `"schemes": []` in `tauri.windows.conf.json` now suppresses that.
- Jest regression suite (`windowsDeepLinkSuppression.test.ts`, 5 tests) pins: the override's own-property presence (guards against a future "cleanup" deleting the key back into default-fallback), `bundle.resources` preservation, the base config's `["gamelib"]` staying intact, macOS/Linux declaring no override at all, and an RFC 7396 merge-patch simulation. RED confirmed before the config edit; GREEN after; both required mutations (override reverted to `["gamelib"]`, and `schemes` key deleted entirely) independently proven to fail the correct assertion.
- Corrected `main.rs`'s comment above the Linux-only `register_all()` call and `Cargo.toml`'s comment above the `tauri-plugin-deep-link` dependency, both of which previously implied Windows was unregistered purely by runtime omission — now name both the install-time override and the runtime gate, comment-only diff (0 non-comment lines changed in `main.rs`, verified by diff grep).
- Updated the Windows single-instance-guard todo with a dated finding section, corrected `verifiable_on`, a `blocked_by` field naming the guard itself, and a rewritten three-step unblock sequence (remove override → invert the test in the same commit → decide on widening the `register_all()` cfg gate).
- Confirmed (Step 5, main.rs read + call-site grep) that Windows argv `gamelib://` delivery already goes through GameLib's own `sidecar_forward_args` → `protocol_url_arg` choke point unconditionally (no `#[cfg(unix)]` gate on either), so the plugin's own `handle_cli_arguments` path now matching nothing on Windows is a removed duplicate, not a lost delivery path.

## Task Commits

1. **Task 1a: Pin the failing test (RED)** - `60a0d7b41` (test)
2. **Task 1b: Add the Windows override (GREEN)** - `95a730bf1` (fix)
3. **Task 3a: Correct main.rs / Cargo.toml comments** - `0544284e4` (docs)
4. **Task 3b: Record finding in the windows guard todo** - `2264449f7` (docs)

_Task 2 (empirical installer-level check) modified no repo files — its evidence is recorded below and in the todo; there is no task commit for it, matching the plan's own `<files>` spec ("no repo files modified")._

**Plan metadata:** not yet committed — the orchestrator handles the docs commit for `260922-nx4-SUMMARY.md` / `STATE.md` / `ROADMAP.md` / `REQUIREMENTS.md` per this run's constraints.

## Files Created/Modified

- `src/backend/__tests__/windowsDeepLinkSuppression.test.ts` - New jest suite (5 tests) pinning the Windows override, preservation of `bundle.resources`, base/macOS/Linux non-interference, and a merge-patch simulation
- `src-tauri/tauri.windows.conf.json` - Added `plugins.deep-link.desktop.schemes: []`; `bundle.resources` untouched
- `src-tauri/src/main.rs` - Comment-only correction above the Linux-only `register_all()` call (0 non-comment lines changed)
- `src-tauri/Cargo.toml` - Comment-only correction above `tauri-plugin-deep-link = "2"`
- `.planning/todos/pending/2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` - Retitled, `blocked_by` + updated `verifiable_on` added, new dated finding section, rewritten unblock steps, updated Verification section
- `.planning/quick/260922-nx4-suppress-gamelib-nsis-install-time-regis/deferred-items.md` - New: records 2 pre-existing, out-of-scope `tauriShellSource.test.ts` failures found while running the required suite list (see Issues Encountered)

## Decisions Made

- **Explicit empty array, never a deleted key.** `tauri_utils::config::DeepLinkProtocol.schemes` is `#[serde(default)]` (Vec, defaults to empty), so a deleted key and an explicit `[]` deserialize identically TODAY — but only the explicit form's meaning does not depend on that default staying empty in a future `tauri-utils` release. Test A's own-property assertion (`Object.prototype.hasOwnProperty.call(desktop, 'schemes')`) is the regression guard for this, and mutation-proven (deleting the key fails specifically that assertion, not the value assertion).
- **Installer-level empirical check: attempted, not achieved, honestly recorded as such.** See "Installer-Level Check Outcome" below for full detail — the failure is a pre-existing, unrelated Windows symlink-privilege limitation on this machine, not a defect in this change.

## Installer-Level Check Outcome (Task 2)

**NOT ACHIEVED.** No `installer.nsi` was generated (override or control run) on this machine.

**What was attempted:**
1. Checked prerequisites: `src-tauri/binaries/gamelib-sidecar-x86_64-pc-windows-msvc.exe` and `build/bin/x64/win32/` / `build/bin/arm64/win32/` all existed. `build/renderer/index.html` did not, so the `tauri:dev:packaged` prep chain's first step (`pnpm exec vite build`) was run.
2. `pnpm exec vite build` failed before producing any renderer output, at the `gamelib-preserve-runner-symlinks` vite plugin's `closeBundle` hook (`meta/preserveRunnerSymlinks.ts`), which tries to recreate every symlink from `public/` (a macOS PyInstaller `Python.framework` symlink tree under `public/bin/arm64/darwin`, present on this checkout) inside `build/`:
   ```
   [gamelib-preserve-runner-symlinks] EPERM: operation not permitted, symlink
   'Python.framework\Versions\3.12\Python' -> 'C:\Users\grays\Projects\GameLib\build\bin\arm64\darwin\gogdl\_internal\Python'
   ```
3. Confirmed the cause is a Windows OS-level symlink-creation restriction, not a bug in this change: `whoami /priv` shows no `SeCreateSymbolicLinkPrivilege`, and `net session` returns "Access is denied" (not an elevated/admin session). Windows refuses non-privileged `symlinkSync` without either an elevated process or Developer Mode enabled. Enabling Developer Mode requires a registry write under `HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\AppModelUnlock`, which this task's environment constraints explicitly forbid touching. Per the plan's own accounting rule ("at most two reasonable fix attempts that do not modify repo files"), no further attempt was made — the only two fixes (elevate, or touch the registry) were both out of bounds.
4. Since `installer.nsi` was never reached, the control run (`-c` override reverting to `["gamelib"]`) was not attempted either — it would fail at the identical prerequisite step for the identical reason, proving nothing new.

**Substituted weaker evidence** (explicitly NOT installer-level proof):
- The jest merge-patch simulation (Task 1, Test E) — mutation-proven, in-process only.
- `tauri_utils::config::DeepLinkProtocol` serde shape, as read by the plan's own research: `schemes: Vec<String>` is `#[serde(default)]`, no http/https fallback (that fallback belongs to a different struct, `AssociatedDomain.scheme`, used for mobile app-links — not consulted for this task's own verification, taken from the plan's `facts_verified_by_planner`).
- Compiled Windows Tauri CLI binary string evidence, gathered directly in this session against `node_modules/@tauri-apps/cli-win32-x64-msvc/cli.win32-x64-msvc.node`:
  - `deep_link_protocols`: **4** matches
  - `failed to parse desktop deep links`: **1** match
  - `WriteRegStr`: **34** matches
  - `Software\\Classes` (escaped for grep): **33** matches
  - `URL Protocol`: **2** matches

  This confirms the compiled CLI genuinely contains the deep-link-protocol-to-registry-write code path the plan's research described, but is string presence in a compiled binary, not a build-time observation of what this repo's specific config would emit.

**Control-run validity check:** not applicable — no control run was reached (see step 4 above), so there is no "control showed zero matches" failure mode to report; the honest statement is that Step 2 never got far enough for a control to be meaningful.

**Windows-argv analysis (Task 2 Step 5):** confirmed by reading `src-tauri/src/main.rs` lines ~8055-8074 (`sidecar_forward_args`) and its sole call site at `spawn_sidecar` (line ~8339-8341): neither carries a `#[cfg(unix)]` (or any platform) gate, so `gamelib://` argv forwarding to the sidecar on Windows already goes through GameLib's own `protocol_url_arg` choke point independent of the OS-level protocol registration. This means the plugin's own `handle_cli_arguments` path now matching nothing on Windows (a consequence of the `[]` override) removes a duplicate delivery path, not the only one.

## Deviations from Plan

### Auto-fixed Issues

None — Tasks 1 and 3 executed exactly as specified; no Rule 1/2/3 auto-fixes were needed.

### Out-of-scope discovery (logged, not fixed)

**1. [Scope boundary — not a deviation, logged to deferred-items.md] `tauriShellSource.test.ts` has 2 pre-existing, unrelated CRLF-checkout failures**
- **Found during:** Task 3's required suite run (`pnpm exec jest ... tauriShellSource.test.ts ...`)
- **Issue:** 2 of 146 tests in that suite fail: both `NARROWNESS:` tests that build a fixture string by joining 4 lines with a bare `'\n'` and match it against `readFileSync(main.rs, 'utf-8')`. This repo has `core.autocrlf=true`; `main.rs` is checked out with CRLF line endings on this machine (13,428 `\r\n`, 0 bare `\n`), so the `\n`-joined fixture never matches, `.replace()` silently no-ops, and the test's own anti-vacuity guard correctly fails.
- **Why out of scope:** the failing fixture targets `main.rs` lines ~7500-7510 (an unrelated Epic/GOG/Amazon cookie-census guard); this task's only `main.rs` edit is a comment-only block at lines ~9086-9120+, non-overlapping and non-shifting relative to the failing lines. `git show HEAD:src-tauri/src/main.rs` (the LF-normalized committed blob) contains the fixture text verbatim — the break is specific to this machine's working-tree CRLF conversion, not to any commit, and not to this task's diff.
- **Fix:** none applied — out of this task's file list. Logged in full at `.planning/quick/260922-nx4-suppress-gamelib-nsis-install-time-regis/deferred-items.md`.
- **Files:** none modified for this item.

---

**Total deviations:** 0 auto-fixed; 1 out-of-scope discovery logged (not fixed).
**Impact on plan:** The plan's Task 3 `<done>` criterion "all five suites pass" is **not fully met** — 4 of 5 pass cleanly (`windowsDeepLinkSuppression.test.ts`, `packagingConfig.test.ts`, `tauriConf.test.ts`, `artifactTargets.test.ts`); `tauriShellSource.test.ts` passes 144/146, with the 2 failures confirmed pre-existing and unrelated to this task's changes. Recorded honestly rather than claimed as fully green.

## Issues Encountered

- **`pnpm exec vite build` EPERM on Windows symlink creation** — see "Installer-Level Check Outcome" above. Blocks Task 2's primary goal; resolved by falling back to the plan's own Step 4 weaker-evidence path, recorded honestly as NOT achieved rather than papered over.
- **`tauriShellSource.test.ts` 2/146 pre-existing failures** — see "Out-of-scope discovery" above and `deferred-items.md`. Not fixed (out of this task's scope); recorded for visibility rather than silently reported as all-green.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- The Windows install-time `gamelib://` registration hazard (D-05) is closed by config, pinned by a mutation-proven test. No further action needed from this task.
- The Windows single-instance-guard todo remains correctly `pending`/`blocked`, now carrying an accurate record of why the runtime-only fix was insufficient and exactly what removing the override requires.
- **Not resolved by this task:** the installer-level empirical proof (generated `installer.nsi`) — blocked by an unrelated, pre-existing Windows symlink-privilege limitation on this machine. A future attempt on a machine with Developer Mode enabled (or an elevated build) could complete Task 2's original goal; the todo's Verification section now names this precondition explicitly.
- **Not resolved by this task:** the 2 pre-existing `tauriShellSource.test.ts` CRLF-checkout failures. Logged in `deferred-items.md` for whoever picks it up; not blocking for this task's own goal.

---
*Quick task: 260922-nx4*
*Completed: 2026-09-22*

## Self-Check: PASSED

All created/modified files confirmed present on disk (`windowsDeepLinkSuppression.test.ts`,
`tauri.windows.conf.json`, `main.rs`, `Cargo.toml`, the windows-guard todo, `deferred-items.md`,
this file). All 4 task commit hashes (`60a0d7b41`, `95a730bf1`, `0544284e4`, `2264449f7`) confirmed
present in `git log --oneline --all`. No missing items.

## Addendum 2026-09-22 (later the same day): installer-level check ACHIEVED

**This supersedes every "installer-level check NOT ACHIEVED" statement above.** The operator enabled
Windows Developer Mode, which lifts the `SeCreateSymbolicLinkPrivilege` EPERM. Three further local
Windows build blockers then had to be cleared first. None of them relates to this change; they are
filed in `.planning/todos/pending/2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`.
After that, `pnpm tauri build --debug --bundles nsis` reached `makensis` and produced
`GameLib_0.7.0_x64-setup.exe`. It then exited 1 only at the updater-artifact signing step
(`TAURI_SIGNING_PRIVATE_KEY` is not on this machine), which runs after `installer.nsi` and the setup
.exe are written. The installer was NOT run and the registry was not touched.

Generated `src-tauri/target/debug/nsis/x64/installer.nsi`, grepped for `Classes\gamelib`:

| Run | Config | `Classes\gamelib` lines | `URL Protocol` lines |
|---|---|---|---|
| Override (committed state) | `tauri.windows.conf.json` `schemes: []` | **0** | **0** |
| Control | same, plus `-c '{"plugins":{"deep-link":{"desktop":{"schemes":["gamelib"]}}}}'` (no file edited) | **6** | 1 |

The control lines, verbatim:

```
922:  WriteRegStr SHCTX "Software\Classes\gamelib" "URL Protocol" ""
923:  WriteRegStr SHCTX "Software\Classes\gamelib" "" "URL:${BUNDLEID} protocol"
924:  WriteRegStr SHCTX "Software\Classes\gamelib\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
925:  WriteRegStr SHCTX "Software\Classes\gamelib\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
1272: ReadRegStr $R7 SHCTX "Software\Classes\gamelib\shell\open\command" ""
1274: DeleteRegKey SHCTX "Software\Classes\gamelib"
```

So the control is valid: the template DOES register `gamelib://` when the scheme is present, and the
committed override removes all six lines. The only other difference between the two scripts is the
ordering of `CreateDirectory` lines (hash-set iteration). This confirms the original finding (the
installer would have registered it) and the fix, at installer-script level.
