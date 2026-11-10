import '../../testUtils/tauriWindow'
import type { GameInfo } from 'common/types'
import {
  composeAmazonAccount,
  composeCustomCategories,
  composeEpicAccount,
  composeFavouriteGames,
  composeGogAccount,
  composeHiddenGames,
  composeHumbleAccount,
  composeSteamAccount
} from '../accountHooks'

// Pure builders only: the hooks wrap them in useMemo over raw store fields, and
// the bridge calls the very same builders (the retired bridge tests).

const fn = () => Promise.resolve('')
const lib = [{ app_name: 'a' }] as GameInfo[]

describe('account composite builders', () => {
  it('composeEpicAccount maps library, username (null passes through) and actions', () => {
    const login = fn
    const logout = () => Promise.resolve()
    expect(
      composeEpicAccount(
        { epicLibrary: lib },
        { epicUsername: 'u', epicLogin: login, epicLogout: logout }
      )
    ).toEqual({ library: lib, username: 'u', login, logout })
    expect(
      composeEpicAccount(
        { epicLibrary: lib },
        { epicUsername: null, epicLogin: login, epicLogout: logout }
      ).username
    ).toBeNull()
  })

  it('composeGogAccount', () => {
    const logout = () => Promise.resolve()
    expect(
      composeGogAccount(
        { gogLibrary: lib },
        { gogUsername: 'g', gogLogin: fn, gogLogout: logout }
      )
    ).toEqual({ library: lib, username: 'g', login: fn, logout })
  })

  it('composeAmazonAccount renames userId to user_id', () => {
    const getLoginData = () => Promise.resolve({} as never)
    const logout = () => Promise.resolve()
    expect(
      composeAmazonAccount(
        { amazonLibrary: lib },
        {
          amazonUserId: 'id',
          amazonUsername: 'n',
          getAmazonLoginData: getLoginData,
          amazonLogin: fn,
          amazonLogout: logout
        }
      )
    ).toEqual({
      library: lib,
      user_id: 'id',
      username: 'n',
      getLoginData,
      login: fn,
      logout
    })
  })

  it('composeSteamAccount keeps a null username as-is', () => {
    const logout = () => Promise.resolve()
    expect(
      composeSteamAccount(
        { steamLibrary: lib },
        { steamUsername: null, steamLogin: fn, steamLogout: logout }
      )
    ).toEqual({ library: lib, username: null, login: fn, logout })
  })

  it('composeHumbleAccount flattens the humble slice and renames disconnect to logout', () => {
    const logout = () => Promise.resolve()
    const out = composeHumbleAccount({
      humble: {
        isLoggedIn: true,
        username: 'h',
        expired: false,
        encryptionDegraded: false,
        keys: [],
        syncedAt: 5,
        syncError: 'none',
        syncing: false
      },
      humbleLogin: fn,
      humbleDisconnect: logout
    } as never)
    expect(out).toEqual({
      isLoggedIn: true,
      username: 'h',
      expired: false,
      encryptionDegraded: false,
      keys: [],
      syncedAt: 5,
      syncError: 'none',
      syncing: false,
      login: fn,
      logout
    })
  })

  it('composeHiddenGames / composeFavouriteGames / composeCustomCategories map list and action names', () => {
    const a = () => undefined
    const b = () => undefined
    expect(
      composeHiddenGames({
        hiddenGames: [],
        hideGame: a,
        unhideGame: b
      })
    ).toEqual({ list: [], add: a, remove: b })
    expect(
      composeFavouriteGames({
        favouriteGames: [],
        addGameToFavourites: a,
        removeGameFromFavourites: b
      })
    ).toEqual({ list: [], add: a, remove: b })
    const list = () => ['c']
    expect(
      composeCustomCategories({
        customCategories: { c: ['x'] },
        getCustomCategories: list,
        addGameToCustomCategory: a,
        removeGameFromCustomCategory: b,
        setCustomCategory: a,
        removeCustomCategory: b,
        renameCustomCategory: a
      })
    ).toEqual({
      list: { c: ['x'] },
      listCategories: list,
      addToGame: a,
      removeFromGame: b,
      addCategory: a,
      removeCategory: b,
      renameCategory: a
    })
  })
})
