---
phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
plan: 11
subsystem: ui
tags: [css, scss, wcag-contrast, themes, census, source-gate, jest, focus-row]
gap_closure: true
gap_ids: [G-48-4a, G-48-7]

requires:
  - phase: 48-library-rows-user-composed-filter-rows-replacing-the-single
    provides: FocusRowStrip chevron controls (48-04), the FOCUS ROW panel divider (48-02), and 48-10's stacking and clearance edits to the same stylesheet and source gate
provides:
  - "The strip chevron sits on one opaque `var(--body-background)` disc, so glyph contrast is a property of the theme, not of the artwork (G-48-4a)"
  - "A per-theme census in themeTokens.test.ts holding glyph vs disc at 3:1 over all 10 themes, reading the shipped CSS"
  - "FOCUS ROW divider labels in dracula and nord-light paint the tier-2 row colour chain; a 10-theme census holds them at 4.5:1 (G-48-7)"
  - "48-UAT.md item 10 unblocked (pending) with the desk census logged for comparison; both 2026-10-07 todos closed"
affects: [48-12, 48-UAT item 10, /gsd-verify-work 48, FocusRowStrip, FilterFocusRow]

plan_head_before: 151e2cba2abb6ef9c8e58cca45f7bfbe6d185e3b
plan_head_after: 0ce06aa8f

actuals:
  tokens: 4400
  tasks: 3
  commits: 5

tech-stack:
  added: []
  patterns:
    - "Contrast census over the shipped declarations: depth-0 declaration reader plus nested-rule reader, resolved through the existing var() resolver, object-form assertions that name theme and ratio, non-vacuity cases pinning what was found"
    - "Opaque paint instead of alpha when a ratio must hold over unknown content"

key-files:
  created: []
  modified:
    - src/frontend/screens/Library/components/FocusRowStrip/index.css
    - src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts
    - src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts
    - src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss
    - .planning/phases/48-library-rows-user-composed-filter-rows-replacing-the-single/48-UAT.md
    - .planning/todos/completed/2026-10-07-focus-row-strip-chevrons-fail-3-to-1-contrast-and-hovered-card-paints-over-them.md
    - .planning/todos/completed/2026-10-07-focus-row-divider-labels-under-4-5-to-1-in-dracula-and-nord-light.md

key-decisions:
  - "Chevron disc is opaque `var(--body-background)` with no color-mix, rgba or transparent layer: a flat alpha over arbitrary art cannot bound the ratio. Deliberate deviation from 48-UI-SPEC's semi-transparent scrim, in service of that spec's own 'legible over any artwork'."
  - "Divider fix is a per-theme nested override (dracula, nord-light) to `var(--navbar-inactive, var(--navbar-accent))`, not a global change: the measured alternatives recolour passing themes or still fail nord-light."

patterns-established:
  - "Depth-0 declaration reader `declsAtDepthZero` and `nestedRules` in themeTokens.test.ts, reusable by later censuses"

requirements-completed: [R2, R3]

coverage:
  - id: D1
    description: "G-48-4a: the chevron glyph clears 3:1 against its own opaque disc in all 10 themes (desk minimum 3.91, gruvbox_dark)"
    requirement: R3
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts#FocusRowStrip chevron disc: glyph vs disc is >= 3:1 in every theme (G-48-4a)"
        status: pass
      - kind: unit
        ref: "src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts#paints one opaque var(--body-background) disc -- no translucency token (G-48-4a)"
        status: pass
    human_judgment: true
    rationale: "The census is token arithmetic with no CSS engine. The disc's edge against the artwork and the rendered pixels (scrim pixel set uniform within 2 per channel) need the live C1-C4 re-measure, UAT item 10."
  - id: D2
    description: "G-48-7: FOCUS ROW divider labels clear 4.5:1 on the tier-2 panel in all 10 themes (dracula 7.48, nord-light 7.38, minimum 5.43 marine)"
    requirement: R2
    verification:
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts#FocusRowStrip FOCUS ROW divider labels are >= 4.5:1 on the tier-2 panel in every theme (G-48-7)"
        status: pass
      - kind: unit
        ref: "src/frontend/components/UI/NavShell/components/FilterFocusRow/__tests__/filterFocusRow.test.tsx (unmodified; its scss gates)"
        status: pass
    human_judgment: true
    rationale: "Contrast arithmetic over declarations; the live divider measurement per theme (UAT item 10, divider half) is the adjudicator."
  - id: D3
    description: "The two 2026-10-07 todos are closed with the owed live proof named, and UAT item 10 is runnable"
    verification:
      - kind: other
        ref: "node todo-closure check prints TODOS CLOSED OK; audit-uat prints parse_gap_files=0 item10=pending"
        status: pass
    human_judgment: false

