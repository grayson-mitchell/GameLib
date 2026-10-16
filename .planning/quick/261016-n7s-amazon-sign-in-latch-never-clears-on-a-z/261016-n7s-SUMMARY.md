---
quick_id: 261016-n7s
status: complete
---

# Quick 261016-n7s: clear the Amazon sign-in latch from a successful library sync

**One-liner:** Clear-only classifier (`classifyNileLibrarySync`) observes the existing `nile library sync` spawn inside `refreshNile()` and clears a latched Amazon `expired` flag on success, without touching the expiry probe or triggering any new spawn.

## What was built

The Amazon sign-in `expired` latch could only ever be *set*, never cleared, on a zero-installed
profile: the expiry probe's `list-updates` run classifies `unknown` by design when nothing is
installed (A4, F-49-R1-4) and `unknown` never writes (260822-vov), so only a full Reconnect login
could clear a latched flag. `refreshNile()` already spawns `nile library sync` on every library
refresh, and that spawn already proves the credential when it succeeds — this plan observes that
existing spawn rather than issuing a new command, so D-16 ("the pass never triggers a library
sync") still holds.

- **`classify.ts`**: added `NILE_LIBRARY_SYNC_SUCCESS_MARKER` (`'Successfully synced the library'`,
  confirmed against the shipped nile v1.2.0 binary and the 261015-rud evidence log) and
  `classifyNileLibrarySync(input)`, a clear-only classifier whose declared return type is
  `'healthy' | 'unknown'` — `'expired'` is excluded at the type level, so this path cannot latch,
  structurally.
- **`nile/library.ts`**: `refreshNile()` now feeds the `library sync` spawn's captured output
  through `classifyNileLibrarySync` and `applySignInVerdict`, fenced by the same per-store session
  epoch the expiry-probe pass uses (T-49-10), with the whole new block (lazy imports, the spawn
  call itself, and the post-spawn verdict/publish logic) wrapped in one `try/catch` so a thrown
  error cannot escape into the un-awaited caller (F6, T-N7S-04).
- **`librarySyncLatchClear.test.ts`** (new): end-to-end coverage driving `runRunnerCommand` through
  a spy (fake-HOME two-profile rule holds by construction — no binary is spawned): a clean success
  clears a latched flag and publishes once; a failed 400 refresh leaves the flag latched and
  records/publishes `unknown` (never clears it); an epoch bump mid-flight (a fresh sign-in landing
  during the spawn) yields `stale` with the flag untouched and nothing published; a synchronous
  throw inside the observer resolves `refreshNile()` cleanly with nothing published.
- **`classify.test.ts`**: 7-row `classifyNileLibrarySync` describe block (healthy; first-match-wins
  over a co-occurring refresh failure; a 400 refresh failure, labelled as the row proving this path
  can never latch; errored; aborted; zero-chunk/joined spawn; clean-empty-is-`unknown`, contrasted
  explicitly with `classifyNileOutput`'s clean-empty-is-`healthy`); extended the existing T-49-09
  source gate with an assertion that `classifyNileLibrarySync`'s declared return type excludes
  `'expired'`.
- **`runnerProbes.ts` / `classify.ts` doc comments**: corrected the two stale comments that pointed
  at the now-resolved pending todo's filename, naming quick 261016-n7s as the resolution instead;
  the probe command and its `unknown` zero-installed verdict are explicitly unchanged.
- **Todo**: `git mv`'d `.planning/todos/pending/2026-10-15-amazon-latch-never-clears-on-a-zero-installed-profile.md`
  to `completed/`, added `status: RESOLVED` frontmatter and a `## Resolution` section naming the
  fix, the declined alternative (a replacement probe command), and the two implementing commits.

## Commits

| Task | Type | Short hash | Full hash | Message |
|------|------|------------|-----------|---------|
| 1 (tracer) | `feat` | `36b900273` | `36b9002730e47d25f1e2056046156eadb19b39ae` | Task 1 -- clear the Amazon sign-in latch from a successful library sync |
| 2 | `test` | `f140386ec` | `f140386ecb711b0fb8597f0b5164f3637e783d2f` | Task 2 -- classifier rows, library test arms, stale-doc fixes |
| 3 | `docs` | `60023a86e` | `60023a86ea1fc8275711276077800e8d9c19bb98` | close the Amazon latch-never-clears todo |

All three commits are on branch `quick-261002-b63` (no worktree isolation; `workflow.use_worktrees=false`).
Every commit message ends with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>` as directed.

## Test commands and per-file results

Command: `npx jest src/backend/signInProbe src/backend/storeManagers/nile`

```
PASS Backend src/backend/storeManagers/nile/__tests__/user.test.ts
PASS Backend src/backend/storeManagers/nile/__tests__/expiryProbe.test.ts
PASS Backend src/backend/signInProbe/__tests__/classify.test.ts
PASS Backend src/backend/storeManagers/nile/__tests__/logoutCookies.test.ts
PASS Backend src/backend/signInProbe/__tests__/verdict.test.ts
PASS Backend src/backend/storeManagers/nile/__tests__/nileCredentialRedaction.test.ts
PASS Backend src/backend/signInProbe/__tests__/outcomes.test.ts
PASS Backend src/backend/storeManagers/nile/__tests__/getUserData.test.ts
PASS Backend src/backend/signInProbe/__tests__/runnerProbes.test.ts
PASS Backend src/backend/signInProbe/__tests__/pass.test.ts
PASS Backend src/backend/storeManagers/nile/__tests__/librarySyncLatchClear.test.ts
PASS Backend src/backend/signInProbe/__tests__/dismissBackstop.test.ts

Test Suites: 12 passed, 12 total
Tests:       245 passed, 245 total
Snapshots:   0 total
Time:        1.33 s
```

Exit code: `0`. This exceeds F8's pre-change baseline (11 suites, 233 tests) by the new
`librarySyncLatchClear.test.ts` suite (1 suite, 4 tests) plus Task 2's additions to
`classify.test.ts` (8 tests: 7 classifier rows + 1 T-49-09 extension), matching the plan's
verification requirement.

`librarySyncLatchClear.test.ts` individual results (all 4 pass):
- `a clean sync carrying the success phrase deletes expired, marks healthy and publishes once` — PASS
- `a failed refresh (400, non-zero exit) leaves a latched flag set and never clears it` — PASS
- `an epoch bump mid-flight ... makes the verdict stale: the flag is left untouched and nothing is published (T-49-10)` — PASS
- `a synchronous throw inside the observer resolves cleanly, with no unhandled rejection and nothing published (F6)` — PASS

`classify.test.ts`'s new `classifyNileLibrarySync` describe block (all 7 pass):
- `the success phrase alone is healthy` — PASS
- `the success phrase alongside a refresh-failure line is unknown (first-match-wins)` — PASS
- `a refresh failure with a 400 is unknown -- this path can never latch` — PASS
- `errored with the success phrase present is unknown` — PASS
- `aborted with the success phrase present is unknown` — PASS
- `a zero-chunk capture (joined spawn) is unknown` — PASS
- `empty output, observed, clean is unknown -- contrast with classifyNileOutput, where a clean empty capture is healthy` — PASS

Plus the T-49-09 source-gate extension: `classifyNileLibrarySync's declared return type excludes 'expired' -- this path can never latch (quick 261016-n7s)` — PASS.

No failures occurred at any point in this plan's execution; this is the real, unfiltered output of
the exact scoped command above, not a summary-only or partial run.

## `pnpm codecheck`

Command: `pnpm codecheck` (runs `tsc --noEmit && tsc -p tsconfig.meta.json --noEmit`)

**Exit code: `0`.** Clean against both tsconfigs, no errors.

## Lint ceilings (`meta/lintScoped.cjs`)

Both ceilings were **measured, not changed** — the plan's F10 prediction (a tests-ceiling
regression once the new test file landed) was itself measured during planning against an earlier,
untyped draft of the test file. The implementation actually written uses `CallRunnerOptions` typed
`jest.spyOn` signatures throughout (see "Deviations" below), which produced **zero** new lint
warnings in either new/modified test file.

| Ceiling | Before (plan's stated baseline) | After (measured, this tree, all 3 commits applied) | Result |
|---|---|---|---|
| `SRC_CEILING` | 1124 (ceiling unchanged; ~35 headroom cited in plan) | 1124 ceiling, 1089 measured problems | `production: PASS`, exit `0` |
| `TESTS_CEILING` | 638 (zero headroom, per F10) | 638 ceiling, 638 measured problems | `tests: PASS`, exit `0` |

Commands and final lines:

```
$ node meta/lintScoped.cjs --src
✖ 1089 problems (0 errors, 1089 warnings)
production: PASS
```

```
$ node meta/lintScoped.cjs --tests
✖ 638 problems (0 errors, 638 warnings)
tests: PASS
```

0 eslint errors in both scopes; all problems are warnings, which are ceiling-managed. Neither
`SRC_CEILING` nor `TESTS_CEILING` was edited in `meta/lintScoped.cjs` — there was nothing to
re-pin, because the measured count did not move from its pre-change value in either scope, and no
other file's warning count changed.

## Prettier check paths

Command: `npx prettier --check src/backend/signInProbe/classify.ts src/backend/signInProbe/runnerProbes.ts src/backend/signInProbe/__tests__/classify.test.ts src/backend/storeManagers/nile/__tests__/librarySyncLatchClear.test.ts meta/lintScoped.cjs`

Result: `All matched files use Prettier code style!` (exit `0`). All five paths report
`{ "ignored": false, ... }` under `--file-info` (the four TypeScript sources as `"typescript"`,
`meta/lintScoped.cjs` as `"babel"`), so this check is real assurance, not vacuous, for every path
in scope — including `meta/lintScoped.cjs`, even though that file was ultimately not modified (see
the lint-ceiling section above).

**Task 3's `git mv`'d todo file is deliberately NOT prettier-checked**, per the plan: `.planning/`
markdown reports `{ "ignored": true, "inferredParser": null }` under `--file-info`, so a `--check`
over it would be vacuous and was correctly omitted from this plan's `<verify>` blocks.

## `pnpm planning-gates`

Command: `pnpm planning-gates`

```
[PASS] .../currency-gate.py
[PASS] .../ported-channels-gate.py (x3)
[PASS] .../seam-parity-sweep-gate.py
[PASS] .../preload-surface-gate.py
[PASS] .../model-a-retirement-gate.py
[PASS] .planning/planning-envelope-tag-gate.py
[PASS] .planning/planning-frontmatter-gate.py
[PASS] .planning/state-sdk-field-anchor-gate.py
[PASS] .planning/todos/todo-frontmatter-gate.py

12/12 planning gates passed.
```

## T-49-09 source gate / stale-reference greps

- `classify.ts` still has exactly one import, and it is the type-only `import type { SignInProbeOutcome } from 'common/signInState'` — confirmed by both the existing T-49-09 test and a manual `grep -cE "^import "` count of 1.
- `grep -rl "amazon-latch-never-clears" src/backend/signInProbe/ src/backend/storeManagers/nile/` — **0 matches** (exit 1). No signInProbe source file still points at the pending todo's filename.
- `grep -n "261016-n7s" src/backend/signInProbe/classify.ts src/backend/signInProbe/runnerProbes.ts` — present in both files, naming this quick task as the resolution.

## What was deliberately NOT run

**No live gate against a real zero-installed Amazon profile was run for this fix.** The induction
live gate that proved the Amazon marker strings (A3/A6: `<Response [400]>` for a dead refresh
token) already ran in quick 261015-rud and is not re-derived here. This plan's fix observes a spawn
(`nile library sync`) that already happens on every library refresh rather than issuing any new
command, so it introduces no new runner-output shape that would require fresh induction — the only
new surface is the Node-side classifier and observer wiring, both covered by jest with the real
marker strings from F1 (byte-confirmed against the shipped nile v1.2.0 binary and the 261015-rud
evidence log), driven through a spy per the fake-HOME two-profile rule, never a real `nile` binary.

## Deviations from Plan

**1. [Not a bug — measured reality differed from the plan's F10 prediction] `TESTS_CEILING` did not need re-pinning.**
- **Found during:** Task 2, after writing the 7 classifier rows, the T-49-09 extension, and the 3
  new library test arms.
- **What the plan expected:** F10 stated the ceiling "starts at 638 with zero headroom and the new
  test file necessarily exceeds it," citing a planning-time measurement of ~22 new warnings
  (`no-unsafe-assignment`, `no-unsafe-call`, `no-unsafe-member-access`, `unbound-method`) from an
  earlier draft of `librarySyncLatchClear.test.ts`.
- **What was measured instead:** with both new/modified test files in the tree (all of Task 1 and
  Task 2's code), `node meta/lintScoped.cjs --tests` reports exactly 638 problems, unchanged, exit
  `0`. Neither `librarySyncLatchClear.test.ts` nor `classify.test.ts` appears anywhere in the
  warning output.
- **Why it differed:** the actual implementation types `jest.spyOn(mgr, 'runRunnerCommand')`'s
  mock implementation against the real `CallRunnerOptions` parameter type (imported from
  `common/types`) rather than casting through an untyped local type alias or `any` — this was
  itself a deviation forced by a `pnpm codecheck` TS2345 error during Task 1 (see Task 1's own
  commit), and it happens to be exactly the kind of typing that avoids the
  `no-unsafe-*`/`unbound-method` warning families F10 predicted.
- **Action taken:** did not edit `meta/lintScoped.cjs`. Documented the before/after measurement
  here instead of narrating a bump that would have been factually wrong (a ceiling bump requires
  "N-1 RED, N GREEN"; 638 is already GREEN, so bumping it would violate the zero-padding rule this
  file's own house style enforces). No commit touches `meta/lintScoped.cjs`.
- **Files modified:** none (this is a non-change, recorded for calibration).
- **Commit:** n/a.

No other deviations. Tasks 1-3 were otherwise executed as written, including the `try/catch`
scope decision in Task 1 (wrapping the entire new block, including the spawn call itself, not just
post-spawn logic) reasoned through at execution time to satisfy both of Task 2's planned
throw-forcing mechanisms with a single enclosing boundary.

## Known Stubs

None. No hardcoded empty value, placeholder text, or unwired data source was introduced by this
plan.

## Threat Flags

None beyond the plan's own `<threat_model>` register (T-N7S-01 through T-N7S-04, T-N7S-SC), all of
which were already dispositioned and mitigated/accepted in the plan itself and verified against the
actual implementation above (capture never logged on any path including the catch; the `try/catch`
covers the spawn call itself per T-N7S-04; no new dependency per T-N7S-SC).

## Self-Check

- `src/backend/signInProbe/classify.ts` — FOUND
- `src/backend/signInProbe/runnerProbes.ts` — FOUND
- `src/backend/signInProbe/__tests__/classify.test.ts` — FOUND
- `src/backend/storeManagers/nile/library.ts` — FOUND
- `src/backend/storeManagers/nile/__tests__/librarySyncLatchClear.test.ts` — FOUND
- `.planning/todos/completed/2026-10-15-amazon-latch-never-clears-on-a-zero-installed-profile.md` — FOUND
- `.planning/todos/pending/2026-10-15-amazon-latch-never-clears-on-a-zero-installed-profile.md` — CONFIRMED ABSENT (moved)
- Commit `36b9002730e47d25f1e2056046156eadb19b39ae` — FOUND in `git log --oneline --all`
- Commit `f140386ecb711b0fb8597f0b5164f3637e783d2f` — FOUND in `git log --oneline --all`
- Commit `60023a86ea1fc8275711276077800e8d9c19bb98` — FOUND in `git log --oneline --all`

## Self-Check: PASSED

## graphify

`graphify update .` was run after the last code commit (AST-only, no LLM). It rebuilt
58,041 nodes / 66,969 edges / 5,092 communities and reported `graph.json`, `graph.html` and
`GRAPH_REPORT.md` updated in `graphify-out/`. `graphify-out/` is fully gitignored
(`.gitignore:63`), so `git status` shows no changes there regardless of what graphify wrote —
nothing was committed from `graphify-out/`, consistent with the instruction not to commit it
unless the plan says so (it does not).
