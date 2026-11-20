---
phase: quick-260921-mzl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/Dialog/index.css
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts
  - src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss
  - .planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md
  - .planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md
autonomous: true
requirements: [QUICK-260921-MZL]

must_haves:
  truths:
    - "`src/frontend/components/UI/Dialog/index.css` no longer contains any `.Dialog__element`, `.Dialog__header` (the bare block, NOT `.Dialog__headerTitle`), `.Dialog__Close`, `.Dialog__CloseButton` or `.Dialog__CloseIcon` rule."
    - "`.Dialog` still declares `--dialog-margin-horizontal`, `--dialog-margin-vertical` and `--dialog-gap`, so `InstallModal/index.scss:27` and `Winetricks/index.scss:3` still resolve, and `cssTokenSweep.test.ts` stays green."
    - "`.Dialog__headerTitle`, `.Dialog__content`, `.log-upload-result` and `.Dialog__footer` survive byte-identical — this task deletes item 3's named blocks only, it does not widen scope to the newly-found dead classes."
    - "No comment anywhere in the repo still describes `.Dialog__element` as a rule that PRESENTLY EXISTS in `Dialog/index.css`. Every surviving reference says the rule was deleted by quick task 260921-mzl."
    - "`WinetricksBrowse/index.scss`'s bare-`--modal-background` justification cites only precedents that still exist, with the `Dialog.tsx` line number re-measured after the Dialog.tsx comment edits (NOT copied forward from `:51`)."
    - "The ABSENCE guard in `dialogWindowChrome.test.ts` still exists and still asserts `.Dialog__element` is never applied as a className, but its stated rationale is true in the present tense — the `opacity: 0 forever` reasoning is gone, because the rule that made it true is gone."
    - "One new pending todo records the `.Dialog__headerTitle` / `.Dialog__content` census correction, with `severity: minor`, `platform: any`, `ready: code` present, bare and lowercase, so `pnpm planning-gates` stays green."
    - "The parent todo lives in `.planning/todos/completed/`, its on-disk content carries the closing note (verified after the move, not before), and that note names where items 1/2/4's in-situ warnings already live and cross-references the new todo by filename."
  artifacts:
    - path: "src/frontend/components/UI/Dialog/index.css"
      provides: "Dialog stylesheet reduced to its five live/kept rules"
      contains: "--dialog-margin-horizontal"
    - path: "src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts"
      provides: "ABSENCE guard retained with an accurate present-tense rationale"
      contains: "Dialog__element"
    - path: ".planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md"
      provides: "The census correction this task surfaced and deliberately did not fix"
      contains: "ready: code"
    - path: ".planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md"
      provides: "Parent todo closed with a note that does not discard items 1/2/4 or the census correction"
      contains: "260921-mzl"
  key_links:
    - from: "src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss"
      to: "src/frontend/components/UI/Dialog/components/Dialog.tsx"
      via: "bare --modal-background precedent citation"
      pattern: "Dialog\\.tsx:[0-9]+"
    - from: ".planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md"
      to: ".planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md"
      via: "closing-note cross-reference by filename"
      pattern: "dialog-content-and-headertitle-are-dead"
---

<objective>
Delete the dead `.Dialog__*` CSS named by item 3 of the `2026-09-19-native-dialog-residue`
todo, repair the two existing correct comments that the deletion makes false, file the
census correction the work surfaced, and close the parent todo without discarding its three
other verified-but-deliberately-unfixed items.

Purpose: item 3 is the only actionable item in a four-item todo. Items 1, 2 and 4 were
verified accurate at HEAD (39f024e6a) and each already carries its warning in situ, so the
todo's remaining value is item 3 plus a closing record. Doing item 3 without the two comment
repairs would leave the repo asserting, in two places, that a rule exists which does not —
the same class of stale-citation defect this project keeps paying for.

Output: a 96-line reduction in `Dialog/index.css`, three restated comment blocks, one new
pending todo, one closed parent todo.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

