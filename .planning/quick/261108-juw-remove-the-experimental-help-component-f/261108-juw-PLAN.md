---
phase: quick-261108-juw
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/hooks/hasHelp.ts
  - src/frontend/screens/Accessibility/index.tsx
  - src/frontend/screens/DownloadManager/index.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Library/index.tsx
  - src/frontend/screens/Login/index.tsx
  - src/frontend/screens/WineManager/index.tsx
  - src/frontend/screens/Settings/index.tsx
  - src/frontend/screens/Settings/components/DefaultInstallPath.tsx
  - src/frontend/screens/Settings/components/DefaultSteamPath.tsx
  - src/frontend/screens/Settings/components/LoginBackground.tsx
  - src/frontend/components/UI/Help/index.tsx
  - src/frontend/components/UI/Help/index.css
  - src/frontend/components/UI/index.tsx
  - src/frontend/App.tsx
  - src/frontend/App.css
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/types.ts
  - src/common/types.ts
  - src/frontend/screens/Settings/components/ExperimentalFeatures.tsx
autonomous: true
requirements: [QUICK-261108-juw]

must_haves:
  truths:
    - "Settings -> Advanced -> Experimental Features shows only the Comet support toggle (no 'Help component' toggle); the section heading remains"
    - "No floating '?' Help button renders anywhere in the app, regardless of any persisted experimentalFeatures.enableHelp value"
    - "A config file still carrying experimentalFeatures.enableHelp loads without error (nothing validates experimentalFeatures strictly)"
    - "Per-setting (i) InfoIcon help and FieldLabel labelHelp are untouched and still work"
    - "pnpm codecheck, pnpm lint, pnpm lint-translations:gamelib pass (no new failures)"
  artifacts:
    - path: "src/common/types.ts"
      provides: "ExperimentalFeatures type without enableHelp"
    - path: "src/frontend/screens/Settings/components/ExperimentalFeatures.tsx"
      provides: "Experimental Features section with cometSupport only"
  key_links:
    - from: "src/frontend/App.tsx"
      to: "components/UI Help"
      via: "import + render removed"
      pattern: "Help items"
---

<objective>
Remove the experimental "Help component" feature entirely (user decision, locked: remove, not tidy): the enableHelp toggle, the floating Help button/popover, the hasHelp hook and all its call sites, help state/actions in global state, HelpItem type, and enableHelp from the ExperimentalFeatures type and every default.

Purpose: dead experimental surface carried from upstream; it adds state plumbing to ten screens for a feature nobody ships.
Output: the code above deleted/edited; no new files.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
Load Skill("gamelib-conventions") before writing verify commands (the scoped prettier rule).

