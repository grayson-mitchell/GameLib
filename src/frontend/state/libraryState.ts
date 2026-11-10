import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

import type {
  FavouriteGame,
  GameInfo,
  HiddenGame,
  RefreshOptions,
  Runner
} from 'common/types'
import type { RunsForMeState } from 'common/runsForMe'
import { configStore, gameOverridesStore } from 'frontend/helpers/stores'
import { bindStoreHooks, registerStoreForReset } from './storeKit'

// Phase 69 D-09 reverse bridge: library domain store skeleton. authState (D-10
// puts auth before library) reaches the library through these action slots.
// Until the library wave the GlobalState class installs the implementations via
// installLibraryBridgeSlots; 69-16..69-19 add the library fields, replace each
// slot with the real implementation and delete the class install.

// GAP CYCLE 4 (34.5-33): `origin` identifies which call site triggered a
// refresh. Kept local rather than added to the shared RefreshOptions.
export type RefreshLibraryOptions = RefreshOptions & { origin?: string }

interface LibraryBridgeSlots {
  refreshLibrary: (options: RefreshLibraryOptions) => Promise<void>
  resetRunnerLibrary: (runner: Runner) => void
  setRefreshing: (value: boolean) => void
}

type GameOverride = NonNullable<GameInfo['overrides']>

export interface LibraryState extends LibraryBridgeSlots {
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

/** Re-reads the persisted collections at boot (R5). */
export function readInitialLibrary(): Pick<
  LibraryState,
  | 'hiddenGames'
  | 'favouriteGames'
  | 'customCategories'
  | 'currentCustomCategories'
> {
  return {
    hiddenGames: configStore.get('games.hidden', []),
    favouriteGames: configStore.get('games.favourites', []),
    customCategories: configStore.get('games.customCategories', {}),
    currentCustomCategories: loadCurrentCategories()
  }
}

const notInstalled = (name: string) => {
  window.api.logError(
    `library slot ${name} called before GlobalState installed it`
  )
}

const useLibraryStateRaw = create<LibraryState>()(
  subscribeWithSelector(
    (set, get): LibraryState => ({
      refreshLibrary: async () => notInstalled('refreshLibrary'),
      resetRunnerLibrary: () => notInstalled('resetRunnerLibrary'),
      setRefreshing: () => notInstalled('setRefreshing'),

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
      gameOverrides: gameOverridesStore.get('overrides', {}),
      setGameOverrides: (gameOverrides) => set({ gameOverrides }),

      crossoverRatings: {},
      setCrossoverRatings: (crossoverRatings) => set({ crossoverRatings }),

      runsForMe: {},
      setRunsForMe: (runsForMe) => set({ runsForMe })
    })
  )
)

registerStoreForReset(useLibraryStateRaw)

/** Installs the class-owned implementations; called once from GlobalState. */
export function installLibraryBridgeSlots(impl: LibraryBridgeSlots): void {
  useLibraryStateRaw.setState({
    refreshLibrary: impl.refreshLibrary,
    resetRunnerLibrary: impl.resetRunnerLibrary,
    setRefreshing: impl.setRefreshing
  })
}

const useLibraryState = bindStoreHooks(useLibraryStateRaw)
export default useLibraryState
