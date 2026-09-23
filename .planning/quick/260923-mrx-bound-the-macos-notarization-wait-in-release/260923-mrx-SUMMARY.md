---
phase: quick-260923-mrx
plan: 01
subsystem: build
tags: [macos, notarization, github-actions, ci, timeout, tauri]

requires: []
provides:
  - "timeout-minutes: 60 on the tauri-action step in release-tauri.yml (all three matrix legs)"
  - "A macOS-only if: failure() notarytool history diagnostic step, continue-on-error, no APPLE_* env map, no credential echo"
  - "Parsed-YAML regression block (8 tests) asserting both, falsification-checked against a reverted workflow"
affects: [macos-notarization-live-gate, release-tauri-ci]

tech-stack:
  added: []
  patterns:
    - "Step-level timeout-minutes as the only available bound when the wrapped tool (tauri-bundler's xcrun notarytool submit --wait) exposes no timeout knob of its own"
    - "if: failure() diagnostic step gated on env.X != '' reading values already written to $GITHUB_ENV by an earlier gate step, never re-mapped via a step-level env: block (GAP-A)"

key-files:
  created: []
  modified:
    - ".github/workflows/release-tauri.yml"
    - "src/backend/__tests__/releaseWorkflow.test.ts"

key-decisions:
  - "continue-on-error: true chosen over a trailing || true, per the plan's locked decision -- the former still surfaces a visible failed-step annotation if notarytool itself errors, the latter would swallow that signal too"
  - "The diagnostic step reads APPLE_ID/APPLE_PASSWORD/APPLE_TEAM_ID from the ambient process environment (written to $GITHUB_ENV by the existing 'Enable Apple signing...' step), never via its own env: map, to avoid reintroducing the GAP-A defined-and-empty-variable failure mode"
  - "Header comment states plainly that a step-level timeout conflates build time with notarization time, and names that as an accepted tradeoff forced by tauri-bundler hardcoding --wait with no timeout flag or env var"
  - "60 minutes chosen against warm-cache evidence only (Linux 4m53s measured, Windows ~13-20min inferred from a different run's header entry); a cold-cache trip is the correct trigger to raise the number, not to remove the bound"

patterns-established:
  - "Falsification-checked regression tests: revert the source edit with git checkout <baseline-sha> -- <path>, confirm the new tests go red, then git checkout HEAD -- <path> to restore, rather than trusting an unverified assertion shape"

requirements-completed: [QUICK-260923-mrx]

duration: 35min
completed: 2026-09-23
---

# Quick Task 260923-mrx: Bound the macOS notarization wait in release Summary

**Added `timeout-minutes: 60` to the `tauri-action` step in `release-tauri.yml` and a macOS-only `if: failure()` diagnostic step that queries `xcrun notarytool history` so a future timeout reports the Apple-side submission status from inside the run, instead of requiring a human with local Apple credentials to find out by hand.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-23 (session start)
- **Completed:** 2026-09-23
- **Tasks:** 2 planned tasks completed, plus one follow-up fix caught by the plan's own falsification check
- **Files modified:** 2

## Accomplishments

- `tauri-action` (the only step anywhere in the job carrying `timeout-minutes`, confirmed by a blast-radius census test) is now bounded at 60 minutes on all three matrix legs, closing the gap where run `35808881023`'s macOS leg inherited GitHub's 360-minute default and sat silent for 2h05m37s before a hand cancellation.
- A new macOS-only, `if: failure()`, `continue-on-error: true` step immediately after `tauri-action` runs `xcrun notarytool history` against the ambient `APPLE_ID`/`APPLE_PASSWORD`/`APPLE_TEAM_ID` (never a step-level `env:` map, per GAP-A), turning an opaque "The operation was canceled." into a self-explaining Apple-side status inside the same run.
- Header comment extended with a dated 2026-09-23 entry recording the measured hang, the new bound, and — stated plainly rather than implied — that a step-level timeout conflates build time with notarization time, accepted as a tradeoff forced by `tauri-bundler` hardcoding `--wait` with no timeout knob.
- 8 new parsed-YAML regression tests added (93 total in the file, up from the 85 baseline), each asserting on `parseReleaseSteps()`'s parsed output, never a raw grep.
- Falsification check run and passed: reverting the workflow edit alone (`git checkout 77f3b4388 -- .github/workflows/release-tauri.yml`) turned all 8 new tests red; restoring (`git checkout HEAD -- ...`) brought all 93 back to green. This check caught a real defect — see Deviations.

## Task Commits

Each task was committed atomically:

1. **Task 1: Bound the tauri-action step and add the notarytool diagnostic** - `f83b237cc` (feat)
2. **Task 2: Add the parsed-YAML regression block** - `dad059ef2` (test)
3. **Follow-up: fix a vacuous-pass test found by the plan's own falsification check** - `f17d46cff` (fix)

