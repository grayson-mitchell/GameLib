---
phase: quick-260929-okd
plan: 260929-okd
subsystem: backend
tags: [logout, store-manager, nile, legendary, cli-abort, sidecar-exit-contract]

requires:
  - phase: 39
    provides: "CR-01 -- login-window seam acquired inside each wipe step (never hoisted above the loop)"
  - phase: 35
    provides: "T-35-39 -- clearEpicCookies is the one fatal wipe step, rethrown after credential cleanup"
provides:
  - "NileUser.logout(): credential-side cleanup (configStore.delete('userData') + clearCache('nile')) now runs unconditionally with respect to the CLI logout call's reported res.abort outcome"
  - "LegendaryUser.logout(): credential-side cleanup (configStore.delete('userInfo') + clearCache('legendary')) now runs unconditionally with respect to res.error and res.abort; the existing fatal rethrow (T-35-39) is gated on !res.abort so an aborted app-quit path never rejects"
affects: [gog, humble, nile, legendary, sidecar-exit-contract]

actuals:
  tokens: 2653
  tasks: 3
  commits: 2

tech-stack:
  added: []
  patterns:
    - "Guard-removal + comment-widening: an early-exit guard on a CLI outcome is deleted rather than inverted, and the existing 'unconditional' comment claim is widened to state a new true fact (CR-03) as a consequence of the guard's removal, not as a correction of a prior false claim"
    - "Fatal-rethrow gating: a rethrow derived from a captured fatalWipeFailure is gated on !res.abort so the sidecar's stdin-drain exit contract is preserved -- no rejection reaches a torn-down renderer on app-quit"

key-files:
  created: []
  modified:
    - src/backend/storeManagers/nile/user.ts
    - src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts
    - src/backend/storeManagers/legendary/user.ts
    - src/backend/storeManagers/legendary/__tests__/user.test.ts

key-decisions:
  - "res.error can now reach the fatal-step rethrow on Legendary (it could not before, since the old guard returned early on error too); res.abort deliberately never does -- gated by the new `!res.abort` condition on the fatalWipeFailure rethrow"
  - "The two originally-passing tests that asserted 'cleanup does NOT run on abort' were inverted (flipped to assert cleanup DOES run), not deleted or 'fixed' -- they were testing the old, now-defective behavior by design, and Phase 40 CR-03 requires the opposite assertion"
  - "The stale `:652-653` line-number citation in the Legendary CR-01 comment was replaced with a symbolic reference (naming the actual statements, matching the style already used at :167) rather than a renumbered line reference, because removing the abort-guard's `return` shifted every line below it -- a hardcoded number would just go stale again at the next edit"

patterns-established:
  - "Sidecar exit contract applied to rejection gating: a rethrow reachable from an abort path must be suppressed, not just made async-safe -- the renderer observing it is being torn down, so an unobserved rejection is noise, not a signal, during app-quit"

requirements-completed: []

# Legacy prose-only summary -- no coverage: block. Deliverables are the ## Accomplishments
# bullets below, and their verification is the RED/GREEN control tables in this document.

duration: ~55min
completed: 2026-09-28
status: complete
---

# Quick Task 260929-okd: Close Phase 40 CR-03 in Nile and Legendary logout() Summary

**Made credential-side cleanup in `NileUser.logout()` and `LegendaryUser.logout()` unconditional with respect to the CLI logout call's reported outcome (`res.abort` / `res.error`), so an aborted or errored logout can never leave `userData`/`userInfo` and a shared cookie jar behind a UI that reports signed out -- while preserving Phase 39 CR-01 (seam acquired inside each wipe step) and Phase 35 T-35-39 (the one fatal wipe step still rejects on non-abort failure).**

## Performance

- **Duration:** ~55 min
- **Tasks:** 3/3 completed
- **Files modified:** 4 source/test files (2 store managers, 2 test files) + 1 planning artifact (`BASE.sha`)
- **Commits:** 2 (Task 1: Nile, Task 2: Legendary). Task 3 was verification-only -- no source changes, nothing to commit.

## Accomplishments

