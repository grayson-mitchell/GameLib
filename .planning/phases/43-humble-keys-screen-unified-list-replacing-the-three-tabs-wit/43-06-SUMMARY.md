---
phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
plan: 06
subsystem: ui
tags: [react, typescript, i18next, humble-keys, jest]

# Dependency graph
requires:
  - phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit
    provides: "plan 43-04/43-05's unified-list KEY-column affordance placement (all interactivity already moved into .humbleKeyColumnCell)"
provides:
  - "getGameLibLoginStore — closed key_type -> GameLib-login-store table (common/humble/keyTypePresentation.ts)"
  - "HumbleKeyScenarioId + resolveKeyScenario — single exhaustive KEY-column scenario resolver (HumbleKeyRow/index.tsx)"
  - "three new gamelib.json strings: loginAndClaim, claimOnStore, pickOnHumble"
affects: [43-09, 43-10]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Scenario-resolver pattern: one exported pure function (resolveKeyScenario) decides a discriminated-union id from row inputs; render switches on the id with a const _exhaustive: never default, never on the raw props directly"
    - "Re-verify caller-supplied booleans against the same pure lookup used to justify them (storeLoginConnected re-checked against getGameLibLoginStore inside the resolver, not trusted blindly) so a caller mistake cannot fabricate a claim GameLib cannot back"

key-files:
  created: []
  modified:
    - src/common/humble/keyTypePresentation.ts
    - src/backend/humble/__tests__/keyTypePresentation.test.ts
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx
    - src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx
    - public/locales/en/gamelib.json

key-decisions:
  - "resolveKeyScenario's 'settled' branch additionally requires !hasClaimAction, matching the pre-existing defensive !claimAction && settleAction guard it replaces — not in the plan's literal resolution-order text, added because the plan's own settleAction fixtures (Phase 42 plan 06) would otherwise silently stop reaching the 'settled' scenario"
  - "makeFullyAffordancedRow() test fixture narrowed to claimAction+giftAction only — the old ownedElsewhere+fuzzy+undoOverride+claimAction+giftAction combination it used is no longer reachable under one-scenario-per-row resolution"

requirements-completed: [REQ-43-01, REQ-43-02, REQ-43-03, REQ-43-10, REQ-43-11, REQ-43-12, REQ-43-23]

# Metrics
duration: 3h10m
completed: 2026-09-10
---

# Phase 43 Plan 06: KEY-column action scenarios Summary

**One exhaustive `resolveKeyScenario` function now decides all eight KEY-column scenarios (pick / expired / settled / override-pending / override-undo / gift-only / login-and-claim / claim-and-gift), replacing HumbleKeyRow's four independently-gated optional-prop branches, backed by a new closed `getGameLibLoginStore` table and three new gamelib.json strings.**

## Performance

- **Duration:** ~3h10m (includes reconstructing context after a mid-session compaction)
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments

- `getGameLibLoginStore(keyType)` — a closed, unit-tested `key_type` → `'steam' | 'gog' | 'epic' | null` table (D-43-12/D-43-13), mirroring `REDEEM_URL_BUILDERS`'s closed-set/hostile-input-safe shape.
- `HumbleKeyScenarioId` (exported union of 8 ids) + `resolveKeyScenario` (exported pure resolver) in `HumbleKeyRow/index.tsx`, consumed by a single exhaustive `renderKeyAction()` switch with a `const _exhaustive: never` default.
- Three new i18n keys minted in `public/locales/en/gamelib.json`'s `humbleKeys` object: `loginAndClaim`, `claimOnStore`, `pickOnHumble`.
- `resolveKeyScenario` re-verifies `getGameLibLoginStore(humbleKey.platform)` internally rather than trusting the caller's `storeLoginConnected` prop, so scenario 1 (`'login-and-claim'`) is structurally unreachable for uplay/battlenet/origin/origin_keyless/nintendo_direct/generic/unrecognised platforms regardless of what a caller passes (D-43-13).
- One test per row of the UI-SPEC's KEY-Column Scenario Matrix, including both no-button scenarios asserted by direct absence, plus REQ-43-01's generic-platform parity check and a re-run of the REQ-43-15 zero-interactivity gate.

## Task Commits

1. **Task 1: Add the closed key_type to GameLib-login-store table** — `2cb0ec4e4` (feat) — committed in the prior context window, before this session's compaction.
2. **Task 2: Mint the new strings and wire the KEY-column scenarios** — `242e1a889` (feat)
3. **Task 3: Pin every scenario, including the two that render no button** — `0b1685d6c` (test)

**Plan metadata:** not yet committed — see note under "Explicit orchestrator constraints" below.

## Files Created/Modified

