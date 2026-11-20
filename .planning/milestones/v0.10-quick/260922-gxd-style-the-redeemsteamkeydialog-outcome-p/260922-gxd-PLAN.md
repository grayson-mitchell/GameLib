---
phase: quick-260922-gxd
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
requirements:
  - todo-2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule
files_modified:
  - src/frontend/components/UI/RedeemSteamKeyDialog/index.css
  - src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
  - src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/redeemSteamKeyDialogStylesheet.test.ts
  - .planning/todos/pending/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md

must_haves:
  truths:
    - "A successful Steam-key redemption and a failed one paint in different colours."
    - "The success tone resolves through the theme-adaptive --success token, never the raw status-success token."
    - "The error tone resolves through the theme-adaptive --danger token, never the raw status-danger token."
    - "The new stylesheet is actually loaded by the component - it is not dead."
    - "The vertical spacing around the outcome paragraph is unchanged from what ships today."
  artifacts:
    - path: "src/frontend/components/UI/RedeemSteamKeyDialog/index.css"
      provides: "The two tone rules the outcome <p> has always lacked"
      contains: "redeemSteamKey__success"
    - path: "src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/redeemSteamKeyDialogStylesheet.test.ts"
      provides: "Source gate proving the rules exist AND the stylesheet is imported"
  key_links:
    - from: "src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx"
      to: "src/frontend/components/UI/RedeemSteamKeyDialog/index.css"
      via: "import './index.css' on line 1"
      pattern: "import '\\./index\\.css'"
---

<objective>
`RedeemSteamKeyDialog/index.tsx:148-157` picks between `redeemSteamKey__success` and
`redeemSteamKey__error` for the outcome paragraph. Neither class has ever had a CSS rule - a
whole-repo case-insensitive sweep of every `.css/.scss/.sass/.less` file outside `node_modules`
for `redeemsteamkey` returned **zero files** (measured 2026-09-21 by `260922-7hg`). The `tone`
field `copy.ts` computes is branched on and then discarded at paint time.

Purpose: give the branch the rules it has always lacked, using the token pair this repo has
already measured and decided on, and prove the stylesheet is not dead.

Output: a new component-level `index.css`, its import, a source gate, and the closure of pending
todo `2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
@src/frontend/components/UI/RedeemSteamKeyDialog/copy.ts
@src/frontend/screens/Humble/Keys/components/HumbleClaimWizard/index.css
@src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts

## Measured facts

Every claim below was measured during planning against the working tree at `1e74bc67e`. The
executor should not re-derive them, and must not weaken them either.

**Token declarations (`src/frontend/themes.scss`).** `--success` is declared at L106 and
`--danger` at L108, both inside the base `body {}` block. They are therefore defined on every
theme, so `var(--success, ...)` / `var(--danger, ...)` fallback arms are noise here. Contrast
`--divider`, declared in only 2 of 11 theme blocks, where a fallback is load-bearing and two
NavShell gates enforce one.

**Contrast, computed against `body.nord-light` (themes.scss:329).** That block declares
`--background-light: #eceff4` (L330), `--body-background: var(--background-light)` (L331) and
`--modal-background: var(--body-background)` (L343) - so `#eceff4` is the dialog's own surface,
not merely the screen behind it. Against it:

| token | nord-light value | ratio vs #eceff4 |
| --- | --- | --- |
| `--success` | `#3e532d` (themes.scss:369) | **7.35:1** |
| `--danger` | `#bf616a` (themes.scss:347) | **3.55:1** |

3.55:1 is **below WCAG AA for body text (4.5:1)**. Do not claim otherwise anywhere - not in the
CSS comment, not in the commit message, not in the SUMMARY. It is taken anyway because it is the
theme's own adaptive token and the alternative is inventing a colour this repo has not reviewed;
and because colour is never the sole signal - `copy.ts` renders five distinct per-outcome messages
under SPEC REQ5/D-08 (`successWithPackage`, `successNoPackage`, `alreadyOwned`, `invalid`,
`rateLimited`, `error`).

