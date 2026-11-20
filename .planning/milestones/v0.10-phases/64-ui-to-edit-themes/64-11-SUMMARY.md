---
phase: 64-ui-to-edit-themes
plan: 11
subsystem: ui
tags: [themes, gradient, validation, css, security, jest]

requires:
  - phase: 64-ui-to-edit-themes
    provides: isValidGradient / cleanTokens / GradientField (plans 04, 08) and the 64-SECURITY.md register
provides:
  - one-gradient-layer validation with an extended deny list in validate.ts
  - gradient values accepted only for --gradient-* tokens (IN-03)
  - CR-01 / IN-03 regression tests at the validator, boot, Save and typed-input reach points
  - T-64-12 and T-64-21 reopened then re-closed with test evidence; T-64-26 added
  - 64-REVIEW-FIX.md and a disposition ledger with CR-01 and IN-03 fixed
affects: [64-verification re-run, 64-REVIEW-DISPOSITION triage of the ten open findings]

actuals:
  tokens: 8000
  tasks: 3
  commits: 7
plan_head_before: cff4ed0ef0b5d82e3604f986b99d9ecfbecdb847
plan_head_after: 4fbb1e5aed262a4c6dcba3d608eb25914cccad4e

tech-stack:
  added: []
  patterns:
    - "Validate a gradient as exactly one function by a paren walk from its own opening paren, with quotes, backslashes and comments refused so the walk matches the CSS tokenizer"
    - "Security regression tests inject supports = () => true, since jsdom and node have no CSS and would pass either way"

key-files:
  created:
    - .planning/phases/64-ui-to-edit-themes/64-REVIEW-FIX.md
  modified:
    - src/frontend/customThemes/validate.ts
    - src/frontend/customThemes/__tests__/validate.test.ts
    - src/frontend/customThemes/__tests__/applyTheme.test.ts
    - src/frontend/customThemes/__tests__/customTheme.test.ts
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/GradientField.test.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx
    - src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx
    - .planning/phases/64-ui-to-edit-themes/64-SECURITY.md
    - .planning/phases/64-ui-to-edit-themes/64-REVIEW-DISPOSITION.md

key-decisions:
  - "IN-03 is a name-prefix rule (/^--gradient-/), not a seed-value rule, because --gradient-body-background is live-derived and in no seed"
  - "CSS.supports stays the final gate (D-14); every new refusal runs in front of it"
  - "Disposition recorded through the tool's own reconcile block, not a hand edit"

patterns-established:
  - "Reopen a security row in its own docs commit before the fix, re-close it after the failing-direction check"

requirements-completed: [THEME-01, THEME-02]

coverage:
  - id: D1
    description: "No stored or typed gradient can trigger a network fetch: the layered image-set payload and every second layer are refused before CSS.supports on the boot, Save and typed paths"
    requirement: THEME-02
    verification:
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/validate.test.ts#CR-01: one gradient layer only (T-64-12)"
        status: pass
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/applyTheme.test.ts#CR-01: a stored layered image-set gradient never reaches body.style at boot"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/GradientField.test.tsx#CR-01"
        status: pass
    human_judgment: false
  - id: D2
    description: "A gradient is accepted only for the four --gradient-* tokens and nothing legitimate is rejected (10 built-in seeds survive cleanTokens)"
    requirement: THEME-01
    verification:
      - kind: unit
        ref: "src/frontend/customThemes/__tests__/customTheme.test.ts#keeps every token of the %s seed"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx#IN-03"
        status: pass
    human_judgment: false
  - id: D3
    description: "64-SECURITY.md re-closed with test evidence and the disposition ledger shows CR-01 and IN-03 fixed with ten findings still open"
    verification:
      - kind: other
        ref: "grep -c '^open: 10$' .planning/phases/64-ui-to-edit-themes/64-REVIEW-DISPOSITION.md"
        status: pass
    human_judgment: true
    rationale: "A security record's adequacy is a reviewer judgment; the re-verification of 64-VERIFICATION.md truth 8 owns the sign-off"

duration: 9min
completed: 2026-11-20
status: complete
---

# Phase 64 Plan 11: Gradient one-layer validation (CR-01, IN-03) Summary