- `src/common/humble/keyTypePresentation.ts` — added `HumbleGameLibLoginStore` type and `getGameLibLoginStore`, a closed lookup mapping steam/gog/gog_keyless/epic/epic_keyless to their login-store family and everything else to `null`.
- `src/backend/humble/__tests__/keyTypePresentation.test.ts` — added a table-driven `describe('getGameLibLoginStore ...')` block: 5 known-literal cases, 6 no-login-store platforms, 4 unrecognised strings, one hostile URL-shaped security pin.
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx` — added `HumbleKeyScenarioId`, `resolveKeyScenario`, three new props (`storeLoginConnected?`, `onLoginAndClaim?`, `onPickOnHumble?`), and rewired the `.humbleKeyColumnCell` render path onto a single exhaustive `renderKeyAction()` switch.
- `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx` — one `describe` block per KEY-column scenario (11 new/rewritten tests plus a fixture narrowing), and updated the two pre-existing settleAction fixtures to the ownedElsewhere/matchConfidence shape a real auto-settled key carries.
- `public/locales/en/gamelib.json` — added `claimOnStore`, `loginAndClaim`, `pickOnHumble` to the `humbleKeys` object, alphabetically placed.

## Decisions Made

- **Resolution order** (implemented exactly per the plan's `<action>` text, in this precedence): `UNPICKED` → `'pick'`; `UNREDEEMABLE` → `'expired'`; exact-match owned + `settleAction` (and no `claimAction`) → `'settled'`; `undoOverride` → `'override-undo'`, else fuzzy-owned → `'override-pending'`; owned + `UNREVEALED` + `giftAction` only → `'gift-only'`; otherwise, with a `claimAction`: `getGameLibLoginStore(platform) !== null && storeLoginConnected === false` → `'login-and-claim'`, else `'claim-and-gift'` (also the universal no-props fallback, preserving the pre-existing D-22 zero-button behaviour).
- **`'settled'` additionally requires `!hasClaimAction`** (deviation — see below).
- **`'settled'`/`'override-pending'`/`'override-undo'` render output kept structurally identical to Phase 42**, per the plan's explicit "unchanged from Phase 42" instruction — only the gating condition (which scenario triggers which branch) changed, not the JSX inside each branch.
- **`resolveKeyScenario` takes a narrow `Pick<HumbleKey, 'state' | 'ownedElsewhere' | 'matchConfidence' | 'platform'>`** rather than the full `HumbleKey`, keeping the function trivially unit-testable with synthetic partial objects (used directly in the REQ-43-01 scenario-equality test).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `resolveKeyScenario`'s 'settled' branch did not defer to a supplied `claimAction`**

- **Found during:** Task 3, while writing the settled/override-pending/override-undo tests and re-reading the pre-existing `HumbleKeyRow settleAction` describe block's fixtures.
- **Issue:** The plan's resolution order (`ownedElsewhere && matchConfidence === 'exact' && hasSettleAction` → `'settled'`) has no `!hasClaimAction` term, but the code it replaces gated the settle-undo render on the defensive `!claimAction && settleAction` (index.tsx pre-43-06, comment: "if both ever present, claimAction's richer Keys-waiting affordance wins"). Without the same guard in the new resolver, a hypothetical key carrying both an owned-elsewhere-exact `settleAction` and a `claimAction` would resolve to `'settled'` and silently drop the claim button — the opposite of the documented precedence.
- **Fix:** Added `&& !hasClaimAction` to the `'settled'` condition in `resolveKeyScenario`, and extended the doc comment to cite the guard it mirrors.
- **Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/index.tsx`
- **Verification:** The pre-existing "renders exactly one Undo control when BOTH claimAction and settleAction are supplied — claimAction wins" test (Phase 42 plan 06, unmodified) still passes; `npx tsc --noEmit` clean.
- **Committed in:** `0b1685d6c` (Task 3 commit)

**2. [Rule 1 - Bug] The pre-existing settleAction test fixtures no longer reached the 'settled' scenario**

