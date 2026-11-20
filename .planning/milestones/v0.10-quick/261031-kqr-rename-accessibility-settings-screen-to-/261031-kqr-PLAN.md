---
phase: quick-261031-kqr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
  - src/frontend/screens/Accessibility/index.tsx
  - src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx
  - public/locales/en/translation.json
  - src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx
  - src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx
  - src/frontend/screens/Settings/sections/GeneralSettings/index.tsx
autonomous: true
requirements: [QUICK-261031-kqr]

must_haves:
  truths:
    - "The Settings panel nav row that opens /accessibility reads 'Appearance'"
    - "The screen at /accessibility shows the heading 'Appearance'"
    - "The help popover title for that screen reads 'Appearance'"
    - "The theme picker appears only on the Appearance screen, not on General settings"
  artifacts:
    - path: "src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx"
      provides: "Nav row label"
      contains: "t('accessibility.title', 'Appearance')"
    - path: "src/frontend/screens/Accessibility/index.tsx"
      provides: "Screen heading + help title, still renders ThemeSelector"
      contains: "<ThemeSelector />"
    - path: "public/locales/en/translation.json"
      provides: "English values for accessibility.title and help.title.accessibility = Appearance"
  key_links:
    - from: "SettingsPanel NavItem label"
      to: "public/locales/en/translation.json accessibility.title"
      via: "i18n key accessibility.title (key unchanged, value changed)"
      pattern: "\"title\": \"Appearance\""
---

<objective>
Rename the user-visible name of the Accessibility settings screen to "Appearance" and remove the duplicate
`<ThemeSelector />` from General settings, so the theme picker lives only on the Appearance screen.

Purpose: User decision (locked): rename to "Appearance"; remove the General copy. Scope is the user-visible name.
Output: Updated labels/heading/help/tour copy + English locale values, General settings without ThemeSelector,
updated label-asserting tests.

**Scope decision (planner discretion, minimal/low-risk):** Change user-visible STRINGS only. Keep unchanged:
the route `/accessibility` (also matched by `navTabs.ts:76` and `navTabs.test.ts:137`), the directory
`src/frontend/screens/Accessibility/`, component names `Accessibility` / `AccessibilityWrapper`, the CSS class
`.Accessibility` (used in `Settings/index.css` and `Accessibility/index.css`), `data-tour="nav-accessibility"`,
the `faUniversalAccess` icon, and all i18n KEYS (`accessibility.title`, `help.title.accessibility`,
`help.content.accessibility`, `tour.sidebar.accessibility`). Renaming identifiers would ripple into CSS selectors,
the route resolver, the zoom anti-drift test path (`savedZoomBoot.test.ts:161-167` reads
`screens/Accessibility/index.tsx` by path) and 48 non-English catalogs — none of that is user-visible. Keeping the
keys means non-English locales keep their existing (stale "Accessibility") translations until re-translated
elsewhere, per instruction to only update English values.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx
@src/frontend/screens/Settings/sections/GeneralSettings/index.tsx

<interfaces>
Exact current sites (verified by planner):

- `src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx:153` —
  `label={t('accessibility.title', 'Accessibility')}` on the `NavItem url="/accessibility"`.
- `src/frontend/screens/Accessibility/index.tsx:43-44` —
  `t('help.title.accessibility', 'Accessibility')` and `t('help.content.accessibility', 'Shows accessibility settings.')`.
- `src/frontend/screens/Accessibility/index.tsx:131-133` — `<h1 className="headerTitle">{t('accessibility.title', 'Accessibility')}</h1>`.
- `src/frontend/screens/Accessibility/index.tsx:195` — `<ThemeSelector />` (KEEP).
- `src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx:129-132` —
  `t('tour.sidebar.accessibility', 'Access accessibility features to customize your experience.')`.
- `public/locales/en/translation.json`:
  line 9 `"title": "Accessibility"` (inside top-level `accessibility`),
  line 477 `"accessibility": "Shows accessibility settings."` (inside `help.content`),
  line 542 `"accessibility": "Accessibility"` (inside `help.title`),
  line 1239 `"accessibility": "Access accessibility features to customize your experience."` (inside `tour.sidebar`).
- `src/frontend/screens/Settings/sections/GeneralSettings/index.tsx:3` —
  `import { ThemeSelector } from 'frontend/components/UI/ThemeSelector'`; line 36 `<ThemeSelector />`.
- Tests asserting the label (their `t` mock returns the default value, so they see the code default string):
  `src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx:228` (labels array), `:349` (test name),
  `:352` (`findNavItem(tree, 'Accessibility')`);
  `src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx:279` (labels union array).
- No test asserts ThemeSelector presence in GeneralSettings (there is no GeneralSettings test). The
  Accessibility screen test (`screens/Accessibility/__tests__/index.test.tsx`) mentions ThemeSelector only in a
  docstring and asserts no title string — leave it alone.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rename user-visible "Accessibility" strings to "Appearance" and update label tests</name>
  <files>src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx, src/frontend/screens/Accessibility/index.tsx, src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx, public/locales/en/translation.json, src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx, src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx</files>
  <action>
Per the locked rename decision, change only English default values and English locale values; keep every i18n key, route, directory, component name, CSS class, data-tour attribute and icon as-is (see objective scope decision).

