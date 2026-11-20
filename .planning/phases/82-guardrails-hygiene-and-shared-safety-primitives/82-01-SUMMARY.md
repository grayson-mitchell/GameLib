---
phase: 82-guardrails-hygiene-and-shared-safety-primitives
plan: 01
subsystem: testing
tags: [jest, ratchets, rust-ci, clippy, test-ledger, census-gates]

requires:
  - phase: 78-verification-records-and-test-health-after-v0-9
    provides: the 78-TEST-HEALTH ledger shape and the D-02 clean-worktree measurement method
provides:
  - 82-TEST-LEDGER.md, the measured red set, gate table, skipped/flaky/CI-only sections and fix commits
  - every measured red jest suite fixed (none skipped, deleted or retired), 9 in total
  - both D-20 Rust CI reds fixed (macOS clippy deprecation, three Windows depot fetch tests)
affects: [82-02, 82-11, 82-12]

actuals:
  tokens: 15569
  tasks: 3
  commits: 8

plan_head_before: 8ba2ba40a33fd294198eaeff476bec1b180547c8
plan_head_after: c33c9692d626d59f0ca1f3c3700a049b268ffc76

tech-stack:
  added: []
  patterns:
    - "optional trailing collaborators parameter with real defaults, so a test passes fakes instead of jest.mock"
    - "whitespace-tolerant regex anchors for source-mutation tests, each asserting the mutated text differs"
    - "dead-host test fixture that accepts and drops connections, so it fails fast on every OS"

key-files:
  created:
    - .planning/phases/82-guardrails-hygiene-and-shared-safety-primitives/82-TEST-LEDGER.md
  modified:
    - src/backend/__tests__/storeKinds.test.ts
    - src/backend/stores/__tests__/fixtures/registeredStores.json
    - src/backend/__tests__/tauriShellSource.test.ts
    - src/backend/__tests__/steamAuthSessionPolicy.test.ts
    - src/backend/__tests__/steamCmPortComplete.test.ts
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - src/backend/storeManagers/steam/validateNative.ts
    - src/backend/storeManagers/steam/verifyBridge.ts
    - src/backend/storeManagers/steam/__tests__/validateNative.test.ts
    - src/backend/storeManagers/steam/__tests__/verifyBridge.test.ts
    - src/backend/storeManagers/steam/depotRust/__tests__/rustVerify.test.ts
    - meta/backendDiCeilings/storeManagers.steam.json
    - meta/__tests__/x86CallbackWineHarness.test.ts
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/expected.json
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/invocations.json
    - src-tauri/crates/gamelib-steamfiles/tests/fixtures/rust-results.json
    - src-tauri/crates/gamelib-steampoll/tests/adoption.rs
    - src-tauri/crates/gamelib-depot/tests/fetch.rs

key-decisions:
  - "steam_direct_launch_verdict is pinned kind cache (a derivable eligibility verdict, per storeKinds.test.ts's cache-vs-user-state rule)"
  - "themeTokens census re-derived 34 -> 39 per site: five pure button is-text sites, none escaped the contrast census"
  - "validateNative/verifyBridge gain an optional collaborators parameter rather than a baseline entry, because a new jest.mock has no baseline by contract"
  - "the three Windows depot fetch tests get a drop-on-accept dead host instead of wider timing windows"

requirements-completed: [FND-01]

