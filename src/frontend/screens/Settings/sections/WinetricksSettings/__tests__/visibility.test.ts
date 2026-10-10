/**
 * Phase 45 Plan 01 (D-03): truth table for `shouldShowWinetricksTab`. One
 * baseline "all conditions met" case, then one false case per input --
 * exactly the shape this plan's `<behavior>` block specifies.
 */
import { shouldShowWinetricksTab } from '../visibility'

function baseArgs() {
  return {
    isDefault: false,
    isWindows: false,
    hasRunner: true,
    showWineTab: true,
    isCrossover: false
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

  it('is false for a CrossOver bottle (isCrossover)', () => {
    expect(shouldShowWinetricksTab({ ...baseArgs(), isCrossover: true })).toBe(
      false
    )
  })
})
