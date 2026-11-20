---
phase: quick-261101-tjv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/common/types/electron_store.ts
  - src/common/types/storePolicy.ts
  - src/frontend/types.ts
  - src/frontend/state/ContextProvider.tsx
  - src/frontend/state/GlobalState.tsx
  - src/frontend/screens/Accessibility/index.tsx
  - public/locales/en/translation.json
  - src/frontend/screens/Library/components/GamesList/index.tsx
  - src/frontend/screens/Library/components/GameCard/index.css
  - src/frontend/screens/Library/components/GameCard/__tests__/cleanTiles.test.ts
autonomous: true
requirements: [QUICK-261101-tjv]

must_haves:
  truths:
    - "A 'Clean tiles' toggle sits directly under 'Always show titles in library' on the Accessibility screen, and it is off by default"
    - "With the toggle on, grid tiles in the main library, the Favourites/Recently-Played shelves and the FocusRowStrip show no bottom bar: no play/install, update, settings or store-badge strip"
    - "With the toggle on, a tile is exactly its 3:4 art height. The art does not stretch, and no empty band is left where the bar used to be. The pre-reveal placeholder shrinks by the same amount."
    - "Clicking a clean tile still opens /gamepage/{runner}/{appName}, and the game can be launched from that page"
    - "List layout rows are unchanged in clean mode, because their .icons is the table's 'Action' column"
    - "Status label, update badge, Crossover/RunsForMe badges, the right-click context menu and the controller play/install shortcuts still work with the toggle on"
    - "The setting persists across app restarts"
  artifacts:
    - path: "src/frontend/state/GlobalState.tsx"
      provides: "cleanTiles state, setCleanTiles setter, configStore init"
      contains: "configStore.get('cleanTiles', false)"
    - path: "src/common/types/storePolicy.ts"
      provides: "cleanTiles allowed in configStore allowlist"
      contains: "'cleanTiles'"
    - path: "src/frontend/screens/Library/components/GameCard/index.css"
      provides: "clean-mode rules that zero the bar height and hide the grid bar"
      contains: ".cleanTiles .gameCard"
    - path: "src/frontend/screens/Library/components/GameCard/__tests__/cleanTiles.test.ts"
      provides: "source-text gate for wiring + CSS"
  key_links:
    - from: "src/frontend/screens/Accessibility/index.tsx"
      to: "GlobalState.setCleanTiles"
      via: "ContextProvider setter"
      pattern: "setCleanTiles\\(!cleanTiles\\)"
    - from: "src/frontend/screens/Library/components/GamesList/index.tsx"
      to: "GameCard/index.css .cleanTiles rules"
      via: "cx({... cleanTiles}) class on list wrapper"
      pattern: "cleanTiles"
---

<objective>
Add a "clean tile mode" preference (`cleanTiles`, default false). When it is on, the bottom button bar disappears from library grid tiles, and the user opens a game's page by clicking its tile and launches from there.

Purpose: this is the operator's request ("a toggle setting that removes the bottom 'button' bar. you need to click on the tile to take into game screen to launch"). The tile's cover is already a `<Link to=/gamepage/...>`, so no navigation code is needed. This task adds only the preference and the presentation.

Output: the preference wired end to end (store type, allowlist, context, GlobalState, Accessibility toggle, en string), the wrapper class plus CSS, and a source-text jest gate.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/frontend/screens/Library/components/GameCard/index.css
@src/frontend/screens/Library/components/GameCard/__tests__/gameCardControllerGeometry.test.ts

Precedent to mirror exactly is the `titlesAlwaysVisible` boolean pref. Every site was confirmed by grep at planning time:

- `src/common/types/electron_store.ts:40`: `titlesAlwaysVisible: boolean` in the configStore type
- `src/common/types/storePolicy.ts:99`: `'titlesAlwaysVisible',` in the `configStore: [...]` allowlist
- `src/frontend/types.ts:149-150`: `titlesAlwaysVisible: boolean` / `setTitlesAlwaysVisible: (value: boolean) => void`
- `src/frontend/state/ContextProvider.tsx:93-94`: `titlesAlwaysVisible: false,` / `setTitlesAlwaysVisible: () => null,`
- `src/frontend/state/GlobalState.tsx`: state type L195, init L546 `titlesAlwaysVisible: configStore.get('titlesAlwaysVisible', false),`, setter L627-630 (`configStore.set` + `this.setState`), context value L2184 `setTitlesAlwaysVisible: this.setTitlesAlwaysVisible,`. Check whether state fields are spread into the context value or listed one by one, and follow whatever titlesAlwaysVisible does.
- `src/frontend/screens/Accessibility/index.tsx`: destructure at L32, `<span className="setting">` + `<ToggleSwitch htmlId="setTitlesAlwaysVisible" ...>` at ~L220-235, label key `accessibility.titles_always_visible`
- `public/locales/en/translation.json:10`: `"titles_always_visible": "Always show titles in library",` inside the `accessibility` object
- `src/frontend/screens/Library/components/GamesList/index.tsx:34,70`: context destructure, and `cx({ gameList: layout === 'grid', gameListLayout: layout === 'list', firstLane, allTilesInColor, titlesAlwaysVisible })` on the wrapper div

