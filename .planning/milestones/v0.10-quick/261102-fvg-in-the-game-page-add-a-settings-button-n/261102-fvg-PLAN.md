---
phase: quick-261102-fvg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Game/GamePage/components/SettingsButton.tsx
  - src/frontend/screens/Game/GamePage/components/__tests__/SettingsButton.test.tsx
  - src/frontend/screens/Game/GamePage/index.tsx
  - src/frontend/screens/Game/GamePage/index.css
autonomous: true
requirements:
  - QUICK-261102-fvg
must_haves:
  truths:
    - "On the game page of an installed game, a gear (settings) button sits immediately to the right of the Play button"
    - "Clicking it opens the same per-game settings modal the library card's gear / context-menu Settings opens (openGameSettingsModal)"
    - "It shows for every runner the library card shows it for, Steam included: installed, not uninstalling, not a Browser game"
    - "It is hidden for uninstalled, uninstalling and Browser-platform games"
    - "There is exactly one settings gear on the game page (the top-row copy is moved, not duplicated)"
  artifacts:
    - path: "src/frontend/screens/Game/GamePage/components/SettingsButton.tsx"
      provides: "Gear button; visibility condition mirroring GameCard showSettingsButton"
      contains: "openGameSettingsModal"
    - path: "src/frontend/screens/Game/GamePage/components/__tests__/SettingsButton.test.tsx"
      provides: "Visibility + click-routing specs"
  key_links:
    - from: "src/frontend/screens/Game/GamePage/index.tsx"
      to: "SettingsButton"
      via: "rendered inside <div className=\"buttons\"> directly after <MainButton>"
      pattern: "<SettingsButton"
    - from: "SettingsButton.tsx"
      to: "useGlobalState openGameSettingsModal"
      via: "onClick"
      pattern: "openGameSettingsModal\\(gameInfo\\)"
---

<objective>
Put a settings (gear) button next to the Play button on the game page, opening the existing
per-game settings modal.

Findings that shape this plan (planner-verified, executor does not need to re-discover):
- A `SettingsButton` component ALREADY exists (`components/SettingsButton.tsx`) and is rendered in
  the top row (`index.tsx:536`, inside `.topRowWapperInner`, next to `DotsMenu`). It calls
  `openGameSettingsModal(gameInfo)` from `frontend/state/GlobalStateV2` — the same entry point the
  library card uses. Reuse it; build no new settings surface.