**Gradient validator now accepts exactly one gradient function (paren walk plus image-set/cross-fade/element/src/quote/comment deny list) and only for `--gradient-*` tokens, closing the layered `image-set("https://...")` network-fetch bypass.**

## Performance

- **Duration:** 9 min
- **Started:** 2026-11-19T15:15:16Z
- **Completed:** 2026-11-19T15:24:22Z
- **Tasks:** 3
- **Files modified:** 10 (7 source/test, 3 planning)

## Accomplishments

- `isValidGradient` refuses any value whose gradient paren closes before the final character, so the reproduced `linear-gradient(red, blue), image-set("https://attacker.example/p.png" 1x)` payload and any second layer die before `CSS.supports` is asked.
- Deny list extended with `image-set(` (covers `-webkit-`), `cross-fade(`, `element(`, `src(`, comments and both quote characters, so the paren walk matches the CSS tokenizer.
- `isValidTokenValue` gates gradients on `/^--gradient-/`, so a gradient planted in `--accent` or `--body-background` is dropped at boot and on Save. All four real gradient tokens and all 10 built-in seeds still validate.
- Security record: T-64-12 and T-64-21 reopened in their own docs commit before any code, then re-closed with test evidence after the failing-direction check. T-64-26 added, trust boundary "validator -> CSS engine" added, status back to `verified` with `threats_open: 0`.
- CR-01 and IN-03 are `fixed` in the disposition ledger; the other ten findings stay `open` (`open: 10`).

## Failing-direction evidence

Tests that went RED before each fix commit:

- Task 1 (against the pre-fix validator): `CR-01: one gradient layer only (T-64-12)` refuses the layered image-set payload before asking supports; refuses a second gradient layer even though each layer is valid; and refuses a gradient with a doubled final paren, a doubled opening paren and two space-joined gradients (the last three are one table); `applyTheme › CR-01: a stored layered image-set gradient never reaches body.style at boot`; `GradientField › CR-01: never paints or commits a typed layered image-set payload` and `CR-01: never paints a stored layered image-set payload`. That is 8 failures.
- Task 2 (against the Task 1 validator): the in-layer rows of the `rejects text containing %s before calling supports` table (image-set(, -webkit-image-set(, cross-fade(, element(, src(, a double quote, a single quote, the comment-masked second layer), `IN-03: gradients only for gradient tokens` on `--accent` and `--body-background`, and `parseCustomThemes token handling › IN-03: drops a stored gradient planted in a colour token`. That is 11 failures. The positives, the 10-seed invariant and the routing case passed already, as designed (over-rejection guards).
- Task 3 failing-direction check, swapping in the pre-fix `validate.ts` of 128b513c7 and restoring it byte-for-byte: `21 tests fail under the pre-fix validator in: validate.test.ts, customTheme.test.ts, applyTheme.test.ts, GradientField.test.tsx`.

## Task Commits

1. **Task 1: Tracer (reopen, RED, GREEN)** - `60c3cb8a3` (docs: reopen T-64-12/T-64-21), `4e84f11ad` (test: failing CR-01 regression), `c38eb4549` (fix: one gradient layer)
2. **Task 2: In-layer constructs and gradient-token rule** - `2286909ef` (test), `912c9a02f` (fix)
3. **Task 3: Re-close and record** - `c85748013` (disposition ledger, committed by the tool's reconcile), `4fbb1e5ae` (docs: re-close T-64-12 and T-64-21; fix report)

**Plan metadata:** committed after this SUMMARY (docs: complete plan)

## Files Created/Modified

- `src/frontend/customThemes/validate.ts` - one-layer paren walk, extended `GRADIENT_DENY`, name-gated `isValidTokenValue`, module-private `GRADIENT_TOKEN_PATTERN`; exports unchanged
- `src/frontend/customThemes/__tests__/validate.test.ts` - CR-01, in-layer, positive and IN-03 cases with `supports` returning true
- `src/frontend/customThemes/__tests__/applyTheme.test.ts` - boot-path proof a planted layered gradient never reaches `body.style`
- `src/frontend/customThemes/__tests__/customTheme.test.ts` - stored IN-03 drop, Save-filter drop, 10-seed no-over-rejection invariant
- `src/frontend/screens/Accessibility/ThemeEditor/__tests__/GradientField.test.tsx` - typed and stored payload never painted or committed
- `src/frontend/screens/Accessibility/ThemeEditor/__tests__/AdvancedSection.test.tsx` - routing agrees with the validator for every built-in base
- `src/frontend/screens/Accessibility/ThemeEditor/GradientField.tsx` - doc comments only
- `.planning/phases/64-ui-to-edit-themes/64-SECURITY.md` - reopened then re-closed, T-64-26, audit rows
- `.planning/phases/64-ui-to-edit-themes/64-REVIEW-FIX.md` - new fix report
- `.planning/phases/64-ui-to-edit-themes/64-REVIEW-DISPOSITION.md` - CR-01 and IN-03 `fixed`

## Decisions Made

- IN-03 as a name-prefix rule, per the plan's gradient census, because a seed-value rule would reject `--gradient-body-background` edits.
- The disposition was recorded through the tool's own reconcile block (it printed "Code review disposition recorded: 10 of 12 finding(s) open" and committed the ledger itself with `--files`), so no hand edit was needed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] tsc rejected `parsed[0].tokens` in the new applyTheme test**
- **Found during:** Task 1 verify (`pnpm codecheck`)
- **Issue:** `Object is possibly 'undefined'` (TS2532) under `noUncheckedIndexedAccess`
- **Fix:** non-null assertion `parsed[0]!.tokens` in the test; lint has no rule against it
- **Files modified:** `src/frontend/customThemes/__tests__/applyTheme.test.ts`
- **Verification:** `pnpm codecheck` clean, 23/23 in the file
- **Committed in:** `c38eb4549` (folded into the Task 1 fix commit rather than the RED commit)

**2. [Process] Task 2 RED commit initially skipped, then made in order**
- **Found during:** Task 2
- **Issue:** a zsh `$F` list was not word-split, so the prettier check failed and short-circuited the `git add`/`git commit` chain; the fix was already in the working tree
- **Fix:** committed only the three test files first (`2286909ef`), then the fix (`912c9a02f`), so history still shows RED before GREEN. No content change.

---

**Total deviations:** 1 auto-fixed (1 blocking), 1 process slip repaired
**Impact on plan:** none on scope.

## Issues Encountered

None beyond the deviations. The `pnpm lint` run reports 962 warnings and 0 errors, all pre-existing.

## Verification Results

- `pnpm exec jest src/frontend/customThemes src/frontend/components/UI/ThemeSelector src/frontend/screens/Accessibility/ThemeEditor src/frontend/state/__tests__/customThemesState.test.ts meta/__tests__/hardcodedStringGate.test.ts`: 21 suites, 560 tests passed
- `pnpm gen:theme-tokens --check`: `builtinTokens.generated.json is up to date`
- `pnpm codecheck`: clean. `pnpm lint`: exit 0 (warnings only)
- `npx prettier --check` over the five touched source/test files: clean (all confirmed not ignored); planning files are prettier-ignored
- 64-SECURITY.md: `status: verified`, `threats_open: 0`, one `T-64-26` row, three audit rows, no register row still `open`
- 64-REVIEW-DISPOSITION.md: CR-01 and IN-03 `fixed` (Source `64-REVIEW-FIX.md`), `open: 10`

## Known Stubs

None.

## Threat Flags

None. No new network endpoint, auth path or trust-boundary schema change; the plan only tightens an existing boundary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Phase 64 is ready for re-verification of 64-VERIFICATION.md truth 8 (this plan does not edit that file).
- Ten review findings (WR-01 to WR-05, IN-01, IN-02, IN-04, IN-05, IN-06) remain open by the user's 2026-11-19 scoping decision.

---
*Phase: 64-ui-to-edit-themes*
*Completed: 2026-11-20*

## Self-Check: PASSED

All created and modified files exist, and commits 60c3cb8a3, 4e84f11ad, c38eb4549, 2286909ef, 912c9a02f, c85748013 and 4fbb1e5ae are ancestors of HEAD.