CSS facts (GameCard/index.css):
- `.gameCard` height is content: art plus bar, via `--game-card-art-height` and `--game-card-bar-height: calc(35px + 2 * var(--space-xs-fixed))` (declared on `.gameCard`, ~L52-55). The pre-reveal placeholder reuses both properties.
- `.gameCard > .icons` (~L334) pins `block-size: var(--game-card-bar-height)`. `.gameListItem > .icons` is the list layout's Action column.
- `gameCardControllerGeometry.test.ts` parses this stylesheet and asserts the bar and placeholder geometry. Run it after the CSS edit.

Controller: `src/frontend/helpers/gamepad.ts` `playGame()`/`installGame()` call `parent.querySelector('.playIcon' | '.downIcon').click()`. `HTMLElement.click()` still fires on a `display: none` element, so hiding the bar with CSS (keeping the buttons in the DOM) keeps the controller A-button play/install shortcuts working. Do NOT unmount the `.icons` span in TSX.

Prettier: `public/locales/en/translation.json` reports `"ignored": true` from `npx prettier --file-info`, so it is left out of the prettier checks below. Every other written path is not ignored.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Wire the cleanTiles preference and its Accessibility toggle</name>
  <files>src/common/types/electron_store.ts, src/common/types/storePolicy.ts, src/frontend/types.ts, src/frontend/state/ContextProvider.tsx, src/frontend/state/GlobalState.tsx, src/frontend/screens/Accessibility/index.tsx, public/locales/en/translation.json</files>
  <action>
