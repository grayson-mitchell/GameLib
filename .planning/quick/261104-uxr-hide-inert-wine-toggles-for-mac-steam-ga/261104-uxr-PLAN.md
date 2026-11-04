---
phase: quick-261104-uxr
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts
autonomous: false
requirements: [QUICK-261104-uxr]

must_haves:
  truths:
    - "On a macOS per-game Settings page for a Steam title, the Wine tab no longer renders AutoDXVK, AutoDXVKNVAPI, AutoVKD3D, EnableEsync, EnableFsync, EnableWineWayland, EnableWoW64, EnableMsync, AdvertiseAvxForRosetta, EnableFSR or EnableDXVKFpsLimit"
    - "<Tools /> still renders under the same `!isCrossover` condition as before, for Steam titles too"
    - "Non-Steam games, non-macOS hosts and the Default settings page render the Wine tab exactly as before"
    - "The hint 'GameLib chooses the Wine engine and bottle for Steam games.' and the Engine (advanced) override still render for macOS Steam titles"
  artifacts:
    - path: "src/frontend/screens/Settings/sections/GamesSettings/index.tsx"
      provides: "`!isMacSteamTitle` gate around the inert toggles inside the `!isCrossover` block"
      contains: "{!isMacSteamTitle && ("
    - path: "src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts"
      provides: "Source-text assertions that the eleven toggles sit behind `!isMacSteamTitle` and Tools does not"
  key_links:
    - from: "GamesSettings/index.tsx Wine TabPanel"
      to: "isMacSteamTitle (index.tsx:91)"
      via: "conditional render wrapping the toggles, Tools left outside"
      pattern: "!isMacSteamTitle && \\("
---

<objective>
For macOS Steam titles, hide the Wine-tab toggles that do nothing at launch, and keep `<Tools />`.

Purpose: these toggles write the per-game GameConfig file, and the bridged launch never reads that file for these keys. Each toggle therefore looks like it worked and changes nothing. Quick 261104-tm6 already hid the which-Wine controls for the same reason and left this block unchanged. See its SUMMARY, "Left unchanged".
Output: one gated block in index.tsx and one red-first test in steamEnginePlacement.test.ts.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/quick/261104-tm6-move-steam-engine-override-to-wine-tab/261104-tm6-SUMMARY.md
@src/frontend/screens/Settings/sections/GamesSettings/index.tsx
@src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts

## Evidence (planner investigation, 2026-11-04). The executor does not need to re-derive it.

**Where the per-game toggles write.** Each toggle calls `useSetting` → `SettingsContext.setSetting` → `window.api.setSetting({appName, key, value})` (useSettingsContext.ts:66-80, :146-151). For a per-game page the sidecar routes this to `applyGameSetting` (settingsFlowRegistration.ts:161-189), which calls `GameConfig.get(appName).setSetting(key, value)` (gameSettingWrite.ts:23). That writes the title's own per-game file. Nothing on this page writes the shared Steam bottle config or the bridge bottle.

**What the page displays.** `requestGameSettings` for a Steam appName returns `SteamGame.getSettings()` (settingsFlowRegistration.ts:131-135). For a bottle-eligible title that is `getSteamBottleSettings()`, which is `{...GlobalConfig settings, shared-bottle wineVersion}` (bottle.ts:340-391), merged with only `pickTitleSettings(...)` (games.ts:1272-1300). The toggles therefore show the GLOBAL default, not the value just written. If you toggle one and reopen Settings, it snaps back.

**What the bridged launch reads.** `TITLE_AUTHORITATIVE_KEYS` (titleSettings.ts:50-62) is the only path by which per-game file keys reach a Steam launch. It holds launcherArgs, targetExe, enviromentOptions, wrapperOptions, the before/after scripts, language, verboseLogs, showFps, showMangohud and lastUsedLaunchOption. It holds none of the keys listed below. The bridge launch builds its settings from `getBridgeBottleSettings(appId)` (games.ts:5159; bottle.ts:1782-1796). All three branches spread `GlobalConfig.get().getSettings()` and never read the per-game file:
- stock: bottle.ts:1471-1486
- DRM/overlay: built on stock, bottle.ts:1609-1640
- non-CrossOver fallback: bottle.ts:1730-1758. This branch also forces `autoInstallDxvk: false` at :1748.

