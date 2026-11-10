import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type {
  FavouriteGame,
  GameInfo,
  GameStatus,
  HiddenGame,
  RefreshOptions,
  Runner
} from 'common/types'
import type { RunsForMeState } from 'common/runsForMe'
import type { SteamSyncStatus } from 'common/types/ipc'
import {
  configStore,
  gameOverridesStore,
  gogInstalledGamesStore,
  gogLibraryStore,
  libraryStore,
  nileLibraryStore,
  sideloadLibrary,
  steamLibraryStore
} from 'frontend/helpers/stores'
import { getLegendaryConfig } from 'frontend/helpers'
import { attachGameOverrides } from 'frontend/helpers/gameOverrides'
import { isStore } from 'common/storeCapabilities'
import useAuthState from './authState'
import { bindStoreHooks, registerStoreForReset } from './storeKit'
import { useBottleLaunchWaiting } from './BottleLaunchWaiting'

// Phase 69 D-09: library domain store. authState (D-10 puts auth before
// library) reaches refreshLibrary, resetRunnerLibrary and setRefreshing through
// this store's real actions.

// GAP CYCLE 4 (34.5-33): `origin` identifies which call site triggered a
// refresh. Kept local rather than added to the shared RefreshOptions.
export type RefreshLibraryOptions = RefreshOptions & { origin?: string }

type GameOverride = NonNullable<GameInfo['overrides']>

export interface LibraryState {
  // Phase 69-19: the per-game operation status list (formerly the last field
  // of the GlobalState class) and its push handler, the hot path.
  libraryStatus: GameStatus[]
  handleGameStatus: (status: GameStatus) => Promise<void>
  refreshLibrary: (options: RefreshLibraryOptions) => Promise<void>
  steamMetadataSyncing: boolean
  // Phase 34.15 (34.15-02), D-06: tri-state driver of the Steam sync
  // indicator; deliberately independent of refreshingInTheBackground (the
  // old boolean defaults true and resets true after every unscoped refresh,
  // so it never meant "a refresh is running"). refreshingByRunner.steam was
  // rejected as the carrier: a boolean cannot tell "failed" from
  // "succeeded-and-empty", and the mount-time refresh is unscoped.
  steamSyncStatus: SteamSyncStatus
  setSteamMetadataSyncing: (syncing: boolean) => void
  setSteamSyncStatus: (status: SteamSyncStatus) => void
  resetRunnerLibrary: (runner: Runner) => void
  setRefreshing: (value: boolean) => void

  epicLibrary: GameInfo[]
  gogLibrary: GameInfo[]
  amazonLibrary: GameInfo[]
  steamLibrary: GameInfo[]
  sideloadedLibrary: GameInfo[]
  gameUpdates: string[]
  refreshing: boolean
  refreshingInTheBackground: boolean
  // debug/login-logout-wipes-library: per-runner scoped refresh tracking, kept
  // SEPARATE from the two global flags. A single-runner refresh (login/logout of
  // ONE platform) writes here instead of `refreshing`/`refreshingInTheBackground`
  // -- those two remain reserved for a genuine all-runners refresh (mount-time
  // load, manual "Refresh Library"), so Library/index.tsx's merged-grid gate
  // never blanks every platform's games just because one platform logged in or
  // out.
  refreshingByRunner: Partial<Record<Runner, boolean>>

  updateGameOverrides: (overrides: Record<string, GameOverride>) => void
  applyGamePush: (info: GameInfo) => void
  refresh: (
    library?: Runner | 'all',
    checkUpdates?: boolean,
    overridesArg?: Record<string, GameOverride>
  ) => Promise<void>

  hiddenGames: HiddenGame[]
  favouriteGames: FavouriteGame[]
  customCategories: Record<string, string[]>
  currentCustomCategories: string[]

  setCurrentCustomCategories: (categories: string[]) => void
  hideGame: (appName: string, title: string) => void
  unhideGame: (appName: string) => void
  addGameToFavourites: (appName: string, title: string) => void
  removeGameFromFavourites: (appName: string) => void
  getCustomCategories: () => string[]
  getCurrentCustomCategories: () => string[]
  setCustomCategory: (newCategory: string) => void
  removeCustomCategory: (category: string) => void
  renameCustomCategory: (oldName: string, newName: string) => void
  addGameToCustomCategory: (category: string, appName: string) => void
  removeGameFromCustomCategory: (category: string, appName: string) => void

  gameOverrides: Record<string, GameOverride>
  setGameOverrides: (overrides: Record<string, GameOverride>) => void

