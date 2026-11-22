import type { RunsForMeState } from 'common/runsForMe'
import { Get } from 'type-fest'

import {
  WineVersionInfo,
  InstalledInfo,
  UserInfo,
  RecentGame,
  HiddenGame,
  FavouriteGame,
  DMQueueElement,
  AppSettings,
  WikiInfo,
  WindowProps
} from 'common/types'
import { UserData, GogInstalledInfo, GOGLoginData } from 'common/types/gog'
import type { SideloadGameInfo } from 'common/types/sideload'
import { NileUserData } from './nile'
import { SteamUserData, SteamBottleConfig } from './steam'
import { HumbleUserData } from './humble'
import type { CustomTheme } from './customTheme'

export interface StoreStructure {
  configStore: {
    userHome: string
    userInfo: UserInfo
    games: {
      recent: RecentGame[]
      hidden: HiddenGame[]
      favourites: FavouriteGame[]
      customCategories: Record<string, string[]>
    }
    theme: string
    customThemes: CustomTheme[]
    zoomPercent: number
    contentFontFamily: string
    actionsFontFamily: string
    allTilesInColor: boolean
    titlesAlwaysVisible: boolean
    hideTitles: boolean
    cleanTiles: boolean
    disableDialogBackdropClose: boolean
    disableAnimations: boolean
    language: string
    'general-logs': {
      currentLogFile: string
      lastLogFile: string
      legendaryLogFile: string
      gogdlLogFile: string
      nileLogFile: string
    }
    'window-props': WindowProps
    settings: AppSettings
    skipVcRuntime: boolean
    showSnapWarning: boolean
  }
  wineDownloaderInfoStore: {
    'wine-releases': WineVersionInfo[]
  }
  gogInstalledGamesStore: {
    installed: GogInstalledInfo[]
  }
  timestampStore: {
    [K: string]: {
      firstPlayed: string
      lastPlayed: string
      totalPlayed: number
    }
  }
  fontsStore: {
    fonts: string[]
  }
  gogConfigStore: {
    userData: UserData
    credentials?: GOGLoginData
    isLoggedIn: boolean
    // Set only by a PROVEN authentication failure from the GOG sign-in probe
    // (gogdl's own "not logged in / token refresh rejected" verdict). Cleared
    // on a successful sign-in, on logout and on a healthy probe. NEVER set from
    // a network error or timeout — that is "unknown", not "signed out" (the
    // 260822-vov rule). Mirrors steamConfigStore.credentialsMissing.
    expired?: boolean
  }
  steamConfigStore: {
    isLoggedIn: boolean
    refreshToken?: string // safeStorage-encrypted base64 string with 'steam:v1:' prefix
    userData?: SteamUserData
    // Set when a SUCCESSFUL credential read came back empty while the session
    // still says isLoggedIn — i.e. the token the installer needs is provably
    // gone. Cleared the moment a credential is proven present again. Mirrors
    // humbleConfigStore.expired below: the Manage Accounts tile reads it so it
    // stops claiming a clean signed-in state the installer cannot honour.
    // NEVER set from a keyring read that FAILED (denied/timed out) — that is a
    // different condition and reporting it as signed-out is a known false state.
    credentialsMissing?: boolean
  }
  // Phase 17 (17-02): dedicated Steam CrossOver bottle settings — separate
  // from steamConfigStore (auth) and never reused as a phantom GameConfig
  // entry.
  steamBottleConfigStore: SteamBottleConfig
  nileConfigStore: {
    userData?: NileUserData
    // Set only by a PROVEN authentication failure from the Amazon (nile)
    // sign-in probe. Cleared on a successful sign-in, on logout and on a
    // healthy probe. NEVER set from a network error or timeout (the 260822-vov
    // rule). Mirrors steamConfigStore.credentialsMissing.
    expired?: boolean
  }
  // Phase 49 (D-05): Epic's persisted sign-in verdict. Its own store (cwd
  // 'legendary_store', distinct from legendary's own data dir) because Epic had
  // no typed config store of its own. No secret field lives here.
  legendaryConfigStore: {
    // Set only by a PROVEN authentication failure from the sign-in probe
    // (legendary's own "Stored credentials are no longer valid" line). Cleared
    // on a successful sign-in, on logout and on a healthy probe. NEVER set from
    // a network error or timeout (the 260822-vov rule). Mirrors
    // steamConfigStore.credentialsMissing.
    expired?: boolean
  }
  humbleConfigStore: {
    isLoggedIn: boolean
    sessionCookie?: string // safeStorage-encrypted base64 string with 'humble:v1:' prefix
    userData?: HumbleUserData
    // Success criterion 5 / Pitfall 5 (Plan 02): set when safeStorage is
    // unavailable so the Manage Accounts tile can surface a user-visible
    // degraded-encryption warning instead of silently storing plaintext.
    encryptionDegraded?: boolean
    // D-08 (Plan 02): set by the startup/401 health check; cleared on a
    // successful reconnect/re-login.
    expired?: boolean
    // T-14-04 (Phase 14 Plan 02): optional CSRF token captured alongside
    // sessionCookie at login, same safeStorage-encrypted 'humble:v1:'
    // prefix convention. Main-process-only — never included in any
    // sendFrontendMessage payload or HumbleAuthState. Absent when the
    // csrf_cookie was never observed at login (non-fatal, optional).
    csrfToken?: string
  }
  sideloadedStore: {
    games: SideloadGameInfo[]
    // FIXME: Not sure if this is correct, seems like this key is only used once
    installed: InstalledInfo[]
  }
  downloadManager: {
    queue: DMQueueElement[]
    finished: DMQueueElement[]
  }
  gogSyncStore: {
    [appName: string]: {
      [saveName: string]: string
    }
  }
  gogPrivateBranches: {
    [appName: string]: string
  }
  wikigameinfo: {
    [title: string]: WikiInfo
  }
  gameOverridesStore: {
    overrides: Record<
      string,
      {
        title?: string
        art_cover?: string
        art_square?: string
      }
    >
  }
  runsForMeStore: {
    games: Record<string, RunsForMeState>
  }
  macArchStore: {
    verdicts: Record<string, { mac_arch: '32' | '64'; checkedAt: number }>
  }
}

