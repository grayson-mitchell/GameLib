---
phase: quick-261001-q9v
plan: 01
subsystem: ui
tags: [css, comments, documentation, humble-keys, stylesheet-citations]

requires:
  - phase: quick-260929-wyk
    provides: "Finished the stale file.ts(x):NNN citation family and deferred the eight stylesheet-to-stylesheet .css:NNN citations this task closes"
provides:
  - "Twelve re-anchored stylesheet-to-stylesheet citations in src/frontend/screens/Humble/Keys/index.css, converted from <stylesheet>.css:NNN / same-file :NNN numbers to selector-plus-bare-path anchors"
  - "A measured accurate/stale split (8 of 12 accurate, 4 stale) recorded in the closed todo"
  - "A successor todo for the seven remaining .scss-target citations, carrying the boundary rule and measured comment-block ranges that produced the cut"
affects: [humble-keys-screen, css-citation-conventions]

actuals:
  tokens: 6232
  tasks: 3
  commits: 3
plan_head_before: d8a692c417efc2140e7740aeef9a48e9b689a971
plan_head_after: a3fc24ac8edd49b9062f732b55df375a3d80791f

tech-stack:
  added: []
  patterns:
    - "Stylesheet-to-stylesheet citations re-anchored to selector-plus-bare-backticked-path form, mirroring the symbol-plus-bare-path convention already used for file.ts(x):NNN citations"

key-files:
  created:
    - .planning/todos/pending/2026-10-01-nine-scss-target-line-citations-remain-in-humble-keys-css.md
  modified:
    - src/frontend/screens/Humble/Keys/index.css
    - .planning/todos/completed/2026-09-29-stylesheet-to-stylesheet-line-citations-in-humble-keys-css.md

key-decisions:
  - "The orchestrator's amended boundary rule governs scope: within any comment block a task already rewrites, re-anchor every citation in that block regardless of target extension; outside those blocks, defer. This pulled two in-scope .scss citations (styles/_colors.scss:26, themes.scss:100) into the twelve-site edit set because both sat inside the status-success comment block this task was already rewriting for an unrelated .css citation."
  - "The GameCard site required a Case B predicate reword, not a re-point: .gameCardCrossoverBadge--gold is a 10x10px text-free dot, so the shared sentence's claim about text contrast is false for it. Reworded to describe it as unaffected by the contrast defect for a different reason (no text at all) rather than silently re-pointing the stale number and leaving a false claim standing."
  - "The todo's own headline count ('eight') was corrected to twelve in the closing note, named explicitly as never having been measured either -- not just its staleness, which the todo itself had already flagged as unmeasured."

patterns-established:
  - "Comment-only CSS edits are proven via strip-equivalence (stripSourceComments-equivalent output compared byte-for-byte against the prior commit) plus an empty-diff guard, never by classifying diff lines by prefix -- measured to false-fail (2 unclassifiable lines) on this file's bare-prose comment interiors."

requirements-completed: [TODO-2026-09-29-css-citations]

coverage:
  - id: D1
    description: "GameCard citation re-anchored with a corrected (not merely re-pointed) predicate, driven through the full verification chain as a tracer slice"
    requirement: "TODO-2026-09-29-css-citations"
    verification:
      - kind: unit
        ref: "strip-equivalence + grep gates in 261001-q9v-PLAN.md Task 1 <verify> (all passed, see below)"
        status: pass
      - kind: unit
        ref: "npx jest --testPathPattern 'humbleKeysStylesheet' (1 suite / 41 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Remaining nine citation sites (three App.css, two DiscountCard/StoreSearch, one same-file, three SelectField including the line-wrapped ninth) plus the two in-block .scss sites re-anchored; the seven out-of-block .scss sites pinned as deferred at exactly 7"
    requirement: "TODO-2026-09-29-css-citations"
    verification:
      - kind: unit
        ref: "strip-equivalence + full N/P/S/D/I gate set in 261001-q9v-PLAN.md Task 2 <verify> (all passed, see below)"
        status: pass
      - kind: unit
        ref: "npx jest --testPathPattern 'humbleKeysStylesheet' (1 suite / 41 tests) and --testPathPattern 'HumbleKeyRow' (1 suite / 101 tests)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Todo closed with the measured split present in the git INDEX (not merely on disk); successor todo filed with CI-valid frontmatter, the boundary rule, and the measured block ranges"
    requirement: "TODO-2026-09-29-css-citations"
    verification:
      - kind: unit
        ref: "git show :<path> content assertions in 261001-q9v-PLAN.md Task 3 <verify>; pnpm planning-gates (12/12)"
        status: pass
    human_judgment: false