  // Phase 19 (Plan 06), D-11/D-16: display-only three-state CrossOver
  // rating map (`number` = matched rating, `null` = looked-up-but-absent,
  // key-absent = never looked up). The grid reads this synchronously — no
  // component writes back to it, and reading it never triggers a fetch.
  crossoverRatings: Record<string, number | null>
  setCrossoverRatings: (ratings: Record<string, number | null>) => void

  // Quick 261029-mkz: per-game "Runs for me" override map, keyed
  // `${app_name}_${runner}`. Backend-persisted; this slice mirrors it.
  runsForMe: Record<string, RunsForMeState>
  setRunsForMe: (map: Record<string, RunsForMeState>) => void
}

// function to load the new key or fallback to the old one
const loadCurrentCategories = (): string[] => {
  const storage = window.localStorage
  const currentCategories = storage.getItem('current_custom_categories') || null
  if (!currentCategories) {
    const currentCategory = storage.getItem('current_custom_category') || null
    if (!currentCategory) {
      return []
    } else {
      return [currentCategory]
    }
  } else {
    return JSON.parse(currentCategories) as string[]
  }
}

const currentOverrides = () => useLibraryStateRaw.getState().gameOverrides

const applyGameOverrides = (
  lib: GameInfo[],
  overrides: Record<string, GameOverride> = currentOverrides()
) => attachGameOverrides(lib, overrides)

const loadLegendaryLibrary = (
  overrides: Record<string, GameOverride> = currentOverrides()
): GameInfo[] => applyGameOverrides(libraryStore.get('library', []), overrides)

const loadGOGLibrary = (
  overrides: Record<string, GameOverride> = currentOverrides()
): GameInfo[] => {
  const games = gogLibraryStore.get('games', [])

  const installedGames = gogInstalledGamesStore.get('installed', [])
  for (const game of games) {
    for (const installedGame of installedGames) {
      if (installedGame.appName === game.app_name) {
        game.install = installedGame
        game.is_installed = true
      }
    }
  }

  return applyGameOverrides(games, overrides)
}

const loadAmazonLibrary = (
  overrides: Record<string, GameOverride> = currentOverrides()
): GameInfo[] =>
  applyGameOverrides(nileLibraryStore.get('library', []), overrides)

const loadSteamLibrary = (
  overrides: Record<string, GameOverride> = currentOverrides()
): GameInfo[] =>
  applyGameOverrides(steamLibraryStore.get('games', []), overrides)

const loadSideloadedLibrary = (
  overrides: Record<string, GameOverride> = currentOverrides()
): GameInfo[] => applyGameOverrides(sideloadLibrary.get('games', []), overrides)

const upsertByAppName = (library: GameInfo[], info: GameInfo): GameInfo[] => {
  const next = [...library]
  const index = next.findIndex((game) => game.app_name === info.app_name)
  if (index !== -1) {
    next[index] = info
  } else {
    next.push(info)
  }
  return next
}

/**
 * Re-reads the persisted library state at boot (R5). `gameOverrides` is read
 * here, post-hydration (formerly at `create()`, before the snapshot landed; see
 * the 2026-11-10 import-time-mirror-reads todo), and passed explicitly to every
 * loader because the store still holds the stale `{}` when they run.
 */
export function readInitialLibrary(): Pick<
  LibraryState,
  | 'hiddenGames'
  | 'favouriteGames'
  | 'customCategories'
  | 'currentCustomCategories'
  | 'epicLibrary'
  | 'gogLibrary'
  | 'amazonLibrary'
  | 'steamLibrary'
  | 'sideloadedLibrary'
  | 'gameOverrides'
> {
  const gameOverrides = gameOverridesStore.get('overrides', {})
  return {
    gameOverrides,
    hiddenGames: configStore.get('games.hidden', []),
    favouriteGames: configStore.get('games.favourites', []),
    customCategories: configStore.get('games.customCategories', {}),
    currentCustomCategories: loadCurrentCategories(),
    epicLibrary: loadLegendaryLibrary(gameOverrides),
    gogLibrary: loadGOGLibrary(gameOverrides),
    amazonLibrary: loadAmazonLibrary(gameOverrides),
    steamLibrary: loadSteamLibrary(gameOverrides),
    sideloadedLibrary: loadSideloadedLibrary(gameOverrides)
  }
}

