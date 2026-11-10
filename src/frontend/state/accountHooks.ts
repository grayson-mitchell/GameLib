import { useMemo } from 'react'

import type { AccountSlices } from 'frontend/types'
import useAuthState from './authState'
import type { AuthState } from './authState'
import useLibraryState from './libraryState'
import type { LibraryState } from './libraryState'

// Phase 69-19 (Pattern 4): the composite account/collection shapes the
// AccountSlices always exposed, built by pure functions shared by the D-09
// bridge (the retired bridge) and the convenience hooks below. The hooks
// select raw fields (useShallow via `.keys`) and compose with useMemo, so a
// selector never builds a new object.

// Logout writes null; AccountSlices types these as `string | undefined`.
const name = (value: string | null | undefined) => value as string | undefined

export const composeEpicAccount = (
  lib: Pick<LibraryState, 'epicLibrary'>,
  auth: Pick<AuthState, 'epicUsername' | 'epicLogin' | 'epicLogout'>
): AccountSlices['epic'] => ({
  library: lib.epicLibrary,
  username: name(auth.epicUsername),
  login: auth.epicLogin,
  logout: auth.epicLogout
})

export const composeGogAccount = (
  lib: Pick<LibraryState, 'gogLibrary'>,
  auth: Pick<AuthState, 'gogUsername' | 'gogLogin' | 'gogLogout'>
): AccountSlices['gog'] => ({
  library: lib.gogLibrary,
  username: name(auth.gogUsername),
  login: auth.gogLogin,
  logout: auth.gogLogout
})

export const composeAmazonAccount = (
  lib: Pick<LibraryState, 'amazonLibrary'>,
  auth: Pick<
    AuthState,
    | 'amazonUserId'
    | 'amazonUsername'
    | 'getAmazonLoginData'
    | 'amazonLogin'
    | 'amazonLogout'
  >
): AccountSlices['amazon'] => ({
  library: lib.amazonLibrary,
  user_id: name(auth.amazonUserId),
  username: name(auth.amazonUsername),
  getLoginData: auth.getAmazonLoginData,
  login: auth.amazonLogin,
  logout: auth.amazonLogout
})

export const composeSteamAccount = (
  lib: Pick<LibraryState, 'steamLibrary'>,
  auth: Pick<AuthState, 'steamUsername' | 'steamLogin' | 'steamLogout'>
): AccountSlices['steam'] => ({
  library: lib.steamLibrary,
  username: auth.steamUsername,
  login: auth.steamLogin,
  logout: auth.steamLogout
})

export const composeHumbleAccount = (
  auth: Pick<AuthState, 'humble' | 'humbleLogin' | 'humbleDisconnect'>
): AccountSlices['humble'] => ({
  isLoggedIn: auth.humble.isLoggedIn,
  username: auth.humble.username,
  expired: auth.humble.expired,
  encryptionDegraded: auth.humble.encryptionDegraded,
  keys: auth.humble.keys,
  syncedAt: auth.humble.syncedAt,
  syncError: auth.humble.syncError,
  syncing: auth.humble.syncing,
  login: auth.humbleLogin,
  logout: auth.humbleDisconnect
})

export const composeHiddenGames = (
  lib: Pick<LibraryState, 'hiddenGames' | 'hideGame' | 'unhideGame'>
): AccountSlices['hiddenGames'] => ({
  list: lib.hiddenGames,
  add: lib.hideGame,
  remove: lib.unhideGame
})

export const composeFavouriteGames = (
  lib: Pick<
    LibraryState,
    'favouriteGames' | 'addGameToFavourites' | 'removeGameFromFavourites'
  >
): AccountSlices['favouriteGames'] => ({
  list: lib.favouriteGames,
  add: lib.addGameToFavourites,
  remove: lib.removeGameFromFavourites
})

export const composeCustomCategories = (
  lib: Pick<
    LibraryState,
    | 'customCategories'
    | 'getCustomCategories'
    | 'addGameToCustomCategory'
    | 'removeGameFromCustomCategory'
    | 'setCustomCategory'
    | 'removeCustomCategory'
    | 'renameCustomCategory'
  >
): AccountSlices['customCategories'] => ({
  list: lib.customCategories,
  listCategories: lib.getCustomCategories,
  addToGame: lib.addGameToCustomCategory,
  removeFromGame: lib.removeGameFromCustomCategory,
  addCategory: lib.setCustomCategory,
  removeCategory: lib.removeCustomCategory,
  renameCategory: lib.renameCustomCategory
})

export function useEpicAccount(): AccountSlices['epic'] {
  const lib = useLibraryState.keys('epicLibrary')
  const auth = useAuthState.keys('epicUsername', 'epicLogin', 'epicLogout')
  return useMemo(() => composeEpicAccount(lib, auth), [lib, auth])
}

export function useGogAccount(): AccountSlices['gog'] {
  const lib = useLibraryState.keys('gogLibrary')
  const auth = useAuthState.keys('gogUsername', 'gogLogin', 'gogLogout')
  return useMemo(() => composeGogAccount(lib, auth), [lib, auth])
}

export function useAmazonAccount(): AccountSlices['amazon'] {
  const lib = useLibraryState.keys('amazonLibrary')
  const auth = useAuthState.keys(
    'amazonUserId',
    'amazonUsername',
    'getAmazonLoginData',
    'amazonLogin',
    'amazonLogout'
  )
  return useMemo(() => composeAmazonAccount(lib, auth), [lib, auth])
}

export function useSteamAccount(): AccountSlices['steam'] {
  const lib = useLibraryState.keys('steamLibrary')
  const auth = useAuthState.keys('steamUsername', 'steamLogin', 'steamLogout')
  return useMemo(() => composeSteamAccount(lib, auth), [lib, auth])
}

export function useHumbleAccount(): AccountSlices['humble'] {
  const auth = useAuthState.keys('humble', 'humbleLogin', 'humbleDisconnect')
  return useMemo(() => composeHumbleAccount(auth), [auth])
}

export function useHiddenGames(): AccountSlices['hiddenGames'] {
  const lib = useLibraryState.keys('hiddenGames', 'hideGame', 'unhideGame')
  return useMemo(() => composeHiddenGames(lib), [lib])
}

export function useFavouriteGames(): AccountSlices['favouriteGames'] {
  const lib = useLibraryState.keys(
    'favouriteGames',
    'addGameToFavourites',
    'removeGameFromFavourites'
  )
  return useMemo(() => composeFavouriteGames(lib), [lib])
}

export function useCustomCategories(): AccountSlices['customCategories'] {
  const lib = useLibraryState.keys(
    'customCategories',
    'getCustomCategories',
    'addGameToCustomCategory',
    'removeGameFromCustomCategory',
    'setCustomCategory',
    'removeCustomCategory',
    'renameCustomCategory'
  )
  return useMemo(() => composeCustomCategories(lib), [lib])
}
