---
phase: 43
slug: humble-keys-screen-unified-list-replacing-the-three-tabs-wit
status: approved
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-09
wave_0_verified: 2026-09-25
---

# Phase 43 — Validation Strategy

> Per-phase validation contract and feedback sampling during execution.
> Derived from `43-RESEARCH.md`'s `## Validation Architecture` section (lines 462-513),
> whose claims were verified against the repo in that session.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Jest 29 + ts-jest |
| **Config file** | `src/backend/jest.config.js`, `src/frontend/jest.config.js` (both `rootDir: '../..'`, invoked via the root `jest.config.js`'s `projects` array) |
| **Quick run command** | `npx jest <path/to/file.test.ts> --selectProjects Backend --passWithNoTests` (positional test-path form — see "Two jest gotchas" below for why `-t` is banned in this phase's commands) |
| **Full suite command** | `npx jest --selectProjects Backend Frontend Common` |
| **Estimated runtime** | Not measured this phase — measure once during Wave 0 and record here rather than guessing |

### Where the pure modules are tested

`src/common/humble/*` has **no dedicated jest project**. Its pure modules are tested from the
**Backend** project — `viewFilters.test.ts` and `groupKeys.test.ts` live under
`src/backend/humble/__tests__/`, not under `src/common`. A new test for a `src/common` module
must be placed accordingly or it will not be collected by any project.

### Frontend DOM capability: NONE

`src/frontend/jest.config.js` uses Jest's default `testEnvironment: 'node'`. There is no jsdom,
no `jest-environment-jsdom`, and no `react-test-renderer`. Component tests call the exported
function component directly (`HumbleKeyRow({...props})`) and walk the returned React element
object graph.

**What that proves:** which props were passed to which child element, which `className` strings
are present, whether an `onClick` prop exists, and structural presence/absence.

**What it cannot prove:** pixel geometry, wrapping, stacking, paint, or computed style. Any
requirement whose truth condition is visual is **not** unit-testable in this repo. Writing a
component test that appears to cover REQ-43-19 would produce a green assertion that measures
nothing — the exact failure class this document exists to prevent.

---

## Sampling Rate

- **After task commit:** `npx jest <path to the test file scoped to the module touched> --selectProjects Backend --passWithNoTests`
- **After plan wave:** `npx jest --selectProjects Backend Frontend Common`
- **Before `/gsd-verify-work`:** full suite green **AND** `pnpm codecheck`/`tsc` green **AND**
  `meta/i18nGateScope.json` reflects the four deletions **AND** the REQ-43-19 live gate run and
  recorded
- **Max feedback latency:** to be measured in Wave 0, not assumed

### Two jest gotchas that make a zero-test run look like success

Both are documented in this repo's own institutional memory and both apply directly here:

1. **`--selectProjects` is case-sensitive and exits 0 when it matches no project.** `Backend` is
   correct; `backend` silently selects nothing. **Always read the reported test count, never just
   the exit code.**
2. **`-t` is a regex.** A literal `(` in a pattern matches zero tests and still exits 0.

A task whose acceptance criterion is "the command exits 0" is satisfied by both failure modes.
Acceptance criteria in this phase must assert a **test count or a named test passing**, not an
exit code.


### Argument order is load-bearing: path BEFORE `--selectProjects`

Measured live during 43-04, then re-confirmed with `--listTests`:

    npx jest --selectProjects Backend src/backend/humble/__tests__/viewFilters.test.ts  -> 213 test files
    npx jest src/backend/humble/__tests__/viewFilters.test.ts --selectProjects Backend  ->   1 test file

`--selectProjects` takes a variadic list, so it greedily swallows the following positional path as
another project name and the path never filters anything. The command still exits 0 and still
prints a large green total, so it reads as a pass while measuring the whole project rather than
the file under test. This is a third member of the same family as the two gotchas above, and it
is why an earlier verification run of `hardcodedStringGate.test.ts` took 32 minutes and returned a
39-suite aggregate instead of one file's count.

**Every command in this document puts the path first.** Any command copied out of here must keep
that order.

---

## Per-Task Verification Map

Task IDs are assigned by the planner. This table is seeded from the research's requirement→test
map and **must be completed with real task IDs during planning** — an unpopulated row is a
Dimension 8 hole, not a formality.

**Three commands the seeded table got wrong are corrected here, per Task 3's mandate:** the
seeded table's `-t`-filtered greps for the literal patterns `compareWaiting`, `Redeemable` and
`search` (against the `Backend` project) each match ZERO tests today and exit 0 (measured this
session: `Tests: 4786 skipped, 4786 total`, exit 0 for all three). Every row below uses the
positional test-path form plus an asserted test
count instead. Measured pre-phase baselines used as the reference point: `viewFilters.test.ts`
35 passed, `groupKeys.test.ts` 12 passed, `HumbleKeyRow/__tests__/index.test.tsx` 47 passed,
`All/__tests__/index.test.tsx` 9 passed, `Waiting/__tests__/index.test.tsx` 13 passed,
`HumbleClaimWizard/__tests__` 17 passed, `meta/__tests__/genI18nGateScope.test.ts` 26 passed /
1 skipped, `meta/__tests__/hardcodedStringGate.test.ts` 151 passed (73s). The i18n gate's exact
command name (previously flagged as unverified) is resolved: the gate is the `Meta` jest
project's `meta/__tests__/hardcodedStringGate.test.ts` (reading `meta/i18nGateScope.json` via
`meta/hardcodedStringGate.ts:1815`), and the scope-artifact ratchet is
`meta/__tests__/genI18nGateScope.test.ts` — there is no separate CI script name.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 43-06 T2 | 43-06 | 2 | REQ-43-01 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 70 | Exists | ⬜ pending |
| 43-06 T3 | 43-06 | 2 | REQ-43-02 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 70 | Exists | ⬜ pending |
| 43-06 T3 | 43-06 | 2 | REQ-43-03 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 70 | Exists | ⬜ pending |
| 43-07 T1 | 43-07 | 3 | REQ-43-04 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/__tests__/index.test.tsx --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 33 | Exists | ⬜ pending |
| 43-04 T3 | 43-04 | 1 | REQ-43-05 | — | N/A | unit | `npx jest src/backend/humble/__tests__/viewFilters.test.ts --selectProjects Backend` — expect `Tests: N passed, N total`, N > 35 (baseline 35) | Exists | ⬜ pending |
| 43-07 T1 | 43-07 | 3 | REQ-43-06 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/__tests__/index.test.tsx --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 33 | Exists | ⬜ pending |
| 43-04 T3 | 43-04 | 1 | REQ-43-07 | — | N/A | unit | `npx jest src/backend/humble/__tests__/viewFilters.test.ts --selectProjects Backend` — expect `Tests: N passed, N total`, N > 35 (baseline 35) | Exists | ⬜ pending |
| 43-07 T1 | 43-07 | 3 | REQ-43-08 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/__tests__/index.test.tsx --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 33 | Exists | ⬜ pending |
| 43-04 T2 | 43-04 | 1 | REQ-43-09 | — | N/A | unit | `npx jest src/backend/humble/__tests__/viewFilters.test.ts --selectProjects Backend` — expect `Tests: N passed, N total`, N > 35 (baseline 35) | Exists | ⬜ pending |
| 43-06 T1 | 43-06 | 2 | REQ-43-10 | — | N/A | unit | `npx jest src/backend/humble/__tests__/keyTypePresentation.test.ts --selectProjects Backend` — expect `Tests: N passed, N total`, N >= 60 (baseline 47) | Exists | ⬜ pending |
| 43-06 T2 | 43-06 | 2 | REQ-43-11 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 70 | Exists | ⬜ pending |
| 43-06 T3 | 43-06 | 2 | REQ-43-12 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 70 | Exists | ⬜ pending |
| 43-05 T3 | 43-05 | 1 | REQ-43-13 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 52 (baseline 47) | Exists | ⬜ pending |
| 43-05 T3 | 43-05 | 1 | REQ-43-14 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 52 (baseline 47) | Exists | ⬜ pending |
| 43-05 T3 | 43-05 | 1 | REQ-43-15 | — | N/A | component (structural: walk element tree for onClick/href) | `npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 52 (baseline 47) | Exists | ⬜ pending |
| 43-07 T2 | 43-07 | 3 | REQ-43-16 | — | N/A | component/router | `npx jest src/frontend/screens/Humble/Keys/__tests__/index.test.tsx --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 33 | Exists | ⬜ pending |
| 43-08 T2 | 43-08 | 4 | REQ-43-17 | — | N/A | source census | `grep -rn "partitionWaitingByUrgency\|HumbleKeyGroup\|groupAndSortKeys" src/ --include="*.ts" --include="*.tsx"` — expect 0 hits | N/A (shell) | ⬜ pending |
| 43-08 T2 | 43-08 | 4 | REQ-43-18 | — | N/A | build/typecheck + source census | `npx tsc --noEmit && test ! -f src/common/humble/groupKeys.ts` — expect exit 0 and file absent (note: `selectKeysWaiting` is explicitly OUT of this requirement's scope, see REQUIREMENTS.md correction 1) | N/A (shell) | ⬜ pending |
| 43-10 T2 | 43-10 | 5 | REQ-43-19 | — | N/A | **live gate only** | N/A — packaged Tauri build, pixel-measured column geometry + row-separator hairline, per the Structural Reachability Review contract | N/A by design | ⬜ pending |
| 43-07 T1 | 43-07 | 3 | REQ-43-20 | — | N/A | component | `npx jest src/frontend/screens/Humble/Keys/__tests__/index.test.tsx --selectProjects Frontend` — expect `Tests: N passed, N total`, N >= 33 | Exists | ⬜ pending |
| 43-04 T2 | 43-04 | 1 | REQ-43-21 | — | N/A | unit | `npx jest src/backend/humble/__tests__/viewFilters.test.ts --selectProjects Backend` — expect `Tests: N passed, N total`, N > 35 (baseline 35) | Exists | ⬜ pending |
| 43-08 T1 | 43-08 | 4 | REQ-43-22 | — | N/A | CI gate | `npx tsc --noEmit && npx jest meta/__tests__/genI18nGateScope.test.ts --selectProjects Meta` — expect `Tests: 26 passed, 1 skipped, 27 total` and zero failures (measured pre-phase shape; the four deleted files must no longer appear in either `meta/i18nGateScope.json` or `meta/i18nForkTouchedFiles.json`) | Exists | ⬜ pending |
| 43-06 T2 | 43-06 | 2 | REQ-43-23 | T-43-01 (secret in log) | `aria-label` stays an expression, never a literal | CI gate | `npx jest meta/__tests__/hardcodedStringGate.test.ts --selectProjects Meta` — expect `Tests: 151 passed` (baseline; ~73s runtime, a timeout is not a pass) | Exists | ⬜ pending |
| 43-09 T1 | 43-09 | 4 | REQ-43-24 (CONDITIONAL) | — | N/A | conditional — candidate-dependent | Candidate A only: `npx jest src/backend/humble/__tests__/adapter.test.ts --selectProjects Backend` — expect `Tests: N passed, N total` with zero failures. **Blocked until D-43-11's probe (plan 43-03) selects a candidate**; if candidate B or the external-browser fallback is selected instead, this row's command does not apply and the Manual-Only Verifications table's REQ-43-24 row governs. | Exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

> **All six TICKED 2026-09-25 (quick `260925-e4d`), each against the artifact on disk — not
> against a plan summary claiming it.** This checklist had sat entirely unticked since 2026-09-09
> while every item was in fact delivered during execution; `status:` and `wave_0_complete:` were
> stale in the same way. The per-item evidence is recorded inline below.

- [x] New unit case in `src/backend/humble/__tests__/viewFilters.test.ts` pinning the **undated-key
      tiebreak** — the case that differentiates `compareWaiting` from the deleted
      `byExpiringSoonest` (REQ-43-05). A test that passes against either comparator proves nothing
      about which one shipped.
      **Evidence:** `viewFilters.test.ts:160`, `'two undated keys supplied out of alphabetical
      order sort alphabetically by title'` — and its comment at `:156` names exactly why this is
      the differentiating case: the deleted comparator returned `0` for two undated keys.
- [x] New title-only search predicate + its test file (REQ-43-09), placed so the Backend project
      collects it.
      **Evidence:** `matchesKeySearch` at `src/common/humble/viewFilters.ts:102`; the
      differentiating case is `viewFilters.test.ts:307`, `'a query matching only origin returns no
      match'`.
- [x] New leaf module for `GENERIC_KEY_PLATFORM` (relocated out of `groupKeys.ts` before that file
      is deleted) — a constant, so no test of its own is strictly required, but **both existing
      importers' tests must still pass after the repoint**.
      **Evidence:** `src/common/humble/genericKeyPlatform.ts:25`; `groupKeys.ts` is gone, and both
      importers' suites pass.
- [x] Full rewrite of `HumbleKeyRow/__tests__/index.test.tsx` against the new KEY-column-scenario
      prop shape, re-pinning every "must survive" assertion from the research's Deleted-Tab
      Salvage section.
      **Evidence:** file present and green in the 2026-09-25 run.
- [x] New test file for the unified list screen, replacing `Waiting/__tests__/index.test.tsx` and
      `All/__tests__/index.test.tsx`. Their existing assertions must be **triaged individually** —
      neither bulk-deleted nor bulk-copied. Some pin behaviour that legitimately changes; some pin
      behaviour that must not.
      **Evidence:** `src/frontend/screens/Humble/Keys/__tests__/index.test.tsx`; both tab test
      files are gone.
- [x] A live-gate contract for REQ-43-19, authored per
      `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`'s
      Structural Reachability Review (all seven tests) **before** the gate's first live run.
      **Evidence:** `43-LIVE-GATE.md` § "Structural Reachability Review" (line 76), authored
      before run 1 on 2026-09-11. Recorded honestly: that review is also where the run found four
      contract defects of its own, three sharing one blind spot — it never checked that its own
      instructions would execute.

**Measured 2026-09-25 across the whole checklist:** 205/205 Humble frontend+common tests (8
suites), 61/61 `viewFilters`, 155/155 hardcoded-string gate, `pnpm codecheck` exit 0.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `TYPE` and `KEY` column widths identical across the header row and every KEY-scenario row shape (full-width button / side-by-side pair / bare text); row separator renders as a hairline | REQ-43-19 | The frontend jest project has no jsdom and no browser automation. Column geometry is a computed-layout property; nothing in-repo can measure it. A component test asserting the `grid-template-columns` string would only prove the string was written, not that it renders as intended. | Packaged Tauri build on the operator's Mac. Measure — do not eyeball — per the repo's standing rule that live UI layout claims need pixel measurement. Contract authored per the Structural Reachability Review. |
| `gog_keyless` redeem path end-to-end | REQ-43-24 | **Blocked** on D-43-11's spike. Not shippable until the spike selects candidate A, B, or the external-browser fallback. | Follows the spike outcome; contract cannot be written before then. |

### Standing rule on the live gate

Per the repo's live-gate contract-authoring reference: **the author of a gate contract may never
also be the one who runs it.** Whoever writes the REQ-43-19 contract must not score it.

---

## Known Gaps in This Strategy

Stated plainly rather than left for the plan-checker to find:

1. **Full-suite runtime is unmeasured.** Recorded as unmeasured above rather than guessed.
2. ~~The i18n gate's exact command name is unverified.~~ **RESOLVED** — the gate is the `Meta`
   jest project's `meta/__tests__/hardcodedStringGate.test.ts`, and the scope-artifact ratchet is
   `meta/__tests__/genI18nGateScope.test.ts`; there is no separate CI script name (see the
   Per-Task Verification Map's preamble).
3. **REQ-43-24 has no unconditional validation** and cannot until D-43-11's spike closes. It is
   listed so its absence is visible, not to imply coverage.
4. ~~`pnpm test` was not confirmed to exist.~~ **RESOLVED** — `package.json:42` defines
   `"test": "jest"`, so `pnpm test` does exist. The full-suite command above still uses the
   explicit `npx jest --selectProjects` form for precision (it names which projects run), not
   because `pnpm test` is missing.
5. **This repo's backend suite and lint are red at HEAD** against a known allowlist ledger. Any
   "the suite is green" claim in this phase must be scoped to the tests this phase touches, with
   the pre-existing baseline named — a bare "green" claim would be false.
6. **`pnpm lint`'s two ceilings carry ZERO padding.** `meta/lintScoped.cjs:49-50` sets
   `SRC_CEILING = 1123` and `TESTS_CEILING = 638`. This phase's new code (and the four-file
   deletion in plan 43-08) must not add net warnings beyond whatever the deletions free — a
   ceiling bump is not an option available to this phase's plans.

---

**Nyquist compliance:** `true` — the Per-Task Verification Map now carries a real task ID, plan,
wave and non-`-t`-filtered command for all 24 requirements (REQ-43-01..24), filled during plan
`43-01`.
**Wave 0 complete:** ~~`false` — the Wave 0 Requirements checklist above (new unit cases, the
relocated `GENERIC_KEY_PLATFORM` module, the `HumbleKeyRow` rewrite, the unified-list test file,
and the REQ-43-19 live-gate contract) has not been executed yet; that work belongs to plans
`43-04` through `43-10`, not to this requirements-minting plan.~~

**CORRECTED 2026-09-25 (quick `260925-e4d`): `true`.** The paragraph above was written by plan
`43-01` and was correct on 2026-09-09 — it describes work that had not happened *yet*. Plans
`43-04` through `43-10` then did all of it, and **nobody came back to this file.** Every one of
the six checklist items is now ticked against the artifact on disk, with per-item evidence
recorded inline above. `status:` was stale in the same way and is now `approved`.

This is worth naming rather than quietly fixing: a validation contract that says `draft` /
`wave_0_complete: false` two weeks after its phase finished executing is indistinguishable, to
any reader or tool, from one whose work never happened. It also kept the phase folder off green
in the explorer independently of `43-VERIFICATION.md` — measured, both artifacts had to move.
