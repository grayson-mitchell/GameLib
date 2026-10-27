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

describe('playVerified schema', () => {
  const withPv = (pv: unknown) => ({
    ...makeValidPayload(),
    seed: [{ appId: '480', title: 'Spacewar', playVerified: pv }]
  })

  test('accepts a valid playVerified on a seed entry', () => {
    expect(
      bridgeAllowlistSchema.safeParse(
        withPv({ evidence: 'UAT item 1', date: '2026-10-22' })
      ).success
    ).toBe(true)
  })

  test('rejects empty evidence', () => {
    expect(
      bridgeAllowlistSchema.safeParse(
        withPv({ evidence: '', date: '2026-10-22' })
      ).success
    ).toBe(false)
  })

  test('rejects a non-ISO date', () => {
    expect(
      bridgeAllowlistSchema.safeParse(
        withPv({ evidence: 'UAT', date: '22/10/2026' })
      ).success
    ).toBe(false)
  })

  test('rejects playVerified on a knownBad entry', () => {
    expect(
      bridgeAllowlistSchema.safeParse({
        ...makeValidPayload(),
        knownBad: [
          {
            appId: '9',
            title: 'X',
            reason: 'does-not-run',
            playVerified: { evidence: 'UAT', date: '2026-10-22' }
          }
        ]
      }).success
    ).toBe(false)
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

  test('the bundled bridge-allowlist.json is version 2 with Unclaimed World as its evidence-backed knownBad entries (51-19, 51-27, debug/unclaimed-world-wmv-mf)', () => {
    const raw = readFileSync(
      join(__dirname, '..', 'bridge-allowlist.json'),
      'utf-8'
    )
    const parsed = JSON.parse(raw)

    expect(parsed.version).toBe(2)
    expect(parsed.knownBad.map((e: { appId: string }) => e.appId)).toEqual([
      '284100'
    ])
  })

  test('Unclaimed World (284100) is does-not-run: CrossOver GStreamer has no WMV3/WMA9 decoder (debug/unclaimed-world-wmv-mf)', () => {
    expect(bridgeAllowlist.knownBadReason('284100')).toBe('does-not-run')
  })

  // Evidence: 261026-ng9 SUMMARY "Live retest: packaged debug build" (2026-10-26):
  // reached the menu, ran 97 s, `GINIT ... ok=1`.
  test('HOARD (63000) is no longer known-bad: its bundled known-fix profile makes it run (quick 261026-ng9 packaged retest)', () => {
    expect(bridgeAllowlist.knownBadReason(HOARD_APP_ID)).toBeNull()
    const parsed = JSON.parse(
      readFileSync(join(__dirname, '..', 'bridge-allowlist.json'), 'utf-8')
    )
    expect(
      parsed.knownBad.some((e: { appId: string }) => e.appId === HOARD_APP_ID)
    ).toBe(false)
  })

  test('ELEX (411300) is no longer known-bad: seeded once the bridge delivered UserStatsReceived_t (quick 261027-k51)', () => {
    expect(bridgeAllowlist.knownBadReason('411300')).toBeNull()
    const parsed = JSON.parse(
      readFileSync(join(__dirname, '..', 'bridge-allowlist.json'), 'utf-8')
    )
    expect(
      parsed.knownBad.some((e: { appId: string }) => e.appId === '411300')
    ).toBe(false)
    const elex = parsed.seed.find(
      (e: { appId: string }) => e.appId === '411300'
    )
    expect(elex.note).toMatch(/261027-k51/)
  })

  test('The Age of Decadence (230070) is seeded and play-verified, citing 51-UAT item 18, and is not known-bad (D-51-14 anchor)', () => {
    const parsed = JSON.parse(
      readFileSync(join(__dirname, '..', 'bridge-allowlist.json'), 'utf-8')
    )
    const aod = parsed.seed.find((e: { appId: string }) => e.appId === '230070')
    expect(aod.playVerified.evidence).toMatch(/51-UAT item 18/)
    expect(aod.playVerified.date).toBe('2026-10-23')
    expect(bridgeAllowlist.has('230070')).toBe(true)
    expect(bridgeAllowlist.knownBadReason('230070')).toBeNull()
  })

  // XCOM's CEG routing now lives in its known-fix file (drm "ceg", quick
  // 261027-gtd), so the allowlist no longer carries it and the evidence moved there.
  test('XCOM (200510) is not an allowlist knownBad; its known-fix drm "ceg" carries the 51-UAT item 17 evidence', () => {
    expect(bridgeAllowlist.knownBadReason('200510')).toBeNull()
    const fix = JSON.parse(
      readFileSync(
        join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          '..',
          '..',
          'public',
          'fixes',
          '200510-steam.json'
        ),
        'utf-8'
      )
    )
    expect(fix.drm).toBe('ceg')
    expect(fix.notes.drm).toMatch(/51-UAT item 17/)
  })

  test('every seed playVerified record cites a UAT item; Avernum 6 has one, Avernum 5 does not', () => {
    const parsed = JSON.parse(
      readFileSync(join(__dirname, '..', 'bridge-allowlist.json'), 'utf-8')
    )
    for (const e of parsed.seed as {
      playVerified?: { evidence: string }
    }[]) {
      if (e.playVerified) {
        expect(e.playVerified.evidence).toContain('UAT')
      }
    }
    const byId = (id: string) =>
      parsed.seed.find((e: { appId: string }) => e.appId === id)
    expect(byId('206060').playVerified.date).toBe('2026-10-22')
    expect(byId('206040').playVerified).toBeUndefined()
  })

  test('every seed and knownBad entry carries a real evidence note (51-19)', () => {
    // A note is the only record of WHY a title is on either list. 653d9685b
    // shipped both seed notes as `<<ccr:…>>` placeholders unnoticed, so a
    // placeholder is rejected too, not just an empty string.
    const raw = readFileSync(
      join(__dirname, '..', 'bridge-allowlist.json'),
      'utf-8'
    )
    const parsed = JSON.parse(raw)
    const entries: { appId: string; note?: string }[] = [
      ...parsed.seed,
      ...parsed.knownBad
    ]

    for (const entry of entries) {
      expect(entry.note?.trim()).toBeTruthy()
      expect(entry.note).not.toMatch(/<<ccr:/)
    }
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