**Plan metadata:** commit pending (orchestrator handles the docs commit)

## Files Created/Modified

- `.github/workflows/release-tauri.yml` — `timeout-minutes: 60` on `tauri-action`; new "Diagnose a notarization timeout (diagnostic only, never fails the job)" step; header comment entry dated 2026-09-23.
- `src/backend/__tests__/releaseWorkflow.test.ts` — extended `ParsedReleaseStep` with `'timeout-minutes'?: number` and `'continue-on-error'?: boolean`; new `describe('release-tauri.yml bounds the tauri-action step (260923-mrx)')` block with 8 tests.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Credential-echo test passed vacuously against a reverted workflow**
- **Found during:** the plan's own mandated falsification check (revert `release-tauri.yml` to baseline `77f3b4388`, re-run jest, expect the new block to go red).
- **Issue:** the test `'the diagnostic step never echoes credentials and never swallows failure via || true'` used `steps.find(...)?.run ?? ''` without first asserting `expect(diagStep).toBeDefined()`. Against the reverted (pre-fix) workflow, the diagnostic step doesn't exist, `.run` resolves to `''`, and all three negative regex assertions (`not.toMatch(/set -x/)`, etc.) hold vacuously on the empty string — so this one test stayed green while the other 7 new tests correctly went red. The plan's `<verify_block_control>` section explicitly warned this exact vacuous-pass shape was possible for the negative assertions and required a non-vacuity guard.
- **Fix:** added `expect(diagStep).toBeDefined()` before the negative regex assertions, matching the guard pattern the file's own pre-existing `ORDERING INVARIANT` test already uses for `-1 < 0`.
- **Files modified:** `src/backend/__tests__/releaseWorkflow.test.ts`
- **Commit:** `f17d46cff`
- **Verification:** re-ran the falsification check after the fix — all 8 new tests (not 7) now go red against the reverted workflow, and all 93 pass again once the workflow is restored.

None else — plan executed as written otherwise.

## Final Measurements

- `npx jest --config src/backend/jest.config.js src/backend/__tests__/releaseWorkflow.test.ts` → **93 passed**, 0 failed (baseline was 85; +8 new).
- `node meta/lintScoped.cjs --tests` → **638 problems (0 errors, 638 warnings)**, `tests: PASS` — exactly at the measured baseline ceiling (638), zero headroom consumed, zero exceeded.
- `node meta/lintScoped.cjs --src` → **1107 problems**, `production: PASS` — unchanged from baseline (no `src/` production code touched).
- `npx tsc --noEmit` → clean.
- `npx prettier --check .github/workflows/release-tauri.yml src/backend/__tests__/releaseWorkflow.test.ts` → both files clean (prettier's own `--write` pass was needed once mid-task on the test file to normalize line-wrapping in the new block; verified clean afterward).
- `pnpm planning-gates` → 12/12 passed.
- **Falsification-check result:** PASS. `git checkout 77f3b4388 -- .github/workflows/release-tauri.yml` (revert only the workflow) turned all 8 new tests red (`7 failed` before the follow-up fix, `8 failed` after); `git checkout HEAD -- .github/workflows/release-tauri.yml` restored all 93 tests to green.

## Header Comment Wording (build/notarization conflation, verbatim)

> Stated plainly rather than implied: a step-level timeout-minutes on
> tauri-action CONFLATES build time with notarization time. It is a blunt
> bound over the whole bundle+sign+notarize step, not a notarization-specific
> one -- tauri-bundler hardcodes --wait on its own `xcrun notarytool submit`
> call and exposes neither a timeout flag nor an environment variable for it
> (see this task's locked decisions for the upstream PRs checked). Accepting
> that conflation is a deliberate tradeoff forced by that gap, not an
> oversight.

## Known Stubs

None — this task adds a bounded step-timeout and a diagnostic-only shell step, no data paths or UI surfaces involved.

## Threat Flags

None — the diagnostic step introduces no new network endpoint, auth path, or schema change. It invokes `xcrun notarytool history` (read-only Apple API query) using credentials already ambient in the job's environment via an existing, unmodified gate step; it never defines its own `env:` map for those credentials (preserving the GAP-A invariant) and never echoes them to the log.

## Self-Check: PASSED

- `FOUND: .github/workflows/release-tauri.yml` (modified, contains `timeout-minutes: 60` and `notarytool history`)
- `FOUND: src/backend/__tests__/releaseWorkflow.test.ts` (modified, 93 tests)
- `FOUND: f83b237cc` (git log)
- `FOUND: dad059ef2` (git log)
- `FOUND: f17d46cff` (git log)
