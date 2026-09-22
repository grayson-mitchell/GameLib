---
phase: quick-260922-hjb
plan: 01
subsystem: build
tags: [vite, i18n, locales, build-plugins, bundle-size]

requires: []
provides:
  - meta/pruneUnofferedLocales.ts (computeUnofferedLocaleDirs, assessOfferedLocales, pruneUnofferedLocales, pruneUnofferedLocalesPlugin)
  - a wired vite.config.ts plugin that prunes both build/locales and build/renderer/locales down to the 43 offered codes on every build
affects: [i18n, build-packaging, vite.config.ts]

tech-stack:
  added: []
  patterns:
    - "closeBundle (not buildStart) for a build-output prune that must survive vite's publicDir copy"
    - "no-enforce plugin ordering (normal tier, ahead of enforce:'post') pinned by hook-identity/enforce-tier/sync assertions instead of array position"
    - "refuse-to-prune guard (assessOfferedLocales) modelled on assessPublicBin: floor check, 'en' presence, prune-set-excludes-'en', wholesale-wipe fraction cap"

key-files:
  created:
    - meta/pruneUnofferedLocales.ts
    - meta/__tests__/pruneUnofferedLocales.test.ts
  modified:
    - vite.config.ts
    - meta/__tests__/viteRendererConfig.test.ts
    - .planning/todos/completed/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md (moved from pending/)

key-decisions:
  - "Hook is closeBundle, not buildStart (unlike the neighbouring pruneStaleHelperBinariesPlugin) -- vite's own publicDir copy runs after buildStart and would re-add all 49 dirs"
  - "No enforce key: sortUserPlugins places it on the normal tier, strictly ahead of assembleRendererDistPlugin's enforce:'post', which is what makes ONE prune of build/locales fix BOTH shipped trees"
  - "public/locales is deliberately left untouched -- prunes build output only, keeping pnpm i18n-churn-guard's unstaged-only diff check out of this task's blast radius"
  - "Guard refuses to prune below a 20-entry offered floor, when 'en' is absent from offered, when the prune set contains 'en', or when the prune set exceeds 25% of present dirs -- collected, not short-circuited"

requirements-completed: [todo-2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle]

duration: 11min
completed: 2026-09-22
---

# Quick Task 260922-hjb: Prune Unreachable Locale Directories Summary

**Added a build-time vite plugin (`pruneUnofferedLocalesPlugin`, `closeBundle`, normal enforce tier) that prunes the six locale directories absent from `src/common/languages.ts`'s `supportedLanguages` out of both shipped locale trees (`build/locales` via `tauri.conf.json`'s bundle.resources, and `build/renderer/locales` via `frontendDist`) on every build, while leaving `public/locales` completely untouched.**

## Performance

- **Duration:** ~11 min (commits span 12:47-12:58 local time, 2026-09-22)
- **Tasks:** 3/3 completed
- **Files modified:** 5 (2 created, 3 modified) + 1 todo moved

## Accomplishments

- Both shipped locale trees (`build/locales`, `build/renderer/locales`) go from 49 to 43 directories on a real `pnpm exec vite build`, with `en` present and the offered/present sets matching `supportedLanguages` exactly in both.
- `public/locales` stays untouched at 49 directories, 0 lines of `git status --porcelain public/locales`.
- The fix is structural, not a one-off cleanup: a newly-added unreachable locale directory is pruned automatically on the next build, and the live-pin test in `meta/__tests__/pruneUnofferedLocales.test.ts` goes red if `public/locales` and `supportedLanguages` ever diverge differently than today's six codes.
- The half-fix failure mode this task's threat model worried about (pruning only `build/locales`, leaving `build/renderer/locales` at 49) is pinned closed by `meta/__tests__/viteRendererConfig.test.ts`'s hook-identity/enforce-tier/synchronicity assertions plus a composition test that proves the reverse plugin order still yields 49.
- Closed the originating todo, correcting its measurement from a 532K single-tree undercount to the real ~1000K two-tree figure, and recording that the Weblate sync-policy question it was blocked on is now moot for the shipped-bundle defect (though still open on its own merits).

## Task Commits

Each task was committed atomically:

