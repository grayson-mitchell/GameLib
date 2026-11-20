---
phase: quick-261103-stm
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GamePage/index.css
  - .planning/todos/pending/2026-11-02-main-button-spinner-black-not-font-color.md
  - .planning/todos/completed/2026-11-02-main-button-spinner-black-not-font-color.md
autonomous: true
requirements:
  - TODO-2026-11-02-main-button-spinner-black-not-font-color

must_haves:
  truths:
    - "The game-page main button spinner (fa-spin faSyncAlt) is painted in the button's label colour, not #161c1e"
    - "Every main-button icon (Play/Stop/Pause/Warning/spinner) inherits the label colour in every theme, including the disabled .is-secondary installing state"
    - "Main-button icon size and transform rules are unchanged"
    - "The todo is in .planning/todos/completed/ with a Result section"
  artifacts:
    - path: "src/frontend/screens/Game/GamePage/index.css"
      provides: ".mainBtn svg rule that inherits colour"
      contains: "color: currentColor"
    - path: ".planning/todos/completed/2026-11-02-main-button-spinner-black-not-font-color.md"
      provides: "Resolved todo with a Result section"
      contains: "## Result"
  key_links:
    - from: ".buttons .mainBtn svg"
      to: "_buttons.scss .button / .is-secondary colour (--text-tertiary / --text-secondary)"
      via: "CSS colour inheritance through currentColor"
      pattern: "color: currentColor"
---

<objective>
Fix the game-page main button spinner rendering near-black instead of the label colour. The rule
`.buttons .mainBtn svg { color: var(--neutral-02); }` in `GamePage/index.css` pins every
main-button icon to `#161c1e`. Change it to inherit the button's colour, then retire the todo.

