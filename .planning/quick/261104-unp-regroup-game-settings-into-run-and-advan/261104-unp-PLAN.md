---
phase: quick-261104-unp
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts
  - public/locales/en/gamelib.json
autonomous: false
requirements: [QUICK-261104-unp]

must_haves:
  truths:
    - "Per-game Settings and the Game Defaults page no longer show an 'Other' tab on any platform"
    - "A 'Run' tab appears on every platform, for every game and on the Default page, and is never empty"
    - "Run holds, in order: Launch Options, Game Arguments, Preferred Language, Offline Mode, Show Stats Overlay, MangoHud, GameMode, Nvidia Prime, Steam overlay override"
    - "Advanced holds: Alternative Exe, Before/After launch scripts, Wrappers, Environment Variables, Verbose Logs, Ignore Game Updates, Prefer System Libs, BattlEye and EAC runtimes"
    - "Show Stats Overlay is hidden on Windows, for native Linux games and for native macOS Steam games, and shown for Wine games, for native macOS legendary/gog/sideload games, and on the Default page (non-Windows)"
    - "A game whose settings last opened on the old 'Other' tab now opens on Run; Wine stays the starting tab where it was before; everywhere the starting tab used to be Advanced or Other it is now Run"
  artifacts:
    - path: "src/frontend/screens/Settings/sections/GamesSettings/index.tsx"
      provides: "Run + Advanced tab split, single showStatsOverlay gate, 'other' -> 'run' saved-tab fallback"
      contains: "index={'run'}"
    - path: "src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts"
      provides: "Source-text placement, ordering, gate and starting-tab assertions (replaces nativeMacStatsOverlay.test.ts)"
    - path: "public/locales/en/gamelib.json"
      provides: "settings.navbar.run = 'Run'"
      contains: "\"run\": \"Run\""
  key_links:
    - from: "src/frontend/screens/Settings/sections/GamesSettings/index.tsx"
      to: "public/locales/en/gamelib.json"
      via: "t('gamelib:settings.navbar.run', 'Run')"
      pattern: "gamelib:settings\\.navbar\\.run"
    - from: "localStorage `${app_name}-setting_tab`"
      to: "useState(latestTabIndex)"
      via: "'other' remapped to 'run' before useState"
      pattern: "latestTabIndex === 'other'"
---

<objective>
Replace the per-game Settings "Other" tab with a "Run" tab of everyday "how this game runs"
choices, and leave "Advanced" with the power-user plumbing. Show Run on every platform.

Purpose: today the launch-time choices are split between an "Other" tab, which is hidden on
Windows and for native Mac games, and "Advanced". Users cannot predict where a setting lives.
Output: the regrouped GamesSettings/index.tsx, a new source-text test file, an updated
steamEnginePlacement test, and one new gamelib catalogue key.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@./CLAUDE.md
@src/frontend/screens/Settings/sections/GamesSettings/index.tsx
@src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts
@src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts

<interfaces>
Facts the planner checked, so the executor does not need to re-derive them:

- Self-gating components (they render nothing outside their condition):
  - ShowFPS: renders nothing on win32.
  - Mangohud and GameMode: Linux only.
  - NvidiaPrime: Linux only, and only with 2+ GPUs or the setting already on.
  - BattlEyeRuntime and EacRuntime: Linux only, so moving them to Advanced, which also shows on Windows and macOS, changes nothing there.
  - PreferSystemLibs: hidden on win32, Proton, CrossOver and system Wine.
  - LaunchOptionSelector: nothing when isDefault or there are 1 or fewer options.
  - LauncherArgs: nothing when isDefault.
  - OfflineMode: nothing when isDefault or the runner is not legendary.
  - SteamOverlayOverride: nothing unless the backend says the title is eligible.
  - PreferedLanguage: has no internal gate. It always renders.
- Why Run is never empty:
  - Non-sideloaded game and the Default page: PreferedLanguage renders on every platform.
  - Sideloaded per-game page: LauncherArgs renders, because the page is not the Default page.
- Today's getStartingTab results:
  - Default page: 'wine' off Windows, 'advanced' on Windows.
  - Per-game on win32: 'advanced'.
  - Windows-platform game off Windows: 'wine'.
  - Any other game on darwin: 'advanced'.
  - Any other game, i.e. Linux native: 'other'.
