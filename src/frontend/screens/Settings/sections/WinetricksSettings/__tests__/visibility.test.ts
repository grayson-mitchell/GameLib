/**
 * Phase 45 Plan 01 (D-03): truth table for `shouldShowWinetricksTab`. One
 * baseline "all conditions met" case, then one false case per input --
 * exactly the shape this plan's `<behavior>` block specifies.
 */
import { shouldShowWinetricksTab, wineToolsHidden } from '../visibility'

function baseArgs() {
  return {
    isDefault: false,
    isWindows: false,
    hasRunner: true,
    showWineTab: true,
    wineToolsHidden: false
  }
}

describe('shouldShowWinetricksTab (D-03)', () => {
  it('is true when every input is favourable', () => {
    expect(shouldShowWinetricksTab(baseArgs())).toBe(true)
  })

  it('is false for Game Defaults (isDefault)', () => {
    expect(shouldShowWinetricksTab({ ...baseArgs(), isDefault: true })).toBe(
      false
    )
  })

  it('is false on a Windows host (isWindows)', () => {
    expect(shouldShowWinetricksTab({ ...baseArgs(), isWindows: true })).toBe(
      false
    )
  })

  it('is false for a runner-less game (!hasRunner)', () => {
    expect(shouldShowWinetricksTab({ ...baseArgs(), hasRunner: false })).toBe(
      false
    )
  })

  it('is false when the Wine tab itself is hidden (!showWineTab)', () => {
    expect(shouldShowWinetricksTab({ ...baseArgs(), showWineTab: false })).toBe(
      false
    )
  })

  it('is false when the Wine tools are hidden (wineToolsHidden)', () => {
    expect(
      shouldShowWinetricksTab({ ...baseArgs(), wineToolsHidden: true })
    ).toBe(false)
  })
})

describe('wineToolsHidden (quick 261110-v08)', () => {
  it('keeps Winecfg/Run EXE/Winetricks for a CrossOver-engine macOS game (regression)', () => {
    expect(
      wineToolsHidden({
        isCrossover: true,
        isMacEngineGame: true,
        isMacSteamTitle: false
      })
    ).toBe(false)
  })

  it('never hides tools when the game is not on CrossOver', () => {
    for (const isMacEngineGame of [true, false]) {
      for (const isMacSteamTitle of [true, false]) {
        expect(
          wineToolsHidden({
            isCrossover: false,
            isMacEngineGame,
            isMacSteamTitle
          })
        ).toBe(false)
      }
    }
  })

  it('still hides tools for a macOS Steam title', () => {
    expect(
      wineToolsHidden({
        isCrossover: true,
        isMacEngineGame: true,
        isMacSteamTitle: true
      })
    ).toBe(true)
  })

  it('still hides tools for a CrossOver wineVersion outside the engine model', () => {
    expect(
      wineToolsHidden({
        isCrossover: true,
        isMacEngineGame: false,
        isMacSteamTitle: false
      })
    ).toBe(true)
  })
})
