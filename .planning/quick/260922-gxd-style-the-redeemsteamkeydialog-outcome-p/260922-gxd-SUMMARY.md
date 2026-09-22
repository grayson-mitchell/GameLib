# Quick Task 260922-gxd: Style the RedeemSteamKeyDialog outcome paragraph — Summary

One-liner: gave `RedeemSteamKeyDialog`'s outcome paragraph the `color: var(--success)` /
`color: var(--danger)` rules its two classNames have lacked since it shipped, pinned the
import-chain with a source gate proving the stylesheet is not dead, and closed the source todo.

## Tasks completed

### Task 1 — Author the two tone rules and wire the stylesheet in

Created `src/frontend/components/UI/RedeemSteamKeyDialog/index.css` with exactly two rules,
`.redeemSteamKey__success { color: var(--success); }` and `.redeemSteamKey__error { color:
var(--danger); }`, no fallback arm on either (both tokens are declared in `themes.scss`'s base
`body {}` block, so a fallback would be noise). Added `import './index.css'` as line 1 of
`index.tsx`, above the existing React import. The tone branch at `index.tsx:148-157` and both
classNames are byte-unchanged — `git diff` on `index.tsx` shows only the two added import lines.

**Contrast, measured against `body.nord-light`'s own dialog surface** (`--modal-background`
resolves to `--background-light`, `#eceff4`):

| token | value | ratio vs `#eceff4` |
|---|---|---|
| `--success` | `#3e532d` | 7.35:1 |
| `--danger` | `#bf616a` | **3.55:1 — below WCAG AA for body text (4.5:1)** |

Taken anyway: it is the theme's own adaptive token, colour is never the sole signal here (`copy.ts`
renders a distinct message per outcome), and inventing an unreviewed replacement colour would be
worse than an under-AA adaptive one. Routes through `--success`/`--danger` rather than the raw
status tokens per the recorded `Keys/index.css:510-525` precedent (the raw status-success token
measured 1.46:1 as a foreground on this same surface).

**`margin: 0` was deliberately NOT ported from `HumbleClaimWizard`'s outcome-note shape.**
`DialogContent` renders a bare `<div>` with no className from this component, `Dialog/index.css`
has no flex `gap` around the outcome paragraph, and `App.css`'s `* {}` block resets only
`box-sizing`. The paragraph's UA-default block margin is therefore currently the *only* vertical
separation between the input above it and the "View in library" button below it.
`HumbleClaimWizard`'s margin reset works there only because its parent (`.humbleClaimWizard`) is
itself `display: flex; flex-direction: column; gap: var(--space-md)` and supplies the spacing
itself — porting the reset here would have silently deleted the dialog's only spacing. This
rationale is recorded here and in the commit message rather than in the CSS file's own comment:
the plan's Task 1 verify runs `grep -c -- 'margin' index.css` and requires `0` against the whole
file including comments, so the word cannot appear there at all. The CSS comment covers only the
contrast figures, the nord-light surface, the honest AA shortfall, and the fills-vs-text rule.

Commit: `7bcf0e854` — `fix(quick-260922-gxd): give the Steam-key outcome paragraph its missing tone rules`

### Task 2 — Source gate proving the rules exist and the stylesheet is not dead

Created `src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/redeemSteamKeyDialogStylesheet.test.ts`,
modelled on `Humble/Keys/__tests__/humbleKeysStylesheet.test.ts`. The one load-bearing assertion is
the import-chain check: `index.tsx` contains `import './index.css'` **and** still contains both
`redeemSteamKey__success` and `redeemSteamKey__error` — nothing else in this repo detects an
orphaned stylesheet (`cssTokenSweep.test.ts` checks token names only, there is no stylelint, and no
other test parses CSS).