duration: ~20min
completed: 2026-10-01
status: complete
---

# Phase quick-261001-q9v: Re-anchor stylesheet-to-stylesheet citations in Humble Keys CSS Summary

**Converted twelve stale-prone `<stylesheet>.css:NNN`/same-file `:NNN` line citations in `src/frontend/screens/Humble/Keys/index.css` to selector-plus-bare-path anchors, correcting a false predicate at the GameCard site and deferring seven out-of-scope `.scss` citations to a successor todo.**

## Performance

- **Duration:** ~20min
- **Tasks:** 3 completed
- **Files modified:** 3 (1 CSS, 2 todo markdown)
- **Commits:** 3 (plus this docs commit)

## Accomplishments

- Re-anchored all twelve in-scope citation sites in `index.css` — nine `.css:NNN` occurrences (including one invisible to any digit-anchored regex because it line-wraps across 657-658), one same-file bare `:465` citation, and two `.scss:NNN` citations that sat inside an already-rewritten comment block — to selector-plus-bare-backticked-path form. Zero CSS declarations changed, proven by strip-equivalence against `HEAD` rather than by classifying diff lines by prefix (which measured a false failure on this exact file).
- Corrected a Case B false-predicate risk at the GameCard site: `.gameCardCrossoverBadge--gold` is a 10x10px text-free dot, so the shared sentence's claim ("paints the token as a solid fill behind `--neutral-01` text") was reworded rather than left standing under a refreshed line number.
- Closed `.planning/todos/pending/2026-09-29-stylesheet-to-stylesheet-line-citations-in-humble-keys-css.md` with a closing note recording the measured accurate/stale split (8 of 12 accurate, 4 stale), the census corrections (nine occurrences not eight, line 440 carries two not three), and the boundary-rule amendment's author and reasoning.
- Filed `.planning/todos/pending/2026-10-01-nine-scss-target-line-citations-remain-in-humble-keys-css.md` for the seven remaining `.scss`-target citations outside every rewritten comment block, carrying the measured block ranges and the comma-form parsing trap.

## Task Commits

1. **Task 1: End-to-end on the hardest site — the GameCard citation, through every gate** - `8d55e608f` (fix)
2. **Task 2: Expand to the remaining nine sites and close the full gate set** - `3bd7be71f` (fix)
3. **Task 3: Close the todo with the measured split, file the deferred family, commit** - `a3fc24ac8` (docs)

**Plan metadata:** this SUMMARY and STATE.md update are committed separately by the orchestrator.

## Three corrections to the task premise, disclosed as the plan requires

1. **Nine `.css:` occurrences, not eight.** The ninth is line-wrapped across lines 657-658
   (`(SelectField/index.css:` ending one line, `60-64)` opening the next) — invisible to any regex
   anchored on a digit immediately after the colon. The blind spot is the newline, not the hyphen;
   a range-aware regex would have missed it too.
2. **Line 440 carries two occurrences, not three.** The third (`GameCard/index.css:259`) is on
   line 441; the parenthetical spans both lines. The task premise's "three on line 440" framing was
   off by a line.
3. **`npx prettier --file-info` DOES print spaces inside the braces on this machine**
   (`{ "ignored": false, "inferredParser": "css" }`, prettier 3.7.4, confirmed `od -c`). An
   unspaced reading would have looked like a CLAUDE.md defect; it would have been a render
   collapse, not the doc. CLAUDE.md's space-tolerant grep guidance was followed as written.

## Measured accurate/stale split (8 of 12 accurate, 4 stale)

| site | target | verdict |
| --- | --- | --- |
| App.css (x3) | `.App { text-align: center }` at line 24 | ACCURATE (converted anyway) |
| StoreSearch/DiscountCard badges | `.discountCard__badge--owned` | ACCURATE |
| GameCard | `.gameCardCrossoverBadge--gold` | STALE by 62 lines, plus Case B predicate reword |
| SelectField sites 1 & 2 | `.selectFieldWrapper` rules | ACCURATE |
| SelectField site 3 (wrapped) | `.selectFieldWrapper label` | STALE by 6 lines |
| same-file `:465` | `.humbleKeyStateBadge--REDEEMED` | STALE by 44 lines, and contradicted its own sentence |
| `styles/_colors.scss:26` | `--status-success` token declaration | ACCURATE (converted anyway, in-scope via boundary rule) |
| `themes.scss:100` | `--success` in `body.midnightMirage` | STALE by 43 lines (in-scope via boundary rule) |

