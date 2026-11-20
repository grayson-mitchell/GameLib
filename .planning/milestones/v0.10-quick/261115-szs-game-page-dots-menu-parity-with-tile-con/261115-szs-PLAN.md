---
phase: quick-261115-szs
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GameSubMenu/index.tsx
  - src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts
autonomous: true
requirements: [QUICK-261115-szs]

must_haves:
  truths:
    - "On the game page three-dot menu, the user can add the game to favourites, and when it is already a favourite the item reads Remove From Favourites and removes it"
    - "On the game page three-dot menu, the user can hide the game, and when it is already hidden the item reads Unhide Game and unhides it"
    - "On an installed, non-browser game that is not uninstalling, the three-dot menu shows Logs, which opens the same logs modal as the library tile"
    - "Edit Game (or Edit App/Game for sideloads) appears in the three-dot menu for uninstalled games too, not only installed ones"
    - "Clicking any of the new items closes the dots menu, as sibling items do"
    - "Remove From Recent is NOT in the game page menu"
  artifacts:
    - path: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      provides: "Favourites toggle, Hide toggle, Logs item, ungated Edit Game"
      contains: "openGameLogsModal(gameInfo)"
    - path: "src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts"
      provides: "Source-text guard pinning the four parity items"
  key_links:
    - from: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      to: "frontend/state/accountHooks"
      via: "useHiddenGames / useFavouriteGames (same source as GameCard)"
      pattern: "useHiddenGames\\(\\)|useFavouriteGames\\(\\)"
    - from: "src/frontend/screens/Game/GameSubMenu/index.tsx"
      to: "useUiState openGameLogsModal"
      via: "useUiState.keys('openGameCategoriesModal', 'openGameLogsModal')"
      pattern: "openGameLogsModal"
---

<objective>
Give the game page three-dot menu (`GameSubMenu`, mounted by `GamePage/components/DotsMenu.tsx`) parity with the library tile right-click menu for four items: Favourites toggle, Hide toggle, Logs, and an always-visible Edit Game.

Purpose: the game page currently has no way to favourite, hide, or open logs for a game, and hides Edit Game for uninstalled games, while the tile offers all of these.
Output: edited `GameSubMenu/index.tsx` plus a new source-text guard test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/frontend/screens/Game/GameSubMenu/index.tsx
@src/frontend/screens/Game/GameSubMenu/__tests__/GameSubMenuEosDeclineCallSiteGuard.test.ts

Scope is locked by the user. NOT adding: Remove From Recent; Play/Stop/Update/Install/Cancel/Queue/Settings/Details (already elsewhere on the game page). Do not add these.

WORKING-TREE HAZARD: the tree has unrelated uncommitted edits under `src/frontend/screens/Game/GamePage/` (GameStatus.tsx, SteamUpdateInfo.tsx, index.tsx, and their tests) and assorted `.planning/` files. Do NOT touch, format, or stage any of them. Commit with explicit `git add <the two paths in files_modified>` then `git commit` — never `git add -A`/`.`, never `gsd-sdk query commit` (it sweeps dirty .planning files).

<interfaces>
How GameCard (`src/frontend/screens/Library/components/GameCard/index.tsx`) does it — reuse exactly:

- Imports: `import { useHiddenGames, useFavouriteGames } from 'frontend/state/accountHooks'`; types `FavouriteGame, HiddenGame` from `common/types`; icons `Description, Favorite, FavoriteBorder, Visibility, VisibilityOff` from `@mui/icons-material`.
- `const hiddenGames = useHiddenGames()` / `const favouriteGames = useFavouriteGames()`
- `isHiddenGame = useMemo(() => !!hiddenGames.list.find((hiddenGame: HiddenGame) => hiddenGame.appName === appName), [hiddenGames, appName])`; `isFavouriteGame` identical over `favouriteGames.list` with `FavouriteGame`.
- `openGameLogsModal` comes from `useUiState.keys(..., 'openGameLogsModal', ...)`.
- `isBrowserGame = gameInfo.install.platform === 'Browser'`
- Tile item calls/labels (GameCard's `t` is `useTranslation('gamepage')`, same namespace as GameSubMenu's `t`; all keys exist in `public/locales/en/gamepage.json`):
  - `t('submenu.logs', 'Logs')` -> `openGameLogsModal(gameInfo)`, icon `<Description />`, show `isInstalled && !isUninstalling && !isBrowserGame`
  - `t('button.hide_game', 'Hide Game')` -> `hiddenGames.add(appName, title)`, `<VisibilityOff />`, show `!isHiddenGame`
  - `t('button.unhide_game', 'Unhide Game')` -> `hiddenGames.remove(appName)`, `<Visibility />`, show `isHiddenGame`
  - `t('button.add_to_favourites', 'Add To Favourites')` -> `favouriteGames.add(appName, title)`, `<Favorite />`, show `!isFavouriteGame`
  - `t('button.remove_from_favourites', 'Remove From Favourites')` -> `favouriteGames.remove(appName)`, `<FavoriteBorder />`, show `isFavouriteGame`