- `NileUser.logout()`: removed the early `return` inside the `if (res.abort)` guard. `logError` still fires (message reworded to state credential-side cleanup still ran), but execution now falls through to `configStore.delete('userData')` and `clearCache('nile')` unconditionally.
- `LegendaryUser.logout()`: removed the early `return` inside the `if (res.error || res.abort)` guard (message unchanged). Execution now falls through to the wipe-steps loop and credential cleanup regardless of CLI outcome.
- `LegendaryUser.logout()`: the existing fatal-rethrow (`if (fatalWipeFailure !== null) throw fatalWipeFailure`, T-35-39) is now gated `if (fatalWipeFailure !== null && !res.abort)`. A non-abort fatal `clearEpicCookies` failure still rejects, exactly as before; an abort-path fatal failure now resolves, because the sidecar's stdin-drain exit contract means nothing should reject toward a renderer that is being torn down.
- Phase 39 CR-01 (seam acquired inside each wipe step, never hoisted) and Phase 35 T-35-39 (non-abort `clearEpicCookies` failure still rejects) are both untouched and both still pinned by their original tests, which pass unmodified.
- One test inverted per file (Nile) to assert the new, correct behavior instead of the old defective one; two new tests added (Legendary) to cover the abort-resolves-with-cleanup and abort-with-fatal-rejection-still-resolves cases; one existing test inverted (Legendary, the CLI-error case).
- Authorized bounded deviation applied: the stale `:652-653` line-number citation in Legendary's CR-01 comment (actual cleanup lines had shifted to `:666-667` after the guard's `return` was removed) was replaced with a symbol-based reference, matching the existing style at `:167`, instead of a renumbered line reference that would just go stale again at the next edit.

## Task Commits

1. **Task 1: Nile -- remove abort early-exit guard, invert one test** -- `fc16a722d` (fix)
2. **Task 2: Legendary -- remove error/abort early-exit guard, gate fatal rethrow on `!res.abort`, invert one test + add two new tests** -- `ac27dc4c6` (fix)
3. **Task 3: whole-repo gate battery** -- no commit (verification-only, no source changes)