duration: 8min
completed: 2026-10-08
status: complete
---

# Phase 48 Plan 11: Chevron disc and divider contrast Summary

**Opaque `var(--body-background)` chevron disc (glyph 3.91 to 16.88 against it in all 10 themes) and a dracula/nord-light divider override to the tier-2 row colour chain (7.48 and 7.38), each proved by a per-theme census over the shipped CSS and SCSS.**

## Performance

- **Duration:** about 8 min (18:51Z to 18:59Z)
- **Started:** 2026-10-07T18:51:03Z
- **Completed:** 2026-10-07T18:59Z (2026-10-08 local)
- **Tasks:** 3
- **Files modified:** 7 (plus the two moved todos counted above)

## Accomplishments

- **G-48-4a (Task 1, tracer):** `.focusRowStrip__control` now paints `background: var(--body-background)`; the `rgba` fallback, the 55% `color-mix` and the "Fallback FIRST" comment are gone. Glyph colour (`--accent`), size, position, z-index, focus arms and the `:disabled` 0.38 rule are unchanged. The tracer feedback gate ran under `HUMAN_VERIFY_MODE=end-of-phase` with an automated-only `<verify>` plus a `<human-check>`; the automated block was re-run end to end (jest, codecheck, prettier) and passed, so expansion continued. The human check is UAT item 10, owed to `/gsd-verify-work 48`.
- **G-48-7 (Task 2):** `.FilterFocusRow__divider` gained a nested `body.dracula &, body.nord-light &` rule painting `var(--navbar-inactive, var(--navbar-accent))`, with a full-line `//` comment block carrying the live and desk figures and the rejected alternatives. The block's older "distinguished by `--text-secondary`" comment now says the two themes share the row colour.
- **Censuses:** `themeTokens.test.ts` gained `declsAtDepthZero`, `nestedRules`, `isOpaqueColour`, `dividerColourDecl` and two describes (11 and 11 cases). Both read the shipped declarations and fail on an unresolved token or a translucent disc.
- **Task 3:** both todos `git mv`'d to `completed/` with a `## Resolution (2026-10-08)` naming the live items still owed; UAT item 10 `blocked` to `pending`; desk census entry in the evidence log; Summary counts `pending: 1`, `blocked: 0`. No `## Gaps` `status:` line changed.

### Census ratios as printed by the test runs, beside the plan's desk values

| Theme | Chevron glyph vs disc (must_haves) | Chevron printed | Divider vs navbar (printed) |
|-------|------------------------------------|-----------------|-----------------------------|
| midnightMirage | 16.88 | 16.88 | 13.23 |
| cyberSpaceOasis | 8.51 | 8.51 | 7.56 |
| gruvbox_dark | 3.91 | 3.91 | 6.12 |
| high-contrast | 9.92 | 9.92 | 8.74 |
| dracula | 5.91 | 5.91 | 7.48 (was 4.27) |
| nord-light | 8.88 | 8.88 | 7.38 (was 1.52) |
| nord-dark | 11.41 | 11.41 | 12.49 |
| marine | 7.42 | 7.42 | 5.43 |
| zombie | 7.52 | 7.52 | 5.98 |
| sweet | 10.82 | 10.82 | 6.64 |

All twenty match `must_haves` truths 1 and 2 to two decimals. (Printed through a temporary `console.log` that was reverted before each commit; the committed test asserts in object form and prints nothing.)

## Task Commits

