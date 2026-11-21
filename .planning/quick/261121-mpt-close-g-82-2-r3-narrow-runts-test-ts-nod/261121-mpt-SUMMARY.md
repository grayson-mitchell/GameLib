---
phase: quick-261121-mpt
plan: 01
subsystem: tests
tags: [jest, meta, runTs, fake-timers, flake, uat-gap]
requires: []
provides:
  - runTs C3-01/E-02 pins narrowed to the compile-then-run outfile
  - steamBridgeKnownFixes registry-timeout tests waiting by real time
  - triaged todo for the macOS steampoll watchdog grandchild flake
affects: [meta/__tests__/runTs.test.ts, src/backend/__tests__/steamBridgeKnownFixes.test.ts]
key-files:
  modified:
    - meta/__tests__/runTs.test.ts
    - src/backend/__tests__/steamBridgeKnownFixes.test.ts
  created:
    - .planning/todos/pending/2026-11-21-steampoll-watchdog-grandchild-test-flakes-on-macos.md
decisions:
  - "Narrow the runTs pins rather than move codecheck's tsc buildinfo: tsc incremental state is never executed, so it is not the C3-01 hazard"
  - "Local copy of yieldUntil in steamBridgeKnownFixes.test.ts, not a shared util"
metrics:
  duration: ~35 min
  completed: 2026-11-21
status: complete
commits: 3
plan_head_before: 2b35a3f48bdd9eb961f3e7997748d81c2ad610ea
plan_head_after: a354ce4b705fd10f98cd170c994743a815675bda
actuals:
  tokens: 14000
  tasks: 3
  commits: 3
---

# Phase quick-261121-mpt Plan 01: Close G-82-2-r3 Summary

Narrowed the two deterministic runTs pins to the compile-then-run outfile (package.json untouched), replaced the turn-counted registry-timeout wait with a real-time `yieldUntil` proven by RED/GREEN/mutant and a 10/10 soak, and filed a todo for the macOS steampoll flake.

## Decisions

1. **Narrow the pins, do not move the buildinfo.** The test titles already target the compile-then-run outfile, so the predicate was wrong, not `codecheck`. tsc's incremental state under `node_modules/.cache` is never executed, so no invocation can run another's output through it. `package.json` is byte-identical to HEAD and `codecheck` keeps both `--incremental` flags. E-02 pin 1's premise is restated (no script compiles a runnable outfile there) and enforced by its first expect; its meta/*.ts source check keeps the bare path.
2. **Local `yieldUntil`, not a shared util.** The copy keeps the diff in the failing file and leaves 82-20's green `sharedRedistInstall.test.ts` and its recorded proof untouched. The comment names its twin so a third user (likely the bootstrap legacy-zoom todo) can extract both.

## Task results

### Task 1: runTs pins (c540e9769)

- `SHARED_CACHE_OUTFILE` matches esbuild `--outfile`/`--outdir` into node_modules/.cache or a .js/.cjs/.mjs path there. Vacuity guard now covers outfile, outdir and extensionless shapes plus an `incremental-state` negative control.
- File: 13 passed, 0 failed (HEAD: 11 passed, 2 failed).
- Mutation check (temporary copy pointed at a mktemp package.json carrying a retired-shape `zz-outfile-mutant` script; real package.json never written). Both pins failed naming the script:

```
no package.json script value references ... -> failed
  - Array []  + Array [ "zz-outfile-mutant", ]
pin 1 (derived negative) ... -> failed
  - Array []  + Array [ "zz-outfile-mutant", ]
```

### Task 2: registry-timeout wait (5e700a0cf)

- Sibling census: one `useFakeTimers` site and one turn-counted loop in the file, so only that test needed converting.
- Added `REGISTRY_TIMEOUT_TEST_TIMEOUT_MS = 30_000`, load-time `realNow`/`realSetTimeout`, `REAL_WAIT_DEADLINE_MS = 15_000`, `SLOW_REG_READ_MS = 250`, local `yieldUntil`, and a slowed-path test (readFile spy on `fs.promises`, `mockRestore()` in `finally`).
- RED with the old 20-turn wait:

```
expect(jest.fn()).toHaveBeenCalledTimes(expected)
Expected number of calls: 1
Received number of calls: 0
```

- GREEN with `yieldUntil`: file 82 passed, 0 failed (HEAD: 81).
- 5 ms deadline mutant: slowed test fails (`mutant failed 1 passed 0 rt 0`).
- Soak: `soak passed 10/10 with 60 busy loops` (30 cores x 2). Supplementary only; the binding proof is RED plus the mutant.

### Task 3: todo (a354ce4b7)

`.planning/todos/pending/2026-11-21-steampoll-watchdog-grandchild-test-flakes-on-macos.md` with `severity: medium`, `platform: macos`, `ready: code` in order. Todo gate passes; no Rust file touched. Prettier ignores this path, so no `--check` was run on it (it would be vacuous).

## Verification

- Full Meta project: 0 failed; 86 suites passed, 2 skipped; 2760 passed, 17 skipped, 2777 total (HEAD baseline: 2 failed, 2758 passed).
- `pnpm planning-gates` exit 0.
- `git status` for package.json, knownFixesRegistry.ts, bridgeKnownFixes.ts and the steampoll crate is clean; no `*Mutant*` files remain.
- `npx prettier --check` and `eslint` pass on both test files; `pnpm codecheck` passes.

## Deviations from Plan

None - plan executed exactly as written. Commits landed on `main`, which the Step 0 guard permits because `.planning/config.json` sets `git.allow_default_branch_commits: true`.

## Known Stubs

None.

## Handoff

Nothing is pushed. After the operator pushes, re-test UAT item 2 with `/gsd-verify-work 82`. The Rust test macOS leg can still go red on the steampoll flake until the todo is worked.

## Commits

- c540e9769 test(quick-261121-mpt): narrow runTs C3-01/E-02 pins to the compile-then-run outfile
- 5e700a0cf test(quick-261121-mpt): bound steamBridgeKnownFixes registry-timeout wait by real time
- a354ce4b7 docs(quick-261121-mpt): todo for the macOS steampoll watchdog grandchild flake

## Self-Check: PASSED

All three files exist and all three commit hashes are ancestors of HEAD.