- Today's stats-overlay gate is the Other-tab visibility (linux, or mac when !isNative or
  isMacNativeStatsOverlayTitle) AND `(!isNative || isMacNativeStatsOverlayTitle)` on ShowFPS itself.
- The i18n churn guard (`meta/i18nCatalogChurnGuard.ts`) fails on ANY change under
  public/locales/ that is not a gamelib.json or gamelib.mt.json file, and the parser runs with keepRemoved: true.
  So the new label must be `gamelib:settings.navbar.run`. Under the bare `settings.navbar.run`
  key the parser would write into upstream translation.json. `settings.navbar.other` cannot
  be retired: deleting it edits translation.json, which the guard forbids, and keepRemoved
  stops the parser from dropping it. It becomes an unused key. Do not touch translation.json.
  The tm6 precedent for a default-namespace `t` is `t('gamelib:steam.engine.wineTabHint', '...')`
  in this same file.
- prettier `--file-info`:
  - index.tsx, both test files and src/backend/launcher.ts: `{ "ignored": false, "inferredParser": "typescript" }`.
  - public/locales/en/gamelib.json: `{ "ignored": true, "inferredParser": null }`. Do not prettier-check it. Hand-match its 4-space indentation and alphabetical key order, and guard it with JSON.parse.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Regroup Other + Advanced into Run + Advanced, with source-text tests</name>
  <files>src/frontend/screens/Settings/sections/GamesSettings/index.tsx, src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts, src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts, src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts, public/locales/en/gamelib.json</files>
  <behavior>
    The new runAdvancedTabs.test.ts follows the existing style. It reads index.tsx as text and
    uses a slice(marker) helper that cuts from the marker to the next `</TabPanel>`. There is
    no DOM renderer. The tests:
    - No Other tab remains. The source contains none of `index={'other'}`, `value="other"`, `settings.navbar.other`, `showOtherTab` or `isMacNativeStatsOverlayTitle`.
    - The Run tab is unconditional. The source contains `value="run"` and `t('gamelib:settings.navbar.run', 'Run')`. No `&&` guard comes directly before the Run `<Tab`. Check this by asserting that the text between the previous `/>` or `>` and the Run `<Tab` has no `&&`. Write the same assertion for the `<TabPanel value={value} index={'run'}>` opener.
    - The Run panel order is strict. The indexOf values of these tags increase: `<LaunchOptionSelector />`, `<LauncherArgs />`, `<PreferedLanguage />`, `<OfflineMode />`, `<ShowFPS />`, `<Mangohud />`, `<GameMode />`, `<NvidiaPrime />`, `<SteamOverlayOverride />`.
    - The Run panel keeps its gates. It contains `isMacSteamTitle && <SteamOverlayOverride />` and `showStatsOverlay && <ShowFPS />`. Both PreferedLanguage and OfflineMode sit inside a `!isSideloaded` guard. Assert that `!isSideloaded` appears before each of them in the slice.
    - The Advanced panel contains `<AlternativeExe />`, `<BeforeLaunchScriptPath />`, `<AfterLaunchScriptPath />`, `<WrappersTable />`, `<EnvVariablesTable />`, `<VerboseLogs />`, `<IgnoreGameUpdates />` (after a `!isSideloaded`), `isLinux && <PreferSystemLibs />`, and `<BattlEyeRuntime />` and `<EacRuntime />` inside a `{!isNative && (` group. It contains none of the nine Run components.
    - Each moved component tag (all nine Run tags and all Advanced tags above) appears exactly once in the whole source.
    - Stats gate: the `const showStatsOverlay =` expression runs to the next blank line. It contains `!isWin`, `!isNative`, `isMac`, `!isBrowserGame`, `'legendary'`, `'gog'`, `'nile'` and `'sideload'`. It does not contain `steam`.
    - getStartingTab is sliced from `function getStartingTab` to `export default function GamesSettings`. It contains `'run'` and `'wine'`. It contains neither `'advanced'` nor `'other'`.
    - The saved-tab fallback matches `/latestTabIndex === 'other'[\s\S]{0,120}'run'/`.
    - Catalogue: `JSON.parse(public/locales/en/gamelib.json).settings.navbar.run === 'Run'`. Use the same relative path steamEnginePlacement.test.ts uses.
  </behavior>
  <action>