All five required assertions implemented, each block-anchored with
`/\.redeemSteamKey__(success|error)\s*\{([^}]*)\}/`-style regexes so a match proves the declaration
lives *inside* the right rule:
1. `.redeemSteamKey__success` declares `color: var(--success)`.
2. `.redeemSteamKey__error` declares `color: var(--danger)`.
3. No `var(--status-` reference survives anywhere in the file.
4. Neither block carries a fallback arm (`var(--success,` / `var(--danger,`).
5. `index.tsx` carries both the import and both classNames.

Every positive/negative assertion carries a SANITY arm against a known-bad fixture (raw
status-token fixture, fallback-arm fixture, descendant-selector-only fixture, import-missing
`index.tsx`-shaped fixture) plus a separate "stripper integrity" `describe` block with three arms
proving that comment prose alone (naming the token, the raw status token, or a fallback arm as
text) cannot satisfy any of the checks — this specifically guards against Task 1's own rationale
comment faking Task 2's result, since `stripSourceComments` runs before every assertion.

Result: `PASS Frontend redeemSteamKeyDialogStylesheet.test.ts` (14 tests) alongside
`PASS Frontend copy.test.ts` (21 tests) — 35/35 total in the directory. `cssTokenSweep.test.ts` and
`humbleKeysStylesheet.test.ts` both stayed green (43/43) with the new file added to the
`git ls-files src/*` population. Prettier clean.

**What this test cannot prove, stated plainly:** `src/frontend/jest.config.js` runs the Frontend
project with `testEnvironment: 'node'` — no jsdom, no CSS engine. Nothing in this suite renders
anything or computes a used contrast ratio. The 7.35:1 / 3.55:1 figures above are arithmetic
against declared token values in `themes.scss`, not a measurement of a built app. **No live run,
screenshot, or pixel measurement was performed as part of this task.** If a live look at the
rendered dialog is wanted, that is a separate `ready: live-gate` task and is not claimed here.

Commit: `5fe04decd` — `test(quick-260922-gxd): gate the RedeemSteamKeyDialog outcome stylesheet against going dead again`

### Task 3 — Close the todo and run the full gate set

Appended a `## Resolution (260922-gxd)` section to
`.planning/todos/pending/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md`
recording: the three previously-open questions and the shipped precedent each rests on; the token
pair with both measured ratios and the honest AA-shortfall note; the `margin: 0` finding and why
the wizard's shape was not ported verbatim; the correction that the todo's own title
("success and error read identically") was false of the *messages* (`copy.ts` returns a distinct
string per outcome — `successWithPackage`, `successNoPackage`, `alreadyOwned`, `invalid`,
`rateLimited`, `error`) and true only of the *paint*; and an explicit note that the ~23 other raw
status-token foreground declarations elsewhere in `src/` (`grep -rn "color:\s*var(--status-" src/`
= 23 across 15 files) were left untouched and uncensused — out of scope for this task.

Moved it in the mandated order: edited at the pending path, `git add`-ed that path (staging the
edit before the move), `git mv` to `.planning/todos/completed/`, then verified the *staged* blob at
the new path carried the edit: `git show :.planning/todos/completed/<name>.md | grep -c
'## Resolution'` → `1`, confirming the edit was not silently dropped by the move.

Commit: `e3cb7e099` — `docs(quick-260922-gxd): close the RedeemSteamKeyDialog outcome-tone todo`

## Verification (run after all three commits, baseline sha `1e74bc67e`)