Those settings flow through `fireBridgeWineLaunch` (games.ts:5585) into `runWineCommand({gameSettings: launchSettings})` (games.ts:5824). `runWineCommand` uses the passed object (launcher.ts:1533-1553) for `setupWineEnvVars` (launcher.ts:1194).

**Per toggle:**

| Toggle | Key | Per-game value reaches bridged launch? | Notes |
|---|---|---|---|
| AutoDXVK | autoInstallDxvk | No | Not in the allowlist. Its switch also calls `toggleDXVK`, which installs into `GameConfig.get(appName).getSettings()`'s prefix (wineToolsFlowRegistration.ts:251-258). That is neither the bridge bottle nor the shared Steam bottle. Hiding it also removes a stray DXVK install into an unused prefix. |
| AutoDXVKNVAPI / AutoVKD3D | autoInstallDxvkNvapi / autoInstallVkd3d | No | Already inside `isLinux &&`, so they never render on macOS. Gated anyway so the block is uniform. |
| EnableEsync | enableEsync | No | Read at launcher.ts:1247, from the global-spread object only. |
| EnableFsync | enableFsync | No | Linux-only in the launcher (:1262) and in the component (EnableFsync.tsx:16). |
| EnableWineWayland | enableWineWayland | No | Linux-only (launcher.ts:1268; component :20). |
| EnableWoW64 | enableWoW64 | No | Linux-only (launcher.ts:1281; component :16). |
| EnableMsync | enableMsync | No | Read at launcher.ts:1253, from the global-spread object only. |
| AdvertiseAvxForRosetta | advertiseAvxForRosetta | No | Read at launcher.ts:1383, from the global-spread object only. |
| EnableFSR | enableFSR | No | Read at launcher.ts:1241, from the global-spread object only. The component is Linux-only (:18). |
| EnableDXVKFpsLimit | enableDXVKFpsLimit | No | Read at launcher.ts:1238, from the global-spread object only. |

No toggle in the list takes effect for a bridged macOS Steam launch. All eleven are hidden. (The global/Default value does reach the launch, which is why the Default page stays unchanged.)

**Tools: keep.** `Tools` calls `window.api.callTool({appName, runner})` (Tools/index.tsx:36-40). The sidecar resolves `libraryManagerMap[runner].getGame(appName).getSettings()` (runnerMiscFlowRegistration.ts:140-150). For Steam that is `getSteamBottleSettings()`, the shared Steam bottle, so winecfg and Run EXE do act on a real bottle. This matches the 261104-tm6 finding. Tools stays outside the new gate, under `!isCrossover` exactly as today.

**Caveat on visibility today.** `isCrossover` (index.tsx:85) reads the displayed `wineVersion`. For a Steam title that is the shared bottle's engine, and `getSteamBottleSettings` resolves it to CrossOver whenever CrossOver is on disk (bottle.ts:359-363). On a Mac with CrossOver, the whole `!isCrossover` block, Tools included, is therefore already hidden for Steam titles. The block renders, and this change shows, when CrossOver is absent, for example on a Wine-Staging-fallback machine. The live check below can confirm no regression on a CrossOver host, but it cannot show the toggles being removed there.

**Copy (requirement 5):** no change. After this change, a macOS Steam Wine tab renders the existing hint, the collapsed Engine (advanced) control and, on non-CrossOver hosts, Tools. Nothing that remains contradicts the hint, so it is not empty or confusing. No i18n edit, so gamelib.json is untouched.

