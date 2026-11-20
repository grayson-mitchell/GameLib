---
phase: quick-260805-rwy
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/Login/__tests__/index.test.tsx
autonomous: false
requirements: [QUICK-260805-RWY]

must_haves:
  truths:
    - "The Manage Accounts page renders no 'Login with your platform...' paragraph"
    - "The macOS-version warning paragraph still renders when the OS is too old"
    - "All six runner tiles (Epic, GOG, Amazon, Zoom, Steam, Humble) still render unchanged"
    - "Header-to-runner-group spacing on the page is still visually correct with the paragraph gone"
  artifacts:
    - path: "src/frontend/screens/Login/index.tsx"
      provides: "Login screen with the loginMessage const and its <p> removed"
      contains: "runnerGroup"
    - path: "src/frontend/screens/Login/__tests__/index.test.tsx"
      provides: "Source gate proving the message is gone and neighbours survived"
      contains: "260805-rwy"
  key_links:
    - from: "src/frontend/screens/Login/__tests__/index.test.tsx"
      to: "src/frontend/screens/Login/index.tsx"
      via: "read(LOGIN_TSX) source-text gate"
      pattern: "read\\(LOGIN_TSX\\)"
---

<objective>
Remove the paragraph "Login with your platform. You can login to more than one platform at the same time." from the Manage Accounts (Login) page.

Purpose: The user does not want this instructional text on the page.
Output: A minimal, upstream-merge-friendly deletion in `Login/index.tsx`, plus a source gate in the screen's existing test file so the text cannot silently return.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

@src/frontend/screens/Login/index.tsx
@src/frontend/screens/Login/__tests__/index.test.tsx

<scouting_findings>
Verified during planning — do NOT re-discover these:

1. The string exists in exactly ONE place under `src/`: `Login/index.tsx`. It is
   the i18next default for key `login.message`, assigned to a `loginMessage`
   const (lines 87-90) and rendered at line 154.
2. `loginMessage` has exactly one consumer (line 154). `login.message` has
   exactly one reference in all of `src/`. Nothing else reads either.
3. `runnerMessage` (the CSS class on that `<p>`) appears in exactly two places:
   the JSX at `index.tsx:154` and the rule at `index.scss:157`.
4. NO test anywhere asserts on this string. The screen's test file
   (`__tests__/index.test.tsx`, 208 lines) is a SOURCE-TEXT gate suite; it
   asserts on the loading branch, the F-10 CSS fix, and the `deprecatedTile`
   wiring — none of which this change touches.
5. `meta/lintTranslations.ts` sets `printExtraTransations = false` with the
   in-file comment "there are many extra keys in translation files without a
   matching key in the english file / this is not really a problem". Orphaned
   catalog keys are explicitly tolerated by the repo's own linter.
6. Only 8 of the locale catalogs carry the English literal; the rest carry
   translated variants of `login.message`.
</scouting_findings>

<decisions>
D-01 — **Do not touch any file under `public/locales/`.** This repo is a Heroic
fork whose stated constraint is staying mergeable with upstream. `login.message`
is an upstream key present in ~38 catalogs. Deleting it everywhere is 38 files of
conflict surface for zero user-visible benefit, and finding 5 above confirms the
repo's own translation linter ignores the resulting orphan. Leave all catalogs
byte-identical.

D-02 — **Do not touch `index.scss`.** The `.runnerMessage` rule (index.scss:157)
becomes dead once the `<p>` goes, and that is accepted deliberately, not
overlooked. It is an upstream rule; leaving it keeps the diff to a single source
file and avoids a merge conflict for a 6-line style block that costs nothing at
runtime. Record this in the SUMMARY so a reviewer does not read it as an
oversight.

D-03 — **Delete the `loginMessage` const, not just the JSX.** Leaving an unused
const would trip `@typescript-eslint/no-unused-vars` and leave the removed
string still present in the source file, which would defeat the gate in Task 2.
</decisions>

