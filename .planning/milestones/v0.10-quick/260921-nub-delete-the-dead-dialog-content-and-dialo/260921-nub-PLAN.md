---
phase: quick-260921-nub
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/Dialog/index.css
  - src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css
  - src/frontend/components/UI/ProgressDialog/index.css
  - src/frontend/screens/Game/ModifyInstallModal/index.scss
  - src/frontend/screens/Settings/components/SettingsModal/index.scss
  - src/frontend/screens/Settings/components/SettingsModal/index.tsx
  - src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
  - .planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md
  - .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md
  - .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md
  - .planning/todos/completed/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md
autonomous: true
requirements: [QUICK-260921-NUB]

must_haves:
  truths:
    - "`grep -rn 'Dialog__content\\|Dialog__headerTitle\\|Dialog__input' src/` returns ZERO lines — the two dead declarations, all five downstream rules, and the one orphaned className are gone, and no tombstone comment reintroduces any of the three names as prose."
    - "`.Dialog__footer` and its two downstream rules survive byte-identical — it is LIVE (`DialogFooter.tsx:8`) and explicitly out of scope."
    - "`--dialog-margin-horizontal` is still DECLARED in `Dialog/index.css`, carrying an in-situ comment that names `InstallModal/index.scss:27` and `Winetricks/index.scss:3` and states why deleting it would turn `cssTokenSweep.test.ts` red. `--dialog-margin-vertical` and `--dialog-gap` are gone, and no `var()` reference to either survives anywhere under `src/` or `public/`."
    - "`className=\"settingsDialogContent\"` at `SettingsModal/index.tsx:61` SURVIVES — `Dialog.tsx:56`'s `StyledPaper` `:has(.settingsDialogContent):not(:has(.logs-wrapper))` height rule is keyed on it and is live."
    - "`SettingsModal/index.scss` no longer exists and `SettingsModal/index.tsx` no longer imports it — the file's only content was the compound rule this task deletes."
    - "`Dialog.tsx` is untouched: no executable line and no comment in it changes. The malformed `:59` selector is RECORDED, not repaired."
    - "Three new pending todos exist, each carrying `severity:`, `platform:`, `ready:` bare/lowercase in that order, so `pnpm planning-gates` stays green: the `Dialog.tsx:59` stray-paren finding (`ready: live-gate`), the unstyled Steam-key input (`ready: live-gate`), and the never-applied bare `.Dialog` class (`ready: live-gate`)."
    - "The parent todo lives in `.planning/todos/completed/`, its on-disk content at the DESTINATION carries a closing note recording that DELETION was chosen over re-anchoring and why, and cross-references all three new todos by filename."
    - "`pnpm lint` exits 0 with its two warning counts UNMOVED from the pre-edit baseline, and neither `SRC_CEILING` (1124) nor `TESTS_CEILING` (638) is raised."
  artifacts:
    - path: "src/frontend/components/UI/Dialog/index.css"
      provides: "Dialog primitive stylesheet reduced to its three surviving rules"
      contains: "--dialog-margin-horizontal"
    - path: "src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx"
      provides: "Steam-key input with the dead className removed, all behaviour unchanged"
      contains: "redeemSteamKey.placeholder"
    - path: ".planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md"
      provides: "The adjacent Dialog.tsx:59 defect found while measuring, recorded not fixed"
      contains: "ready: live-gate"
    - path: ".planning/todos/completed/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md"
      provides: "Parent todo closed with the delete-vs-re-anchor decision recorded on disk"
      contains: "260921-nub"
  key_links:
    - from: "src/frontend/screens/Settings/components/SettingsModal/index.tsx"
      to: "src/frontend/components/UI/Dialog/components/Dialog.tsx"
      via: "settingsDialogContent className consumed by StyledPaper's :has() height rule"
      pattern: "settingsDialogContent"
    - from: ".planning/todos/completed/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md"
      to: ".planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md"
      via: "closing-note cross-reference by filename"
      pattern: "logs-wrapper-rule-has-a-stray-paren"
---

<objective>
Action the pending todo `2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md`:
delete the two dead declarations in the Dialog primitive, delete the five downstream rules in
four other stylesheets that name them, resolve the sibling `.Dialog__input` inverse finding by
removing the orphaned className, record three adjacent findings surfaced while measuring, and
close the parent todo.

Purpose: `.Dialog__content` and `.Dialog__headerTitle` are unreachable at every consumer — not
merely un-grepped, but proven unreachable at the render sites (see `<measured_at_head>`). Their
names nonetheless still style five rules across four files, so the next reader auditing
`Dialog__*` re-derives the same census from scratch. Deleting them is provably a no-op on
rendering; leaving them is a standing invitation to "fix" them by re-anchoring, which WOULD be a
visual change.

Output: seven source files reduced (one deleted outright), three new pending todos, one closed
parent todo. No behaviour change, no visual change, no new rule anywhere.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md

Read CLAUDE.md's **todo triage frontmatter** convention before Task 3 — `/gsd-add-todo`'s
template does NOT emit `severity`/`platform`/`ready`, and omitting any of them turns CI red.
Note also CLAUDE.md's standing instruction that **Heroic is not upstream**: never frame any
finding here as a deviation from, or a defect inherited from, Heroic.

