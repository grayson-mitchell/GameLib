---
phase: quick-261107-aru
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/themes.scss
  - src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.css
  - src/frontend/screens/DownloadManager/components/DownloadHero/index.css
  - src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts
autonomous: true
requirements: [QUICK-261107-aru]

must_haves:
  truths:
    - "Under the Dracula theme, hovering the Downloads page cancel 'x' (list rows and the hero) paints a visible red disc instead of going transparent"
    - "Every theme (all 10 in themes.scss) resolves --danger-hover, so no theme can regress to a transparent hover"
    - "Themes that already declare --danger-hover (midnightMirage, cyberSpaceOasis, gruvbox_dark) keep their exact existing values"
  artifacts:
    - path: "src/frontend/themes.scss"
      provides: "base body --danger-hover default + body.dracula --danger-hover override"
      contains: "--danger-hover"
    - path: "src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts"
      provides: "source gate: base + dracula declare --danger-hover; both hover rules use a fallback"
  key_links:
    - from: "DownloadManagerItem/index.css and DownloadHero/index.css .cancelIcon:hover circle"
      to: "themes.scss body { --danger-hover }"
      via: "CSS custom property"
      pattern: "var\\(\\s*--danger-hover\\s*,"
---

<objective>
Fix the Downloads page cancel control under Dracula: `.cancelIcon:hover circle { fill: var(--danger-hover) }`
references a token that only midnightMirage, cyberSpaceOasis and gruvbox_dark declare. In Dracula
(and also high-contrast, nord-light, nord-dark, marine, zombie, sweet) the var is invalid, so `fill`
falls to its initial value and the disc disappears on hover.

Purpose: the hover must stay a visible danger-red disc in every theme.
Output: base + Dracula token declarations, hardened hover rules, a source-text regression gate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

Load `Skill("gamelib-conventions")` (the `<verify>` prettier rule) and `Skill("sketch-findings-gamelib")`
(multi-theme survival rules) before editing.

<interfaces>
Verified facts (planner read these; do not re-derive):

- `src/frontend/themes.scss` base `body {` block is lines 1-97. It declares
  `--cancel-button: var(--status-warning)` and `--cancel-button-overlay: var(--status-warning-hover)`
  but declares NO `--danger` and NO `--danger-hover`.
- Existing `--danger-hover` declarations (keep untouched):
  `body.midnightMirage` L191 `var(--status-danger)`; `body.cyberSpaceOasis` L228 `var(--status-danger-hover)`;
  `body.gruvbox_dark` L311 `#f05d4d`.
- `body.dracula` block starts L369; it declares `--danger: #ff5555;` (L393) and no `--danger-hover`.
- `src/frontend/styles/_colors.scss` (mixin `colorSystem`, included globally from `src/frontend/index.scss`)
  defines `--status-danger: #f97881` and `--status-danger-hover: #fc9ba1`.
- Hover rules to harden:
  `DownloadManagerItem/index.css` `.downloadManagerListItem .cancelIcon:hover circle { fill: var(--danger-hover); }` (~L28-30)
  `DownloadHero/index.css` `.downloadHero .cancelIcon:hover circle { fill: var(--danger-hover); }` (~L153-155)
  The adjacent non-hover rule is `fill: var(--cancel-button, var(--danger));`.
- `src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts` already has
  `read(...parts)` (comment-stripped, relative to `SCREEN = src/frontend/screens/DownloadManager`) and a
  brace-counted `cssBlock(source, selector)` helper. `themes.scss` is reachable as
  `read('..', '..', 'themes.scss')`. `cssBlock(themes, 'body')` returns the base block because
  `body {` first occurs at L1.