<gotchas>
**`stripSourceComments` does NOT strip trailing `//` comments.** The test helper
(`src/backend/testUtils/stripSourceComments.ts`) strips block comments and
whole-line comments only; a trailing comment appended to a line of code survives
into the gated text — this is an intentional, documented limitation (it exists to
avoid the WR-08 regression class where a naive regex truncates a `//`-bearing
string literal).

Consequence for this task: if you leave an explanatory comment mentioning
`login.message`, `loginMessage`, `runnerMessage`, or the removed sentence, it MUST
be a whole-line `//` comment or a block comment — never a trailing comment on a
code line. A trailing one would make Task 1's gate fail against a correct
implementation.
</gotchas>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Remove the login message paragraph and gate its removal</name>
  <files>src/frontend/screens/Login/index.tsx, src/frontend/screens/Login/__tests__/index.test.tsx</files>

  <behavior>
    Source gate (this jest project is `testEnvironment: 'node'` with no jsdom —
    these prove the source text, not a rendered pixel; state that honestly in the
    test titles, matching the existing convention in the file):

    - Negative: comment-stripped `Login/index.tsx` contains no `loginMessage`,
      no `login.message`, no `runnerMessage`, and not the substring
      "You can login to more than one platform".
    - Positive control (proves the gate is not vacuous and that the executor did
      not over-delete): the file still contains the `disabledMessage`
      paragraph expression `{oldMac && <p className="disabledMessage">`, still
      contains `<div className="runnerGroup">`, and still contains all six
      runner `class=` tiles (`epic`, `gog`, `nile`, `zoom`, `steam`, `humble`).
  </behavior>

  <action>
Edit `src/frontend/screens/Login/index.tsx`:

1. Delete the entire `const loginMessage = t('login.message', 'Login with your
   platform. You can login to more than one platform at the same time.')`
   declaration (currently lines 87-90) — per D-03.
2. Delete the line `<p className="runnerMessage">{loginMessage}</p>` (currently
   line 154). Leave the immediately following `{oldMac && <p
   className="disabledMessage">{oldMacMessage}</p>}` line intact — it is a
   different paragraph serving a different purpose.

Do NOT remove the `useTranslation()` import or the `t` binding — `t` has many
other callers in this file (`help.title.login`, `login.old-mac`, every runner's
`buttonText`, `button.go_to_library`). Do NOT remove `t` from the `useEffect`
dependency array on line 111.

Do NOT edit `index.scss` (D-02) and do NOT edit anything under `public/locales/`
(D-01).

Then append a new `describe` block to
`src/frontend/screens/Login/__tests__/index.test.tsx`, following that file's
existing conventions exactly: use the module-level `read()` helper and the
`LOGIN_TSX` constant already defined there (do not re-declare either), open the
block with a short banner comment naming this quick task (`260805-rwy`) and
stating that these are source-text gates with no jsdom available, and write the
assertions described in `<behavior>`.

Read the `<gotchas>` block before writing any comment into `index.tsx`.
  </action>

  <verify>
    <automated>pnpm exec jest --selectProjects Frontend src/frontend/screens/Login/__tests__/index.test.tsx</automated>
    <automated>pnpm exec eslint src/frontend/screens/Login/index.tsx src/frontend/screens/Login/__tests__/index.test.tsx</automated>
  </verify>

  <done>
    The jest run is green with the new describe block present (both the negative
    assertions and the positive controls passing), eslint reports no errors, and
    `git diff --name-only` lists exactly two files: `Login/index.tsx` and
    `Login/__tests__/index.test.tsx`. No file under `public/locales/` and not
    `index.scss` appears in the diff.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Human-verify the Manage Accounts page without the paragraph</name>
  <files>(no files modified — verification only)</files>

  <action>