**The raw-status-token prohibition is a recorded decision, not a coin flip.**
`src/frontend/screens/Humble/Keys/index.css:510-525` carries a written record that the raw
status-success token used as a *foreground* measured **1.46:1** on `body.nord-light`, and that this
exact case was moved to `var(--success)`. The rule: raw status tokens for fills,
`--success`/`--danger` for text. The raw-token foreground notes inside
`HumbleClaimWizard/index.css` (L108, L116, L122, L131, L141, L149) are *known-outstanding
instances of that same defect* - copy the wizard's structural shape, not its token.

**`margin: 0` must NOT be copied from the wizard.** Measured: `DialogContent`
(`Dialog/components/DialogContent.tsx`) renders a bare `<div className={className}>`, and
`RedeemSteamKeyDialog` passes **no** className to it. `Dialog/index.css` declares only
`.log-upload-result` and `.Dialog__footer` - there is no flex `gap` anywhere around the outcome
paragraph. `App.css:14`'s `* {}` block sets **only** `box-sizing: border-box`; there is no global
margin reset. So the paragraph's UA-default `margin: 1em 0` is currently the *only* separation
between the input above it and the "View in library" button below it. `margin: 0` works in
`HumbleClaimWizard` precisely because its parent `.humbleClaimWizard` is
`display: flex; flex-direction: column; gap: var(--space-md)` (index.css:1-5) and supplies the
spacing itself. Porting that declaration here would silently delete the spacing - the repo's
recorded "verbatim port ships silent defects" pattern.

**`font-size: var(--text-md)` and `font-weight: var(--regular)` would be inert.**
`styles/_typography.scss:136-144` already applies `font-size: var(--text-md)` to every bare `p`,
and `--regular` is `400` (`_typography.scss:22`), which is the UA default weight for `p`.

**The CSS custom-property gate will see this file.**
`src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts` sweeps `git ls-files src/*`
and holds the undefined-custom-property count at 0. All four candidate tokens are declared, so the
gate passes either way - but it is why no token may be invented here.

**Out of scope, stated so it is not mistaken for an omission.** `grep -rn "color:\s*var(--status-"`
over `src/` returns **23 declarations across 15 files**. An unknown subset of those are this same
foreground-on-background defect class; others are legitimately foreground-on-a-status-fill, like
`.humbleClaimWizardC2Panel`, which sets its own `--neutral-01` text over a status-danger
background. **No census of which is which was run, and none is in scope here.** This task styles
ONE paragraph and closes ONE todo. Do not sweep the others.

## What the todo itself got wrong

The todo's title says "success and error read identically". That is **false about the messages** -
`copy.ts` returns a distinct string per outcome. What is identical is the **paint**. The commit
message and SUMMARY must say this rather than repeating the title, and must not silently drop it
either - say what was actually wrong.

The todo is filed `ready: human`. That triage was correct when written and is **now stale**: the
decision is already made by shipped precedent, and all three of its open questions are answered
below.

## The three decisions, already made

**Q1 - should the paragraph carry a tone colour at all? Yes.** `HumbleClaimWizard` - the sibling
key-claim flow in this same fork - gives each outcome note its own class and tone colour in a
component-level `index.css` imported by its `index.tsx`. Colouring this paragraph invents no
pattern. Same argument `260922-7hg` used when it routed the input through the shipped
`TextInputField` rule rather than authoring one.

**Q2 - which token pair? `var(--success)` and `var(--danger)`.** Not the raw status tokens. See
the recorded 1.46:1 measurement above.