1. SettingsPanel/index.tsx line 153: default value 'Accessibility' becomes 'Appearance' (key stays `accessibility.title`). Also update the docstring at line ~25 only if it names the row as a user-facing label in a way that becomes wrong; mentions of the screen/route by its code name may stay.
2. Accessibility/index.tsx: `help.title.accessibility` default 'Accessibility' becomes 'Appearance'; `help.content.accessibility` default becomes 'Shows appearance and accessibility settings.'; `accessibility.title` heading default becomes 'Appearance'. Do NOT touch `<ThemeSelector />` at line 195, the `.Accessibility` className, or the zoom `<input min/max>` (savedZoomBoot anti-drift test reads them).
3. NavShellTour/index.tsx: `tour.sidebar.accessibility` default becomes 'Customize how GameLib looks: theme, zoom, fonts and accessibility options.'
4. public/locales/en/translation.json: set the four values to match the new defaults exactly — `accessibility.title` = "Appearance", `help.title.accessibility` = "Appearance", `help.content.accessibility` = "Shows appearance and accessibility settings.", `tour.sidebar.accessibility` = "Customize how GameLib looks: theme, zoom, fonts and accessibility options.". Edit only those four lines (use the Edit tool with unique surrounding context; the `"accessibility": "Accessibility"` string at line 542 is unique). Do NOT edit non-English locales and do NOT touch `public/locales/en/gamepage.json` (it has unrelated uncommitted user changes — never stage it).
5. SettingsPanel.test.tsx: in the labels array (line 228) replace 'Accessibility' with 'Appearance'; rename the test at line 349 to "the Appearance row carries data-tour=\"nav-accessibility\"" and change `findNavItem(tree, 'Accessibility')` to `findNavItem(tree, 'Appearance')`. Update the file docstring (line ~6) wording if it lists the row label.
6. destinationCoverage.test.tsx line 279: replace 'Accessibility' with 'Appearance' in the expected union array.

Before verifying, run `npx prettier --file-info` on each written path: the five .ts/.tsx files are expected to report `"ignored": false`; `public/locales/en/translation.json` is under the `public/locales/` prettierignore and is expected to report `"ignored": true` — so it is deliberately excluded from the `--check` below (a check over it would be vacuous).
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/components/UI/NavShell src/frontend/screens/Accessibility src/frontend/state/__tests__/savedZoomBoot.test.ts && node -e "const j=require('./public/locales/en/translation.json');const v=[j.accessibility.title,j.help.title.accessibility,j.help.content.accessibility,j.tour.sidebar.accessibility];console.log(v);if(v[0]!=='Appearance'||v[1]!=='Appearance')process.exit(1)" && test "$(cat src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx src/frontend/screens/Accessibility/index.tsx | grep -c "'Accessibility')")" = "0" && npx prettier --check src/frontend/components/UI/NavShell/components/SettingsPanel/index.tsx src/frontend/screens/Accessibility/index.tsx src/frontend/components/UI/NavShell/components/NavShellTour/index.tsx src/frontend/components/UI/NavShell/__tests__/SettingsPanel.test.tsx src/frontend/components/UI/NavShell/__tests__/destinationCoverage.test.tsx</automated>
  </verify>
  <done>Nav row, screen heading, help title read "Appearance"; tour/help copy updated; English locale values match code defaults; NavShell, Accessibility and savedZoomBoot jest suites pass; prettier clean on the five source/test files (translation.json is prettier-ignored, check intentionally omitted for it); gamepage.json untouched.</done>
</task>

<task type="auto">
  <name>Task 2: Remove the duplicate ThemeSelector from General settings</name>
  <files>src/frontend/screens/Settings/sections/GeneralSettings/index.tsx</files>
  <action>
Per the locked decision, delete the `<ThemeSelector />` element (line 36) and its surrounding blank line, and delete the now-unused import `import { ThemeSelector } from 'frontend/components/UI/ThemeSelector'` (line 3). Leave every other General setting in its existing order. Do not modify the ThemeSelector component itself or the Accessibility screen's copy (it stays the sole render site). Confirm with `npx prettier --file-info` that the file reports `"ignored": false` before running the check.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test "$(grep -c ThemeSelector src/frontend/screens/Settings/sections/GeneralSettings/index.tsx)" = "0" && test "$(grep -rl '<ThemeSelector' src/frontend --include='*.tsx' | grep -v __tests__ | wc -l | tr -d ' ')" = "1" && npx eslint src/frontend/screens/Settings/sections/GeneralSettings/index.tsx && npx prettier --check src/frontend/screens/Settings/sections/GeneralSettings/index.tsx</automated>
  </verify>
  <done>GeneralSettings contains no ThemeSelector import or element; the only `<ThemeSelector` render site in src/frontend is screens/Accessibility/index.tsx; eslint and prettier clean on the file.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none | UI label/copy change and removal of a duplicate component render; no input handling, IPC, or data flow changes |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-kqr-01 | Tampering | public/locales/en/gamepage.json (unrelated uncommitted user edits) | mitigate | Plan never edits it; executor stages files by explicit path only, never `git add -A`/`.` |
</threat_model>

<verification>
- `npx tsc --noEmit` passes (removed import leaves no dangling reference).
- `git status --porcelain public/locales/en/gamepage.json` shows the same pre-existing ` M` state, and it is not in the commit.
- Optional live check: in the running app, Settings panel shows "Appearance" (not "Accessibility"); opening it shows the "Appearance" heading with the theme picker; Settings > General no longer shows the theme picker.
</verification>

<success_criteria>
- User-visible name is "Appearance" in the nav row, screen heading, and help title (English).
- Theme picker renders only on the Appearance screen.
- All touched jest suites pass; prettier clean on every non-ignored written path.
</success_criteria>

<output>
Create `.planning/quick/261031-kqr-rename-accessibility-settings-screen-to-/261031-kqr-SUMMARY.md` when done
</output>
