---
phase: quick-260818-s5l
plan: 01
subsystem: testing
tags: [eslint, typescript-eslint, lint-debt, jest, ci]

# Dependency graph
requires: []
provides:
  - "Zero eslint errors (severity 2) across the whole repo -- CI's lint job (.github/workflows/lint.yml) now passes"
  - "All stale `no-var-requires` suppressions retargeted to the live `no-require-imports` rule name, with justification prose preserved"
affects: [lint-debt, ci-gates]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "For jest.requireMock()/requireActual() sites whose generic default is `any`, put the target type on the variable/destructure declaration instead of an `as` cast -- TypeScript's contextual generic inference gives the same narrowed type without an assertion node for eslint to flag, and deleting the assertion outright (autofix's default behavior) silently widens the value to `any` and spawns new no-unsafe-* warnings downstream."
    - "eslint-disable-next-line only covers the single line immediately following it -- when a multi-line justification comment sits between the directive and the code, put ALL prose comment lines BEFORE the directive, with the directive as the last comment line immediately preceding the code."

key-files:
  created: []
  modified:
    - meta/buildSidecarSea.ts
    - meta/lintTranslations.ts
    - meta/sidecarSeaFsShim.ts
    - meta/__tests__/i18nParserConfig.test.ts
    - meta/__tests__/preserveRunnerSymlinks.test.ts
    - meta/__tests__/downloadHelperBinaries.test.ts
    - src/backend/__tests__/longRunningChannels.test.ts
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/crossover_index/__tests__/index.test.ts
    - src/backend/downloadmanager/downloadqueue.ts
    - src/backend/humble/dedup.ts
    - src/backend/jest.setupContainment.ts
    - src/backend/sidecar/electronStub.ts
    - src/backend/sidecar/handlers.ts
    - src/backend/sidecar/humbleFlowRegistration.ts
    - src/backend/sidecar/steamFlowRegistration.ts
    - src/backend/sidecar/storeWriteHandlers.ts
    - src/backend/sidecar/__tests__/appRootResolution.test.ts
    - src/backend/sidecar/__tests__/appShellFlows.test.ts
    - src/backend/sidecar/__tests__/bootstrap.test.ts
    - src/backend/sidecar/__tests__/bootstrapWirings.test.ts
    - src/backend/sidecar/__tests__/devSecretVault.test.ts
    - src/backend/sidecar/__tests__/humbleFlows.test.ts
    - src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts
    - src/backend/sidecar/__tests__/oauthLoginCapture.test.ts
    - src/backend/sidecar/__tests__/runnerMiscFlows.test.ts
    - src/backend/sidecar/__tests__/steamFlows.test.ts
    - src/backend/storeManagers/gog/redist.ts
    - src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts
    - src/preload/__tests__/framelessRuntime.test.ts

key-decisions:
  - "typescript-eslint v8.34.1 deprecated @typescript-eslint/no-var-requires in favor of no-require-imports; this repo's eslint.config.mjs enables only the live rule, so every eslint-disable comment still naming the old rule suppressed nothing -- confirmed empirically with --report-unused-disable-directives before touching anything."
  - "Where a plain assertion delete would widen a jest.requireMock()/requireActual() call's inferred type to `any` (12 of 21 no-unnecessary-type-assertion sites), moved the type annotation onto the declaration instead of deleting outright -- verified per-site against a saved baseline copy that the post-fix warning count for that file exactly matched the pre-fix baseline."
  - "lzmaNativeBinding.test.ts's two jest.spyOn(require('node:fs'), ...) sites could NOT convert to a static `import * as nodeFs` (plan's preferred outcome) -- spying on the ESM namespace binding throws \"Cannot redefine property\" under this repo's ts-jest CJS transform, confirmed by running the suite. Fell back to the suppression path exactly as the plan anticipated."
  - "Retargeted 4 additional stale no-var-requires references OUTSIDE the plan's enumerated 26-file list (downloadHelperBinaries.test.ts, jest.setupContainment.ts, loggerCallSiteGuard.test.ts, bootstrapWirings.test.ts) -- required by Task 2's own <done> criterion (\"zero remaining references... anywhere in meta/ or src/\") and the plan's top-level verification's repo-wide grep. Three were fully dead (didn't cover an actual require() call at all) and were deleted outright; one was doc-prose-only and was updated for consistency."
  - "REQ-34.4.2-10's CARGO_TOML_PATH constant in tauriShellSource.test.ts was genuinely dead (no reader anywhere in the file) -- deleted per the plan's branch instruction. The objc2-web-kit feature-array coverage it once provided appears to have migrated into cargoFeatures.test.ts's broader Cargo.lock feature-list snapshot instead, though that snapshot doesn't carry the REQ-34.4.2-10 tag explicitly -- flagged as a finding, not silently dropped."

