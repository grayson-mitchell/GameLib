import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import i18next from 'i18next'

import type { ExperimentalFeatures, FocusRowSelection } from 'common/types'
import { toShippedLanguage } from 'common/languages'
import { seedFocusRowFromMirror } from 'common/focusRowMigration'
import type { CustomTheme } from '../../common/types/customTheme'
import { configStore } from '../helpers/stores'
import { builtinSeed, isBuiltInThemeKey } from '../customThemes/builtinTokens'
import {
  DEFAULT_THEME_KEY,
  MAX_CUSTOM_THEMES,
  cleanTokens,
  customThemeKey,
  makeCopy,
  newCustomThemeId,
  nextCopyName,
  parseCustomThemes,
  resolveThemeKey,
  validateThemeName
} from '../customThemes/customTheme'
import { bindStoreHooks, registerStoreForReset } from './storeKit'

// Phase 69 D-01: settings/theme/appearance domain store (formerly the
// GlobalState class fields of the same names). Phase 64 adds its custom-theme
// state to this store (D-13). No persist middleware (D-02): every setter
// writes configStore / setSetting / localStorage itself, with the same keys
// and in the same order the class methods used.

const RTL_LANGUAGES = ['fa', 'ar']

// CR-01: the mirror alone cannot see the `focusRow` the backend now persists into
// `config.json` via the `settings/global` migration (the mirror never receives
// it), so first-launch hydration (boot module) fills the gap once. Read at CALL
// time, after hydrateStoreSnapshot(), never at module scope.
export function readFocusRowMirrorSeed(): ReturnType<
  typeof seedFocusRowFromMirror
> {
  return seedFocusRowFromMirror(configStore.get_nodefault('settings'))
}

// 48-02: handleFocusRow owns BOTH halves -- state and persistence. The flag
// stops first-launch hydration (CR-01, 48-07) from overwriting a pick the user
// makes while the backend answer is still in flight.
let focusRowPickedThisSession = false
let zoomTimer: NodeJS.Timeout | undefined = undefined

export function wasFocusRowPickedThisSession(): boolean {
  return focusRowPickedThisSession
}

export type DuplicateResult =
  | { ok: true; id: string }
  | { ok: false; reason: 'limit' | 'unknown-source' }