const useLibraryStateRaw = create<LibraryState>()(
  subscribeWithSelector(
    (set, get): LibraryState => ({
      libraryStatus: [],

      handleGameStatus: async ({
        appName,
        status,
        folder,
        context,
        progress,
        runner,
        managedBySteam
      }: GameStatus): Promise<void> => {
        const { libraryStatus, gameUpdates } = get()

        // Phase 51 Plan 08 (D-51-16, folded todo): the "waiting for Steam"
        // state ends either way the launch resolves -- the game's own process
        // appearing (playing) or the launch itself ending (done). Runs before
        // every other branch below (including the !currentApp early return) so
        // neither path can skip it.
        if (status === 'playing' || status === 'done') {
          useBottleLaunchWaiting.getState().clear(appName)
        }

        const currentApp = libraryStatus.find(
          (game) => game.appName === appName
        )

        // add app to libraryStatus if it was not present
        if (!currentApp) {
          return set({
            libraryStatus: [
              ...libraryStatus,
              {
                appName,
                status,
                folder,
                context,
                progress,
                runner,
                ...(managedBySteam ? { managedBySteam } : {})
              }
            ]
          })
        }

        // if the app's status didn't change, do nothing
        if (
          currentApp.status === status &&
          currentApp.context === context &&
          !!currentApp.managedBySteam === !!managedBySteam
        ) {
          return
        }

        // if the app's status did change, remove it from the current list and then handle the new status
        const newLibraryStatus = libraryStatus.filter(
          (game) => game.appName !== appName
        )

        // in these cases we just add the new status
        if (
          [
            'installing',
            'updating',
            'playing',
            'extracting',
            'launching',
            'winetricks',
            'redist',
            'drm-setup',
            'engine-download',
            'steam-starting',
            'queued'
          ].includes(status)
        ) {
          newLibraryStatus.push({
            appName,
            status,
            folder,
            context,
            progress,
            runner,
            ...(managedBySteam ? { managedBySteam } : {})
          })
          set({ libraryStatus: newLibraryStatus })
        }

        // when error or done we remove it from the status info
        if (['error', 'done'].includes(status)) {
          // also remove from updates if it was updating
          if (currentApp.status === 'updating') {
            const updatedGamesUpdates = gameUpdates.filter(
              (game) => game !== appName
            )
            // This avoids calling legendary again before the previous process is killed when canceling
            void get().refreshLibrary({
              checkForUpdates: true,
              runInBackground: true,
              library: runner,
              origin: 'game-status'
            })

            window.localStorage.setItem(
              'updates',
              JSON.stringify(updatedGamesUpdates)
            )
            set({ gameUpdates: updatedGamesUpdates })
            return set({ libraryStatus: newLibraryStatus })
          }

          void get().refreshLibrary({
            runInBackground: true,
            library: runner,
            origin: 'game-status'
          })

          set({ libraryStatus: newLibraryStatus })
        }
      },

      refreshLibrary: async ({
        checkForUpdates,
        runInBackground = true,
        library = undefined,
        origin = 'unknown'
      }: RefreshLibraryOptions): Promise<void> => {
        const libraryAtStart = get()
        if (libraryAtStart.refreshing) return

        // GAP CYCLE 4 (34.5-33, item 2): this line used to be
        // `Refreshing ${library} Library`, which printed the literal word
        // `undefined` whenever `library` was omitted — indistinguishable from a
        // genuine runner name in a live log. `library ?? 'all'` matches the
        // semantics `window.api.refreshLibrary(undefined)` already carries at
        // main.ts:1051 and (gap cycle 4, plan 34.5-33) now carries in the
        // sidecar handler too — the runner-less case IS "all", never a mystery
        // value. `origin` names the call site so a live log can attribute a
        // refresh to its trigger.
        const runnerScope = library ?? 'all'
        window.api.logInfo(
          `[refreshLibrary] runner=${runnerScope} origin=${origin}`
        )

        // debug/login-logout-wipes-library: a SCOPED call (a specific runner,
        // never `undefined`/`'all'`) tracks its own `refreshingByRunner` entry
        // instead of the two GLOBAL flags below — see `.refresh()`'s matching
        // final `setState` and `StateProps.refreshingByRunner`'s doc comment for
        // why. The guard mirrors the top-of-function `if (this.state.refreshing)
        // return` above, but scoped to this ONE runner, so two overlapping
        // scoped refreshes of the SAME runner (e.g. a double-click) can't step
        // on each other; it does NOT block a DIFFERENT runner's scoped refresh
        // from starting concurrently — that's the whole point of this fix.
        const scopedRunner = library && library !== 'all' ? library : undefined
        if (scopedRunner && libraryAtStart.refreshingByRunner[scopedRunner])
          return

        if (scopedRunner) {
          set((prevState) => ({
            refreshingByRunner: {
              ...prevState.refreshingByRunner,
              [scopedRunner]: true
            }
          }))
        } else {
          set({
            refreshing: true,
            refreshingInTheBackground: runInBackground
          })
        }

        try {
          await window.api.refreshLibrary(library, origin)
          await get().refresh(library, checkForUpdates)
          // Quick 261029-quw item 2: every login triggers a refresh, so a login
          // that finished in the backend heals here at the latest.
          useAuthState.getState().resyncSignInIdentityFromStores()
          return
        } catch (error) {
          window.api.logError(`Library refresh failed: ${String(error)}`)
          // debug/steam-relogin-no-autorefresh: this method's own guard above
          // (`if (this.state.refreshing) return`) means a failure here — from
          // ANY store, not just the one that just errored — permanently wedges
          // every future refreshLibrary() call (including the automatic
          // post-login refresh AND the manual Refresh button in the Games
          // tier-2 panel's Header, which calls this exact method) until
          // something outside this
          // function happens to reset `refreshing`. Reset it here so a failed
          // refresh never blocks the next attempt.
          set({ refreshing: false })
          // debug/login-logout-wipes-library: mirror that same never-wedge
          // guarantee for the scoped path — a failed scoped refresh must clear
          // its OWN `refreshingByRunner` entry, or that one runner's future
          // scoped refreshes wedge forever behind the guard just above.
          if (scopedRunner) {
            set((prevState) => ({
              refreshingByRunner: {
                ...prevState.refreshingByRunner,
                [scopedRunner]: false
              }
            }))
          }
        }
      },

      steamMetadataSyncing: false,
      steamSyncStatus: 'idle',
      setSteamMetadataSyncing: (syncing) =>
        set({ steamMetadataSyncing: syncing }),
      setSteamSyncStatus: (status) => set({ steamSyncStatus: status }),

      resetRunnerLibrary: (runner) => {
        const key = (
          {
            legendary: 'epicLibrary',
            gog: 'gogLibrary',
            nile: 'amazonLibrary',
            steam: 'steamLibrary'
          } as Partial<
            Record<
              Runner,
              'epicLibrary' | 'gogLibrary' | 'amazonLibrary' | 'steamLibrary'
            >
          >
        )[runner]
        if (key) set({ [key]: [] })
      },
      setRefreshing: (value) => set({ refreshing: value }),

      epicLibrary: [],
      gogLibrary: [],
      amazonLibrary: [],
      steamLibrary: [],
      sideloadedLibrary: [],
      gameUpdates: [],
      refreshing: false,
      refreshingInTheBackground: true,
      refreshingByRunner: {},

      updateGameOverrides: (overrides) => {
        set({
          gameOverrides: overrides,
          epicLibrary: loadLegendaryLibrary(overrides),
          gogLibrary: loadGOGLibrary(overrides),
          amazonLibrary: loadAmazonLibrary(overrides),
          sideloadedLibrary: loadSideloadedLibrary(overrides)
        })
      },

      applyGamePush: (info) => {
        if (!info.app_name) return
        if (isStore(info, 'gog')) {
          set({ gogLibrary: upsertByAppName(get().gogLibrary, info) })
        } else if (isStore(info, 'legendary')) {
          set({ epicLibrary: upsertByAppName(get().epicLibrary, info) })
        } else if (isStore(info, 'steam')) {
          set({ steamLibrary: upsertByAppName(get().steamLibrary, info) })
        }
      },

      refresh: async (library, checkUpdates = false, overridesArg) => {
        console.log('refreshing')

        const {
          epicLibrary: startEpic,
          gogLibrary: startGog,
          amazonLibrary: startAmazon,
          gameUpdates
        } = get()
        const auth = useAuthState.getState()

        const overrides = overridesArg || currentOverrides()

        // `library` names the ONE runner this refresh is scoped to. `undefined`
        // (or 'all') means "no scope": touch everything.
        const scopedRunner = library && library !== 'all' ? library : undefined
        const includesEpic = !scopedRunner || isStore(scopedRunner, 'legendary')
        const includesGog = !scopedRunner || isStore(scopedRunner, 'gog')
        const includesAmazon = !scopedRunner || isStore(scopedRunner, 'nile')

        let updates = gameUpdates
        if (checkUpdates) {
          try {
            updates = await window.api.checkGameUpdates()
          } catch (error) {
            window.api.logError(`Game update check failed: ${String(error)}`)
          }
        }

        const currentLibraryLength = startEpic?.length

        // Each block asks only "is the CACHE empty, so we must fetch?". Testing
        // the length of the in-memory array too made a fresh login (which empties
        // it before refreshing) refetch data the cache already held (measured:
        // debug/resolved/gog-login-ui-never-updates.md, ~10s for nothing). A
        // genuinely empty cache still refetches. Each block is also gated on its
        // `includesX` flag: a runner-scoped call never re-reads the other
        // runners' caches, and a variable that was not recomputed defaults to
        // the UNCHANGED current value, never an empty placeholder.
        let epicLibrary = startEpic
        if (includesEpic) {
          epicLibrary = libraryStore.get('library', [])
          if (auth.epicUsername && !epicLibrary.length) {
            window.api.logInfo('No cache found, getting data from legendary...')
            const { library: legendaryLibrary } = await getLegendaryConfig()
            epicLibrary = legendaryLibrary
          }
        }

        let gogLibrary = startGog
        if (includesGog) {
          gogLibrary = loadGOGLibrary(overrides)
          if (auth.gogUsername && !gogLibrary.length) {
            window.api.logInfo('No cache found, getting data from gog...')
            await window.api.refreshLibrary('gog')
            gogLibrary = loadGOGLibrary(overrides)
          }
        }

        let amazonLibrary = startAmazon
        if (includesAmazon) {
          amazonLibrary = nileLibraryStore.get('library', [])
          if (auth.amazonUserId && !amazonLibrary.length) {
            window.api.logInfo('No cache found, getting data from nile...')
            await window.api.refreshLibrary('nile')
            amazonLibrary = loadAmazonLibrary(overrides)
          }
        }

        const updatedSideload = sideloadLibrary.get('games', [])

        // Functional form: two scoped refreshes can overlap, so the flag map is
        // read at commit time, not from a snapshot taken when this started.
        set((prev) => {
          const next: Partial<LibraryState> = {
            gameUpdates: updates,
            sideloadedLibrary: applyGameOverrides(updatedSideload, overrides)
          }

          if (includesEpic) {
            next.epicLibrary = applyGameOverrides(epicLibrary, overrides)
          }
          if (includesGog) {
            next.gogLibrary = gogLibrary
          }
          if (includesAmazon) {
            next.amazonLibrary = amazonLibrary
          }

          // A no-scope call clears the two GLOBAL flags; a single-runner call
          // clears ONLY that runner's own entry, so the merged-grid gate that
          // reads the global flags is unaffected by one platform finishing.
          if (!scopedRunner) {
            next.refreshing = false
            next.refreshingInTheBackground = true
          } else {
            next.refreshingByRunner = {
              ...prev.refreshingByRunner,
              [scopedRunner]: false
            }
          }

          return next
        })

        if (currentLibraryLength !== epicLibrary.length) {
          // The class forced a re-render here; the store's set() already
          // notified every subscriber and the bridge.
          window.api.logInfo('Force Update')
        }
      },

      hiddenGames: [],
      favouriteGames: [],
      customCategories: {},
      currentCustomCategories: [],

      setCurrentCustomCategories: (newCustomCategories) => {
        window.localStorage.setItem(
          'current_custom_categories',
          JSON.stringify(newCustomCategories)
        )
        set({ currentCustomCategories: newCustomCategories })
      },

      hideGame: (appNameToHide, appTitle) => {
        const newHiddenGames = [
          ...get().hiddenGames,
          { appName: appNameToHide, title: appTitle }
        ]
        set({ hiddenGames: newHiddenGames })
        configStore.set('games.hidden', newHiddenGames)
      },

      unhideGame: (appNameToUnhide) => {
        const newHiddenGames = get().hiddenGames.filter(
          ({ appName }) => appName !== appNameToUnhide
        )
        set({ hiddenGames: newHiddenGames })
        configStore.set('games.hidden', newHiddenGames)
      },

      addGameToFavourites: (appNameToAdd, appTitle) => {
        const newFavouriteGames = [
          ...get().favouriteGames.filter((fav) => fav.appName !== appNameToAdd),
          { appName: appNameToAdd, title: appTitle }
        ]
        set({ favouriteGames: newFavouriteGames })
        configStore.set('games.favourites', newFavouriteGames)
      },

      removeGameFromFavourites: (appNameToRemove) => {
        const newFavouriteGames = get().favouriteGames.filter(
          ({ appName }) => appName !== appNameToRemove
        )
        set({ favouriteGames: newFavouriteGames })
        configStore.set('games.favourites', newFavouriteGames)
      },

      getCustomCategories: () =>
        Array.from(new Set(Object.keys(get().customCategories))).sort(),

      getCurrentCustomCategories: () =>
        Array.from(new Set(get().currentCustomCategories)).sort(),

      // The three actions below mutate the existing customCategories object
      // before setting it, exactly as the class did (see
      // .planning/todos/pending/2026-11-10-custom-categories-mutated-in-place.md).
      setCustomCategory: (newCategory) => {
        const newCustomCategories = get().customCategories
        newCustomCategories[newCategory] = []

        // when adding a new category, if there are categories selected, select the new
        // one too so the game doesn't disappear form the library
        let newCurrentCustomCategories = get().currentCustomCategories
        if (get().currentCustomCategories.length > 0) {
          newCurrentCustomCategories = [
            ...newCurrentCustomCategories,
            newCategory
          ]
        }

        set({
          customCategories: newCustomCategories,
          currentCustomCategories: newCurrentCustomCategories
        })
        configStore.set('games.customCategories', newCustomCategories)
      },

      removeCustomCategory: (category) => {
        if (!get().customCategories[category]) return

        const newCustomCategories = get().customCategories
        delete newCustomCategories[category]
        set({ customCategories: { ...newCustomCategories } })

        const updatedCategories = get()
          .getCurrentCustomCategories()
          .filter((cat) => cat !== category)
        get().setCurrentCustomCategories(updatedCategories)
        const numberOfCategories = updatedCategories.length

        if (numberOfCategories < 1) {
          get().setCurrentCustomCategories(['preset_uncategorized'])
        }
        configStore.set('games.customCategories', newCustomCategories)
      },

      renameCustomCategory: (oldName, newName) => {
        const games = get().customCategories[oldName]
        if (!games) return

        const newCustomCategories = get().customCategories
        newCustomCategories[newName] = games
        delete newCustomCategories[oldName]

        set({ customCategories: { ...newCustomCategories } })
        configStore.set('games.customCategories', newCustomCategories)

        const newCurrentCustomCategories = get().currentCustomCategories.map(
          (cat) => (cat === oldName ? newName : cat)
        )
        get().setCurrentCustomCategories(newCurrentCustomCategories)
      },

      addGameToCustomCategory: (category, appName) => {
        const gamesInCategory = get().customCategories[category] || []
        gamesInCategory.push(appName)

        const newCustomCategories = {
          ...get().customCategories,
          [category]: gamesInCategory
        }

        set({ customCategories: newCustomCategories })
        configStore.set('games.customCategories', newCustomCategories)
      },

      removeGameFromCustomCategory: (category, appName) => {
        if (!get().customCategories[category]) return

        const newCustomCategories: Record<string, string[]> = {}
        for (const [key, games] of Object.entries(get().customCategories)) {
          if (key === category)
            newCustomCategories[key] = games.filter((game) => game !== appName)
          else newCustomCategories[key] = games
        }

        set({ customCategories: newCustomCategories })
        configStore.set('games.customCategories', newCustomCategories)
      },

      // Create-time read preserved (import-time timing, see
      // .planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md)
      gameOverrides: {},
      setGameOverrides: (gameOverrides) => set({ gameOverrides }),

      crossoverRatings: {},
      setCrossoverRatings: (crossoverRatings) => set({ crossoverRatings }),

      runsForMe: {},
      setRunsForMe: (runsForMe) => set({ runsForMe })
    })
  )
)

registerStoreForReset(useLibraryStateRaw)

/** True only while a legendary (Epic) game is in the 'installing' status. */
export const selectInstallingEpicGame = (
  state: Pick<LibraryState, 'libraryStatus'>
): boolean =>
  state.libraryStatus.some(
    (game) => game.status === 'installing' && isStore(game, 'legendary')
  )

/**
 * D-08: persists `gameUpdates` to localStorage 'updates' on every change. It
 * fires immediately to reproduce the class's componentDidUpdate write on its
 * first post-mount pass.
 */
export function registerLibrarySideEffects(): void {
  useLibraryStateRaw.subscribe(
    (state) => state.gameUpdates,
    (gameUpdates) => {
      window.localStorage.setItem('updates', JSON.stringify(gameUpdates))
    },
    { fireImmediately: true }
  )
}

const useLibraryState = bindStoreHooks(useLibraryStateRaw)
export default useLibraryState