The majority were already accurate and were converted anyway — the same "don't assume either
direction" caution this family's todos have stated each time, vindicated for the third time
(`260929-wyk`, `260929-w93`, and now this task).

## Boundary amendment (orchestrator-authored)

Planning first proposed re-anchoring only within an already-rewritten *parenthetical list*. The
orchestrator replaced it with: within any comment block a task already rewrites, re-anchor every
citation in that block regardless of target extension — `.css`, `.scss`, comma forms and wrapped
forms alike; outside those blocks, defer. Reason: the narrower cut was the exact half-fix this
family keeps shipping — two `.scss` numbers surviving inside an otherwise-rewritten paragraph is
precisely how the next reader concludes the surviving numbers were deliberate, rather than merely
out of scope. Under this rule, exactly two of nine `.scss:`-target citations (both inside the
status-success comment block spanning lines 432-447) were absorbed; the remaining seven are
deferred via the successor todo.

## Deferred — seven `.scss` citations, not silently dropped

Filed as `.planning/todos/pending/2026-10-01-nine-scss-target-line-citations-remain-in-humble-keys-css.md`,
carrying: the seven-row census with line numbers, the comma-form parsing trap
(`_spacing.scss:12,17` scores 1 under a range-only pattern but by truncating at `12`), the quoted
boundary rule, and the measured comment-block ranges `(217,233) (295,299) (432,447) (601,612)
(647,676)` that produced the cut — so a future reader can re-derive the scope rather than trust it.

## Verification

All gates from the plan's `<verification>` section were run and passed:

1. Comment-only, measured via strip-equivalence against `HEAD`/base `d8a692c41` for both
   individual tasks and the whole-plan diff — empty-diff guard confirmed real edits each time.
2. Nine `.css:NNN` occurrences gone in all three spellings (N1=0, N2=0, N3=0), same-file bare
   `:465` gone.
3. All positive anchors hit exact/minimum counts: P1=10, P2=1 (>=1), P3=1, P4=2, P5=3, P6=1 (>=1).
4. Raw-literal invariants held: I1 (`grid-template-columns`) = 2, I2 (`var(--status-success)`) = 1,
   unchanged from baseline, both before and after the full three-commit diff.
5. Deferred `.scss:` family pinned two-sided at exactly 7 (D1=7), with the comma form
   `_spacing.scss:12,17` separately confirmed present (D1b=1).
6. `npx jest --testPathPattern 'humbleKeysStylesheet'` — 1 suite / 41 tests passing.
   `npx jest --testPathPattern 'HumbleKeyRow'` — 1 suite / 101 tests passing.
7. `npx prettier --check src/frontend/screens/Humble/Keys/index.css` — clean.
8. `pnpm planning-gates` — 12/12 passing.
9. The closed todo's measured split confirmed present in the git INDEX via `git show :<path>`, not
   merely on disk.

Prettier was deliberately NOT run against the `.md` todo/plan artifacts under `.planning/` —
`--file-info` reports `{ "ignored": true, "inferredParser": null }` for those paths, so a `--check`
there would match zero files and exit 0 identically to a real pass. Per CLAUDE.md, that would be a
green proving nothing; omitted rather than carried as vacuous.

`graphify update .` was not run: this change is comment text in a CSS file with no AST-visible
symbol, so the graph has nothing to re-derive from it.

## Deviations from Plan

None - plan executed exactly as written across all three tasks. The only in-flight adjustments
were wording/line-wrap refinements made while drafting the re-anchored comment prose (to keep
grammar clean after dropping line numbers), which did not change scope, gate behavior, or any
citation's resolution.

## Known Stubs

None. This is a documentation/comment-only change; no data wiring or UI surface was touched.

## Threat Flags

None. No trust boundary, endpoint, auth path, or schema was introduced or touched — confirmed by
this plan's own threat-model finding (comment-only CSS edit, no boundary crossed).

## Self-Check: PASSED

- FOUND: `.planning/quick/261001-q9v-re-anchor-the-eight-stylesheet-to-styles/261001-q9v-SUMMARY.md`
- FOUND: `8d55e608f` in `git log --oneline --all`
- FOUND: `3bd7be71f` in `git log --oneline --all`
- FOUND: `a3fc24ac8` in `git log --oneline --all`
