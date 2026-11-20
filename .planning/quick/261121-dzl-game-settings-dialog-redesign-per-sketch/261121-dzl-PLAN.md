---
phase: quick-261121-dzl
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/components/UI/Dialog/components/Dialog.tsx
  - src/frontend/components/UI/Dialog/index.css
  - src/frontend/components/UI/Dialog/__tests__/dialogHeaderSlot.test.tsx
  - src/frontend/screens/Settings/components/SettingsModal/index.tsx
  - src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
  - src/frontend/screens/Settings/components/SettingsModal/index.scss
  - src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx
  - src/frontend/hooks/useSettingsContext.ts
  - src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/screens/Settings/sections/GamesSettings/index.scss
  - src/frontend/screens/Settings/sections/GamesSettings/tabs.ts
  - src/frontend/screens/Settings/sections/GamesSettings/SettingsCard.tsx
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/enginePlacement.test.ts
  - src/frontend/screens/Settings/components/EngineOverride.tsx
  - src/frontend/screens/Settings/components/SteamOverlayOverride.tsx
  - src/frontend/screens/Settings/components/LaunchWithoutSteam.tsx
  - src/frontend/screens/Settings/components/AlternativeExe.tsx
  - src/frontend/screens/Settings/components/BeforeLaunchScriptPath.tsx
  - src/frontend/screens/Settings/components/AfterLaunchScriptPath.tsx
  - src/frontend/screens/Settings/components/WrappersTable.tsx
  - src/frontend/screens/Settings/components/EnvVariablesTable.tsx
  - src/frontend/screens/Settings/components/VerboseLogs.tsx
  - src/frontend/screens/Settings/components/OfflineMode.tsx
  - src/frontend/screens/Settings/components/LauncherArgs.tsx
  - src/frontend/screens/Settings/components/PreferedLanguage.tsx
  - src/frontend/screens/Settings/components/ShowFPS.tsx
  - src/frontend/screens/Settings/components/__tests__/EngineOverride.test.tsx
  - src/frontend/screens/Settings/components/__tests__/EngineOverride.save.test.tsx
  - src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx
  - src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx
  - src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts
  - src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx
  - src/backend/storeManagers/legendary/launchFailure.ts
  - src/backend/launcher.ts
  - public/locales/en/gamelib.json
  - .planning/todos/pending/2026-11-21-game-settings-close-overlaps-info-control.md
  - .planning/todos/pending/2026-11-21-advanced-settings-twisties-to-headings.md
  - .planning/todos/completed/2026-11-21-game-settings-close-overlaps-info-control.md
  - .planning/todos/completed/2026-11-21-advanced-settings-twisties-to-headings.md
autonomous: true
requirements:
  - SKETCH-009-B
  - TODO-2026-11-21-game-settings-close-overlaps-info-control
  - TODO-2026-11-21-advanced-settings-twisties-to-headings

estimate:
  tokens: 170000
  raw_tokens: 170000
  tasks: 3
  confidence: low

must_haves:
  truths:
    - "Sketch 009 #1/#9: the per-game settings dialog opens with a header row holding a thumbnail of the game's art, the game title alone (no parenthesised type, clamped to two lines) and the close X in that same row; no X floats over the content, and gamepad back still closes the dialog through the single close button"
    - "Sketch 009 #10: the header subline reads 'Game settings · Steam App ID 576770 · Saved automatically' for a Steam game ('App ID' for other stores), flashes 'Saved' for about a second after a setting write actually goes out, shows 'Log' / 'Categories' with no Saved indicator for those modal types, and the old per-game footer line is gone"
    - "Sketch 009 #11: the settings dialog keeps its fixed 80% height and the header stays visible while the tab content scrolls"
    - "Sketch 009 #4/#8/#12: a macOS Windows-engine game opens on Run with tabs ordered Run, Wine, Winetricks, Advanced; Linux and Windows keep today's order and starting tab; the Wine and Winetricks labels come from t(); the remembered tab is stored under runner-app_name-setting_tab and an old app_name-setting_tab value is migrated once"
    - "Sketch 009 #2/#7: Run shows Launch and (macOS Steam titles only) Steam cards; Advanced shows Launch target, Scripts, Wrappers & environment, Diagnostics & updates cards; Wine shows a Wine engine card; a card whose fields all render nothing is hidden; the Wine-tab hint and the Default-page hint are neutral accent-tinted notes while the Legacy tab keeps its danger banner"
    - "Sketch 009 #3/#5: Engine and Steam overlay are plain always-visible selects with (i) help and no '(advanced)' disclosure; Launch without Steam lists its losses once in a visible description and, when on for a Steam-API/unchecked game, adds one amber theme-token warning that states the risk only; the DRM state stays disabled with (i)"
    - "Sketch 009 #6: Alternative executable, Before launch, After exit, Wrapper commands, Environment variables, Verbose logs, Ignore game updates, Run offline, Launch arguments, Game language and Show FPS (Stats overlay on macOS) use noun labels with explanatory text in an icon-only (i)"
    - "Both 2026-11-21 todos are in .planning/todos/completed/ with resolved/resolution frontmatter and a Resolution section"
  artifacts:
    - path: src/frontend/components/UI/Dialog/components/Dialog.tsx
      provides: "opt-in header slot that renders the close button in a header row; every other consumer unchanged"
      contains: "header?: ReactNode"
    - path: src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx
      provides: "thumbnail, clamped title, type/App ID/Saved subline"
      contains: "settings.modal.savedAutomatically"
    - path: src/frontend/hooks/useSettingsContext.ts
      provides: "createSettingSetter onWrite callback fired only when a write is sent"
      contains: "onWrite"
    - path: src/frontend/screens/Settings/sections/GamesSettings/tabs.ts
      provides: "getStartingTab, settingsTabOrder, settingTabKey, readRememberedTab, rememberTab, initialSettingsTab"
      contains: "-setting_tab"
    - path: src/frontend/screens/Settings/sections/GamesSettings/SettingsCard.tsx
      provides: "bordered card with a heading"
      contains: "settingsCard__title"
    - path: src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts
      provides: "starting-tab, tab-order and tab-key migration tests"
      contains: "261121-dzl"
    - path: src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts
      provides: "source gate for the noun labels and their (i) help"
      contains: "261121-dzl"
    - path: .planning/todos/completed/2026-11-21-game-settings-close-overlaps-info-control.md
      provides: "closed todo"
      contains: "## Resolution"
    - path: .planning/todos/completed/2026-11-21-advanced-settings-twisties-to-headings.md
      provides: "closed todo"
      contains: "## Resolution"
  key_links:
    - from: src/frontend/screens/Settings/components/SettingsModal/index.tsx
      to: src/frontend/components/UI/Dialog/components/Dialog.tsx
      via: "header={<SettingsModalHeader ... />} prop; Dialog renders it with the close IconButton in .Dialog__header"
      pattern: "header=\\{"
    - from: src/frontend/screens/Settings/components/SettingsModal/index.tsx
      to: src/frontend/hooks/useSettingsContext.ts
      via: "useSettingsContext({ ..., onSettingWritten }) -> createSettingSetter({ ..., onWrite }) -> flash state"
      pattern: "onSettingWritten"
    - from: src/frontend/screens/Settings/sections/GamesSettings/index.tsx
      to: src/frontend/screens/Settings/sections/GamesSettings/tabs.ts
      via: "settingsTabOrder({ runFirst: isMacEngineGame, ... }), initialSettingsTab(readRememberedTab(localStorage, gameInfo), ...), rememberTab"
      pattern: "settingsTabOrder"
---

<objective>
Implement the winning variant B of sketch 009 (game settings dialog) item by item, exactly as locked in `.planning/sketches/009-game-settings-dialog/README.md` "Outcome": #1 X in a header row beside a thumbnail, #2 neutral notes, #3 no twisties for Engine / Steam overlay, #4 Run first for macOS engine games, #5 Launch without Steam copy and amber warning, #6 noun labels with (i), #7 bordered cards, #8 Wine/Winetricks through t(), #9 title alone, #10 header subline with Saved flash (footer removed), #11 fixed 80% height, #12 runner-keyed remembered tab.