What GameSubMenu already has in scope (`src/frontend/screens/Game/GameSubMenu/index.tsx`):
- Props include `appName`, `isInstalled`, `title`, `gameInfo`, `runner`.
- Line 9: `import { useCallback, useContext, useEffect, useState } from 'react'` (no useMemo yet).
- Line 92: `const { openGameCategoriesModal } = useUiState.keys('openGameCategoriesModal')`
- Line 93: `const { is, gameSettings } = useContext(GameContext)` — `is.uninstalling: boolean` exists (frontend/types.ts:335).
- Line 114: `isSideloaded`; line 115: `isSteam`.
- Icons are imported with the `X as XIcon` alias style (lines 38-53).
- Line 520-530: `{isInstalled && (<> <button onClick={async () => handleEdit()} ...><EditIcon />{isSideloaded ? t('button.sideload.edit', 'Edit App/Game') : t('button.edit-game', 'Edit Game')}</button>{' '} ...shortcuts... </>)}`
- Every menu item is `<button onClick={...} className="link button is-text is-link buttonWithIcon"><SomeIcon />{label}</button>`; DotsMenu closes the menu on any button click inside `.gameTools`, so the same element/class keeps that behaviour.
- `GameSubMenu` cannot be rendered under the node-environment Frontend jest project (no jsdom); the existing `__tests__` guards are source-text gates (read file, collapse whitespace, assert shape). Follow that pattern.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Source-text guard for the four parity items (RED)</name>
  <files>src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts</files>
  <behavior>
    - Favourites: collapsed source contains `useFavouriteGames()`, `favouriteGames.add(appName, title)`, `favouriteGames.remove(appName)`, `'button.add_to_favourites'`, `'button.remove_from_favourites'`, `<FavoriteIcon />`, `<FavoriteBorderIcon />`.
    - Hide: contains `useHiddenGames()`, `hiddenGames.add(appName, title)`, `hiddenGames.remove(appName)`, `'button.hide_game'`, `'button.unhide_game'`, `<VisibilityOffIcon />`, `<VisibilityIcon />`.
    - Logs: contains `openGameLogsModal(gameInfo)` and `'submenu.logs'`, and matches a regex asserting the Logs button is wrapped in a conditional containing `isInstalled`, `!is.uninstalling` and `!isBrowserGame` (tolerant of whitespace, e.g. `/\{\s*isInstalled\s*&&\s*!is\.uninstalling\s*&&\s*!isBrowserGame\s*&&\s*\(\s*<button[^>]*onClick=\{\s*\(\)\s*=>\s*openGameLogsModal\(gameInfo\)/`).
    - Edit Game ungated: the index of the `handleEdit()` button (`onClick={async () => handleEdit()}` or `onClick={() => handleEdit()}`) is LESS than the index of the first `{isInstalled && (` occurrence (proving it moved out of the installed cluster) and the `button.sideload.edit` label branch is still present. Use positive `toBeLessThan` / `toBeGreaterThan(-1)` assertions, not bare negative regexes.
    - Each of the new items' onClick appears inside a `className="link button is-text is-link buttonWithIcon"` button (assert via regex over the collapsed source for each call).
    - Remove From Recent is absent: `expect(source.includes('remove_from_recent')).toBe(false)` — pair with a positive assertion in the same test that `source.length` is greater than 1000 so the read is proven non-empty.
  </behavior>
  <action>Create a new jest test file following the shape of `GameSubMenuEosDeclineCallSiteGuard.test.ts`: a header doc comment explaining it is a source-text gate (no jsdom in the Frontend jest project) for quick task 261115-szs, read `join(__dirname, '..', 'index.tsx')` with `readFileSync`, and a local `collapse()` that replaces `/\s+/g` with a single space. Write one `describe('GameSubMenu tile-menu parity (quick-261115-szs)')` with one `it` per behavior bullet above. Make the regexes whitespace-tolerant so a Prettier re-wrap cannot defeat them. Run it and confirm it FAILS against the current source (RED) before Task 2.</action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts; test $? -ne 0 && echo RED-OK; npx prettier --file-info src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts && npx eslint src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts</automated>
  </verify>
  <done>Test file exists, is prettier- and eslint-clean, and fails against the unmodified GameSubMenu (prints RED-OK).</done>
</task>

<task type="auto">
  <name>Task 2: Add Favourites / Hide / Logs items and ungate Edit Game (GREEN), then commit</name>
  <files>src/frontend/screens/Game/GameSubMenu/index.tsx</files>
  <action>
Edit `GameSubMenu/index.tsx` only, mirroring GameCard (see interfaces):

1. Imports: add `useMemo` to the react import; add `FavouriteGame, HiddenGame` to the existing `common/types` import; add `import { useHiddenGames, useFavouriteGames } from 'frontend/state/accountHooks'`; add to the `@mui/icons-material` block, alphabetically and in the existing alias style, `Description as DescriptionIcon`, `Favorite as FavoriteIcon`, `FavoriteBorder as FavoriteBorderIcon`, `Visibility as VisibilityIcon`, `VisibilityOff as VisibilityOffIcon`.

