---
phase: 39-repo-wide-lint-debt-drive-pnpm-lint-to-exit-0-after-the-elec
verified: 2026-09-02T04:10:20Z
status: passed
score: 3/3 requirements independently verified true; the one critical regression (CR-01) was CLOSED 2026-09-02 by quick task 260902-ofu and independently re-proven RED-without-fix / GREEN-with-fix by the orchestrator. Status flipped human_needed -> passed at that point: this is a RECORDS update following a verified fix, not a re-adjudication of the phase. The flip matters because audit-uat reads this status field, NOT the item-level `resolved: true`, so leaving it at human_needed would have reported a closed item as open indefinitely.
overrides_applied: 0
human_verification:
  - test: "Decide and land a fix for CR-01: LegendaryUser.logout() at src/backend/storeManagers/legendary/user.ts:210 calls getLoginWindowSeamOrThrow() BEFORE the unconditional credential cleanup (configStore.delete('userInfo') + clearCache('legendary')) at lines 652-653, so a missing seam throws and skips that cleanup -- confirmed live in the current tree, matching 39-REVIEW.md's CR-01 exactly."
    expected: "A fix that satisfies BOTH the documented 'MUST run unconditionally' invariant (T-34.5-19, ASVS V3) AND the existing pinned REQ-34.5-04 ordering test (cookie steps before configStore.delete). A naive hoist of the credential cleanup above the seam acquisition was tried and reverted because it fails REQ-34.5-04. The review's own suggested shape is a try/finally around the seam-acquisition + wipe-steps block, placing configStore.delete/clearCache in the finally so both invariants hold simultaneously. This decision was explicitly left to a human at phase close rather than applied unilaterally."
    why_human: "Two documented, non-overlapping requirements (an unconditional-cleanup security invariant and a call-order-pinned regression test) constrain the fix simultaneously, and the correct resolution shape (try/finally vs. restructuring the wipeSteps loop) is an architectural choice that was deliberately not made unilaterally by the executor. This also needs a follow-up test (setLoginWindowSeam(null) then logout() past the CLI-success point, asserting the credential wipe still ran) since none currently exists -- confirmed independently: every test in describe('LegendaryUser.logout()') that reaches past the CLI-error early return calls setLoginWindowSeam(seam) with a real fake seam; the beforeEach default of setLoginWindowSeam(null) is only ever exercised by the CLI-error test, which returns before line 210 is reached."
    resolved: true
    resolution: "Closed by quick task 260902-ofu (27ecd7920, ca7473bb2): the seam acquisition moved from a bare statement at user.ts:210 into the two wipeSteps closures, so a missing seam is caught by the loop's existing try/catch, the credential-side cleanup runs, and the same Error is rethrown after it. Both T-34.5-19 and the pinned REQ-34.5-04 ordering test hold. The naive hoist named in `expected` was NOT used -- it fails REQ-34.5-04. A new 12th test in legendary/__tests__/user.test.ts drives logout() with no seam installed and was proven RED before the fix and GREEN after."
---

# Phase 39: Post-cutover CI honesty — Verification Report

**Phase Goal:** Close phase-34.9 deferred item 20 across three independent workstreams: make
`pnpm lint` an honest, ratcheted gate (REQ-39-01); bring `meta/runPlanningGates.py` from 5/7 to
7/7 with labelled, mutation-proven dispositions (REQ-39-02); and collapse the dead
`getLoginWindowSeam() === null` predicate family left behind by Phase 35's cutover (REQ-39-03).

**Verified:** 2026-09-02T04:10:20Z
**Status:** passed (was `human_needed` until quick `260902-ofu` closed CR-01 on 2026-09-02)
**Re-verification:** No — initial verification

**Why `human_needed` and not `gaps_found`:** All three requirements' own literal acceptance
criteria (as written in `.planning/REQUIREMENTS.md`) are independently re-derived as TRUE below —
none of them FAILED. But this phase's own committed code review (`39-REVIEW.md`) found, and I
independently re-confirmed against the live tree, one CRITICAL regression that this phase's
mechanical collapse introduced into production code, that remains unfixed, and whose correct fix
requires a human architectural decision (two documented invariants constrain the fix
simultaneously, and a naive fix breaks a different pinned test — see below). `gaps_found` would
remove this phase from `gsd-sdk query audit-uat` entirely, taking this open item out of view with
it; `human_needed` was chosen deliberately so CR-01 stays visible and actionable.

