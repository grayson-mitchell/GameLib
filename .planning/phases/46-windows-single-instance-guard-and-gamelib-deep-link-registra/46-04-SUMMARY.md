---
phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra
plan: 04
subsystem: infra
tags: [tauri, windows, nsis, deep-link, jest, source-gates, registry]

# Dependency graph
requires:
  - phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra plan 46-02
    provides: "The compiling #[cfg(windows)] FFI half of the single-instance guard, wired into main() before tauri::Builder::default()"
  - phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra plan 46-03
    provides: "run_windows_single_instance_accept_loop (warm-delivery accept loop) spawned in .setup(), plus the Phase 46 jest source-gate block proving the guard's shape"
provides:
  - "tauri.windows.conf.json with the plugins.deep-link override deleted -- Windows now inherits the base tauri.conf.json's schemes: [\"gamelib\"], same shape as macOS/Linux"
  - "windowsDeepLinkSuppression.test.ts Tests A/E inverted to pin the new (un-suppressed) state, in the SAME commit as the override removal"
  - "tauriShellSource.test.ts REQ-46-06 pin: register_all() stays #[cfg(target_os = \"linux\")] by decision (point a), with a RED self-test and an override recipe in the comment"
  - "main.rs comment rewrite (no code line touched) recording that Windows now registers at install time via NSIS, self-heals the stale Electron-era HKCU key, and that the phase 46 guard is what makes this safe"
  - "Installer-script proof: the freshly generated debug NSIS installer.nsi carries the 6 Classes\\gamelib registry lines (was 0 with the override in place), and a built, unrun setup .exe tied to this plan's HEAD sha, ready for the 46-05 live gate"