2. Hooks: change line 92 to `const { openGameCategoriesModal, openGameLogsModal } = useUiState.keys('openGameCategoriesModal', 'openGameLogsModal')`. Add `const hiddenGames = useHiddenGames()` and `const favouriteGames = useFavouriteGames()` next to it. Near `isSideloaded`/`isSteam` add `const isBrowserGame = gameInfo.install.platform === 'Browser'` and the `isHiddenGame` / `isFavouriteGame` useMemos copied from GameCard (same deps `[hiddenGames, appName]` / `[favouriteGames, appName]`). All hooks must be unconditional, before any early return.

3. JSX, inside `<div className="submenu">`, immediately before the `{isInstalled && (` cluster at ~line 520:
   a. Move the Edit Game button OUT of that cluster to here, unconditional, keeping its `onClick={async () => handleEdit()}`, `<EditIcon />`, and the `isSideloaded ? t('button.sideload.edit', 'Edit App/Game') : t('button.edit-game', 'Edit Game')` label branch unchanged. Delete it (and its trailing `{' '}`) from inside the cluster so it renders exactly once.
   b. Logs: `{isInstalled && !is.uninstalling && !isBrowserGame && (<button onClick={() => openGameLogsModal(gameInfo)} className="link button is-text is-link buttonWithIcon"><DescriptionIcon />{t('submenu.logs', 'Logs')}</button>)}`.
   c. Hide toggle: two conditional buttons (one for `!isHiddenGame` with `hiddenGames.add(appName, title)`, `<VisibilityOffIcon />`, `t('button.hide_game', 'Hide Game')`; one for `isHiddenGame` with `hiddenGames.remove(appName)`, `<VisibilityIcon />`, `t('button.unhide_game', 'Unhide Game')`) — two buttons keeps each call literal greppable and matches the tile's two items.
   d. Favourites toggle: same two-button shape — `!isFavouriteGame` → `favouriteGames.add(appName, title)`, `<FavoriteIcon />`, `t('button.add_to_favourites', 'Add To Favourites')`; `isFavouriteGame` → `favouriteGames.remove(appName)`, `<FavoriteBorderIcon />`, `t('button.remove_from_favourites', 'Remove From Favourites')`.
   Every new element is a `<button>` with `className="link button is-text is-link buttonWithIcon"` so DotsMenu's close-on-click keeps working. Add a short comment `{/* quick-261115-szs: parity with the library tile context menu (GameCard items) */}` above the block. Do NOT add Remove From Recent or any Play/Stop/Update/Install/Cancel/Queue/Settings/Details item.

4. Run the guard (now GREEN), the whole GameSubMenu test folder, typecheck, eslint, prettier. Then commit ONLY the two files: `git add src/frontend/screens/Game/GameSubMenu/index.tsx src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts && git commit -m "feat(quick-261115-szs): game page dots menu parity with tile context menu"` (with the Co-Authored-By trailer). Confirm afterwards with `git status --short src/frontend/screens/Game/GamePage/` that the pre-existing GamePage edits are still unstaged/uncommitted and unchanged. Run `graphify update .` after the code change.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/Game/GameSubMenu && npx tsc --noEmit -p . && npx eslint src/frontend/screens/Game/GameSubMenu/index.tsx src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts && npx prettier --file-info src/frontend/screens/Game/GameSubMenu/index.tsx | grep -Eq '"ignored":[[:space:]]*false' && npx prettier --check src/frontend/screens/Game/GameSubMenu/index.tsx src/frontend/screens/Game/GameSubMenu/__tests__/tileMenuParity.test.ts && git show --stat --format= HEAD | grep -c 'GamePage/' | grep -qx 0 && echo COMMIT-SCOPED-OK</automated>
  </verify>
  <done>All GameSubMenu tests pass (including the new guard), tsc clean, eslint and prettier clean on both paths; HEAD commit contains only the two files; GamePage working-tree edits untouched.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer UI -> library state | Menu clicks call existing store actions with the game's own appName/title |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-szs-01 | Tampering | GameSubMenu hide/favourite calls | accept | Reuses the exact store actions the library tile already exposes; no new IPC, no new input surface |
| T-szs-02 | Information disclosure | Logs item | accept | Opens the existing logs modal already reachable from the tile; same isInstalled/!uninstalling/!browser gate |
</threat_model>

<verification>
- `npx jest src/frontend/screens/Game/GameSubMenu` green.
- `npx tsc --noEmit -p .` clean.
- eslint + scoped prettier clean on the two changed files.
- HEAD commit touches only the two files in files_modified.
</verification>

<success_criteria>
- Game page dots menu shows Add/Remove Favourites and Hide/Unhide toggles for every game, Logs for installed non-browser games not uninstalling, and Edit Game for installed and uninstalled games.
- No Remove From Recent, no duplicated Play/Install/etc. items.
- Unrelated GamePage working-tree edits untouched.
</success_criteria>

<output>
Create `.planning/quick/261115-szs-game-page-dots-menu-parity-with-tile-con/261115-szs-SUMMARY.md` when done
</output>