### CR-01 resolution

Closed by quick task `260902-ofu` (test commit `27ecd7920`, fix commit `ca7473bb2`). The seam
acquisition moved from the single bare, unguarded `const seam = getLoginWindowSeamOrThrow()` at
`user.ts:210` into the FIRST statement of each of the two `wipeSteps` closures
(`clearEpicStorage`, `clearEpicCookies`). A missing seam now throws inside a step, where the
guarded loop's own try/catch already lives: `clearEpicCookies` is `FATAL_WIPE_STEP`, so its
throw is captured into `fatalWipeFailure`, the credential-side cleanup
(`configStore.delete('userInfo')` + `clearCache('legendary')`) runs unconditionally, and the
same `Error` instance is rethrown afterwards — the caller still sees the wiring diagnostic
rather than a silently-resolved logout. REQ-34.5-04's pinned call-order test (cookie steps
before `configStore.delete`) holds unmodified. The naive hoist named in this item's `expected`
field above was NOT the shape that shipped — a `try/finally` around the whole
seam-acquisition-and-wipe-steps block was named as the fallback if any pinned gate forced a
switch, but no gate did, so the lower-footprint per-closure acquisition (a three-line diff, zero
re-indentation) shipped instead. A new 12th test,
`CR-01 (T-34.5-19): with NO seam installed, the credential-side cleanup still runs and the
wiring diagnostic still reaches the caller`, was added to
`src/backend/storeManagers/legendary/__tests__/user.test.ts` and proven RED against the unfixed
tree (12 total, 11 passed, 1 failed — `configStore.delete('userInfo')` asserted with 0 calls)
before the fix commit, and GREEN (12/12) after it.

**Accepted residual:** this fix's durability against a FUTURE eager throw added between the
seam-acquisition point and the credential cleanup is weaker than a structural `try/finally`
would give — it rests on the new no-seam test as the standing guard for the seam-missing case
specifically, not on a shape that would also catch some other, not-yet-introduced throwing
statement in that region. This tradeoff was named explicitly in the quick task's plan rather
than left implicit.

This closes the phase's sole open `human_verification` item at the ITEM level. It does not
re-verify the phase as a whole — `**Status:** human_needed` below is left unchanged
deliberately: flipping phase status is `/gsd-verify-phase 39`'s call, not a quick task's, and
`human_needed` (rather than `gaps_found`) is what keeps this phase visible to
`gsd-sdk query audit-uat` in the meantime.

## Goal Achievement — Distinguishing "plans completed" from "goal achieved"

