---
phase: quick-260924-vat
plan: 01
subsystem: infra
tags: [vite, chokidar, tauri, windows, build]

requires: []
provides:
  - "vite.config.ts server.watch.ignored covering src-tauri/target"
  - "Regression pin + source-text guard in viteRendererConfig.test.ts"
affects: [vite.config.ts, tauri-dev-workflow]

tech-stack:
  added: []
  patterns:
    - "Vite server.watch.ignored entries are APPENDED to Vite 6.3.5's own
      chokidar defaults (.git/node_modules/test-results/cacheDir) -- do not
      restate the defaults when adding an entry"

key-files:
  created: []
  modified:
    - vite.config.ts
    - meta/__tests__/viteRendererConfig.test.ts
    - .planning/todos/completed/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md

key-decisions:
  - "Ignored only src-tauri/target/**, not the whole src-tauri/** tree -- target/ is the only cargo output under src-tauri, and a jest guard pins the narrower scope so any future widening is a deliberate test edit"
  - "build/ (Vite's own outDir) was NOT added to the ignore list -- emptyOutDir is false so Vite does not auto-ignore it, but that is a separate, unobserved question out of scope for this fix"

requirements-completed: [TODO-2026-09-24-vite-ebusy-src-tauri-target]

duration: ~10min
completed: 2026-09-24
---

# Quick Task 260924-vat: Ignore src-tauri/target in Vite watcher Summary

**Added `server.watch.ignored: ['**/src-tauri/target/**']` to vite.config.ts so cargo's build
output can never raise an unhandled Windows EBUSY in Vite's dev-server watcher, pinned by a
jest regression test and a source-text rationale guard.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-09-24
- **Tasks:** 2/2 completed
- **Files modified:** 3 (`vite.config.ts`, `meta/__tests__/viteRendererConfig.test.ts`,
  the moved-and-edited todo)

## Accomplishments

- `pnpm tauri:dev` on Windows can no longer die mid cold build on
  `EBUSY: resource busy or locked, watch '...src-tauri\target\debug\deps\gamelib_shell.exe'` --
  Vite's chokidar watcher now never descends into `src-tauri/target` at all.
- Three new regression tests (both `production` and `development` modes) plus a source-text guard
  make the fix, its scope, and its rationale comment all independently pinned.
- Todo closed in `completed/` with a full resolution record and an explicit, un-run live-gate
  follow-up for the operator.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add server.watch.ignored for src-tauri/target and pin it** - `c9775edac` (fix, TDD:
   RED confirmed with 3 failing assertions before the config edit, then GREEN)
2. **Task 2: Close the todo with an operator live-verify follow-up** - `0f9011ab3` (docs)

_No separate plan-metadata commit -- this SUMMARY.md commit is the orchestrator's docs commit per
the calling constraints._

## Files Created/Modified

- `vite.config.ts` - Added `watch: { ignored: ['**/src-tauri/target/**'] }` inside the existing
  `server` block, with an inline comment tagged "Quick task 260924-vat" naming the EBUSY mechanism,
  the Vite append-not-replace behavior, and the deliberate `target/`-only scope.
- `meta/__tests__/viteRendererConfig.test.ts` - Added a 6th "WHAT THIS CATCHES" header item; three
  new `it()` cases inside the existing `describe.each(['production','development'])` block
  (ignore present, no widening to `src-tauri/**`, no restated Vite defaults); one new
  `source-text guards` case asserting the source contains both `260924-vat` and `EBUSY`.
- `.planning/todos/completed/2026-09-24-tauri-dev-on-windows-crashes-on-vite-ebusy-watching-src-tauri-target.md` -
  `git mv`'d from `pending/`; added `status: RESOLVED` and the test file to `files:`; appended a
  `## Resolution (quick-260924-vat)` section (fix, the Vite 6.3.5 append-not-replace fact with
  file/line, the `vite.config.ts:148` red herring, why `src-tauri/**` was not ignored, the
  regression-pin location, the noted-not-actioned `build/` observation, and an explicit
  "What is NOT proven" note for the live gate).

## Decisions Made

- **Ignore `target/` only, not `src-tauri/**`.** The todo's own fix-direction note speculated
  "probably `src-tauri/**`". Declined per the plan's facts: `src-tauri/` also holds
  `binaries capabilities Cargo.* build.rs entitlements.plist gen icons src tauri*.conf.json`, none
  of which are cargo output. `target/` is the only directory chokidar has any reason to avoid, and
  a jest guard (`does not widen the watcher ignore to the whole src-tauri tree`) makes a future
  broadening a deliberate test edit rather than a drive-by.
- **`vite.config.ts:148` confirmed as a red herring**, as the plan's facts anticipated. That
  comment (inside the 260922-hjb `pruneUnofferedLocalesPlugin` rationale) discusses
  `tauri.conf.json`'s `../build/locales/` bundle-resource mapping -- unrelated to the watcher. No
  existing ignore list covered `src-tauri/target` before this fix. Recorded in both the SUMMARY
  and the todo's Resolution section per the plan's success criteria.
- **`build/` (Vite's own `outDir`) left untouched**, per the plan's fact 2: `emptyOutDir: false`
  means Vite does not auto-ignore `build/`, and `build/` holds sidecar output written by other
  build steps -- whether it needs its own watcher ignore is a separate, unobserved question,
  noted in both the todo and this SUMMARY as observed-not-actioned rather than silently dropped.

## Deviations from Plan

None - plan executed exactly as written. TDD flow followed: RED confirmed 3 failing assertions
(the new ignore/no-widen/no-restate-defaults cases) with 35 pre-existing cases still green before
touching `vite.config.ts`; GREEN confirmed all 38 cases passing after the one config-key addition.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Operator Follow-Up (not run by this executor)

The live gate named in the plan's `<verification>` section was **not** run: on the operator's
Windows machine, `cargo clean -p gamelib_shell` (in `src-tauri`) followed by a cold
`pnpm tauri:dev` should now reach the app window without an `EBUSY` on `gamelib_shell.exe`. This
is recorded as an explicit, named follow-up in both this SUMMARY and the closed todo's Resolution
section -- no new pending todo was filed for it, per the plan's instruction.

## Next Phase Readiness

This is a standalone quick task with no downstream phase dependency. The fix is desk-verified
(jest regression pin, prettier, lint, planning-gates all green) but not yet live-verified on
Windows; see the Operator Follow-Up above.

---
*Task: quick-260924-vat*
*Completed: 2026-09-24*

## Self-Check: PASSED
