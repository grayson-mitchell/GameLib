---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 16
subsystem: infra
tags: [github-actions, tauri-action, codesigning, macos, ci, bash, gap-closure]

# Dependency graph
requires:
  - phase: 34 (gap cycle 2)
    provides: release-tauri.yml with 34-12..34-15 fixes (renderer build, Windows SEA spawn, updater feed, Windows signing gate) already landed and green
provides:
  - Apple signing/notarization env vars (APPLE_CERTIFICATE, APPLE_CERTIFICATE_PASSWORD, APPLE_SIGNING_IDENTITY, APPLE_ID, APPLE_PASSWORD, APPLE_TEAM_ID) are genuinely UNSET in the tauri-action step's environment when their secrets are absent, restoring D-04's "skip, warn, ship unsigned, job green" default on macOS
  - readGithubEnv() shared test helper (src/backend/__tests__/helpers/workflowSteps.ts) for parsing $GITHUB_ENV heredoc/plain-assignment content in any future workflow test
affects: [34-07 live tag-push gate (this fix removes GAP-A as a blocker), 34-17, 34-18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Executed-path workflow testing: extract a step's literal run: | body via extractRunBlock, execute it with runStepScript against a synthetic $GITHUB_ENV/$GITHUB_OUTPUT file, then assert on the RESOLVED file content -- never on source-text/comment-shape alone."
    - "GitHub secrets-in-if unavailable: when a step needs to gate behavior on a secret but if: cannot read the secrets context, map the secret onto a step-level IN_-prefixed env var and branch inside the shell body instead of the job-level env: map."

key-files:
  created: []
  modified:
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts
    - src/backend/__tests__/helpers/workflowSteps.ts

key-decisions:
  - "Kept the six real APPLE_* names for $GITHUB_ENV output but received the secrets under IN_APPLE_*-prefixed step-level env inputs, so a defined-but-empty input can never leak into a later step under its real name -- the exact defect class this gap fixes."
  - "SIGNING_ENABLED=0 initialized at top of the gate script to avoid an unset-variable read failing under GitHub's `-eo pipefail` bash invocation."
  - "Reused the WR-03 $RANDOM-delimited heredoc pattern for write_env() instead of a second private heredoc-writer, keeping the injection-safety mechanism consistent across the workflow."

requirements-completed: [REQ-34-04, REQ-34-09]

# Metrics
duration: 25min
completed: 2026-07-24
---

# Phase 34 Plan 16: Apple signing env-gate GAP-A closure Summary

**Replaced the always-defined job-level `APPLE_CERTIFICATE` env mapping with a shell-gated step that only writes signing/notarization vars to `$GITHUB_ENV` when a complete secret set is enrolled, proven by tests that execute the real step body and read the resulting file.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-07-24T10:53:31Z
- **Completed:** 2026-07-24T11:18:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Closed GAP-A: macOS legs can no longer enter `security import` with an empty-but-defined `APPLE_CERTIFICATE`, because the six APPLE_* secrets are no longer job-level env vars at all.
- Added 8 executed-path regression tests (Tests A-H) that read resolved `$GITHUB_ENV` file content instead of asserting on warning-string shape -- the exact defect class that let the original bug ship green.
- Added a shared `readGithubEnv()` helper so future workflow tests never need a private heredoc parser (WR-04 precedent).
- Preserved the D-04 warning string verbatim, the partial-set warn-and-skip behavior, and the never-notarize-unsigned invariant, all now behavior-proven rather than text-proven.

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace the decorative Apple warning assertions with executed-path env-gate tests (RED)** - `9924b57c` (test)
2. **Task 2: Gate the Apple signing/notarization env vars so they are unset, not empty (GREEN)** - `fb98bf9d` (fix)

**Plan metadata:** (this commit, immediately following)

## RED Evidence (Task 1, mandatory per plan)

Verify command: `pnpm exec jest --selectProjects Backend --testPathPattern releaseWorkflow`

Verbatim list of failing tests against the unmodified workflow (8 failed, 65 passed, 73 total):

```
✕ Test A (the live failure): all Apple secrets empty -> nothing exported, warned
✕ Test B: full signing trio exports exactly those three, nothing else
✕ Test C (partial set, D-04): cert set but password empty -> warn, ship unsigned
✕ Test D (partial set): cert + password set, identity empty -> warn, ship unsigned
✕ Test E (notarization): full signing trio + full notarization trio -> all six exported
✕ Test F (never notarize an unsigned bundle): notarization trio set but no cert -> nothing exported
✕ Test G (injection, mirrors WR-03): a newline-bearing identity cannot inject an extra GITHUB_ENV key
✕ Test H: the job-level env: block defines no APPLE_ key
```

Tests A-G failed with `workflow has no step named "Enable Apple signing only when a complete cert secret set is enrolled"` (the expected RED signal per the plan -- `extractRunBlock` throws until Task 2 lands). Test H failed on a genuine `.not.toMatch(/APPLE_/)` assertion against the still-present six-key job-level `env:` block, confirming the assertion is not vacuous before proceeding to Task 2.

After Task 2: all 73 tests green (65 pre-existing + 8 new), including Tests A-H.

## Files Created/Modified
- `.github/workflows/release-tauri.yml` - Removed six APPLE_* job-level env entries; replaced `Warn if macOS signing will be skipped` with `Enable Apple signing only when a complete cert secret set is enrolled` (shell-gated $GITHUB_ENV writer with a write_env() $RANDOM-heredoc helper, three-branch signing gate, two-branch notarization gate, no exit 1 anywhere); updated the step comment and the file's top-of-file D-03/D-04 header paragraph to record the live-run evidence.
- `src/backend/__tests__/releaseWorkflow.test.ts` - Deleted the two decorative APPLE_CERTIFICATE assertions (per-OS warning test, half of Test 8); added the `Apple signing env gate, executed (GAP-A regression guard)` describe block (Tests A-G, executed via `runStepScript`+`readGithubEnv`) and a standalone `Test H` describe block (static job-env text guard).
- `src/backend/__tests__/helpers/workflowSteps.ts` - Added `readGithubEnv(filePath): Record<string,string>` as a new shared export, parsing the `NAME<<DELIM`/`NAME=VALUE` `$GITHUB_ENV` protocol; throws on an unterminated heredoc per the module's fail-loud convention.

## Decisions Made
See `key-decisions` in frontmatter above.

## Deviations from Plan

None - plan executed exactly as written. Task 1 was RED-first per the plan's mandate (verbatim failing-test list recorded above, including the required Test H genuine-failure check before proceeding to Task 2). Task 2's shell structure, IN_-prefix naming, write_env() heredoc mechanism, and header-comment updates all match the plan's `<action>` spec.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. This plan does not enroll any Apple signing secrets; it only changes how the workflow behaves when they are absent or partially present.

## Next Phase Readiness

GAP-A is closed in code with executed-test proof. Plans 34-17 and 34-18 (this gap cycle's other two plans) can proceed independently -- this plan's `files_modified` (`.github/workflows/release-tauri.yml`, `src/backend/__tests__/releaseWorkflow.test.ts`, `src/backend/__tests__/helpers/workflowSteps.ts`) should be checked against 34-17/34-18's `files_modified` for overlap before assuming a parallel wave is safe.

This fix, together with the rest of gap cycle 3 (34-17, 34-18), removes one more concrete blocker on 34-07's deferred live `v*` tag-push gate. The live gate itself has not been re-run as part of this plan -- REQ-34-09 remains unchecked pending that live proof.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: .planning/phases/34-tauri-packaging-windows-and-linux-builds-signing-auto-update/34-16-SUMMARY.md
- FOUND: 9924b57c (Task 1 commit)
- FOUND: fb98bf9d (Task 2 commit)
