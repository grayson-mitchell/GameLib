import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import i18next from 'i18next'

import type { ExperimentalFeatures, FocusRowSelection } from 'common/types'
import { toShippedLanguage } from 'common/languages'
import { seedFocusRowFromMirror } from 'common/focusRowMigration'
import { configStore } from '../helpers/stores'
import { bindStoreHooks, registerStoreForReset } from './storeKit'

// Phase 69 D-01: settings/theme/appearance domain store (formerly the
// GlobalState class fields of the same names). Phase 64 adds its custom-theme
// state to this store (D-13). No persist middleware (D-02): every setter
// writes configStore / setSetting / localStorage itself, with the same keys
// and in the same order the class methods used.

const RTL_LANGUAGES = ['fa', 'ar']

// R5: read at import time exactly as the old GlobalState class did (import-time timing
// preserved, see
// .planning/todos/pending/2026-11-10-import-time-mirror-reads-before-hydration.md).
export const globalSettingsAtImport = configStore.get_nodefault('settings')
// CR-01: the mirror alone cannot see the `focusRow` the backend now persists into
// `config.json` via the `settings/global` migration (the mirror never receives
// it), so first-launch hydration (boot module) fills the gap once.
export const focusRowMirrorSeed = seedFocusRowFromMirror(globalSettingsAtImport)

// 48-02: handleFocusRow owns BOTH halves -- state and persistence. The flag
// stops first-launch hydration (CR-01, 48-07) from overwriting a pick the user
// makes while the backend answer is still in flight.
let focusRowPickedThisSession = false
let zoomTimer: NodeJS.Timeout | undefined = undefined

export function wasFocusRowPickedThisSession(): boolean {
  return focusRowPickedThisSession
}

export interface SettingsState {
  language: string
  theme: string
  zoomPercent: number
  primaryFontFamily: string
  secondaryFontFamily: string
  allTilesInColor: boolean
  titlesAlwaysVisible: boolean
  hideTitles: boolean
  cleanTiles: boolean
  sidebarCollapsed: boolean
  hideChangelogsOnStartup: boolean
  lastChangelogShown: string | null
  experimentalFeatures: ExperimentalFeatures
  disableDialogBackdropClose: boolean
  disableAnimations: boolean
  focusRow: FocusRowSelection

  setLanguage: (newLanguage: string) => void
  setTheme: (newThemeName: string) => void
  setZoomPercent: (newZoomPercent: number) => void
  setPrimaryFontFamily: (newFontFamily: string, saveToFile?: boolean) => void
  setSecondaryFontFamily: (newFontFamily: string, saveToFile?: boolean) => void
  setAllTilesInColor: (value: boolean) => void
  setTitlesAlwaysVisible: (value: boolean) => void
  setHideTitles: (value: boolean) => void
  setCleanTiles: (value: boolean) => void
  setDisableDialogBackdropClose: (value: boolean) => void
  setDisableAnimations: (value: boolean) => void
  setSideBarCollapsed: (value: boolean) => void
  setHideChangelogsOnStartup: (value: boolean) => void
  setLastChangelogShown: (value: string) => void
  handleExperimentalFeatures: (value: ExperimentalFeatures) => void
  handleFocusRow: (value: FocusRowSelection) => void
}

const useSettingsStateRaw = create<SettingsState>()(
  subscribeWithSelector((set) => ({
    language: 'en',
    theme: 'midnightMirage',
    zoomPercent: 100,
    primaryFontFamily: '',
    secondaryFontFamily: '',
    allTilesInColor: false,
    titlesAlwaysVisible: false,
    hideTitles: false,
    cleanTiles: false,
    sidebarCollapsed: false,
    hideChangelogsOnStartup:
      globalSettingsAtImport?.hideChangelogsOnStartup || false,
    lastChangelogShown: null,
    experimentalFeatures: {
      cometSupport: true,
      ...(globalSettingsAtImport?.experimentalFeatures || {})
    },
    disableDialogBackdropClose: false,
    disableAnimations: false,
    focusRow: focusRowMirrorSeed.focusRow,

    setLanguage: (newLanguage) => {
      set({ language: newLanguage })
      document.querySelector('html')?.setAttribute('lang', newLanguage)
    },

    setTheme: (newThemeName) => {
      configStore.set('theme', newThemeName)
      set({ theme: newThemeName })
      window.setTheme(newThemeName)
    },

    setZoomPercent: (newZoomPercent) => {
      if (zoomTimer) clearTimeout(zoomTimer)

      configStore.set('zoomPercent', newZoomPercent)
      set({ zoomPercent: newZoomPercent })

      zoomTimer = setTimeout(() => {
        window.api.setZoomFactor((newZoomPercent / 100).toString())
      }, 500)
    },

    setPrimaryFontFamily: (newFontFamily, saveToFile = true) => {
      if (saveToFile) configStore.set('actionsFontFamily', newFontFamily)
      document.documentElement.style.setProperty(
        '--primary-font-family',
        newFontFamily
      )
    },

    setSecondaryFontFamily: (newFontFamily, saveToFile = true) => {
      if (saveToFile) configStore.set('contentFontFamily', newFontFamily)
      document.documentElement.style.setProperty(
        '--secondary-font-family',
        newFontFamily
      )
    },

    setAllTilesInColor: (value) => {
      configStore.set('allTilesInColor', value)
      set({ allTilesInColor: value })
    },

    setTitlesAlwaysVisible: (value) => {
      configStore.set('titlesAlwaysVisible', value)
      set({ titlesAlwaysVisible: value })
    },

    setHideTitles: (value) => {
      configStore.set('hideTitles', value)
      set({ hideTitles: value })
    },

    setCleanTiles: (value) => {
      configStore.set('cleanTiles', value)
      set({ cleanTiles: value })
    },

    setDisableDialogBackdropClose: (value) => {
      configStore.set('disableDialogBackdropClose', value)
      set({ disableDialogBackdropClose: value })
    },

    setDisableAnimations: (value) => {
      configStore.set('disableAnimations', value)
      set({ disableAnimations: value })
    },

    setSideBarCollapsed: (value) => set({ sidebarCollapsed: value }),
    setHideChangelogsOnStartup: (value) =>
      set({ hideChangelogsOnStartup: value }),
    setLastChangelogShown: (value) => set({ lastChangelogShown: value }),
    handleExperimentalFeatures: (value) => set({ experimentalFeatures: value }),

    handleFocusRow: (value) => {
      focusRowPickedThisSession = true
      set({ focusRow: value })
      window.api.setSetting({ appName: 'default', key: 'focusRow', value })
    }
  }))
)

