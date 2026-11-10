// Phase 45 Plan 01 (D-03): mirrors the exact gate `Tools/index.tsx` uses
// (`if (isDefault || isWindows || !runner) { return <></> }`), plus the Wine
// tab's own tools guard -- the winetricks tab lives alongside `Tools` on the
// Wine tab in `GamesSettings/index.tsx`, so it must never show where that
// `<Tools />` is hidden (no `showWineTab`, or `wineToolsHidden`).

/**
 * quick 261110-v08: the upstream `!isCrossover` gate hid Winecfg / Run EXE /
 * Winetricks for CrossOver. Since Phase 61 a macOS non-Steam engine game's
 * tools resolve the game's own bottle and engine through `resolveToolSettings`
 * (backend/engine/toolSettings.ts) via `runWineCommandOnGame` and the
 * Winetricks runner, so the tools work there. Found in 66.1-HUMAN-UAT item 5.
 *
 * quick 261110-vi4: a Mac Steam title shows the tools only for a per-game bridge
 * bottle (backend `isSteamWineToolsEligible`, surfaced as
 * `EngineState.wineToolsEligible`). Unknown or still loading counts as not
 * eligible so nothing flashes; the legacy shared bridge bottle and bottled
 * Steam stay hidden because those bottles are shared (Pitfall 5).
 */
export function wineToolsHidden(args: {
  isCrossover: boolean
  isMacEngineGame: boolean
  isMacSteamTitle: boolean
  steamToolsEligible: boolean
}): boolean {
  const { isCrossover, isMacEngineGame, isMacSteamTitle, steamToolsEligible } =
    args
  if (isMacSteamTitle) return !steamToolsEligible
  return isCrossover && !(isMacEngineGame && !isMacSteamTitle)
}

export function shouldShowWinetricksTab(args: {
  isDefault: boolean
  isWindows: boolean
  hasRunner: boolean
  showWineTab: boolean
  wineToolsHidden: boolean
}): boolean {
  const { isDefault, isWindows, hasRunner, showWineTab, wineToolsHidden } = args
  if (isDefault || isWindows || !hasRunner) {
    return false
  }
  if (!showWineTab || wineToolsHidden) {
    return false
  }
  return true
}