<interfaces>
From index.tsx (current):
- L84 `const isMac = platform === 'darwin'`
- L85 `const isCrossover = wineVersion?.type === 'crossover'`
- L91 `const isMacSteamTitle = !isDefault && isMac && gameInfo?.runner === 'steam'`
- L225-244: the `{!isCrossover && ( <> ...toggles... <Tools /> </> )}` block inside `<TabPanel value={value} index={'wine'}>`

From steamEnginePlacement.test.ts:
- `source` = index.tsx text; `slice(startMarker)` returns the text from the marker to the next `</TabPanel>`
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Gate the inert Wine toggles behind !isMacSteamTitle (red-first test)</name>
  <files>src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts, src/frontend/screens/Settings/sections/GamesSettings/index.tsx</files>
  <behavior>
    - Test A: the Wine panel slice (`slice("index={'wine'}>")`) contains `{!isMacSteamTitle && (`, and that marker comes after `{!isCrossover && (`.
    - Test B: take the substring of the Wine slice from the `{!isMacSteamTitle && (` marker to `<Tools />`. Each of these eleven tags appears in it: `<AutoDXVK />`, `<AutoDXVKNVAPI />`, `<AutoVKD3D />`, `<EnableEsync />`, `<EnableFsync />`, `<EnableWineWayland />`, `<EnableWoW64 />`, `<EnableMsync />`, `<AdvertiseAvxForRosetta />`, `<EnableFSR />`, `<EnableDXVKFpsLimit />`. Each also appears exactly once in the whole Wine slice, so no ungated copy exists. Count with `split(tag).length - 1`.
    - Test C: `<Tools />` appears exactly once in the Wine slice, after the gated group. The gated substring, trimmed, ends with `)}`, which proves the gate closes before Tools. `<Tools />` comes after `{!isCrossover && (`.
    - Test D: the Legacy panel (`slice("index={'legacy'}>")`) still contains `<EnableDXVKFpsLimit />`. This guards the Linux-only Legacy tab against an over-eager edit.
  </behavior>
  <action>
RED: add a new `describe('Inert Wine toggles hidden for macOS Steam titles (quick 261104-uxr)', ...)` to steamEnginePlacement.test.ts, after the existing describe. Implement Tests A-D using the existing `source` and `slice` helpers, with no new imports. Run the test file and confirm Tests A-C fail against the current index.tsx. Test D passes already. Commit as `test(quick-261104-uxr): add failing placement test for inert Wine toggles`.

GREEN: in index.tsx, inside the existing `{!isCrossover && ( <> ... </> )}` block in the Wine TabPanel, wrap everything from `<AutoDXVK />` through `{isMac && <EnableDXVKFpsLimit />}` in `{!isMacSteamTitle && ( <> ... </> )}`. The inner `isLinux` sub-block and the `isMac &&` guard keep their current order and conditions. Leave `<Tools />` as the last child of the `!isCrossover` fragment, outside the new gate. Tools acts on the shared Steam bottle via callTool → SteamGame.getSettings → getSteamBottleSettings (requirement 2).

Above the `!isCrossover` block, add a short JSX comment in the style of the existing tm6 comment at L201-206. It should say that for macOS Steam titles these toggles write the per-game file, which the bridged launch never reads for them: getBridgeBottleSettings spreads GlobalConfig, and TITLE_AUTHORITATIVE_KEYS in titleSettings.ts excludes them. It should also say that Tools stays because it acts on the shared Steam bottle.

Do not change `isMacSteamTitle`, `isCrossover`, `showWinetricksTab`, the hint, the Engine override, any component file, the Legacy tab, or any locale file. Per requirement 5, no copy change is needed; see Evidence above. Non-Steam, non-macOS and Default paths stay identical because `isMacSteamTitle` is false for all of them (index.tsx:91).

