/**
 * Unit tests for the pure ownership-matching module (dedup.ts, HDEDUP-01).
 * No axios/electron-store mocking needed — recomputeOwnership receives the
 * Steam library array and the override predicate as injected arguments,
 * exactly like classify.ts injects `isRevealed`.
 *
 * Two-tier contract under test:
 *   - exact AppID equality is FINAL when steamAppId is present (D-44)
 *   - normalized-Levenshtein fuzzy fallback at 85%+ otherwise (D-45),
 *     with an explicit DLC-keyword guard (success criterion 3)
 */

import {
  recomputeOwnership,
  fuzzyMatch,
  titleSimilarity,
  isDlcFalsePositiveRisk,
  normalizeTitle
} from '../dedup'
import { HumbleKey, HumbleKeyState } from 'common/types/humble'
import {
  ownedSteamLibrary,
  steamOwnedGameX,
  steamOwnedBatmanArkhamKnight
} from './fixtures/steamGames'

const NEVER_OVERRIDDEN = () => false

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'order-1',
    machineName: 'somegame_steam',
    state: 'UNREVEALED' as HumbleKeyState,
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Some Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

describe('recomputeOwnership — appid tier (D-44)', () => {
  it('appid: steamAppId present and owned → exact match', () => {
    const key = makeKey({ steamAppId: '620', title: 'Portal 2' })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(true)
    expect(result.matchConfidence).toBe('exact')
  })

  it('appid: steamAppId present but NOT owned → none, no fuzzy fallback', () => {
    // Title would trivially fuzzy-match an owned title, but D-44 says the
    // AppID verdict is final — no second-guessing via the fuzzy tier.
    const key = makeKey({ steamAppId: '999999', title: 'Portal 2' })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(false)
    expect(result.matchConfidence).toBe('none')
  })
})

describe('recomputeOwnership — fuzzy match tier (D-45)', () => {
  it.each([
    ['Assault Android Cactus+', 'Assault Android Cactus'],
    ['FRAMED Collection', 'Framed Collection'],
    ['Into the Breach', 'Into The Breach (Steam)']
  ])('fuzzy match: %s matches owned %s at 85%%+', (humbleTitle) => {
    const key = makeKey({ steamAppId: undefined, title: humbleTitle })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(true)
    expect(result.matchConfidence).toBe('fuzzy')
  })

  it('fuzzy match: unrelated title does not match anything', () => {
    const key = makeKey({ steamAppId: undefined, title: 'Totally Different' })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(false)
    expect(result.matchConfidence).toBe('none')
  })

  it('cross-platform (D-45): a gog-platform key fuzzy-matches a Steam-owned title', () => {
    const key = makeKey({
      steamAppId: undefined,
      platform: 'gog',
      title: 'Stardew Valley'
    })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(true)
    expect(result.matchConfidence).toBe('fuzzy')
  })
})