Planner findings (already grepped, do not re-scan broadly):
- `hasHelp(id, title, <jsx>)` is a hook in src/frontend/hooks/hasHelp.ts that calls `help.addHelpItem`/`removeHelpItem` from ContextProvider. Each call site has the shape `hasHelp('<id>', t('help.title.<x>', ...), <p>{t('help.content.<x>', ...)}</p>)`, sometimes with a preceding `const helpContent = t(...)` variable (Settings/index.tsx ~line 66, preceded by a 4-line TODO comment block holding `// t('help.content.settingsGame', ...)` — delete that comment block too).
- Help component: src/frontend/components/UI/Help/{index.tsx,index.css}; exported at src/frontend/components/UI/index.tsx line 15; imported at src/frontend/App.tsx line 20 (`import { ControllerHints, Help, OfflineMessage } from './components/UI'`), `help` destructured from context at App.tsx line 47, rendered at line 151 (`{experimentalFeatures.enableHelp && <Help items={help.items} />}`).
- `.HelpButton` CSS also lives in src/frontend/App.css (~lines 132-146): a `.HelpButton { position: fixed ... }` rule, and `.HelpButton,` inside the `body:has(dialog[open])` pointer-events rule (plus the comment mentioning "and Help"). Remove the HelpButton selector and rule; keep the `dialog[open]` pointer-events rule.
- State: src/frontend/types.ts lines 173-177 (`help: { items, addHelpItem, removeHelpItem }` in ContextType) and lines 455-458 (`export interface HelpItem`). ContextProvider.tsx lines 116-120 (help default) and 122 (`enableHelp: false`). GlobalState.tsx: `HelpItem` import (line 19), `helpItems` in StateProps (217), `helpItems: {}` initial state (569), `enableHelp: false` (571), `addHelpItem`/`removeHelpItem` methods (2117-2130), `help: {...}` in the provider value (2243-2247).
- src/common/types.ts line 107 `enableHelp: boolean` in ExperimentalFeatures.
- Backend: only reads `experimentalFeatures?.cometSupport` (src/backend/launcher.ts:1026, gog/games.ts:833). No schema/zod/type guard validates experimentalFeatures — an extra persisted `enableHelp` key is inert. Executor should re-confirm with one grep (`grep -rn experimentalFeatures src/backend src/common`) and record the result in SUMMARY.
- No test file references Help/hasHelp/enableHelp/HelpItem (grep of src, meta, e2e returned none).
- `help.title.*`, `help.content.*`, `help.button.*` keys are used ONLY by the Help system (verified). The InfoIcon/labelHelp system does not use them. Leave public/locales/** catalogs alone (public/locales/en/translation.json:878 keeps `enableHelp`) unless a gate fails because of them.
- i18n gate bookkeeping: hasHelp.ts and UI/Help/index.tsx are NOT in meta/i18nGateScope.json or meta/i18nForkTouchedFiles.json; App.tsx and ExperimentalFeatures.tsx are, but they are edited, not deleted. So scope/fork-touched counts should not change. Per 261108-ioc precedent: only if genI18nGateScope.test.ts A0-A4 count assertions change, regenerate/update the artifacts and counts with a dated note. Its A-17 ANTI-ROT test already fails on main (30 unrelated files) — not caused by this task, do not fix.
- Lint: meta/lintScoped.cjs has ceilings (SRC 1130 / TESTS 661, maxima — removals only lower them) and floors SRC_MIN_FILES 375 / TESTS_MIN_FILES 220. Deleting 2 src files must not drop below 375; if it does, report rather than lower the floor silently.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Delete hasHelp hook and all ten call sites</name>
  <files>src/frontend/hooks/hasHelp.ts, src/frontend/screens/Accessibility/index.tsx, src/frontend/screens/DownloadManager/index.tsx, src/frontend/screens/Game/GamePage/index.tsx, src/frontend/screens/Library/index.tsx, src/frontend/screens/Login/index.tsx, src/frontend/screens/WineManager/index.tsx, src/frontend/screens/Settings/index.tsx, src/frontend/screens/Settings/components/DefaultInstallPath.tsx, src/frontend/screens/Settings/components/DefaultSteamPath.tsx, src/frontend/screens/Settings/components/LoginBackground.tsx</files>
  <action>Delete src/frontend/hooks/hasHelp.ts (git rm). In each listed screen/component, remove the `import { hasHelp } from 'frontend/hooks/hasHelp'` line and the whole `hasHelp(...)` call, plus any variable that existed only to feed it (e.g. `helpContent` in Settings/index.tsx) and the TODO comment block preserving `t('help.content.settingsGame', ...)` in Settings/index.tsx. After each removal, check whether anything else became unused because of it — most often `useTranslation`/`t` (DefaultInstallPath, DefaultSteamPath, LoginBackground are small components where `t` may now be unused) or React imports — and remove those too; but keep `t` wherever other strings still use it. Do not touch InfoIcon, FieldLabel `labelHelp`, or any non-`help.` translation key.</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e src/frontend/hooks/hasHelp.ts && ! grep -rn "hasHelp\|help\.content\.\|help\.title\." src/frontend --include='*.tsx' --include='*.ts' | grep -v "components/UI/Help"</automated>
  </verify>
  <done>No hasHelp references remain outside the (still-present, removed in Task 2) Help component; no orphaned helpContent/t/imports left in the ten files.</done>
</task>

<task type="auto">
  <name>Task 2: Remove Help component, help state, HelpItem type, and enableHelp everywhere</name>
  <files>src/frontend/components/UI/Help/index.tsx, src/frontend/components/UI/Help/index.css, src/frontend/components/UI/index.tsx, src/frontend/App.tsx, src/frontend/App.css, src/frontend/state/ContextProvider.tsx, src/frontend/state/GlobalState.tsx, src/frontend/types.ts, src/common/types.ts, src/frontend/screens/Settings/components/ExperimentalFeatures.tsx</files>
  <action>git rm the src/frontend/components/UI/Help directory. Drop the `Help` export from components/UI/index.tsx. In App.tsx remove `Help` from the import, the `help` destructure (line ~47), and the line-151 render; leave `experimentalFeatures` destructured only if still used elsewhere in App.tsx, else remove it too. In App.css remove the `.HelpButton` rule and the `.HelpButton,` selector (and the "and Help" wording in the comment) while keeping `dialog[open] { pointer-events: all; }`. In types.ts remove the `help` member of the context type and the `HelpItem` interface. In ContextProvider.tsx remove the `help` default and `enableHelp: false`. In GlobalState.tsx remove the HelpItem import, `helpItems` from StateProps and initial state, `enableHelp: false`, `addHelpItem`/`removeHelpItem`, and the `help` entry in the provider value. In src/common/types.ts remove `enableHelp: boolean` from ExperimentalFeatures (keep cometSupport). In ExperimentalFeatures.tsx: FEATURES becomes `['cometSupport']`, useSetting default becomes `{ cometSupport: true }`; keep the section heading. Translation comment block: delete the enableHelp and enableNewDesign lines (enableNewDesign is not a key of the type; neither is referenced elsewhere — confirm with grep), KEEP the `t('setting.experimental_features.cometSupport', 'Comet support')` line because the toggle title uses a dynamic key and that comment is what keeps the key discoverable to extraction. Persisted-config tolerance: re-run `grep -rn experimentalFeatures src/backend src/common` and confirm no strict validation; if any strict check is found, make it ignore unknown keys and note it in SUMMARY.</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && ! grep -rnE "enableHelp|HelpItem|addHelpItem|removeHelpItem|helpItems|HelpButton|UI/Help|from './Help'" src && pnpm codecheck</automated>
  </verify>
  <done>Zero references to the Help feature in src/; codecheck passes; Experimental Features renders only Comet support.</done>
</task>

<task type="auto">
  <name>Task 3: Gates, lint, formatting, graph update</name>
  <files>meta/i18nGateScope.json, meta/i18nForkTouchedFiles.json, meta/__tests__/genI18nGateScope.test.ts (only if counts move)</files>
  <action>Run the full verification set. `pnpm lint` (scoped runner; catches unused vars that codecheck misses) — fix any new warning in touched files. `pnpm lint-translations:gamelib` must report 0 hard failures. Run scoped jest: `npx jest src/frontend/screens/Settings src/frontend/state meta/__tests__` (include hardcodedStringGate and genI18nGateScope). For genI18nGateScope: the only acceptable failure is the pre-existing A-17 ANTI-ROT drift (compare against `git stash`-free reasoning: the failing file list must not include any file this task touched). If A0-A4 hardcoded counts fail because of this task, follow 261108-ioc precedent: regenerate the two meta JSON artifacts with meta/genI18nGateScope.ts and update the counts with a dated note; otherwise leave these files untouched and remove them from the commit. Prettier: check `--file-info` then run `npx prettier --check` listing every written (non-deleted) path literally — App.tsx, App.css, components/UI/index.tsx, state/ContextProvider.tsx, state/GlobalState.tsx, types.ts, common/types.ts, ExperimentalFeatures.tsx, and the ten Task-1 files (write them out explicitly; zsh does not word-split unquoted vars). Finally run `graphify update .`.</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm codecheck && pnpm lint && pnpm lint-translations:gamelib && npx prettier --check src/frontend/App.tsx src/frontend/App.css src/frontend/components/UI/index.tsx src/frontend/state/ContextProvider.tsx src/frontend/state/GlobalState.tsx src/frontend/types.ts src/common/types.ts src/frontend/screens/Settings/components/ExperimentalFeatures.tsx src/frontend/screens/Accessibility/index.tsx src/frontend/screens/DownloadManager/index.tsx src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/Library/index.tsx src/frontend/screens/Login/index.tsx src/frontend/screens/WineManager/index.tsx src/frontend/screens/Settings/index.tsx src/frontend/screens/Settings/components/DefaultInstallPath.tsx src/frontend/screens/Settings/components/DefaultSteamPath.tsx src/frontend/screens/Settings/components/LoginBackground.tsx && npx jest src/frontend/screens/Settings src/frontend/state meta/__tests__</automated>
  </verify>
  <done>codecheck, lint, lint-translations:gamelib (0 hard failures), scoped prettier and scoped jest all pass, except the documented pre-existing genI18nGateScope A-17 failure (unchanged file list); graphify updated; SUMMARY records the persisted-config tolerance finding and gate results.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| persisted config -> renderer | user config JSON may still contain experimentalFeatures.enableHelp |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-juw-01 | Denial of Service | experimentalFeatures load path | mitigate | Confirm no strict validation of experimentalFeatures (Task 2 grep); stale key is ignored by TypeScript-only typing |
| T-juw-02 | Tampering | removal of feature code | accept | Pure deletion, no new input surface or dependencies |
</threat_model>

<verification>
- `grep -rnE "hasHelp|enableHelp|HelpItem|helpItems|HelpButton" src` returns nothing.
- InfoIcon / labelHelp usages unchanged (`git diff --stat` shows no edits to InfoIcon/FieldLabel files).
- All Task 3 gates pass (A-17 pre-existing failure excepted).
</verification>

<success_criteria>
The experimental Help component feature is fully gone from source and state; Experimental Features keeps Comet support; old configs load; all gates green.
</success_criteria>

<output>
Create `.planning/quick/261108-juw-remove-the-experimental-help-component-f/261108-juw-SUMMARY.md` when done
</output>
