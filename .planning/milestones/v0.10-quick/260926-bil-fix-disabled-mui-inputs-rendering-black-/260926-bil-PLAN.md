---
phase: quick-260926-bil
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/muiTheme.ts
  - src/frontend/App.tsx
  - src/frontend/__tests__/muiTheme.test.ts
  - .planning/todos/pending/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md
  - .planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md
autonomous: true
requirements:
  - TODO-2026-09-26-disabled-mui-inputs-render-black

must_haves:
  truths:
    - 'Every disabled MUI control in every GameLib theme draws its text/icon colour from a GameLib theme CSS variable, not from MUI light-mode rgba(0,0,0,...) literals'
    - "The Steam install dialog's read-only 'Windows' SelectField row (disabled) resolves text AND icon colour to var(--text-secondary), which every theme defines (body default + per-theme overrides, including nord-light)"
    - 'The fix is app-wide (in the single createTheme config), not local to InstallModal or SelectField'
    - 'palette.mode is NOT hard-coded to dark -- nord-light is a light theme'
    - 'createTheme accepts the var(...) strings without throwing, pinned by a jest test'
    - 'A jest ratchet fails if a future @mui/material upgrade starts running colour maths (alpha/darken/lighten/emphasize/decomposeColor/getContrastRatio) on palette.text.disabled or palette.action.disabled'
  artifacts:
    - path: 'src/frontend/muiTheme.ts'
      provides: 'buildMuiTheme(isRTL) -- the single app MUI theme factory, carrying palette.text.disabled and palette.action.disabled as CSS-variable strings plus the pre-existing MuiPaper/MuiTooltip overrides'
      exports: ['buildMuiTheme', 'MUI_DISABLED_TEXT', 'MUI_DISABLED_ACTION']
    - path: 'src/frontend/__tests__/muiTheme.test.ts'
      provides: 'Pins the disabled palette values, the preserved overrides, no palette.mode, and the MUI colour-maths ratchet'
    - path: '.planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md'
      provides: 'Todo moved to completed with a Resolution section and the disabled-control audit'
  key_links:
    - from: 'src/frontend/App.tsx'
      to: 'src/frontend/muiTheme.ts'
      via: 'Root() calls buildMuiTheme(isRTL) and passes it to <ThemeProvider>'
      pattern: 'buildMuiTheme\(isRTL\)'
    - from: 'node_modules/@mui/material/InputBase/InputBase.js'
      to: 'palette.text.disabled'
      via: "&.Mui-disabled { color } on root and WebkitTextFillColor on the input/select display -- the SvgIcon inherits currentColor from root"
      pattern: 'palette\.text\.disabled'
---

<objective>
Fix disabled MUI controls rendering black text/icons in dark GameLib themes, app-wide.

Root cause (read from source; the operator-visible link is inferred, see the todo): `createTheme`
in `src/frontend/App.tsx` (~line 85) declares no `palette`, so MUI 5.17.1 uses light-mode
defaults: `palette.text.disabled` = rgba(0,0,0,0.38) and `palette.action.disabled` = rgba(0,0,0,0.26).

Planner verification in `node_modules/@mui/material` (v5.17.1) -- the executor re-checks, does not trust:
- `InputBase/InputBase.js:80-81` root `&.Mui-disabled { color: palette.text.disabled }`;
  `:173-176` input `&.Mui-disabled { opacity: 1, WebkitTextFillColor: palette.text.disabled }`.
  MUI Select's display div carries the `MuiInputBase-input` class, so the SelectField's selected
  value text is painted by WebkitTextFillColor, and the FontAwesome SvgIcon inside it inherits
  `color` (currentColor) from the root. Both go black -- matches the observation.
- `FormLabel.js:53-54`, `FormControlLabel.js:76-77` -> `palette.text.disabled`.
- `OutlinedInput.js:60-61` (outline), `Button.js:117-118`, `Checkbox.js:61-62`,
  `NativeSelectInput.js:109-110` -> `palette.action.disabled`.
- A grep of the component sources for `alpha(|darken(|lighten(` applied to `text.disabled` or
  `action.disabled` found NONE: these two keys are only ever emitted verbatim as CSS values.
  So, unlike `primary`/`secondary` (which `augmentColor` runs maths on), setting these two keys to
  `var(--...)` strings is safe, and it is strictly more app-wide than per-component
  `styleOverrides` -- every MUI component that reads the keys is fixed, including ones not used
  yet. This is the orchestrator's stated concern ("palette maths throws on var()") checked against
  source rather than assumed; the ratchet test in Task 2 keeps it true across MUI upgrades.