1. **Task 1: Write the guard + prune function** - `e2148dd3b` (feat) — `meta/pruneUnofferedLocales.ts`: `computeUnofferedLocaleDirs`, `assessOfferedLocales`, `pruneUnofferedLocales`, `pruneUnofferedLocalesPlugin`.
2. **Task 2: Cover the prune and pin its ordering** - `03e196fdb` (test) — `meta/__tests__/pruneUnofferedLocales.test.ts` (new) + `meta/__tests__/viteRendererConfig.test.ts` (extended with plugin-presence and ordering/hook-identity/enforce-tier/sync tests).
3. **Task 3: Wire into vite.config.ts and prove on a real build** - `f04eecf6a` (feat) — wired `pruneUnofferedLocalesPlugin()` into the plugins array; reformatted the three files above to satisfy `pnpm prettier`; moved the resolved todo to `completed/`.

No separate plan-metadata commit was made — per this execution's constraints, SUMMARY.md/STATE.md/ROADMAP.md docs commits are handled by the orchestrator, not this executor.

## Files Created/Modified

- `meta/pruneUnofferedLocales.ts` - Pure prune function + refuse-to-prune guard + vite plugin factory. Default `localesDir` is `build/locales`; imports `supportedLanguages` from `src/common/languages.ts` as the single source of truth (a new consumer of that list, not a fifth hand-maintained copy).
- `meta/__tests__/pruneUnofferedLocales.test.ts` - Live-pin tests against the real `public/locales` tree, temp-dir fixture coverage of every guard condition's failing direction, passing-direction and empty-no-op coverage, and two composition-pin tests proving prune-before-assemble yields 43 while assemble-before-prune yields 49.
- `meta/__tests__/viteRendererConfig.test.ts` - Added plugin-presence, ordering (hook identity + enforce tier + synchronicity, not array position), and source-text-rationale assertions for the new plugin.
- `vite.config.ts` - Imports and wires `pruneUnofferedLocalesPlugin()` between `pruneStaleHelperBinariesPlugin()` and `preserveRunnerSymlinksPlugin()`, with an explanatory comment matching the density of its neighbours.
- `.planning/todos/completed/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md` - Moved from `pending/`; body extended with a "Resolution" section.

## Decisions Made

- `closeBundle`, not `buildStart`: vite's `copyDir(publicDir, outDir)` runs during `prepareOutDir`, strictly after `buildStart` fires, so a `buildStart` prune would be immediately undone by the same build's own publicDir copy.
- No `enforce` key: `sortUserPlugins` places a no-`enforce` plugin on the normal tier, ahead of every `enforce: 'post'` plugin (including `assembleRendererDistPlugin`, which `rm -rf`s `build/renderer` and re-copies `build/locales` into it) regardless of array position. This is precisely why pruning `build/locales` once fixes both shipped trees.
- `closeBundle` body stays a plain synchronous function: rollup's `hookParallel` does not await between non-sequential plugins, so the ordering guarantee depends on a synchronous hook body completing inside `runHook` before the loop reaches the next plugin. Making it `async` would silently reopen that race.
- `public/locales` is never touched by this plugin or its tests (except the live-pin describe block, which only reads it) — keeps `pnpm i18n-churn-guard`'s unstaged-diff check out of this task's blast radius.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] `pnpm prettier` was red on the newly-authored/modified files**

- **Found during:** Task 3's verification step (`pnpm prettier` in the plan's `<verify>` block).
- **Issue:** `meta/pruneUnofferedLocales.ts`, `meta/__tests__/pruneUnofferedLocales.test.ts`, and `meta/__tests__/viteRendererConfig.test.ts` failed `prettier --check .` (formatting-only, not logic). Two of the three files had already been committed in Task 2's commit (`03e196fdb`), which itself did not run `pnpm prettier` before committing.
- **Fix:** Ran `npx prettier --write` scoped to exactly the three flagged files. Re-ran `pnpm prettier` (exit 0), re-ran `npx jest` on both affected test files (49/49 pass, no behavior change), and re-ran `pnpm lint` (src 1119/1124, tests 638/638, both unchanged) to confirm the reformat introduced no new warnings.
- **Files modified:** `meta/pruneUnofferedLocales.ts`, `meta/__tests__/pruneUnofferedLocales.test.ts`, `meta/__tests__/viteRendererConfig.test.ts`.
- **Verification:** `pnpm prettier` exit 0; `npx jest meta/__tests__/pruneUnofferedLocales.test.ts meta/__tests__/viteRendererConfig.test.ts` → 49/49 pass; `pnpm lint` → `production: PASS | tests: PASS`, 1119/1124 src, 638/638 tests.
- **Committed in:** `f04eecf6a` (folded into the Task 3 commit, since the fix was discovered during Task 3's own verification and blocked that task's `<done>` criteria; the commit message documents this explicitly rather than silently absorbing it).