Purpose: the 2026-11-21 UX review of SettingsModal -> GamesSettings found the X overlapping content, danger fills on neutral hints, controls hidden behind "(advanced)" twisties, Mac engine games opening on a near-empty Wine tab, duplicated copy, mixed label grammar, an ungrouped Advanced tab and a footer you only see after scrolling. This closes todos 2026-11-21-game-settings-close-overlaps-info-control and 2026-11-21-advanced-settings-twisties-to-headings.

Output: an opt-in Dialog header slot, a B-style SettingsModal header with a real save signal, a pure tabs module with tests, card/note layout in GamesSettings, reworked field components, catalogue keys in the gamelib namespace, and the two todos closed.
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/sketches/009-game-settings-dialog/README.md
@.planning/sketches/009-game-settings-dialog/index.html
@.planning/todos/pending/2026-11-21-game-settings-close-overlaps-info-control.md
@.planning/todos/pending/2026-11-21-advanced-settings-twisties-to-headings.md
@src/frontend/components/UI/Dialog/components/Dialog.tsx
@src/frontend/screens/Settings/components/SettingsModal/index.tsx
@src/frontend/screens/Settings/sections/GamesSettings/index.tsx
@src/frontend/screens/Settings/sections/GamesSettings/index.scss
@src/frontend/hooks/useSettingsContext.ts

Load `Skill("gamelib-conventions")` (the `<verify>` prettier rule and todo frontmatter rule apply) and `Skill("sketch-findings-gamelib")` (multi-theme survival: theme tokens only, never literal colours; verify against midnightMirage, gruvbox_dark and dracula).

Sketch 009 variant B is the visual reference: in index.html read `wineTab`, `runTab`, `advancedTab`, `lwsBlock` (the `v === 'b'` branches) and the `.hB`, `.card`, `.note`, `.warn` CSS. Copy, labels and grouping come from there; map its `--color-*` tokens to the app tokens listed below. The decisions are locked; do not revisit them.

## Theme token map (measured in src/frontend/themes.scss and styles/_colors.scss)