- **Found during:** Task 3, same investigation as above.
- **Issue:** `resolveKeyScenario`'s `'settled'` condition requires `ownedElsewhere: true, matchConfidence: 'exact'`. The two oldest settleAction tests (Phase 42 plan 06) used a bare `makeHumbleKey({ platform: 'steam' })` (defaults: `ownedElsewhere: false, matchConfidence: 'none'`), which is not the shape a real auto-settled key ever has — confirmed by reading `src/backend/humble/library.ts:258-259`, which carries `ownedElsewhere`/`matchConfidence` forward unchanged through the settle (D-48 keep-last-known), so a real settled key genuinely is `ownedElsewhere: true, matchConfidence: 'exact'` at render time. Left unfixed, these two tests would have started asserting on a row that renders nothing (fallen through to the `'claim-and-gift'` no-props case).
- **Fix:** Added `ownedElsewhere: true, matchConfidence: 'exact'` to both fixtures.
- **Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx`
- **Verification:** Both tests pass; `npx jest --selectProjects Frontend .../HumbleKeyRow` reports 75 passed.
- **Committed in:** `0b1685d6c` (Task 3 commit)

**3. [Rule 1 - Bug] Invalid test fixtures combining mutually-exclusive scenarios**

- **Found during:** Task 3.
- **Issue:** `makeFullyAffordancedRow()` (REQ-43-15 zero-interactivity fixture) previously set `ownedElsewhere: true, matchConfidence: 'fuzzy', undoOverride: true` alongside `claimAction`+`giftAction` simultaneously, to maximise the number of affordances on one synthetic row. Under one-scenario-per-row resolution this combination now resolves to `'override-undo'` alone — `claimAction`/`giftAction` never render on that row at all — so the fixture's "four distinct affordances" premise and its dependent `toBeGreaterThanOrEqual(4)` assertion no longer describe anything real. Separately, `"renders the ownership badge and both override buttons inside humbleKeyColumnCell..."` asserted `ownedBadgesInKey.toHaveLength(2)` for a row with `ownedElsewhere: true, matchConfidence: 'fuzzy', undoOverride: true` — i.e. it asserted the override-pending badge and the override-undo badge rendering TOGETHER, which is precisely the bug D-43-14 forbids.
- **Fix:** Narrowed `makeFullyAffordancedRow()` to `claimAction`+`giftAction` only (the one combination that legitimately co-renders, in `'claim-and-gift'`), updated its assertion to `toHaveLength(2)`. Split the invalid combined test into two: one pinning `'override-undo'` renders ONLY the undo badge, one pinning `'override-pending'` (no `undoOverride`) renders ONLY the "Not the same game" badge — each asserting the OTHER text is absent.
- **Files modified:** `src/frontend/screens/Humble/Keys/components/HumbleKeyRow/__tests__/index.test.tsx`
- **Verification:** New tests pass; Mutation Proof 2 (below) confirms they fail when the mutual exclusion is broken.
- **Committed in:** `0b1685d6c` (Task 3 commit)

---

**Total deviations:** 3 auto-fixed (all Rule 1 — bugs surfaced while pinning tests, all in the KEY-column scenario logic and its test fixtures this same plan introduced).
**Impact on plan:** All three fixes are necessary for the resolver and its test suite to be internally consistent with the plan's own stated intent (D-42-01 Exception 4's claim-wins precedence; D-43-14's mutual exclusion). No scope creep — no new scenario, prop, or string was added beyond what the plan specifies.

## Mutation Proofs (verbatim)

Both proofs used a `cp`-based backup/restore of `HumbleKeyRow/index.tsx` (not `git checkout`), to avoid discarding the Rule-1 fixes above, which were uncommitted production-file edits at the time these proofs were run. `md5sum` before/after confirmed byte-identical restoration in both cases (`4f2080084a4351587e83c04167b354b9`).

### Mutation Proof 1 — force `'login-and-claim'` for uplay

Mutation applied immediately after the two state-terminal checks in `resolveKeyScenario`:

```ts
// MUTATION PROOF 1 (temporary): force login-and-claim for uplay.
if (humbleKey.platform === 'uplay') {
  return 'login-and-claim'
}
```

Re-run (`npx jest src/frontend/screens/Humble/Keys/components/HumbleKeyRow --selectProjects Frontend`):

```
✕ uplay (no GameLib login store, D-43-13) never renders login-and-claim's text even though it has a claimAction (REQ-43-11) (1 ms)

  ● HumbleKeyRow KEY-column scenario resolution (D-43-17, Phase 43 plan 06) › uplay (no GameLib login store, D-43-13) never renders login-and-claim's text even though it has a claimAction (REQ-43-11)

    expect(received).not.toContain(expected) // indexOf

    Expected substring: not "Log into"
    Received string:        "Ubisoft ConnectSome GameUnrevealedNo expirationLog into Ubisoft Connect and claim"

Test Suites: 1 failed, 1 total
Tests:       1 failed, 74 passed, 75 total
```

Failed by name for exactly `uplay`, as the plan specified. Reverted via `cp` from backup; `md5sum` confirmed byte-identical to pre-mutation; re-run reported `Tests: 75 passed, 75 total`.

### Mutation Proof 2 — let `'override-pending'` and `'override-undo'` both render

Two coordinated edits: (a) `ownedBadge`'s "Not the same game" button gated on `humbleKey.matchConfidence === 'fuzzy'` directly instead of `scenario === 'override-pending'`; (b) the `'override-undo'` switch case changed to return `<>{ownedBadge}{undoOverrideBadge}</>` instead of `undoOverrideBadge` alone. Together these reproduce a row where both override affordances render simultaneously for a fuzzy-owned key with `undoOverride: true`.

Re-run:

```
✕ renders ONLY the override-undo badge inside humbleKeyColumnCell when undoOverride is set, even though the key's raw flags also look like a pending fuzzy override (D-43-14 mutual exclusion) (1 ms)
✕ across every combination of ownedElsewhere, matchConfidence and undoOverride, at most one humbleKeyOwnedOverride-classed element ever renders (D-43-14, REQ-43-12) (1 ms)

  ● ... across every combination ... never renders (D-43-14, REQ-43-12)

    expect(received).toBeLessThanOrEqual(expected)

    Expected: <= 1
    Received:    2

