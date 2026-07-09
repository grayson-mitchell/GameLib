/**
 * Unit tests for the pure Discounts-screen ownership badge resolver
 * (D-78..D-85, HSTORE-01). The helper lives in common/discounts/badges.ts
 * (no React/i18n/I/O); this test sits in the backend suite because jest's
 * project roots only cover src/backend.
 */

import { HumbleKey } from 'common/types/humble'
import { resolveDiscountBadge } from 'common/discounts/badges'

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
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, [])
    ).toBe('owned')
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
    expect(
      resolveDiscountBadge(product, titleToAppId, ownedAppIds, [])
    ).toBe('owned')
  })
})