**Q3 - where does the rule live? A new
`src/frontend/components/UI/RedeemSteamKeyDialog/index.css`**, imported with `import './index.css'`
as the **first line** of `index.tsx`. That is the repo-wide convention: `TextInputField/index.tsx`
(L4), `HumbleClaimWizard/index.tsx` (L1). Do **NOT** reuse the global `.danger` utility from
`App.css:167` - it also forces `font-weight: var(--bold)`, which no sibling outcome note does, and
its `var(--text-danger, ...)` primary is declared only inside the dark
`body.classic, body.cyberSpaceOasis, body.cyberSpaceOasisAlt` block, so on light themes it
resolves to the same `--danger` anyway with extra indirection.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Author the two tone rules and wire the stylesheet in</name>
  <files>src/frontend/components/UI/RedeemSteamKeyDialog/index.css, src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx</files>
  <action>
Create `src/frontend/components/UI/RedeemSteamKeyDialog/index.css` containing exactly two rules,
`.redeemSteamKey__success` and `.redeemSteamKey__error`. Each declares **`color` and nothing
else**: `var(--success)` and `var(--danger)` respectively, with **no fallback arm** - both tokens
are declared in themes.scss's base `body {}` block so a fallback is noise.

Declare no other property. Per the measured facts above: `margin: 0` would delete the only spacing
the outcome paragraph has (there is no parent `gap` and no global margin reset), and
`font-size: var(--text-md)` / `font-weight: var(--regular)` are already what a bare `p` computes.
This is the smallest diff that fixes the measured defect and changes nothing that was not broken.
This is a deliberate, measured deviation from the four-property shape `HumbleClaimWizard`'s notes
use - record it as such, not as an oversight.

Put that reasoning in a block comment above the rules, citing the 7.35:1 / 3.55:1 figures, the
nord-light `#eceff4` dialog surface, the AA shortfall of the danger tone stated honestly, and the
fills-vs-text token rule.

