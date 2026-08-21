/**
 * Unit tests for the pure Discounts-screen ownership badge resolver
 * (D-78..D-85, HSTORE-01). The helper lives in common/discounts/badges.ts
 * (no React/i18n/I/O); this test sits in the backend suite because jest's
 * project roots only cover src/backend.
 */

import { HumbleKey } from 'common/types/humble'
import {
  resolveDiscountBadge,
  buildDiscountBadgeMaps
} from 'common/discounts/badges'
import { selectKeysWaiting } from 'common/humble/viewFilters'

function makeSteamGame(overrides: { title: string; app_name: string }) {
  return overrides
}

function makeKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gk',
    machineName: `mn-${Math.random().toString(36).slice(2)}`,
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Some Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

function makeProduct(overrides: { title: string }) {
  return overrides
}

/** Builds the titleToAppId map the same way Discounts/index.tsx does:
 * normalized title -> app_name, first-wins. */
function buildTitleToAppId(
  games: { title: string; app_name: string }[]
): Map<string, string> {
  const map = new Map<string, string>()
  for (const game of games) {
    const key = game.title.trim().toLowerCase()
    if (key && !map.has(key)) map.set(key, game.app_name)
  }
  return map
}

describe('resolveDiscountBadge', () => {
  test('D-83: exact title->AppID->steam.library match, not keyed, returns owned', () => {
    const game = makeSteamGame({ title: 'Celeste', app_name: '504230' })
    const product = makeProduct({ title: 'Celeste' })
    const titleToAppId = buildTitleToAppId([game])
    const ownedAppIds = new Set([game.app_name])
    expect(resolveDiscountBadge(product, titleToAppId, ownedAppIds, [])).toBe(
      'owned'
    )
  })

  test('D-84: exact AppID match against a waiting key, not owned, returns key-available', () => {
    const game = makeSteamGame({ title: 'Celeste', app_name: '504230' })
    const product = makeProduct({ title: 'Celeste' })
    const titleToAppId = buildTitleToAppId([game])
    const ownedAppIds = new Set<string>()
    const key = makeKey({ steamAppId: game.app_name })
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, [key])
    ).toBe('key-available')
  })

  test('D-79/D-82: no exact normalized match returns null', () => {
    const product = makeProduct({ title: 'Some Unrelated Game' })
    const titleToAppId = buildTitleToAppId([
      makeSteamGame({ title: 'Celeste', app_name: '504230' })
    ])
    expect(
      resolveDiscountBadge(product, titleToAppId, new Set(), [])
    ).toBeNull()
  })

  test('D-79/D-82: a fuzzy/near title never falls back to a badge', () => {
    const game = makeSteamGame({ title: 'Celeste', app_name: '504230' })
    const product = makeProduct({ title: 'Celeste — Standard Edition' })
    const titleToAppId = buildTitleToAppId([game])
    const ownedAppIds = new Set([game.app_name])
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, [])
    ).toBeNull()
  })

  test('D-85: owned AND has a waiting key returns owned (Owned wins, single badge)', () => {
    const game = makeSteamGame({ title: 'Celeste', app_name: '504230' })
    const product = makeProduct({ title: 'Celeste' })
    const titleToAppId = buildTitleToAppId([game])
    const ownedAppIds = new Set([game.app_name])
    const key = makeKey({ steamAppId: game.app_name })
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, [key])
    ).toBe('owned')
  })

  test.each(['', '0', undefined])(
    'WR-01: a waiting key with steamAppId %p never matches (falsy guard)',
    (steamAppId) => {
      const game = makeSteamGame({ title: 'Celeste', app_name: '504230' })
      const product = makeProduct({ title: 'Celeste' })
      const titleToAppId = buildTitleToAppId([game])
      const key = makeKey({ steamAppId })
      expect(
        resolveDiscountBadge(product, titleToAppId, new Set(), [key])
      ).toBeNull()
    }
  )

  test('case/whitespace-insensitive exact match via .trim().toLowerCase()', () => {
    const game = makeSteamGame({ title: 'Celeste', app_name: '504230' })
    const product = makeProduct({ title: '  CELESTE  ' })
    const titleToAppId = buildTitleToAppId([game])
    const ownedAppIds = new Set([game.app_name])
    expect(resolveDiscountBadge(product, titleToAppId, ownedAppIds, [])).toBe(
      'owned'
    )
  })
})