Chosen values (Claude's discretion, documented):
- `palette.text.disabled = 'var(--text-secondary)'` -- `--text-secondary` is defined in the base
  `body {}` block of `src/frontend/themes.scss` (line 3) and overridden by themes including
  nord-light (#393b41, dark-on-light), so it resolves in every theme with no fallback needed.
  Chosen over `--text-tertiary` because tertiary is near-black in `classic` (#101111) -- it would
  reproduce the bug. Legibility is the requirement: the todo's row is a read-only value users
  must read.
- `palette.action.disabled = 'var(--icon-disabled, var(--text-secondary))'` -- `--icon-disabled`
  is a theme-authored disabled colour but only midnightMirage, classic/cyberSpaceOasis(Alt) and
  gruvbox_dark define it; the fallback covers every other theme.
- Do NOT set `palette.mode` (nord-light is light; the rest are dark -- a hard-coded mode is wrong
  for at least one theme and MUI's mode switch would also change unrelated defaults).

Purpose: legibility defect on controls users read, in every dark theme; closes the todo.
Output: `src/frontend/muiTheme.ts`, App.tsx wired to it, a pinning jest test, the todo moved to
completed with an audit of every disabled MUI control call site.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md
@.planning/todos/pending/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md
@src/frontend/App.tsx
@src/frontend/components/UI/SelectField/index.tsx
@src/frontend/__tests__/muiTabsSelectorScoping.test.ts

<interfaces>
Current theme construction in src/frontend/App.tsx Root() (lines ~85-112), to be moved verbatim
into buildMuiTheme except for the added palette:
  createTheme({
    direction: isRTL ? 'rtl' : 'ltr',
    typography: { fontFamily: 'var(--primary-font-family)' },
    components: {
      MuiPaper:   { styleOverrides: { root: { color: 'var(--text-default)', backgroundColor: 'var(--background)' } } },
      MuiTooltip: { styleOverrides: { tooltip: { fontSize: 'var(--text-md)', backgroundColor: 'var(--background-darker)',
                    color: 'var(--text-primary)', padding: 'var(--space-md)', borderRadius: 'var(--space-sm)', maxWidth: '350px' } } }
    }
  })
App.tsx imports: `import { ThemeProvider, createTheme } from '@mui/material/styles'` and later
`<ThemeProvider theme={theme}>`. `isRTL` comes from `useContext(ContextProvider)`.

Frontend jest project (src/frontend/jest.config.js): testEnvironment 'node', ts-jest,
testMatch `**/__tests__/**/*.test.ts(x)`, roots `<rootDir>/src/frontend`, resetMocks true.
`backend/testUtils/stripSourceComments` exists (used by muiTabsSelectorScoping.test.ts) if comment
stripping is wanted for the source scan.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extract buildMuiTheme with CSS-variable disabled palette and wire App.tsx</name>
  <files>src/frontend/muiTheme.ts, src/frontend/App.tsx, src/frontend/__tests__/muiTheme.test.ts</files>
  <behavior>
    - buildMuiTheme(false) returns a theme whose palette.text.disabled === 'var(--text-secondary)' and palette.action.disabled === 'var(--icon-disabled, var(--text-secondary))' (compare against the exported MUI_DISABLED_TEXT / MUI_DISABLED_ACTION constants AND the literal strings, so a constant edit cannot silently pass).
    - Neither value contains 'rgba(', 'rgb(', or '#' -- they are pure var() references.
    - buildMuiTheme(true).direction === 'rtl'; buildMuiTheme(false).direction === 'ltr'.
    - theme.components.MuiPaper.styleOverrides.root and MuiTooltip.styleOverrides.tooltip still carry the exact pre-existing values listed in the interfaces block (regression pin for the move).
    - typography.fontFamily === 'var(--primary-font-family)'.
    - The factory does not request a mode: assert theme.palette.mode === 'light' (MUI default) AND, via a source-text read of muiTheme.ts with comment lines stripped, that the token `mode` does not appear as a palette key -- documented in the test as "nord-light is a light theme; the other themes are dark; a fixed mode is wrong for at least one".
  </behavior>
  <action>
RED first: write src/frontend/__tests__/muiTheme.test.ts covering the behavior list, run it, confirm it fails (module missing), commit as test(quick-260926-bil).

GREEN: create src/frontend/muiTheme.ts exporting `MUI_DISABLED_TEXT = 'var(--text-secondary)'`, `MUI_DISABLED_ACTION = 'var(--icon-disabled, var(--text-secondary))'`, and `buildMuiTheme(isRTL: boolean): Theme` (Theme type from '@mui/material/styles') which calls `createTheme` with the existing direction/typography/components config moved verbatim from App.tsx plus `palette: { text: { disabled: MUI_DISABLED_TEXT }, action: { disabled: MUI_DISABLED_ACTION } }`. Do NOT set palette.mode, primary, secondary or any other palette key (those go through augmentColor maths and would throw on var()). Put a concise header comment in muiTheme.ts stating: why the palette exists (the todo's defect, MUI light-mode defaults emitted rgba(0,0,0,0.38)/0.26 into dark themes); that only text.disabled and action.disabled are set because MUI 5.17.1 emits them verbatim with no colour maths (cite InputBase.js root color + input WebkitTextFillColor, FormLabel, OutlinedInput outline, Button, Checkbox) and that muiTheme.test.ts ratchets this; why --text-secondary (defined in base body block, every theme resolves it; --text-tertiary is #101111 in classic); why --icon-disabled has a fallback (only four theme blocks define it); why no palette.mode (nord-light).

Wire App.tsx: replace the inline `createTheme({...})` call in Root() with `const theme = buildMuiTheme(isRTL)`, import buildMuiTheme from './muiTheme', and drop `createTheme` from the '@mui/material/styles' import (keep ThemeProvider). Leave everything else in App.tsx untouched -- in particular the long D-06 comment block and the two-boolean macOS gate.

Before writing, re-verify the planner's source claims yourself: `grep -n "palette.text.disabled\|palette.action.disabled" node_modules/@mui/material/{InputBase/InputBase.js,FormLabel/FormLabel.js,OutlinedInput/OutlinedInput.js,Button/Button.js,Checkbox/Checkbox.js}`. If any of those sites wraps the key in a colour function, stop and switch to per-component `&.Mui-disabled` styleOverrides for that component instead (record it as a deviation).
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend src/frontend/__tests__/muiTheme.test.ts && pnpm codecheck && npx prettier --check src/frontend/muiTheme.ts src/frontend/App.tsx src/frontend/__tests__/muiTheme.test.ts && grep -c "buildMuiTheme(isRTL)" src/frontend/App.tsx && grep -v '^\s*//' src/frontend/App.tsx | grep -c "createTheme" | grep -qx 0</automated>
  </verify>
  <done>muiTheme.test.ts passes; tsc clean; prettier clean on the three paths; App.tsx builds its theme only via buildMuiTheme(isRTL) and no longer references createTheme outside comments.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Ratchet MUI's verbatim use of the two disabled keys</name>
  <files>src/frontend/__tests__/muiTheme.test.ts</files>
  <behavior>
    - "consumer sites still exist": InputBase/InputBase.js, FormLabel/FormLabel.js still reference `palette.text.disabled`; OutlinedInput/OutlinedInput.js, Button/Button.js, Checkbox/Checkbox.js still reference `palette.action.disabled` -- proves the path the fix relies on is still live (if MUI moves the colour elsewhere, the fix may no longer reach the SelectField and this test must say so).
    - "no colour maths on the disabled keys": across every `node_modules/@mui/material/<Component>/<Component>.js` file (top-level component directories only; skip umd/, legacy/, modern/, node/ and esm duplicates), no match for a colour function -- alpha, darken, lighten, emphasize, decomposeColor, getContrastRatio, getLuminance -- whose call argument text contains `text.disabled` or `action.disabled` (single-line regex such as a colour-function name followed by `(` then non-`)` chars then `(text|action)\.disabled`). Failure message must name the file and line and explain that a var() palette string would now break, pointing at muiTheme.ts.
    - "createTheme does not throw with var() disabled values" is implicitly covered by Task 1; add an explicit expect(() => buildMuiTheme(false)).not.toThrow() for readability.
  </behavior>
  <action>
Extend src/frontend/__tests__/muiTheme.test.ts with a second describe block implementing the behavior list. Resolve the MUI package root with `path.dirname(require.resolve('@mui/material/package.json'))` rather than a hard-coded node_modules path. Assert the scan examined a non-trivial file count (e.g. > 50) so a wrong glob cannot pass vacuously -- the green-check-proving-nothing pattern CLAUDE.md warns about. Also assert the scanned version string from @mui/material/package.json is logged in the describe title or a comment-free expect message so a future failure shows which MUI version changed behaviour. Run it: it must be GREEN against the installed 5.17.1 (this is a guard, not RED-first; to prove it can fail, temporarily point the regex at a key MUI does run maths on, e.g. `primary\.main`, confirm a failure, then revert -- note the result in the SUMMARY).
  </action>
  <verify>
    <automated>npx jest --selectProjects Frontend src/frontend/__tests__/muiTheme.test.ts && npx prettier --check src/frontend/__tests__/muiTheme.test.ts</automated>
  </verify>
  <done>Ratchet passes on the installed MUI, was shown able to fail against a maths-bearing key, scans more than 50 files, and names MUI's version in its output.</done>
</task>

<task type="auto">
  <name>Task 3: Audit every disabled MUI control and move the todo to completed</name>
  <files>.planning/todos/pending/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md, .planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md</files>
  <action>
Audit: find every MUI component rendered with a `disabled` prop in src/frontend (MUI imports are often multi-line; use a multiline-aware search, e.g. `grep -rlE "from '@mui/material" src/frontend --include=*.tsx | xargs grep -n "disabled"`, then read each hit to confirm the disabled prop lands on an MUI component rather than a native element). Planner's starting list (not exhaustive -- verify): SelectField (wraps MUI Select; call sites include InstallModal/index.tsx:600 platform row, DownloadDialog BranchSelector/BuildSelector/GameLanguageSelector, WineSelector, SteamDialog), SliderField (MUI Slider), MUI Button/IconButton in WikiInfoEmptyState, AppleWikiInfo, SIDLogin, CategorySettings, MenuItem in GameSubMenu, and DiscountFilters (Checkbox/Autocomplete/FormControlLabel/Chip). For each, record which palette key paints its disabled colour (text.disabled, action.disabled, or neither -- e.g. MenuItem uses action.disabledOpacity, Slider uses its own grey) by checking that component's .js in node_modules/@mui/material. Any control whose disabled colour comes from neither key and that still resolves to a light-mode literal is a remaining instance of the class: fix it in muiTheme.ts via a `components.<Name>.styleOverrides` `&.Mui-disabled` rule using the same var() values (extending Task 1's test to pin it), or, if none exist, say so explicitly.

Then `git mv` the todo from .planning/todos/pending/ to .planning/todos/completed/ (same filename). Append a `## Resolution (2026-09-26, quick 260926-bil)` section: the fix (palette.text.disabled / action.disabled as var() strings in src/frontend/muiTheme.ts, app-wide, no palette.mode), the audit table (call site | MUI component | disabled colour source | covered?), the ratchet test, and an honest status line: the fix is verified by source + jest only; the todo's own "Verification (once fixed)" steps -- Windows host, dark theme, Steam install dialog read-only Windows row legible, plus one other disabled MUI input in the same theme -- remain an operator live check that this quick task could not perform, and the black-colour mechanism was never confirmed with DevTools. Keep the existing frontmatter keys (severity/platform/ready) intact; completed/ is exempt from the gate but do not strip them. Do not flatten or edit any other file.
  </action>
  <verify>
    <automated>test ! -e .planning/todos/pending/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md && grep -c "## Resolution" .planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md && npx prettier --check .planning/todos/completed/2026-09-26-disabled-mui-inputs-render-black-in-dark-themes.md src/frontend/muiTheme.ts src/frontend/__tests__/muiTheme.test.ts && pnpm planning-gates && npx jest --selectProjects Frontend src/frontend/__tests__/muiTheme.test.ts</automated>
  </verify>
  <done>Todo lives only in completed/ with a Resolution section containing the audit table and an explicit statement that live operator verification is outstanding; every disabled MUI call site is accounted for; planning-gates, prettier and the test pass.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Pure renderer styling config; no input, IPC, network or storage crosses a boundary |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-260926bil-01 | Denial of Service | buildMuiTheme / createTheme | mitigate | A var() string in a palette key MUI runs colour maths on would throw at render and blank the whole app; only text.disabled/action.disabled are set, and the Task 2 ratchet fails the build if MUI starts running maths on them |
| T-260926bil-02 | Information Disclosure | n/a | accept | No data handled; no fake-HOME binary runs in this task |
</threat_model>

<verification>
- `npx jest --selectProjects Frontend src/frontend/__tests__/muiTheme.test.ts` green
- `pnpm codecheck` exit 0
- `npx prettier --check` over every written path green
- `pnpm planning-gates` green
- App.tsx constructs its MUI theme only via buildMuiTheme(isRTL)
</verification>

<success_criteria>
- Disabled MUI text/icon colour resolves to GameLib theme variables in every theme, app-wide
- No hard-coded palette.mode; nord-light unaffected in direction
- Audit of every disabled MUI control recorded in the completed todo
- Todo moved to .planning/todos/completed/ with honest live-verification status
</success_criteria>

<output>
Create `.planning/quick/260926-bil-fix-disabled-mui-inputs-rendering-black-/260926-bil-SUMMARY.md` when done.
</output>