All 9 plans completed and all three REQ rows are marked Complete in REQUIREMENTS.md. That is a
true but separate claim from "the goal was achieved cleanly." The goal — closing deferred item 20
across three workstreams — was achieved for two of the three workstreams with no caveats
(REQ-39-01, REQ-39-02), and achieved for the third (REQ-39-03) as measured by its own stated
acceptance text, but the mechanical means by which REQ-39-03 was achieved (a global
`getLoginWindowSeam()` → `getLoginWindowSeamOrThrow()` substitution) introduced a new,
unaddressed security-relevant regression in one of the 13 collapsed sites. This is exactly the
"task completion ≠ goal achievement" pattern this verification process exists to catch, one level
removed: it is not the requirement's text that is unmet, it is that meeting the requirement's text
came with an uncosted side effect the phase itself detected and did not close.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `pnpm lint` exits 0 repo-wide, counting only `severity===2` as errors, with an honest (mutation-provable) `--max-warnings` ratchet | ✓ VERIFIED | Ran `pnpm lint` directly: exit 0, `4157 problems (0 errors, 4157 warnings)`. Independently re-derived via `npx eslint --format json .` parsed programmatically: `errors: 0, warnings: 4157` — exact match. `package.json`'s `lint` script reads `eslint --cache --max-warnings 4157 .`, matching the measured count exactly (not a stale or rounded number). |
| 2 | The lint ratchet can actually fail (not a rubber gate) | ✓ VERIFIED | `npx eslint --cache --max-warnings 4156 .` → exit 1, `ESLint found too many warnings (maximum: 4156)`. `npx eslint --cache --max-warnings 4157 .` → exit 0. Tested both directions myself, independent of the SUMMARY's claimed commit `e981740324`. |
| 3 | `python3 meta/runPlanningGates.py` prints `7/7 planning gates passed.` and exits 0, both previously-red gates now passing | ✓ VERIFIED | Ran it directly: 7 `[PASS]` lines, zero `[FAIL]`, `7/7 planning gates passed.` — includes `34.5-.../preload-surface-gate.py` and `34.4.1-.../seam-parity-sweep-gate.py`, the two gates named in the ROADMAP as red at phase start. |
| 4 | Each repaired gate can still fail (not made permanently green by loosening its assertion) | ✓ VERIFIED | Mutated `AUDITED_UNION_FLOOR` in `preload-surface-gate.py` from 206→9999 in place: gate went `GATE FAILED: extracted union has only 206 distinct channel(s), below the audited floor of 9999`, exit 1. Reverted via `cp` from a pre-mutation backup; `diff` confirmed byte-identical restoration; re-ran gate, exit 0. Separately, reintroduced a `getLoginWindowSeam() === null` predicate in `src/backend/humble/adapter.ts` (a live mutation, not a copy): `seam-parity-sweep-gate.py` went `GATE FAILED: Axis A site src/backend/humble/adapter.ts:267 matched none of the mechanical tiers... and has no SITE_PROFILES entry`, exit 1. Reverted via `cp` from a pre-mutation backup; `diff` confirmed byte-identical restoration; gate re-ran green. |
| 5 | Exactly one `getLoginWindowSeam()` predicate branch survives repo-wide, at the deliberately-kept smoke-test guard | ✓ VERIFIED | Independently swept `src/` and `meta/` for all four predicate-family shapes (equality forms, bare negation, ternary/optional-chaining) excluding test files and comments. Found exactly one live match: `src/backend/sidecar/humbleLoginFlowRegistration.ts:458`, `if (!seam)`, immediately following `const seam = getLoginWindowSeam()` at line 457 — matches the claimed deliberately-kept smoke-test guard exactly (confirmed by reading the surrounding `smokeLog`/`GAMELIB_LOGIN_SEAM_SMOKE` context). The `humble/library.ts:1202` hit is a doc comment ("DERIVED from `getLoginWindowSeam()`..."), not live code. `getLoginWindowSeam()`/`setLoginWindowSeam()` both retain their nullable `LoginWindowSeam \| null` signatures in `loginWindowSeam.ts`, confirmed by direct read, for test install/clear use. |
| 6 | The static completeness gate (`meta/__tests__/loginWindowSeamPredicateRemoved.test.ts`) is actually collected and runs, and is non-vacuous | ✓ VERIFIED | `npx jest --listTests --selectProjects Meta` includes the file. Ran it directly: 11/11 passing on the clean tree. Independently proved non-vacuous by mutation: reintroducing the predicate in `adapter.ts` made the specific test `has zero surviving getLoginWindowSeam() predicate matches ... under src/backend/humble` FAIL with the exact offending `file:line`; reverting made it pass again. |
| 7 | No `src/frontend/**` file was touched by this phase (scope-fence / prettier-exclusion check) | ✓ VERIFIED | `git diff --name-only 0114292fb..HEAD \| grep -c '^src/frontend/'` → 0. Full diff list (37 files) is entirely `.planning/`, `meta/`, and `src/backend/` — no frontend files, consistent with the prettier-gate scope fence being honored. |
| 8 | Phase introduced no regressions to the existing test suite beyond the already-catalogued pre-existing baseline | ✓ VERIFIED (with a documented full-suite-under-load flake caveat) | `npx jest --json` (single clean run): `numFailedTestSuites: 5, numPassedTestSuites: 366, numTotalTestSuites: 371; numFailedTests: 9, numPassedTests: 7480, numTotalTests: 7492` — matches the stated baseline exactly. The 5 failing suite names (`downloadmanager/utils.test.ts`, `genI18nGateScope.test.ts`, `decompressPool.test.ts`, `runTsSignals.test.ts`, `hardcodedStringGate.test.ts`) map 1:1 onto the phase's own `deferred-items.md` catalogue. (A plain `npx jest` run without `--json` surfaced 3 additional transient failures — `bootstrapWirings.test.ts`, `lzmaNativeSeaRealBuild.test.ts`, `appShellFlows.test.ts` — consistent with this project's already-recorded "a full suite run manufactures a different failure set under load" behavior; the clean `--json` run is the reliable measurement and matches baseline exactly.) |
| 9 | `LegendaryUser.logout()`'s documented "cleanup MUST run unconditionally" invariant (T-34.5-19, ASVS V3) still holds after the mechanical seam-accessor substitution | ✗ FAILED (unfixed, human decision required) | Independently re-read `src/backend/storeManagers/legendary/user.ts`: `logout()` is a bare `async` function with no enclosing try/catch/finally. `const seam = getLoginWindowSeamOrThrow()` sits at line 210, unguarded; `configStore.delete('userInfo')`/`clearCache('legendary')` run at lines 652-653, only after the `wipeSteps` loop that the line-210 seam feeds. If no seam is installed, line 210 throws synchronously, `logout()`'s returned promise rejects, and lines 652-653 never execute — a direct violation of the comment at lines 166-173 ("MUST run unconditionally — even when every cookie-side step in this block fails or throws"). Confirmed this is a phase-introduced regression, not pre-existing, via `git show 0114292fb:src/backend/storeManagers/legendary/user.ts` (pre-phase, the equivalent line called the old non-throwing `getLoginWindowSeam()`, which routed into a since-deleted Electron branch rather than throwing). Confirmed untested: read `src/backend/storeManagers/legendary/__tests__/user.test.ts` directly — `setLoginWindowSeam(null)` (the `beforeEach` default) is exercised only by the CLI-error early-return test, which returns before line 210 is ever reached; every other test in `describe('LegendaryUser.logout()')` installs a real fake seam first. |

