---
phase: 35-electron-cutover-remove-the-electron-build
plan: 21
subsystem: infra
tags: [tauri, rust, ipc, sidecar, security, opener-plugin]

# Dependency graph
requires:
  - phase: 35-electron-cutover-remove-the-electron-build
    provides: "35-REVIEW.md's CR-01/CR-02 findings, and plan 35-11's ported frontendReady boot-time initQueue(true) auto-resume"
provides:
  - "An explicit five-scheme allow-list enforced inside the open_external Tauri command, ahead of app.opener().open_url"
  - "Restored once-semantics for frontendReady's boot-time download-queue auto-resume, scoped to the boot half only"
affects: [39-electron-cutover-followups, steam-launch-live-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure, AppHandle-free validator + #[cfg(test)] mod tests for Tauri command arms (open_external_scheme_check), matching the existing protocol_url_arg/clipboard_text_arg convention"
    - "Module-scoped boot-work guard flag (frontendReadyBootWorkDone) set BEFORE scheduling, not inside the async callback, to survive same-tick double delivery"

key-files:
  created: []
  modified:
    - src-tauri/src/main.rs
    - src/backend/sidecar/appShellFlowRegistration.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts

key-decisions:
  - "CR-02: kept ipcMain.on (not ipcMain.once) and guarded only the setTimeout/initQueue block with a module-scoped let flag, because the Snap-warning dialog and observability logging (logSendHandlerReached, logInfo) are allowed to repeat per T-35-107, while only the boot work is a correctness/DoS risk"
  - "Guard flag is set to true BEFORE scheduling the setTimeout, not inside its callback, so two synchronous deliveries in the same tick (before any timer fires) cannot both observe false"
  - "Fixed three latent test-infrastructure bugs (Rule 1/Rule 3) uncovered while proving the CR-02 regression tests pass for the right reason, rather than leaving them to silently swallow future test failures via console.warn"

requirements-completed: [REQ-35-20]

# Metrics
duration: 48min
completed: 2026-08-30
---

# Phase 35 Plan 21: Close review criticals CR-01 (open_external scheme allow-list) and CR-02 (frontendReady once-semantics) Summary

**Rust-side five-scheme allow-list gates `open_external` before it reaches the opener plugin, and a module-scoped guard flag restores once-semantics for the sidecar's boot-time download-queue auto-resume.**

## Performance

- **Duration:** ~48 min
- **Started:** 2026-08-30T18:07:30+12:00 (approx, prior plan's completion commit)
- **Completed:** 2026-08-30T18:55:03+12:00
- **Tasks:** 2
- **Files modified:** 3 (`src-tauri/src/main.rs`, `src/backend/sidecar/appShellFlowRegistration.ts`, `src/backend/sidecar/__tests__/appShellFlows.test.ts`)

## Accomplishments

- `open_external` now rejects any URL whose scheme is not one of exactly `https`, `http`, `mailto`, `tel`, `steam` — matched ASCII-case-insensitively — before ever calling `app.opener().open_url`. Rejection is proven per-scheme by `cargo test`, including a source-scan test that the check runs *before* the plugin call, not merely that the pure helper itself rejects correctly.
- `frontendReady`'s boot-time `initQueue(true)` auto-resume now runs at most once per sidecar process, proven by a test that delivers the channel twice into one isolated registration and asserts exactly one `initQueue` call. The Snap warning dialog and observability logging ahead of the guard are explicitly allowed to repeat (T-35-107: accept).
- Both RED-proofs (CR-01 and CR-02) captured verbatim below, confirming each new test fails for the specific reason it exists to catch, not for an unrelated reason.

## Task Commits

Each task was committed atomically:

1. **Task 1: Give `open_external` an explicit scheme allow-list (CR-01)** - `94e5f88ac` (fix)
2. **Task 2: Restore once-semantics to `frontendReady`'s boot work (CR-02)** - `fb12d4261` (fix)

**Plan metadata:** (this commit, following this SUMMARY)

## Files Created/Modified

- `src-tauri/src/main.rs` — added `OPEN_EXTERNAL_ALLOWED_SCHEMES` const, `open_external_scheme_check()` pure helper, wired it into `open_external` ahead of `app.opener()`, corrected the command's doc comment, added 10 `#[cfg(test)]` cases (rejection per scheme, accept cases, case-insensitivity, and the source-scan "calls the check before opening" test).
- `src/backend/sidecar/appShellFlowRegistration.ts` — added module-scoped `let frontendReadyBootWorkDone = false`, guarded the `setTimeout(...initQueue(true)...)` block with it (set `true` before scheduling), corrected the module docstring's "byte-equivalent" claim to document the once-semantics as a deliberately restored, non-byte-equivalent property, citing CR-02.
- `src/backend/sidecar/__tests__/appShellFlows.test.ts` — added a double-delivery test asserting `initQueue` is called exactly once; added a Snap-dialog double-delivery test asserting the dialog fires on both deliveries (T-35-107: accept); expanded the shared `i18next` mock with a `.t()` implementation; added `initHeadless()` calls inside three `jest.isolateModules()` blocks that reach `frontendReady`'s unconditional `logInfo()` call; added a defensive `isSnap` reset in the Snap-dialog test's `finally` block.

## CR-01: exact allow-list and rejection log format

Allow-list (`src-tauri/src/main.rs`):

```rust
const OPEN_EXTERNAL_ALLOWED_SCHEMES: &[&str] = &["https", "http", "mailto", "tel", "steam"];
```

`steam` is the reason the command exists at all — the `opener` plugin's own `allow-default-urls` capability scope excludes it. The other four mirror that same plugin scope exactly, so this app-defined command is never wider than the plugin arm the capability file already restricts. `src-tauri/capabilities/default.json` was read but deliberately left unmodified (`git diff --stat` shows no entry for it) — Rust-side plugin calls bypass the capability system entirely, so a capability edit cannot fix this finding.

Rejection helper:

```rust
fn open_external_scheme_check(url: &str) -> Result<(), String> {
    let scheme = url
        .split_once(':')
        .map(|(s, _)| s.to_ascii_lowercase())
        .ok_or_else(|| "open_external: rejected a URL with no scheme".to_string())?;
    if !OPEN_EXTERNAL_ALLOWED_SCHEMES.contains(&scheme.as_str()) {
        eprintln!("[shell] open_external: rejected scheme '{scheme}'");
        return Err("open_external: scheme not allowed".to_string());
    }
    Ok(())
}
```

**Literal emitted rejection line format:** `[shell] open_external: rejected scheme '<scheme>'` — the scheme name only, never the URL (T-28-04 convention). Confirmed by reading the line: the interpolated variable is `scheme` (post-split, post-lowercase), not `url`. The `Err` string returned to the renderer (`"open_external: scheme not allowed"`) likewise carries no URL.

`open_external` itself:

```rust
#[tauri::command]
fn open_external(url: String, app: AppHandle) -> Result<(), String> {
    open_external_scheme_check(&url)?;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}
```

### CR-01 RED-proof (verbatim)

The `open_external_command_body_calls_the_scheme_check_before_opening` test reads `main.rs`'s own source at test time and asserts `open_external_scheme_check(&url)?;` appears textually before `app.opener()` inside `open_external`'s body — closing the gap that every other test above only proves the *helper* rejects correctly, not that the *command* calls it (or calls it in the right order). With the `open_external_scheme_check(&url)?;` line deleted from the command body (the exact mutation this test exists to catch — every other test in the file still passes unchanged against that mutation, since they drive the helper directly), this test fails with:

```
thread 'tests::open_external_command_body_calls_the_scheme_check_before_opening' panicked at src/main.rs:8406:14:
open_external must call open_external_scheme_check before opening the URL
```

(captured during Task 1's execution, prior to this segment; re-confirmed structurally intact by re-reading the source and re-running the full CR-01 test group at the end of this plan — 10/10 pass):

```
running 10 tests
test tests::open_external_scheme_check_accepts_steam_rungameid ... ok
test tests::open_external_allowed_schemes_are_exactly_the_five_member_set ... ok
test tests::open_external_scheme_check_accepts_mailto ... ok
test tests::open_external_scheme_check_accepts_https ... ok
test tests::open_external_scheme_check_rejects_javascript_scheme ... ok
test tests::open_external_scheme_check_rejects_smb_scheme ... ok
test tests::open_external_scheme_check_is_case_insensitive ... ok
test tests::open_external_scheme_check_rejects_a_url_with_no_scheme ... ok
test tests::open_external_scheme_check_rejects_file_scheme ... ok
test tests::open_external_command_body_calls_the_scheme_check_before_opening ... ok

test result: ok. 10 passed; 0 failed; 0 ignored; 0 measured; 206 filtered out; finished in 0.00s
```

## CR-02: once-semantics shape chosen, and why

Chose the **narrower of the review's two candidate fixes**: kept `frontendReady`'s registration as `ipcMain.on` (not `ipcMain.once`), and guarded only the boot-work block — the `setTimeout(() => { logInfo(...); void initQueue(true) }, 5000).unref()` call — behind a module-scoped `let frontendReadyBootWorkDone = false` flag.

Rationale: `logSendHandlerReached('frontendReady')`, the `logInfo('Frontend Ready', ...)` line, and the `isSnap` Snap-warning dialog are all **allowed to repeat** — T-35-107 dispositions a repeated informational dialog as "accept", not a defect, and a repeated log line carries no correctness risk. Only `initQueue(true)` is unsafe to run twice: it has no re-entrancy guard of its own, so two concurrent deliveries would run two downloaders against the same install directory. Switching the whole registration to `ipcMain.once` would have silenced the (acceptable) repeated dialog/logging along with the (unacceptable) repeated boot work — wider than the finding requires.

```ts
let frontendReadyBootWorkDone = false
```

```ts
if (!frontendReadyBootWorkDone) {
  frontendReadyBootWorkDone = true
  setTimeout(() => {
    logInfo('Starting the Download Queue', LogPrefix.Backend)
    void initQueue(true)
  }, 5000).unref()
}
```

The flag is set to `true` **before** the `setTimeout` is scheduled, not inside its callback — this matters because it makes the guard correct even for two *synchronous* deliveries in the same tick (before either timer has fired), not just for deliveries spaced more than 5 seconds apart.

The module docstring's prior claim that this handler reproduces `main.ts:560-601` "byte-equivalently" was corrected: it now states the once-semantics as a deliberately restored, non-byte-equivalent property (the original used `addOneTimeListener`/`ipcMain.once` for the whole handler; this port uses a repeating `ipcMain.on` plus a scoped guard), citing CR-02.

### CR-02 RED-proof (verbatim)

Temporarily removed the guard (replacing the guarded block with the unconditional `setTimeout(...)` call, i.e. reverting to the pre-fix shape) and re-ran the "CR-02: TWO frontendReady deliveries into an ISOLATED registration start the download queue only ONCE" test:

```
  ● sidecar app-shell flows (Phase 34.1 Plan 04 — REQ-34.1-05/REQ-34.1-09) › REQ-34.6-04/07/13 frontendReady (send, D-11) › CR-02: TWO frontendReady deliveries into an ISOLATED registration start the download queue only ONCE

    expect(jest.fn()).toHaveBeenCalledTimes(expected)

    Expected number of calls: 1
    Received number of calls: 2

      831 |         // `frontendReadyBootWorkDone` -- flips this to `toHaveBeenCalledTimes(2)` and
      832 |         // this assertion fails.
    > 833 |         expect(isolatedInitQueue).toHaveBeenCalledTimes(1)
          |                                   ^
      834 |         expect(isolatedInitQueue).toHaveBeenCalledWith(true)
      835 |       } finally {
      836 |         jest.useRealTimers()

      at Object.<anonymous> (src/backend/sidecar/__tests__/appShellFlows.test.ts:833:35)

Test Suites: 1 failed, 1 total
Tests:       1 failed, 34 skipped, 1 passed, 36 total
```

This confirms the test fails specifically because `initQueue` was called twice (not for an unrelated reason), and names `initQueue` in the failure. The guard was then restored via `cp` from a pre-revert backup, verified with a plain `diff` returning exit 0 against that backup, and the full suite re-run to confirm all 36 tests pass again.

## Decisions Made

- Kept `ipcMain.on` and guarded only the boot-work block, not the whole handler (see "CR-02: once-semantics shape chosen" above).
- Did not add a re-entrancy guard inside `initQueue` itself — out of scope per the plan (`downloadmanager/downloadqueue.ts` is a different subsystem); the caller-side fix is what CR-02 asks for.
- Did not modify `src-tauri/capabilities/default.json` — Rust-side plugin calls bypass the capability system, so a capability edit is structurally incapable of closing this finding.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `frontendReady`'s unconditional `logInfo()` call crashed inside isolated test instances that never initialized the logger**

- **Found during:** Task 2, while writing the CR-02 double-delivery test
- **Issue:** `frontendReady`'s handler calls `logInfo('Frontend Ready', LogPrefix.Backend)` unconditionally near the top of its body. `logInfo` reads a module-scoped `heroicLogWriter` that is `undefined` until `initHeadless()`/`init()` runs (normally done once via `bootstrap.ts`'s `startSidecar()` path). Tests that call `registerAppShellFlows()` directly inside `jest.isolateModules()` never trigger that initialization, so `logInfo` threw `TypeError: Cannot read properties of undefined (reading 'logInfo')`, silently swallowed by the handler's own try/catch → `logSendFailure` → `console.warn` — invisible without deliberate instrumentation, and meant the new tests were passing/failing for the wrong reason (the code under test never actually ran past the crash).
- **Fix:** Added `require('../../logger').initHeadless()` inside each of the three affected `jest.isolateModules()` callbacks, before `registerAppShellFlows()` is invoked.
- **Files modified:** `src/backend/sidecar/__tests__/appShellFlows.test.ts`
- **Verification:** All three affected tests now exercise the real handler body past the `logInfo` call; confirmed via targeted debug instrumentation during investigation, then via clean test runs after the fix.
- **Committed in:** `fb12d4261` (Task 2 commit)

**2. [Rule 1 - Bug] Shared `i18next` test mock had no `.t()` method, causing the Snap-warning dialog test to silently fail its core assertion**

- **Found during:** Task 2, debugging the Snap-warning dialog double-delivery test (`expect(snapDialogCalls).toHaveLength(2)` was failing with length 0, not a crash)
- **Issue:** The Snap-warning dialog code in `appShellFlowRegistration.ts` calls `i18next.t(key, defaultValueOrOptions)` three times while constructing its title/message/checkboxLabel. The file's shared `jest.mock('i18next', ...)` had no `.t()` at all, so this threw `TypeError: i18next.t is not a function` synchronously — before `dialog.showMessageBox()` was ever called — again silently swallowed by the handler's catch → `logSendFailure` → `console.warn`, itself muted by this test file's global `warnSpy` (`beforeEach`).
- **Fix:** Added a `t: jest.fn((key, defaultValueOrOptions) => {...})` implementation to the shared `i18next` mock, mirroring real i18next's fallback shape: a string second argument is returned directly as the default; an options object's `.defaultValue` property is used if present; otherwise the bare key is returned.
- **Files modified:** `src/backend/sidecar/__tests__/appShellFlows.test.ts`
- **Verification:** The Snap-dialog test's `snapDialogCalls` assertion now observes 2 real dialog calls across two deliveries.
- **Committed in:** `fb12d4261` (Task 2 commit)

**3. [Rule 3 - Blocking] A `jest.mock('backend/constants/environment', ...)` mutation leaked across separate `jest.isolateModules()` calls in the same test file**

- **Found during:** Task 2, while confirming the full test file passes together (not just the new tests in isolation)
- **Issue:** The Snap-dialog test mutates `isolatedEnv.isSnap = true` on an object obtained from `require('backend/constants/environment')` inside its own `jest.isolateModules()` call. This mutation was observed (empirically, not by design) to survive into a LATER, unrelated `jest.isolateModules()` call in the same file (the pre-existing `REQ-34.1-07 registerAppShellFlows() performs exactly one initial sync invoke` test), causing that test to crash on `constants/paths.ts`'s `userHome = isSnap ? env.SNAP_REAL_HOME! : homedir()` even though its own mock factory literal always specifies `isSnap: false`. The exact Jest mechanism responsible for the leak was not fully root-caused (time-boxed) — flagged here as worth a future investigation, since it appears to contradict the general assumption that `jest.mock()` factories are freshly re-invoked per isolate.
- **Fix:** Captured the isolated `environment` module object into an outer-scoped `isolatedEnvRef` variable in the Snap-dialog test and explicitly reset `isolatedEnvRef.isSnap = false` in that test's `finally` block, rather than relying on isolate-boundary semantics to reset it.
- **Files modified:** `src/backend/sidecar/__tests__/appShellFlows.test.ts`
- **Verification:** Confirmed stable across 3 consecutive full-suite runs of `appShellFlows.test.ts` (36/36 passing each time), including the pre-existing `REQ-34.1-07` precedent test that was previously the collateral-damage victim of this leak.
- **Committed in:** `fb12d4261` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 Rule 1/Rule 3 test-infrastructure bugs)
**Impact on plan:** All three were bugs blocking correct verification of the CR-02 fix itself — the new tests would otherwise have passed or failed for reasons unrelated to the guard under test, which is exactly the "gate that cannot see its own defect" failure shape this project repeatedly flags. No scope creep: no production code beyond the plan's stated `appShellFlowRegistration.ts` change was touched.

## Issues Encountered

None beyond the three deviations documented above, all resolved within this plan's scope.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both `35-REVIEW.md` review criticals CR-01 and CR-02 are now shipped fixes, not recorded acceptances.
- `steam://` remains openable — confirmed by the `open_external_scheme_check_accepts_steam_rungameid` and case-insensitivity tests — so plan `35-29`'s Steam launch live-gate criteria are unaffected.
- The cross-isolate `jest.mock()` leak observed in this session (Deviation 3) is worked around defensively but not fully root-caused; a future session touching this test file's `jest.isolateModules()` patterns should be aware similar leaks are possible with other mutated mock objects.

---
*Phase: 35-electron-cutover-remove-the-electron-build*
*Completed: 2026-08-30*

## Self-Check: PASSED

All referenced files exist on disk and both task commits (`94e5f88ac`, `fb12d4261`) are present in `git log --all`.