patterns-established:
  - "For type-only assertions on generic-default-any jest APIs: annotate the declaration, don't cast the call."
  - "Multi-line eslint-disable justification comments: prose first, directive last (immediately above the code line it targets)."

requirements-completed: [LINT-DEBT-01]

# Metrics
duration: 42min
completed: 2026-08-18
---

# Quick Task 260818-s5l: Fix the 55 ESLint Errors Summary

**Cleared all 55 eslint errors (0 remaining) across 30 files with real fixes -- no new suppressions where an ES import or declaration-level type annotation would work, zero production runtime behaviour changed, and the CI-only `pnpm lint` gate now passes independently of `pnpm codecheck`.**

## Performance

- **Duration:** 42 min
- **Started:** 2026-08-18T20:25:00+12:00 (approx.)
- **Completed:** 2026-08-18T21:07:06+12:00
- **Tasks:** 3
- **Files modified:** 30 (26 from the plan's enumerated list + 4 additional stale-suppression sites required by Task 2's own done criterion)

## Accomplishments

- All 55 eslint errors (severity 2) cleared: 21 `no-unnecessary-type-assertion`, 7 `no-unused-vars`, 3 `no-redundant-type-constituents`, 22 `no-require-imports`, 1 `no-implied-eval`, 1 `no-this-alias` -- down to 0.
- Diagnosed and documented the root cause behind two-thirds of the errors: typescript-eslint v8 deprecated `no-var-requires` in favor of `no-require-imports`, and this repo's config only enables the live rule, so every stale suppression naming the old rule was a silent no-op.
- Discovered and fixed a real hazard in the plan's own literal instruction: blank-deleting `jest.requireMock(...) as {...}` assertions (as a bare `--fix` would) widens the inferred type to `any` and spawns new `no-unsafe-*` warnings downstream for every one of the 12 affected sites -- would have violated the "warning count unchanged" success criterion. Fixed via declaration-level type annotations instead, verified per-site against saved baselines.
- `pnpm lint`: 0 errors, 3864 warnings (down from 3881 baseline, fully accounted for -- see Deviations).
- `pnpm codecheck`: exit 0.
- Full jest suite: 292 suites / 6102 passed + 3 skipped of 6105, excluding one suite (`depot.finalize.test.ts`) that hits a documented pre-existing V8 sandbox OOM unrelated to any change in this plan.

## Task Commits

1. **Task 1: Fix the 31 type-and-deadness errors** - `15f404544` (fix)
2. **Task 2: Fix the 22 no-require-imports errors** - `04c50c6da` (fix)
3. **Task 3: Fix no-implied-eval and no-this-alias, full verification** - `9eddad013` (fix)

_No plan metadata commit is included here -- the orchestrator handles the docs commit (SUMMARY.md, STATE.md, ROADMAP.md) separately per the execution constraints for this quick task._

## Files Created/Modified