// The options a store construction passes (Phase 35 Plan 05, D-04, narrowed in Phase 85 plan 21
// when `conf` was removed): `name` and `cwd` decide the file (`backend/store_backend.ts` translates
// them and checks containment), and `clearInvalidConfig` is recorded with the registration
// (`registeredStores.json`). The shell (gamelib-store) owns everything else about the file. `T`, the
// store's shape, stays in the signature so every call site keeps naming the store it builds.
export type StoreOptions<T extends Record<string, unknown>> = {
  readonly name?: string
  readonly cwd?: string
  readonly fileExtension?: string
  readonly clearInvalidConfig?: boolean
  /** Never set by a construction site; typed against the store's shape for the registry record. */
  readonly schema?: { readonly [K in keyof T]?: unknown }
}
export type ValidStoreName = keyof StoreStructure

// This is `T`, *except* for when `T` is `unknown`; it then is `never`
// Credits for this goes to michael#7468 on the TS Community Discord server
export type UnknownGuard<T> = unknown extends T
  ? [T] extends [null]
    ? T
    : never
  : T

export abstract class TypeCheckedStore<Name extends ValidStoreName> {
  abstract has(key: string): boolean

  abstract get<KeyType extends string>(
    key: KeyType,
    defaultValue: NonNullable<UnknownGuard<Get<StoreStructure[Name], KeyType>>>
  ): NonNullable<UnknownGuard<Get<StoreStructure[Name], KeyType>>>

  abstract get_nodefault<KeyType extends string>(
    key: KeyType
  ): UnknownGuard<Get<StoreStructure[Name], KeyType> | undefined>

  abstract set<KeyType extends string>(
    key: KeyType,
    value: UnknownGuard<Get<StoreStructure[Name], KeyType>>
  ): void

  // FIXME: This is currently not type-checked properly
  abstract delete<KeyType extends string>(key: KeyType): void

  abstract clear(): void
}