1. **Task 1 (tracer, TDD): opaque chevron disc**
   - RED `0a72a413d` test(48-11): add failing census and source gate for the opaque chevron disc (G-48-4a)
   - GREEN `3207d7a0f` feat(48-11): chevron sits on one opaque body-background disc (G-48-4a)
2. **Task 2 (TDD): divider labels**
   - RED `6fc84469a` test(48-11): add failing divider label census over all 10 themes (G-48-7)
   - GREEN `782285b5e` feat(48-11): dracula and nord-light divider labels paint the tier-2 row colour chain (G-48-7)
3. **Task 3: todos and UAT** - `0ce06aa8f` docs(48-11): close the chevron and divider todos, unblock UAT item 10 as the re-measure gate

**Plan metadata:** the `docs(48-11): complete ...` commit carrying this file.

Note on `commits: 5`: a concurrent quick task, `261008-aoe`, interleaved three commits (`c0f82e282`, `4d0099ea9`, `95f9eebba`) into the same branch while this plan ran, so a raw `rev-list ${PLAN_HEAD_BEFORE}..HEAD` reads 8 and `..0ce06aa8f` reads 6. Five commits are this plan's (all carry the `(48-11)` scope). `plan_head_after` is this plan's last commit for that reason.

### RED evidence

- Task 1: `npx jest --selectProjects Frontend --testPathPattern "themeTokens|focusRowStripSource"` gave `Tests: 12 failed, 97 passed`: the census non-vacuity case (`Expected length: 1, Received length: 2`, array `["rgba(0, 0, 0, 0.55)", "color-mix(in srgb, var(--body-background) 55%, transparent)"]`), all ten per-theme cases (disc not opaque) and the replaced source-gate test. This is RED on an assertion for the planned behaviour. `gsd_run check tdd-red-evidence` was not run (no `gsd_run` in this shell and `workflow.tdd_mode` is false).
- Task 2: `Tests: 3 failed, 78 passed` in `themeTokens`: the non-vacuity case, dracula (`ratio 4.267683647781071`) and nord-light (`ratio 1.5174342762708084`), exactly the two themes the plan predicted.

## Files Created/Modified

- `src/frontend/screens/Library/components/FocusRowStrip/index.css` - single opaque disc and the G-48-4a comment
- `src/frontend/screens/Library/components/FocusRowStrip/__tests__/focusRowStripSource.test.ts` - rgba-before-color-mix test replaced by the opaque-disc gate
- `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts` - chevron and divider censuses and their readers
- `src/frontend/components/UI/NavShell/components/FilterFocusRow/index.scss` - dracula/nord-light override and updated comment
- `.planning/phases/48-.../48-UAT.md` - item 10 pending, desk census entry, Summary counts
- `.planning/todos/completed/2026-10-07-focus-row-strip-chevrons-...md`, `.../2026-10-07-focus-row-divider-labels-...md` - moved from `pending/`, Resolution appended

## Decisions Made

- Followed the plan's two design decisions (opaque disc; per-theme divider override) exactly; both are recorded in the CSS and SCSS comments with the measured alternatives.
- The disc-opacity check lives in the census as well as the source gate: `isOpaqueColour` accepts only named colours and 3, 6 or 8-digit-with-`ff` hex, so a theme that someday defines `--body-background` as `rgba(...)` fails the case instead of passing on `toRgb`'s silent alpha strip.

## Deviations from Plan

None - plan executed exactly as written.

(One non-deviation to record: the first draft of `declsAtDepthZero` built its regex in a plain template literal, which swallowed the backslashes and returned empty arrays. It was caught by the RED run before commit and fixed with `String.raw`; the committed RED test already contains the fix.)

## Issues Encountered

- `pnpm codecheck` reports two `TS2353` errors in `src/frontend/screens/WebView/components/__tests__/TauriLoginPanel.test.tsx` (`onRetry` not in `Props`). They come from the concurrent quick task `261008-aoe`'s uncommitted working-tree edits, not from any file this plan touched (my files produce no `error TS`). Out of scope; not fixed. When this plan's Task 1 codecheck ran the tree was clean of them; they appeared by Task 2.
- Unrelated working-tree changes (`Login/index.tsx`, `HumbleLogin/index.tsx`, `48-SPEC.md`, `48-UI-SPEC.md`, STATE.md, state.json) belong to that quick task or the orchestrator and were left unstaged.
- Windows jest note: only the plan's named suites were run; no failure appeared in them.