@.planning/todos/pending/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md
@src/frontend/components/UI/Dialog/index.css
@src/frontend/components/UI/Dialog/components/Dialog.tsx
@src/frontend/screens/Settings/components/SettingsModal/index.scss
@src/frontend/screens/Settings/components/SettingsModal/index.tsx
@src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx

<the_decision_is_already_made>
The todo frames this as "delete **or** re-anchor". **It is not open. Delete.**

`Dialog.tsx:106-120` records this repo's binding precedent, set by `260820-kq0` and restated by
`260921-mzl`: an inert `maxWidth`/`paddingTop` pair was "Deliberately DROPPED rather than
realized", because "reviving an unreviewed `min(700px, 85vw)`/`paddingTop` pair here would change
sizing for all 25 Dialog consumers as an undiscussed side effect".

The same reasoning binds here, hardest at Settings. Re-anchoring
`.Dialog__content.settingsDialogContent` to a bare `.settingsDialogContent` would ACTIVATE
`width: 65vw; display: flex; flex: 1 1 60vh; max-width: 800px; min-height: 64vh` on the Settings
dialog **for the first time ever** — a live visual change with no requirement behind it, in a
`testEnvironment: 'node'` project with no jsdom and no CSS engine, which therefore cannot observe
whether it looks right. Deletion is provably a no-op on rendering; re-anchoring is an unreviewed
redesign wearing a cleanup's clothes.

Re-anchoring remains available to a future, deliberately-visual, live-gated task. It is not
available to this one. Do not do it, and do not leave a commented-out rule "for later" — a
commented-out rule would also defeat the Task 1 census grep.
</the_decision_is_already_made>

<measured_at_head>
Everything below was measured at HEAD `0135587aa` before this plan was written. Re-confirm each
before editing (Task 1 step 0 requires it); do NOT re-derive from scratch.

**Census of the three names across `src/` — complete, 8 sites:**

| site | kind |
| --- | --- |
| `Dialog/index.css:10` `.Dialog__headerTitle {` | declaration |
| `Dialog/index.css:18` `.Dialog__content {` | declaration |
| `DialogHandler/components/MessageBoxModal/index.css:6` `.errorDialog .Dialog__content` | downstream |
| `DialogHandler/components/MessageBoxModal/index.css:10` `.errorDialog .Dialog__headerTitle` | downstream |
| `ProgressDialog/index.css:6` `.progressDialog .Dialog__content` | downstream |
| `screens/Game/ModifyInstallModal/index.scss:7` `& .Dialog__content` | downstream (nested) |
| `screens/Settings/components/SettingsModal/index.scss:1` `.Dialog__content.settingsDialogContent` | downstream (COMPOUND) |
| `RedeemSteamKeyDialog/index.tsx:122` `className="Dialog__input"` | INVERSE: class applied, no rule anywhere |

**Deadness is confirmed AT THE CONSUMERS, not merely by grep.** `DialogContent.tsx:12` is
`<div className={className}>` — it never adds `Dialog__content` itself. Every dialog carrying a
downstream rule was read:

- `ProgressDialog/index.tsx:64` — `<DialogContent>`, no className
- `MessageBoxModal/index.tsx:93` — `<DialogContent>`, no className
- `ModifyInstallModal/index.tsx:45` — `<DialogContent>`, no className
- `SettingsModal/index.tsx:61` — `<DialogContent className="settingsDialogContent">` — ONE class,
  so the compound `.Dialog__content.settingsDialogContent` can never match
- `DialogHeader.tsx:11-19` renders a bare MUI `DialogTitle` with an `sx` prop and NO className,
  so `.Dialog__headerTitle` is unreachable from the primitive

**`.Dialog__footer` IS LIVE** — applied at `DialogFooter.tsx:8`, styled at `Dialog/index.css:26`
and `MessageBoxModal/index.css:37` (`.launchOptionsDialog .Dialog__footer`). **Not in scope. Do
not touch it or either of its rules.**

**Custom-property consumers, measured repo-wide (excluding `node_modules`/`.git`/`graphify-out`):**

| token | declared | referenced |
| --- | --- | --- |
| `--dialog-margin-horizontal` | `Dialog/index.css:5` | `Dialog/index.css:12,19` (both being deleted) + `InstallModal/index.scss:27` + `Winetricks/index.scss:3` |
| `--dialog-margin-vertical` | `Dialog/index.css:6` | `Dialog/index.css:12` ONLY |
| `--dialog-gap` | `Dialog/index.css:7` | `Dialog/index.css:19` ONLY |

Every other repo-wide hit for the latter two is planning prose under `.planning/`, which is
historical record and must not be rewritten.

**`SettingsModal/index.scss` is 12 lines and the compound rule is its ENTIRE content** — including
a nested `.log-box { width: 100% }` that compiles to `.Dialog__content.settingsDialogContent
.log-box` and is dead for the same compound reason. Deleting the whole file loses nothing live.
Nothing `jest.mock`s the stylesheet; no gate, script or test outside `.planning/` names it.

**`Dialog/index.css` after Task 1 is three rules:** `.Dialog` (tokens only, one token left),
`.log-upload-result`, `.Dialog__footer`.
</measured_at_head>

