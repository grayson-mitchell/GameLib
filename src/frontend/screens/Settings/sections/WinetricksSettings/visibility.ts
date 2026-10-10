// Phase 45 Plan 01 (D-03): mirrors the exact gate `Tools/index.tsx` uses
// (`if (isDefault || isWindows || !runner) { return <></> }`), plus the Wine
// tab's own `!isCrossover` guard -- the winetricks tab lives alongside
// `Tools` inside that same `{!isCrossover && (...)}` block in
// `GamesSettings/index.tsx`, so it must never show where that block itself
// is hidden (no `showWineTab`, or on a Crossover bottle).
export function shouldShowWinetricksTab(args: {
  isDefault: boolean
  isWindows: boolean
  hasRunner: boolean
  showWineTab: boolean
  isCrossover: boolean
}): boolean {
  const { isDefault, isWindows, hasRunner, showWineTab, isCrossover } = args
  if (isDefault || isWindows || !hasRunner) {
    return false
  }
  if (!showWineTab || isCrossover) {
    return false
  }
  return true
}
