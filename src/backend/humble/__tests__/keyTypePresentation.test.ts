/**
 * Unit tests for the pure `key_type` -> presentation + redeem-target table
 * (D-42-03, T-42-01/T-42-02). The helper lives in
 * common/humble/keyTypePresentation.ts (no React/i18n/I/O); this test sits
 * in the backend suite because jest's project roots decide test location,
 * not file location — the same convention every other `common/humble/*`
 * sibling follows (see groupKeys.test.ts).
 */

import {
  HUMBLE_REDEEM_HELP_URL,
  HumbleGameLibLoginStore,
  HumbleKeyTypePresentation,
  getGameLibLoginStore,
  getKeyTypePresentation,
  getRedeemTarget
} from 'common/humble/keyTypePresentation'

describe('getKeyTypePresentation', () => {
  test("'steam' -> branded Steam", () => {
    expect(getKeyTypePresentation('steam')).toEqual({
      kind: 'branded',
      name: 'Steam',
      logo: 'steam'
    })
  })

  test("'gog' -> branded GOG", () => {
    expect(getKeyTypePresentation('gog')).toEqual({
      kind: 'branded',
      name: 'GOG',
      logo: 'gog'
    })
  })

  test("'epic' -> branded Epic Games", () => {
    expect(getKeyTypePresentation('epic')).toEqual({
      kind: 'branded',
      name: 'Epic Games',
      logo: 'epic'
    })
  })

  test("'epic_keyless' -> branded Epic Games", () => {
    expect(getKeyTypePresentation('epic_keyless')).toEqual({
      kind: 'branded',
      name: 'Epic Games',
      logo: 'epic'
    })
  })

  test("'gog_keyless' -> branded GOG (QT-260908-UIC-01, live-observed 2026-09-08)", () => {
    expect(getKeyTypePresentation('gog_keyless')).toEqual({
      kind: 'branded',
      name: 'GOG',
      logo: 'gog'
    })
  })

  test("'origin' -> named Origin, no logo", () => {
    expect(getKeyTypePresentation('origin')).toEqual({
      kind: 'named',
      name: 'Origin'
    })
  })

  test("'origin_keyless' -> named Origin, no logo", () => {
    expect(getKeyTypePresentation('origin_keyless')).toEqual({
      kind: 'named',
      name: 'Origin'
    })
  })

  test("'uplay' -> named Ubisoft Connect, no logo", () => {
    expect(getKeyTypePresentation('uplay')).toEqual({
      kind: 'named',
      name: 'Ubisoft Connect'
    })
  })

  test("'battlenet' -> named Battle.net, no logo", () => {
    expect(getKeyTypePresentation('battlenet')).toEqual({
      kind: 'named',
      name: 'Battle.net'
    })
  })

  test("'nintendo_direct' -> named Nintendo, no logo", () => {
    expect(getKeyTypePresentation('nintendo_direct')).toEqual({
      kind: 'named',
      name: 'Nintendo'
    })
  })

  test("'generic' -> explicit unknown (D-42-03 map entry, not a fall-through)", () => {
    expect(getKeyTypePresentation('generic')).toEqual({ kind: 'unknown' })
  })

  test.each(['wibble', '', 'STEAM', 'steam ', 'Steam'])(
    'unrecognised key_type %j -> the SAME explicit unknown case as generic',
    (keyType) => {
      expect(getKeyTypePresentation(keyType)).toEqual({ kind: 'unknown' })
    }
  )

  test("an 'unknown' result carries NO name and NO logo property at all", () => {
    const result = getKeyTypePresentation('generic')
    expect('name' in result).toBe(false)
    expect('logo' in result).toBe(false)
  })

  test('no result anywhere carries the GameLib icon; logo is only steam|gog|epic', () => {
    const allKeyTypes = [
      'steam',
      'gog',
      'gog_keyless',
      'epic',
      'epic_keyless',
      'origin',
      'origin_keyless',
      'uplay',
      'battlenet',
      'nintendo_direct',
      'generic',
      'wibble'
    ]
    for (const keyType of allKeyTypes) {
      const result = getKeyTypePresentation(keyType)
      if (result.kind === 'branded') {
        expect(['steam', 'gog', 'epic']).toContain(result.logo)
      }
    }
  })
})

