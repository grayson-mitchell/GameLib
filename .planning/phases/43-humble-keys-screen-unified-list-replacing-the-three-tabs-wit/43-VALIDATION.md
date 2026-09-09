---
phase: 43
slug: humble-keys-screen-unified-list-replacing-the-three-tabs-wit
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-09
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
| **Quick run command** | `npx jest --selectProjects Backend --passWithNoTests -t "<pattern>"` |
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

- **After task commit:** `npx jest --selectProjects Backend --passWithNoTests -t "<pattern scoped to the module touched>"`
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

---

## Per-Task Verification Map

Task IDs are assigned by the planner. This table is seeded from the research's requirement→test
map and **must be completed with real task IDs during planning** — an unpopulated row is a
Dimension 8 hole, not a formality.

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | TBD | TBD | REQ-43-05 | — | N/A | unit | `npx jest --selectProjects Backend -t "compareWaiting"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REQ-43-07 | — | N/A | unit | `npx jest --selectProjects Backend -t "Redeemable"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REQ-43-09 | — | N/A | unit | `npx jest --selectProjects Backend -t "search"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REQ-43-02, 03, 11, 12, 13, 14 | — | N/A | component (function-call) | `npx jest --selectProjects Frontend -t "HumbleKeyRow"` | Exists — needs substantial rewrite | ⬜ pending |
| TBD | TBD | TBD | REQ-43-16 | — | N/A | component | `npx jest --selectProjects Frontend -t "redirect"` | ❌ W0 | ⬜ pending |
| TBD | TBD | TBD | REQ-43-17, 18 | — | N/A | source census | `grep -rn "partitionWaitingByUrgency\|HumbleKeyGroup\|groupAndSortKeys" src/ --include="*.ts" --include="*.tsx"` — expect 0 hits | N/A (shell) | ⬜ pending |
| TBD | TBD | TBD | REQ-43-19 | — | N/A | **live gate only** | N/A — packaged Tauri build, screenshot/AX measurement | N/A by design | ⬜ pending |
| TBD | TBD | TBD | REQ-43-22 | — | N/A | CI gate | `meta/i18nGateScope.json`-driven check — **confirm the exact gate command before writing it into a plan; the name was not verified** | Exists | ⬜ pending |
| TBD | TBD | TBD | REQ-43-23 | T-43-01 (secret in log) | `aria-label` stays an expression, never a literal | CI gate | `meta/hardcodedStringGate.ts` | Exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] New unit case in `src/backend/humble/__tests__/viewFilters.test.ts` pinning the **undated-key
      tiebreak** — the case that differentiates `compareWaiting` from the deleted
      `byExpiringSoonest` (REQ-43-05). A test that passes against either comparator proves nothing
      about which one shipped.
- [ ] New title-only search predicate + its test file (REQ-43-09), placed so the Backend project
      collects it.
- [ ] New leaf module for `GENERIC_KEY_PLATFORM` (relocated out of `groupKeys.ts` before that file
      is deleted) — a constant, so no test of its own is strictly required, but **both existing
      importers' tests must still pass after the repoint**.
- [ ] Full rewrite of `HumbleKeyRow/__tests__/index.test.tsx` against the new KEY-column-scenario
      prop shape, re-pinning every "must survive" assertion from the research's Deleted-Tab
      Salvage section.
- [ ] New test file for the unified list screen, replacing `Waiting/__tests__/index.test.tsx` and
      `All/__tests__/index.test.tsx`. Their existing assertions must be **triaged individually** —
      neither bulk-deleted nor bulk-copied. Some pin behaviour that legitimately changes; some pin
      behaviour that must not.
- [ ] A live-gate contract for REQ-43-19, authored per
      `.claude/skills/spike-findings-gamelib/references/live-gate-contract-authoring.md`'s
      Structural Reachability Review (all seven tests) **before** the gate's first live run.

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

1. **Full-suite runtime is unmeasured.** Recorded as TBD above rather than guessed.
2. **The i18n gate's exact command name is unverified.** The research flagged it; confirm by
   inspecting `meta/` before any plan hard-codes a command.
3. **REQ-43-24 has no validation at all** and cannot until D-43-11's spike closes. It is listed
   so its absence is visible, not to imply coverage.
4. **`pnpm test` was not confirmed to exist.** The full-suite command above uses the explicit
   `npx jest --selectProjects` form for that reason.
5. **This repo's backend suite and lint are red at HEAD** against a known allowlist ledger. Any
   "the suite is green" claim in this phase must be scoped to the tests this phase touches, with
   the pre-existing baseline named — a bare "green" claim would be false.

---

**Nyquist compliance:** `false` until the Per-Task Verification Map carries real task IDs.
**Wave 0 complete:** `false`.