- It returns null for `runner === 'steam'` — a guard from `d6fc9f507` (phase 03-03, D-04, "hide
  Settings") that predates the Steam engine/bridge work. The library card no longer has that guard:
  `GameCard/index.tsx:552` is `showSettingsButton = isInstalled && !isUninstalling && !isBrowserGame`
  and the context menu at `:463` uses the identical condition, both for Steam too. So from the
  library a Steam game's settings already open; only the game page hides it. Per the
  "mirror the existing menu's condition" instruction, the new button uses the GameCard condition
  exactly, which drops the Steam exclusion.
- Planner's call: **move** the button from the top row to beside Play, rather than adding a
  second one. Two identical gears on one page is redundant, and the caller should know this was
  a deliberate choice rather than something the request spelled out.
- i18n: reuse the existing `submenu.settings` key ("Settings", `translation` namespace) — the
  same key GameCard uses for the gear's title. **No edit to `public/locales/en/translation.json`**,
  so its unrelated uncommitted changes stay untouched.

Output: relocated, condition-corrected SettingsButton with a title/aria-label, styling beside Play,
and a new unit test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/frontend/screens/Game/GamePage/components/SettingsButton.tsx

<interfaces>
Current SettingsButton.tsx (whole file, 27 lines): imports `GameInfo` from 'common/types',
`SvgButton` from 'frontend/components/UI', `SettingsIcoAlt` from
'frontend/assets/settings_icon_alt.svg?react', `useGlobalState` from 'frontend/state/GlobalStateV2';
`const { openGameSettingsModal } = useGlobalState.keys('openGameSettingsModal')`; returns null when
`!gameInfo.is_installed || gameInfo.runner === 'steam'`; else
`<SvgButton onClick={() => openGameSettingsModal(gameInfo)} className="settings-icon"><SettingsIcoAlt /></SvgButton>`.

SvgButton (frontend/components/UI/SvgButton/index.tsx) props include `onClick`, `className`,
`title?: string`. It imports `./index.css` — jest (testEnvironment node, no CSS mapper; only
`\.svg\?react$` is mapped to `src/frontend/__mocks__/svgReactStub.tsx`) cannot load it, so tests
must `jest.mock('frontend/components/UI', ...)` with a stub SvgButton.

GamePage index.tsx facts:
- line 178: `const isBrowserGame = gameInfo?.install.platform === 'Browser'`
- line 197: `const isUninstalling = status === 'uninstalling'`
- line 536: `{!isBrowserGame && <SettingsButton gameInfo={gameInfo} />}` inside `.topRowWapperInner`
- lines ~580-586: `<div className="buttons"><MainButton gameInfo={gameInfo} handlePlay={handlePlay} handleInstall={handleInstall} /></div>`
- `t` (translation namespace) is already in scope in index.tsx.

index.css: `.gameConfigContainer .settings-icon` (line ~692, nested one level under
`.gameConfigContainer`, so it applies anywhere on the page) is a 44x44 rounded icon tile.
`.gameConfigContainer .mainInfo .buttons` (line ~324) is `display:flex; align-items:center`,
no `gap`; it already has `& > button { align-self: center; }`.

GameCard reference condition (GameCard/index.tsx:552):
`const showSettingsButton = isInstalled && !isUninstalling && !isBrowserGame`, title
`` `${t('submenu.settings')} (${title})` ``.

Test idiom: no jsdom/react-test-renderer. Call the component as a plain function and inspect the
returned element (see `components/__tests__/HumbleOriginInfo.test.tsx`, which mocks `react` and
`react-i18next` at module level).
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Make SettingsButton mirror the library card's condition, with a label, and test it</name>
  <files>src/frontend/screens/Game/GamePage/components/SettingsButton.tsx, src/frontend/screens/Game/GamePage/components/__tests__/SettingsButton.test.tsx</files>
  <behavior>
    - installed epic/gog/amazon/sideload/steam game, not uninstalling, platform not 'Browser' → returns an element whose onClick calls openGameSettingsModal with the same gameInfo
    - is_installed false → null
    - isUninstalling true → null
    - install.platform 'Browser' → null
    - the rendered element's title is the translated `submenu.settings` text, with `aria-label` set to the same string
  </behavior>
  <action>
    Write the test first (RED), then change the component (GREEN).

    Component: change Props to `{ gameInfo: GameInfo; isUninstalling?: boolean }`. Replace the
    null guard with the GameCard condition: return null when `!gameInfo.is_installed`, or
    `isUninstalling`, or `gameInfo.install?.platform === 'Browser'`. Remove the
    `runner === 'steam'` exclusion entirely (it is the stale 03-03 D-04 guard; the library card
    and context menu already open settings for Steam). Pulling the Browser check into the
    component makes the condition testable and lets the call site drop its `!isBrowserGame &&`
    wrapper. Add `useTranslation()` from react-i18next and pass `title={t('submenu.settings', 'Settings')}`
    to SvgButton. If SvgButton does not forward arbitrary props, add `aria-label` support to it
    only if that is a one-line, backwards-compatible change; otherwise rely on `title` and say so
    in the SUMMARY. Keep `className="settings-icon"` and the `SettingsIcoAlt` icon; it is the
    gear the page already uses. Call `useGlobalState.keys(...)` and `useTranslation()` before
    the early return, so hook order stays stable.

    Test (`__tests__/SettingsButton.test.tsx`): mock `frontend/state/GlobalStateV2` (default
    export object with `keys: () => ({ openGameSettingsModal: mockOpen })`), mock `react-i18next`
    (`useTranslation: () => ({ t: (k, fallback) => fallback ?? k })`), and mock
    `frontend/components/UI` with a stub `SvgButton` function component, because the real one
    imports CSS. Build a minimal GameInfo fixture cast as GameInfo (`app_name`, `runner`,
    `title`, `is_installed`, `install: { platform }`). Call `SettingsButton({...})` directly and
    assert on the returned element's `props` (onClick invocation → `mockOpen` called with the
    fixture; `props.title`). Use `it.each` over runners ['legendary','gog','nile','sideload','steam']
    for the visible case, which pins that the Steam exclusion is gone. Check the runner literals
    against the `Runner` type in `common/types`.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/Game/GamePage/components/__tests__/SettingsButton.test.tsx && npx prettier --check src/frontend/screens/Game/GamePage/components/SettingsButton.tsx src/frontend/screens/Game/GamePage/components/__tests__/SettingsButton.test.tsx && ! grep -v '^\s*//' src/frontend/screens/Game/GamePage/components/SettingsButton.tsx | grep -q "=== 'steam'"</automated>
  </verify>
  <done>New suite passes, Steam is included in the visible case, uninstalled/uninstalling/Browser all return null, and both files pass prettier.</done>