describe('getRedeemTarget', () => {
  test("('steam', code) -> deep-link byte-identical to HumbleClaimWizard's live Steam branch", () => {
    expect(getRedeemTarget('steam', 'ABCD-1234')).toEqual({
      kind: 'deep-link',
      url: 'https://store.steampowered.com/account/registerkey?key=ABCD-1234'
    })
  })

  test("('gog', code) -> deep-link to gog.com/redeem", () => {
    expect(getRedeemTarget('gog', 'GOG-KEY-1')).toEqual({
      kind: 'deep-link',
      url: 'https://www.gog.com/redeem/GOG-KEY-1'
    })
  })

  test('gog encoding: interpolated segment equals encodeURIComponent of the code', () => {
    const code = 'a b/c?d&e#f'
    const result = getRedeemTarget('gog', code)
    expect(result).toEqual({
      kind: 'deep-link',
      url: `https://www.gog.com/redeem/${encodeURIComponent(code)}`
    })
  })

  test('steam encoding: interpolated segment equals encodeURIComponent of the code', () => {
    const code = 'a b/c?d&e#f'
    const result = getRedeemTarget('steam', code)
    expect(result).toEqual({
      kind: 'deep-link',
      url: `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(
        code
      )}`
    })
  })

  test.each([
    'gog_keyless',
    'epic',
    'epic_keyless',
    'origin',
    'origin_keyless',
    'uplay',
    'battlenet',
    'nintendo_direct',
    'generic',
    'wibble',
    ''
  ])(
    'every other key_type %j -> help fallback, never a fabricated deep link',
    (keyType) => {
      expect(getRedeemTarget(keyType, 'ANY-CODE')).toEqual({
        kind: 'help',
        url: HUMBLE_REDEEM_HELP_URL
      })
    }
  )

  describe('SECURITY PIN (T-42-01): the help branch never carries the code', () => {
    test.each([
      'gog_keyless',
      'epic',
      'epic_keyless',
      'origin',
      'origin_keyless',
      'uplay',
      'battlenet',
      'nintendo_direct',
      'generic',
      'wibble',
      ''
    ])('%j -> exact help URL, no SECRET-CODE substring', (keyType) => {
      const result = getRedeemTarget(keyType, 'SECRET-CODE')
      expect(result.url).toBe(HUMBLE_REDEEM_HELP_URL)
      expect(result.url.includes('SECRET-CODE')).toBe(false)
    })
  })

  test('SECURITY PIN (T-42-02): a hostile key_type (a full URL) cannot reach a fabricated URL', () => {
    const result = getRedeemTarget('https://evil.example/', 'SECRET-CODE')
    expect(result).toEqual({ kind: 'help', url: HUMBLE_REDEEM_HELP_URL })
  })

  test("logo presence and deep-link presence are INDEPENDENT: 'epic' has a logo but no deep link", () => {
    const presentation = getKeyTypePresentation('epic')
    expect(presentation).toEqual({
      kind: 'branded',
      name: 'Epic Games',
      logo: 'epic'
    })
    expect(getRedeemTarget('epic', 'ANY-CODE')).toEqual({
      kind: 'help',
      url: HUMBLE_REDEEM_HELP_URL
    })
  })
})

describe('getGameLibLoginStore (D-43-12/D-43-13, Phase 43 plan 06)', () => {
  test.each([
    ['steam', 'steam'],
    ['gog', 'gog'],
    ['gog_keyless', 'gog'],
    ['epic', 'epic'],
    ['epic_keyless', 'epic']
  ] satisfies [string, HumbleGameLibLoginStore][])(
    '%j -> %j (GameLib has a login concept for this platform)',
    (keyType, expected) => {
      expect(getGameLibLoginStore(keyType)).toBe(expected)
    }
  )

  test.each([
    'uplay',
    'battlenet',
    'origin',
    'origin_keyless',
    'nintendo_direct',
    'generic'
  ])(
    '%j -> null (D-43-13: no GameLib login concept for this platform)',
    (keyType) => {
      expect(getGameLibLoginStore(keyType)).toBeNull()
    }
  )

  test.each(['wibble', '', 'STEAM', 'steam '])(
    'unrecognised key_type %j -> null, same as a named no-login platform',
    (keyType) => {
      expect(getGameLibLoginStore(keyType)).toBeNull()
    }
  )

  test('SECURITY PIN (T-43-03): a hostile, URL-shaped key_type cannot reach a fabricated login store', () => {
    expect(getGameLibLoginStore('https://evil.example/steam')).toBeNull()
  })
})

// Exhaustiveness pin: if a fourth HumbleKeyTypePresentation member is ever
// added, this switch's `never` assignment fails pnpm codecheck here rather
// than the UI silently rendering nothing for the new kind.
function assertExhaustivePresentation(
  presentation: HumbleKeyTypePresentation
): void {
  switch (presentation.kind) {
    case 'branded':
      return
    case 'named':
      return
    case 'unknown':
      return
    default: {
      const _exhaustive: never = presentation
      return _exhaustive
    }
  }
}

test('exhaustiveness pin compiles (see assertExhaustivePresentation above)', () => {
  assertExhaustivePresentation({ kind: 'unknown' })
})
