import { create } from 'zustand'
import { t } from 'i18next'
import { subscribeWithSelector } from 'zustand/middleware'

import type { Runner } from 'common/types'
import type { NileRegisterData } from 'common/types/nile'
import type {
  HumbleAuthState,
  HumbleKey,
  HumbleSyncState
} from 'common/types/humble'
import {
  resolveSignInStates,
  sanitizeSignInProbeOutcomeMap,
  type SignInProbeOutcomeMap,
  type SignInState,
  type SignInStore
} from 'common/signInState'
import {
  addSignInDismissal,
  normalizeSignInDismissals,
  rearmSignInDismissals
} from 'common/signInDismissal'
import {
  configStore,
  gogConfigStore,
  humbleConfigStore,
  nileConfigStore,
  steamConfigStore
} from '../helpers/stores'
import { collectSignInInputs } from '../helpers/signInInputs'
import { resyncSignInIdentity } from '../helpers/signInIdentityResync'
import {
  createOAuthLoginCompletion,
  type OAuthLoginCompletionPayload
} from '../screens/WebView/useTauriOAuthLogin'
import useLibraryState from './libraryState'
import { performSteamLogout } from './SteamSignOut'
import { bindStoreHooks, registerStoreForReset } from './storeKit'
import useUiState from './uiState'

// Phase 69 D-01: auth domain store. Holds every sign-in identity (display
// names and the Amazon user id), the Humble session flags and key inventory,
// this launch's sign-in probe outcomes and the persisted per-store dismissed
// set, plus the login/logout actions (69-14). No persist
// middleware (D-02): only the dismiss and re-arm writers persist, via
// setSetting, exactly as the class did (R6).

type Maybe<T> = T | null | undefined

interface HumbleAuthSlice {
  isLoggedIn?: boolean
  username?: string | null
  expired?: boolean
  encryptionDegraded?: boolean
  keys?: HumbleKey[]
  syncedAt?: number | null
  syncError?: HumbleSyncState['syncError']
  syncing?: boolean
}

export interface AuthState {
  epicUsername: Maybe<string>
  gogUsername: Maybe<string>
  amazonUserId: Maybe<string>
  amazonUsername: Maybe<string>
  steamUsername: Maybe<string>
  humble: HumbleAuthSlice
  // 49-07 (D-08): `{}` means every store is still pending. Both the push and
  // the one-time pull pass through sanitizeSignInProbeOutcomeMap.
  signInProbeOutcomes: SignInProbeOutcomeMap
  // 49-07 (D-10): renderer-owned; only the dismiss and re-arm writers persist.
  dismissedSignInNotices: SignInStore[]

  handleDismissSignInNotice: (store: SignInStore) => void
  handleRearmSignInDismissals: (
    states: Record<SignInStore, SignInState>
  ) => void
  rearmFromCurrentState: () => void
  resyncSignInIdentityFromStores: () => void
  applyHumbleAuthState: (humbleState: HumbleAuthState) => void
  applySignInProbeOutcomes: (outcomes: unknown) => void
  applyHumbleKeys: (keys: HumbleKey[]) => void
  applyHumbleSyncProgress: (done: number, total: number) => void
  /** `clearSyncing` is true for the terminal push, false for the mount pull. */
  applyHumbleSyncState: (
    syncState: HumbleSyncState,
    clearSyncing?: boolean
  ) => void

  handleSuccessfulLogin: (runner: Runner) => void
  completeOAuthLogin: (payload: OAuthLoginCompletionPayload) => void
  epicLogin: (sid: string) => Promise<string>
  epicLogout: () => Promise<void>
  gogLogin: (token: string) => Promise<string>
  gogLogout: () => Promise<void>
  amazonLogin: (data: NileRegisterData) => Promise<string>
  amazonLogout: () => Promise<void>
  getAmazonLoginData: () => ReturnType<typeof window.api.getAmazonLoginData>
  steamLogin: (result: { status: string; username?: string }) => Promise<string>
  steamLogout: () => Promise<void>
  humbleLogin: (result: {
    status: string
    username?: string
  }) => Promise<string>
  humbleDisconnect: () => Promise<void>
}

/** Element-wise equality of two canonical-order store lists. */
function sameSignInStores(
  a: readonly SignInStore[],
  b: readonly SignInStore[]
): boolean {
  return a.length === b.length && a.every((store, i) => store === b[i])
}

const humbleDefaults: HumbleAuthSlice = {
  keys: [],
  syncedAt: null,
  syncError: 'none',
  syncing: false
}

/** Identity reads at CALL time (the class read them at construction). */
export function readInitialAuth(): Pick<
  AuthState,
  | 'epicUsername'
  | 'gogUsername'
  | 'amazonUserId'
  | 'amazonUsername'
  | 'steamUsername'
  | 'humble'
  | 'dismissedSignInNotices'
