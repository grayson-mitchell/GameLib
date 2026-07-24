---
phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update
plan: 15
subsystem: infra
tags: [github-actions, tauri, ci-cd, windows-signing, release-pipeline, gap-closure]

# Dependency graph
requires:
  - phase: 34 (plans 34-01..34-12)
    provides: release-tauri.yml scaffold, renderer/asset build steps, Windows cert import/cleanup (34-11), sidecar_triple wiring
provides:
  - "release-tauri.yml Windows signing gate that requires BOTH WINDOWS_CERTIFICATE and WINDOWS_CERT_THUMBPRINT before activating, restoring D-04's graceful-skip invariant for every secret combination"
  - "warn-and-skip elif branch for a half-configured Windows secret set (cert present, thumbprint absent) that ships unsigned with an ::warning:: and keeps the job green"
  - "narrower cert-import if: condition (adds env.WINDOWS_CERT_THUMBPRINT != '') so cert.pfx is never written to the runner filesystem for an unusable cert"
  - "delimiter-safe args output via a $RANDOM-randomised heredoc, closing the secret-derived $GITHUB_OUTPUT injection point (WR-03 secondary defect)"
  - "9 new regression tests in releaseWorkflow.test.ts guarding all of the above against reintroduction"
affects: ["34-07 live tag-push gate (Windows leg no longer hard-fails on a half-enrolled secret set)"]

# Tech tracking
tech-stack:
  added: []
  patterns: ["comment-stripped source assertions (loadStrippedReleaseWorkflow) for grep/toContain checks that could otherwise be satisfied by the file's own header/step prose"]

key-files:
  created: []
  modified:
    - .github/workflows/release-tauri.yml
    - src/backend/__tests__/releaseWorkflow.test.ts

key-decisions:
  - "Rewrote Task 1's Test 4 from the plan's literal 'comment-stripped workflow contains no exit 1 anywhere' phrasing to an elif-scoped assertion (elif...WINDOWS_CERT_THUMBPRINT...fi contains no exit 1). The literal phrasing was already true pre-fix (the file has never contained the string 'exit 1'), so it would have been GREEN before AND after -- not RED as the plan's acceptance criteria required ('exactly 7 failing tests'). Anchoring the assertion to the elif branch's existence makes it genuinely fail pre-fix (branch doesn't exist yet) and pass post-fix, while still testing the same D-04 invariant. Task 2's acceptance criteria (whole-file 'exit 1' grep == 0) is honored literally in the implementation regardless."
  - "Used ARGS_${RANDOM}${RANDOM}${RANDOM} (three concatenated $RANDOM expansions with a fixed prefix) for the heredoc delimiter rather than a single $RANDOM, to reduce collision risk without introducing openssl/uuidgen, which are unreliable under Git Bash on windows-latest per the plan's interface note."

patterns-established:
  - "Windows signing three-branch gate: if (both secrets) -> sign; elif (cert only) -> ::warning:: + unsigned + job green; else -> unsigned default. No branch calls exit 1."

requirements-completed: [REQ-34-04, REQ-34-06]

# Metrics
duration: ~20min
completed: 2026-07-24
---

# Phase 34 Plan 15: Windows both-secrets signing gate + heredoc-safe output Summary