Mirror `titlesAlwaysVisible` at every site listed in context. Add `cleanTiles` directly after `titlesAlwaysVisible` at each one:
- electron_store.ts: `cleanTiles: boolean`.
- storePolicy.ts: add `'cleanTiles',` to the configStore allowlist right after `'titlesAlwaysVisible',`. Without this the renderer's configStore.set is rejected. Then check `src/common/types/__tests__/storePolicy.test.ts`: if it snapshots or counts the configStore list, update it; if it only spot-checks keys, add one `isAllowedStoreField('configStore', 'cleanTiles')` true assertion next to the `theme` one (~L152).
- frontend/types.ts: `cleanTiles: boolean` and `setCleanTiles: (value: boolean) => void`.
- ContextProvider.tsx defaults: `cleanTiles: false,` and `setCleanTiles: () => null,`.
- GlobalState.tsx: the state type field; init `cleanTiles: configStore.get('cleanTiles', false),`; a `setCleanTiles` arrow method that calls `configStore.set('cleanTiles', value)` and then `this.setState({ cleanTiles: value })`; expose `setCleanTiles: this.setCleanTiles` (and `cleanTiles` itself if state is listed field by field) in the context value.
- Accessibility/index.tsx: destructure `cleanTiles, setCleanTiles` from ContextProvider. Add a new `<span className="setting">` block immediately after the titles-always-visible block, using the same `toggleWrapper`/`isRTL` label, `ToggleSwitch htmlId="setCleanTiles"`, `value={cleanTiles}`, `handleChange={() => setCleanTiles(!cleanTiles)}`, and title `t('accessibility.clean_tiles', 'Clean tiles (hide the button bar; click a tile to open its page)')`.
- translation.json: in the `accessibility` object, after `titles_always_visible`, add `"clean_tiles": "Clean tiles (hide the button bar; click a tile to open its page)"`. Keep keys in whatever order the file already uses (if alphabetical, insert alphabetically). Run `pnpm lint-translations` if it exists and fix anything it reports.
Placement choice (Claude's discretion): the Accessibility screen, beside its sibling tile-appearance toggles (`allTilesInColor`, `titlesAlwaysVisible`). No dedicated library-appearance settings screen exists.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npx jest src/common/types/__tests__/storePolicy.test.ts && npx prettier --check src/common/types/electron_store.ts src/common/types/storePolicy.ts src/common/types/__tests__/storePolicy.test.ts src/frontend/types.ts src/frontend/state/ContextProvider.tsx src/frontend/state/GlobalState.tsx src/frontend/screens/Accessibility/index.tsx</automated>
  </verify>
  <done>Typecheck passes. `cleanTiles` appears at all seven sites. The storePolicy test passes and covers `cleanTiles`. The Accessibility screen renders the new toggle under "Always show titles in library", and the toggle persists through configStore.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Apply the cleanTiles class and hide the grid bar with no leftover gap</name>
  <files>src/frontend/screens/Library/components/GamesList/index.tsx, src/frontend/screens/Library/components/GameCard/index.css, src/frontend/screens/Library/components/GameCard/__tests__/cleanTiles.test.ts</files>
  <behavior>
    - The GamesList source destructures `cleanTiles` from ContextProvider and passes it to the wrapper `cx({...})` next to `titlesAlwaysVisible`
    - The stylesheet has a rule whose selector is `.cleanTiles .gameCard` and which sets `--game-card-bar-height` to `0` / `0px`
    - The stylesheet has a rule whose selector is `.cleanTiles .gameCard > .icons` and which declares `display: none`
    - No `.cleanTiles` selector in the stylesheet mentions `.gameListItem` (the list layout is out of scope)
    - GameCard/index.tsx still renders `className="icons"` without a `cleanTiles` condition, so the buttons stay in the DOM for gamepad.ts `.playIcon`/`.downIcon` clicks
  </behavior>
  <action>
RED: create `GameCard/__tests__/cleanTiles.test.ts` as a source-text gate in the same style as `gameCardControllerGeometry.test.ts`. Read the files with fs relative to `__dirname`, and keep the explanatory docblock style: what it proves, plus what it cannot prove (rendered pixels, which UAT covers). Assert the five behaviors above, then run it and confirm it fails.

GREEN:
- GamesList/index.tsx: add `cleanTiles` to the existing ContextProvider destructure (L34) and to the wrapper `cx({...})` (L70).
- GameCard/index.css: after the `.gameCard.gamepad > .icons > .svg-button` rule, add a commented block (house style: say WHY, and cite quick 261101-tjv) containing two rules:
  - `.cleanTiles .gameCard { --game-card-bar-height: 0px; }`: the card's content height and the pre-reveal placeholder both collapse to the 3:4 art, so the art keeps its ratio and no band is left behind.
  - `.cleanTiles .gameCard > .icons { display: none; }`: hides the whole bar, store badge included, because the operator asked for the bar gone. The buttons stay in the DOM, so the controller play/install shortcut in gamepad.ts still clicks them.
  - Scope rationale for the comment: the rules apply to every grid-card mount (main grid, Favourites/Recently-Played, the FocusRowStrip and its just-played hero, since all of them render through GamesList). They do not apply to `.gameListItem` rows, whose `.icons` is the list table's Action column under the 'Action' header. Hiding it there would break the table, and list rows are not tiles.
- Then run `gameCardControllerGeometry.test.ts`. If it now fails only because it finds a second `--game-card-bar-height` declaration, narrow that test's lookup to the base `.gameCard` rule (a clean-mode override is a new legitimate rule, not a regression), and say so in its docblock. Do not weaken any geometry assertion. If it fails for any other reason, fix the CSS instead.
- Leave GameCard/index.tsx untouched.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Library/components/GameCard/__tests__/ && npx tsc --noEmit && npx prettier --check src/frontend/screens/Library/components/GamesList/index.tsx src/frontend/screens/Library/components/GameCard/index.css src/frontend/screens/Library/components/GameCard/__tests__/cleanTiles.test.ts</automated>
    <human-check>Restart `tauri dev` (the sidecar is not rebuilt by dev). In Settings > Accessibility, turn on "Clean tiles". Expected: the library grid tiles lose the bottom bar, and each tile is just the cover art with no gap underneath. Clicking a tile opens the game page, and Play/Install there works. Right-click on a tile still shows the context menu. Switch to list view: rows still show the Action column. Turn the toggle off: the bar comes back. Check in at least the default theme and one light theme.</human-check>
  </verify>
  <done>cleanTiles.test.ts passes (and was seen failing first). The existing GameCard tests all pass. With the toggle on, grid tiles have no bar and no leftover gap. List rows are unchanged.</done>
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
| T-tjv-01 | Tampering | storePolicy.ts configStore allowlist | mitigate | Add exactly one literal key `'cleanTiles'`; no wildcard or prefix widening; storePolicy.test.ts asserts it |
| T-tjv-02 | Information disclosure | cleanTiles pref | accept | A UI boolean with no PII |
</threat_model>

<verification>
- `npx tsc --noEmit` is clean
- `npx jest src/common/types/__tests__/storePolicy.test.ts src/frontend/screens/Library/components/GameCard/__tests__/` is green
- Scoped prettier checks pass for every non-ignored path written
- `graphify update .` after the code changes
</verification>

<success_criteria>
- Toggle exists, defaults off and persists
- On: no bottom bar on any grid tile, tile height equals art height, and clicking a tile opens the game page where launch works
- Off: tiles are byte-for-byte the same as before (no rule applies without the `.cleanTiles` ancestor)
- List view unaffected; context menu and controller shortcuts intact
</success_criteria>

<output>
Create `.planning/quick/261101-tjv-clean-tile-mode-setting-hide-tile-button/261101-tjv-SUMMARY.md` when done
</output>