<traps>
**TRAP 1 — do NOT delete `--dialog-margin-horizontal`, and do NOT describe it as simply "live".**
`cssTokenSweep.test.ts` holds the undefined-custom-property count at 0 with an ALLOWLIST of `[]`.
It is a NAME-based gate (its own header documents this as "blind spot B: this gate checks NAMES,
not SCOPES"), so deleting the declaration turns it RED via `InstallModal/index.scss:27` and
`Winetricks/index.scss:3`. The declaration MUST survive.

But the honest comment is not "two live consumers". Measured at HEAD: **no element anywhere in
`src/` is ever given the bare class `Dialog`** — `Dialog.tsx` does not add it, and every one of
the ~25 consumers passes a different literal (`notLoggedIn`, `uninstall-modal`, `AboutDialog`,
`InstallModal__dialog`, `errorDialog`, `progressDialog`, `ModifyInstall__dialog`). So
`--dialog-margin-horizontal` is declared in a scope that matches nothing, and those two external
references very likely resolve to nothing at runtime today. That is `cssTokenSweep`'s documented
blind spot B, verbatim. It is a SEPARATE defect, recorded in Task 3, **not fixed here** — and the
in-situ comment must say this rather than assert a runtime relationship nobody has measured.

**TRAP 2 — `SettingsModal/index.scss` becomes an empty file, and this is the single most dangerous
edit in the task.** Delete the file AND the `import './index.scss'` at `SettingsModal/index.tsx:12`.
But `className="settingsDialogContent"` on `DialogContent` at `SettingsModal/index.tsx:61` **MUST
STAY**: `Dialog.tsx:56` has a live `StyledPaper` rule
`'&:has(.settingsDialogContent):not(:has(.logs-wrapper))': { height: '80%' }` keyed on it.
Removing that className would silently change the Settings dialog's height. After this task the
className's ONLY remaining purpose is that `:has()` hook — which is exactly why it survives.

**TRAP 3 — the `.Dialog__input` remedy is REMOVAL, not invention.** Verified: there is no global
bare-`input` selector in `src/frontend/index.scss`, `App.css` or `styles/*.scss`, and no rule of
any kind matches `Dialog__input` anywhere in the repo. The Steam-key input renders with browser
defaults today. Removing the dead className is a provable no-op; adding a rule is an unreviewed
visual change to a shipped dialog. Remove the attribute and file the observation (Task 3) so it
is not lost along with the breadcrumb. **Do not invent a style.**

**TRAP 4 — two adjacent defects were found while measuring. Record them; do NOT fix them.**
Details and required framing are in Task 3. Neither belongs in Task 1 or 2, and `Dialog.tsx` must
come out of this task byte-identical.

**TRAP 5 — no tombstone comments naming the deleted classes.** This repo has already shipped a
raw-source gate satisfied by the prose that named the thing it forbade. A comment saying
"`.Dialog__content` was deleted here" would defeat Task 1's own census grep. If a surviving
comment needs to reference this cleanup, cite the quick-task id `260921-nub` and never the class
name.
</traps>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete the two dead primitive declarations and the four stylesheet-only downstream rules</name>
  <files>src/frontend/components/UI/Dialog/index.css, src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css, src/frontend/components/UI/ProgressDialog/index.css, src/frontend/screens/Game/ModifyInstallModal/index.scss</files>
  <action>
**Step 0 — baselines, before touching anything.** Two numbers this task is judged against must be
measured at HEAD first, not assumed, because "pre-existing" is a claim about a chosen baseline:
  1. `npx jest --selectProjects Frontend` — record pass/fail counts. If anything is already RED
     at HEAD, record which suite and do NOT attribute it to this task later.
  2. `pnpm lint` — record BOTH warning counts (production and tests). The ceilings are
     `SRC_CEILING = 1124` and `TESTS_CEILING = 638` in `meta/lintScoped.cjs`; the tests ceiling
     has ZERO slack. Record the numbers; Task 2 has to compare against them.

Then re-confirm the 8-site census with
`grep -rn 'Dialog__content\|Dialog__headerTitle\|Dialog__input' src/` and check it matches the
table in `<measured_at_head>`. If a site has appeared or moved, stop and report rather than
editing around it.

**1a — `Dialog/index.css`.** Delete the `.Dialog__headerTitle` rule (HEAD lines 10-16) and the
`.Dialog__content` rule (HEAD lines 18-20), with the blank line each leaves behind.

Inside the surviving `.Dialog` block, delete the now-orphaned `--dialog-margin-vertical: 24px;`
and `--dialog-gap: 24px;` declarations — the two rules just deleted were their only references in
the entire repo, so they are dead declarations, and `cssTokenSweep.test.ts` is reference→declared
only, so removing a declaration whose references are gone cannot make it red.

**KEEP `--dialog-margin-horizontal: 32px;`** and add a `/* */` block comment directly above it
recording, in this order: that it is retained because two stylesheets outside this file reference
it by name (`InstallModal/index.scss:27` and `Winetricks/index.scss:3`) and `cssTokenSweep.test.ts`
would go red without the declaration; and that whether it actually RESOLVES at those two sites is
an open, separately-recorded question, because nothing in `src/` is ever given the bare `Dialog`
class — cite the todo filename Task 3 creates for it. The point of the comment is to stop a future
"this token is unused" pass deleting it, while not asserting a runtime relationship nobody has
measured.

Constraints on that comment: it must not contain the literal text `Dialog__content`,
`Dialog__headerTitle` or `Dialog__input` (Trap 5, and it would break this task's own census
grep), and it must not write `--dialog-margin-vertical:`/`--dialog-gap:` in declaration shape or
any `var(--…)` reference form. Naming `--dialog-margin-horizontal` bare is fine.

`.log-upload-result` and `.Dialog__footer` survive byte-identical. Resulting file is three rules.

**1b — `MessageBoxModal/index.css`.** Delete `.errorDialog .Dialog__content` (lines 6-8) and
`.errorDialog .Dialog__headerTitle` (lines 10-12). Everything else in the file stays untouched —
in particular `.errorDialog.error-box` with its 8-line Phase 35 comment, and
`.launchOptionsDialog .Dialog__footer` at line 37, which is LIVE.

**1c — `ProgressDialog/index.css`.** Delete `.progressDialog .Dialog__content` (lines 6-8). The
`.progressDialog` rule above it and `.progressDialog.log-box` below it stay.

**1d — `ModifyInstallModal/index.scss`.** Delete the nested `& .Dialog__content { … }` block
(lines 7-10) from inside `.ModifyInstall__dialog`. The sibling `& .button` block and the
`min-width`/`max-height`/`overflow-x` declarations above it stay; `.ModifyInstall__dialog` remains
a non-empty rule, so do not collapse anything else.

Do not touch `Dialog.tsx`, `DialogContent.tsx`, `DialogHeader.tsx` or any test file in this task.
  </action>
  <verify>
  <automated>
cd /Users/graysonmitchell/Projects/GameLib

# The four files this task owns carry no remaining occurrence of either dead name.
if grep -rn 'Dialog__content\|Dialog__headerTitle' \
     src/frontend/components/UI/Dialog/index.css \
     src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css \
     src/frontend/components/UI/ProgressDialog/index.css \
     src/frontend/screens/Game/ModifyInstallModal/index.scss; then
  echo "FAIL: a dead name survives in a Task 1 file (check for a tombstone comment)"; exit 1
fi

# The token that must survive, and the two that must not.
grep -qF -- '--dialog-margin-horizontal:' src/frontend/components/UI/Dialog/index.css \
  || { echo "FAIL: --dialog-margin-horizontal declaration was deleted (Trap 1)"; exit 1; }
if grep -rn -- '--dialog-margin-vertical\|--dialog-gap' src/ public/; then
  echo "FAIL: an orphaned dialog token still appears under src/ or public/"; exit 1
fi

# The comment above the surviving token exists and cites both external consumers.
for t in 'InstallModal/index.scss:27' 'Winetricks/index.scss:3' 'cssTokenSweep'; do
  grep -qF -- "$t" src/frontend/components/UI/Dialog/index.css \
    || { echo "FAIL: in-situ comment does not cite $t"; exit 1; }
done

# LIVE surfaces untouched.
grep -qF '.Dialog__footer' src/frontend/components/UI/Dialog/index.css || exit 1
grep -qF '.launchOptionsDialog .Dialog__footer' \
  src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css || exit 1
grep -qF '.log-upload-result' src/frontend/components/UI/Dialog/index.css || exit 1
grep -qF '.errorDialog.error-box' \
  src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css || exit 1
grep -qF '.progressDialog.log-box' src/frontend/components/UI/ProgressDialog/index.css || exit 1
grep -qF '& .button' src/frontend/screens/Game/ModifyInstallModal/index.scss || exit 1

# Dialog.tsx must be byte-identical at this point.
git diff --quiet -- src/frontend/components/UI/Dialog/components/Dialog.tsx \
  || { echo "FAIL: Dialog.tsx was modified; it is out of scope for this task"; exit 1; }

npx jest --selectProjects Frontend
npx prettier --check \
  src/frontend/components/UI/Dialog/index.css \
  src/frontend/components/UI/DialogHandler/components/MessageBoxModal/index.css \
  src/frontend/components/UI/ProgressDialog/index.css \
  src/frontend/screens/Game/ModifyInstallModal/index.scss
  </automated>
  </verify>
  <done>
`Dialog/index.css` is three rules with exactly one surviving `--dialog-*` token and an accurate
in-situ comment above it. The four stylesheet-only downstream rules are gone; `.Dialog__footer`,
`.log-upload-result`, `.errorDialog.error-box`, `.progressDialog.log-box` and
`ModifyInstall__dialog`'s remaining declarations are untouched. The Frontend jest project matches
its step-0 baseline (in particular `cssTokenSweep.test.ts`, `dialogWindowChrome.test.ts` and
`muiTabsSelectorScoping.test.ts` are green). Prettier clean on the four touched files — scoped
deliberately, because `pnpm prettier` covers the whole tree and its state at HEAD is not this
task's baseline.
  </done>
</task>

<task type="auto">
  <name>Task 2: Delete the SettingsModal stylesheet and its import, and remove the orphaned Steam-key className</name>
  <files>src/frontend/screens/Settings/components/SettingsModal/index.scss, src/frontend/screens/Settings/components/SettingsModal/index.tsx, src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx</files>
  <action>
These two edits are separated from Task 1 because they are the only ones that touch `.tsx` and the
only ones that can move a lint count.

**2a — delete `SettingsModal/index.scss` outright.** Its 12 lines are a single compound rule plus
one nested `.log-box` rule, both dead by the same reasoning (the element carries
`settingsDialogContent` alone, never both classes). Delete the file with plain `rm`, then delete
the `import './index.scss'` line at `SettingsModal/index.tsx:12`. Leave the surrounding imports
and their order alone — do not re-sort the import block while you are in there.

**DO NOT TOUCH `className="settingsDialogContent"` at `SettingsModal/index.tsx:61`.** This is the
most dangerous line in the whole task. `Dialog.tsx:56` keys a live `StyledPaper` height rule on it
(`'&:has(.settingsDialogContent):not(:has(.logs-wrapper))': { height: '80%' }`). Deleting the
className would silently change the Settings dialog's height with nothing in this
`testEnvironment: 'node'` repo able to see it. After this task that `:has()` hook is the
className's only remaining purpose — which is precisely why it stays.

**2b — `RedeemSteamKeyDialog/index.tsx:122`.** Delete the `className="Dialog__input"` attribute
from the `<input>` and nothing else. Every other attribute (`type`, `autoFocus`, `disabled`,
`value`, `placeholder`, `onChange`) and the `onChange` body comment stay exactly as they are. The
input renders with browser defaults today and will render identically afterwards; that observation
is filed as a todo in Task 3, not remedied here (Trap 3).

**Lint discipline.** Compare both `pnpm lint` counts against the Task 1 step-0 baseline. They are
expected to be UNCHANGED — removing a JSX attribute and a side-effect import triggers and clears
no rule this repo enables. If either count MOVES IN EITHER DIRECTION, stop and report the diff:
do not raise a ceiling, and do not "fix" an unrelated warning to buy headroom. The tests ceiling
(638) has zero slack, and an orphaned `eslint-disable` costs +2 in this repo.
  </action>
  <verify>
  <automated>
cd /Users/graysonmitchell/Projects/GameLib

# THE WHOLE-REPO CENSUS: all three names are now absent from src/ entirely.
if grep -rn 'Dialog__content\|Dialog__headerTitle\|Dialog__input' src/; then
  echo "FAIL: census is not zero"; exit 1
fi

# The stylesheet is gone and nothing imports it.
test ! -e src/frontend/screens/Settings/components/SettingsModal/index.scss \
  || { echo "FAIL: SettingsModal/index.scss still exists"; exit 1; }
if grep -rn "index.scss" src/frontend/screens/Settings/components/SettingsModal/; then
  echo "FAIL: a stale scss import survives in SettingsModal/"; exit 1
fi

# TRAP 2: the className and the rule keyed on it both survive.
grep -qF 'className="settingsDialogContent"' \
  src/frontend/screens/Settings/components/SettingsModal/index.tsx \
  || { echo "FAIL: settingsDialogContent className was removed (Trap 2)"; exit 1; }
grep -qF ':has(.settingsDialogContent)' \
  src/frontend/components/UI/Dialog/components/Dialog.tsx \
  || { echo "FAIL: the StyledPaper :has() height rule was disturbed"; exit 1; }

# 2b touched exactly one attribute: the input's other props survive.
for a in 'autoFocus' 'redeemSteamKey.placeholder' 'disabled={busy}'; do
  grep -qF -- "$a" src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx \
    || { echo "FAIL: RedeemSteamKeyDialog lost $a"; exit 1; }
done

# Dialog.tsx STILL byte-identical across both tasks.
git diff --quiet -- src/frontend/components/UI/Dialog/components/Dialog.tsx \
  || { echo "FAIL: Dialog.tsx was modified; the :59 defect is RECORDED, not fixed"; exit 1; }

pnpm codecheck
pnpm lint
npx jest --selectProjects Frontend
npx prettier --check \
  src/frontend/screens/Settings/components/SettingsModal/index.tsx \
  src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx
  </automated>
  </verify>
  <done>
`grep -rn 'Dialog__content\|Dialog__headerTitle\|Dialog__input' src/` returns nothing.
`SettingsModal/index.scss` is deleted and unimported; `className="settingsDialogContent"` and
`Dialog.tsx:56`'s `:has()` rule are both intact. `RedeemSteamKeyDialog`'s input lost only its
className. `pnpm codecheck` clean. `pnpm lint` exits 0 with both counts equal to the step-0
baseline and neither ceiling raised. Frontend jest project matches baseline. Prettier clean on
both touched files. `Dialog.tsx` unmodified.
  </done>
</task>

<task type="auto">
  <name>Task 3: File the three adjacent findings and close the parent todo</name>
  <files>.planning/todos/pending/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md, .planning/todos/pending/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md, .planning/todos/pending/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md, .planning/todos/completed/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md</files>
  <action>
**Frontmatter, all three todos.** Per CLAUDE.md, `created` / `title` / `area` come first, then
`severity:` then `platform:` then `ready:` in exactly that order, then `source:` and `files:`.
All three values bare, lowercase, unquoted — `.planning/todos/todo-frontmatter-gate.py` matches
them exactly and never quoted. `area: ui-dialogs` for all three, matching the parent.
`source:` should name `quick-260921-nub` and say the finding surfaced while measuring the parent
todo's census.

**3a — `2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md`.**
`severity: minor`, `platform: any`, `ready: live-gate`.

Record these measured facts:
  - `Dialog.tsx:59` reads `'&:has(.logs-wrapper))': { maxHeight: '80%' }` — a stray extra `)`
    makes the selector invalid, so the browser's CSS error recovery drops THIS DECLARATION ONLY.
    Sibling keys in the same `styled()` object (`backgroundColor`, `maxWidth`, `borderRadius`,
    and the `:56` rule) are unaffected. Blast radius is one declaration.
  - `.logs-wrapper` IS live — applied at
    `src/frontend/screens/Settings/sections/LogSettings/index.tsx:198` via
    `classNames('logs-wrapper', {…})`. The selector's target exists; only the selector is
    malformed.
  - `:56` and `:59` are a matched PAIR and only one half works: `:56`
    (`:has(.settingsDialogContent):not(:has(.logs-wrapper))`) is well-formed, fires, and
    deliberately EXCLUDES the log case; `:59` was the intended replacement for that excluded case
    and has never applied. So a Settings dialog showing logs gets NEITHER height constraint.
  - What actually drives that dialog's height instead: `LogSettings/index.css:5`
    `.logs-wrapper { height: 25em }`, a fixed height. Co-located second finding, one line, do not
    fix: `LogSettings/index.css:52` `dialog .logs-wrapper { height: 15em }` is ALSO dead, for an
    independent reason — it is a bare `dialog` ELEMENT selector, and MUI's Paper is a `div`, never
    a `<dialog>`.
  - Provenance: `git log -S "logs-wrapper))"` blames `b11b483c9 "[UI/UX] Some themes and style
    fixes (#4695)"`. State that as the commit the text arrived in. **Do NOT characterise it as an
    upstream-Heroic deviation** — CLAUDE.md is explicit that Heroic is not upstream and that
    deviation must never be raised as a concern or caveat.
  - Write the severity and ready reasoning into the BODY, not just the keys. `minor`: 25em is
    ~400px, and on ordinary viewports 80% of the dialog height exceeds that, so the missing cap
    does not bind and there is no live consequence today — it arms only on a short window. That is
    the rubric's "latent trap with no live consequence"; do not inflate it to `medium`.
    `live-gate` not `code`: the edit is one character, but applying it ACTIVATES a rule that has
    never run, which is a visual change this `testEnvironment: 'node'` project cannot observe.

**3b — `2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md`.**
`severity: minor`, `platform: any`, `ready: live-gate`.

Record: the Steam-key `<input>` at `RedeemSteamKeyDialog/index.tsx:122` carried
`className="Dialog__input"` with no matching rule anywhere in the repo — the inverse of the parent
todo's defect (class applied, no rule, rather than rule declared, class never applied). Quick task
`260921-nub` removed the dead attribute, which is a provable no-op, and did NOT invent a style,
which would have been an unreviewed visual change to a shipped dialog. Record the surviving
observation: verified that no global bare-`input` selector exists in `src/frontend/index.scss`,
`App.css` or `styles/*.scss`, so this input renders with browser defaults inside a themed dialog.
`live-gate` because the first step is to LOOK at the rendered dialog and decide whether it needs a
rule at all — that decision cannot be made from source.

**3c — `2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md`.**
`severity: medium`, `platform: any`, `ready: live-gate`.

Record: `Dialog/index.css` declares `--dialog-margin-horizontal` on `.Dialog`, but **no element in
`src/` is ever given the bare class `Dialog`** — `Dialog.tsx` does not add it, and all ~25
consumers pass a different literal through `PaperProps={{ className }}` (`notLoggedIn`,
`uninstall-modal`, `AboutDialog`, `InstallModal__dialog`, `errorDialog`, `progressDialog`,
`ModifyInstall__dialog`). So the token is declared in a scope that matches nothing, and its two
external references — `InstallModal/index.scss:27`
(`margin: var(--space-md) var(--dialog-margin-horizontal) 0` on the anticheat banner) and
`Winetricks/index.scss:3` (`margin: 0 var(--dialog-margin-horizontal)` on the installWrapper) —
resolve to nothing at runtime. Both are non-inherited `margin` shorthands, so they are invalid at
computed-value time and fall back to `0` rather than the intended 32px.

State clearly that this is `cssTokenSweep.test.ts`'s own documented **blind spot B** ("this gate
checks NAMES, not SCOPES"), the same class as its worked `--search-bar-border` example. The gate
is green and will stay green; the declaration must NOT be deleted to "fix" this, because deleting
it turns the gate red for the same two references. `severity: medium`: this is a real defect with
a live consequence on two surfaces, bounded to two margin declarations. `ready: live-gate`: any
remedy (re-scoping the token, moving the declaration to `:root`, or fixing the two consumers)
changes rendered margins and needs a live run to score.

**3d — close the parent todo.** Write a closing note at the TOP of the body (immediately after
the frontmatter, before or as the first section under the `# .Dialog__content and
.Dialog__headerTitle are dead` heading), then move the file.

The note must record:
  - What was deleted, by quick task `260921-nub`: the two primitive declarations, all five
    downstream rules across four files (`SettingsModal/index.scss` deleted outright along with
    its import), the two orphaned `--dialog-*` tokens, and the `Dialog__input` className.
  - **That DELETION was chosen over re-anchoring, and why** — the todo framed both as open, and
    the record must show the choice was made deliberately, not by default. Cite `Dialog.tsx:106-120`'s
    `260820-kq0`/`260921-mzl` precedent, and state the concrete consequence that decided it:
    re-anchoring the Settings compound rule to bare `.settingsDialogContent` would have ACTIVATED
    `width: 65vw; flex: 1 1 60vh; min-height: 64vh` on the Settings dialog for the first time.
    Note that re-anchoring remains available to a future, deliberately-visual, live-gated task.
  - That `className="settingsDialogContent"` was deliberately KEPT, naming `Dialog.tsx:56`'s
    `:has()` height rule as the reason, so nobody "finishes the cleanup" later.
  - That `--dialog-margin-horizontal` was deliberately KEPT for `cssTokenSweep.test.ts`, with a
    pointer to todo 3c for the scope question.
  - Cross-references to all three new todos **by filename**, so closure does not discard them.

**Move mechanics.** Do NOT use `git mv` — it has twice in this repo committed HEAD content and
silently dropped unstaged edits, once undetected for seven days. Sequence: (1) edit the file in
place in `pending/`; (2) plain `mv` to `.planning/todos/completed/` keeping the filename; (3)
`git add -A .planning/todos/`; (4) verify the CONTENT AT THE DESTINATION PATH — the verify block
below does this. Do not infer success from the move's exit code.
  </action>
  <verify>
  <automated>
cd /Users/graysonmitchell/Projects/GameLib
P=.planning/todos/pending

A="$P/2026-09-20-dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md"
B="$P/2026-09-20-steam-key-dialog-input-has-no-css-rule-at-all.md"
C="$P/2026-09-20-the-bare-dialog-class-is-never-applied-to-any-element.md"

# Frontmatter ONLY. Scoped deliberately: 3a's body discusses `ready: live-gate` in
# prose, and an unscoped `grep -qx` would be satisfied by that prose -- this repo's
# recorded "prose satisfies the gate that names it" failure mode.
fm() { awk '/^---$/{n++; next} n==1' "$1"; }

for f in "$A" "$B" "$C"; do
  test -f "$f" || { echo "MISSING TODO: $f"; exit 1; }
  fm "$f" | grep -qx 'platform: any' || { echo "bad platform: $f"; exit 1; }
  fm "$f" | grep -qx 'ready: live-gate' || { echo "bad ready: $f"; exit 1; }
  # severity/platform/ready must appear in that order, and nowhere else in frontmatter.
  ORDER=$(fm "$f" | grep -E '^(severity|platform|ready):' | cut -d: -f1 | tr '\n' ' ')
  [ "$ORDER" = "severity platform ready " ] \
    || { echo "bad key order in $f: [$ORDER]"; exit 1; }
done
fm "$A" | grep -qx 'severity: minor'  || { echo "3a severity must be minor"; exit 1; }
fm "$B" | grep -qx 'severity: minor'  || { echo "3b severity must be minor"; exit 1; }
fm "$C" | grep -qx 'severity: medium' || { echo "3c severity must be medium"; exit 1; }

# 3a carries its measured anchors, including the provenance sha and the co-located finding.
for t in 'LogSettings/index.tsx:198' 'b11b483c9' 'LogSettings/index.css:52' 'Dialog.tsx:59'; do
  grep -qF -- "$t" "$A" || { echo "3a missing anchor: $t"; exit 1; }
done
# ...and must NOT frame it as an upstream deviation (CLAUDE.md).
if grep -niE 'upstream|heroic' "$A"; then echo "3a frames this against Heroic"; exit 1; fi

# 3c names both real consumers and the gate's own blind-spot vocabulary.
for t in 'InstallModal/index.scss:27' 'Winetricks/index.scss:3' 'cssTokenSweep'; do
  grep -qF -- "$t" "$C" || { echo "3c missing anchor: $t"; exit 1; }
done

# 3d: parent moved, and its DESTINATION content carries the decision and all three refs.
SRC="$P/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md"
DST=.planning/todos/completed/2026-09-20-dialog-content-and-headertitle-are-dead-across-four-other-stylesheets.md
test ! -e "$SRC" || { echo "parent still in pending/"; exit 1; }
test -f "$DST"   || { echo "parent not in completed/"; exit 1; }
for t in '260921-nub' 'settingsDialogContent' '--dialog-margin-horizontal' \
         'dialog-styledpaper-logs-wrapper-rule-has-a-stray-paren.md' \
         'steam-key-dialog-input-has-no-css-rule-at-all.md' \
         'the-bare-dialog-class-is-never-applied-to-any-element.md'; do
  grep -qF -- "$t" "$DST" || { echo "closing note missing: $t"; exit 1; }
done
# the original body survived the move
grep -qF '## The five downstream sites (measured at HEAD)' "$DST" || exit 1

git add -A .planning/todos/
pnpm planning-gates
  </automated>
  </verify>
  <done>
Three pending todos exist with valid, correctly-ordered triage frontmatter and their measured
anchors. The parent todo is absent from `pending/`, present in `completed/` with its full original
body plus a closing note that records the delete-vs-re-anchor decision, both deliberate KEEPs, and
all three cross-references — verified by reading the destination file on disk after the move, not
inferred from the move's exit code. `pnpm planning-gates` green (its scope is `pending/` only, so
the moved file is now exempt — the gate passing is necessary, not sufficient; the content greps
above are what prove the move).
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Dead-CSS deletion, one JSX attribute removal, one side-effect import removal, and planning-document writes. No input crosses a trust boundary, no new dependency, no network call, no filesystem path derived from user input. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nub-01 | Tampering | `Dialog/index.css` | mitigate | Deleting `--dialog-margin-horizontal` would create undefined custom-property references at two external consumers and turn `cssTokenSweep.test.ts` red. Task 1's verify asserts the declaration survives, asserts the two orphaned tokens are gone from `src/` and `public/`, and runs the Frontend project. |
| T-nub-02 | Tampering | `SettingsModal/index.tsx` | mitigate | Removing `className="settingsDialogContent"` alongside its stylesheet would silently change the Settings dialog height via `Dialog.tsx:56`'s `:has()` rule, unobservable in a `testEnvironment: 'node'` project. Task 2's verify greps for both the className and the `:has()` selector. |
| T-nub-03 | Repudiation | parent todo closure | mitigate | Closing a todo whose stated options included "re-anchor" without recording that deletion was chosen, or losing the three adjacent findings, would discard measured work. Task 3's verify greps the decision markers and all three filenames at the DESTINATION path post-move. |
| T-nub-04 | Tampering | `Dialog.tsx` | mitigate | The `:59` stray-paren defect is adjacent and tempting; fixing it here would activate a never-run rule as an unscored visual change. Both Task 1 and Task 2 assert `git diff --quiet` on `Dialog.tsx`. |
| T-nub-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this task. No legitimacy gate required. |
</threat_model>