- Theme tests that parse themes.scss: `src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts`
  and `cssTokenSweep.test.ts` (the sweep fails if an allowlisted name becomes declared — `--danger-hover`
  is not allowlisted, but run it anyway).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Source gate for --danger-hover coverage (RED)</name>
  <files>src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts</files>
  <behavior>
    - Base `body` block of themes.scss declares `--danger-hover:` (fails today).
    - `body.dracula` block declares `--danger-hover:` with a value different from its `--danger` value `#ff5555` (fails today).
    - Both DownloadManagerItem/index.css and DownloadHero/index.css `.cancelIcon:hover circle` rules use `var(--danger-hover, ...)` with a fallback, i.e. match `/var\(\s*--danger-hover\s*,/` and do NOT match the bare `/var\(\s*--danger-hover\s*\)/` (fails today).
    - Non-vacuity: each hover CSS file still contains `--danger-hover` at all; the three pre-existing theme declarations (midnightMirage, cyberSpaceOasis, gruvbox_dark) still declare it.
  </behavior>
  <action>Add a new `describe('cancel icon hover survives every theme (quick 261107-aru)', ...)` to the existing downloadManagerLayout.test.ts, reusing its `read` and `cssBlock` helpers (do not add a new helper or new file). Read themes.scss via `read('..', '..', 'themes.scss')` and the two CSS files via `read('components', 'DownloadManagerItem', 'index.css')` / `read('components', 'DownloadHero', 'index.css')`. Extract the hover rule body with `cssBlock(source, '.downloadManagerListItem .cancelIcon:hover circle')` and `cssBlock(source, '.downloadHero .cancelIcon:hover circle')` so the assertion targets that rule, not the whole file. Run the suite and confirm the new cases fail for the stated reasons before Task 2.</action>
  <verify>
    <automated>pnpm jest src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts 2>&1 | tail -30   # expect ONLY the new cases failing (RED)</automated>
  </verify>
  <done>New cases fail on missing base/dracula `--danger-hover` and bare `var(--danger-hover)`; all pre-existing cases in the file still pass.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Declare --danger-hover for every theme and harden the hover rules (GREEN)</name>
  <files>src/frontend/themes.scss, src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.css, src/frontend/screens/DownloadManager/components/DownloadHero/index.css</files>
  <action>
    (1) In the base `body {` block of themes.scss, next to `--cancel-button-overlay`, add `--danger-hover: var(--status-danger-hover);` with a one-line comment saying it is the default for themes that do not set their own, so the Downloads cancel hover never resolves to an invalid var. This matches cyberSpaceOasis's existing value. Do not add a base `--danger` (out of scope).
    (2) In `body.dracula`, directly after `--danger: #ff5555;`, add `--danger-hover: #ff6e6e;` — Dracula palette's bright red, a visible step up from `--danger` on the `#282a35` body background.
    (3) Leave the midnightMirage, cyberSpaceOasis and gruvbox_dark declarations byte-identical.
    (4) In both CSS files change the hover fill to `var(--danger-hover, var(--status-danger-hover))`. The fallback is `--status-danger-hover`, not `--danger`, because base `body` declares no `--danger`, so `var(--danger)` would be just as invalid in the default case.
    Then run the three test files and graphify update (per CLAUDE.md, after code changes).
  </action>
  <verify>
    <automated>pnpm jest src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts src/frontend/components/UI/NavShell/__tests__/cssTokenSweep.test.ts && npx prettier --check src/frontend/themes.scss src/frontend/screens/DownloadManager/components/DownloadManagerItem/index.css src/frontend/screens/DownloadManager/components/DownloadHero/index.css src/frontend/screens/DownloadManager/__tests__/downloadManagerLayout.test.ts && graphify update .</automated>
    <human-check>Optional live check (`pnpm tauri:dev`, not `tauri:dev:run`): switch to Dracula, open Downloads with an item queued, hover the 'x' in a list row and in the hero. The disc should turn bright red, not disappear. Repeat once under midnightMirage to confirm nothing changed there.</human-check>
  </verify>
  <done>All three jest suites pass (the Task 1 cases are now green); prettier --check passes on the four touched paths (all confirmed not prettier-ignored via --file-info); `grep -c -- '--danger-hover' src/frontend/themes.scss` reports 5.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | CSS token declarations and a source-text test; no input, IPC, network or process surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261107aru-01 | Tampering | themes.scss | accept | Static stylesheet bundled at build time; no runtime input reaches it |
</threat_model>

<verification>
- downloadManagerLayout, themeTokens and cssTokenSweep jest suites pass.
- Scoped prettier --check is clean on the four touched files.
- `git diff src/frontend/themes.scss` shows exactly two added declarations (plus the comment) and no change to the existing midnightMirage/cyberSpaceOasis/gruvbox_dark lines.
</verification>

<success_criteria>
Under Dracula, the Downloads cancel 'x' hover stays a visible red disc in both the list row and the hero. Every theme resolves `--danger-hover`, and a source gate stops it regressing.
</success_criteria>

<output>
Create `.planning/quick/261107-aru-fix-dracula-theme-on-the-downloads-page-/261107-aru-SUMMARY.md` when done
</output>