**Score:** 8/9 truths independently verified; truth #9 (a collateral finding from the review, not
literally in any REQ's acceptance text) is FAILED and unfixed. All three REQ-39-01/02/03
requirements, scored strictly against their own written acceptance criteria, are 3/3 VERIFIED.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `package.json` `lint` script | `eslint --cache --max-warnings N .` with N matching a re-measured count | ✓ VERIFIED | `eslint --cache --max-warnings 4157 .`; matches measured count exactly; mutation-proven both directions. |
| `meta/runPlanningGates.py` (unmodified orchestrator) | Discovers 7 gates, all pass | ✓ VERIFIED | 7/7, `MINIMUM_EXPECTED_GATES=7` satisfied without any RETIRE-by-deletion. |
| `.../34.5-.../preload-surface-gate.py` | RE-DERIVEd floor (206) + reconciled Totals | ✓ VERIFIED | `AUDITED_UNION_FLOOR = 206` confirmed in file; gate passes; mutation-RED at 9999 confirmed and reverted. |
| `.../34.4.1-.../seam-parity-sweep-gate.py` | RE-POINTed `ELECTRON_STUB_PATH`; INVERTed Axis A floor to 1-site survivor set | ✓ VERIFIED | Gate passes with 0 hard-fails; mutation-RED via a reintroduced predicate confirmed and reverted. |
| `meta/__tests__/loginWindowSeamPredicateRemoved.test.ts` | Zero-match static gate, collected by Meta jest project, non-vacuous | ✓ VERIFIED | Listed by `--listTests --selectProjects Meta`; 11/11 pass clean; mutation-RED confirmed and reverted. |
| `src/backend/humble/loginWindowSeam.ts` | Nullable accessor signatures retained for test use; new `getLoginWindowSeamOrThrow()` added | ✓ VERIFIED | Both `getLoginWindowSeam(): LoginWindowSeam \| null` and `setLoginWindowSeam(seam: LoginWindowSeam \| null): void` retained; `getLoginWindowSeamOrThrow(): LoginWindowSeam` present. |
| `src/backend/storeManagers/legendary/user.ts` `logout()` | Collapsed seam accessor without breaking the unconditional-cleanup invariant | ✗ REGRESSION | Seam acquisition (throwing) precedes the mandatory credential cleanup; see truth #9 above. |
| `39-SEAM-DISPOSITIONS.md` | 13-site census table with per-site disposition | ✓ VERIFIED | Read directly; table structure, RED-proof methodology (baseline sha `ed1fdf71d`), and comment-noise handling (`isCommentOnlyMention`) all present and internally consistent with what I independently re-derived. |
| `39-GATE-DISPOSITIONS.md` | Disposition vocabulary + evidence for both gates | ✓ VERIFIED | Read directly; contains the `getEpicGamesStatus` exception writeup and the masked check-5 defect writeup, both consistent with the live gate code I inspected. |
| `39-REVIEW.md` | Code review artifact | ✓ VERIFIED (and its CR-01 finding independently re-confirmed) | Committed at `e6bf76b51`; CR-01 re-derived true against the live tree by direct file read, not merely trusted. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `.github/workflows/lint.yml` / `.husky/pre-push` | `package.json`'s `lint` script | invokes bare `pnpm lint` | ✓ WIRED | Both invoke the unqualified script; ratchet value is bound transitively, not duplicated. |
| `meta/runPlanningGates.py` | each `*-gate.py` file | filename-suffix discovery | ✓ WIRED | `MINIMUM_EXPECTED_GATES=7` enforced; discovery confirmed live (7 files found, 7 run). |
| `meta/jest.config.js` (Meta project) | `loginWindowSeamPredicateRemoved.test.ts` | project `testMatch` | ✓ WIRED | Confirmed via `--listTests --selectProjects Meta`. |
| `ipcMain.handle('logoutLegendary', ...)` | `LegendaryUser.logout()` | direct call, promise returned as-is | ✓ WIRED (but propagates the CR-01 regression) | `src/backend/sidecar/runnerAuthFlowRegistration.ts:149-151` simply returns the promise; a rejection from line 210 surfaces to the IPC caller as an error, silently skipping the credential wipe — the wiring itself is correct, the function it wires to is defective. |