Read CLAUDE.md's **todo triage frontmatter** convention before Task 2 — `/gsd-add-todo`'s
template does NOT emit `severity`/`platform`/`ready`, and omitting them turns CI red.
Read its **gate conventions** before running lint.

@src/frontend/components/UI/Dialog/index.css
@src/frontend/components/UI/Dialog/components/Dialog.tsx
@src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts
@src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss
@.planning/todos/pending/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md

<measured_at_head>
All of the following was measured against HEAD `39f024e6a` before this plan was written.
Do NOT re-derive it; DO re-measure any LINE NUMBER you are about to write into a comment,
because Task 1's own edits shift them.

Class census under `src/`, `*.ts`+`*.tsx` (className usage) vs `*.css`+`*.scss` (rules):

| class                 | ts/tsx | css/scss | verdict                                              |
| --------------------- | ------ | -------- | ---------------------------------------------------- |
| `Dialog__element`     | 11     | 4        | all 11 are PROSE INSIDE COMMENTS — zero className     |
| `Dialog__header`      | 0      | 5        | dead                                                  |
| `Dialog__headerTitle` | 0      | 2        | dead — NOT in scope, see Task 2                       |
| `Dialog__Close`       | 0      | 7        | dead                                                  |
| `Dialog__CloseButton` | 0      | 4        | dead                                                  |
| `Dialog__CloseIcon`   | 0      | 1        | dead                                                  |
| `Dialog__content`     | 0      | 5        | dead — NOT in scope, see Task 2                       |
| `Dialog__footer`      | 1      | 2        | **LIVE**, applied at `DialogFooter.tsx:8`             |
| `Dialog__input`       | 1      | 0        | applied at `RedeemSteamKeyDialog/index.tsx:122`, no rule anywhere — dead in the OPPOSITE direction; explicitly NOT in scope |

`DialogHeader.tsx` renders a bare MUI `DialogTitle` with an `sx` prop and applies no
className. `DialogContent.tsx` renders `<div className={className}>` and no consumer ever
passes `"Dialog__content"`.

Bare `var(--modal-background)` consumers in the whole repo — exactly four sites:
`Dialog.tsx:51`, `Dialog/index.css:20`, `Dialog/index.css:73`, `WinetricksBrowse/index.scss:87`.
Two of those four are lines this task deletes.

No gate, script or test under `meta/` or `src/` pins any `Dialog__*` class name or any
`it()` title from `dialogWindowChrome.test.ts` — the only hits outside the Dialog directory
are planning prose (`STATE.md`, the `260820-kq0` plan/summary), which is historical record
and must NOT be rewritten. Restating the test's `it()` titles is therefore safe.
</measured_at_head>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete the dead Dialog rules and repair the three comment blocks the deletion falsifies</name>
  <files>src/frontend/components/UI/Dialog/index.css, src/frontend/components/UI/Dialog/components/Dialog.tsx, src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts, src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss</files>
  <action>
**1a — `Dialog/index.css`.** Delete, by HEAD line numbers: `.Dialog__element` (10-38),
`.Dialog__element::backdrop` (39-41), `.Dialog__element:popover-open, .Dialog__element[open]`
(43-48), `.Dialog__header` (50-54), `.Dialog__Close` (64-67), the combined
`.Dialog__Close, .Dialog__header` (69-74), `.Dialog__CloseButton` plus its `:focus-visible`,
`:hover` and `:active` (76-101), and `.Dialog__CloseIcon` (103-105).

KEEP, byte-identical: `.Dialog` (1-8), `.Dialog__headerTitle` (56-62), `.Dialog__content`
(107-109), `.log-upload-result` (111-113), `.Dialog__footer` (115-120). Resulting file is
five rules in that order.

`.Dialog` is NOT cosmetic and must not be swept along with the block deletion: it DECLARES
`--dialog-margin-horizontal`, `--dialog-margin-vertical` and `--dialog-gap`, consumed
externally by `InstallModal/index.scss:27` and `Winetricks/index.scss:3` and internally by
the surviving `.Dialog__headerTitle` and `.Dialog__content`. Deleting it creates undefined
custom-property references and turns `cssTokenSweep.test.ts` red.

