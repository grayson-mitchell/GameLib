---
phase: quick-261104-uas
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/frontend/screens/Settings/sections/GamesSettings/index.tsx
  - src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts
autonomous: true
requirements: [QUICK-261104-uas]

must_haves:
  truths:
    - "Per-game Settings for a native macOS Epic (legendary), GOG, Amazon (nile) or sideloaded game shows an Other tab containing only the Show Stats Overlay toggle"
    - "Native macOS Steam games still show no Show Stats Overlay toggle (steam://rungameid launches cannot receive MTL_HUD_ENABLED)"
    - "Windows, native Linux games, browser games and the Default settings page behave exactly as before"
  artifacts:
    - path: "src/frontend/screens/Settings/sections/GamesSettings/index.tsx"
      provides: "isMacNativeStatsOverlayTitle gate used by shouldShowSettings('other') and the ShowFPS render"
      contains: "isMacNativeStatsOverlayTitle"
    - path: "src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts"
      provides: "Source-text assertions pinning the new gate"
  key_links:
    - from: "GamesSettings Other TabPanel"
      to: "ShowFPS"
      via: "(!isNative || isMacNativeStatsOverlayTitle) && <ShowFPS />"
      pattern: "isMacNativeStatsOverlayTitle\\) && <ShowFPS />"
    - from: "ShowFPS showFps setting"
      to: "src/backend/launcher.ts setupEnvVars"
      via: "MTL_HUD_ENABLED=1 when isMac && showFps (already wired; no backend change)"
      pattern: "MTL_HUD_ENABLED"
---

<objective>
Expose the existing "Show Stats Overlay" toggle (ShowFPS, Metal HUD) in per-game Settings for
native macOS games from legendary, gog, nile and sideload. Today `shouldShowSettings('other')`
hides the Other tab for every native Mac game and the Other panel wraps ShowFPS in `!isNative`,
so the toggle is unreachable even though the backend already honors it for these runners.

Purpose: Metal HUD works for native Mac games launched with our env (legendary/games.ts:952,
gog/games.ts:650, nile/games.ts:369, storeManagerCommon/games.ts:250 all call setupEnvVars, and
launcher.ts:1130 sets MTL_HUD_ENABLED=1 when isMac && showFps). Only the UI gate is missing.
Output: one gate constant in GamesSettings/index.tsx, plus a source-text test.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@src/frontend/screens/Settings/sections/GamesSettings/index.tsx
@src/frontend/screens/Settings/components/ShowFPS.tsx
@src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts

<interfaces>
Current code in GamesSettings/index.tsx (verbatim, as of planning):

- line ~89-93:
  const isBrowserGame = gameInfo?.install.platform === 'Browser'
  const isSideloaded = gameInfo?.runner === 'sideload'
  // Shared gate (was D-14's): per-game Steam titles on macOS, never Default.
  const isMacSteamTitle = !isDefault && isMac && gameInfo?.runner === 'steam'

- shouldShowSettings, 'other' branch:
  // Other tab show on linux and mac (if not native)
  if (isLinux || (isMac && !isNative)) {
    return true
  }

- Other TabPanel first child:
  {!isNative && <ShowFPS />}

- getStartingTab(platform, gameInfo): returns 'advanced' on darwin for non-Windows-platform games;
  'other' is only the starting tab on Linux. Persisted tab = localStorage `${app_name}-setting_tab`.
- isNative is useState(false), set asynchronously from window.api.isNative({appName, runner}).