### Data-Flow Trace (Level 4)

Not applicable in the renderer-data sense — this phase touches no `src/frontend/` code and adds no
UI-facing data flow. The relevant "flow" to trace is control flow through `logout()`, which is
covered under truth #9 and the key-link row above (statement order confirmed by direct read of
`user.ts:210` vs `:652-653`, no intervening try/catch).

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| `pnpm lint` exits 0 with real re-measured counts | `pnpm lint` | `4157 problems (0 errors, 4157 warnings)`, exit 0 | ✓ PASS |
| Lint ratchet fails one warning below the pinned count | `npx eslint --cache --max-warnings 4156 .` | exit 1, "too many warnings (maximum: 4156)" | ✓ PASS |
| Planning gates all pass | `python3 meta/runPlanningGates.py` | `7/7 planning gates passed.` | ✓ PASS |
| Preload-surface gate can still fail | mutated `AUDITED_UNION_FLOOR` to 9999, ran gate, reverted | `GATE FAILED` then reverted to `OK` | ✓ PASS |
| Seam-parity gate can still fail | reintroduced a null-check predicate in `adapter.ts`, ran gate, reverted | `GATE FAILED` then reverted to `OK` | ✓ PASS |
| Seam predicate static jest gate can still fail | same mutation, ran `loginWindowSeamPredicateRemoved.test.ts` | 1 test FAILED naming exact `file:line`, then reverted to 11/11 pass | ✓ PASS |
| Full test suite matches documented baseline | `npx jest --json` | 5 failed/366 passed suites, 9 failed/7480 passed tests — exact match | ✓ PASS |

### Probe Execution

No `scripts/*/tests/probe-*.sh` files exist in this repository and none are referenced by this
phase's PLAN/SUMMARY files. Step 7c: SKIPPED (no probe scripts found for this phase; the phase's
own gates — `meta/runPlanningGates.py` and the jest static gate — served as this phase's
equivalent runnable verification surface and were executed directly above).

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| REQ-39-01 | 39-09 | `pnpm lint` exits 0 with a mutation-proven `--max-warnings` ratchet | ✓ SATISFIED | Truths #1, #2 above. |
| REQ-39-02 | 39-01, 39-08 | `runPlanningGates.py` 7/7 with labelled, mutation-proven dispositions | ✓ SATISFIED | Truths #3, #4 above. |
| REQ-39-03 | 39-02..39-07 | No `getLoginWindowSeam()` predicate branch survives (outside the one declared exception), proven by a static gate | ✓ SATISFIED (as literally worded); collateral regression noted separately | Truths #5, #6 above satisfy the requirement's own text; truth #9 is a defect in the *means* used to satisfy it, not in the requirement's stated acceptance criteria. |

