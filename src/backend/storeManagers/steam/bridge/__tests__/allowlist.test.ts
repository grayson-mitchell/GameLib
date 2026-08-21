import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { bridgeAllowlist, bridgeAllowlistSchema } from '../allowlist'

// Real AppIDs (confirmed against the Steam store API, cross-referenced
// against the spike READMEs' developer names -- Spiderweb Software /
// Avernum 6, Big Sandwich Games / HOARD). Avernum 6 (206060) replaced
// Avernum 4 (206020) in the acceptance set: Avernum 4 does not run under
// CrossOver, so it can never pass the bridge on macOS (24-10 Gate 3).
const AVERNUM_6_APP_ID = '206060'
const HOARD_APP_ID = '63000'

function makeValidPayload() {
  return {
    version: 1 as const,
    games: [{ appId: '480', title: 'Spacewar' }]
  }
}

describe('bridgeAllowlistSchema', () => {
  test('accepts a well-formed payload (version 1, >=1 game entry)', () => {
    const result = bridgeAllowlistSchema.safeParse(makeValidPayload())

    expect(result.success).toBe(true)
  })

  test('throws (via .parse()) on a payload with a missing `appId`', () => {
    const payload = makeValidPayload()
    // @ts-expect-error -- intentionally malformed for the fail-loud test
    delete payload.games[0].appId

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on a payload with `version: 2`', () => {
    const payload = { ...makeValidPayload(), version: 2 }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on a payload with an empty `games` array', () => {
    const payload = { ...makeValidPayload(), games: [] }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on a non-numeric `appId`', () => {
    const payload = {
      version: 1 as const,
      games: [{ appId: 'not-a-number', title: 'Bad Entry' }]
    }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on an empty `title`', () => {
    const payload = {
      version: 1 as const,
      games: [{ appId: '480', title: '' }]
    }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })
})

describe('bridgeAllowlist (loaded from the bundled bridge-allowlist.json)', () => {
  test('the bundled bridge-allowlist.json itself parses cleanly against bridgeAllowlistSchema', () => {
    const raw = readFileSync(
      join(__dirname, '..', 'bridge-allowlist.json'),
      'utf-8'
    )

    expect(() => bridgeAllowlistSchema.parse(JSON.parse(raw))).not.toThrow()
  })

  test('has() returns true for Avernum 6 (acceptance-set title)', () => {
    expect(bridgeAllowlist.has(AVERNUM_6_APP_ID)).toBe(true)
  })

  // HOARD (63000) was removed from the allowlist 2026-07-21: it imports 8 bare
  // interface accessors (SteamUser/Utils/Friends/Apps/Matchmaking/Networking/
  // RemoteStorage/UserStats) but the shim+helper cover only ISteamUser+ISteamFriends,
  // so it crashes on the first unimplemented accessor (SteamUtils). Deferred pending
  // multi-interface bridge coverage (24-UAT D-UAT-24-09). Not offered as a bridge title.
  test('has() returns false for HOARD (deferred — bridge lacks its interfaces, D-UAT-24-09)', () => {
    expect(bridgeAllowlist.has(HOARD_APP_ID)).toBe(false)
  })

  test('has() returns false for an absent numeric appId', () => {
    expect(bridgeAllowlist.has('999999999')).toBe(false)
  })

  test('has() returns false for a non-numeric appId (guard), never throws', () => {
    expect(() => bridgeAllowlist.has('not-a-number')).not.toThrow()
    expect(bridgeAllowlist.has('not-a-number')).toBe(false)
  })

  test('has() returns false for an empty-string appId', () => {
    expect(bridgeAllowlist.has('')).toBe(false)
  })
})

describe('allowlist.ts reuses the shared NUMERIC_APP_ID convention', () => {
  test('defines NUMERIC_APP_ID = /^\\d+$/ verbatim (bottle.ts:826 / clientSetup.ts:40 precedent), not a divergent regex', () => {
    const source = readFileSync(join(__dirname, '..', 'allowlist.ts'), 'utf-8')

    expect(source).toContain('const NUMERIC_APP_ID = /^\\d+$/')
  })
})