Test Suites: 1 failed, 1 total
Tests:       2 failed, 73 passed, 75 total
```

Both the mutual-exclusion pin and the exhaustive "never more than one" pin failed, as the plan specified ("confirm the 'never more than one `humbleKeyOwnedOverride`' test FAILS"). Reverted via `cp` from backup; `md5sum` confirmed byte-identical to pre-mutation; re-run reported `Tests: 75 passed, 75 total`.

## Issues Encountered

- **Acceptance-criteria grep quirk (not a defect):** the plan's Task 2 acceptance criterion `grep -c '_exhaustive: never' ... returns 3` measures 4 in the finished file, because the pattern also matches a pre-existing textual mention of the convention inside `resolvePlatformDisplay`'s docblock comment (line 26: `` `resolveButtonAction` exhaustiveness pattern (`const _exhaustive: never`) ``). This comment predates this plan — `git show 2cb0ec4e4:.../index.tsx | grep -c '_exhaustive: never'` (the Task 1 baseline, before any Task 2 work) already returns `3` (2 real switches + this 1 comment mention), so the plan's arithmetic ("the two pre-existing guards plus the scenario switch" = 3) implicitly assumed the grep pattern would match only real code assignments. The actual code contains exactly 3 real `const _exhaustive: never = ...` exhaustiveness guards post-Task-2 (the two pre-existing plus this plan's new scenario switch) — verified by `awk` line-listing, not just the raw grep count — which is what the criterion is actually trying to verify. `npx tsc --noEmit` confirms all three compile as genuine exhaustiveness checks (no `any` escape hatch). No code change made; documenting here per the "gate can measure something other than its author's intent" pattern.

## User Setup Required

None — no external service configuration required.

## Explicit orchestrator constraints honored

Per this plan's spawning instructions:
- No `gsd-sdk state.*` or `roadmap.*` verb was invoked at any point in this session.
- `.planning/STATE.md` and `.planning/ROADMAP.md` were not read or modified by this executor.
- All `git add` invocations named files explicitly; `.claude/skills/archify/` and `skills-lock.json` (pre-existing untracked files, unrelated to this plan) were never staged.
- All `npx jest` invocations placed the path argument before `--selectProjects`.
- Every reported test count above is the literal `Tests: N passed, N total` line from a real run, not inferred from exit code.
- No test in this plan's test file asserts on `getComputedStyle`, `offsetWidth`, `clientWidth`, `getBoundingClientRect`, or `toHaveStyle` (`grep -c` of that pattern returns `0`); the project's Frontend jest config carries no `jsdom` environment, so no such assertion could execute meaningfully in the first place.
- The plan's own `<output>` step (`docs({phase}-{plan}): complete [plan-name] plan` final-commit step, which stages `STATE.md`/`ROADMAP.md`/`REQUIREMENTS.md`) was skipped for the same reason — those files are out of scope for this session per the explicit spawning constraints. Only the three per-task commits above and this SUMMARY.md exist from this plan's work.

## Next Phase Readiness

- Plans 43-09/43-10 (the live-gate phases named in this plan's `affects`) can now build on a stable `resolveKeyScenario` contract and the `getGameLibLoginStore` table; REQ-43-19 (Column Geometry Contract) remains explicitly deferred to those plans, unchanged by this one.
- No blockers identified. All verification commands from the plan's `<verification>` block were run and passed: `npx tsc --noEmit` clean; `keyTypePresentation.test.ts` 63 passed (backend); `HumbleKeyRow` frontend suite 75 passed; `hardcodedStringGate.test.ts` 151 passed; `git diff --name-only public/locales/` lists only `en/gamelib.json`; both mutation proofs recorded verbatim above, in both directions.

---
*Phase: 43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit*
*Completed: 2026-09-10*

## Self-Check: PASSED

- FOUND: `.planning/phases/43-humble-keys-screen-unified-list-replacing-the-three-tabs-wit/43-06-SUMMARY.md`
- FOUND: commit `2cb0ec4e4` (Task 1)
- FOUND: commit `242e1a889` (Task 2)
- FOUND: commit `0b1685d6c` (Task 3)
- `git status --short` shows only this SUMMARY.md as a new file from this plan's work, plus the pre-existing unrelated untracked `.claude/skills/archify/` and `skills-lock.json` (neither touched, neither staged).