affects: [46-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Deleting a JSON config override key (rather than setting it to a non-suppressing value) to make an absent key the single source of truth once again -- mirrors how the macOS/Linux overlays already express \"no override\" for this same key"
    - "A jest source-gate override-recipe comment: the REQ-46-06 pin's own doc comment names the exact cfg to widen to and the exact expected-string edit needed to intentionally flip the decision later, rather than leaving that as tribal knowledge"

key-files:
  modified:
    - src-tauri/tauri.windows.conf.json
    - src/backend/__tests__/windowsDeepLinkSuppression.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src-tauri/src/main.rs

key-decisions:
  - "Killed a stray, pre-existing gamelib-shell.exe process (PID 28212, started 18:24:12 same day) that was holding a Windows file lock on src-tauri/target/debug/gamelib-shell.exe and made the FIRST tauri build --debug --bundles nsis attempt fail with 'failed to remove file ... Access is denied' before ever reaching makensis. This is a Rule 3 (blocking) fix: the file lock directly prevented completing Task 2, the process was confirmed to be the project's own debug target binary (not an unrelated program), and killing it is safe -- it was an orphaned leftover from earlier interactive work on this phase, not a build artifact or user data. After killing it, the identical command chain re-run reached makensis and produced installer.nsi + the setup .exe, then exited 1 at the expected TAURI_SIGNING_PRIVATE_KEY signing step, matching the plan's documented expected outcome exactly."
  - "Used grep -F (fixed-string) rather than a backslash-escaped basic-regex pattern to count the 'Classes\\gamelib' occurrences in installer.nsi. A first attempt with grep -c 'Classes\\\\gamelib' (backslash-escaped BRE) returned 0 against a file that plainly contains 6 matching lines -- GNU grep's BRE treats \\\\g as an undefined escape that does not match a literal backslash-g sequence the way bash's single-quote passthrough suggested it would. -F sidesteps the ambiguity entirely and was verified against a synthetic one-line reproduction before being trusted against the real file."

requirements-completed: [REQ-46-05, REQ-46-06, REQ-46-11]

# Metrics
duration: ~35min
completed: 2026-09-23
---

# Phase 46 Plan 04: Un-suppress gamelib:// on Windows + installer-level proof Summary

**Deleted the quick-260922-nx4 `plugins.deep-link` override from `tauri.windows.conf.json`, inverted its two suppression tests in the same commit, pinned the `register_all()` Linux-only decision (REQ-46-06) with an override recipe, rewrote the stale "Windows is NOT registered at EITHER stage" `main.rs` comment block (comments only), then built a real debug NSIS installer and confirmed `installer.nsi` now writes all 6 `Software\Classes\gamelib` registry lines -- 0 with the override, 6 without it -- leaving a built, unrun `GameLib_0.7.0_x64-setup.exe` ready for the 46-05 live gate.**

## Performance

- **Duration:** ~35 min (first read to last commit, plus the two NSIS build runs)
- **Started:** ~2026-09-23T11:35Z (estimated; not captured at agent start)
- **Completed:** 2026-09-23T23:48:15+12:00 (setup .exe mtime, the last artefact produced)
- **Tasks:** 2 completed (Task 2 produces no tracked-file commit; build artefacts are gitignored)
- **Files modified:** 4 (tauri.windows.conf.json, windowsDeepLinkSuppression.test.ts, tauriShellSource.test.ts, main.rs)

## Accomplishments

- `src-tauri/tauri.windows.conf.json`'s entire `"plugins"` key is deleted. The file now holds only `$schema` and `bundle` (byte-identical `bundle.resources`), the same shape as the macOS/Linux overlays with respect to `plugins`: absent. Verified: `node -e "const c=require('./src-tauri/tauri.windows.conf.json'); if (c.plugins!==undefined) process.exit(1); ..."` exits 0 and prints the three unchanged resource mappings.
- `windowsDeepLinkSuppression.test.ts`: Test A inverted to assert `windowsConf.plugins?.['deep-link']` is `undefined` (was: asserts an own `schemes: []` property). Test E inverted so the simulated three-platform merge yields `schemes: ["gamelib"]` for Windows, matching macOS/Linux (was: Windows alone yielded `[]`). Tests B, C and D are unchanged controls. The describe block and file header were rewritten to record the nx4 history as history, and the phase-46 lift as the current state. `grep -c "toEqual(\[\])"` on the file now prints 0. All 5 tests pass.
- `tauriShellSource.test.ts`: rewrote point 3 of the Phase 35 plan 07 describe header (previously claiming `register_all()` was Linux-only *because* Windows had no guard; now records that Windows has a guard and registers at install time instead, and that the Linux-only cfg is a REQ-46-06 decision because `register_all()`'s own documented AppImage-bypass purpose has no Windows analogue for an NSIS-only distribution). Added a new `REQ-46-06 (decision point a, operator-overridable)` test pinning `cfgGuardAboveRegisterAll()` to `#[cfg(target_os = "linux")]`, its own RED self-test (a synthetic `#[cfg(any(target_os = "linux", windows))]` source does NOT satisfy the pin), and a doc comment giving the exact override recipe (widen the cfg, keep the `CI=e2e` guard, flip the expected string). Did not touch any existing T-35-28 assertion. `-t "REQ-46-06"` runs exactly 2 tests, both passing; the whole file's Phase 46 + Phase 35 plan 07 + REQ-46-06 blocks all pass (239/239 across the three verification suites together).
- `main.rs`: rewrote two comment blocks, confirmed comments-only via `git show HEAD -- src-tauri/src/main.rs | grep '^[+-]' | grep -v '^[+-][+-]' | grep -v '^[+-] *//' | grep -v '^[+-] *$'` printing nothing. (1) The "Platform reality" comment above the OS `on_open_url` callback now names the Windows named-pipe accept loop as the warm delivery route, alongside the pre-existing Linux Unix-socket route. (2) The full "Runtime `register()` is LINUX-ONLY" block: replaced the "Windows is NOT registered at EITHER stage" bullet with the current state (installs at INSTALL time via NSIS, self-heals the stale Electron-era HKCU key per RESEARCH.md Q7's `WriteRegStr` unconditional-overwrite finding, decision point (a)/REQ-46-06 for staying Linux-only at runtime), replaced the stale "argv matches no scheme on Windows" side-effect sentence with RESEARCH.md Q6's actual finding (the plugin's own cold-start `handle_cli_arguments` emission now fires before `on_open_url` is registered and is dropped with no listener -- no double dispatch, pinned by the REQ-46-08 ordering gate, version-pinned to tauri 2.11.5 / tauri-plugin-deep-link 2.4.9), dropped the now-done "(1)(2)(3)" lifting checklist, and pointed ledger row `U-34.5-18` at the phase 46 live gate (46-05) as its closing event. `grep -n "Windows is NOT registered at EITHER stage\|so Windows has no guard" src-tauri/src/main.rs src/backend/__tests__/*.ts` prints nothing.
- `pnpm exec prettier --write` (unchanged, already conforming) and `pnpm exec eslint` (clean, no output) ran on both modified test files.
- `pnpm exec jest windowsDeepLinkSuppression.test.ts tauriShellSource.test.ts packagingConfig.test.ts`: 3 suites, 239/239 passing.
- `cargo check --bin gamelib-shell`: 0 errors, 9 warnings -- identical warning set to the pre-existing 46-03 baseline (none name any Phase 46 symbol, all pre-existing dead-code/unused-variable warnings elsewhere in the file).
- `git show --stat HEAD` for the Task 1 commit lists exactly the 4 expected files. `git log --format=%s -8` confirms the 46-02 feat commit (`2abc0aa1d`) and the 46-03 feat commit (`0cd466572`) both sit strictly older (below) this plan's commit.
- **Installer-level proof (Task 2).** Ran `pnpm exec vite build && pnpm build:sidecar && pnpm build:decompress-worker-dev && pnpm tauri build --debug --bundles nsis`. The darwin-symlink local repair from the referenced todo was NOT needed -- that todo (`2026-09-22-windows-packaged-build-breaks-on-darwin-runner-symlinks.md`) was independently resolved and moved to `.planning/todos/completed/` on 2026-09-23 (quick-260923-tip, commits `60db2ecfd`/`0df292bd0`/`1a75da601`), before this plan ran; `[preserve-runner-symlinks] restored 12 symlink(s), skipped 0, rejected 0` on the first attempt, no darwin build/bin cleanup required.
  - **First attempt exited 1 for an UNEXPECTED reason**, not the documented signing-step exit: `error: failed to remove file ...\gamelib-shell.exe. Caused by: Access is denied. (os error 5)`, before `makensis` ever ran. `tasklist` showed a stray `gamelib-shell.exe` (PID 28212) already running, holding the file lock; `Get-Process` confirmed it was this project's own debug binary (`...\target\debug\gamelib-shell.exe`, started 18:24:12 the same day) rather than any unrelated program. Killed via `taskkill /PID 28212 /F` (see `key-decisions`).
  - **Second attempt matched the plan's documented expected outcome exactly**: `Finished 1 bundle at: ...\bundle\nsis\GameLib_0.7.0_x64-setup.exe`, then `Error A public key has been found, but no private key. Make sure to set 'TAURI_SIGNING_PRIVATE_KEY' environment variable.`, exit 1 -- after `installer.nsi` and the setup .exe were written, exactly as the plan's own acceptance criteria state is expected and not a failure.
  - The installer was NOT run. The registry was NOT touched. `git status --porcelain` after the build shows no tracked-file modifications (build output lives entirely under gitignored `src-tauri/target/` and `build/`).

### Installer.nsi evidence (this build vs. the nx4 override run)

| Run | Config | `Classes\gamelib` lines | `URL Protocol` lines |
|---|---|---|---|
| nx4 override (pre-phase-46, historical) | `tauri.windows.conf.json` `schemes: []` | 0 | 0 |
| **This build (46-04, post-override-removal)** | `tauri.windows.conf.json` has no `plugins` key | **6** | **1** |

The 6 lines, verbatim (`src-tauri/target/debug/nsis/x64/installer.nsi`):

```
922:WriteRegStr SHCTX "Software\Classes\gamelib" "URL Protocol" ""
923:    WriteRegStr SHCTX "Software\Classes\gamelib" "" "URL:${BUNDLEID} protocol"
924:    WriteRegStr SHCTX "Software\Classes\gamelib\DefaultIcon" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\",0"
925:    WriteRegStr SHCTX "Software\Classes\gamelib\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""
1272:ReadRegStr $R7 SHCTX "Software\Classes\gamelib\shell\open\command" ""
1274:      DeleteRegKey SHCTX "Software\Classes\gamelib"
```

These match this plan's own `<interfaces>` section verbatim (apart from line numbers), and match the `260922-nx4` addendum's control-run capture. The `shell\open\command` line carries the quoted `$\"%1$\"` argument form (RESEARCH Q6/Pitfall 3 -- `&`-safe).

### Setup .exe identity

| Field | Value |
|---|---|
| Path | `src-tauri/target/debug/bundle/nsis/GameLib_0.7.0_x64-setup.exe` |
| Size | 114,775,426 bytes (~109.5 MiB) |
| mtime | 2026-09-23 23:48:15 +1200 |
| HEAD sha at build time | `607089433ac79bff3b54cf99b0b6651898244565` (this plan's Task 1 commit) |

Plan 46-05's operator installs exactly this file.

## Task Commits

Each task was committed atomically:

1. **Task 1: ONE commit that deletes the Windows override, inverts Tests A/E, pins REQ-46-06, and rewrites the stale comments** - `607089433` (feat)
2. **Task 2: Build the packaged debug NSIS bundle and prove installer.nsi registers gamelib://** - no commit (build artefacts under `src-tauri/target` and `build/` are gitignored by design; evidence recorded above and in this SUMMARY per the plan's own `<files>` note)

## Files Created/Modified

- `src-tauri/tauri.windows.conf.json` -- deleted the entire `plugins.deep-link.desktop.schemes: []` override; file now holds only `$schema` and `bundle` (unchanged `bundle.resources`)
- `src/backend/__tests__/windowsDeepLinkSuppression.test.ts` -- header rewritten (nx4 as history, phase 46 lift as current state); describe block renamed; Test A inverted to assert the `plugins['deep-link']` key is `undefined`; Test E inverted to assert Windows now merges to `schemes: ["gamelib"]`; Tests B/C/D unchanged
- `src/backend/__tests__/tauriShellSource.test.ts` -- rewrote point 3 of the Phase 35 plan 07 describe header; added a `REQ-46-06` pin test + RED self-test with an override-recipe doc comment, placed after the existing D-05 `register_all()` gate tests and before the `CI=e2e` guard tests
- `src-tauri/src/main.rs` -- comments only (verified via diff filter): rewrote the "Platform reality" comment to name the Windows pipe accept loop, and the full "Runtime register() is LINUX-ONLY" block to record install-time NSIS registration, the REQ-46-06 decision, the RESEARCH Q6 no-double-dispatch timing proof, and the `U-34.5-18` live-gate closure pointer

## Decisions Made

See `key-decisions` in the frontmatter: (1) killing the stray pre-existing `gamelib-shell.exe` process that was blocking the packaged build via a Windows file lock (Rule 3, blocking -- confirmed safe before killing), and (2) switching from a backslash-escaped BRE grep pattern to `grep -F` for counting `Classes\gamelib` occurrences in `installer.nsi`, after the BRE form silently returned 0 against a file that plainly contained the matches.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] A stray, already-running `gamelib-shell.exe` held a file lock that broke the first packaged-build attempt**
- **Found during:** Task 2, first `pnpm tauri build --debug --bundles nsis` attempt
- **Issue:** The build failed with `error: failed to remove file ...\gamelib-shell.exe. Caused by: Access is denied. (os error 5)`, before `makensis` ran -- a different failure than the plan's documented expected exit (the `TAURI_SIGNING_PRIVATE_KEY` signing-step exit). `tasklist /FI "IMAGENAME eq gamelib-shell.exe"` showed PID 28212 running; `Get-Process -Id 28212` confirmed its `Path` was this project's own `...\target\debug\gamelib-shell.exe`, started 18:24:12 the same day -- an orphaned leftover process from earlier interactive work on this phase, not an unrelated program or user data.
- **Fix:** `taskkill /PID 28212 /F`, confirmed via a follow-up `tasklist` showing no matching process, then re-ran the identical build command chain.
- **Files modified:** none (process-level fix only)
- **Verification:** The re-run reached `makensis`, produced `installer.nsi` and the setup `.exe`, then exited 1 at the `TAURI_SIGNING_PRIVATE_KEY` step exactly as the plan documents as expected.
- **Committed in:** n/a (no tracked files changed by this fix)

**2. [Rule 1 - Bug] A backslash-escaped grep pattern silently under-counted `Classes\gamelib` occurrences**
- **Found during:** Task 2, first evidence-gathering pass (`grep -c 'Classes\\gamelib' installer.nsi`)
- **Issue:** The pattern returned 0 against a file that `grep -n "Classes"` plainly showed containing 6 matching lines. A synthetic one-line reproduction (`echo 'Software\Classes\gamelib' | grep -c 'Classes\\gamelib'`) also returned 0, confirming the BRE escaping (not the file) was at fault -- GNU grep's basic-regex handling of `\\g` did not match the intended literal `\g` the bash single-quote passthrough suggested.
- **Fix:** Switched to `grep -F` (fixed-string, no regex interpretation) for this and all subsequent `Classes\gamelib` counts, verified against the same synthetic reproduction (returned 1, correctly) before trusting it against the real file (returned 6).
- **Files modified:** none (evidence-gathering command only; no source files affected)
- **Verification:** `grep -F -c 'Classes\gamelib' installer.nsi` → 6, matching the plan's own acceptance criterion and the `260922-nx4` control-run capture.
- **Committed in:** n/a (no tracked files changed)

---

**Total deviations:** 2 auto-fixed (1 Rule 3 -- a blocking process-lock fix, safe and verified before acting; 1 Rule 1 -- a bug in my own verification command, caught before being trusted). Neither affected the shipped code or test changes; both were resolved before Task 1's commit or Task 2's evidence capture.

## Issues Encountered

No authentication gates were hit. No architectural questions arose. The one genuine surprise (the stray process lock) was resolved within Task 2 per Rule 3 and did not require pausing.

## User Setup Required

None -- no external service configuration required. All verification (`prettier`/`eslint`/`jest`/`cargo check`/the NSIS build) ran natively on the operator's Windows 11 machine. `TAURI_SIGNING_PRIVATE_KEY` remains intentionally unset on this machine; the expected signing-step failure is not a setup gap, it is how this plan proves the installer artefacts were written before the (out-of-scope) signing step runs.

## Next Phase Readiness

- REQ-46-05 (un-suppress on Windows) and REQ-46-06 (register_all() decision pin) are implemented and source-gated. REQ-46-11's comment-rewrite half is complete (the `main.rs` and both test-file header rewrites); REQ-46-11's remaining closure items -- closing the `2026-08-29-windows-single-instance-guard-and-deep-link-registration.md` todo and ledger row `U-34.5-18` -- stay gated on REQ-46-10's live-gate PASS, which is plan 46-05's responsibility, per REQUIREMENTS.md's own explicit instruction (consistent with how 46-03's SUMMARY described this same gating).
- Plan 46-05 has a built, unrun `GameLib_0.7.0_x64-setup.exe` (HEAD `607089433`) ready for the live gate: install it, open a `gamelib://` URL from outside the running app, confirm the existing instance reacts (no second window, exactly one `gamelib-shell.exe`/`gamelib-sidecar.exe` process pair), and confirm the HKCU registry key self-healed from any stale Electron-era value.
- No blockers for 46-05.

---
*Phase: 46-windows-single-instance-guard-and-gamelib-deep-link-registra*
*Completed: 2026-09-23*

## Self-Check: PASSED

- FOUND: `src-tauri/tauri.windows.conf.json`
- FOUND: `src/backend/__tests__/windowsDeepLinkSuppression.test.ts`
- FOUND: `src/backend/__tests__/tauriShellSource.test.ts`
- FOUND: `src-tauri/src/main.rs`
- FOUND: `src-tauri/target/debug/bundle/nsis/GameLib_0.7.0_x64-setup.exe`
- FOUND: `.planning/phases/46-windows-single-instance-guard-and-gamelib-deep-link-registra/46-04-SUMMARY.md`
- FOUND: commit `607089433` (Task 1)