<verification>
Run from the repo root after all three tasks:

```
grep -rn 'Dialog__content\|Dialog__headerTitle\|Dialog__input' src/ ; echo "expect: no output, exit 1"
pnpm codecheck
pnpm lint
npx jest --selectProjects Frontend
pnpm planning-gates
git diff --quiet -- src/frontend/components/UI/Dialog/components/Dialog.tsx && echo "Dialog.tsx untouched"
```

`pnpm lint` must exit 0 with both warning counts equal to the Task 1 step-0 baseline. The ceilings
are `SRC_CEILING = 1124` / `TESTS_CEILING = 638` in `meta/lintScoped.cjs`; the tests ceiling sits
at its exact measured count with zero slack. Neither may be raised, and no unrelated warning may
be "fixed" to buy headroom.

The Backend jest project is not run here — it is red at HEAD for unrelated reasons (ledgered), and
nothing in this task touches `src/backend/`. `npx jest --selectProjects Frontend` covers all three
gates that could plausibly see these files: `cssTokenSweep.test.ts`, `muiTabsSelectorScoping.test.ts`
and `dialogWindowChrome.test.ts`.

These gates were expected green before the plan was written. **Run them; do not assert them.** A
plan asserting a gate's colour instead of measuring it has produced four false REDs in this repo.
</verification>

