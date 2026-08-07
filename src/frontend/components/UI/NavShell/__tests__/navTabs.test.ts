/**
 * Unit tests for navTabs.ts (REQ-34.10-01, REQ-34.10-11).
 *
 * Plain exported functions -- no React, no hook mocking. No jsdom is
 * installed in this project (see src/frontend/jest.config.js docstring), so
 * `sessionStorage` is stubbed on `globalThis` the way
 * SidebarLinks/__tests__/index.test.tsx does. Never `render(`, `screen.` or
 * `userEvent` here -- the `Frontend` jest project is `testEnvironment:
 * 'node'`.
 */
import {
  NAV_TAB_IDS,
  NAV_TAB_INDEX,
  resolveActiveTab,
  resolveDefaultStore,
  type NavStoreSessions
} from '../navTabs'

;(globalThis as unknown as { sessionStorage: Storage }).sessionStorage = {
  getItem: jest.fn().mockReturnValue(null),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  key: jest.fn(),
  length: 0
}

function getSessionStorageMock() {
  return (globalThis as unknown as { sessionStorage: Storage })
    .sessionStorage as unknown as { getItem: jest.Mock }
}

function makeSessions(
  overrides: Partial<NavStoreSessions> = {}
): NavStoreSessions {
  return {
    epic: { username: undefined },
    gog: { username: undefined },
    amazon: { user_id: undefined },
    steam: { username: undefined },
    zoom: { username: undefined, enabled: false },
    ...overrides
  }
}

describe('navTabs', () => {
  beforeEach(() => {
    getSessionStorageMock().getItem.mockReturnValue(null)
  })

  describe('NAV_TAB_IDS / NAV_TAB_INDEX', () => {
    it('exposes the four tab ids in the documented order', () => {
      expect(NAV_TAB_IDS).toEqual(['accounts', 'games', 'stores', 'settings'])
    })

    it('maps accounts, games, stores, settings to indices 0..3', () => {
      expect(NAV_TAB_INDEX).toEqual({
        accounts: 0,
        games: 1,
        stores: 2,
        settings: 3
      })
    })
  })

  describe('resolveActiveTab', () => {
    it("resolves '/login' to 'accounts'", () => {
      expect(resolveActiveTab('/login')).toBe('accounts')
    })

    it("resolves '/loginweb/steam' to 'accounts'", () => {
      expect(resolveActiveTab('/loginweb/steam')).toBe('accounts')
    })

    it("resolves '/loginweb/:runner' (e.g. '/loginweb/epic') to 'accounts'", () => {
      expect(resolveActiveTab('/loginweb/epic')).toBe('accounts')
    })

    it("resolves '/' to 'games'", () => {
      expect(resolveActiveTab('/')).toBe('games')
    })

    it("resolves '/gamepage/:runner/:appName' to 'games'", () => {
      expect(resolveActiveTab('/gamepage/legendary/abc')).toBe('games')
    })

    it("resolves '/store/:store' (e.g. '/store/gog') to 'stores'", () => {
      expect(resolveActiveTab('/store/gog')).toBe('stores')
    })

    it("resolves '/store-page' to 'stores'", () => {
      expect(resolveActiveTab('/store-page')).toBe('stores')
    })

    it("resolves '/discounts' to 'stores'", () => {
      expect(resolveActiveTab('/discounts')).toBe('stores')
    })

    it("resolves '/store-search' to 'stores'", () => {
      expect(resolveActiveTab('/store-search')).toBe('stores')
    })

    it("resolves '/humble-keys' to 'stores'", () => {
      expect(resolveActiveTab('/humble-keys')).toBe('stores')
    })

    it("resolves '/humble-keys/waiting' to 'stores'", () => {
      expect(resolveActiveTab('/humble-keys/waiting')).toBe('stores')
    })

    it("resolves '/humble-keys/spares' to 'stores'", () => {
      expect(resolveActiveTab('/humble-keys/spares')).toBe('stores')
    })

    it("resolves '/humble-keys/all' to 'stores'", () => {
      expect(resolveActiveTab('/humble-keys/all')).toBe('stores')
    })

    it("resolves a 'last-url' path to 'stores'", () => {
      expect(resolveActiveTab('/store/last-url')).toBe('stores')
    })

    it("resolves '/settings/:type' (e.g. '/settings/general') to 'settings'", () => {
      expect(resolveActiveTab('/settings/general')).toBe('settings')
    })

    it("resolves '/wine-manager' to 'settings'", () => {
      expect(resolveActiveTab('/wine-manager')).toBe('settings')
    })

    it("resolves '/accessibility' to 'settings'", () => {
      expect(resolveActiveTab('/accessibility')).toBe('settings')
    })

    it("resolves '/console' to 'settings'", () => {
      expect(resolveActiveTab('/console')).toBe('settings')
    })

    it("resolves '/wiki' to 'settings'", () => {
      expect(resolveActiveTab('/wiki')).toBe('settings')
    })

    it("resolves '/download-manager' to null -- Downloads is ambient, not a tab", () => {
      expect(resolveActiveTab('/download-manager')).toBeNull()
    })

    it('resolves an unrouted path to null', () => {
      expect(resolveActiveTab('/some-unrouted-path')).toBeNull()
    })
  })

  describe('resolveDefaultStore', () => {
    it("returns 'epic' when nothing is logged in", () => {
      expect(resolveDefaultStore(makeSessions())).toBe('epic')
    })

    it("returns 'zoom' only when zoom.enabled and zoom.username and none of epic/gog/amazon are logged in", () => {
      expect(
        resolveDefaultStore(
          makeSessions({ zoom: { username: 'zoomer', enabled: true } })
        )
      ).toBe('zoom')
    })

    it("does not return 'zoom' when zoom.enabled but epic is also logged in", () => {
      expect(
        resolveDefaultStore(
          makeSessions({
            epic: { username: 'epic-user' },
            zoom: { username: 'zoomer', enabled: true }
          })
        )
      ).toBe('epic')
    })

    it("returns 'amazon' when only amazon.user_id is set", () => {
      expect(
        resolveDefaultStore(makeSessions({ amazon: { user_id: '123' } }))
      ).toBe('amazon')
    })

    it("returns 'gog' when gog.username is set and epic is not", () => {
      expect(
        resolveDefaultStore(makeSessions({ gog: { username: 'gog-user' } }))
      ).toBe('gog')
    })

    it("returns 'steam' when only steam.username is set", () => {
      expect(
        resolveDefaultStore(
          makeSessions({ steam: { username: 'steam-user' } })
        )
      ).toBe('steam')
    })

    it("a non-null sessionStorage 'last-store' value overrides the otherwise-'epic' result", () => {
      getSessionStorageMock().getItem.mockReturnValue('gog')
      expect(resolveDefaultStore(makeSessions())).toBe('gog')
    })

    it("a non-null sessionStorage 'last-store' value overrides every other branch too", () => {
      getSessionStorageMock().getItem.mockReturnValue('epic')
      expect(
        resolveDefaultStore(makeSessions({ amazon: { user_id: '123' } }))
      ).toBe('epic')
    })
  })
})