## Verification

- `npx jest --selectProjects Frontend --testPathPattern "themeTokens|focusRowStripSource|cssTokenSweep"` (Task 1 final): 3 suites, 111 tests passed.
- `npx jest --selectProjects Frontend --testPathPattern "themeTokens|filterFocusRow|cssTokenSweep|focusIndicator"` (Task 2 final): 4 suites, 151 tests passed. `filterFocusRow.test.tsx` is unmodified.
- Plan-level `npx jest --selectProjects Frontend --testPathPattern "themeTokens|FocusRowStrip|FilterFocusRow|filterFocusRow|cssTokenSweep|focusIndicator"`: 7 suites, 260 tests passed.
- `pnpm lint`: 0 errors (638 pre-existing warnings), `production: PASS | tests: PASS`.
- `npx prettier --check` over the 3 Task 1 paths and the 2 Task 2 paths: `All matched files use Prettier code style!`.
- `pnpm codecheck`: no errors in this plan's files; see Issues Encountered for the two foreign errors.
- Task 3: `TODOS CLOSED OK`; `parse_gap_files=0 item10=pending`. `git show 0ce06aa8f` diff has no `status:` line. Prettier is not applied to Task 3 paths (all under `.planning/`, ignored).
- `graphify update .` ran: graph.json updated.
- `pnpm planning-gates` was not run (python3 is not installed on this Windows machine, as 48-10 also noted).

## Human checks owed (end-of-phase UAT, not stopped for)

- **UAT item 10, chevron half:** run the C1-C4 rule from `48-UAT.md` `## Protocol` in all 10 themes (P1-P4 guards; on Windows the profile files are `$APPDATA/gamelib/config.json` and `$APPDATA/gamelib/store/config.json`, and declare the capture route and colour-space handling in `## Protocol` before recording a number). Expect every one of the 40 minima at or above 3:1, within 0.05 of the desk value for that theme, scrim pixel set uniform within 2 per sRGB channel.
- **UAT item 10, divider half:** the four FOCUS ROW divider labels per theme by the item 7 method; every theme at or above 4.5:1, dracula about 7.48, nord-light about 7.38, the other eight unchanged from item 7.
- Gap entries G-48-4a and G-48-7 keep `status: failed` until `/gsd-verify-work 48` reconciles them after the live re-measure.

## Known Stubs

None.

## Threat Flags

None. T-48-33 (illegible controls) and T-48-34 (vacuous gate) are mitigated by the censuses and their non-vacuity cases; T-48-35 holds (Task 3 wrote only token values and ratios).

## Next Phase Readiness

- 48-12 (G-48-8c, strip card width parity) edits the same stylesheet and source gate; the control block now has a single `background` declaration and no longer references `color-mix`.
- UAT item 10 is runnable.

## Self-Check: PASSED

- Files exist: `FocusRowStrip/index.css`, `focusRowStripSource.test.ts`, `themeTokens.test.ts`, `FilterFocusRow/index.scss`, `48-UAT.md`, and both todos under `completed/` (none left in `pending/`).
- Commits present in `git log`: `0a72a413d`, `3207d7a0f`, `6fc84469a`, `782285b5e`, `0ce06aa8f`.
- Acceptance criteria re-run: Task 1 (jest 3 suites pass; the census and replaced source test failed before the CSS edit; ten ratios listed above) PASS; Task 2 (jest 4 suites pass; dracula and nord-light failed before the SCSS edit; `filterFocusRow.test.tsx` unmodified and green) PASS; Task 3 (both todos only in `completed/` with Resolution naming UAT items; `audit-uat` `parse_gap_files=0`, item 10 `pending`; no Gaps `status:` diff) PASS.

---
*Phase: 48-library-rows-user-composed-filter-rows-replacing-the-single*
*Completed: 2026-10-08*