Both commits end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` per this task's explicit attribution override -- verified via `git log -1 --format=%B` after each commit.

**Plan metadata:** not committed by this executor. Per this task's explicit constraints, PLAN.md/SUMMARY.md/STATE.md are left uncommitted for the orchestrator to commit, and ROADMAP.md is not updated by this executor.

## RED/GREEN Control (measured, not narrated)

All RED runs were executed against `BASE.sha` = `9f4e5a38ef353fdc7abb8af2cfed1d9b0aa6e660` (pre-existing tests, pre-fix source) by checking out the new/inverted test file content onto the base source. All GREEN runs were executed against the final HEAD after both task commits.

### Task 1 -- Nile

**RED (expected failure against base source):** 1 failed / 8 passed / 9 total.
- Failing test: `NileUser.logout() credential cleanup runs first and unconditionally (D-15) > still clears credentials and still attempts the cookie clear when runRunnerCommand reports an abort`
- This is the correct RED signature: the inverted assertion (cleanup runs on abort) fails against the un-fixed guard-returns-early source, proving the test is not vacuous.

**GREEN (after fix):** 9 passed / 9 total, exit 0. Suite count unchanged (9 -> 9), as specified.

### Task 2 -- Legendary

**RED (expected failure against base source):** 3 failed / 11 passed / 14 total.
- Failing tests:
  1. `LegendaryUser.logout() > REQ-34.5-04 / CR-03: a CLI-error result still runs the wipe steps and still clears credentials`
  2. `LegendaryUser.logout() > CR-03: a CLI-abort result still runs the wipe steps and still clears credentials`
  3. `LegendaryUser.logout() > CR-03: on abort, a rejecting (fatal) clearEpicCookies still resolves logout() and still clears credentials`
- The pre-existing CR-01 pin test (`CR-01 (T-34.5-19): with NO seam installed...`) and the F-6 twin test were both green throughout -- confirmed NOT among the RED failures, proving they were untouched by this change.
- This is the correct RED signature: all three CR-03 assertions fail against the un-fixed guard-returns-early source (the inverted test and both new tests), proving none are vacuous.

**GREEN (after fix):** 14 passed / 14 total, exit 0. Suite count: 12 -> 14 (one inverted, two new), as specified.

### Combined (Nile + Legendary + GOG, unmodified)

**GREEN:** 31 passed / 31 total (nile 9 + legendary 14 + gog 8), exit 0. GOG suite count unchanged (8 -> 8) -- GOG's `logout()` has no CLI round-trip / no abort branch and was not touched.

## Task 3 -- Whole-Repo Gate Battery (measured results)

| Gate | Result |
|---|---|
| Backend jest (full project) | 221/221 suites passed, 5088 passed / 3 skipped / 5091 total tests, exit 0 |
| meta jest (full project) | 45 passed + 1 failed = 46 suites total; 1337 passed / 1 skipped / 1 failed = 1339 total tests, exit 1 -- the single failure is `meta/__tests__/genI18nGateScope.test.ts`'s A-17 ANTI-ROT check, proven pre-existing and unrelated to this task (see "Deferred / Out-of-Scope Finding" below) |
| `pnpm codecheck` (tsc, both configs) | exit 0, PASS (run as part of codecheck; `tsc` invoked twice across the two tsconfig targets, both exit 0) |
| `pnpm lint` -- src ceiling | 1107 / 1124 (SRC_CEILING), PASS |
| `pnpm lint` -- tests ceiling | 638 / 638 (TESTS_CEILING, zero headroom), PASS |
| `npx prettier --check` (all 4 written `.ts` paths, verified non-vacuous via `--file-info`) | all 4 report `{ "ignored": false, "inferredParser": "typescript" }`; `--check` reports "All matched files use Prettier code style!", exit 0 -- a real (non-vacuous) pass |
| `graphify update .` | exit 0; rebuilt 50012 nodes / 56986 edges / 4322 communities |
| `pnpm planning-gates` | 12/12 PASS |

**meta project total is honestly reported as 1 failed, not silently rounded to 0.** The Backend project (the project whose scope this task's source changes actually touch) is 0 failed / 5091 total.

## Deviations from Plan

### Auto-fixed Issues

None -- both source edits (removing the early-exit guards, gating the fatal rethrow) were made exactly as specified in the plan's `<action>` blocks. No Rule 1/2/3 auto-fixes were required beyond what the plan itself specified.

### Authorized Bounded Deviation

**1. [Authorized, comment-only] Replaced stale `:652-653` line reference with a symbolic reference in `legendary/user.ts`'s CR-01 comment**
- **Found during:** Task 2, while editing the guard and verifying the CR-01 comment block still made sense post-edit.
- **Issue:** The CR-01 comment cited `cleanup at :652-653`, but removing the abort-guard's `return` shifted every subsequent line, so the cited line numbers no longer pointed at the credential-cleanup statements they described.
- **Fix:** Replaced the hardcoded line-number citation with a symbolic reference naming the actual statements (`configStore.delete('userInfo')` / `clearCache('legendary')` below), matching the existing symbolic-reference style already used at `:167` in the same file, rather than simply renumbering to the new line (which would go stale again at the next edit).
- **Files modified:** `src/backend/storeManagers/legendary/user.ts`
- **Commit:** `ac27dc4c6`
- **Authorization:** this deviation was pre-authorized in this task's invocation as a single bounded, comment-only fix -- not a self-directed Rule 1/2/3 discovery.

### Deferred / Out-of-Scope Finding (not fixed, logged instead)

**`meta/__tests__/genI18nGateScope.test.ts` -- A-17 ANTI-ROT failure, pre-existing and unrelated.**

The committed `meta/i18nForkTouchedFiles.json` snapshot has drifted from the live git-diff-derived file list under `src/frontend` (at minimum `diskSpaceLabels.ts` and `steamLibraryVisibility.ts` differ). This task's changes are backend-only (`src/backend/storeManagers/{nile,legendary}/**`) and touch zero files under `src/frontend`.

**Proof of pre-existence (measured, not asserted):** `git diff --name-status b5b5cad3fa2e822602d320b70788d87240fc056e <ref> -- src/frontend` was run against both `BASE.sha` and the post-Task-2 HEAD and produced byte-identical 498-line output in both cases. The scope this ratchet measures did not move because of this task; the drift predates it entirely.

Per the SCOPE BOUNDARY rule, this was not fixed. It is logged in:
- `.planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/deferred-items.md` (full detail + measurement)
- `.planning/WINDOWS.md` (entry id 1, kind `deviation`, status `open`) via `gsd_run windows append`

**Suggested follow-up:** a separate quick task (or the next phase touching `src/frontend`) should regenerate `meta/i18nForkTouchedFiles.json` via `meta/genI18nGateScope.ts` and commit the refresh.

### Environment Tooling Gotchas Discovered (recorded for honesty, not source deviations)

**1. zsh unbraced `$VAR:path` parameter-expansion collision.** `git show "$BASE:src/backend/.../user.ts"` failed with an "ambiguous argument" error whose garbled revision string showed zsh had interpreted the unbraced `$BASE:literal` as a history-style `:s/pattern/replacement/` modifier, mangling the intended concatenation. Fixed for all subsequent invocations by always bracing: `"${BASE}:src/backend/.../user.ts"`.

**2. jest `--projects <path>` argument greediness.** `npx jest --projects src/backend <test-file-path>` failed by treating the trailing positional test-path as an additional (invalid) project config path, erroring on TypeScript-config parsing. Fixed by inserting a `--` separator: `npx jest --projects src/backend -- <test-file-path>`. Applied consistently to both RED-control and GREEN-check invocations in Tasks 1 and 2.

Neither gotcha caused any source-code or test-assertion changes; both were shell/CLI invocation issues in this local environment, not defects in the plan or the code under test.

## Non-Guarantees (from the plan's `<objective>`, still true after this fix)

- A remote session on the store's servers may still be valid after an aborted/errored logout -- this fix addresses local credential/cookie-jar state only, not remote session revocation.
- Cookie-side cleanup (`clearCookies()` inside each wipe step) remains best-effort during an app-quit abort; only the fatal step's rethrow is gated -- non-fatal wipe-step failures were already swallowed before this change and still are.
- The renderer still cannot distinguish an aborted logout from a clean one at the UI layer -- this fix makes the credential state correct regardless of what the CLI reported, but does not add new signal to the UI about which outcome occurred.

## Deliberate Decisions (prose)

1. **`res.error` can now reach the fatal-step rethrow on Legendary; it could not before.** The old guard returned early on `res.error || res.abort`, so a `clearEpicCookies` failure downstream of a CLI error was unreachable. With the guard's `return` removed, an `res.error` CLI outcome now falls through to the wipe-steps loop, and if `clearEpicCookies` is the step that fails, the existing (unmodified) T-35-39 rethrow logic still applies -- because the new gate is `!res.abort`, not `!res.error && !res.abort`.
2. **`res.abort` deliberately never rejects, by design of the new gate.** `if (fatalWipeFailure !== null && !res.abort) throw fatalWipeFailure` means an abort-path fatal failure resolves instead of rejecting. This is intentional: the sidecar's stdin-drain exit contract means the renderer that would observe a rejection is being torn down during app-quit, so rejecting would be unobservable noise, not a signal to anyone.
3. **The two inverted tests were FLIPPED to match the new spec, not "fixed" as if they'd been buggy.** Both were correctly testing the old (now-defective) behavior at the time they were written. Phase 40 CR-03 requires the opposite assertion, so both tests were rewritten to assert cleanup-runs-on-abort/error instead of cleanup-skipped-on-abort/error, with an explanatory comment recording why in each test body, per this task's non-negotiable requirement.

## Non-Negotiables Preserved (verified, not assumed)

- **T-35-39 preserved:** a non-abort `clearEpicCookies` (fatal-step) failure still rejects `LegendaryUser.logout()` -- unchanged rethrow logic, only gated by the new `!res.abort` condition which is `true` in the non-abort case. Confirmed by the pre-existing F-6 twin test passing unmodified.
- **`res.abort` never rejects:** confirmed by the new "on abort, a rejecting (fatal) clearEpicCookies still resolves logout()" test.
- **Phase 39 CR-01 preserved:** the login-window seam is still acquired inside each wipe step, never hoisted above the loop -- zero changes to the wipe-steps loop or seam-acquisition call sites. Confirmed by the pre-existing CR-01 pin test passing unmodified.
- **"Unconditionally" wording is not the defect:** both source comments were reworded to state the widened claim as a *consequence* of the guard's removal (the cleanup is now unconditional with respect to CLI outcome, in addition to the cookie-side steps it already described), not as a correction of a previously false claim.
- **No new libuv-counted handle on the sidecar exit path:** neither edit adds a timer, watcher, or wait -- both are pure control-flow changes (removing an early `return`, adding a boolean condition to an existing `if`).
- **Both inverted tests record WHY in their bodies:** verified present in both `nile/__tests__/logoutCookies.test.ts` and `legendary/__tests__/user.test.ts`.
- **Formatter is real, not vacuous, on all 4 `.ts` paths:** confirmed via `--file-info` reporting `{ "ignored": false, "inferredParser": "typescript" }` for all four before running `--check`.
- **Zero-headroom lint ceilings both PASS:** src 1107/1124 (has headroom, not exactly at ceiling), tests 638/638 (exactly at ceiling, zero headroom) -- both PASS.

## Known Stubs

None.

## Threat Flags

None -- no new network endpoints, auth paths, file access patterns, or schema changes at trust boundaries were introduced. Both edits are control-flow changes to existing, already-threat-modeled logout paths.

## Self-Check: PASSED

- `src/backend/storeManagers/nile/user.ts` -- FOUND
- `src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts` -- FOUND
- `src/backend/storeManagers/legendary/user.ts` -- FOUND
- `src/backend/storeManagers/legendary/__tests__/user.test.ts` -- FOUND
- `.planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/BASE.sha` -- FOUND
- `.planning/quick/260929-okd-fix-phase-40-cr-03-across-the-nile-and-l/deferred-items.md` -- FOUND
- Commit `fc16a722d` -- FOUND in `git log --oneline --all`
- Commit `ac27dc4c6` -- FOUND in `git log --oneline --all`