describe('recomputeOwnership — dlc guard (success criterion 3)', () => {
  it('dlc: "Game X: Season Pass" does NOT match owned "Game X"', () => {
    const key = makeKey({ steamAppId: undefined, title: 'Game X: Season Pass' })
    const [result] = recomputeOwnership(
      [key],
      [steamOwnedGameX],
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(false)
    expect(result.matchConfidence).toBe('none')
  })

  it('dlc: "Batman" does NOT match owned "Batman: Arkham Knight"', () => {
    const key = makeKey({ steamAppId: undefined, title: 'Batman' })
    const [result] = recomputeOwnership(
      [key],
      [steamOwnedBatmanArkhamKnight],
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(false)
    expect(result.matchConfidence).toBe('none')
  })
})

describe('recomputeOwnership — WR-01 falsy steamAppId fix (D-71)', () => {
  it("falsy steamAppId '' falls through to the fuzzy tier instead of skipping both", () => {
    const key = makeKey({ steamAppId: '', title: 'Stardew Valley' })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(true)
    expect(result.matchConfidence).toBe('fuzzy')
  })

  it("falsy steamAppId '0' falls through to the fuzzy tier instead of skipping both", () => {
    const key = makeKey({ steamAppId: '0', title: 'Stardew Valley' })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(true)
    expect(result.matchConfidence).toBe('fuzzy')
  })

  it('regression: a real exact-matching steamAppId still returns exact (no regression)', () => {
    const key = makeKey({ steamAppId: '620', title: 'Portal 2' })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(true)
    expect(result.matchConfidence).toBe('exact')
  })

  it('regression: steamAppId undefined still fuzzy-matches (no regression)', () => {
    const key = makeKey({ steamAppId: undefined, title: 'Stardew Valley' })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result.ownedElsewhere).toBe(true)
    expect(result.matchConfidence).toBe('fuzzy')
  })
})

describe('recomputeOwnership — unpicked exclusion (D-27)', () => {
  it('unpicked: an UNPICKED pseudo-entry is never matched, returned unchanged', () => {
    // Title deliberately identical to an owned game — must still be skipped.
    const key = makeKey({
      state: 'UNPICKED',
      steamAppId: undefined,
      title: 'Portal 2'
    })
    const [result] = recomputeOwnership(
      [key],
      ownedSteamLibrary,
      NEVER_OVERRIDDEN
    )
    expect(result).toEqual(key)
    expect(result.ownedElsewhere).toBe(false)
    expect(result.matchConfidence).toBe('none')
  })
})

describe('recomputeOwnership — keep-last-known (D-48 unit-level)', () => {
  it('keep-last-known: an empty Steam library leaves prior values unchanged', () => {
    // The connectivity gate lives in the caller (library.ts, Plan 03) — but
    // the module must not zero-out prior ownership on an empty games array.
    const previouslyMatched = makeKey({
      steamAppId: undefined,
      title: 'Stardew Valley',
      ownedElsewhere: true,
      matchConfidence: 'fuzzy'
    })
    const untouched = makeKey({
      machineName: 'other_steam',
      title: 'Totally Different'
    })
    const results = recomputeOwnership(
      [previouslyMatched, untouched],
      [],
      NEVER_OVERRIDDEN
    )
    expect(results).toEqual([previouslyMatched, untouched])
  })
})

describe('recomputeOwnership — D-42 override', () => {
  it('override clears a fuzzy match ("Not the same game")', () => {
    const key = makeKey({ steamAppId: undefined, title: 'Stardew Valley' })
    const [result] = recomputeOwnership([key], ownedSteamLibrary, () => true)
    expect(result.ownedElsewhere).toBe(false)
    expect(result.matchConfidence).toBe('none')
  })

  it('override never clears an exact AppID match', () => {
    const key = makeKey({ steamAppId: '620', title: 'Portal 2' })
    const [result] = recomputeOwnership([key], ownedSteamLibrary, () => true)
    expect(result.ownedElsewhere).toBe(true)
    expect(result.matchConfidence).toBe('exact')
  })
})

describe('normalizeTitle', () => {
  it('lowercases, strips trademark symbols, punctuation, and edition suffixes', () => {
    expect(normalizeTitle('FRAMED Collection™')).toBe('framed')
    expect(normalizeTitle('Assault Android Cactus+')).toBe(
      'assault android cactus'
    )
    expect(normalizeTitle('Skyrim: Game of the Year Edition')).toBe('skyrim')
  })

  it('strips parenthetical qualifiers like "(Steam)"', () => {
    expect(normalizeTitle('Into The Breach (Steam)')).toBe('into the breach')
  })
})

describe('titleSimilarity', () => {
  it('identical-after-normalization titles score 1', () => {
    expect(titleSimilarity('FRAMED Collection', 'Framed Collection')).toBe(1)
  })

  it('empty-after-normalization input scores 0', () => {
    expect(titleSimilarity('™®©', 'Portal 2')).toBe(0)
  })

  it('a DLC title scores well below threshold against its base game', () => {
    expect(titleSimilarity('Game X: Season Pass', 'Game X')).toBeLessThan(0.85)
  })
})

describe('isDlcFalsePositiveRisk', () => {
  it('flags when the longer raw title carries a DLC keyword the shorter lacks', () => {
    expect(isDlcFalsePositiveRisk('Game X', 'Game X: Season Pass')).toBe(true)
    expect(isDlcFalsePositiveRisk('Game X: Season Pass', 'Game X')).toBe(true)
    expect(
      isDlcFalsePositiveRisk('Half-Life', 'Half-Life (Original Soundtrack)')
    ).toBe(true)
  })

  it('does not flag when neither or both titles carry DLC keywords', () => {
    expect(isDlcFalsePositiveRisk('Portal 2', 'Portal 2')).toBe(false)
    expect(
      isDlcFalsePositiveRisk('Game X Season Pass', 'Game X: Season Pass')
    ).toBe(false)
  })
})

describe('fuzzyMatch', () => {
  it('accepts documented should-match pairs at the 85% threshold', () => {
    expect(
      fuzzyMatch('Assault Android Cactus+', 'Assault Android Cactus')
    ).toBe(true)
    expect(fuzzyMatch('FRAMED Collection', 'Framed Collection')).toBe(true)
    expect(fuzzyMatch('Into the Breach', 'Into The Breach (Steam)')).toBe(true)
  })

  it('rejects documented should-NOT-match pairs (DLC guard + length penalty)', () => {
    expect(fuzzyMatch('Game X: Season Pass', 'Game X')).toBe(false)
    expect(fuzzyMatch('Batman', 'Batman: Arkham Knight')).toBe(false)
  })
})