Purpose: icons match their label in every theme. The disabled installing state
(`.button:disabled.is-secondary`, `--text-secondary` #b1b1b1) is where the black spinner showed up.
Output: a one-declaration CSS change and the todo moved to completed.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/todos/pending/2026-11-02-main-button-spinner-black-not-font-color.md

Root cause (already traced by the orchestrator; do not re-investigate):
- `src/frontend/screens/Game/GamePage/index.css` around L468-479: the `& .mainBtn { ... & svg { ... } }`
  block sets `color: var(--neutral-02);` alongside `transform: scale(1.2)`, `height: 16px`,
  `width: 16px` and `align-self: center`, with a nested `&[data-icon='play'], &[data-icon='stop']`
  scale(1.6) override.
- `--neutral-02` = `#161c1e`. It is defined once in `src/frontend/styles/_colors.scss` and no theme
  overrides it.
- The label colour comes from `src/frontend/styles/_buttons.scss` (`--text-tertiary` for
  `.button`/`.is-secondary`/`.is-tertiary`, `--text-secondary` for `.button:disabled.is-secondary`).
  Themes in `src/frontend/themes.scss` vary both variables.
- FontAwesome and the MUI icons both paint with currentColor. `fa-spin` animates `transform`, and the
  animation overrides the static `scale(1.2)`, so the transform rules can stay as they are.
- The planner checked: no test under `src/` or `meta/` asserts `neutral-02` or `mainBtn svg`, so no
  unit test is needed for this token change.
- Prettier `--file-info`: `index.css` is NOT ignored (parser css). Todo `.md` files ARE
  prettier-ignored, so they get no prettier check.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Make main-button icons inherit the label colour</name>
  <files>src/frontend/screens/Game/GamePage/index.css</files>
  <action>
In the `.buttons` → `& .mainBtn` → `& svg` block (around L468-479), replace the single declaration
`color: var(--neutral-02);` with `color: currentColor;`. Directly above it, add a one-line
`/* ... */` comment in the file's existing style. The comment should say the icon inherits the
button label colour so the spinner and the Play/Stop icons follow `.button` / `:disabled.is-secondary`
in every theme, and should cite quick 261103-stm. Leave `transform`, `height`, `width`, `align-self`
and the nested `[data-icon='play'|'stop']` scale override exactly as they are. Do not edit
`_colors.scss`, `_buttons.scss`, `themes.scss` or `MainButton.tsx`. A scoped selector change is
enough, and other components may rely on `--neutral-02`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx prettier --file-info src/frontend/screens/Game/GamePage/index.css && npx prettier --check src/frontend/screens/Game/GamePage/index.css && grep -c 'color: currentColor;' src/frontend/screens/Game/GamePage/index.css && ! grep -n 'neutral-02' src/frontend/screens/Game/GamePage/index.css && git diff --stat -- src/frontend/screens/Game/GamePage/index.css</automated>
  </verify>
  <done>The `.mainBtn svg` rule uses `color: currentColor;` with an explanatory comment, `index.css` has no `--neutral-02` reference, prettier --check passes on that one file, and the diff touches only that declaration plus the comment.</done>
</task>

<task type="auto">
  <name>Task 2: Retire the todo to completed with a Result note</name>
  <files>.planning/todos/pending/2026-11-02-main-button-spinner-black-not-font-color.md, .planning/todos/completed/2026-11-02-main-button-spinner-black-not-font-color.md</files>
  <action>
Use `git mv` to move the todo from `.planning/todos/pending/` to `.planning/todos/completed/` under
the same filename. Keep the frontmatter exactly as it is: `severity: minor`, `platform: any` and
`ready: code`, in that order (gamelib-conventions todo rule). Append a `## Result` section like the
one in `.planning/todos/completed/2026-11-01-demo-status-probe-timeout-flips-bottle-to-cx-broken.md`.
Open it with "Fixed in quick-261103-stm (code commit <short hash of the Task 1 commit>)." Then
explain in two or three sentences:
- The cause was `.buttons .mainBtn svg { color: var(--neutral-02) }` (#161c1e, not themed) in
  `GamePage/index.css`. It came from upstream and pinned every main-button icon.
- The rule now uses `color: currentColor`, so the spinner and the Play/Stop/Pause icons follow the
  label (`--text-tertiary`, or `--text-secondary` when disabled) in every theme.
- Not done: no live visual check across themes was run. On the default theme the icons were already
  near-black by coincidence (`--text-tertiary` = #070a0b), so the change shows most in the disabled
  installing state and in non-default themes.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e .planning/todos/pending/2026-11-02-main-button-spinner-black-not-font-color.md && grep -c '^## Result' .planning/todos/completed/2026-11-02-main-button-spinner-black-not-font-color.md && grep -n -E '^(severity|platform|ready):' .planning/todos/completed/2026-11-02-main-button-spinner-black-not-font-color.md && npx prettier --file-info .planning/todos/completed/2026-11-02-main-button-spinner-black-not-font-color.md && pnpm planning-gates</automated>
  </verify>
  <done>The todo exists only under completed/, with its frontmatter unchanged and a `## Result` section naming the commit. `--file-info` reports it prettier-ignored, so it gets no prettier check (a green would prove nothing). `pnpm planning-gates` passes.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | Static stylesheet change and a planning doc move. No input, IPC or data flow. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261103-01 | Tampering | GamePage/index.css | accept | Cosmetic CSS colour only. No security surface. |
</threat_model>

<verification>
- `npx prettier --check src/frontend/screens/Game/GamePage/index.css` passes (scoped; the todo .md is prettier-ignored).
- `grep neutral-02 src/frontend/screens/Game/GamePage/index.css` finds nothing.
- `pnpm planning-gates` passes after the todo move.
</verification>

<success_criteria>
- Main-button spinner and icons inherit the label colour in all themes.
- Size and transform behaviour unchanged.
- Todo retired to completed/ with a Result note.
</success_criteria>

<output>
Create `.planning/quick/261103-stm-fix-main-button-spinner-black-instead-of/261103-stm-SUMMARY.md` when done
</output>
