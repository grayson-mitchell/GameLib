---
phase: quick-261101-tsq
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types/electron_store.ts
  - src/common/types/storePolicy.ts
  - src/common/types/__tests__/storePolicy.test.ts
  - src/frontend/types.ts
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/screens/Accessibility/index.tsx
  - public/locales/en/translation.json
  - src/frontend/screens/Library/components/GamesList/index.tsx
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/GameCard/__tests__/hideTitles.test.ts
autonomous: true
requirements: [QUICK-261101-tsq]

must_haves:
  truths:
    - "A 'Hide titles' toggle sits directly under 'Always show titles in library' on the Accessibility screen (above 'Clean tiles'), and it is off by default"
    - "With the toggle on, no grid tile shows its title strip: not at rest, not on mouse hover, not under keyboard/controller focus, and not when 'Always show titles' is also on. This holds in the main grid, the Favourites/Recently-Played shelves and the FocusRowStrip"
    - "While 'Hide titles' is on, the 'Always show titles in library' toggle is disabled (greyed, not clickable) but keeps its stored value; turning 'Hide titles' off restores the previous always-show behaviour unchanged"
    - "List layout rows still show the game name, because `.gameListItem .gameTitle` is the row's name column"
    - "Status label (`.gameListInfo`), badges, the bottom bar (unless Clean tiles is on), the context menu and tile click-through are unaffected"
    - "The setting persists across app restarts"
  artifacts:
    - path: "src/frontend/state/GlobalState.tsx"
      provides: "hideTitles state, setHideTitles setter, configStore init"
      contains: "configStore.get('hideTitles', false)"
    - path: "src/common/types/storePolicy.ts"
      provides: "hideTitles allowed in configStore allowlist"
      contains: "'hideTitles'"
    - path: "src/frontend/screens/Library/components/GameCard/index.css"
      provides: "rule that removes the grid title under .hideTitles"
      contains: ".hideTitles .gameCard .gameTitle"
    - path: "src/frontend/screens/Library/components/GameCard/__tests__/hideTitles.test.ts"
      provides: "source-text gate for wiring + CSS"
  key_links:
    - from: "src/frontend/screens/Accessibility/index.tsx"
      to: "GlobalState.setHideTitles"
      via: "ContextProvider setter"
      pattern: "setHideTitles\\(!hideTitles\\)"
    - from: "src/frontend/screens/Accessibility/index.tsx"
      to: "setTitlesAlwaysVisible ToggleSwitch"
      via: "disabled={hideTitles}"
      pattern: "disabled=\\{hideTitles\\}"
    - from: "src/frontend/screens/Library/components/GamesList/index.tsx"
      to: "GameCard/index.css .hideTitles rule"
      via: "cx({... hideTitles}) class on list wrapper"
      pattern: "hideTitles"
---

<objective>
Add a "Hide titles" preference (`hideTitles`, default false). When it is on, library grid tiles never show their title strip, including on hover. It is a companion to clean tile mode (quick 261101-tjv) for a console-like look.

Purpose: the operator asked for it in these words: "there is an always on, when not selected then is on when you move mouse over it, I want a option that does not show title at all". Today the title has two states: hover-only (the default) and always visible (`titlesAlwaysVisible`). This adds a third state, never shown.

Output: the preference wired end to end (store type, allowlist and its test, context, GlobalState, Accessibility toggle with the always-show toggle disabled while it is on, en string), the wrapper class, one CSS rule, and a source-text jest gate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/frontend/screens/Library/components/GameCard/__tests__/cleanTiles.test.ts

The exact precedent is the `cleanTiles` pref from commits `de6d16365` (wiring) and `41299c88b` (applying it). Run `git show de6d16365 41299c88b` once and mirror both. Every site was confirmed by grep at planning time. Add `hideTitles` directly **after `titlesAlwaysVisible` and before `cleanTiles`** at each site:

- `src/common/types/electron_store.ts:41`: `cleanTiles: boolean`
- `src/common/types/storePolicy.ts:100`: `'cleanTiles',` in the configStore allowlist
- `src/common/types/__tests__/storePolicy.test.ts:153`: `expect(isAllowedStoreField('configStore', 'cleanTiles')).toBe(true)`
- `src/frontend/types.ts:151`: `cleanTiles: boolean` (and its setter type next to it)
- `src/frontend/state/ContextProvider.tsx:95`: `cleanTiles: false,` (and `setCleanTiles: () => null,`)
- `src/frontend/state/GlobalState.tsx`: state type L196, init L548 `cleanTiles: configStore.get('cleanTiles', false),`, setter L634-637 `setCleanTiles = (value: boolean) => { configStore.set(...); this.setState(...) }`, context value L2192 `setCleanTiles: this.setCleanTiles,` (follow whatever cleanTiles does for the state field itself)
- `src/frontend/screens/Accessibility/index.tsx`: destructure ~L32. The titles-always-visible `<span className="setting">` block is ~L223-237 (`ToggleSwitch htmlId="setTitlesAlwaysVisible"`), and the clean-tiles block follows it.
- `public/locales/en/translation.json:10-11`: `"titles_always_visible"` then `"clean_tiles"` inside `accessibility`
- `src/frontend/screens/Library/components/GamesList/index.tsx:34,70-71`: the context destructure, and the wrapper `cx({ ..., titlesAlwaysVisible, cleanTiles })`