> {
  return {
    epicUsername: configStore.get_nodefault('userInfo.displayName'),
    gogUsername: gogConfigStore.get_nodefault('userData.username'),
    amazonUserId: nileConfigStore.get_nodefault('userData.user_id'),
    amazonUsername: nileConfigStore.get_nodefault('userData.name'),
    steamUsername: steamConfigStore.get_nodefault('userData')?.username,
    dismissedSignInNotices: normalizeSignInDismissals(
      configStore.get_nodefault('settings')?.dismissedSignInNotices
    ),
    humble: {
      // D-02/D-16: `isLoggedIn` is the connected-state signal, NOT `username`,
      // which is best-effort and often absent.
      isLoggedIn: humbleConfigStore.get_nodefault('isLoggedIn'),
      username: humbleConfigStore.get_nodefault('userData')?.username,
      // WR-05/D-08: a restart with a known-expired session shows reconnect
      // immediately, even offline.
      expired: humbleConfigStore.get_nodefault('expired') ?? false,
      encryptionDegraded: humbleConfigStore.get_nodefault('encryptionDegraded'),
      // keys/sync state arrive via IPC (boot pull + pushes), never from a
      // config store.
      ...humbleDefaults
    }
  }
}

const useAuthStateRaw = create<AuthState>()(
  subscribeWithSelector((set, get) => {
    const persistDismissed = (next: SignInStore[]) => {
      set({ dismissedSignInNotices: next })
      window.api.setSetting({
        appName: 'default',
        key: 'dismissedSignInNotices',
        value: next
      })
    }

    return {
      epicUsername: undefined,
      gogUsername: undefined,
      amazonUserId: undefined,
      amazonUsername: undefined,
      steamUsername: undefined,
      humble: { expired: false, ...humbleDefaults },
      signInProbeOutcomes: {},
      dismissedSignInNotices: [],

      // 49-07 (D-10): dismissing twice equals once -- persist only when the
      // set actually changed.
      handleDismissSignInNotice: (store) => {
        const current = get().dismissedSignInNotices
        const next = addSignInDismissal(current, store)
        if (sameSignInStores(current, next)) return
        persistDismissed(next)
      },

      // 49-07 (D-10): re-arm is a renderer-side prune at the proven-expired
      // observation. The sidecar pass never writes AppSettings.
      handleRearmSignInDismissals: (states) => {
        const current = get().dismissedSignInNotices
        const next = rearmSignInDismissals(current, states)
        if (sameSignInStores(current, next)) return
        persistDismissed(next)
      },

      // Idempotent: every call site (outcome push/pull, Humble auth push, end
      // of mount) may call it freely.
      rearmFromCurrentState: () => {
        const s = get()
        const states = resolveSignInStates(
          collectSignInInputs(
            {
              epicUsername: s.epicUsername,
              gogUsername: s.gogUsername,
              amazonUserId: s.amazonUserId,
              humbleLoggedIn: s.humble.isLoggedIn,
              humbleExpired: s.humble.expired,
              steamUsername: s.steamUsername
            },
            s.signInProbeOutcomes
          )
        )
        get().handleRearmSignInDismissals(states)
      },

      // Quick 261029-quw item 2: re-read the five identity fields from their
      // config stores and re-arm the notice. An empty patch skips set, so
      // calling this after every refresh cannot loop.
      resyncSignInIdentityFromStores: () => {
        try {
          const s = get()
          const patch = resyncSignInIdentity(
            {
              epic: { username: s.epicUsername },
              gog: { username: s.gogUsername },
              amazon: { user_id: s.amazonUserId, username: s.amazonUsername },
              humble: s.humble,
              steam: { username: s.steamUsername }
            },
            {
              legendaryDisplayName: () =>
                configStore.get_nodefault('userInfo.displayName'),
              gogUsername: () =>
                gogConfigStore.get_nodefault('userData.username'),
              nileUserId: () =>
                nileConfigStore.get_nodefault('userData.user_id'),
              nileName: () => nileConfigStore.get_nodefault('userData.name'),
              humbleIsLoggedIn: () =>
                humbleConfigStore.get_nodefault('isLoggedIn'),
              humbleUsername: () =>
                humbleConfigStore.get_nodefault('userData')?.username,
              humbleExpired: () => humbleConfigStore.get_nodefault('expired'),
              steamUsername: () =>
                steamConfigStore.get_nodefault('userData')?.username
            }
          )
          if (Object.keys(patch).length > 0) {
            set((prev) => ({
              ...(patch.epic && { epicUsername: patch.epic.username }),
              ...(patch.gog && { gogUsername: patch.gog.username }),
              ...(patch.amazon && {
                ...('user_id' in patch.amazon && {
                  amazonUserId: patch.amazon.user_id
                }),
                ...('username' in patch.amazon && {
                  amazonUsername: patch.amazon.username
                })
              }),
              ...(patch.humble && {
                humble: { ...prev.humble, ...patch.humble }
              }),
              ...(patch.steam && { steamUsername: patch.steam.username })
            }))
          }
        } catch (error) {
          window.api.logError(
            `Sign-in identity resync failed: ${String(error)}`
          )
        }
        get().rearmFromCurrentState()
      },

      // D-09: state-only -- the expiry toast reacts to `expired` on its own.
      applyHumbleAuthState: (humbleState) => {
        set((prev) => ({
          humble: {
            ...prev.humble,
            isLoggedIn: humbleState.isLoggedIn,
            username: humbleState.username ?? prev.humble.username,
            expired: !!humbleState.expired
          }
        }))
        get().rearmFromCurrentState()
      },

      // 49-07 (D-08): sanitised at the boundary (T-49-20).
      applySignInProbeOutcomes: (outcomes) => {
        set({ signInProbeOutcomes: sanitizeSignInProbeOutcomeMap(outcomes) })
        get().rearmFromCurrentState()
      },

      // Keys ONLY: this fires after every committed order, so it must not
      // touch `syncing` (live-UAT round 2).
      applyHumbleKeys: (keys) => {
        set((prev) => ({ humble: { ...prev.humble, keys } }))
      },

      applyHumbleSyncProgress: (done, total) => {
        set((prev) => ({ humble: { ...prev.humble, syncing: done < total } }))
      },

      applyHumbleSyncState: (syncState, clearSyncing = true) => {
        set((prev) => ({
          humble: {
            ...prev.humble,
            syncedAt: syncState.syncedAt,
            syncError: syncState.syncError,
            ...(clearSyncing && { syncing: false })
          }
        }))
      },

      handleSuccessfulLogin: (runner) => {
        window.localStorage.setItem('category', 'all')
        get().resyncSignInIdentityFromStores()
        void useLibraryState.getState().refreshLibrary({
          runInBackground: false,
          library: runner,
          origin: 'login-success'
        })
      },

      // `useTauriOAuthLogin.ts` calls the RAW auth channels itself, so this is
      // exactly the post-login half of epicLogin/gogLogin/amazonLogin, routed
      // through the existing handleSuccessfulLogin (never a second refresh path).
      completeOAuthLogin: completeOAuthLogin,

      epicLogin: async (sid) => {
        console.log('logging epic')
        const response = await window.api.login(sid)

        if (response.status === 'done') {
          useLibraryState.getState().resetRunnerLibrary('legendary')
          set({ epicUsername: response.data?.displayName })

          get().handleSuccessfulLogin('legendary')
        }

        return response.status
      },

      epicLogout: async () => {
        useLibraryState.getState().setRefreshing(true)
        // Phase 35 plan 09: `logoutLegendary` can REJECT. The `finally` keeps a
        // rejection from latching the global loading state; the rejection is
        // deliberately NOT swallowed (Runner's logout guard surfaces it).
        try {
          await window.api.logoutLegendary().finally(() => {
            useLibraryState.getState().resetRunnerLibrary('legendary')
            set({ epicUsername: null })
          })
          console.log('Logging out from epic')
        } finally {
          useLibraryState.getState().setRefreshing(false)
        }
      },

      gogLogin: async (token) => {
        console.log('logging gog')
        const response = await window.api.authGOG(token)

        if (response.status === 'done') {
          useLibraryState.getState().resetRunnerLibrary('gog')
          set({ gogUsername: response.data?.username })

          get().handleSuccessfulLogin('gog')
        }

        return response.status
      },

      gogLogout: async () => {
        window.api.logoutGOG()
        useLibraryState.getState().resetRunnerLibrary('gog')
        set({ gogUsername: null })
        console.log('Logging out from gog')
      },

      amazonLogin: async (data) => {
        console.log('logging amazon')
        const response = await window.api.authAmazon(data)

        if (response.status === 'done') {
          useLibraryState.getState().resetRunnerLibrary('nile')
          set({
            amazonUserId: response.user?.user_id,
            amazonUsername: response.user?.name
          })

          get().handleSuccessfulLogin('nile')
        }

        return response.status
      },

      amazonLogout: async () => {
        await window.api.logoutAmazon()
        useLibraryState.getState().resetRunnerLibrary('nile')
        set({ amazonUserId: null, amazonUsername: null })
        console.log('Logging out from amazon')
      },

      getAmazonLoginData: async () => window.api.getAmazonLoginData(),

      steamLogin: async (result) => {
        if (result.status === 'done') {
          useLibraryState.getState().resetRunnerLibrary('steam')
          set({ steamUsername: result.username })
          get().resyncSignInIdentityFromStores()
          void useLibraryState.getState().refreshLibrary({
            runInBackground: true,
            library: 'steam',
            origin: 'steam-login',
            checkForUpdates: true
          })
        }
        return result.status
      },

      // Phase 34.4: logoutSteam is a fire-and-forget send, so wiping local state
      // immediately races the sidecar. performSteamLogout polls getSteamUserInfo
      // for confirmation before either branch below runs (see SteamSignOut.ts).
      steamLogout: async () => {
        await performSteamLogout({
          logoutSteam: window.api.logoutSteam,
          getSteamUserInfo: window.api.getSteamUserInfo,
          onSignedOut: () => {
            // Installed Steam games stay listed signed out (UAT 23); steamLogin
            // still resets before its sync.
            useLibraryState.setState((s) => ({
              steamLibrary: s.steamLibrary.filter((g) => g.is_installed)
            }))
            set({ steamUsername: null })
            console.log('Logging out from steam')
          },
          onSignOutFailed: () => {
            console.warn(
              '[GameLib] logoutSteam did not confirm a signed-out state ' +
                'within the poll window; leaving local state untouched rather ' +
                'than reloading into a possibly-still-signed-in session.'
            )
            useUiState.getState().showDialogModal({
              title: t(
                'gamelib:login.steam_logout_failed_title',
                'Sign-out failed'
              ),
              message: t(
                'gamelib:login.steam_logout_failed_message',
                "Steam sign-out didn't finish in time. Please try again."
              ),
              buttons: [{ text: t('box.ok', 'OK') }]
            })
          }
        })
      },

      // Humble is not a Runner: no library, no refreshLibrary(). Covers both a
      // fresh login and a reconnect-after-expiry.
      humbleLogin: async (result) => {
        if (result.status === 'done') {
          set({
            humble: {
              ...get().humble,
              // D-02/D-16: 'done' means the gamekeys endpoint validated the
              // session -- that is the connected flag; `username` is display-only.
              isLoggedIn: true,
              username: result.username,
              expired: false
            }
          })
          get().resyncSignInIdentityFromStores()
          // D-23: a successful login/reconnect triggers a sync.
          void window.api.humbleSync()
        }
        return result.status
      },

      // D-03: disconnect is confirmation-gated; the wipe only runs on Yes.
      humbleDisconnect: async () => {
        useUiState.getState().showDialogModal({
          title: t(
            'login.humble_disconnect_title',
            'Disconnect Humble Bundle?'
          ),
          message: t(
            'login.humble_disconnect_message',
            'This removes your Humble Bundle session from GameLib. You can reconnect at any time.'
          ),
          buttons: [
            {
              text: t('box.yes'),
              onClick: () => {
                window.api.humbleDisconnect()
                set({
                  // HumbleUser.disconnect() wipes the library/sync stores --
                  // mirror that so no stale key inventory shows.
                  humble: {
                    isLoggedIn: false,
                    username: null,
                    expired: false,
                    keys: [],
                    syncedAt: null,
                    syncError: 'none',
                    syncing: false
                  }
                })
              }
            },
            { text: t('box.no') }
          ]
        })
      }
    }
  })
)

function completeOAuthLogin(payload: OAuthLoginCompletionPayload): void {
  oauthCompletion(payload)
}

registerStoreForReset(useAuthStateRaw)

// The factory's `{ epic: { library: [], username } }` update splits here:
// identity -> authState, library -> the library reset slot.
const oauthCompletion = createOAuthLoginCompletion({
  setState: (update) => {
    const { epic, gog, amazon } = update as {
      epic?: { username?: string }
      gog?: { username?: string }
      amazon?: { user_id?: string; username?: string }
    }
    const resetLibrary = useLibraryState.getState().resetRunnerLibrary
    if (epic) {
      resetLibrary('legendary')
      useAuthStateRaw.setState({ epicUsername: epic.username })
    }
    if (gog) {
      resetLibrary('gog')
      useAuthStateRaw.setState({ gogUsername: gog.username })
    }
    if (amazon) {
      resetLibrary('nile')
      useAuthStateRaw.setState({
        amazonUserId: amazon.user_id,
        amazonUsername: amazon.username
      })
    }
  },
  handleSuccessfulLogin: (runner) =>
    useAuthStateRaw.getState().handleSuccessfulLogin(runner)
})

const useAuthState = bindStoreHooks(useAuthStateRaw)
export default useAuthState