RED: create runAdvancedTabs.test.ts with the behaviour above. Run it and confirm it fails
against today's index.tsx. Then `git rm` nativeMacStatsOverlay.test.ts. Its 261104-uas
assertions move into the new file as the stats-gate test. This is a clean replacement, per the
locked decision.

GREEN, in index.tsx:

(1) getStartingTab.
- Default page: 'wine' off win32, otherwise 'run'.
- Per-game: 'wine' when the host is not win32 and the install platform is in windowsPlatforms, otherwise 'run'.
- Wine stays the starting tab exactly where it is today. Every former 'advanced' or 'other' result becomes 'run'.

(2) Remove shouldShowSettings and showOtherTab.
- Replace them with a plain `const showWineTab = !(isWin || isNative || isBrowserGame)`, which is the same logic.
- Keep the showWinetricksTab call unchanged.

(3) Delete isMacNativeStatsOverlayTitle. Add one `const showStatsOverlay` that encodes the whole carried-over 261104-uas rule. Keep the explicit allow-list rather than an `!== 'steam'` test, so a future runner is opted in deliberately:
- `!isWin`, AND
- `!isNative`, OR all of: isMac, !isDefault, !isBrowserGame, and gameInfo?.runner in ['legendary', 'gog', 'nile', 'sideload'].
- Write it as a single expression with no blank line inside it.
- Give it a one-line comment saying: native Linux games and native macOS Steam games (steam://rungameid cannot take env vars) are excluded; nile is listed but inert because isNative is Windows-only for it.
- What this preserves: the Default page keeps today's behaviour, because isNative is false there (shown off Windows, hidden on Windows). The explicit !isWin duplicates ShowFPS's own gate on purpose, so the rule reads completely in one place.

(4) Saved-tab fallback. After reading `latestTabIndex` and before the existing winetricks fallback, add an `if (latestTabIndex === 'other') latestTabIndex = 'run'` with a comment: the Other tab was removed in 261104-unp. 'advanced' remains a valid saved value.

(5) Tabs bar. Remove the Other `<Tab>`. Add an unconditional `<Tab label={t('gamelib:settings.navbar.run', 'Run')} value="run" />` in Other's old slot, after Wine/Winetricks and before Advanced. The `gamelib:` namespace is required by the churn guard, not chosen. See interfaces.

(6) Replace the 'other' and 'advanced' TabPanels with a 'run' panel and an 'advanced' panel. Use exactly the locked component order from must_haves, and these gates:
- PreferedLanguage and OfflineMode each sit under `!isSideloaded`. Two separate guards are fine because the components are no longer adjacent.
- ShowFPS sits under `showStatsOverlay &&`.
- Mangohud, GameMode and NvidiaPrime are unguarded (they self-hide).
- SteamOverlayOverride sits under `isMacSteamTitle &&`.
- In Advanced: IgnoreGameUpdates under `!isSideloaded`; PreferSystemLibs under `isLinux &&`; BattlEyeRuntime and EacRuntime under `!isNative &&` as a fragment.
- Keep the scripts `<div className="Field">` with its `t('setting.scripts', 'Scripts:')` label exactly as it is.
- Move the "Phase 60 D-02" SteamOverlayOverride comment with the component into Run. Keep the one-line tm6 engine-override pointer comment in Advanced, or drop it if it reads oddly. It is a comment only.

(7) Update steamEnginePlacement.test.ts. Rename the test "Advanced tab keeps only the overlay override" to say the overlay override moved to Run (261104-unp). Its assertions become:
- the Advanced slice contains neither `<SteamEngineOverride />` nor `<SteamOverlayOverride />`;
- the slice from `index={'run'}>` contains `isMacSteamTitle && <SteamOverlayOverride />`.
Leave the other three tests unchanged.

(8) In public/locales/en/gamelib.json, under the existing top-level "settings" object, add `"navbar": { "run": "Run" }`.
- Place it in alphabetical order among the existing settings keys: after "loginBackgroundHelp", before "steamgriddb".
- Use 4-space indentation to match the file.
- Hand-match the file's format, because prettier ignores it.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && test ! -e src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts && pnpm test -- src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts && npx tsc --noEmit && node -e "JSON.parse(require('fs').readFileSync('public/locales/en/gamelib.json','utf8'))" && npx prettier --check src/frontend/screens/Settings/sections/GamesSettings/index.tsx src/frontend/screens/Settings/sections/GamesSettings/__tests__/runAdvancedTabs.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts</automated>
    The prettier check leaves out public/locales/en/gamelib.json. `npx prettier --file-info` reports it as `{ "ignored": true, "inferredParser": null }`, so checking it would be vacuous. The JSON.parse step guards it instead. Before running the check, re-run `npx prettier --file-info` on the new runAdvancedTabs.test.ts and confirm `"ignored": false`. It sits beside a sibling that reports false, so it is expected to match.
  </verify>
  <done>
- Both test files pass. runAdvancedTabs.test.ts failed first (RED) against the old index.tsx.
- nativeMacStatsOverlay.test.ts is deleted and its assertions now live in the new file.
- index.tsx has no Other tab, no shouldShowSettings and no isMacNativeStatsOverlayTitle.
- Run is unconditional and holds the nine locked components in order. Advanced holds the locked set.
- tsc and the scoped prettier check are clean.
  </done>
</task>

<task type="auto">
  <name>Task 2: i18n workflow, gates, and stale-pointer sweep</name>
  <files>public/locales/en/gamelib.json, src/backend/launcher.ts</files>
  <action>
(1) Run `pnpm i18n`, then `pnpm i18n-churn-guard`.
- `git status --porcelain public/locales` must list only `*/gamelib.json` or `*/gamelib.mt.json` paths. The parser may add `settings.navbar.run` to other locales' gamelib.json, which the guard allows.
- If translation.json or any other upstream catalogue changed, a `t()` call is missing its `gamelib:` prefix. Fix the call site and `git checkout -- public/locales/` the upstream file. Do not hand-edit around it.
- `settings.navbar.other` stays in translation.json as an unused key. Removing it would be upstream churn, which the guard forbids, and keepRemoved retains it anyway. Record this in the SUMMARY as the "retire only if the guard allows" outcome: the guard does not allow it.

(2) Run the hardcoded-string and churn gate tests.

(3) Look for user-facing copy that points at the removed Other tab, or at Advanced for an item that moved to Run (launch options, game arguments, language, offline mode, stats overlay, MangoHud, GameMode, Nvidia Prime, overlay override). Grep src/ and public/locales/en/, excluding __tests__, for: `Other tab`, `> Other`, `Other >`, `Advanced tab`, `Advanced >`, `> Advanced`.
- Known hit: src/backend/launcher.ts:206 says "Game's settings > Advanced tab > 'Enable verbose logs'". It is still correct, because VerboseLogs stays on Advanced. Leave it.
- Fix any other stale pointer you find, with the matching catalogue key's value updated in the same edit. If a hit lives in an upstream catalogue (translation.json, gamepage.json, login.json), do not edit that file. Report the hit in the SUMMARY instead.
- If nothing needs fixing, launcher.ts is not modified and there is nothing to prettier-check from this task.

(4) Run `graphify update .` after the code changes, per CLAUDE.md.
  </action>
  <verify>
    <automated>cd /Users/graysonmitchell/Projects/GameLib && pnpm i18n && pnpm i18n-churn-guard && test -z "$(git status --porcelain public/locales | grep -Ev '/gamelib(\.mt)?\.json$')" && pnpm test -- meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__ && ! grep -rnE "Other tab|> Other|Other >" src public/locales/en --include='*.ts' --include='*.tsx' --include='*.json' | grep -v __tests__ && grep -n "Advanced tab > 'Enable verbose logs'" src/backend/launcher.ts</automated>
    Only prettier-ignored public/locales files (`--file-info`: ignored true) are expected to change in this task, so the prettier check is omitted rather than run vacuously. If the stale-pointer sweep edits any src/ file, first confirm `npx prettier --file-info <path>` reports `"ignored": false`, then append `&& npx prettier --check <exact edited paths>` to this command.
  </verify>
  <done>
- `pnpm i18n` produces gamelib-only churn, and the churn guard passes.
- The hardcoded-string and churn gate tests pass, and so does the whole GamesSettings __tests__ directory.
- No user-facing copy points at an Other tab. The verbose-logs Advanced pointer is confirmed still correct.
- The graph is updated.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: Live-check Run and Advanced tabs on macOS</name>
  <what-built>
The Other tab is gone. Per-game Settings and Game Defaults show Run, which holds the everyday launch choices, and Advanced, which holds the power-user plumbing. Show Stats Overlay follows the 261104-uas rules. A saved "Other" tab falls back to Run.
  </what-built>
  <how-to-verify>
1. Start the app with `pnpm tauri:dev`. Do not use `pnpm tauri:dev:run`: it skips the dev-vault flag. This change is frontend-only, so no sidecar rebuild is needed.
2. Open a native macOS Steam game's Settings (it has a Wine tab with the Engine control).
   - Tabs, in order: Wine, (Winetricks if shown), Run, Advanced. No Other tab.
   - Run shows Game Arguments and Preferred Language. It shows the Steam overlay override if the title is eligible. It shows no "Show Stats Overlay".
3. Open a Windows game that runs through Wine/CrossOver.
   - Settings opens on the Wine tab.
   - Run shows "Show Stats Overlay" after Preferred Language (and after Offline Mode, for Epic games).
4. Open a native macOS GOG or Epic game, if you have one installed.
   - Settings opens on Run, which includes "Show Stats Overlay".
   - Advanced shows Alternative Exe, Scripts, Wrappers, Environment Variables, Verbose Logs and Ignore Game Updates.
5. Open Settings > Game Defaults. It opens on Wine. Run exists and shows Preferred Language and Show Stats Overlay.
6. Saved-tab fallback. On a game from step 3, open DevTools and run `localStorage.setItem('<app_name>-setting_tab','other')` with that game's app_name. Close and reopen its Settings. It opens on Run, not on a blank panel.
  </how-to-verify>
  <resume-signal>Type "approved" or describe what is wrong (which game, which tab, what you saw)</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| localStorage -> GamesSettings tab state | A persisted tab key from an older build, which may name a tab that no longer exists |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-261104-unp-01 | Denial of service | GamesSettings saved-tab read | mitigate | A persisted 'other' value is remapped to 'run' before useState, so `value` never points at an unrendered Tab (blank panel). The existing winetricks fallback is kept. |
| T-261104-unp-02 | Tampering | public/locales upstream catalogues | mitigate | The new label uses the `gamelib:` namespace. Task 2 runs `pnpm i18n` and `pnpm i18n-churn-guard` and asserts that only gamelib catalogue paths changed. |
| T-261104-unp-03 | Information disclosure | Settings UI regroup | accept | Only existing settings move between tabs. No new data flows, IPC or persisted keys. |
</threat_model>

<verification>
- `pnpm test -- src/frontend/screens/Settings/sections/GamesSettings/__tests__ meta/__tests__/hardcodedStringGate.test.ts meta/__tests__/i18nCatalogChurnGuard.test.ts` passes.
- `npx tsc --noEmit` is clean. The scoped prettier check over the edited .ts/.tsx paths is clean.
- `pnpm i18n` followed by `pnpm i18n-churn-guard` is clean, with gamelib-only churn.
- The human live-check (Task 3) is approved.
</verification>

<success_criteria>
- No Other tab anywhere. Run is shown unconditionally and is never empty: PreferedLanguage always renders for non-sideloaded games and on the Default page, and LauncherArgs renders for sideloaded per-game pages.
- The locked Run and Advanced membership and order are implemented exactly, with the gates kept.
- Show Stats Overlay visibility matches 261104-uas through one `showStatsOverlay` gate, with no layered Other-tab gate.
- Starting tab: Wine where it was before, Run everywhere else. A saved 'other' maps to 'run'.
- The 'Run' label is in gamelib.json under settings.navbar.run.
</success_criteria>

<output>
Create `.planning/quick/261104-unp-regroup-game-settings-into-run-and-advan/261104-unp-SUMMARY.md` when done.
</output>