Do NOT add a tombstone comment to the CSS file naming the deleted classes. A raw-source gate
in this repo has already been satisfied by the prose that names the thing it forbids, and a
comment naming `Dialog__element` here would defeat the 1a verify grep below.

**1b — `Dialog.tsx`, three comment blocks, comments only.** No code change; this file's
executable content stays byte-identical. Blocks at roughly 41-49, 107-116 and 117-127 all
describe `.Dialog__element` as a dead-but-PRESENT rule living in `Dialog/index.css`. After
1a that is false. Restate each so it says the rule was DELETED by quick task 260921-mzl,
while preserving what each block actually explains (respectively: why the 10px radius lives
on `StyledPaper` rather than in a stylesheet; why the inert `sx` `maxWidth`/`paddingTop` pair
was dropped rather than revived; why the 500ms entrance rides MUI's own transition props).
Those three rationales remain correct and load-bearing — the only false part is the tense and
the location claim.

Keep the 107-116 and 117-127 blocks where they are, as `//` comments sitting between
`MuiDialog`'s JSX attributes. That position parses today; do not relocate them.

**1c — `dialogWindowChrome.test.ts`, three sites, comments and `it()` titles only.** No
assertion change.
  - ~64-75: the `it()` title says "replacing the dead `.Dialog__element` rule"; the inline
    comment says "the value the dead `.Dialog__element` rule ... use". Restate both to the
    deleted rule.
  - ~98-106: the inline comment says "combined with the dead `.Dialog__element::backdrop` /
    box-shadow hack (if ever revived)". Restate: that rule was deleted by 260921-mzl, so the
    hazard is now reintroduction rather than revival.
  - ~108-118, the sharpest case: the ABSENCE guard's stated reason is "its visible state in
    index.css is gated on `:popover-open`/`[open]`, pseudo-states a plain rendered element
    can never match, so doing so would make the dialog permanently invisible (opacity: 0
    forever)". Once the rule is deleted that consequence NO LONGER FOLLOWS. The guard is
    still worth keeping — it stops a stale class name being reintroduced into the primitive,
    and stops a future reader re-adding the deleted rule to "make the class work". Write
    THAT as the reason, in the present tense. Do not delete the assertion.

Comment-only edits here cannot turn this suite red: every assertion pipes through
`stripSourceComments`, and the single raw read is the FILLED-SPECIMEN GUARD matching
`/Slide/`, which is satisfied by executable code (`<Slide direction="up"`), not by prose.
Run the suite anyway — that reasoning is a prediction, not a measurement.

**1d — `WinetricksBrowse/index.scss` ~line 32.** The comment justifies consuming
`--modal-background` bare by citing "`Dialog/components/Dialog.tsx:51` and
`Dialog/index.css:20,73` already consume bare". Lines 20 and 73 are exactly two of the lines
1a deletes, and they were the only bare consumers in the repo outside `WinetricksBrowse:87`
itself. Restate so the precedent named is one that still exists — `Dialog.tsx`'s
`StyledPaper` `backgroundColor` — and so the argument still carries: that site is the
dialog's own surface, so an undefined `--modal-background` would already have broken the
dialog before it reached this sticky search bar.

RE-MEASURE the `Dialog.tsx` line number before writing it. Step 1b edits comment blocks
ABOVE `StyledPaper`, so `backgroundColor: 'var(--modal-background)'` will almost certainly
no longer be at `:51`. Get it with
`grep -n "backgroundColor: 'var(--modal-background)'" src/frontend/components/UI/Dialog/components/Dialog.tsx`
AFTER 1b is written to disk. This repo has already shipped an anchor retyped from a stale
copy that silently no-opped; do not copy `:51` forward.

The sibling copy of this header in `Winetricks/Row/index.scss` does NOT cite these lines —
checked at HEAD. Leave it alone.
  </action>
  <verify>
  <automated>
cd /Users/graysonmitchell/Projects/GameLib

# 1a: the six deleted class names are gone from the stylesheet.
# SUBSTRING TRAP: `Dialog__header` is a prefix of the PERMITTED `Dialog__headerTitle`.
# A bare `grep Dialog__header` would false-RED on the kept rule. Bound it.
grep -nE '\.Dialog__(element|header([^T]|$)|Close)' src/frontend/components/UI/Dialog/index.css && exit 1

# 1a: the four kept rules and the three declared tokens survive.
for t in '.Dialog__headerTitle' '.Dialog__content' '.log-upload-result' '.Dialog__footer' \
         '--dialog-margin-horizontal' '--dialog-margin-vertical' '--dialog-gap'; do
  grep -qF -- "$t" src/frontend/components/UI/Dialog/index.css || { echo "MISSING: $t"; exit 1; }
done

# 1b/1c/1d: no surviving comment claims the rule is present in index.css.
# Reviewed by eye, then pinned: every remaining mention must carry the deletion marker.
# NOT a `grep -rl ... | while read` loop: `exit 1` on the right of a pipe exits only the
# subshell, so that shape is fail-open — the repo's recorded green-check-proving-nothing
# pattern. Collect offenders into a variable and test it in the parent shell instead.
STALE=""
for f in $(grep -rl 'Dialog__element' src/); do
  grep -q '260921-mzl' "$f" || STALE="$STALE $f"
done
[ -n "$STALE" ] && { echo "STALE CITATION, no deletion marker:$STALE"; exit 1; }

# 1d: the re-measured Dialog.tsx line number in the scss comment is the real one.
LINE=$(grep -n "backgroundColor: 'var(--modal-background)'" \
  src/frontend/components/UI/Dialog/components/Dialog.tsx | cut -d: -f1)
grep -qF "Dialog.tsx:${LINE}" src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss \
  || { echo "scss cites a stale Dialog.tsx line; real line is ${LINE}"; exit 1; }

# 1d: the two deleted index.css lines are no longer cited as precedent.
grep -nE 'Dialog/index\.css:(20|73)|index\.css:20,73' \
  src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss && exit 1

# Gates.
npx jest --runInBand \
  src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts \
  src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts
pnpm codecheck
pnpm lint
npx prettier --check \
  src/frontend/components/UI/Dialog/index.css \
  src/frontend/components/UI/Dialog/components/Dialog.tsx \
  src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts \
  src/frontend/components/UI/Winetricks/WinetricksBrowse/index.scss
  </automated>
  </verify>
  <done>
`Dialog/index.css` is five rules. `dialogWindowChrome.test.ts` and `cssTokenSweep.test.ts`
both pass. `pnpm codecheck` clean. `pnpm lint` introduces no new warning — this repo's lint
is two ceilings with one free slot, so a comment-only change must not consume it; if the
count moves at all, stop and report rather than raising a ceiling. Prettier clean on the four
touched files (scoped deliberately: `pnpm prettier` covers the whole tree and its state at
HEAD is not this task's baseline).
  </done>
</task>

<task type="auto">
  <name>Task 2: File the census correction this task surfaced and is deliberately not fixing</name>
  <files>.planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md</files>
  <action>
Create the todo. It records that `.Dialog__headerTitle` and `.Dialog__content` are equally
dead — 0 className hits in any `.ts`/`.tsx` — which the parent todo's item-3 census missed,
and that `.Dialog__content` is the worse of the two because its deadness fans out into four
OTHER stylesheets that style it. That is a materially wider blast radius than item 3, which
is why it gets its own pass instead of a silent ride-along.

The five downstream sites, at HEAD (the parent context's abbreviated paths were wrong in
their directory prefixes; these are the measured full paths, line numbers unchanged):
  - `src/frontend/screens/Settings/components/SettingsModal/index.scss:1` —
    `.Dialog__content.settingsDialogContent`. Worth calling out specifically: this is a
    COMPOUND selector needing both classes, and `.settingsDialogContent` IS live
    (`Dialog.tsx`'s `StyledPaper` has a `:has(.settingsDialogContent)` height rule). So the
    Settings dialog's own content rule is dead while the height rule that depends on the
    other half of the pair still fires — that asymmetry is the interesting finding.
  - `src/frontend/screens/Game/ModifyInstallModal/index.scss:7`
  - `src/frontend/components/UI/ProgressDialog/index.css:6`
  - `src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css:6`
  - `src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css:10`
    (`.Dialog__headerTitle`)

State why this is a measurement, not a fix: deleting `.Dialog__content` means also deleting
or re-anchoring five rules in four files whose visual effect nobody has measured, which is a
different-sized job from deleting self-contained blocks. Also record the sibling finding that
`.Dialog__input` is dead in the OPPOSITE direction — applied at
`RedeemSteamKeyDialog/index.tsx:122` with no matching rule anywhere — so a future pass has
both directions in one place.

Frontmatter MUST carry, bare/lowercase/unquoted, in this order, immediately after
`created`/`title`/`area`/`files`:

```
severity: minor
platform: any
ready: code
```

Per CLAUDE.md these three are NOT emitted by the `/gsd-add-todo` template and must be added
by hand; `severity: minor` (not `low`), `platform: any`, `ready: code` — the values are
matched bare, lowercase and exact by `.planning/todos/todo-frontmatter-gate.py`. Never quote
them. `area: ui-dialogs`, matching the parent.
  </action>
  <verify>
  <automated>
cd /Users/graysonmitchell/Projects/GameLib
T=.planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md
test -f "$T"
grep -qx 'severity: minor' "$T"
grep -qx 'platform: any' "$T"
grep -qx 'ready: code' "$T"
# the five measured downstream sites are all named
for p in 'Settings/components/SettingsModal/index.scss:1' \
         'Game/ModifyInstallModal/index.scss:7' \
         'UI/ProgressDialog/index.css:6' \
         'MessageBoxModal/index.css:6' \
         'MessageBoxModal/index.css:10'; do
  grep -qF -- "$p" "$T" || { echo "MISSING SITE: $p"; exit 1; }
done
pnpm planning-gates
  </automated>
  </verify>
  <done>
The todo exists, `pnpm planning-gates` is green, and all five downstream stylesheet sites are
named with their measured full paths.
  </done>
</task>

<task type="auto">
  <name>Task 3: Close the parent todo without discarding its three unfixed items</name>
  <files>.planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md</files>
  <action>
Write a closing note at the TOP of the parent todo's body (immediately after the frontmatter,
before the `# Native dialog residue...` heading or as the first section under it), then move
the file to `.planning/todos/completed/`.

The note must state:
  - **Item 3 was DONE** by quick task 260921-mzl — name the file and the six deleted class
    blocks, and note the two comment repairs the deletion forced, so a reader understands why
    the change touched four files and not one.
  - **Items 1, 2 and 4 were verified accurate at HEAD `39f024e6a` and deliberately left
    unfixed**, each because its warning ALREADY LIVES IN SITU. Name the location for each, so
    a future reader does not re-investigate:
      - item 1 — `storeManagers/storeManagerCommon/games.ts` carries a "DEGRADED UNDER TAURI"
        comment ledgering D-35-15-01 directly above the call; the real owner is D-35-15-01's
        Tauri child-window work.
      - item 2 — `src/backend/utils.ts` carries a 16-line CR-04 comment above `cancelId: 0`
        spelling out the inverted polarity and the fail-safe reasoning.
      - item 4 — `src/backend/platform/index.ts:440-442` documents the logged-no-op D-03
        decision, and the stub at `:506-511` warns on every call.
  - **A cross-reference to the new todo BY FILENAME**
    (`2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md`),
    stating that item 3's census was incomplete and the correction is carried there, so
    closure does not discard it.

Closing on a partly-true title has already discarded untested siblings in this repo — the
title here names four things and only one was done, so the note carries the whole weight of
not losing the other three.

**Move mechanics.** Do NOT use `git mv`: it has twice in this repo committed HEAD content and
silently dropped unstaged edits, once undetected for seven days. Sequence:
  1. Edit the file in place, in `pending/`, adding the closing note.
  2. Plain `mv` it to `.planning/todos/completed/` (same filename).
  3. `git add -A .planning/todos/`
  4. Verify the CONTENT ON DISK at the destination path — the verify block below does this.
     Do not infer success from the move's exit code.
  </action>
  <verify>
  <automated>
cd /Users/graysonmitchell/Projects/GameLib
SRC=.planning/todos/pending/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md
DST=.planning/todos/completed/2026-09-19-native-dialog-residue-after-the-vcruntime-and-snap-migrations.md
test ! -e "$SRC"
test -f "$DST"
# content verified at the DESTINATION, post-move
grep -qF '260921-mzl' "$DST"
grep -qF '2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md' "$DST"
grep -qF 'D-35-15-01' "$DST"
grep -qF 'cancelId: 0' "$DST"
grep -qF 'platform/index.ts' "$DST"
# the original four-item body survived the move intact
grep -qF '## 4. Shim axis 3' "$DST"
# staged, and the move registered as a rename/delete+add
git status --porcelain .planning/todos/ | grep -q .
pnpm planning-gates
  </automated>
  </verify>
  <done>
The parent todo is gone from `pending/`, present in `completed/` with its full original body
plus a closing note naming all three in-situ warning locations and cross-referencing the new
todo by filename, verified by reading the destination file on disk. `pnpm planning-gates`
green (scope is `pending/` only, so the moved file is now exempt — the gate passing is
necessary, not sufficient; the content greps above are what actually prove the move).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | This change is comment prose plus dead-CSS deletion plus planning-doc moves. No input crosses a trust boundary, no new dependency, no network, no filesystem path derived from user input. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-mzl-01 | Tampering | `Dialog/index.css` | mitigate | Deleting `.Dialog` would break external `--dialog-*` consumers. Verify block asserts all three tokens survive and runs `cssTokenSweep.test.ts`. |
| T-mzl-02 | Repudiation | closing note | mitigate | Closing a four-item todo on one item's completion could silently discard three verified findings and a census correction. Task 3's verify greps each in-situ location and the cross-reference at the destination path. |
| T-mzl-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this task. No legitimacy gate required. |
</threat_model>

<verification>
Run from the repo root after all three tasks:

```
npx jest --runInBand \
  src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts \
  src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts
pnpm codecheck
pnpm lint
pnpm planning-gates
```

`themeTokens.test.ts` has zero hits for `modal-background` or `Dialog` — no pin there, no
need to run it.

These gates were expected green before the plan was written. Run them; do not assert them.
A plan asserting a gate's colour instead of running it has produced four false REDs in this
repo already.
</verification>

<success_criteria>
- `src/frontend/components/UI/Dialog/index.css` contains exactly five rules: `.Dialog`,
  `.Dialog__headerTitle`, `.Dialog__content`, `.log-upload-result`, `.Dialog__footer`.
- Every surviving `Dialog__element` mention under `src/` carries the `260921-mzl` deletion
  marker; none claims the rule presently exists in `index.css`.
- `WinetricksBrowse/index.scss` cites a re-measured, currently-true `Dialog.tsx` line and no
  longer cites `Dialog/index.css:20,73`.
- The ABSENCE guard in `dialogWindowChrome.test.ts` still exists, unchanged as an assertion,
  with a present-tense rationale that does not depend on the deleted rule.
- One new pending todo carries the census correction with valid triage frontmatter.
- The parent todo is in `completed/` with a closing note verified on disk after the move.
- `codecheck`, `lint`, `planning-gates` and both named jest suites are green, with lint
  introducing no new warning.
</success_criteria>

<output>
Create `.planning/quick/260921-mzl-delete-the-dead-dialog-css-todo-item-3-a/260921-mzl-SUMMARY.md` when done.

Record in it: the final line count of `Dialog/index.css`; the re-measured `Dialog.tsx` line
number written into `WinetricksBrowse/index.scss` (and what it was before, if it moved); the
`pnpm lint` warning count before and after; and an explicit statement that items 1, 2 and 4
were closed unfixed by design, not overlooked.
</output>