**2. [Rule 4-adjacent process fix] Missing commit attribution on the Task 3 commit**

- **Found during:** Self-check, immediately after committing Task 3.
- **Issue:** The launching task required every commit to end with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`. Tasks 1 and 2's commits (`e2148dd3b`, `03e196fdb`) carried this line correctly; the Task 3 commit was made without it.
- **Fix:** Amended the Task 3 commit (its own tip commit, not yet reported anywhere, no shared history at risk) to add the required attribution line. No content changes.
- **Files modified:** None (message-only amend).
- **Verification:** `git log -1 --format="%B" | tail -3` confirms the line is present.
- **Committed in:** `f04eecf6a` (final hash after amend).

## Known Stubs

None.

## Threat Flags

None. All new surface (the `closeBundle` prune, the `resolveDestPath`-contained deletes, the refuse-to-prune guard) is exactly what the plan's `<threat_model>` (T-hjb-01 through T-hjb-04, T-hjb-SC) already covers.

## Measured Before/After (both shipped locale trees)

| Tree | Before | After | `en` present | Offered/present match |
|---|---|---|---|---|
| `build/locales` | 49 | 43 | yes | exact (43 = 43) |
| `build/renderer/locales` | 49 | 43 | yes | exact (43 = 43) |
| `public/locales` (source, never touched) | 49 | 49 | yes | n/a (untouched) |

Pruned on the real build: 6 directories (`br`, `da`, `ka`, `sl`, `th`, `uz`), 481597 bytes freed (measured on `build/locales`; the same 6 are pruned from `build/renderer/locales` via the same source copy since `assembleRendererDistPlugin` runs after this plugin on the `enforce: 'post'` tier).

`git status --porcelain public/locales` → 0 lines, both before and after the build.

## Gate Output (real, not paraphrased)

- `npx jest meta/__tests__/pruneUnofferedLocales.test.ts meta/__tests__/viteRendererConfig.test.ts` → `Test Suites: 2 passed, 2 total` / `Tests: 49 passed, 49 total`.
- `pnpm codecheck` (`tsc --noEmit`) → exit 0, no output.
- `pnpm lint` → exit 0. `production: PASS | tests: PASS`. SRC scope: `✖ 1119 problems (0 errors, 1119 warnings)` (ceiling 1124, 5 headroom, re-measured at HEAD). TESTS scope: `✖ 638 problems (0 errors, 638 warnings)` (ceiling 638, zero headroom, unmoved).
- `pnpm prettier` → initially **exit 1** (`[warn] meta/__tests__/pruneUnofferedLocales.test.ts`, `[warn] meta/__tests__/viteRendererConfig.test.ts`, `[warn] meta/pruneUnofferedLocales.ts`, "Code style issues found in 3 files"). Resolved via `npx prettier --write` on those three files (see Deviations); re-run → exit 0, "All matched files use Prettier code style!".
- `pnpm exec vite build` (fresh, `build/renderer` removed first) → `BUILD_EXIT=0`. Build log contains `[prune-unoffered-locales] pruned 6 directories, 481597 bytes freed`.
- Node script comparing `readdirSync` against `supportedLanguages` for both `build/locales` and `build/renderer/locales` → `both trees: 43, en present: true true`, no extras, no missing.

## Self-Check: PASSED

- `meta/pruneUnofferedLocales.ts` — FOUND
- `meta/__tests__/pruneUnofferedLocales.test.ts` — FOUND
- `.planning/todos/completed/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md` — FOUND
- `.planning/todos/pending/2026-09-21-six-locale-directories-ship-unreachable-in-the-bundle.md` — correctly absent
- `vite.config.ts` contains `pruneUnofferedLocalesPlugin` (2 occurrences: import + array entry) — confirmed
- Commit `e2148dd3b` — FOUND in `git log`
- Commit `03e196fdb` — FOUND in `git log`
- Commit `f04eecf6a` — FOUND in `git log`, carries the required `Co-Authored-By` attribution
