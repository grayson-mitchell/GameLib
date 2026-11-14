---
phase: quick-261114-nxb
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GamePage/components/SteamUpdateButton.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateButton.test.tsx
  - src/frontend/screens/Game/GamePage/components/GameStatus.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss
  - src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts
  - .planning/todos/completed/2026-11-13-steam-update-button-and-size-line-on-game-page.md
autonomous: true
requirements: [TODO-2026-11-13-steam-update-button, 74-UAT-1]

must_haves:
  truths:
    - "An installed Steam game with a pending update shows an explicit Update button in the game page's action bar, beside Play"
    - "Clicking that button runs the existing handleUpdate (confirmSteamUpdate dialog -> updateGame), the same path the status-text affordance and DotsMenu use"
    - "The Steam update line (SteamUpdateInfo: 'Show update size' / size estimate / registered / unknown) renders in the action dock above the button row, not in the Info tab"
    - "The Update button is absent when there is no update, the game is not Steam, or an update/install/queue/uninstall/move/repair is in progress; disabled while launching or playing"
    - "For Steam the status line no longer carries the hidden '(Click to Update)' click target; other runners keep it unchanged"
    - "All new styling uses theme tokens only (no hex/rgb literals), so it survives every shipped theme"
  artifacts:
    - path: "src/frontend/screens/Game/GamePage/components/SteamUpdateButton.tsx"
      provides: "Visible Update button for Steam games with a pending update"
      exports: ["default"]
    - path: "src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateButton.test.tsx"
      provides: "Render/hide/disable/click gates for the button"
    - path: "src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx"
      provides: "Steam status line drops the click-to-update suffix; legendary keeps it"
    - path: "src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts"
      provides: "Source gates: SteamUpdateInfo lives in the dock, SteamUpdateButton follows MainButton"
  key_links:
    - from: "src/frontend/screens/Game/GamePage/index.tsx"
      to: "SteamUpdateButton"
      via: "<SteamUpdateButton gameInfo hasUpdate handleUpdate /> inside className=\"buttons\" right after <MainButton"
      pattern: "<SteamUpdateButton"
    - from: "src/frontend/screens/Game/GamePage/index.tsx"
      to: "SteamUpdateInfo"
      via: "mounted inside className=\"actionDock\" between <GameStatus and className=\"buttons\"; removed from the infoTab TabPanel"
      pattern: "<SteamUpdateInfo"
---

<objective>
Close todo `2026-11-13-steam-update-button-and-size-line-on-game-page` (origin: 74-UAT item 1).
When a Steam game has an update, the game page today only offers a "(Click to Update)" click
target buried in the italic status text, and the update size line sits in the Info tab. Add an
explicit Update button to the action dock next to Play, and move the existing update line
(`SteamUpdateInfo`) out of the Info tab into the dock so the size is visible on the main page.

Purpose: the update is discoverable without knowing the status text is clickable or opening a tab.
Output: new `SteamUpdateButton` component + tests, dock wiring, Steam status-line copy change,
extended dock source gates, todo moved to completed.

Reuse, do not re-derive:
- The update trigger is the existing `handleUpdate()` in `GamePage/index.tsx:368` (Steam branch ->
  `confirmSteamUpdate` dialog -> `updateGame`). `hasUpdate` is computed at `index.tsx:406`
  (`is_installed && gameUpdates?.includes(appName)`). Pass both straight through.
- The size line is the existing `SteamUpdateInfo` component (`components/SteamUpdateInfo.tsx`,
  Phase 74-12). It is MOVED, not duplicated (duplicating would double the
  `getSteamUpdateInfo` mount call). Its behaviour is unchanged: mount reads state with no
  authenticated traffic and the size is computed only on an explicit "Show update size" click
  (Phase 74 D-09/D-15, threat T-74-39). Do NOT make it auto-compute the size on mount — that would
  reverse a locked Phase 74 decision. "Shows its size" therefore means: the line with the
  "Show update size" control (or the already-computed estimate) is on the main page.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@.planning/todos/pending/2026-11-13-steam-update-button-and-size-line-on-game-page.md
@src/frontend/screens/Game/GamePage/components/GameStatus.tsx
@src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.tsx
@src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss
@src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx
@src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts

