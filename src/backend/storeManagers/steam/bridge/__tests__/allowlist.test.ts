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

// Phase 51 Plan 03: ROADMAP sub-decision 3 / D-51-08 bump the schema to
// `version: 2` -- `games` is renamed `seed`, and a second `knownBad` array
// (reason-tagged, closed taxonomy) is added. `version: 1` is no longer
// accepted at all (no discriminated-union fallback -- the plan's own
// behavior spec is explicit: "version 1 throws").
function makeValidPayload() {
  return {
    version: 2 as const,
    seed: [{ appId: '480', title: 'Spacewar' }],
    knownBad: [] as { appId: string; title: string; reason: string }[]
  }
}

describe('bridgeAllowlistSchema', () => {
  test('accepts a well-formed v2 payload (seed >=1 entry, knownBad may be empty)', () => {
    const result = bridgeAllowlistSchema.safeParse(makeValidPayload())

    expect(result.success).toBe(true)
  })

  test('throws (via .parse()) on a payload with a missing `appId` in seed', () => {
    const payload = makeValidPayload()
    // @ts-expect-error -- intentionally malformed for the fail-loud test
    delete payload.seed[0].appId

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on a `version: 1` payload (v1 is no longer accepted)', () => {
    const payload = { version: 1, games: [{ appId: '480', title: 'Spacewar' }] }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on a payload with an empty `seed` array', () => {
    const payload = { ...makeValidPayload(), seed: [] }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on a non-numeric `appId` in seed', () => {
    const payload = {
      version: 2 as const,
      seed: [{ appId: 'not-a-number', title: 'Bad Entry' }],
      knownBad: []
    }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on an empty `title` in seed', () => {
    const payload = {
      version: 2 as const,
      seed: [{ appId: '480', title: '' }],
      knownBad: []
    }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('accepts an EMPTY `knownBad` array (D-51-08: no owned DRM-wrapped title identified yet)', () => {
    const result = bridgeAllowlistSchema.safeParse(makeValidPayload())

    expect(result.success).toBe(true)
  })

  test('accepts a well-formed `knownBad` entry with a closed-taxonomy reason', () => {
    const payload = {
      ...makeValidPayload(),
      knownBad: [{ appId: '999', title: 'Bad Game', reason: 'drm-wrapped' }]
    }

    expect(bridgeAllowlistSchema.safeParse(payload).success).toBe(true)
  })

  test('throws (via .parse()) on a `knownBad` entry with a reason outside the closed taxonomy', () => {
    const payload = {
      ...makeValidPayload(),
      knownBad: [{ appId: '999', title: 'Bad Game', reason: 'drm' }]
    }

    expect(() => bridgeAllowlistSchema.parse(payload)).toThrow()
  })

  test('throws (via .parse()) on a `knownBad` entry missing a `reason`', () => {
    const payload = {
      ...makeValidPayload(),
      knownBad: [{ appId: '999', title: 'Bad Game' }]
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

  test('the bundled bridge-allowlist.json is version 2 with an empty knownBad list', () => {
    const raw = readFileSync(
      join(__dirname, '..', 'bridge-allowlist.json'),
      'utf-8'
    )
    const parsed = JSON.parse(raw)

    expect(parsed.version).toBe(2)
    expect(parsed.knownBad).toEqual([])
  })

  test('has() returns true for Avernum 6 (acceptance-set title, seed membership)', () => {
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

  test('knownBadReason() returns null for a seed-only (not known-bad) appId', () => {
    expect(bridgeAllowlist.knownBadReason(AVERNUM_6_APP_ID)).toBeNull()
  })

  test('knownBadReason() returns null for a non-numeric appId, never throws', () => {
    expect(() => bridgeAllowlist.knownBadReason('abc')).not.toThrow()
    expect(bridgeAllowlist.knownBadReason('abc')).toBeNull()
  })

  test('knownBadReason() returns null for an absent numeric appId', () => {
    expect(bridgeAllowlist.knownBadReason('999999999')).toBeNull()
  })
})

describe('allowlist.ts reuses the shared NUMERIC_APP_ID convention', () => {
  test('defines NUMERIC_APP_ID = /^\\d+$/ verbatim (bottle.ts:826 / clientSetup.ts:40 precedent), not a divergent regex', () => {
    const source = readFileSync(join(__dirname, '..', 'allowlist.ts'), 'utf-8')

    expect(source).toContain('const NUMERIC_APP_ID = /^\\d+$/')
  })
})