coverage:
  - id: D1
    description: "A trustworthy clean-worktree red set and the 82-TEST-LEDGER.md that records it (head sha, counts, per-suite verdicts, gates, skipped, flaky, CI-only reds)"
    requirement: FND-01
    verification:
      - kind: other
        ref: "grep -c '^## Measured red set' 82-TEST-LEDGER.md (1); all nine headings present"
        status: pass
    human_judgment: false
  - id: D2
    description: "Every measured red jest suite is green by fixing, with no suite skipped, deleted or retired and no baseline, ceiling or floor widened"
    requirement: FND-01
    verification:
      - kind: unit
        ref: "pnpm exec jest --runTestsByPath <the 11 touched suites>: 11 passed, 689 tests"
        status: pass
      - kind: other
        ref: "clean-worktree full pnpm test at a4f3660d0: 1 failed of 1086 (the x86 harness), fixed in aae024262 and re-run green"
        status: pass
    human_judgment: false
  - id: D3
    description: "backend-di-ceilings is green again with no baseline added"
    requirement: FND-01
    verification:
      - kind: other
        ref: "pnpm backend-di-ceilings: PASS jestMock=1865 (448 files)"
        status: pass
    human_judgment: false
  - id: D4
    description: "macOS clippy deprecated warning gone without a ceiling; Windows depot fetch tests fixed from the CI log diagnosis"
    requirement: FND-01
    verification:
      - kind: other
        ref: "cargo clippy -p gamelib-steampoll --all-targets -- -D warnings; cargo test -p gamelib-steampoll --test adoption; cargo test -p gamelib-depot --test fetch (21 passed, 5 repeats)"
        status: pass
    human_judgment: false
  - id: D5
    description: "The Windows leg of the depot fetch fix"
    requirement: FND-01
    verification: []
    human_judgment: true
    rationale: "Only a windows-latest CI run can prove it; plan 82-11 collects that run. Local proof is macOS only."

duration: 70min
completed: 2026-11-20
status: complete
---

# Phase 82 Plan 01: Test Ledger and Red Set Fixes Summary

**Clean-worktree re-measure of the whole D-01 gate set found 9 red suites and 2 red gates (the research listed 5 and 1); all 9 suites are fixed with no skip, deletion or widened pin, and both D-20 Rust CI reds are fixed.**

## Performance

- **Duration:** about 70 min
- **Completed:** 2026-11-20
- **Tasks:** 3 of 3
- **Files modified:** 18 (1 created)

## Accomplishments

- Measured from a `git worktree add --detach` checkout of `8ba2ba40a` with its own `pnpm install --frozen-lockfile` (never a symlinked `node_modules`): `Test Suites: 7 failed, 5 skipped, 1074 passed, 1081 of 1086 total`, plus `backend-di-ceilings` and `planning-gates` red. `82-TEST-LEDGER.md` holds the measured head, counts, red-set table, gate table, skipped and flaky lists and the CI-only reds, in the 78-TEST-HEALTH shape.
- The five researched reds, each fixed by its cause:
  - `storeKinds` and `createStores`: `steam_direct_launch_verdict` pinned as `cache` in `EXPECTED_KINDS` and `registeredStores.json` (commit `7c7c266ff`).
  - `tauriShellSource`: both NARROWNESS mutations re-anchored on a whitespace-tolerant regex tied to the census arm's return, each asserting the mutated text differs, plus an exactly-once anchor case (`013e721c8`).
  - `acfUpdateReplay`: hand-written `readLocalConfigBetaKey/playtime/{10,20,99,abc}` oracle cases with the source-of-truth note, new invocations, and `rust-results.json` re-recorded by the cargo golden test, which passes (`013e721c8`).
  - `themeTokens`: census re-derived 34 to 39 per site; the folded todo is closed with that decision (`013e721c8`, `7c381759f`).
- Four reds the research did not see, found by the clean-worktree measurement and its post-fix re-measure:
  - `backend-di-ceilings` (quick 261120-p2j tests): `validateNative` and `verifyBridge` take an optional collaborators parameter, and their tests plus `rustVerify.test.ts` carry no `jest.mock` (4 + 6 + 4 violations gone); the `games.test.ts` baseline fell 46 to 45 as the gate demanded (`7eabdc489`).
  - `steamAuthSessionPolicy` Rule E: `depotRust/verify.ts` added to `ACQUIRE_AUTH_ALLOW` with its reason (`7eabdc489`).
  - `steamCmPortComplete`: the `meta/` scan skips the transient `runTs.__probe__` file another suite writes (`7eabdc489`).
  - `x86CallbackWineHarness`: allow-list gains CBREG (slot 15, since `dc69dcf5b`); hidden from the first pass because the suite silently skips without the pinned zig (`aae024262`).
- D-20: `adoption.rs` slow-slot take is a `compare_exchange` loop, no ceiling or allow attribute; the three Windows `gamelib-depot` tests use a host that accepts and drops connections (`a4f3660d0`).

## Task Commits