<interfaces>
GameStatus props (components/GameStatus.tsx):
  interface Props { gameInfo: GameInfo; handleUpdate: () => void; hasUpdate: boolean; progress: InstallProgress }
  Reads `const { runner, is, statusContext } = useContext(GameContext)`.
  The hasUpdate branch (around line 227) returns
  `<span onClick={async () => handleUpdate()} className="updateText">{`${t('status.installed')} - ${t('status.hasUpdates','New Version Available!')} (${t('status.clickToUpdate','Click to Update')})`}</span>`

GameContext `is` fields used (frontend/screens/Game/GameContext.tsx): installing, updating, queued,
uninstalling, moving, reparing (sic), launching, playing, notAvailable.

isStore(gameInfoOrRunner, 'steam') from 'common/storeCapabilities'.

Dock JSX today (GamePage/index.tsx ~590-617):
  <div className="actionDock">
    <GameStatus gameInfo progress handleUpdate hasUpdate />
    <div className="buttons">
      <MainButton gameInfo handlePlay handleInstall />
      <LaunchOptionSelector showTitle={false} />
      <span className="actionDockSpacer" aria-hidden="true" />
      <SettingsButton .../>
      <DotsMenu gameInfo handleUpdate />
    </div>
  </div>
Info tab today (~692-697):
  {isStore(gameInfo, 'steam') && is_installed && (<SteamUpdateInfo appName={appName} hasUpdate={hasUpdate} />)}

Locale: `gamepage.json` already has `button.update` = "Update" (reuse; no new catalog key).
Button classes (styles/_buttons.scss): `.button` + `.is-secondary` are token-driven
(`--secondary-button`, `--text-tertiary`, disabled -> `--disabled-button`). MainButton wraps
icon+label in `<span className="buttonWithIcon">`; the dock already styles `.buttonWithIcon > svg`.