No orphaned requirements found: `.planning/REQUIREMENTS.md` maps only REQ-39-01/02/03 to Phase 39,
and all three appear in plan frontmatter across the 9 plans.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `src/backend/storeManagers/legendary/user.ts` | 210 vs 652-653 | Unguarded throwing call ordered before a documented "MUST run unconditionally" cleanup | 🛑 BLOCKER (security-relevant, ASVS V3 / T-34.5-19) | See truth #9. Not a TBD/FIXME/placeholder-style marker — a genuine ordering defect in shipped code, already found and documented by this phase's own review, not newly discovered here beyond independent re-confirmation. |

No `TBD`/`FIXME`/`XXX` unreferenced debt markers found in the phase's modified-file set (checked
across all 37 diffed files). No placeholder/"coming soon"/stub-return patterns found in the
modified `src/backend/**` files reviewed in depth (`adapter.ts`, `library.ts`, `user.ts` ×2,
`loginWindowSeam.ts`, `oauthLoginCapture.ts`, `oauthLoginFlowRegistration.ts`).

### Human Verification Required

### 1. Decide and land the CR-01 fix for `LegendaryUser.logout()`

**Test:** Review `src/backend/storeManagers/legendary/user.ts:166-173` (the documented invariant),
`:210` (the throwing seam acquisition), and `:652-657` (the credential cleanup + rethrow), alongside
the pinned test `REQ-34.5-04: asserts call ORDER` in
`src/backend/storeManagers/legendary/__tests__/user.test.ts`. Decide between (a) a `try/finally`
wrapping the seam-acquisition-and-wipe-steps block, placing `configStore.delete('userInfo')` +
`clearCache('legendary')` in the `finally`, which preserves REQ-34.5-04's cookie-before-delete
ordering AND the unconditional-cleanup guarantee, or (b) an equivalent restructuring that achieves
both properties. Land the fix plus a new regression test that calls `setLoginWindowSeam(null)` and
then `LegendaryUser.logout()` past the CLI-success point, asserting `configStore.delete`/
`clearCache` still ran.

**Expected:** `LegendaryUser.logout()` clears `userInfo`/the runner cache even when no login-window
seam is installed, matching the sibling implementation `HumbleUser.disconnect()`'s already-correct
ordering (credential clear at `humble/user.ts:866`, seam acquisition at `:938`), without breaking
`REQ-34.5-04`'s pinned ordering assertion.

**Why human:** Two independently-documented, currently-both-true requirements (the unconditional
cleanup invariant and REQ-34.5-04's call-order pin) constrain the fix simultaneously, a naive
hoist was tried and reverted because it broke REQ-34.5-04, and the review explicitly recorded that
"this restructure was judged to belong to the user, not to be applied unilaterally at phase close."
No existing gate (`seamBranchParity.test.ts` is shape-only; `loginWindowSeamPredicateRemoved.test.ts`
is predicate-text-only) is capable of catching this class of ordering defect, so this also needs a
human decision on whether/how to extend test coverage for statement-ordering invariants generally,
beyond just this one call site.

### Gaps Summary

No gaps in the sense of "a requirement's stated acceptance criteria failed to hold" — all three
REQ-39-01/02/03 requirements are independently re-verified true against their own written text,
every mutation-provability claim was independently re-demonstrated (not merely trusted from
SUMMARY.md), the seam census matches the claimed 13-sites-collapsed/1-site-kept shape exactly, and
the phase's scope fence (zero `src/frontend/` touches, prettier untouched, one-workstream-per-commit
discipline visible in the commit log) held.

The one substantive concern is collateral: this phase's own code review found, and I independently
re-confirmed by direct source read (not by trusting the review's prose), a CRITICAL regression in
`LegendaryUser.logout()` that this phase's mechanical seam-accessor substitution introduced. It is
real (confirmed via `git show` against the pre-phase blob), it is untested (confirmed by reading
every test in the affected `describe` block), and it is unfixed (confirmed by reading the current
file — the throwing call still precedes the mandatory cleanup). A fix was attempted and reverted
during the phase because it broke a different, legitimately-pinned test, so the correct resolution
requires a human architectural decision, which is why this report resolves to `human_needed` rather
than `passed` or `gaps_found`.

---

_Verified: 2026-09-02T04:10:20Z_
_Verifier: Claude (gsd-verifier)_