type InitialSettings = Pick<
  SettingsState,
  | 'theme'
  | 'zoomPercent'
  | 'primaryFontFamily'
  | 'secondaryFontFamily'
  | 'allTilesInColor'
  | 'titlesAlwaysVisible'
  | 'hideTitles'
  | 'cleanTiles'
  | 'sidebarCollapsed'
  | 'lastChangelogShown'
  | 'disableDialogBackdropClose'
  | 'disableAnimations'
> & {
  /**
   * Absent while i18next has not resolved a language yet (its `init` defers the
   * load by a tick with the http backend); the store's default stays in place
   * and `followBootLanguage` fills it in once i18next is ready.
   */
  language?: string
}

/**
 * The values the GlobalState constructor read after hydration. Applied by
 * initStateSubscriptions section (1); read at CALL time, never at module scope.
 */
export function readInitialSettings(): InitialSettings {
  const root = () => getComputedStyle(document.documentElement)
  return {
    // Converted back OUT of i18next (quick-260925-bq4): `i18n.language` is the
    // BCP-47 tag, but LanguageSelector indexes labels by the shipped code.
    ...(i18next.language
      ? { language: toShippedLanguage(i18next.language) }
      : {}),
    theme: configStore.get('theme', 'midnightMirage'),
    zoomPercent: configStore.get('zoomPercent', 100),
    secondaryFontFamily:
      configStore.get_nodefault('contentFontFamily') ||
      root().getPropertyValue('--default-secondary-font-family'),
    primaryFontFamily:
      configStore.get_nodefault('actionsFontFamily') ||
      root().getPropertyValue('--default-primary-font-family'),
    allTilesInColor: configStore.get('allTilesInColor', false),
    titlesAlwaysVisible: configStore.get('titlesAlwaysVisible', false),
    hideTitles: configStore.get('hideTitles', false),
    cleanTiles: configStore.get('cleanTiles', false),
    sidebarCollapsed: JSON.parse(
      window.localStorage.getItem('sidebar_collapsed') || 'false'
    ) as boolean,
    lastChangelogShown: JSON.parse(
      window.localStorage.getItem('last_changelog') || 'null'
    ) as string | null,
    disableDialogBackdropClose: configStore.get(
      'disableDialogBackdropClose',
      false
    ),
    disableAnimations: configStore.get('disableAnimations', false)
  }
}

/** isRTL is derived from language, never stored. */
export function selectIsRTL(state: Pick<SettingsState, 'language'>): boolean {
  return RTL_LANGUAGES.includes(state.language)
}

/**
 * Re-applies the persisted fonts as CSS custom properties without writing
 * config (the componentDidMount tail did this just before frontendReady).
 */
export function applySavedFonts(): void {
  const { primaryFontFamily, secondaryFontFamily } =
    useSettingsStateRaw.getState()
  const { setPrimaryFontFamily, setSecondaryFontFamily } =
    useSettingsStateRaw.getState()
  setPrimaryFontFamily(primaryFontFamily, false)
  setSecondaryFontFamily(secondaryFontFamily, false)
}

/**
 * D-08: the componentDidUpdate writes, keyed on their own fields. Each runs
 * once immediately (componentDidUpdate's first post-mount pass), then on
 * change only. Lasts for the life of the app (D-07).
 */
export function registerSettingsSideEffects(): void {
  useSettingsStateRaw.subscribe(
    (s) => selectIsRTL(s),
    (isRTL) => document.body.classList.toggle('isRTL', isRTL),
    { fireImmediately: true }
  )
  useSettingsStateRaw.subscribe(
    (s) => s.sidebarCollapsed,
    (value) =>
      window.localStorage.setItem('sidebar_collapsed', JSON.stringify(value)),
    { fireImmediately: true }
  )
  useSettingsStateRaw.subscribe(
    (s) => s.hideChangelogsOnStartup,
    (value) =>
      window.localStorage.setItem('hide_changelogs', JSON.stringify(value)),
    { fireImmediately: true }
  )
  useSettingsStateRaw.subscribe(
    (s) => s.lastChangelogShown,
    (value) =>
      window.localStorage.setItem('last_changelog', JSON.stringify(value)),
    { fireImmediately: true }
  )
}

registerStoreForReset(useSettingsStateRaw)

export default bindStoreHooks(useSettingsStateRaw)