**Comment hygiene, load-bearing not cosmetic:** that comment must NOT spell the raw status tokens
in their full `var(--status-...)` form. `Keys/index.css:522-525` documents exactly this discipline
- the file-wide grep and the stylesheet gate both key on that substring, and writing it out as
prose creates a false occurrence for both. Name it descriptively instead ("the raw status-success
token").

Then add `import './index.css'` as the **first line** of
`src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx`, above the existing React import,
matching `HumbleClaimWizard/index.tsx:1`. This single line is the whole difference between a live
stylesheet and a dead one.

Do **not** rename `redeemSteamKey__success` or `redeemSteamKey__error`, and do not touch the
branch at `index.tsx:148-157`. It stays exactly as-is; this task supplies the rules it has always
lacked.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test "$(grep -c "^import './index.css'" src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx)" = "1" && test "$(grep -v '^\s*\*' src/frontend/components/UI/RedeemSteamKeyDialog/index.css | grep -v '^\s*/\*' | grep -c -- '--status-')" = "0" && test "$(grep -c -- 'color: var(--success)' src/frontend/components/UI/RedeemSteamKeyDialog/index.css)" = "1" && test "$(grep -c -- 'color: var(--danger)' src/frontend/components/UI/RedeemSteamKeyDialog/index.css)" = "1" && test "$(grep -c -- 'margin' src/frontend/components/UI/RedeemSteamKeyDialog/index.css)" = "0" && npx prettier --check src/frontend/components/UI/RedeemSteamKeyDialog/ && npx tsc --noEmit -p tsconfig.json</automated>
  </verify>
  <done>`index.css` exists with two colour-only rules using `var(--success)` / `var(--danger)` and no fallback arms; no raw status token appears in it once comments are stripped; no `margin` declaration exists; `import './index.css'` is line 1 of `index.tsx`; the two classNames and the tone branch are byte-unchanged; prettier and tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Source gate proving the rules exist and the stylesheet is not dead</name>
  <files>src/frontend/components/UI/RedeemSteamKeyDialog/__tests__/redeemSteamKeyDialogStylesheet.test.ts</files>
  <action>
**Judgment on whether a test earns its keep here: yes, and for one narrow reason - the import
line.** The two colour declarations are low-risk on their own and would not justify a gate. But "a
stylesheet can ship wholly dead against its component" is a recorded failure mode in this repo,
and **nothing currently detects it**: `cssTokenSweep.test.ts` checks token *names* only, `pnpm
lint` is eslint over `.ts`/`.tsx`, there is no stylelint, and no test parses CSS. A rule file that
is never imported passes every existing gate in this repo. Assertion 5 below is the one that
cannot be obtained any other way. State this judgment in the test's header comment rather than
implying it.

Create the file modelled on `src/frontend/screens/Humble/Keys/__tests__/humbleKeysStylesheet.test.ts`.
Read both source files through `stripSourceComments` from `backend/testUtils/stripSourceComments` -
this is **load-bearing, not hygiene**: Task 1's rationale comment names the token names and the
fills-vs-text rule as prose, and an unstripped negative assertion could be satisfied by that prose
alone with the real declaration missing underneath.

Use block-scoped anchors of the form `/\.redeemSteamKey__success\s*\{([^}]*)\}/` so each assertion
proves the declaration lives INSIDE the right rule, not merely somewhere in the file.

Assert:
1. The `.redeemSteamKey__success` block declares `color: var(--success)`.
2. The `.redeemSteamKey__error` block declares `color: var(--danger)`.
3. Neither block, and the file as a whole, contains any `var(--status-` reference.
4. Neither block uses a fallback arm - no `var(--success,` and no `var(--danger,`.
5. `index.tsx` contains `import './index.css'` **and** still contains both
   `redeemSteamKey__success` and `redeemSteamKey__error`. Together these prove the chain component
   -> import -> rule is intact and the stylesheet is not orphaned.

**Every one of the five carries an explicit non-vacuity SANITY arm** against a known-bad inline
fixture, in the style of the Humble Keys gate. At minimum: a fixture declaring the raw
status-success token that assertion 1 must reject and assertion 3 must flag; a fixture with a
fallback arm that assertion 4 must flag; a descendant-selector-only fixture the block anchor must
NOT match; an `index.tsx`-shaped fixture with the classNames but no import line that assertion 5
must reject; and a stripper-integrity arm showing a comment naming `color: var(--success)` as
prose cannot satisfy assertion 1 on its own. A test that cannot fail is the
green-check-proving-nothing pattern this project stamps out.

State plainly in the header what this **cannot** prove: `src/frontend/jest.config.js` runs the
Frontend project with `testEnvironment: 'node'` - no jsdom, no CSS engine. Nothing here renders
anything or computes a contrast ratio. The 7.35:1 / 3.55:1 figures are arithmetic recorded in the
commit message and SUMMARY, not a measurement of a built app, and live adjudication of the
appearance is explicitly not claimed by this task.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest --selectProjects Frontend --testPathPattern 'RedeemSteamKeyDialog' 2>&1 | tail -20 && npx jest --selectProjects Frontend --testPathPattern 'cssTokenSweep|humbleKeysStylesheet' 2>&1 | tail -6 && npx prettier --check src/frontend/components/UI/RedeemSteamKeyDialog/</automated>
  </verify>
  <done>The new suite passes alongside the existing `copy.test.ts`; every positive assertion has a SANITY arm that proves it can fail; `cssTokenSweep` and `humbleKeysStylesheet` are still green.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo and run the full gate set</name>
  <files>.planning/todos/pending/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md</files>
  <action>
Append a `## Resolution` section to the todo at its **pending** path recording: the three answered
questions and the precedent each rests on; the token pair chosen with both measured ratios and the
honest note that 3.55:1 is below AA for body text; the `margin: 0` finding and why the wizard's
shape was deliberately not ported verbatim; the correction that the title's "read identically"
claim was true of the *paint*, not of the *messages*; and the explicit statement that the ~23
other raw-status foreground declarations were left untouched and uncensused.

**Then move it, in this exact order** - the repo has been bitten three times by the alternative:

1. Edit the file at `.planning/todos/pending/...`
2. `git add` that pending path. **Do not skip this.** `git mv` on a file whose edits are unstaged
   commits the HEAD content and silently drops the edits.
3. `git mv` pending -> `.planning/todos/completed/` (same filename).
4. Verify the staged blob at the NEW path actually carries the edit:
   `git show :.planning/todos/completed/<name>.md | grep -c '## Resolution'` must return `1`, not
   `0`. If it returns `0`, the edits were dropped - re-apply at the completed path and re-add.

Leave the frontmatter keys as they are. `completed/` is exempt from
`.planning/todos/todo-frontmatter-gate.py`, which scopes to `pending/` only - and nothing is being
left behind in `pending/` here.

Run the full verification set and record every result in the SUMMARY as a table, including any
that were already red before this task (name the baseline sha `1e74bc67e` if so - "pre-existing"
is a claim about a chosen baseline and needs one).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -f .planning/todos/pending/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md && test "$(git show :.planning/todos/completed/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md | grep -c '## Resolution')" = "1" && python3 .planning/todos/todo-frontmatter-gate.py && pnpm planning-gates && npx jest --selectProjects Frontend --testPathPattern 'RedeemSteamKeyDialog|cssTokenSweep' 2>&1 | tail -6</automated>
  </verify>
  <done>The todo lives in `completed/` with its `## Resolution` section present in the *staged* blob (verified via `git show :`, not by reading the working tree); `pending/` no longer contains it; the frontmatter gate and `pnpm planning-gates` pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none crossed | This task adds two CSS `color` declarations, one import line, one source-text test, and moves a planning file. No untrusted input is parsed, no network call is made, no process is spawned, and no package is installed. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-gxd-01 | Information disclosure | `RedeemSteamKeyDialog` outcome paragraph | accept | The paragraph renders only `copy.ts`'s five fixed message strings, never the key. T-26-01 (never log the raw key) is untouched by this task - no logging, serialisation or new data path is added. |
| T-gxd-02 | Tampering | supply chain | accept | No `pnpm add`, no new dependency, no lockfile change. The Package Legitimacy Gate does not arm; there is nothing to audit. |
</threat_model>

<verification>
1. `import './index.css'` is line 1 of `index.tsx` - asserted by both the Task 1 grep and the
   Task 2 gate. This is the one link that makes the difference between a live stylesheet and a
   dead one; it is verified, never assumed.
2. The tone branch at `index.tsx:148-157` and the two classNames are byte-unchanged:
   `git diff src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx` shows the added import
   line and nothing else.
3. No raw status token in the new stylesheet, comments stripped.
4. No `margin` declaration in the new stylesheet - the paragraph's existing spacing survives.
5. `cssTokenSweep.test.ts` still holds the undefined-custom-property count at 0 with the new file
   in the `git ls-files src/*` population.
6. `pnpm planning-gates` and `todo-frontmatter-gate.py` pass with the todo moved.
</verification>

<success_criteria>
- A successful redeem paints `var(--success)`; every failure outcome paints `var(--danger)`. The
  distinction `copy.ts` has always computed is no longer discarded at paint time.
- Neither rule references a raw status token, and neither carries a fallback arm.
- The stylesheet is provably reachable from the component, enforced by a test that can fail.
- Nothing about the dialog's layout, typography or spacing changed - only colour.
- The todo is in `completed/` with its resolution recorded in the staged blob.
- The SUMMARY and commit message state the 3.55:1 danger ratio honestly as below AA, name the
  `margin: 0` deviation from the wizard's shape and why, correct the todo's title claim
  (the *paint* was identical, not the *messages*), and record that no live/pixel verification was
  performed.
</success_criteria>

<output>
Create `.planning/quick/260922-gxd-style-the-redeemsteamkeydialog-outcome-p/260922-gxd-SUMMARY.md` when done
</output>