ShowFPS.tsx own gate: `!isWin || (isLinux && !isLinuxNative)` -> renders on macOS regardless of
nativeness; title on Mac is t('setting.showMetalOverlay', 'Show Stats Overlay'). Do NOT edit it.
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add the native-Mac stats-overlay gate and pin it with a source-text test</name>
  <files>src/frontend/screens/Settings/sections/GamesSettings/index.tsx, src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts</files>
  <behavior>
    - Test 1: source defines `const isMacNativeStatsOverlayTitle =` and its expression contains `!isDefault`, `isMac`, `isNative`, `!isBrowserGame`, and each of the runner literals 'legendary', 'gog', 'nile', 'sideload' — and does NOT contain 'steam'.
    - Test 2: the 'other' branch of shouldShowSettings contains `isLinux || (isMac && (!isNative || isMacNativeStatsOverlayTitle))`.
    - Test 3: the Other TabPanel slice (from "index={'other'}>" to the next '</TabPanel>', using the same slice helper as steamEnginePlacement.test.ts) contains `(!isNative || isMacNativeStatsOverlayTitle) && <ShowFPS />` and no longer contains the bare `{!isNative && <ShowFPS />}`.
    - Test 4: the Other TabPanel still wraps BattlEyeRuntime/EacRuntime in `!isNative &&` (nothing else becomes visible for native Mac games).
  </behavior>
  <action>
    Write the test file first, modelled on steamEnginePlacement.test.ts (readFileSync of '../index.tsx', a slice(startMarker) helper; no locale load needed). Run it and confirm it fails (RED).

    Then in index.tsx, directly after the isMacSteamTitle line, add a commented constant:
    `isMacNativeStatsOverlayTitle = !isDefault && isMac && isNative && !isBrowserGame && ['legendary', 'gog', 'nile', 'sideload'].includes(gameInfo?.runner ?? '')`
    with a one-line comment stating why: these runners launch native Mac binaries through setupEnvVars so MTL_HUD_ENABLED reaches the game; native Mac Steam launches via steam://rungameid and cannot receive env vars, so 'steam' is deliberately absent. Use an explicit runner allow-list (not `runner !== 'steam'`) so a future runner does not silently gain a toggle that does nothing. Browser games are excluded because they open in a browser, not via setupEnvVars.

    Change the shouldShowSettings 'other' condition to `isLinux || (isMac && (!isNative || isMacNativeStatsOverlayTitle))` and update its comment to say "and native Mac games that can take the Metal HUD". Change the Other panel's first child to `{(!isNative || isMacNativeStatsOverlayTitle) && <ShowFPS />}`. Leave Mangohud/GameMode/NvidiaPrime (self-hide off Linux), PreferSystemLibs (`isLinux`), and the `!isNative` BattlEye/EAC wrapper untouched — so for native Mac non-Steam games the Other tab contains only ShowFPS.

    Do not touch getStartingTab or the persisted-tab fallback: on darwin the starting tab stays 'advanced', and the Other tab is only ever made MORE visible by this change, so a persisted 'other' value can never point at an unrendered tab as a result of it (the existing case — native Mac Steam game with a stale persisted 'other' — is pre-existing and out of scope). Linux native games keep the hidden toggle because the new constant requires isMac. Windows keeps the Other tab hidden because the 'other' branch requires isLinux or isMac. The Default page is unchanged because the constant requires !isDefault (and isNative is false there).

    Briefly confirm (one grep, no re-derivation) that window.api.isNative returns true for native Mac installs of the four runners, e.g. grep the backend isNative handler for its runner switch; if any of the four is unhandled, note it in the SUMMARY rather than expanding scope.

    Run the test again (GREEN), then the existing steamEnginePlacement test to confirm no regression.
  </action>
  <verify>
    <automated>pnpm jest --runTestsByPath src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts src/frontend/screens/Settings/sections/GamesSettings/__tests__/steamEnginePlacement.test.ts && npx tsc --noEmit -p . && npx eslint src/frontend/screens/Settings/sections/GamesSettings/index.tsx src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts && npx prettier --check src/frontend/screens/Settings/sections/GamesSettings/index.tsx src/frontend/screens/Settings/sections/GamesSettings/__tests__/nativeMacStatsOverlay.test.ts</automated>
  </verify>
  <done>New test passes (and failed before the index.tsx change); steamEnginePlacement test still passes; tsc, eslint and scoped prettier --check (index.tsx confirmed not prettier-ignored via --file-info at planning time) are clean; ShowFPS.tsx and backend files are unmodified.</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Live check the toggle on macOS</name>
  <what-built>Show Stats Overlay toggle is now reachable for native Mac Epic/GOG/Amazon/sideloaded games.</what-built>
  <how-to-verify>
    1. Start the app with `pnpm tauri:dev` (not tauri:dev:run).
    2. Open per-game Settings for a native macOS GOG or Epic game (or a sideloaded native Mac app). Expected: an Other tab appears containing only "Show Stats Overlay".
    3. Enable it, launch the game. Expected: the Metal HUD appears in the game window.
    4. Open per-game Settings for a native macOS Steam game. Expected: no Show Stats Overlay toggle (Other tab absent or without it).
    5. Open the Default settings page. Expected: unchanged from before.
  </how-to-verify>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| renderer settings -> backend launch env | showFps boolean maps to a fixed env var MTL_HUD_ENABLED=1 |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-uas-01 | Tampering | GamesSettings visibility gate | accept | UI-only visibility change; the persisted value is a boolean already accepted by setupEnvVars, which writes a constant string — no new input path |
</threat_model>

<verification>
Task 1 automated block passes; Task 2 live check approved.
</verification>

<success_criteria>
Native Mac legendary/gog/nile/sideload games show the Show Stats Overlay toggle and enabling it shows the Metal HUD; native Mac Steam, Windows, native Linux, browser games and the Default page are unchanged.
</success_criteria>

<output>
Create `.planning/quick/261104-uas-show-stats-overlay-for-native-mac-games/261104-uas-SUMMARY.md` when done
</output>