describe('buildDiscountBadgeMaps + resolveDiscountBadge (integration)', () => {
  test('CR-01 regression: unowned-but-keyed title resolves to key-available via the real map-building path', () => {
    // No steam.library entry for this title at all — the AppID only exists
    // via the waiting Humble key. Before the fix, the container derived
    // BOTH maps from steam.library alone, so this AppID could never appear
    // in titleToAppId; the helper must merge it in from the waiting key.
    const key = makeKey({ title: 'Hollow Knight', steamAppId: '367520' })
    const product = makeProduct({ title: 'Hollow Knight' })
    const { titleToAppId, ownedAppIds } = buildDiscountBadgeMaps([], [key])
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, [key])
    ).toBe('key-available')
  })

  test('D-83/D-85: an exact steam.library match still resolves to owned, even with a waiting key for the same title', () => {
    const game = makeSteamGame({ title: 'Celeste', app_name: '504230' })
    const key = makeKey({ title: 'Celeste', steamAppId: '504230' })
    const product = makeProduct({ title: 'Celeste' })
    const { titleToAppId, ownedAppIds } = buildDiscountBadgeMaps([game], [key])
    expect(ownedAppIds.has(game.app_name)).toBe(true)
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, [key])
    ).toBe('owned')
  })

  test('D-79/D-82: a title in neither steam.library nor any waiting key resolves to null', () => {
    const game = makeSteamGame({ title: 'Celeste', app_name: '504230' })
    const key = makeKey({ title: 'Hollow Knight', steamAppId: '367520' })
    const product = makeProduct({ title: 'Some Unrelated Game' })
    const { titleToAppId, ownedAppIds } = buildDiscountBadgeMaps([game], [key])
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, [key])
    ).toBeNull()
  })

  test.each(['', '0', undefined])(
    'WR-01: a waiting key with falsy steamAppId %p contributes no map entry and yields null',
    (steamAppId) => {
      const key = makeKey({ title: 'Hollow Knight', steamAppId })
      const product = makeProduct({ title: 'Hollow Knight' })
      const { titleToAppId, ownedAppIds } = buildDiscountBadgeMaps([], [key])
      expect(titleToAppId.has('hollow knight')).toBe(false)
      expect(
        resolveDiscountBadge(product, titleToAppId, ownedAppIds, [key])
      ).toBeNull()
    }
  )

  test('WR-01: a non-waiting decoy key sharing a title but a different AppID does not suppress key-available (container feeds selectKeysWaiting output to BOTH consumers)', () => {
    // A key already owned elsewhere (dropped by selectKeysWaiting) shares the
    // normalized title with a genuine waiting key but carries a DIFFERENT
    // steamAppId. Ordered first so a first-wins map builder that saw the raw
    // key list would occupy the title slot with the decoy's AppID (999999) —
    // resolveDiscountBadge would then find no waiting key for 999999 and
    // return null (the WR-01 false negative). Mirroring the container, we
    // filter ONCE via selectKeysWaiting and feed that single list to both.
    const decoy = makeKey({
      title: 'Hollow Knight',
      steamAppId: '999999',
      ownedElsewhere: true,
      state: 'REVEALED'
    })
    const waiting = makeKey({ title: 'Hollow Knight', steamAppId: '367520' })
    const product = makeProduct({ title: 'Hollow Knight' })

    const keysWaiting = selectKeysWaiting([decoy, waiting])
    const { titleToAppId, ownedAppIds } = buildDiscountBadgeMaps(
      [],
      keysWaiting
    )

    // The decoy was filtered out, so the waiting key's AppID owns the slot.
    expect(titleToAppId.get('hollow knight')).toBe('367520')
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, keysWaiting)
    ).toBe('key-available')
  })
})