**Task 1 (type-and-deadness, 17 files):**
- `meta/buildSidecarSea.ts` - narrowed `NodeJS.Platform | string` params to `NodeJS.Platform` in `buildPostjectArgv`/`buildCodesignArgv`
- `meta/lintTranslations.ts` - removed redundant `as Namespace[]` (type predicate already narrows) plus its now-unneeded wrapping parens
- `meta/__tests__/preserveRunnerSymlinks.test.ts` - deleted redundant `as string`
- `src/backend/__tests__/tauriShellSource.test.ts` - deleted redundant `as number`; deleted the dead `CARGO_TOML_PATH` constant + orphaned REQ-34.4.2-10 comment (finding: coverage appears to have migrated into `cargoFeatures.test.ts`, unconfirmed by explicit tag)
- `src/backend/crossover_index/__tests__/index.test.ts` - moved the `jest.requireMock('../normalize')` type onto the declaration instead of an `as` cast (prevents `any`-widening)
- `src/backend/downloadmanager/downloadqueue.ts` - deleted dead `Runner` import
- `src/backend/humble/dedup.ts` - deleted 3 dead imports (`normalizeTitle`, `titleSimilarity`, `isDlcFalsePositiveRisk`)
- `src/backend/sidecar/electronStub.ts` - narrowed `IpcHandler`'s `unknown | Promise<unknown>` to `unknown`
- `src/backend/sidecar/handlers.ts` - deleted 2 redundant assertions (`.store as Record<...>`, `STORE_UNIVERSE as readonly string[]`)
- `src/backend/sidecar/steamFlowRegistration.ts` - deleted redundant `as Runner` (narrowed by prior guard)
- `src/backend/sidecar/storeWriteHandlers.ts` - deleted redundant `STORE_UNIVERSE as readonly string[]`
- `src/backend/sidecar/__tests__/devSecretVault.test.ts` - moved `jest.requireActual(...)` type onto the declaration
- `src/backend/sidecar/__tests__/humbleFlows.test.ts` - moved a destructured `jest.requireActual(...)` type onto the declaration; deleted dead `registerHumbleFlows` import (verified via full suite pass)
- `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts` - moved 5 destructured `jest.requireMock(...)` types onto their declarations
- `src/backend/sidecar/__tests__/runnerMiscFlows.test.ts` - moved 4 identical destructured `jest.requireMock(...)` types onto their declarations
- `src/backend/sidecar/__tests__/steamFlows.test.ts` - deleted dead `SteamUser` import (verified via full suite pass)
- `src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts` - deleted 2 redundant `as string` assertions on `dlopenSpy.mock.calls[0][1]`

**Task 2 (no-require-imports, 13 files, 1 CONVERT + 20 SUPPRESS/retarget within scope + 4 outside-scope drift fixes):**
- `src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts` - attempted ESM conversion, reverted after runtime failure, landed a correctly-scoped new suppression
- `meta/sidecarSeaFsShim.ts`, `src/backend/sidecar/humbleFlowRegistration.ts`, `src/backend/storeManagers/gog/redist.ts`, `meta/__tests__/i18nParserConfig.test.ts` - retargeted single-line disables, justification prose preserved verbatim
- `src/backend/sidecar/__tests__/appRootResolution.test.ts` - retargeted 1 existing disable
- `src/backend/sidecar/__tests__/appShellFlows.test.ts` - added 3 new disables (no prior suppression existed) inside `jest.isolateModules`
- `src/backend/sidecar/__tests__/bootstrap.test.ts` - added 2 new disables, retargeted 1 existing line disable, retargeted 1 existing 2-line block disable
- `src/backend/sidecar/__tests__/humbleFlows.test.ts` - retargeted 7 existing line disables
- `meta/__tests__/downloadHelperBinaries.test.ts`, `src/backend/jest.setupContainment.ts`, `src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts` - deleted 3 fully-dead `no-var-requires` disables (none covered an actual `require()`)
- `src/backend/sidecar/__tests__/bootstrapWirings.test.ts` - updated stale rule-name in docstring prose (its actual directive already said `no-require-imports`)

**Task 3 (2 files):**
- `src/preload/__tests__/framelessRuntime.test.ts` - restructured `FakeElement.closest()` to check `this.matches()` directly and start the walk at `this.parentElement`, removing the `this`-alias
- `src/backend/__tests__/longRunningChannels.test.ts` - extended the existing `no-new-func` suppression to also name `@typescript-eslint/no-implied-eval`; line 672's validation regex is byte-identical to HEAD

## Decisions Made

