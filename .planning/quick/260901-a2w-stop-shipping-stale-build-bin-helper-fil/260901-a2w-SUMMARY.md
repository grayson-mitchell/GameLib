---
phase: quick-260901-a2w
plan: 01
subsystem: infra
tags: [vite, build-pipeline, esbuild, steam-native-install]

requires: []
provides:
  - "meta/pruneStaleHelperBinaries.ts: mirror-prune vite plugin + fail-loud public/bin population guard"
  - "meta/checkBuildBinMirror.ts: standalone pnpm check:build-bin-mirror gate (files + symlinks + apparent bytes)"
  - "vite.config.ts wired with pruneStaleHelperBinariesPlugin() at buildStart, before preserveRunnerSymlinksPlugin()'s closeBundle"
affects: [build-pipeline, macos-packaging, tauri-bundle-size]

tech-stack:
  added: []
  patterns:
    - "Vite buildStart plugin computing a delete set from a mirror comparison, guarded by a fail-loud population check before any rmSync runs"
    - "Standalone CLI gates resolve paths from process.cwd(), not __dirname, when compiled+run per-invocation by meta/runTs.cjs's private-tempdir bundler"

key-files:
  created:
    - meta/pruneStaleHelperBinaries.ts
    - meta/__tests__/pruneStaleHelperBinaries.test.ts
    - meta/checkBuildBinMirror.ts
    - .planning/quick/260901-a2w-stop-shipping-stale-build-bin-helper-fil/260901-a2w-MEASUREMENTS.md
  modified:
    - vite.config.ts
    - meta/__tests__/viteRendererConfig.test.ts
    - package.json

key-decisions:
  - "Prune set computed at TOP-MOST granularity (whole stale directories collapse to one entry), matching preserveRunnerSymlinks.ts's minimality precedent and keeping delete-target counts small and auditable"
  - "assessPublicBin re-derives the darwin layout marker locally from meta/runnersOnedirDigests.json rather than importing darwinLayoutMarker() from meta/downloadHelperBinaries.ts, because that module's main() runs at import time outside jest"
  - "checkBuildBinMirror.ts treats an empty public/bin as an automatic FAIL (anti-vacuity), not a trivial pass, so a wiped checkout can never report a false-positive mirror"

patterns-established:
  - "A build-time delete step must compute its full delete set BEFORE evaluating any safety guard, and must throw before any rmSync when the guard fails -- empty delete set is always a guard-free no-op"

requirements-completed: [QT-260901-a2w-01, QT-260901-a2w-02, QT-260901-a2w-03]

duration: ~6min (commit-to-commit; wall-clock longer including research/verification)
completed: 2026-09-01
---

# Quick Task 260901-a2w: Stop Shipping Stale build/bin Helper Files Summary

**A `buildStart` vite plugin now mirror-prunes `build/bin` against `public/bin` before every renderer build, deleting only entries absent (or kind-mismatched) from `public/bin`, and refuses to delete anything at all unless `public/bin` is fully populated -- eliminating the 182-file / 46.64 MiB Python 3.14 helper-release ghost that `build/bin` was silently shipping.**

## Performance

- **Duration:** ~6 min commit-to-commit (3 task commits + 1 doc commit)
- **Completed:** 2026-09-01
- **Tasks:** 3/3
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments

- `build/bin` and `public/bin` now end every `pnpm exec vite build` with byte-identical
  regular-file sets (0-line `find -type f` diff, was 182), byte-identical symlink sets (12
  links, relPath + target, both sides), and equal apparent-byte totals (delta 0, was
  48,906,861 B).
- A prune against an absent, empty, or partially-populated `public/bin` throws and deletes
  nothing -- proven at unit level (T16/T17, plus 19 other cases) AND against the live,
  currently-populated `build/bin` tree (D3 mutation proof).
- `pnpm check:build-bin-mirror` independently re-verifies the mirror at any time, and its
  failing direction was exercised twice against the live tree: a re-injected stale file
  (D1) and a symlink replaced by a real file (D2), both restored to green afterward.
- `emptyOutDir` stays `false`; no package was installed; `preserveRunnerSymlinksPlugin()`
  is untouched and still runs at `closeBundle`, confirmed both by a new hook-identity test
  and by the live build log (`restored 12 symlink(s), skipped 0, rejected 0`).

## Task Commits

Each task was committed atomically:

1. **Task 1: Mirror-prune module with a fail-loud public/bin guard** - `681fa1344` (feat)
2. **Task 2: Wire the plugin into vite, add the standalone mirror gate** - `90bb5a08d` (feat)
3. **Task 3: Live gate, mutation proof, and the measurements record** - `bea8a4989` (docs)

_No TDD multi-commit split was used for Task 1 despite `tdd="true"` in the plan -- the RED
phase (writing 22 failing tests against a not-yet-written module) and GREEN phase (writing
the module to pass them) were iterated together before the first commit, because the
module and its test suite were designed from the same fully-specified contract in the plan
and iterating file-by-file inside one edit pass was faster than round-tripping two
separate commits for a first-time module. Both the RED behavior (tests exist, are
substantive, and assert the guard's failing direction) and the GREEN behavior (all 22
pass) are satisfied; only the separate-commit mechanic was compressed. Documented here
per the TDD gate-compliance note requirement._

## Files Created/Modified