</task>

<task type="auto">
  <name>Task 2: Move the button from the top row to beside Play, and style the spacing</name>
  <files>src/frontend/screens/Game/GamePage/index.tsx, src/frontend/screens/Game/GamePage/index.css</files>
  <action>
    index.tsx: delete the line `{!isBrowserGame && <SettingsButton gameInfo={gameInfo} />}` from
    `.topRowWapperInner`, leaving DotsMenu alone there. Inside `<div className="buttons">`,
    render `<SettingsButton gameInfo={gameInfo} isUninstalling={isUninstalling} />` directly
    AFTER `<MainButton ... />`. DOM order matters: gamepad focus walks document order, so Play
    stays first and the gear follows it. Leave the `SettingsButton` import in place. If
    `isBrowserGame` has no other use after the edit, check before removing it (grep the file).
    It is probably still used elsewhere, so delete it only if lint flags it as unused.

    index.css: inside the existing `.buttons { ... }` block (around line 324), add a
    `& > .settings-icon` rule with `margin-inline-start: var(--space-xs);` and `flex-shrink: 0;`,
    so the 44px tile sits beside Play with a gap and does not get squeezed. Do not add `gap`
    to `.buttons` itself, because that would change MainButton's existing internal layout. Use
    logical properties (margin-inline-start), as the surrounding rules do, for RTL.

    Then run the GamePage component suites to confirm nothing else depended on the top-row
    placement, and `pnpm lint` (or `npx eslint`) on the touched files.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && npx jest src/frontend/screens/Game/GamePage && npx eslint src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/Game/GamePage/components/SettingsButton.tsx && npx tsc --noEmit -p . 2>&1 | grep -E "GamePage/(index|components/SettingsButton)" ; test $(grep -c "<SettingsButton" src/frontend/screens/Game/GamePage/index.tsx) -eq 1 && npx prettier --check src/frontend/screens/Game/GamePage/index.tsx src/frontend/screens/Game/GamePage/index.css</automated>
    <human-check>Restart `tauri dev`, then open an installed Steam game and an installed Epic or GOG game. Each should show a gear immediately right of Play, aligned with it, which opens that game's settings modal. An uninstalled game should show no gear, and the top row should have no gear left.</human-check>
  </verify>
  <done>Exactly one `<SettingsButton` in index.tsx, inside `.buttons` after MainButton. All GamePage jest suites pass. No tsc errors in the touched files. Prettier is clean on both paths.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| none new | Pure renderer UI relocation; reuses the existing openGameSettingsModal state action. No IPC, input or data path changes. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-fvg-01 | Elevation | SettingsButton for Steam games | accept | Opens the same modal the library card already opens for Steam; no new capability is exposed |
</threat_model>

<verification>
- `npx jest src/frontend/screens/Game/GamePage` green
- One `<SettingsButton` render site, inside `.buttons`
- `git diff --stat` shows only the four files in files_modified, and `public/locales/en/translation.json` is not staged
</verification>

<success_criteria>
The game page shows a gear beside Play for installed, non-Browser games of every runner, Steam
included. Clicking it opens the existing per-game settings modal. The top-row duplicate is gone,
and a unit test pins both the visibility condition and the click routing.
</success_criteria>

<output>
Create `.planning/quick/261102-fvg-in-the-game-page-add-a-settings-button-n/261102-fvg-SUMMARY.md` when done
</output>