Pause and hand control to the developer. Present the `<what-built>` and
`<how-to-verify>` content below, then wait for the resume signal. Do not modify
any file in this task; if the developer reports a spacing or layout problem,
capture it and route it back to Task 1 rather than patching it here.
  </action>

  <what-built>
    The "Login with your platform. You can login to more than one platform at the
    same time." paragraph was deleted from the Manage Accounts page, along with
    its now-unused `loginMessage` const. A source gate was added to the screen's
    existing test suite so the text cannot silently reappear. No translation
    catalogs and no stylesheet were touched (see D-01 / D-02 in the plan).

    Automated checks already passing: the Frontend jest gate on
    `Login/__tests__/index.test.tsx`, and eslint on both changed files.

    What automation CANNOT prove here: this jest project runs with
    `testEnvironment: 'node'` and no jsdom, so nothing in the suite renders a
    tree or measures layout. Whether the page still LOOKS right with the
    paragraph gone is only knowable by looking at it — hence this checkpoint.
  </what-built>

  <how-to-verify>
    1. Start the app (`pnpm dev`, or `pnpm tauri:dev` if you want to check the
       Tauri shell — the change is shell-agnostic, either is sufficient).
    2. Navigate to the Manage Accounts / Login page.
    3. Confirm the sentence "Login with your platform. You can login to more than
       one platform at the same time." is GONE.
    4. Confirm the "GameLib" header with its icon and the language selector still
       render normally, and that the gap between the header and the first runner
       tile still looks deliberate — not cramped, not a large empty hole. (The
       `.runnerHeader` rule carries its own `padding-bottom:
       var(--message-padding)`, so spacing should be preserved, but this is the
       one thing worth eyeballing.)
    5. Confirm all six runner tiles still render (Epic, GOG, Amazon, Zoom if
       enabled, Steam, Humble) and that the "Go to Library" button is unchanged.
  </how-to-verify>

  <verify>
    <human-check>Developer confirms the text is gone and the page layout is visually correct</human-check>
  </verify>

  <done>
    Developer replied "approved". If instead they reported a layout problem, this
    task is NOT done — return to Task 1 with the reported symptom.
  </done>

  <resume-signal>Type "approved", or describe what looks wrong (especially any spacing change under the header)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| (none introduced) | This change deletes a static, hardcoded, non-interpolated UI string and its render site. No input crosses any boundary as a result, no data is read or written, no IPC/channel surface changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rwy-01 | Tampering | `Login/index.tsx` over-deletion | mitigate | Task 1's positive-control assertions pin the neighbouring `disabledMessage` paragraph, the `runnerGroup` container, and all six runner tiles, so a too-greedy delete fails the gate rather than shipping. |
| T-rwy-02 | Information disclosure | removed string | accept | The string is public UI boilerplate already shipped in ~38 public locale catalogs. Removing it discloses nothing. |
| T-rwy-SC | Tampering | npm/pip/cargo installs | n/a | No package installs in this plan. No dependency, lockfile, or `package.json` change is authorized; if one appears to be needed, stop and escalate rather than installing. |
</threat_model>

<verification>
- `pnpm exec jest --selectProjects Frontend src/frontend/screens/Login/__tests__/index.test.tsx` — green, including the pre-existing F-10, loading-branch and `deprecatedTile` gates (they must not regress).
- `pnpm exec eslint src/frontend/screens/Login/index.tsx` — clean, confirming no unused binding was left behind.
- `git diff --name-only` — exactly two paths, both under `src/frontend/screens/Login/`.
- Human checkpoint approved.
</verification>

<success_criteria>
- The sentence no longer appears anywhere in `src/`.
- The Manage Accounts page renders without it, and the header/runner-group spacing is visually unchanged in the reviewer's judgement.
- The `disabledMessage` (old-macOS warning) paragraph and all six runner tiles still render.
- `public/locales/**` and `Login/index.scss` are untouched.
- The Frontend jest project is green with a new source gate that fails if the text returns.
</success_criteria>

<output>
Create `.planning/quick/260805-rwy-remove-manage-accounts-login-text/260805-rwy-SUMMARY.md` when done.

Record explicitly in the SUMMARY: that `.runnerMessage` in `index.scss:157` is now
a deliberately-retained dead rule (D-02), and that `login.message` remains in all
locale catalogs by choice (D-01) — both so a future reader does not file them as
oversights.
</output>