<success_criteria>
- `grep -rn 'Dialog__content\|Dialog__headerTitle\|Dialog__input' src/` returns zero lines.
- `Dialog/index.css` is three rules (`.Dialog`, `.log-upload-result`, `.Dialog__footer`), declares
  `--dialog-margin-horizontal` and nothing else, and carries an in-situ comment naming both
  external consumers, the gate, and the open scope question.
- `--dialog-margin-vertical` and `--dialog-gap` appear nowhere under `src/` or `public/`.
- `SettingsModal/index.scss` is deleted and nothing imports it;
  `className="settingsDialogContent"` and `Dialog.tsx:56`'s `:has()` rule both survive.
- `Dialog.tsx` is byte-identical to HEAD — the `:59` stray-paren defect is recorded, not repaired.
- `.Dialog__footer` and both of its rules are untouched.
- Three pending todos exist with valid triage frontmatter in CLAUDE.md's required key order, and
  none frames any finding as a deviation from Heroic.
- The parent todo is in `completed/` with a closing note, verified on disk after the move, that
  records the delete-over-re-anchor decision, the two deliberate KEEPs, and all three new todos by
  filename.
- `codecheck`, `lint` (both counts unmoved, no ceiling raised), the Frontend jest project and
  `planning-gates` are all green.
</success_criteria>

<output>
Create `.planning/quick/260921-nub-delete-the-dead-dialog-content-and-dialo/260921-nub-SUMMARY.md` when done.

Record in it: the final line count of `Dialog/index.css` and the exact text of the comment added
above `--dialog-margin-horizontal`; the `pnpm lint` production and tests warning counts before and
after, side by side; the Frontend jest pass count before and after; the three todo filenames with
their severity/ready values; and an explicit statement that deletion was chosen over re-anchoring
by precedent, with the Settings-dialog consequence that decided it.
</output>