export interface SettingsState {
  language: string
  theme: string
  customThemes: CustomTheme[]
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
  /** Stores a frozen copy of a built-in or custom theme. Does not apply it (OD-6). */
  duplicateTheme: (
    sourceKey: string,
    copyName: (n: number | null) => string
  ) => DuplicateResult
  renameCustomTheme: (
    id: string,
    name: string
  ) => 'ok' | 'empty' | 'too-long' | 'taken' | 'not-found'
  deleteCustomTheme: (
    id: string
  ) => { ok: true; fellBackTo: string | null } | { ok: false }
  saveCustomThemeTokens: (
    id: string,
    tokens: Readonly<Record<string, string>>
  ) => Promise<'saved' | 'applied' | 'failed'>
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
  subscribeWithSelector((set, get) => ({
    language: 'en',
    theme: 'midnightMirage',
    customThemes: [],
    zoomPercent: 100,
    primaryFontFamily: '',
    secondaryFontFamily: '',
    allTilesInColor: false,
    titlesAlwaysVisible: false,
    hideTitles: false,
    cleanTiles: false,
    sidebarCollapsed: false,
    hideChangelogsOnStartup: false,
    lastChangelogShown: null,
    experimentalFeatures: { cometSupport: true },
    disableDialogBackdropClose: false,
    disableAnimations: false,
    focusRow: null,

    setLanguage: (newLanguage) => {
      set({ language: newLanguage })
      document.querySelector('html')?.setAttribute('lang', newLanguage)
    },

    setTheme: (newThemeName) => {
      configStore.set('theme', newThemeName)
      set({ theme: newThemeName })
      window.setTheme(newThemeName)
    },

    duplicateTheme: (sourceKey, copyName) => {
      const existing = get().customThemes
      if (existing.length >= MAX_CUSTOM_THEMES) {
        return { ok: false, reason: 'limit' }
      }
      const resolved = resolveThemeKey(sourceKey, existing)
      let source: { base: string; tokens: Readonly<Record<string, string>> }
      let sourceName: string
      if (resolved.kind === 'builtin') {
        const seed = builtinSeed(resolved.key)
        if (!seed) return { ok: false, reason: 'unknown-source' }
        source = { base: resolved.key, tokens: seed }
        sourceName = resolved.key
      } else if (resolved.kind === 'custom') {
        source = resolved.theme
        sourceName = resolved.theme.name
      } else {
        return { ok: false, reason: 'unknown-source' }
      }
      const id = newCustomThemeId(new Set(existing.map((t) => t.id)))
      const name = nextCopyName(
        sourceName,
        existing.map((t) => t.name),
        copyName
      )
      const next = [...existing, makeCopy(source, id, name)]
      configStore.set('customThemes', next)
      set({ customThemes: next })
      return { ok: true, id }
    },

    // Every custom-theme setter looks the id up in `customThemes` first, so a built-in key
    // or an unknown id is refused before anything is written (T-64-14).
    renameCustomTheme: (id, name) => {
      const existing = get().customThemes
      if (!existing.some((t) => t.id === id)) return 'not-found'
      const problem = validateThemeName(name, existing, id)
      if (problem) return problem
      const trimmed = name.trim()
      const next = existing.map((t) =>
        t.id === id ? { ...t, name: trimmed } : t
      )
      configStore.set('customThemes', next)
      set({ customThemes: next })
      return 'ok'
    },

    deleteCustomTheme: (id) => {
      const existing = get().customThemes
      const target = existing.find((t) => t.id === id)
      if (!target) return { ok: false }
      const next = existing.filter((t) => t.id !== id)
      configStore.set('customThemes', next)
      set({ customThemes: next })
      if (get().theme !== customThemeKey(id))
        return { ok: true, fellBackTo: null }
      const fellBackTo = isBuiltInThemeKey(target.base)
        ? target.base
        : DEFAULT_THEME_KEY
      get().setTheme(fellBackTo)
      return { ok: true, fellBackTo }
    },

    // D-05: reports the real persisted outcome. The renderer snapshot and state change only
    // after the sidecar confirmed the write.
    saveCustomThemeTokens: async (id, tokens) => {
      const existing = get().customThemes
      if (!existing.some((t) => t.id === id)) return 'failed'
      const cleaned = cleanTokens(tokens)
      if (cleaned === null) return 'failed'
      const next = existing.map((t) =>
        t.id === id ? { ...t, tokens: cleaned } : t
      )
      if (!(await configStore.setChecked('customThemes', next))) return 'failed'
      set({ customThemes: next })
      if (get().theme !== customThemeKey(id)) return 'saved'
      window.setTheme(get().theme)
      return 'applied'
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
  | 'customThemes'
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
  | 'hideChangelogsOnStartup'
  | 'experimentalFeatures'
  | 'focusRow'
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
  const globalSettings = configStore.get_nodefault('settings')
  return {
    // Converted back OUT of i18next (quick-260925-bq4): `i18n.language` is the
    // BCP-47 tag, but LanguageSelector indexes labels by the shipped code.
    ...(i18next.language
      ? { language: toShippedLanguage(i18next.language) }
      : {}),
    theme: configStore.get('theme', 'midnightMirage'),
    customThemes: parseCustomThemes(configStore.get('customThemes', [])),
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
    disableAnimations: configStore.get('disableAnimations', false),
    hideChangelogsOnStartup: globalSettings?.hideChangelogsOnStartup || false,
    experimentalFeatures: {
      cometSupport: true,
      ...(globalSettings?.experimentalFeatures || {})
    },
    focusRow: seedFocusRowFromMirror(globalSettings).focusRow
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