- Neutral note (#2): background `color-mix(in srgb, var(--accent) 8%, transparent)`, border `1px solid color-mix(in srgb, var(--accent) 22%, transparent)`, text `var(--text-secondary, var(--text-default))`, icon `var(--accent)`.
- Amber warning (#5): background `color-mix(in srgb, var(--status-warning) 12%, transparent)`, border `1px solid color-mix(in srgb, var(--status-warning) 40%, transparent)`, icon `var(--status-warning)`. `--status-warning` is global (styles/_colors.scss colorSystem, included in frontend/index.scss) and nord-light overrides it.
- Card (#7): background `color-mix(in srgb, var(--input-background) 35%, var(--modal-background))`, border `1px solid var(--modal-border, var(--input-background))`, radius 8px. Relational on purpose: gruvbox_dark and dracula set `--modal-background` equal to `--body-background`, so a body-coloured card would vanish there.
- Saved flash and dot: `var(--success, var(--status-success))`. Header border: `var(--modal-border, var(--input-background))`. Title: `var(--text-title, var(--text-default))`. Pinned tab strip background: `var(--modal-background)`.
- Spacing and type tokens that exist: `--space-3xs/2xs/xs/sm/md/lg/xl`, `--text-xs/sm/md/lg/xl/2xl`, `--regular/medium/semibold/bold`.

## Interfaces the executor needs (read once, do not re-derive)

- `Dialog` props today: `className?`, `children`, `showCloseButton: boolean`, `onClose`, `open?` (default true), `onExited?`. It renders an absolutely positioned MUI `IconButton aria-label="close"` (display keyed on showCloseButton, kept in the DOM for gamepad back) before MUI `DialogContent`. The mount effect sends one `gamepadAction tab`, plus a second when showCloseButton, to skip the close button. `StyledPaper` holds `'&:has(.settingsDialogContent):not(:has(.logs-wrapper))': { height: '80%' }`. 25 consumers.
- `src/frontend/helpers/gamepad.ts` `closeDialog()` clicks the first `[aria-label="close"]` inside `.MuiDialog-root`. `isMuiDialogCloseButton()` only matches an IconButton whose parent is `.MuiDialog-paper`. Leave gamepad.ts untouched.
- `createSettingSetter({ appName, getConfig, setConfig, send })` returns `(key, value)`; it returns early on a JSON-equal no-change, otherwise sets config then calls `send`. `window.api.setSetting` is a fire-and-forget send; a failed per-game write arrives as `handleGameSettingWriteFailed` and the hook re-reads. `useSettingsContext` callers: SettingsModal, Settings/index.tsx, GamePage, WineManagerSettingsModal, Accessibility (only SettingsModal opts in).
- `GameInfo` (src/common/types.ts GameInfoCore): `title`, `app_name`, `runner`, `art_square: string`, `art_cover: string`, `art_icon?`, `overrides?: { title?, art_cover?, art_square? }`.
- `CachedImage` props: `src`, `fallback?: string | string[]`, `alt`, `className` (img; fallbacks bounded). Jest maps `.svg?react` and `.s?css` but NOT `?url`, so do not import the `gamelib_card*.svg?url` assets into anything a test renders.
- Help pattern (memory "help icon on title line"): icon-only (i) on the label line. `InfoIcon({ text })` wraps `InfoBox iconOnly`. Toggles: wrap in `div.toggleRow` with `ToggleSwitch` then `InfoIcon` (EnableEsync.tsx). `PathSelectionBox`, `TextInputField`, `SelectField` and the table input take `labelHelp`. `ToggleSwitch`'s `description` prop only sets a hover `title` attribute; it is not visible text.
- `TabPanel` renders a plain div, not a section. Cards must be `div`s: `GamesSettings/index.scss` has a `section:not(:nth-of-type(0))` 500px floor that `WinetricksSettings/__tests__/tokenCensus.test.ts` pins as the only `min-width: 500px` rule (specificity 0,2,1). Do not add another 500px rule and do not make cards `section`s.
- `src/frontend/__tests__/muiTabsSelectorScoping.test.ts` fails on any unscoped `.MuiTabs*` selector; scope new tab rules under `.settingsDialogContent`.
- The Frontend jest project defaults to the node environment. Render tests need the `@jest-environment jsdom` docblock and `import 'frontend/testUtils/jsdomNoticeEnv'` first. `LaunchWithoutSteam.test.tsx` (i18n with empty resources so t returns English defaults) and `ThemeSelector/__tests__/RenameThemeDialog.test.tsx` (mounts the shared Dialog with `StoreEmbedSuppressionProvider` and a `window.api.gamepadAction` stub) are the harnesses to copy.
- `meta/__tests__/hardcodedStringGate.test.ts` is the blocking hardcoded-string gate. Its scope (meta/i18nGateScope.json) includes SettingsModal/index.tsx, LaunchWithoutSteam, SteamOverlayOverride, AlternativeExe, EnvVariablesTable, PreferedLanguage, WrappersTable and others. It takes about 205 s (measured), so run it with a long timeout or in the background. Every visible string goes through t() even in files outside its scope.
- `GamesSettings` also renders on the Default settings page (`Settings/index.tsx`, `.settingsWrapper`, `isDefault`). That page must keep working: it has no gameInfo, its remembered tab key stays `default`, and it keeps its own footer (Settings/index.tsx imports the footer component itself).

## i18n rule (D-05 churn guard), and why translation.json is NOT an option

Every NEW key goes in the fork-owned `gamelib` namespace: a `gamelib:` prefix on the default `t`, or `useTranslation('gamelib')`. CI runs `pnpm i18n` and then `pnpm i18n-churn-guard`, which fails when the parser adds a key to an upstream catalogue (translation.json, gamepage.json, login.json). So the "put new keys in translation.json" fallback would turn CI red; it is ruled out. Reusing an EXISTING upstream key with its existing default (for example `settings.navbar.log`, `header.categories`, `settings.default_hint`) is fine, because the parser changes nothing for a key that already exists. `pnpm i18n` writes only `public/locales/en/*` (locales: ['en'], sort: true) and never rewrites an existing value, so any changed English copy of an existing gamelib key must be edited by hand in gamelib.json as well as in the t() default. Prefer a new key over rewording an existing one when other locales already translate the old meaning.

## Catalogue staging procedure (CSP); every task that changes public/locales/en/gamelib.json uses it

public/locales/en/gamelib.json already carries unrelated uncommitted edits. At plan time `git diff` shows two pure-reorder hunks in the customThemes block (3 lines moved, 3 insertions and 3 deletions): the parser's sort output for three theme-editor keys. They are not yours and must not be committed.
<!-- planner-discipline-allow: FooterInfo -->

1. Before the first edit of Task 1, record the foreign state: run `git diff -U0 public/locales/en/gamelib.json` and save it to your scratchpad as the foreign baseline. If it is empty at that point, plain `git add public/locales/en/gamelib.json` is fine for the rest of the plan and steps 3-4 do not apply.
2. Add keys by running `pnpm i18n` after the source edits. Hand-edit values only for existing keys whose English copy changes. Then `pnpm i18n-churn-guard` must pass (only gamelib.json changed under public/locales/). If the parser touched an upstream catalogue, a t() call is missing its `gamelib:` prefix: fix the call, then `git checkout -- public/locales/en/translation.json` (it has no other uncommitted edits at plan time; re-check `git status` before restoring).
3. Stage only your hunks: `git diff -U0 public/locales/en/gamelib.json`, drop every hunk whose added/removed lines all appear in the step-1 foreign baseline, and apply the rest with `git apply --cached --unidiff-zero` (run with `--check` first). Old-side line numbers refer to the index, so dropping the pure-reorder hunks does not shift your own.
4. Confirm that `git diff --cached public/locales/en/gamelib.json` holds only your keys, and that the unstaged `git diff` still shows the foreign reorder hunks.

`git add -p` is interactive and unavailable here; the patch filter above does the same job. public/locales/ is prettier-ignored (`npx prettier --file-info public/locales/en/gamelib.json` prints `"ignored": true`), so a `--check` on it would be vacuous and is omitted on purpose. Hand-match the 4-space JSON layout; the parser writes it anyway.

## Commit discipline

The working tree carries unrelated dirty files (native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/*, .planning/state.json, .planning/debug/*, .planning/spikes/*, other .planning/todos/*, a root .dxvk-cache, and the gamelib.json hunks above). Another session may still be editing the bridge files. Stage with `git add <exact paths>` per task, plus the CSP for gamelib.json. Never use `git add -A`, `git add .`, `git add .planning`, `git commit -a`, or a gsd-tools commit without `--files` (memory: gsd-tools commit sweeps all dirty .planning).
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Header row with the X, title alone, and a Game settings · App ID · Saved subline driven by the real setting write (sketch 009 #1, #9, #10, #11)</name>
  <files>src/frontend/components/UI/Dialog/components/Dialog.tsx, src/frontend/components/UI/Dialog/index.css, src/frontend/components/UI/Dialog/__tests__/dialogHeaderSlot.test.tsx, src/frontend/screens/Settings/components/SettingsModal/index.tsx, src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx, src/frontend/screens/Settings/components/SettingsModal/index.scss, src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx, src/frontend/hooks/useSettingsContext.ts, src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts, src/frontend/screens/Settings/sections/GamesSettings/index.tsx, public/locales/en/gamelib.json</files>
  <behavior>
    Every new test name or describe carries "261121-dzl" so the -t gate can count it.
    - setSetting test A: createSettingSetter with an onWrite mock: a real change calls send, then onWrite exactly once (onWrite called after send).
    - setSetting test B: a JSON-equal no-change calls neither send nor onWrite.
    - setSetting test C: a setter built without onWrite still sends; the existing G17 cases stay green unchanged.
    - dialogHeaderSlot (jsdom) D: Dialog with no header renders exactly one [aria-label="close"] in the document, and it is not inside .Dialog__header (regression guard for the 25 consumers).
    - dialogHeaderSlot E: Dialog with header renders the header content inside .Dialog__header, exactly one [aria-label="close"] in the whole document, inside .Dialog__header, and clicking it calls onClose.
    - dialogHeaderSlot F: header with showCloseButton false keeps that one close button in the DOM (gamepad back) but not displayed.
    - SettingsModalHeader (jsdom) G: steam game "Low Magic Age" / 576770, type settings: the h2 text is exactly the title (no parentheses); the subline shows "Game settings", "Steam App ID", "576770" and "Saved automatically".
    - H: rerender with justSaved true shows "Saved" and the saved element carries is-flashing; back to false restores "Saved automatically".
    - I: a gog game shows "App ID" and not "Steam App ID".
    - J: type log shows "Log"; type category shows "Categories"; neither renders the saved element.
    - K: a game with empty art_square, art_cover and no overrides renders the placeholder and no img; one with art_square renders an img with alt "".
  </behavior>
  <action>
Start with CSP step 1 (record the foreign gamelib.json baseline) before touching anything.

Write the failing tests first (behavior A-K), confirm they fail, then implement:

1. Dialog.tsx (sketch 009 #1). Add an optional `header?: ReactNode` prop with a short `quick-261121-dzl` comment. With no header, render exactly what renders today: same absolute IconButton, same `aria-label="close"`, same display expression, same focus hack. With a header, render a `div.Dialog__header` as the first child of the paper, holding `div.Dialog__headerContent` (the header) followed by the one close IconButton: same aria-label, onClick `close`, the same showCloseButton display expression, not absolutely positioned, `flex: none`, `color: var(--text-default)`. Render no second close button. Then render the MUI DialogContent as today. Leave the gamepad focus effect keyed on showCloseButton: the header X is the first tabbable element, so the second simulated tab still skips it. Do not touch StyledPaper: the header sits in the same paper, so the 80% `:has(.settingsDialogContent)` rule (#11) still matches.

2. Dialog/index.css: `.Dialog__header` is a flex row, `align-items: center`, gap `var(--space-md)`, `flex: none`, with padding from the token scale (the sketch uses about 16px top/bottom, 12px right, 20px left) and border-bottom `1px solid var(--modal-border, var(--input-background))`. Give `.Dialog__headerContent` `flex: 1 1 0; min-width: 0; width: 0`. That is load-bearing: SettingsModal's paper carries `InstallModal__dialog`, whose `min-width: fit-content` beats max-width, so a long one-line title would otherwise widen the paper past the window. If the live long-title check still widens it, add `contain: inline-size`. Add `.Dialog__header + .MuiDialogContent-root { padding-top: 0 }` so the pinned tab strip sits flush under the header. Use theme tokens only.

3. SettingsModalHeader.tsx (new; sketch 009 #1, #9, #10). Props: `gameInfo: GameInfo`, `type` (type-only import of `GameSettingsModalType` from `./index`), `justSaved: boolean`. Render `div.settingsModalHeader`:
   - Thumbnail: a CachedImage whose src is the first non-empty of overrides.art_square, art_square, overrides.art_cover, art_cover. Use art_cover as the fallback when it is a different value. `alt=""`, class `settingsModalHeader__thumb`. With no art at all, render an aria-hidden `span.settingsModalHeader__thumb.settingsModalHeader__thumb--placeholder` instead. No `?url` imports.
   - Text column: an `h2.settingsModalHeader__title` holding `gameInfo.title` alone, with a `title` attribute carrying the full title for the clamped case.
   - Subline `div.settingsModalHeader__subline`, from these parts:
     - Type label: settings uses `t('gamelib:settings.modal.gameSettings', 'Game settings')`; log uses the existing `t('settings.navbar.log', 'Log')`; category uses the existing `t('header.categories', 'Categories')`.
     - An aria-hidden `·` separator span.
     - App ID: `isStore(gameInfo, 'steam')` picks `t('gamelib:settings.modal.steamAppId', 'Steam App ID')`, else `t('gamelib:settings.modal.appId', 'App ID')`, followed by a `code` element holding app_name.
     - Saved indicator, only when type is settings: another separator, then `span.settingsModalHeader__saved` with `aria-live="polite"`, an aria-hidden dot span, and the text `t('gamelib:settings.modal.saved', 'Saved')` while justSaved (plus modifier class `is-flashing`), otherwise `t('gamelib:settings.modal.savedAutomatically', 'Saved automatically')`.
   Every visible word goes through t() (D-05: new keys are gamelib only).

4. SettingsModal/index.scss (new, imported by SettingsModal/index.tsx). Map the sketch's `.hB` rules to tokens:
   - Thumb: 44px square, radius 8px, `object-fit: cover`. The placeholder gets `var(--input-background)`.
   - Title: `var(--text-lg)`, `var(--text-title, var(--text-default))`, `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden`, margin 0.
   - Subline: `var(--text-xs)`, `var(--text-secondary, var(--text-default))`, flex-wrap with a small gap, margin-top about 3px.
   - Saved: a 6px round dot in `var(--success, var(--status-success))`; `.is-flashing` switches the text to the same token with a 0.2s colour transition.
   - code: monospace and `user-select: all`.
   - Tab strip: `.settingsDialogContent .MuiTabs-root { position: sticky; top: 0; z-index: 2; background: var(--modal-background); }`. Scope it under `.settingsDialogContent` only, never `.settingsWrapper` and never global. That keeps the tabs visible while the body scrolls, as in variant B.
   No literal colours.

5. SettingsModal/index.tsx. Stop using DialogHeader and the parenthesised title-type string. Pass `header={<SettingsModalHeader gameInfo={gameInfo} type={type} justSaved={justSaved} />}` to Dialog, keeping `showCloseButton`, `onClose` and the `InstallModal__dialog` className. Add the flash state before the `if (!contextValues) return null` early return: `justSaved` via useState, a timer ref, and a `useCallback` `onSettingWritten` that sets justSaved true, clears any pending timer and starts a ~1200 ms timeout that sets it false. A `useEffect` cleanup clears the timer on unmount. Pass `onSettingWritten` into useSettingsContext. Keep the file free of hardcoded user-facing literals: it is in the hardcoded-string gate's scope.

6. useSettingsContext.ts (#10's real save signal). Props gains optional `onSettingWritten?: () => void` and SetterDeps gains optional `onWrite?: () => void`. In createSettingSetter, call `onWrite?.()` immediately after `send(...)`; the no-change early return never reaches it. Wire `onWrite: onSettingWritten` in the hook. Other callers are untouched. The flash confirms the write was sent; a failed write still snaps the control back through the existing gameSettingWriteFailed re-read.

7. GamesSettings/index.tsx (#10): remove the per-game footer import (`../FooterInfo`) and its `{!isDefault && ...}` render line, because the App ID and autosave text now live in the header subline. Leave the FooterInfo component file in place: Settings/index.tsx still imports it for the Default page. Do not leave a comment naming the removed component.

8. Catalogue: `pnpm i18n`, then CSP steps 2-4. New keys appear under gamelib `settings.modal.*`.

Commit: `git add` exactly the ten source/test paths above, plus gamelib.json via CSP step 3.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts src/frontend/components/UI/Dialog/__tests__/dialogHeaderSlot.test.tsx src/frontend/components/UI/Dialog/__tests__/dialogWindowChrome.test.ts src/frontend/components/UI/Dialog/__tests__/dialogStoreEmbedSuppression.test.ts src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/enginePlacement.test.ts src/frontend/__tests__/muiTabsSelectorScoping.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts && pnpm codecheck && npx eslint src/frontend/components/UI/Dialog/components/Dialog.tsx src/frontend/components/UI/Dialog/__tests__/dialogHeaderSlot.test.tsx src/frontend/screens/Settings/components/SettingsModal/index.tsx src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx src/frontend/hooks/useSettingsContext.ts src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts src/frontend/screens/Settings/sections/GamesSettings/index.tsx && npx prettier --check src/frontend/components/UI/Dialog/components/Dialog.tsx src/frontend/components/UI/Dialog/index.css src/frontend/components/UI/Dialog/__tests__/dialogHeaderSlot.test.tsx src/frontend/screens/Settings/components/SettingsModal/index.tsx src/frontend/screens/Settings/components/SettingsModal/SettingsModalHeader.tsx src/frontend/screens/Settings/components/SettingsModal/index.scss src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx src/frontend/hooks/useSettingsContext.ts src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts src/frontend/screens/Settings/sections/GamesSettings/index.tsx && pnpm i18n-churn-guard && test "$(grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' src/frontend/screens/Settings/sections/GamesSettings/index.tsx | grep -c 'FooterInfo')" -eq 0 && test "$(grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/components/UI/Dialog/components/Dialog.tsx | grep -c 'header?: ReactNode')" -ge 1 && test "$(grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/hooks/useSettingsContext.ts | grep -c 'onWrite')" -ge 2 && test "$(grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/Settings/components/SettingsModal/index.tsx | grep -c 'onSettingWritten')" -ge 2 && test "$(npx jest --runTestsByPath src/frontend/hooks/__tests__/useSettingsContext.setSetting.test.ts src/frontend/components/UI/Dialog/__tests__/dialogHeaderSlot.test.tsx src/frontend/screens/Settings/components/SettingsModal/__tests__/SettingsModalHeader.test.tsx -t '261121-dzl' --verbose 2>&1 | grep -c '✓')" -ge 9</automated>
    Baselines measured at HEAD c26dbb6fb (comment-filtered counts):
    - GamesSettings/index.tsx `FooterInfo` [HEAD=2 EXPECT==0 @c26dbb6fb]
    - Dialog.tsx `header?: ReactNode` [HEAD=0 EXPECT>=1 @c26dbb6fb]
    - useSettingsContext.ts `onWrite` [HEAD=0 EXPECT>=2 @c26dbb6fb]
    - SettingsModal/index.tsx `onSettingWritten` [HEAD=0 EXPECT>=2 @c26dbb6fb]
    - `-t '261121-dzl'` passing specs [HEAD=0 EXPECT>=9 @c26dbb6fb]
    All existing suites in the jest list passed at HEAD (measured). `npx prettier --file-info` reports `"ignored": false` for every path in the `--check` list, including the new index.scss and index.css, and `--check` over the existing ones exits 0 at HEAD. gamelib.json is prettier-ignored, so no check (see CSP).
  </verify>
  <done>Tests A-K failed before the implementation and pass after. The existing Dialog chrome and store-embed suites, runAdvancedTabs and enginePlacement are still green. codecheck, eslint, the scoped prettier check and the churn guard pass. The staged gamelib.json diff holds only `settings.modal.*` keys and the foreign reorder hunks remain unstaged. One commit holds exactly this task's paths.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 2: GamesSettings: Run-first tabs for macOS engine games, runner-keyed remembered tab, Wine/Winetricks through t(), bordered cards and neutral notes (sketch 009 #2, #4, #7, #8, #12)</name>
  <files>src/frontend/screens/Settings/sections/GamesSettings/tabs.ts, src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts, src/frontend/screens/Settings/sections/GamesSettings/SettingsCard.tsx, src/frontend/screens/Settings/sections/GamesSettings/index.tsx, src/frontend/screens/Settings/sections/GamesSettings/index.scss, src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts, src/frontend/screens/Settings/sections/GamesSettings/__tests__/enginePlacement.test.ts, public/locales/en/gamelib.json</files>
  <behavior>
    tabs.test.ts runs in the node environment, every describe carries "261121-dzl", and storage is a fake object implementing getItem/setItem/removeItem.
    - getStartingTab: ('darwin', Windows-platform game) is 'run' (#4); ('darwin', mac-native game) is 'run'; ('linux', Windows-platform game) is 'wine' (unchanged); ('linux', linux game) is 'run'; ('win32', any game) is 'run'; ('darwin', null) is 'wine' (Default page unchanged); ('win32', null) is 'run'.
    - settingsTabOrder: runFirst true with wine and winetricks visible gives ['run','wine','winetricks','advanced']; runFirst false gives ['wine','winetricks','run','advanced']; with saves, gamescope and legacy visible they follow advanced in that order; hidden tabs are omitted; 'run' and 'advanced' are always present.
    - settingTabKey: steam/576770 gives 'steam-576770-setting_tab'; no gameInfo gives 'default'.
    - readRememberedTab: the new key present returns it and leaves any legacy key alone; only the legacy key present returns its value, writes it under the new key and removes the legacy key, and a second call then reads the new key; neither present returns null; no gameInfo reads 'default'.
    - rememberTab writes the new key only.
    - initialSettingsTab: null gives the starting tab; 'other' gives 'run'; a value not among the visible tabs (hidden winetricks, unknown string) gives the starting tab; a visible value is returned as is.
  </behavior>
  <action>
1. tabs.ts (new, pure, no React). Move getStartingTab here from index.tsx and change one rule (#4): when gameInfo is present and platform is 'darwin', return 'run'. Every other branch is unchanged, so Linux and Windows keep today's starting tab and the Default page (no gameInfo) keeps 'wine' off Windows. Export `SettingsTab` (the union of wine, winetricks, run, advanced, saves, gamescope, legacy) and:
   - `settingsTabOrder({ runFirst, showWineTab, showWinetricksTab, showCloudSavesTab, showGamescopeTab, showLegacyTab })`: today's order is wine, winetricks, run, advanced, saves, gamescope, legacy; with runFirst, 'run' moves to the front.
   - `settingTabKey(gameInfo)`: `${runner}-${app_name}-setting_tab`, or 'default' with no gameInfo.
   - `readRememberedTab(storage, gameInfo)`: the new key first, then a one-time fallback to the legacy `${app_name}-setting_tab`, which is written under the new key and removed (#12).
   - `rememberTab(storage, gameInfo, tab)`.
   - `initialSettingsTab(stored, { visible, startingTab })`: 'other' maps to 'run' (261104-unp); a value not in visible falls back to startingTab. This generalises today's winetricks-only guard to any tab hidden on this render.
   Storage is a structural `Pick` of getItem/setItem/removeItem so the tests need no DOM.

2. SettingsCard.tsx (new): `SettingsCard({ title, children })` renders `div.settingsCard` containing `h3.settingsCard__title` then the children. Use a div, not a section (500px floor; see context).

3. index.tsx:
   - Import from ./tabs and delete the inline getStartingTab and windowsPlatforms.
   - Build `tabLabels`. Wine uses `t('gamelib:settings.navbar.wine', 'Wine')` and Winetricks uses `t('gamelib:settings.navbar.winetricks', 'Winetricks')` (#8, gamelib per D-05). Run, Advanced, Cloud Saves Sync, Gamescope and Legacy keep their existing keys.
   - Compute `tabOrder = settingsTabOrder({ runFirst: isMacEngineGame, showWineTab, showWinetricksTab, showCloudSavesTab, showGamescopeTab: isLinux, showLegacyTab: isLinux && !isNative })` and render the Tabs children by mapping tabOrder to Tab elements (key, label, value). isMacEngineGame is already `!isDefault && isMac && showWineTab`, so only macOS per-game Windows-engine games reorder (#4).
   - Replace the render-time localStorage read with a lazy useState initializer: `initialSettingsTab(readRememberedTab(localStorage, gameInfo), { visible: tabOrder, startingTab: getStartingTab(platform, gameInfo) })`. The migration then runs once, not on every render. handleChange calls `rememberTab(localStorage, gameInfo, newValue)`.
   - #2: the isDefault hint becomes a `p.settingsNote` with the faInfoCircle icon and the text in a span. Keep the existing `settings.default_hint` key and copy. The Wine-tab hint inside the isMacEngineGame branch becomes a `div.settingsNote` using a NEW key, `t('gamelib:engine.wineTabNote', "GameLib picks the Wine engine and bottle for this game. Change it only if the game won't run.")`, which is the sketch B copy. A new key avoids stale translations of the old sentence. The Legacy tab warning keeps `defaults-hint` (danger); SyncSaves' own defaults-hint uses stay untouched.
   - #7 cards: card titles come from new gamelib keys under `settings.cards.*`: Launch, Steam, Launch target, Scripts, Wrappers & environment, Diagnostics & updates, Wine engine.
     - Wine panel: wrap the whole which-Wine ternary (all three branches) in one "Wine engine" card. The isMacEngineGame branch holds the note, EngineOverride and the plain/legacy WinePrefix. The !isCrossover toggle block and Tools stay below the card, unchanged.
     - Run panel: a "Launch" card holds LaunchOptionSelector, LauncherArgs, PreferedLanguage, OfflineMode, ShowFPS, Mangohud, GameMode and NvidiaPrime, with their gates and current order. Then `{isMacSteamTitle && (` a "Steam" card holding LaunchWithoutSteam and SteamOverlayOverride `)}`. The card carries the isMacSteamTitle gate, so the two inner per-component gates go.
     - Advanced panel: "Launch target" holds AlternativeExe; "Scripts" holds Before/AfterLaunchScriptPath, and the stray plain "Scripts:" label div above the two pickers goes; "Wrappers & environment" holds WrappersTable, EnvVariablesTable, then `isLinux && PreferSystemLibs` and the `!isNative` BattlEye/EAC block. Those Linux runtime toggles have no card in the 4-card spec and alter the launch environment, so they live there as Claude's discretion. "Diagnostics & updates" holds VerboseLogs and `!isSideloaded && IgnoreGameUpdates`.
   - Keep every existing gate, comment and component tag; each component tag still appears exactly once.

4. index.scss, all theme tokens per the context map:
   - `.settingsCard`: background, border and radius per the map, padding about `var(--space-md) var(--space-lg) var(--space-2xs)`, margin `0 0 var(--space-md)`.
   - `.settingsCard__title`: margin `0 0 var(--space-sm)`, `var(--text-sm)`, `var(--semibold)`, `var(--text-title, var(--text-default))`.
   - Hide a card with nothing but its heading: `.settingsCard:not(:has(> :not(.settingsCard__title))) { display: none }`. Components that return null or an empty fragment leave no DOM, so the Steam card for an ineligible title, Launch target on the Default page and similar cards disappear.
   - `.settingsNote`: flex, gap `var(--space-sm)`, `align-items: flex-start`, `var(--text-sm)`, line-height 1.45, radius 6px, padding `var(--space-sm) var(--space-md)`, margin `0 0 var(--space-md)`, colours per the map; its svg is `var(--accent)` with `flex: none`.
   - Leave the existing `.defaults-hint` block, the 500px section floor and the scoped `.MuiTabs-root` block exactly as they are.

5. Tests. Rewrite the runAdvancedTabs.test.ts assertions that encoded the old structure, keeping their intent:
   - Run is unconditional: it is now an always-present entry of settingsTabOrder, and its panel stays ungated.
   - The Run order is strict inside the Launch card.
   - The Steam card is gated by isMacSteamTitle and holds LaunchWithoutSteam then SteamOverlayOverride.
   - Each tag appears once.
   - The starting-tab test now reads tabs.ts.
   - The saved-other fallback test now reads initialSettingsTab in tabs.ts.
   Add one source assertion that `settingsTabOrder` is called with `runFirst: isMacEngineGame`. In enginePlacement.test.ts, switch the hint key and catalogue checks to `engine.wineTabNote` and its new copy, and change the overlay-moved test to the Steam-card gate. Add a `261121-dzl` spec asserting that the wine slice uses `settingsNote` and no `defaults-hint`, while the legacy slice still uses `defaults-hint` (#2 keeps danger only for Legacy). Keep every other assertion.

6. Catalogue: `pnpm i18n`, then CSP steps 2-4.

Commit: `git add` the seven source/test paths, plus gamelib.json via CSP.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/enginePlacement.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts src/frontend/__tests__/muiTabsSelectorScoping.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts && pnpm codecheck && npx eslint src/frontend/screens/Settings/sections/GamesSettings/index.tsx src/frontend/screens/Settings/sections/GamesSettings/tabs.ts src/frontend/screens/Settings/sections/GamesSettings/SettingsCard.tsx src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/enginePlacement.test.ts && npx prettier --check src/frontend/screens/Settings/sections/GamesSettings/index.tsx src/frontend/screens/Settings/sections/GamesSettings/index.scss src/frontend/screens/Settings/sections/GamesSettings/tabs.ts src/frontend/screens/Settings/sections/GamesSettings/SettingsCard.tsx src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/enginePlacement.test.ts && pnpm i18n-churn-guard && test "$(grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' src/frontend/screens/Settings/sections/GamesSettings/index.tsx | grep -c "gamelib:settings.navbar.wine'")" -ge 1 && test "$(grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' src/frontend/screens/Settings/sections/GamesSettings/index.tsx | grep -c "gamelib:settings.navbar.winetricks'")" -ge 1 && test "$(grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' src/frontend/screens/Settings/sections/GamesSettings/index.tsx | grep -c '<SettingsCard')" -ge 7 && test "$(grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' src/frontend/screens/Settings/sections/GamesSettings/index.tsx | grep -c 'settingsNote')" -ge 2 && test "$(grep -vE '^[[:space:]]*(//|\*|/\*)' src/frontend/screens/Settings/sections/GamesSettings/tabs.ts | grep -c -- '-setting_tab')" -ge 2 && test "$(npx jest --runTestsByPath src/frontend/screens/Settings/sections/GamesSettings/__tests__/tabs.test.ts -t '261121-dzl' --verbose 2>&1 | grep -c '✓')" -ge 6</automated>
    Baselines measured at HEAD c26dbb6fb (comment-filtered counts in GamesSettings/index.tsx unless noted):
    - `gamelib:settings.navbar.wine'` [HEAD=0 EXPECT>=1 @c26dbb6fb]
    - `gamelib:settings.navbar.winetricks'` [HEAD=0 EXPECT>=1 @c26dbb6fb]
    - `<SettingsCard` [HEAD=0 EXPECT>=7 @c26dbb6fb]
    - `settingsNote` [HEAD=0 EXPECT>=2 @c26dbb6fb] (the Default-page hint and the Wine-tab note; the Legacy banner keeping `defaults-hint` is asserted by the enginePlacement test, see action step 5)
    - tabs.ts `-setting_tab` [HEAD=error:2 EXPECT>=2 @c26dbb6fb] (the file does not exist yet)
    - tabs.test.ts `-t '261121-dzl'` passing specs [HEAD=error:2 EXPECT>=6 @c26dbb6fb]
    tokenCensus and muiTabsSelectorScoping passed at HEAD and must stay green: they pin the single 500px floor and tab-selector scoping. All seven prettier paths report `"ignored": false`.
  </verify>
  <done>The tabs.test.ts specs failed before tabs.ts existed and pass after. The runAdvancedTabs and enginePlacement rewrites keep their original intent and pass. tokenCensus and muiTabsSelectorScoping are green. codecheck, eslint, prettier and the churn guard pass. A macOS Windows-engine game's tab list starts with Run; Linux and Windows order is unchanged. One commit holds this task's paths, plus only this task's gamelib.json hunks.</done>
</task>

<task type="auto" tdd="true">
  <name>Task 3: Field components: always-visible Engine and Steam overlay, Launch without Steam copy and amber warning, noun labels with (i), renamed-control copy, todos closed (sketch 009 #3, #5, #6)</name>
  <files>src/frontend/screens/Settings/components/EngineOverride.tsx, src/frontend/screens/Settings/components/SteamOverlayOverride.tsx, src/frontend/screens/Settings/components/LaunchWithoutSteam.tsx, src/frontend/screens/Settings/components/AlternativeExe.tsx, src/frontend/screens/Settings/components/BeforeLaunchScriptPath.tsx, src/frontend/screens/Settings/components/AfterLaunchScriptPath.tsx, src/frontend/screens/Settings/components/WrappersTable.tsx, src/frontend/screens/Settings/components/EnvVariablesTable.tsx, src/frontend/screens/Settings/components/VerboseLogs.tsx, src/frontend/screens/Settings/components/OfflineMode.tsx, src/frontend/screens/Settings/components/LauncherArgs.tsx, src/frontend/screens/Settings/components/PreferedLanguage.tsx, src/frontend/screens/Settings/components/ShowFPS.tsx, src/frontend/screens/Settings/components/__tests__/EngineOverride.test.tsx, src/frontend/screens/Settings/components/__tests__/EngineOverride.save.test.tsx, src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx, src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx, src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts, src/frontend/screens/Settings/sections/GamesSettings/index.scss, src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx, src/backend/storeManagers/legendary/launchFailure.ts, src/backend/launcher.ts, public/locales/en/gamelib.json, .planning/todos/pending/2026-11-21-game-settings-close-overlaps-info-control.md, .planning/todos/pending/2026-11-21-advanced-settings-twisties-to-headings.md, .planning/todos/completed/2026-11-21-game-settings-close-overlaps-info-control.md, .planning/todos/completed/2026-11-21-advanced-settings-twisties-to-headings.md</files>
  <behavior>
    Every new or rewritten spec name carries "261121-dzl".
    - EngineOverride: EngineOverrideView returns a div with class engineOverride. Nothing in its tree is a details or summary element; its SelectField keeps htmlId engineOverride, label 'Engine', an InfoIcon labelHelp and the unsupported warning for pinned ids. Passing the legacy open prop changes nothing. Existing option/label/onChange specs stay green, with the child-finding helpers adapted to a single child.
    - SteamOverlayOverride: the eligible render is a div with class steamOverlayOverride holding the select (automatic/on/off), with no details or summary; the ineligible render is still null.
    - LaunchWithoutSteam: the steam-api view with the setting on renders exactly one .settingsWarning whose text is "This game uses the Steam API, or GameLib couldn't check. Without Steam it may quit, lose Steam features, or reopen Steam." and does not contain "You lose"; its svg carries no color attribute; no .saves-warning. Every toggle view renders one .settingsToggleDescription reading "Starts the game directly: no Steam Cloud sync, no playtime tracking, no achievements and no Steam overlay." The clean view has no .settingsWarning. The DRM view is unchanged (disabled, (i) on the label line, no description). The toggle still writes the negated value.
    - fieldLabels.test.ts (source gate, node): each of AlternativeExe, BeforeLaunchScriptPath, AfterLaunchScriptPath, WrappersTable, EnvVariablesTable, VerboseLogs, OfflineMode, LauncherArgs, PreferedLanguage and ShowFPS contains its gamelib:settings.fields.*.label key, and each one with help text has an InfoIcon or InfoBox iconOnly. The old sentence labels are gone as label defaults: 'Select an alternative EXE to run', 'Select a script to run before the game is launched', 'Select a script to run after the game exits', 'Wrapper command:', 'Game Arguments (appended to game launch command)', 'Prefered Language (Language Code)', 'Enable verbose logs'.
  </behavior>
  <action>
1. EngineOverride.tsx (#3). In EngineOverrideView, replace the disclosure wrapper (the details element and its "(advanced)" summary line with that summary's catalogue lookup) with a plain `div className="engineOverride"` holding the existing SelectField unchanged: Engine label, InfoIcon help, afterSelect unsupported warning. Keep `open?: boolean` in ViewProps so callers compile, documented as a no-op since quick 261121-dzl (the field is always expanded). Do not destructure it. Update the head comment from "collapsed" to always-visible. optionLabel, storedExtraOption and the EngineOverride container are unchanged.

2. SteamOverlayOverride.tsx (#3): same change. The wrapper becomes `div className="steamOverlayOverride"` around the unchanged SelectField. Drop the "(advanced)" summary line.

3. GamesSettings/index.scss:
   - Delete the dead summary rules in the `.engineOverride` block, and the block itself if nothing remains.
   - Add `.settingsWarning`: the same box shape as `.settingsNote`, with the amber colours from the context map and text `var(--text-default)`; its svg is `var(--status-warning)` with `flex: none`.
   - Add `.settingsToggleDescription`: `var(--text-sm)`, `var(--text-secondary, var(--text-default))`, a negative top margin of about `var(--space-sm)` so it hugs its toggle, bottom margin `var(--space-md)`.
   Theme tokens only; no new 500px rule.

4. LaunchWithoutSteam.tsx (#5). The toggle branch:
   - Render ToggleSwitch without the description prop, which was only a hover tooltip.
   - Then a visible `p.settingsToggleDescription` with the new gamelib key `t('steam.directLaunch.description', 'Starts the game directly: no Steam Cloud sync, no playtime tracking, no achievements and no Steam overlay.')`.
   - When control.warn, render `div.settingsWarning` with `role="note"`, a FontAwesomeIcon faExclamationTriangle with no colour prop (the CSS colours it), and a span with the new key `t('steam.directLaunch.risk', "This game uses the Steam API, or GameLib couldn't check. Without Steam it may quit, lose Steam features, or reopen Steam.")`.
   Stop using the old description and warning keys in this file; they stay in the catalogue under keepRemoved. New keys avoid stale translations that list the losses twice. The DRM branch and describeLaunchWithoutSteamControl are unchanged.

5. Noun labels (#6, help on the label line, icon-only). New gamelib keys are `settings.fields.<name>.label` and `.help`. In components on the default `t`, write `t('gamelib:settings.fields...', default)` (D-05).
   - AlternativeExe: "Alternative executable"; help "Run a different .exe from the game folder instead of the game's usual one."; labelHelp is an InfoIcon.
   - BeforeLaunchScriptPath: "Before launch"; help "A script GameLib runs before the game starts. The game waits for it to finish." (verified: launcher.ts awaits runBeforeLaunchScript).
   - AfterLaunchScriptPath: "After exit"; help "A script GameLib runs after the game closes."
   - WrappersTable: "Wrapper commands". Prepend "Commands the game is launched through, in order." (new help key) to the existing iconOnly InfoBox, then a br, then the existing arguments-example line.
   - EnvVariablesTable: "Environment variables"; the existing help InfoBox is unchanged.
   - VerboseLogs: "Verbose logs"; add an InfoIcon after the toggle inside its existing toggleRow, help "Writes extra Wine and GameLib detail to the game's log."
   - OfflineMode: "Run offline", no help. Its not-allowed-offline row switches from the infoBox/saves-warning classes and the hard-coded colour prop on its icon to the `div.settingsWarning` style (multi-theme rule). Its copy is unchanged.
   - LauncherArgs: "Launch arguments". Replace the help.other part4-7 InfoBox content, which names the old "Game Arguments" label, with the single new help "Passed to the game executable after its own arguments, for example -nolauncher to skip the launcher in some games." in the same iconOnly InfoBox.
   - PreferedLanguage: "Game language"; the existing help InfoBox is unchanged.
   - ShowFPS: Linux uses "Show FPS" with help "Draws a frame counter for DirectX 9, 10 and 11 games." (the old "(DX9, 10 and 11)" moves into the (i)). macOS uses "Stats overlay" with help "Shows Apple's Metal performance HUD over the game." (the noun form of the old macOS label; Claude's discretion, since the sketch's mac title has no stats toggle). Wrap the toggle and its InfoIcon in `div.toggleRow`.
   - IgnoreGameUpdates: no change. "Ignore game updates" is already the noun form and has no explanation to move.

6. Renamed-control copy, so text stops naming controls that no longer exist. Change both the t() default and the gamelib.json value; the parser never rewrites existing values.
   - SteamDialog/index.tsx `gamelib:steam.install.bridgeEngineNotice`: "...use Engine on the Wine tab of the game's settings."
   - launchFailure.ts `gamelib:box.error.launch.epic.network` and `.loginFailed`: "...turn on Run offline on the Run tab of its settings."
   - launcher.ts: the plain log line (not i18n) asking users to enable verbose logs becomes "Turn on Verbose logs in the game's settings (Advanced tab) before reporting an issue."

7. Tests per behavior:
   - Adapt the EngineOverride.test.tsx and EngineOverride.save.test.tsx child finders to the single-child div, for example by flattening props.children into an array.
   - Replace the "is a collapsed details" and "renders a details with the summary" specs with the always-visible assertions.
   - In LaunchWithoutSteam.test.tsx, rename the steam-api warning spec to describe the amber warning and switch its selector to `.settingsWarning`.
   - Write fieldLabels.test.ts in the readFileSync source-gate style of runAdvancedTabs.test.ts.

8. Catalogue: `pnpm i18n`, hand-edit the three changed values, then CSP steps 2-4.

9. Close both todos with `git mv` into .planning/todos/completed/. In each, add `resolved: 2026-11-21` and a one-line `resolution:` immediately after `ready:`, keeping severity/platform/ready, and append a `## Resolution (2026-11-21, quick 261121-dzl)` section:
   - close-overlaps: the close X now has its own column in a header row beside the thumbnail and title, through the Dialog header slot; the long/short-title live check is this plan's post-execution UAT.
   - twisties: per the sketch 009 README note, the twisties were on Wine (Engine) and Run (Steam overlay), not Advanced. Both are now plain fields with (i) help, and Advanced is grouped into headed cards.
   .planning is prettier-ignored (`"ignored": true`), so no prettier check for these files; hand-match the corpus.

Commit: `git add` the source/test paths and the two completed todos (git mv stages the renames), plus gamelib.json via CSP. Run `graphify update .` after this last code commit.
  </action>
  <verify>
    <automated>npx jest --runTestsByPath src/frontend/screens/Settings/components/__tests__/EngineOverride.test.tsx src/frontend/screens/Settings/components/__tests__/EngineOverride.save.test.tsx src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/enginePlacement.test.ts src/frontend/screens/Settings/sections/WinetricksSettings/__tests__/tokenCensus.test.ts src/backend/storeManagers/legendary/__tests__/launchFailure.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts meta/__tests__/hardcodedStringGate.test.ts && pnpm codecheck && npx eslint src/frontend/screens/Settings/components/EngineOverride.tsx src/frontend/screens/Settings/components/SteamOverlayOverride.tsx src/frontend/screens/Settings/components/LaunchWithoutSteam.tsx src/frontend/screens/Settings/components/AlternativeExe.tsx src/frontend/screens/Settings/components/BeforeLaunchScriptPath.tsx src/frontend/screens/Settings/components/AfterLaunchScriptPath.tsx src/frontend/screens/Settings/components/WrappersTable.tsx src/frontend/screens/Settings/components/EnvVariablesTable.tsx src/frontend/screens/Settings/components/VerboseLogs.tsx src/frontend/screens/Settings/components/OfflineMode.tsx src/frontend/screens/Settings/components/LauncherArgs.tsx src/frontend/screens/Settings/components/PreferedLanguage.tsx src/frontend/screens/Settings/components/ShowFPS.tsx src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/backend/storeManagers/legendary/launchFailure.ts && npx prettier --check src/frontend/screens/Settings/components/EngineOverride.tsx src/frontend/screens/Settings/components/SteamOverlayOverride.tsx src/frontend/screens/Settings/components/LaunchWithoutSteam.tsx src/frontend/screens/Settings/components/AlternativeExe.tsx src/frontend/screens/Settings/components/BeforeLaunchScriptPath.tsx src/frontend/screens/Settings/components/AfterLaunchScriptPath.tsx src/frontend/screens/Settings/components/WrappersTable.tsx src/frontend/screens/Settings/components/EnvVariablesTable.tsx src/frontend/screens/Settings/components/VerboseLogs.tsx src/frontend/screens/Settings/components/OfflineMode.tsx src/frontend/screens/Settings/components/LauncherArgs.tsx src/frontend/screens/Settings/components/PreferedLanguage.tsx src/frontend/screens/Settings/components/ShowFPS.tsx src/frontend/screens/Settings/components/__tests__/EngineOverride.test.tsx src/frontend/screens/Settings/components/__tests__/EngineOverride.save.test.tsx src/frontend/screens/Settings/components/__tests__/SteamOverlayOverride.test.tsx src/frontend/screens/Settings/components/__tests__/LaunchWithoutSteam.test.tsx src/frontend/screens/Settings/components/__tests__/fieldLabels.test.ts src/frontend/screens/Settings/sections/GamesSettings/index.scss src/frontend/screens/Library/components/InstallModal/SteamDialog/index.tsx src/backend/storeManagers/legendary/launchFailure.ts src/backend/launcher.ts && pnpm i18n-churn-guard && test "$(grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' src/frontend/screens/Settings/components/EngineOverride.tsx | grep -c '<details')" -eq 0 && test "$(grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' src/frontend/screens/Settings/components/SteamOverlayOverride.tsx | grep -c '<details')" -eq 0 && test "$(cat src/frontend/screens/Settings/components/EngineOverride.tsx src/frontend/screens/Settings/components/SteamOverlayOverride.tsx | grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' | grep -c 'override.summary')" -eq 0 && test "$(cat src/frontend/screens/Settings/components/LaunchWithoutSteam.tsx src/frontend/screens/Settings/components/OfflineMode.tsx | grep -vE '^[[:space:]]*(//|\*|/\*|\{/\*)' | grep -c 'yellow')" -eq 0 && test "$(cd src/frontend/screens/Settings/components && grep -l 'gamelib:settings.fields.' AlternativeExe.tsx BeforeLaunchScriptPath.tsx AfterLaunchScriptPath.tsx WrappersTable.tsx EnvVariablesTable.tsx VerboseLogs.tsx OfflineMode.tsx LauncherArgs.tsx PreferedLanguage.tsx ShowFPS.tsx | wc -l)" -ge 10 && test ! -e .planning/todos/pending/2026-11-21-game-settings-close-overlaps-info-control.md && test ! -e .planning/todos/pending/2026-11-21-advanced-settings-twisties-to-headings.md && grep -q '^## Resolution' .planning/todos/completed/2026-11-21-game-settings-close-overlaps-info-control.md && grep -q '^## Resolution' .planning/todos/completed/2026-11-21-advanced-settings-twisties-to-headings.md && grep -q '^resolved: 2026-11-21$' .planning/todos/completed/2026-11-21-game-settings-close-overlaps-info-control.md && grep -q '^resolved: 2026-11-21$' .planning/todos/completed/2026-11-21-advanced-settings-twisties-to-headings.md && python3 .planning/todos/todo-frontmatter-gate.py</automated>
    Baselines measured at HEAD c26dbb6fb (comment-filtered counts):
    - EngineOverride.tsx `<details` [HEAD=1 EXPECT==0 @c26dbb6fb]
    - SteamOverlayOverride.tsx `<details` [HEAD=1 EXPECT==0 @c26dbb6fb]
    - both files `override.summary` [HEAD=2 EXPECT==0 @c26dbb6fb]
    - LaunchWithoutSteam.tsx plus OfflineMode.tsx `yellow` [HEAD=2 EXPECT==0 @c26dbb6fb]
    - files carrying `gamelib:settings.fields.` [HEAD=0 EXPECT>=10 @c26dbb6fb]
    - each completed todo holds `## Resolution` and `resolved: 2026-11-21` [HEAD=absent EXPECT=present @c26dbb6fb]
    hardcodedStringGate.test.ts took 205 s at HEAD (all 11 baseline suites passed together in one 205 s run), so give the command a 600000 ms timeout or run it in the background. Every prettier path reports `"ignored": false`; gamelib.json and .planning are prettier-ignored and deliberately not checked.
  </verify>
  <done>The rewritten and new specs fail against the old components and pass after. The hardcoded-string gate, churn guard, launchFailure, tokenCensus, runAdvancedTabs and enginePlacement suites are green. codecheck, eslint and the scoped prettier check pass. No component in the dialog uses a details disclosure or a hard-coded colour. Both todos are closed with resolutions and the todo gate passes. Commits hold only this task's paths and its own gamelib.json hunks, and graphify has been updated.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer localStorage -> GamesSettings | The remembered-tab value is read back from storage the renderer does not otherwise validate |
| renderer -> sidecar settings write | setSetting is a fire-and-forget IPC send; failure arrives later as gameSettingWriteFailed |
| store metadata -> header thumbnail | art_square/art_cover URLs come from store metadata and load through CachedImage |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-261121-dzl-01 | Tampering | `initialSettingsTab` / `readRememberedTab` in GamesSettings/tabs.ts | low | mitigate | A stored value that is 'other', unknown, or a tab hidden on this render falls back to the starting tab, so the Tabs value never points at an unrendered Tab; the legacy key is migrated once and removed (Task 2 tests) |
| T-261121-dzl-02 | Repudiation | "Saved" flash in SettingsModalHeader | low | accept | The flash fires only when createSettingSetter actually sends a changed value (never on a no-change, Task 1 test B). A later write failure still re-reads and snaps the control back through the existing gameSettingWriteFailed path; the flash makes no claim beyond "sent" |
| T-261121-dzl-03 | Information Disclosure | App ID in the header subline | low | accept | It is the same app_name the removed per-game footer already showed; no path, account or token |
| T-261121-dzl-04 | Spoofing | header thumbnail src | low | accept | Same art fields and the same CachedImage path the library grid already renders; no new URL source |
| T-261121-dzl-05 | Denial of Service | gamepad back / Dialog close button | medium | mitigate | Header mode renders exactly one `[aria-label="close"]` (still in the DOM when hidden), so gamepad.ts closeDialog() keeps working; non-header consumers are byte-identical in behaviour (Task 1 tests D-F) |
| T-261121-dzl-SC | Tampering | npm/pip/cargo installs | high | mitigate | No package installs in this plan; no lockfile changes |
</threat_model>

<verification>
- Tasks 1-3 jest lists are green; `meta/__tests__/hardcodedStringGate.test.ts` (about 205 s) and `meta/__tests__/i18nCatalogChurnGuard.test.ts` are green after Task 3.
- `pnpm codecheck` is green.
- `pnpm i18n-churn-guard` passes: under public/locales/ only `en/gamelib.json` changed.
- `git show --stat` for the three task commits lists only paths in `files_modified`. No unrelated dirty file was staged (native/steam-bridge/helper/bridge_helper.c, src/backend/storeManagers/steam/bridge/*, .planning/state.json, .planning/debug/*, .planning/spikes/*, other todos, the root .dxvk-cache), and `git diff public/locales/en/gamelib.json` still shows the foreign reorder hunks unstaged.
- `graphify update .` ran after the last code commit.
</verification>

<success_criteria>
- The settings dialog header holds the thumbnail, the title alone (two-line clamp) and the X; nothing overlaps; gamepad back still closes it.
- The subline reads Game settings · (Steam) App ID · Saved automatically, flashes Saved on a real write, shows Log/Categories for those modal types, and the footer is gone; the dialog keeps 80% height with the header and tab strip pinned.
- macOS Windows-engine games open on Run with Run first; other platforms unchanged; Wine/Winetricks translated; remembered tab runner-keyed with a one-time migration.
- Cards per sketch B on Run, Advanced and Wine; empty cards hidden; neutral notes for hints, danger kept for Legacy.
- Engine and Steam overlay always visible with (i); Launch without Steam: one description, one amber risk-only warning, DRM unchanged; noun labels with (i) across the listed fields.
- Both 2026-11-21 todos closed.
</success_criteria>

<uat_notes>
Post-execution human verification. This is NOT an executor task; the executor copies these items into the SUMMARY under `## Human UAT (pending)`. Run `pnpm tauri:dev` (never `tauri:dev:run`). These are frontend-only checks; the launcher.ts and launchFailure.ts copy changes need `pnpm build:sidecar` and a dev restart to show, and are not part of this list.

### 1. Header and X, short title
expected: Low Magic Age (576770) settings: thumbnail, "Low Magic Age" alone, X in the same row, subline "Game settings · Steam App ID 576770 · Saved automatically"; nothing overlaps any (i) control.
result: pending

### 2. Header and X, long title
expected: A game with a long title clamps it to two lines beside the X, and the dialog does not widen past the window.
result: pending

### 3. Saved flash
expected: Toggling any setting flashes "Saved" in the subline for about a second, then it returns to "Saved automatically".
result: pending

### 4. Opening tab and order on macOS
expected: 576770 opens on Run with tabs Run, Wine, Winetricks, Advanced; a game with an old remembered tab still opens on that tab once.
result: pending

### 5. Cards, notes and warning in three themes
expected: In midnightMirage, gruvbox_dark and dracula, cards (Launch, Steam, Launch target, Scripts, Wrappers & environment, Diagnostics & updates, Wine engine), the neutral Wine-engine note and the amber Launch-without-Steam warning are all legible and distinct from the dialog surface.
result: pending

### 6. Engine and Steam overlay
expected: Both are plain always-visible selects with (i) help, with no "(advanced)" twisty.
result: pending

### 7. Height and scrolling
expected: The dialog stays at 80% height across tabs, and the header and tab strip stay visible while scrolling Advanced, with no gap above the strip.
result: pending

### 8. Log, Categories and the Default settings page
expected: The Log and Categories modals show the header with "Log" / "Categories" and no Saved indicator; Settings > Game Defaults still renders with the neutral note, cards and its own footer.
result: pending
</uat_notes>

<output>
Create `.planning/quick/261121-dzl-game-settings-dialog-redesign-per-sketch/261121-dzl-SUMMARY.md` when done. Include a `## Human UAT (pending)` section that copies the uat_notes items verbatim, keeping the UAT item shape: `### N.` at column 0, inline `expected:`, and `result: pending`.
</output>