- **jest.requireMock/requireActual generic-default trap.** All 12 sites where the plan's literal "delete the assertion" instruction would have applied to a `jest.requireMock('x') as {...}` or `jest.requireActual('x') as {...}` call were instead fixed by moving the type onto the variable/destructure declaration. Verified empirically per-site (temporarily restoring the original file in place, running eslint, diffing warning output against the fixed version) that this produces identical warning counts to baseline, whereas a bare delete introduces new `no-unsafe-return`/`no-unsafe-member-access`/`no-unsafe-assignment` warnings from the resulting `any` type.
- **lzmaNativeBinding.test.ts CONVERT attempt failed at runtime, fell back to SUPPRESS as the plan anticipated.** `import * as nodeFs from 'node:fs'` plus `jest.spyOn(nodeFs, 'writeFileSync')` throws `TypeError: Cannot redefine property: writeFileSync` under this repo's ts-jest CJS transform. Reverted to `require('node:fs')` with a correctly-scoped new suppression comment.
- **Multi-line eslint-disable comment placement bug, caught and fixed 3 times during this task.** `// eslint-disable-next-line` only disables the line immediately after it. Placing multi-line prose justification between the directive and the target code line (the plan's own suggested phrasing style) causes the directive to disable the WRONG line -- the next comment line, not the code. Fixed by reordering to prose-first, directive-last in `lzmaNativeBinding.test.ts`, `humbleFlowRegistration.ts`, `bootstrap.test.ts`, `appShellFlows.test.ts`, and `longRunningChannels.test.ts`.
- **Extended Task 2's scope to 4 files outside the plan's enumerated list.** The plan's Task 2 `<done>` criterion explicitly requires "zero remaining references to the removed `no-var-requires` rule name anywhere in `meta/` or `src/`", and the top-level `<verification>` section runs a repo-wide grep with the same expectation -- but the plan's `files_modified` frontmatter only enumerated 26 files, missing 4 sites where stale `no-var-requires` references also existed. Fixed all 4 (documented above) since they were required by the plan's own stated done criteria, not self-invented scope. Each was individually confirmed via `--report-unused-disable-directives` to be genuinely dead before touching it, and each touched suite re-passed after the change.
- **REQ-34.4.2-10 finding, not silently dropped.** `tauriShellSource.test.ts`'s `CARGO_TOML_PATH` constant had zero readers in the file -- the objc2-web-kit feature-array assertion it once supported is gone from this file. A related assertion exists in `cargoFeatures.test.ts` (a full Cargo.lock feature-list snapshot that happens to include `objc2-web-kit` among hundreds of other crates), but that test does not carry the REQ-34.4.2-10 tag explicitly, so I cannot confirm with certainty that the specific requirement's intent is still covered as originally scoped. Deleted the dead constant per the plan's instruction; recording this as an open finding rather than asserting the requirement is definitely still satisfied.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug avoidance] `jest.requireMock`/`requireActual` blank-delete would have introduced new warnings**
- **Found during:** Task 1, Step 2 (no-unnecessary-type-assertion)
- **Issue:** The plan instructs "Delete the assertion... do not replace it with anything" for all 21 sites. For the 12 sites where the assertion sits on a `jest.requireMock()`/`jest.requireActual()` call (which is typed `<TModule extends {} = any>(moduleName: string): TModule` in `@types/jest`), a plain delete removes the only source of the call's generic type argument, so the value's inferred type collapses to `any` -- and every downstream property access on that `any` then trips `no-unsafe-member-access`/`no-unsafe-assignment`/`no-unsafe-return`, which are WARNING-level rules explicitly out of scope for this plan.
- **Fix:** Verified this hypothesis empirically on `crossover_index/__tests__/index.test.ts` first (16 new warnings appeared after a raw `eslint --fix`), then fixed all 12 sites by moving the type annotation onto the `const` declaration (or destructure pattern) instead of the `as` cast. TypeScript's contextual typing for generic calls infers the same narrowed type from the declaration annotation, so the assertion becomes genuinely redundant without any type-safety loss.
- **Files modified:** `src/backend/crossover_index/__tests__/index.test.ts`, `src/backend/sidecar/__tests__/devSecretVault.test.ts`, `src/backend/sidecar/__tests__/humbleFlows.test.ts`, `src/backend/sidecar/__tests__/oauthLoginCapture.test.ts` (5 sites), `src/backend/sidecar/__tests__/runnerMiscFlows.test.ts` (4 sites)
- **Verification:** Per-file warning-count diff against a saved baseline copy of the original file, run through eslint in place; all matched exactly. Confirmed again in the final `pnpm lint` run (3864 warnings, fully accounted for).
- **Committed in:** `15f404544` (Task 1 commit)

**2. [Rule 3 - Blocking issue] lzmaNativeBinding.test.ts ESM spy conversion fails at runtime**
- **Found during:** Task 2, CONVERT disposition
- **Issue:** The plan's preferred fix (`import * as nodeFs from 'node:fs'` + `jest.spyOn(nodeFs, 'writeFileSync'/'rmSync')`) throws `TypeError: Cannot redefine property` when actually run, because ts-jest's CJS transform makes the ESM namespace binding non-configurable.
- **Fix:** Reverted to `require('node:fs')` inline at each call site, added a new, correctly-scoped `eslint-disable-next-line @typescript-eslint/no-require-imports` with a one-line reason referencing the confirmed runtime failure.
- **Files modified:** `src/backend/storeManagers/steam/__tests__/lzmaNativeBinding.test.ts`
- **Verification:** Full suite run before and after (9/9 tests pass); eslint clean.
- **Committed in:** `04c50c6da` (Task 2 commit)

**3. [Rule 2 - Missing critical functionality] Task 2's own done criterion required 4 additional files**
- **Found during:** Task 2, verification pass
- **Issue:** Task 2's `<done>` block explicitly states "zero remaining references to the removed `no-var-requires` rule name anywhere in `meta/` or `src/`", and the plan's top-level `<verification>` step 5 runs the same repo-wide grep. A grep after completing the enumerated 22-site disposition found 4 more `no-var-requires` mentions outside the plan's `files_modified` list.
- **Fix:** Investigated each with `--report-unused-disable-directives`; 3 were confirmed fully dead (covering an ES import or a `jest.requireActual()` call, neither of which `no-require-imports` flags) and deleted outright; 1 was stale doc prose (the actual code directive was already correct) and was updated for consistency.
- **Files modified:** `meta/__tests__/downloadHelperBinaries.test.ts`, `src/backend/jest.setupContainment.ts`, `src/backend/sidecar/__tests__/loggerCallSiteGuard.test.ts`, `src/backend/sidecar/__tests__/bootstrapWirings.test.ts`
- **Verification:** eslint clean on all 4; jest run for the 3 directly-testable files (65/65 pass); `jest.setupContainment.ts` is a `setupFiles` module validated implicitly by the full suite run.
- **Committed in:** `04c50c6da` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (2x Rule 1/3 bug-avoidance, 1x Rule 2 missing-functionality)
**Impact on plan:** All three were necessary to actually satisfy the plan's own stated done criteria (zero errors, unchanged warning count, zero remaining `no-var-requires` references repo-wide) rather than its literal step-by-step phrasing. No scope creep beyond what the plan's own success criteria required.

## Issues Encountered

- **eslint-disable-next-line only covers the single next line.** Caught and fixed 5 separate times during Task 2/3 where a multi-line justification comment was placed between the directive and the target code, causing the directive to silently disable the wrong (comment) line and leave the real error unsuppressed. Established as a pattern note above.
- **`pnpm test -- --runInBand` does not forward `--runInBand` to jest correctly** (pnpm's script wrapper adds an extra `--`, so jest receives `-- --runInBand` and interprets it as a test-path pattern, matching zero files). Worked around by invoking `npx jest --runInBand` directly for the full-suite verification.
- **`depot.finalize.test.ts` reproduces a pre-existing V8 `JavaScript heap out of memory` crash**, both as part of the full ~293-suite batch and in complete isolation, with zero code changes to that file or its dependencies. This exact suite and failure mode was already documented in an unrelated prior quick task (`.planning/quick/260817-ihr-fix-the-steam-depot-downloader-s-single-/260817-ihr-SUMMARY.md`) as a pre-existing environment/sandbox memory-pressure issue, not a regression. Excluded from the full-suite pass/fail count accordingly; all other 292 suites (6102 passed + 3 skipped of 6105) are green.

## Known Stubs

None.

## Threat Flags

None -- no new network endpoints, auth paths, file-access patterns, or schema changes at trust boundaries were introduced. All changes are lint-level (deletions, retargeted rule names, declaration-vs-assertion restructuring, and one non-behavioral test-helper restructuring). The one security-relevant surface named in the plan's own threat model (`longRunningChannels.test.ts`'s `Function()` constructor call) was left with its safety-critical validation regex byte-identical to HEAD, confirmed by direct diff.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

`.github/workflows/lint.yml`'s lint job now passes cleanly against this branch (0 errors). No blockers. The REQ-34.4.2-10 coverage-migration finding (see Decisions Made) may be worth a follow-up investigation to confirm `cargoFeatures.test.ts`'s broader Cargo.lock snapshot genuinely subsumes the original requirement's intent, but this is not a blocker for the current plan's completion.

---
*Phase: quick-260818-s5l*
*Completed: 2026-08-18*

## Self-Check: PASSED

- All 30 code files listed under `key-files.modified` and "Files Created/Modified" verified present on disk.
- This SUMMARY.md itself verified present on disk.
- All 3 task commit hashes (`15f404544`, `04c50c6da`, `9eddad013`) verified present in `git log --oneline --all`.
- No missing items.