**Closed GAP-4: the Windows signing override now requires BOTH `WINDOWS_CERTIFICATE` and `WINDOWS_CERT_THUMBPRINT` before activating, warns-and-ships-unsigned on a half-enrolled secret set instead of hard-failing, never writes `cert.pfx` for an unusable cert, and emits the secret-derived `args` step output via a randomised heredoc instead of a single-line `echo`.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-07-24T20:58:00+12:00 (approx, session start)
- **Completed:** 2026-07-24T21:04:00+12:00
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- The `build_args` step's Windows signing branch is now reachable only when both `WINDOWS_CERTIFICATE` and `WINDOWS_CERT_THUMBPRINT` are non-empty, closing the path where an enrolled-cert-only secret set rendered `"certificateThumbprint":""` into the `--config` override and hard-failed the leg via signtool.
- A new `elif` branch handles the cert-only case: emits `::warning::WINDOWS_CERTIFICATE is set but WINDOWS_CERT_THUMBPRINT is missing; shipping unsigned` and falls through to the unsigned args, with no `exit 1` anywhere in the branch — the job stays green per D-04's locked invariant.
- The `Import Windows signing certificate` step's `if:` condition now also requires `env.WINDOWS_CERT_THUMBPRINT != ''`, so `cert.pfx` is never materialised on the runner filesystem when the cert cannot actually be used for signing. 34-11's `try/finally` + `Remove-Item -Force` cleanup is preserved byte-identically.
- The `args` step output is now emitted via a `$RANDOM`-randomised heredoc (`args<<ARGS_$RANDOM$RANDOM$RANDOM` ... value ... delimiter) in all three branches, replacing the single-line `echo "args=..." >> "$GITHUB_OUTPUT"` form that let a newline in a secret inject arbitrary step outputs.
- `releaseWorkflow.test.ts` gained a 9-test regression `describe` block that failed 7/9 against the pre-fix workflow (RED, verbatim below) and now passes 40/40 (GREEN).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write RED tests for the both-secrets gate and delimiter-safe output emission** - `d1ad553e` (test)
2. **Task 2: Require both Windows secrets, warn-and-skip otherwise, emit args via random heredoc** - `0e0d4abd` (feat)

**Plan metadata:** (pending — see final commit below)

## RED Evidence (Task 1, captured verbatim)

`npx jest --testPathPattern=releaseWorkflow` against the pre-fix workflow:

```
Test Suites: 1 failed, 1 total
Tests:       7 failed, 33 passed, 40 total
```

The 7 failing tests (all in the new `release-tauri.yml Windows signing gate requires BOTH secrets (WR-03 / GAP-4 regression guard)` describe block):
```
✕ Test 1: the signing-override branch requires BOTH secrets on the same if line
✕ Test 2: certificateThumbprint is only reachable after the thumbprint check
✕ Test 3: a warn-and-skip middle branch exists naming WINDOWS_CERT_THUMBPRINT
✕ Test 4: the warn-and-skip branch does not fail the job (no exit 1)
✕ Test 5: the cert-import step if: line is gated on the thumbprint too
✕ Test 6: secret-derived args output uses a heredoc, not single-line echo
✕ Test 7: the heredoc delimiter is randomised via $RANDOM
```
Tests 8 and 9 (D-04 invariant guard, 34-11 regression guard) passed both before and after, as designed — they are invariant guards, not part of the RED signal. All 31 pre-existing tests (22 Wave-0 + 9 from 34-12) stayed green throughout.

Confirmed via direct grep against the pre-fix file:
- `grep -c 'WINDOWS_CERT_THUMBPRINT" \]' .github/workflows/release-tauri.yml` → `0`
- `grep -c 'args<<' .github/workflows/release-tauri.yml` → `0`

## GREEN Evidence (Task 2)

- `node -e "require('js-yaml').load(...)"` → `YAML OK`
- `bash -n` on the extracted `build_args` `run:` body → exits 0 (valid bash)
- `npx jest --testPathPattern=releaseWorkflow` → `40 passed, 40 total`
- Cross-plan regression sweep `npx jest --testPathPattern="tauriConf|cargoFeatures|releaseWorkflow|buildSidecarSea|tauriShellSource|electronUntouched"` → `122 passed, 122 total`
- `grep -c 'WINDOWS_CERT_THUMBPRINT" \]'` → `1`
- `grep -c "env.WINDOWS_CERT_THUMBPRINT != ''"` → `1`
- `grep -c 'args<<'` → `1`
- `grep -c 'RANDOM'` → `2`
- `grep -v '^\s*#' .github/workflows/release-tauri.yml | grep -c 'exit 1'` → `0`
- `grep -c 'Remove-Item -Path cert.pfx -Force'` → `1`
- `grep -c 'finally {'` → `1`
- `grep -c 'prerelease: true'` → `1`; `grep -c 'releaseDraft: true'` → `1`
- `grep -c "run: pnpm exec electron-vite build"` → `1`; `grep -c "UNPROVEN LIVE"` → `1`
- `git diff .github/workflows/release-tauri.yml` shows hunks ONLY in the cert-import step's `if:`/comment (`@@ -158,8 +158,15 @@`) and the `build_args` step's comment/`run:` body (`@@ -174,19 +181,48 @@`) — no hunk touches the matrix, job-level `env:`, the three 34-12 build steps, the SEA build step, the two `::warning::Signing skipped` steps, or `tauri-action`.