Test harness (no jsdom in this jest project): call the component as a plain function after
mocking `react`'s useContext, `react-i18next` via `faithfulReactI18next()` from
`components/__tests__/faithfulTranslate.ts`, and walk the returned element tree
(see GameStatus.redistSpinner.test.tsx for the exact pattern incl. GameContext / Link / MUI mocks).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: SteamUpdateButton component and Steam status-line copy, with tests</name>
  <files>src/frontend/screens/Game/GamePage/components/SteamUpdateButton.tsx, src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateButton.test.tsx, src/frontend/screens/Game/GamePage/components/GameStatus.tsx, src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx</files>
  <behavior>
    SteamUpdateButton.test.tsx (same no-jsdom harness as GameStatus.redistSpinner.test.tsx; mock `@mui/icons-material` CloudDownload to a string/null):
    - steam, is_installed true, hasUpdate true, is {} -> returns a `button` element whose text is the catalog value of gamepage `button.update` ("Update"), className contains `button` and `is-secondary`, `type="button"`, not disabled.
    - invoking its onClick calls the handleUpdate mock exactly once.
    - hasUpdate false -> null.  runner 'legendary' (gameInfo.runner) with hasUpdate true -> null.  is_installed false -> null.
    - each of is.updating / is.queued / is.installing / is.uninstalling / is.moving / is.reparing true -> null.
    - is.launching true -> button present and disabled; is.playing true -> present and disabled.
    GameStatus.steamUpdate.test.tsx (copy the redistSpinner harness):
    - runner 'steam', hasUpdate true, is {} -> text contains the catalog "New Version Available!" and does NOT contain "Click to Update"; no element in the tree carries an onClick.
    - runner 'legendary', hasUpdate true -> text still contains "Click to Update" and the `updateText` span has an onClick that calls handleUpdate (regression guard for non-Steam runners).
  </behavior>
  <action>
    Create `SteamUpdateButton.tsx`: default-export a function component with props `{ gameInfo: GameInfo; hasUpdate: boolean; handleUpdate: () => void }`. Read `is` via `useContext(GameContext)` (import GameContext from '../../GameContext', same as GameStatus) and `const { t } = useTranslation('gamepage')`. Call hooks unconditionally before any early return. Return null unless `isStore(gameInfo, 'steam') && gameInfo.is_installed && hasUpdate` and none of is.updating / is.queued / is.installing / is.uninstalling / is.moving / is.reparing is true. Otherwise render a `<button type="button">` with className `button is-secondary steamUpdateButton`, `disabled={is.launching || is.playing}`, `onClick={() => handleUpdate()}`, children `<span className="buttonWithIcon"><CloudDownload />{t('button.update', 'Update')}</span>` (CloudDownload from '@mui/icons-material', matching SteamUpdateInfo's icon). Use `is-secondary` (Claude's discretion): Play stays the single success-coloured primary action and the class is token-driven so it survives every theme; do not add any colour CSS for it. No `autoFocus` (MainButton owns initial focus). Add a short header comment citing quick 261114-nxb / 74-UAT item 1.

    In `GameStatus.tsx`, change only the `hasUpdate` branch: when `isStore(runner, 'steam')` (isStore is already imported) return the plain string `${t('status.installed')} - ${t('status.hasUpdates', 'New Version Available!')}` with no span/onClick — the explicit SteamUpdateButton is now the Steam update control. Leave the existing clickable `updateText` span untouched for every other runner. Keep `handleUpdate` in Props (still used by non-Steam).

    Write both test files first (RED), then implement (GREEN). Do not add any catalog keys — `button.update`, `status.installed`, `status.hasUpdates` all exist in public/locales/en/gamepage.json.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateButton.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.redistSpinner.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.bottleWaiting.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/mainButtonCatalogDefaults.test.ts src/frontend/screens/Game/GamePage/components/__tests__/labelSuiteI18nCensus.test.ts && npx tsc --noEmit && npx eslint src/frontend/screens/Game/GamePage/components/SteamUpdateButton.tsx src/frontend/screens/Game/GamePage/components/GameStatus.tsx src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateButton.test.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx && npx prettier --check src/frontend/screens/Game/GamePage/components/SteamUpdateButton.tsx src/frontend/screens/Game/GamePage/components/__tests__/SteamUpdateButton.test.tsx src/frontend/screens/Game/GamePage/components/GameStatus.tsx src/frontend/screens/Game/GamePage/components/__tests__/GameStatus.steamUpdate.test.tsx</automated>
  </verify>
  <done>Both new suites pass and the existing GameStatus/catalog/census suites stay green; tsc, eslint and the scoped prettier check pass (all four paths confirmed not prettier-ignored via --file-info at planning time).</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: Wire the button and move the update line into the action dock; source gates; close the todo</name>
  <files>src/frontend/screens/Game/GamePage/index.tsx, src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss, src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts, .planning/todos/completed/2026-11-13-steam-update-button-and-size-line-on-game-page.md</files>
  <behavior>
    New `describe` in gamePageActionDock.test.ts (uses the file's existing comment-stripped `tsx`/`css` reads plus a read of `components/SteamUpdateInfo.scss` through `stripSourceComments`):
    - L7: inOrder(['className="actionDock"', '<GameStatus', '<SteamUpdateInfo', 'className="buttons"', '<MainButton', '<SteamUpdateButton', '<LaunchOptionSelector', 'className="actionDockSpacer"']).
    - L7: exactly one `<SteamUpdateInfo` and exactly one `<SteamUpdateButton` occurrence in index.tsx, and the `<SteamUpdateInfo` index is before `className="extraInfoWrapper"` (i.e. no longer in the Info tab).
    - L7: SteamUpdateInfo.scss contains no hex colour literal (/#[0-9a-f]{3,8}\b/i) and no rgb(/hsl( literal — theme-survival rule.
    - The existing L6 dock-order test must stay green unchanged.
  </behavior>
  <action>
    In `GamePage/index.tsx`: import `SteamUpdateButton from './components/SteamUpdateButton'` next to the existing `SteamUpdateInfo` import. Inside `className="actionDock"`, directly after `<GameStatus .../>` and before `<div className="buttons">`, render `{isStore(gameInfo, 'steam') && is_installed && (<SteamUpdateInfo appName={appName} hasUpdate={hasUpdate} />)}` and DELETE the same block from the `index="info"` TabPanel (move, not copy — one mount, one `getSteamUpdateInfo` call). Inside `className="buttons"`, directly after `<MainButton .../>`, render `<SteamUpdateButton gameInfo={gameInfo} hasUpdate={hasUpdate} handleUpdate={handleUpdate} />` (the component does its own Steam/state gating). Leave DotsMenu's update entry and everything else in the dock as is.

    In `SteamUpdateInfo.scss`, give the line its own layout now that it no longer inherits the Info-tab row styling: on `.steamUpdateInfo` add `display: flex; align-items: center; gap: var(--space-2xs); color: var(--neutral-05);` and size its svg with `font-size: var(--text-md)` (or `1.1em`) so the icon matches the status text. Tokens only — no hex/rgb (sketch-findings theme-survival rule: never hardcode the accent; existing `--brand-primary` / `--brand-primary-hover` / `--neutral-05` stay). Keep the existing nested rules. Update the file's header comment to note the dock placement (quick 261114-nxb).

    Add the L7 gates to `gamePageActionDock.test.ts` (TDD: add them first, watch them fail against the current index.tsx, then wire).

    Close the todo: `git mv .planning/todos/pending/2026-11-13-steam-update-button-and-size-line-on-game-page.md .planning/todos/completed/` and append a `## Resolution` section naming quick 261114-nxb, the new SteamUpdateButton, the SteamUpdateInfo move to the dock, the Steam status-line change, and that the size is still computed on an explicit "Show update size" click per Phase 74 D-09/D-15/T-74-39. Leave its frontmatter keys as they are (completed/ is exempt from the triage gate). When committing, stage explicit paths with `git add <file>` + `git commit` — do NOT use `gsd-sdk query commit`, which sweeps every dirty `.planning` file (the working tree has unrelated dirty planning and src files that must not be swept in). Afterwards run `graphify update .`.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Game/GamePage && npx tsc --noEmit && npx eslint src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts && npx prettier --check src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/Game/GamePage/components/SteamUpdateInfo.scss src/frontend/screens/Game/GamePage/__tests__/gamePageActionDock.test.ts && test ! -e .planning/todos/pending/2026-11-13-steam-update-button-and-size-line-on-game-page.md && pnpm planning-gates</automated>
    <human-check>Operator live check (not blocking this plan): `pnpm tauri:dev` (restart dev first if the sidecar changed — it did not here), open an installed Steam game with a pending update, confirm the Update button sits beside Play and the "Show update size" line sits above the button row; click "Show update size" then Update (confirm dialog appears). Switch through midnightMirage, gruvbox_dark and dracula and confirm the button and line stay legible.</human-check>
  </verify>
  <done>(The moved todo .md is prettier-ignored per `npx prettier --file-info`, so it is deliberately left out of the prettier check.) All GamePage suites pass including the new L7 gates and unchanged L6; tsc/eslint/scoped prettier/planning-gates pass; the todo lives only in completed/ with a Resolution section; the commit contains only this plan's files.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer -> sidecar IPC | `getSteamUpdateInfo` / `updateGame` — existing calls, no new IPC surface |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-nxb-01 | Information disclosure / DoS | SteamUpdateInfo mount moved to the dock | mitigate | Component moved unchanged: mount still issues no authenticated CM traffic, size only on explicit click (T-74-39 preserved); exactly-one-mount source gate in L7 prevents a duplicate fetch |
| T-nxb-02 | Tampering (accidental double action) | SteamUpdateButton | mitigate | Button hidden while updating/queued/installing/uninstalling/moving/repairing and disabled while launching/playing; click routes through the existing confirmSteamUpdate dialog |
</threat_model>

<verification>
- `npx jest src/frontend/screens/Game/GamePage` green.
- `npx tsc --noEmit` clean.
- Scoped `npx prettier --check` over every written path green.
- `pnpm planning-gates` green after the todo move.
</verification>

<success_criteria>
A Steam game with a pending update shows an Update button and its update-size line on the main game
page (action dock) without opening the Info tab, styled only with theme tokens so it holds in every
shipped theme; the todo is in `.planning/todos/completed/`.
</success_criteria>

<output>
Create `.planning/quick/261114-nxb-steam-game-page-update-button-and-update/261114-nxb-SUMMARY.md` when done
</output>