ToggleSwitch (`src/frontend/components/UI/ToggleSwitch/index.tsx`) already accepts `disabled?: boolean` and passes it to the `<input>`.

CSS facts (GameCard/index.css):
- L305 `.gameCard .gameTitle { position:absolute; ... transform: translateY(100%) }` is hidden by default via the transform (it slides up from under the art).
- L323-327 `.gameCard:hover .gameTitle, .titlesAlwaysVisible .gameTitle { display:block; transform:translateY(0) }`. Specificity is (0,3,0) for the hover selector and (0,2,0) for always-visible.
- There is no focus-within or keyboardNav rule that reveals `.gameTitle`. L160/L176 (`body.controllerLayout|keyboardNav .gameCard:hover:not(:focus-within)`) only change the ring. Controller/keyboard focus therefore reveals the title only through `:hover` (the gamepad hover seed), which the new rule covers.
- L600 `.gameListItem .gameTitle` and L662 `.gameListItem .gameTitle span` are list view. Do not touch them.
- L551 `.gameCard .runner { display: none; }`: the store-name span is already hidden in grid, so there is nothing to decide there. `.gameListInfo` (the status label over the art) is a separate element and stays visible. That is deliberate, because it carries install/update state, not the name.
- No other stylesheet in `src/` or `public/` targets `.gameTitle` (grep-confirmed), so no theme overrides need handling.
- Accessibility: the cover `<img alt={title}>` inside the tile's Link keeps the accessible name when the title span is `display: none`.
- JS-side: the title is rendered in exactly one place, GameCard/index.tsx ~L645 (`className={classNames('gameTitle', ...)}`). Every grid mount (main grid, Favourites/Recently-Played, FocusRowStrip and its just-played hero) renders through GamesList, which carries the wrapper class. ConsoleMode is a separate screen with its own UI, so it is out of scope.

Prettier: `public/locales/en/translation.json` reports `"ignored": true` from `npx prettier --file-info` (re-confirmed at planning time), so it is left out of the prettier checks below. Every other written path is not ignored.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire the hideTitles preference and its Accessibility toggle (disables "Always show titles")</name>
  <files>src/common/types/electron_store.ts, src/common/types/storePolicy.ts, src/common/types/__tests__/storePolicy.test.ts, src/frontend/types.ts, src/frontend/state/ContextProvider.tsx, src/frontend/state/GlobalState.tsx, src/frontend/screens/Accessibility/index.tsx, public/locales/en/translation.json</files>
  <action>
Mirror `cleanTiles` (commit de6d16365) at every site listed in context, inserting `hideTitles` between `titlesAlwaysVisible` and `cleanTiles`:
- electron_store.ts: `hideTitles: boolean`.
- storePolicy.ts: add the literal `'hideTitles',` to the configStore allowlist. Without it the renderer's configStore.set is rejected. storePolicy.test.ts: add `expect(isAllowedStoreField('configStore', 'hideTitles')).toBe(true)` next to the cleanTiles assertion.
- frontend/types.ts: `hideTitles: boolean` and `setHideTitles: (value: boolean) => void`.
- ContextProvider.tsx defaults: `hideTitles: false,` and `setHideTitles: () => null,`.
- GlobalState.tsx: the state type field; init `hideTitles: configStore.get('hideTitles', false),`; a `setHideTitles` arrow method doing `configStore.set('hideTitles', value)` then `this.setState({ hideTitles: value })`; expose it in the context value the same way cleanTiles is exposed.
- Accessibility/index.tsx: destructure `hideTitles, setHideTitles`. Add `disabled={hideTitles}` to the existing `setTitlesAlwaysVisible` ToggleSwitch, and do NOT change its value or handler, so the stored titlesAlwaysVisible value is never mutated. Then insert a new `<span className="setting">` block between the titles-always-visible block and the clean-tiles block. Use the same `toggleWrapper`/`isRTL` label, `ToggleSwitch htmlId="setHideTitles"`, `value={hideTitles}`, `handleChange={() => { setHideTitles(!hideTitles) }}`, and title `t('accessibility.hide_titles', 'Hide titles (never show game names on tiles)')`.
- translation.json: in `accessibility`, between `titles_always_visible` and `clean_tiles`, add `"hide_titles": "Hide titles (never show game names on tiles)",`. Run `pnpm lint-translations` if the script exists and fix anything it reports.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx jest src/common/types/__tests__/storePolicy.test.ts && npx prettier --check src/common/types/electron_store.ts src/common/types/storePolicy.ts src/common/types/__tests__/storePolicy.test.ts src/frontend/types.ts src/frontend/state/ContextProvider.tsx src/frontend/state/GlobalState.tsx src/frontend/screens/Accessibility/index.tsx</automated>
  </verify>
  <done>Typecheck passes. `hideTitles` appears at all eight sites. The storePolicy test covers it and passes. The Accessibility screen shows "Hide titles" under "Always show titles in library", and the latter is disabled whenever Hide titles is on.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Apply the hideTitles class and remove the grid title in every state</name>
  <files>src/frontend/screens/Library/components/GamesList/index.tsx, src/frontend/screens/Library/components/GameCard/index.css, src/frontend/screens/Library/components/GameCard/__tests__/hideTitles.test.ts</files>
  <behavior>
    - The GamesList source destructures `hideTitles` from `useContext(ContextProvider)` and passes it to the wrapper `cx({...})`
    - The stylesheet has a rule with selector `.hideTitles .gameCard .gameTitle` declaring `display: none`
    - That rule appears AFTER the `.gameCard:hover .gameTitle, .titlesAlwaysVisible .gameTitle` rule in source order. It has the same (0,3,0) specificity as the hover selector and beats always-visible's (0,2,0), so source order is what makes it win on hover. Assert via indexOf on the comment-stripped CSS.
    - No `.hideTitles` selector in the stylesheet mentions `.gameListItem`, and none targets `.gameListInfo` (the status label stays)
    - Accessibility/index.tsx contains `disabled={hideTitles}` on the setTitlesAlwaysVisible ToggleSwitch and `setHideTitles(!hideTitles)` (a wiring check from Task 1, pinned here)
  </behavior>
  <action>