## Files Created/Modified
- `.github/workflows/release-tauri.yml` - Narrowed the cert-import step's `if:` to require both Windows secrets; restructured `build_args` into a three-branch (sign / warn-and-skip / default) shell that never calls `exit 1`; replaced the single-line `echo "args=..."` output with a `$RANDOM`-randomised heredoc.
- `src/backend/__tests__/releaseWorkflow.test.ts` - Appended a 9-test `describe` block asserting the both-secrets gate, ordering, warn-and-skip branch, no-exit-1 invariant, narrowed cert-import condition, heredoc emission, and `$RANDOM` delimiter; zero existing tests modified (insertions only, confirmed via `git diff | grep -c '^-[^-]'` = 0).

## Decisions Made
- Rewrote Task 1's Test 4 assertion to be elif-scoped rather than the plan's literal "no exit 1 anywhere in the whole file" phrasing, because that literal check was already true before the fix (the file never contained the string) and would not have been RED. See key-decisions above for full rationale. Task 2's whole-file "no exit 1" acceptance criterion is still honored literally in the actual implementation.
- Used a three-`$RANDOM`-expansion delimiter (`ARGS_${RANDOM}${RANDOM}${RANDOM}`) rather than a single `$RANDOM`, for extra collision resistance without adding a tool dependency.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Test correctness] Test 4 rewritten to be genuinely RED against the pre-fix workflow**
- **Found during:** Task 1
- **Issue:** The plan's literal Test 4 wording ("the comment-stripped workflow contains no `exit 1` anywhere") was already satisfied by the pre-fix file (it has never contained the string "exit 1"), so as literally written the test would pass both before and after the fix — contradicting the plan's own acceptance criterion of "exactly 7 failing tests."
- **Fix:** Scoped the assertion to the elif branch itself (`elif[\s\S]*?WINDOWS_CERT_THUMBPRINT[\s\S]*?fi` must exist and must not contain `exit 1`), which genuinely fails pre-fix (the branch doesn't exist) and passes post-fix, while still enforcing the same D-04 no-hard-fail invariant.
- **Files modified:** src/backend/__tests__/releaseWorkflow.test.ts
- **Verification:** `npx jest --testPathPattern=releaseWorkflow` showed exactly 7 failing tests pre-fix (matching the plan's stated count) and 40/40 passing post-fix.
- **Committed in:** d1ad553e (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 test-correctness adjustment, no behavior/scope change)
**Impact on plan:** The underlying D-04 invariant (no hard-fail path) is still fully enforced, both by this elif-scoped unit test and by Task 2's literal whole-file acceptance-criteria grep (`grep -v '^\s*#' ... | grep -c 'exit 1'` → `0`). No scope creep.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required. This plan only modifies a CI workflow file and its accompanying test file; no secrets, dashboards, or environment variables are introduced.

## Next Phase Readiness

- GAP-4, the last of the four gaps from `34-VERIFICATION.md`'s re-verification (gaps_found 6/10), is now closed in code and test-guarded. All four gap-closure plans in this cycle (34-12, 34-13, 34-14, 34-15) are executed.
- This plan does NOT re-run or claim 34-07's deferred live `v*` tag-push gate (REQ-34-04's live half, REQ-34-09) — it remains open and owned by 34-07. This plan is a prerequisite: the Windows leg will no longer hard-fail on a half-configured secret set when that gate is eventually resumed.
- Still explicitly out of scope per user decision GAP-D-01: WR-04 (null CSP / `withGlobalTauri` / broad `opener:default`) and IN-01 (loose `system.pem` match), tracked in `deferred-items.md`.
- No blockers for re-verification of Phase 34 — all four gap plans closed, next step is to re-run `/gsd-verify-work` (or equivalent) against the phase to confirm `34-VERIFICATION.md`'s remaining truths now pass, then resume 34-07's live gate.

---
*Phase: 34-tauri-packaging-windows-and-linux-builds-signing-auto-update*
*Completed: 2026-07-24*

## Self-Check: PASSED

- FOUND: .github/workflows/release-tauri.yml
- FOUND: src/backend/__tests__/releaseWorkflow.test.ts
- FOUND commit: d1ad553e (Task 1)
- FOUND commit: 0e0d4abd (Task 2)