Run the test again and confirm it is green. Commit as `feat(quick-261104-uxr): hide inert Wine toggles for macOS Steam titles`.
  </action>
  <verify>
    <automated>npx jest src/frontend/screens/Settings/sections/GamesSettings/__tests__/ && npx tsc --noEmit && npx prettier --file-info src/frontend/screens/Settings/sections/GamesSettings/index.tsx && npx prettier --file-info src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts && npx prettier --check src/frontend/screens/Settings/sections/GamesSettings/index.tsx src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts</automated>
    Both paths report `{ "ignored": false, "inferredParser": "typescript" }` (probed at planning time), so the scoped `--check` is a real check. The RED run must be observed failing on Tests A-C before the index.tsx edit. Record its failing output in the SUMMARY.
  </verify>
  <done>Tests A-D pass. The existing four placement tests and runAdvancedTabs.test.ts still pass. tsc is clean and prettier --check over the two paths is clean. git log shows a test commit before the feat commit. The index.tsx diff is limited to the Wine TabPanel's `!isCrossover` block plus one comment.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Live regression check in the running app</name>
  <what-built>The eleven inert Wine toggles are now gated behind `!isMacSteamTitle`. Tools, the hint and the Engine override are unchanged.</what-built>
  <how-to-verify>
    1. Run `pnpm tauri:dev` (not `tauri:dev:run`). Restart it if it was already running, so the frontend picks up the change.
    2. Open a macOS bridged Steam game, go to Settings, then the Wine tab. Expected: the hint line "GameLib chooses the Wine engine and bottle for Steam games." and the collapsed "Engine (advanced)" control are shown, and none of the DXVK, Esync, Msync, AVX or FPS-limit toggles appear. Note: on a Mac where CrossOver is installed, this block was already hidden before the change (see the Evidence caveat), so this step confirms only that nothing regressed. If this Mac has no CrossOver resolved for the Steam bottle, Tools (winecfg / Run EXE) should also appear.
    3. Open a non-Steam Windows game (Epic, GOG or sideload), go to Settings, then the Wine tab. Expected: the same controls as before the change, including Wine Version, Prefix and the toggles appropriate to its engine.
    4. Open the Default settings page, Games section, Wine tab. Expected: the toggles are shown as before.
  </how-to-verify>
  <files>none (live check only)</files>
  <action>Executor: confirm Task 1 is committed, then present the how-to-verify steps to the user and wait. Do not edit any file in this task.</action>
  <verify>Human-only: the operator runs the steps above in `pnpm tauri:dev`. There is no automated equivalent for the rendered tab. Task 1's source-text test is the automated gate.</verify>
  <done>The user replies "approved", or reports differences, which are recorded in the SUMMARY.</done>
  <resume-signal>Type "approved", or describe what differs.</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer → sidecar (setSetting) | Unchanged. This plan only removes controls from rendering and adds no channel or input. |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-uxr-01 | Tampering | GamesSettings Wine tab | accept | Render-only change. No new writes or IPC, and the existing per-game write path (applyGameSetting, WR-01 containment) is untouched. |
| T-uxr-02 | Denial of service | AutoDXVK → toggleDXVK on a Steam title | mitigate | Hiding AutoDXVK for macOS Steam titles removes a UI path that installed DXVK into an unused per-game prefix (wineToolsFlowRegistration.ts:251-258). |
</threat_model>

<verification>
- `npx jest src/frontend/screens/Settings/sections/GamesSettings/__tests__/` is green, with the new describe block included.
- `npx tsc --noEmit` is clean.
- `npx prettier --check` over the two exact paths is clean.
- The live check (Task 2) is approved.
</verification>

<success_criteria>
- macOS Steam titles: the Wine tab shows the hint, the Engine override and, where `!isCrossover`, Tools. None of the eleven toggles render.
- Every other combination of host, runner and Default page renders as before.
- The test was red before the source change and is green after it.
</success_criteria>

<output>
Create `.planning/quick/261104-uxr-hide-inert-wine-toggles-for-mac-steam-ga/261104-uxr-SUMMARY.md` when done.
</output>