RED: create `GameCard/__tests__/hideTitles.test.ts` in the style of `cleanTiles.test.ts`: fs reads relative to `__dirname`, a comment-stripped copy of the CSS, and a docblock stating what it proves and what it cannot prove (rendered pixels and hover, which UAT covers). Assert the behaviors above. Run it with `npx jest` (not vitest) and confirm it fails.

GREEN:
- GamesList/index.tsx: add `hideTitles` to the ContextProvider destructure (L34) and to the wrapper `cx({...})` after `titlesAlwaysVisible`.
- GameCard/index.css: directly after the L323-327 hover/always-visible rule, add a commented block in house style (say WHY and cite quick 261101-tsq) with the single rule `.hideTitles .gameCard .gameTitle { display: none; }`. The comment must cover four points:
  - it is the third title state (never shown) beside hover-only and always-visible, for a console look;
  - it must stay after the reveal rule because it ties the hover selector's specificity;
  - it covers controller and keyboard focus, which only reveal through `:hover`;
  - it scopes to `.gameCard`, so list rows (`.gameListItem .gameTitle`, the name column) are untouched. `.gameListInfo` status and the already-hidden `.runner` are left alone, and the cover img alt keeps the accessible name.
  Do not use `!important`.
- Leave GameCard/index.tsx untouched. CSS alone hides the one title span in every grid mount.
- Run the whole GameCard `__tests__` dir so cleanTiles/geometry/cardVisibility stay green.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Library/components/GameCard/__tests__/ && npx tsc --noEmit && npx prettier --check src/frontend/screens/Library/components/GamesList/index.tsx src/frontend/screens/Library/components/GameCard/index.css src/frontend/screens/Library/components/GameCard/__tests__/hideTitles.test.ts</automated>
    <human-check>Restart `tauri dev`, then go to Settings > Accessibility. (1) Turn on "Always show titles": titles show on every tile. (2) Turn on "Hide titles": every tile title disappears, and "Always show titles" goes greyed and unclickable but stays checked. (3) Hover tiles, and navigate with keyboard arrows or a controller: no title slides up. (4) Check the Favourites/Recently-Played shelf and the FocusRowStrip: no titles. (5) Switch to list view: rows still show names. (6) Turn "Hide titles" off: titles are visible again because always-show was preserved. Then turn always-show off: titles are back to hover-only. (7) Combine with "Clean tiles": tiles are pure cover art. Restart the app: the setting persists.</human-check>
  </verify>
  <done>hideTitles.test.ts was seen failing, then passes. All existing GameCard tests pass. With the toggle on, no grid title shows in any state. List view and status labels are unchanged.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> configStore (sidecar store layer) | The renderer writes a new key through the storePolicy allowlist |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tsq-01 | Tampering | storePolicy.ts configStore allowlist | mitigate | Add exactly one literal key `'hideTitles'`; no wildcard/prefix widening; storePolicy.test.ts asserts it |
| T-tsq-02 | Information disclosure | hideTitles pref | accept | A UI boolean with no PII |
</threat_model>

<verification>
- `npx tsc --noEmit` is clean
- `npx jest src/common/types/__tests__/storePolicy.test.ts src/frontend/screens/Library/components/GameCard/__tests__/` is green
- Scoped prettier checks pass for every non-ignored path written (translation.json is prettier-ignored and omitted on purpose)
- `graphify update .` after the code changes
</verification>

<success_criteria>
- The toggle exists, defaults off, and persists
- On: no grid tile title in any state (rest, hover, focus, always-show on). "Always show titles" is disabled but its value is preserved
- Off: tiles are identical to before (no rule applies without the `.hideTitles` ancestor)
- List view, status labels, the bar and Clean tiles are unaffected
</success_criteria>

<output>
Create `.planning/quick/261101-tsq-hide-titles-toggle-never-show-tile-title/261101-tsq-SUMMARY.md` when done
</output>