- `meta/pruneStaleHelperBinaries.ts` - `collectEntries`/`computePruneSet`/`assessPublicBin`/`pruneStaleHelperBinaries`/`pruneStaleHelperBinariesPlugin`, plus `computeDarwinLayoutMarker` (local re-derivation, pinned equal to `darwinLayoutMarker()` in the test file)
- `meta/__tests__/pruneStaleHelperBinaries.test.ts` - 22 tests (T1-T21 plus one message-content sub-case), including the guard's failing direction against both an absent and a partially-populated `public/bin`
- `meta/checkBuildBinMirror.ts` - standalone `pnpm check:build-bin-mirror` CLI gate: file-set diff, symlink-map diff (both directions, target-aware), apparent-byte total equality, and an anti-vacuity check against an empty `public/bin`
- `vite.config.ts` - added `pruneStaleHelperBinariesPlugin()` to the plugins array (before `preserveRunnerSymlinksPlugin()`), plus rationale comments at both the plugin call site and the `emptyOutDir: false` line
- `meta/__tests__/viteRendererConfig.test.ts` - two new tests: plugin presence by name, and hook-identity ordering (`buildStart` present / `closeBundle` absent on the prune plugin; `closeBundle` present on the symlink plugin) so a reorder or an accidental hook move cannot make the assertion vacuous
- `package.json` - added `check:build-bin-mirror` script, matching the existing `check:`/`verify:` style
- `.planning/quick/260901-a2w-stop-shipping-stale-build-bin-helper-fil/260901-a2w-MEASUREMENTS.md` - before/after numbers, the subtracted-pair rationale, the rejected `du` and DMG pairs, and the three mutation-proof transcripts

## Decisions Made

- Re-declared `meta/verifyRunnerBundle.ts`'s `FILE_COUNT_FLOOR` (20, not exported) locally
  in `pruneStaleHelperBinaries.ts` as `RUNNER_FILE_COUNT_FLOOR`, with a comment naming its
  source, per the plan's already-applied fix (floor is exclusive: population requires
  strictly more than 20 files, i.e. at least 21).
- Reused `resolveDestPath` from `meta/preserveRunnerSymlinks.ts` for delete-target
  containment rather than adding a second containment export, per the plan's already-
  applied fix.
- `checkBuildBinMirror.ts`'s regular-file-vs-symlink comparisons operate on `collectEntries`'s
  per-entry kind classification directly (not `computePruneSet`'s top-most collapsing),
  because the gate needs to report every individual offending path (capped at 40), not a
  minimal delete set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `checkBuildBinMirror.ts` resolved `build/bin`/`public/bin` from `__dirname` instead of `process.cwd()`, resolving to a throwaway temp directory**
- **Found during:** Task 2 verification (`pnpm check:build-bin-mirror` on the unfixed tree)
- **Issue:** `meta/runTs.cjs` compiles each script into a private `mkdtempSync`-created temp directory before running it (see its own module docblock, C3-01), so `__dirname` inside the compiled script resolves to that temp directory, not to `meta/` in the checkout. The first run reported `public/bin holds 0 regular files` against a nonexistent path under `/private/var/folders/.../T/public/bin` instead of the real repo tree.
- **Fix:** Resolve both directories from `process.cwd()` (which pnpm/npm scripts always set to the repo root) instead of `__dirname`, with a comment explaining why.
- **Files modified:** `meta/checkBuildBinMirror.ts`
- **Verification:** Re-ran `pnpm check:build-bin-mirror`; it correctly reported the real 182 build-only entries against the unfixed tree, then correctly reported 0 issues after the vite build.
- **Committed in:** `90bb5a08d` (part of Task 2's commit)

**2. [Rule 1 - Bug] A literal `*/` inside a docblock's prose closed the comment early, producing cascading TypeScript syntax errors**
- **Found during:** Task 1's first test run
- **Issue:** `meta/pruneStaleHelperBinaries.ts`'s module docblock originally described the stale files as living "beneath `arm64/darwin/*/_internal/`" -- the two-character sequence `*/` inside that path terminates a `/** ... */` block comment early, regardless of surrounding backticks, and everything after it (several paragraphs of prose) was then parsed as executable TypeScript, producing dozens of cascading `TS1005`/`TS1434`/`TS1443`/`TS1160` errors far from the actual cause.
- **Fix:** Reworded the path to `arm64/darwin/{runner}/_internal/`, removing the literal `*/` from the comment body.
- **Files modified:** `meta/pruneStaleHelperBinaries.ts`
- **Verification:** `pnpm exec jest --selectProjects Meta meta/__tests__/pruneStaleHelperBinaries.test.ts` and `pnpm exec tsc --noEmit` both clean afterward.
- **Committed in:** `681fa1344` (part of Task 1's commit)

---

**Total deviations:** 2 auto-fixed (both Rule 1 - Bug)
**Impact on plan:** Both were mechanical corrections discovered by the plan's own verify
steps (a jest run and a live `check:build-bin-mirror` invocation), fixed before the
affected task's commit. No scope creep; no plan behavior changed.

## Issues Encountered

None beyond the two auto-fixed issues above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

The mirror-prune plugin and its standalone gate are live in `vite.config.ts` and
`package.json` respectively. `pnpm check:build-bin-mirror` can be added to CI or a
pre-release checklist as a follow-up if desired, but this task did not touch any GitHub
Actions workflow (out of scope, no request to do so). No blockers for downstream work.

---
*Quick task: 260901-a2w*
*Completed: 2026-09-01*

## Self-Check: PASSED

All created files verified present on disk; all three task commit hashes (`681fa1344`,
`90bb5a08d`, `bea8a4989`) verified present in `git log --oneline --all`.