| gate | result |
|---|---|
| Task 1 automated verify (import line, no raw status token, both `color:` rules, `margin` grep, prettier, tsc) | all PASS — every sub-check exit 0 |
| `npx jest --selectProjects Frontend --testPathPattern 'RedeemSteamKeyDialog'` | PASS — 2 suites, 35/35 tests |
| `npx jest --selectProjects Frontend --testPathPattern 'cssTokenSweep\|humbleKeysStylesheet'` | PASS — 2 suites, 43/43 tests |
| `npx prettier --check src/frontend/components/UI/RedeemSteamKeyDialog/` | clean |
| `python3 .planning/todos/todo-frontmatter-gate.py` | OK — 23 pending todos, all in-vocabulary; 15 self-tests passed |
| `pnpm planning-gates` | 12/12 passed |
| `npx jest --selectProjects Frontend --testPathPattern 'RedeemSteamKeyDialog\|cssTokenSweep'` (Task 3's combined re-run) | PASS — 3 suites, 37/37 tests |
| `git diff --diff-filter=D --name-only HEAD~1 HEAD` (post Task 3 commit) | one deletion: the pending-path todo — intentional, it is the `git mv` move, not a defect |

No gate was already red at `1e74bc67e` in the surfaces this task touched; nothing here is claimed
"pre-existing" against that baseline.

### Orchestrator negative controls (the new gate proved able to fail)

The executor's SANITY arms assert non-vacuity against inline fixtures. That is necessary but not
sufficient — a fixture arm can pass while the assertion is mis-wired against the *real* files. So
the orchestrator mutated the shipped files directly, ran the suite, and restored them. All three
mutations turned it red:

| mutation applied to the real file | suite result |
|---|---|
| delete `import './index.css'` from `index.tsx` (the dead-stylesheet case) | **1 failed**, 13 passed — the component→import→rule chain arm |
| swap `var(--success)` for the raw status-success token | **2 failed**, 12 passed — the declaration arm AND the raw-token arm |
| add a fallback arm: `var(--danger, #f00)` | **2 failed**, 12 passed — the declaration arm AND the no-fallback arm |

Working tree restored to a clean `git status` after each. This is the evidence that the gate is
not a green check proving nothing — it is measured against the real files, not only fixtures.

Correction to the counts first recorded above: the new suite is **14** tests and `copy.test.ts` is
**21**, not 18/17. The 35/35 directory total was right; the split was not.

## Deviations from Plan

None — plan executed exactly as written. The three orchestrator corrections (margin-grep strictness
governing where the `margin: 0` rationale could live, not repeating the planner's stray-tag claim,
and committing with explicit pathspecs) were followed as instructions, not treated as deviations
from the plan's own tasks.

## Threat model disposition (as declared, both held)

- T-gxd-01 (information disclosure): unchanged — the paragraph renders only `copy.ts`'s five fixed
  message strings, never the raw key. No logging or new data path was added.
- T-gxd-02 (tampering / supply chain): n/a — no `pnpm add`, no dependency, no lockfile change.

## Honesty notes (restated plainly, per this task's standard)

- The danger tone's 3.55:1 contrast ratio against `#eceff4` is **below WCAG AA for body text
  (4.5:1)**. It is not rounded up or called acceptable anywhere in this task's commits or this file.
- The `margin: 0` shape used by `HumbleClaimWizard`'s outcome notes was deliberately **not** copied
  here, because that component's parent supplies its own flex `gap` and this component's does not
  — copying it would have silently deleted the outcome paragraph's only spacing.
- The todo's title claim ("success and error read identically") is corrected: the *messages* were
  always distinct (`copy.ts`); only the *paint* was identical before this fix.
- **No live run, screenshot, or pixel measurement was performed.** All contrast figures are
  arithmetic against declared token values in `themes.scss`, not a measurement of a built app.

## Self-Check

- `test -f src/frontend/components/UI/RedeemSteamKeyDialog/index.css` → FOUND
- `test -f src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/redeemSteamKeyDialogStylesheet.test.ts` → FOUND
- `test -f .planning/todos/completed/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md` → FOUND
- `test ! -f .planning/todos/pending/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md` → CONFIRMED (no longer in pending/)
- Commits `7bcf0e854`, `5fe04decd`, `e3cb7e099` all present in `git log --oneline`.

## Self-Check: PASSED

## Commits

| commit | type | subject |
|---|---|---|
| `7bcf0e854` | fix | give the Steam-key outcome paragraph its missing tone rules |
| `5fe04decd` | test | gate the RedeemSteamKeyDialog outcome stylesheet against going dead again |
| `e3cb7e099` | docs | close the RedeemSteamKeyDialog outcome-tone todo |