1. **Task 1: measurement, ledger, first red (tracer):** `7c7c266ff`
2. **Task 2: remaining jest reds and the folded todo:** `7eabdc489` (reds the research did not see), `013e721c8` (tauriShellSource, acfUpdateReplay fixtures, themeTokens), `7c381759f` (todo closed, ledger shas)
3. **Task 3: Rust CI reds:** `a4f3660d0`
4. **Found by the post-fix re-measure:** `aae024262` (x86 harness), `c33c9692d` (ledger: CI rows, after-fix section)

`git rev-list --count 8ba2ba40a..c33c9692d` is 8: the seven commits above plus `fd9f73f53`, the other session's spike-091 docs commit, which landed in the same range.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] backend-di-ceilings red from the p2j Verify tests** (Task 2)
- **Found during:** Task 1 measurement (the research listed the gate as PASS at `21a22ad78`; HEAD had moved)
- **Issue:** three new tests carried 14 `jest.mock` calls with no baseline entry, and the `games.test.ts` count had fallen below its baseline.
- **Fix:** collaborators seam in `validateNative.ts`/`verifyBridge.ts` (defaults are the real functions, so `gameMaintenance.ts` callers are unchanged), real `selectAllDepots` driven through the fake client in `rustVerify.test.ts`, and `initHeadless()` instead of a logger mock. Baseline lowered only where the gate demanded a shrink.
- **Files modified:** the five Steam files and the shard listed above
- **Commit:** `7eabdc489`

**2. [Rule 1 - Bug] steamAuthSessionPolicy Rule E, steamCmPortComplete race** (Task 2)
- **Found during:** Task 1 measurement
- **Fix:** allow-list entry with reason; scan skips the transient probe file. Also recorded as observed-flaky.
- **Commit:** `7eabdc489`

**3. [Rule 1 - Bug] x86CallbackWineHarness red** (after Task 3)
- **Found during:** the post-fix full re-measure. The first measurement passed it in 123 ms because the suite returns early when `.build-tools/zig/zig` is absent; with zig it runs and fails, and also fails at `8ba2ba40a`, so it predates this plan.
- **Fix:** `SLOT_CBREG = 15` allowed, with the frame shape asserted.
- **Commit:** `aae024262`

**Total deviations:** 3 auto-fixed (all Rule 1). **Impact:** the red set grew from 5 jest suites and 1 gate to 9 suites and 2 gates; all fixed in scope, none retired, so "Retirement proposals" stays "None proposed."

### Acceptance-criterion note

Task 3's criterion `git diff --quiet 58a0c1c7a -- meta/clippyRatchet.cjs` does not exit 0: the other session's quick 261120-pp4 (`fbe89d867`) lowered two `match_like_matches_macro` ceilings (a shrink). This plan touched no clippy ceiling and added none; the intent of the criterion (no ceiling added by this plan) holds.

## Known Stubs

None.

## Threat Flags

None. No new endpoint, auth path or trust-boundary surface (the `acquireAuthenticated` allow-list entry records existing behaviour of the p2j Verify job).

## Next Phase Readiness

- Plan 82-11 owns: the Windows CI proof for the depot fetch fix, the macOS/Windows clippy CI legs, and `planning-gates` (red 11/12 only on `.planning/STATE.md` field anchors, a mid-milestone-transition artifact).
- No retirement proposals are waiting for plan 82-12.
- The silent-skip shape (early-return suites such as `x86CallbackWineHarness`) is recorded in the ledger; a gate for it is not in this plan.

## Self-Check: PASSED

- 82-TEST-LEDGER.md, this SUMMARY and all key files exist; commits `7c7c266ff`, `7eabdc489`, `013e721c8`, `7c381759f`, `a4f3660d0`, `aae024262`, `c33c9692d` are ancestors of HEAD.
- The 11 touched jest suites pass (689 tests); cargo clippy/test/fmt for `gamelib-steampoll` and `gamelib-depot` pass locally; `pnpm codecheck`, `backend-di-ceilings`, `steam-line-ceiling`, `gameinfo-narrowing-ceiling`, `find-deadcode`, `lint`, `i18n --fail-on-update` pass in the clean worktree.
