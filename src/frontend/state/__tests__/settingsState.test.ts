import '../../testUtils/tauriWindow'
import i18next from 'i18next'
import { resetAllStores } from '../storeKit'
import useSettingsState, {
  applySavedFonts,
  focusRowMirrorSeed,
  readInitialSettings,
  registerSettingsSideEffects,
  selectIsRTL,
  wasFocusRowPickedThisSession
} from '../settingsState'

type Call = { fn: string; args: unknown[] }

const calls: Call[] = []
const config = new Map<string, unknown>()
const local = new Map<string, string>()
const cssProps = new Map<string, string>()
const bodyClasses = new Set<string>()
let htmlLang: string | undefined

const fakeApi = {
  storeNew: () => undefined,
  storeGet: (_name: string, key: string, dflt?: unknown) => {
    calls.push({ fn: 'storeGet', args: [key] })
    return config.has(key) ? config.get(key) : dflt
  },
  storeSet: (_name: string, key: string, value: unknown) => {
    calls.push({ fn: 'storeSet', args: [key, value] })
    config.set(key, value)
  },
  setSetting: (payload: unknown) => {
    calls.push({ fn: 'setSetting', args: [payload] })
  },
  setZoomFactor: (factor: string) => {
    calls.push({ fn: 'setZoomFactor', args: [factor] })
  }
}

const storeSets = () =>
  calls.filter((c) => c.fn === 'storeSet').map((c) => c.args[0])

describe('settingsState store', () => {
  beforeEach(() => {
    // importing the stores pulls tauriAttach, which can overwrite window.api
    const w = window as unknown as Record<string, unknown>
    w.api = fakeApi
    w.setTheme = (name: string) => calls.push({ fn: 'setTheme', args: [name] })
    w.localStorage = {
      getItem: (k: string) => local.get(k) ?? null,
      setItem: (k: string, v: string) => {
        local.set(k, v)
      }
    }
    const g = globalThis as unknown as Record<string, unknown>
    g.document = {
      querySelector: () => ({
        setAttribute: (_k: string, v: string) => {
          htmlLang = v
        }
      }),
      documentElement: {
        style: {
          setProperty: (k: string, v: string) => {
            cssProps.set(k, v)
          }
        }
      },
      body: {
        classList: {
          toggle: (c: string, on: boolean) => {
            if (on) bodyClasses.add(c)
            else bodyClasses.delete(c)
          }
        }
      }
    }
    g.getComputedStyle = () => ({
      getPropertyValue: (k: string) => `default:${k}`
    })
    calls.length = 0
    config.clear()
    local.clear()
    cssProps.clear()
    bodyClasses.clear()
    htmlLang = undefined
  })

  afterEach(() => {
    jest.useRealTimers()
    resetAllStores()
  })

  it('has safe defaults and the import-time focusRow seed', () => {
    const s = useSettingsState.getState()
    expect(s.language).toBe('en')
    expect(s.theme).toBe('midnightMirage')
    expect(s.zoomPercent).toBe(100)
    expect(s.experimentalFeatures.cometSupport).toBe(true)
    expect(s.focusRow).toEqual(focusRowMirrorSeed.focusRow)
  })

  it.each([
    ['setAllTilesInColor', 'allTilesInColor', 'allTilesInColor'],
    ['setTitlesAlwaysVisible', 'titlesAlwaysVisible', 'titlesAlwaysVisible'],
    ['setHideTitles', 'hideTitles', 'hideTitles'],
    ['setCleanTiles', 'cleanTiles', 'cleanTiles'],
    [
      'setDisableDialogBackdropClose',
      'disableDialogBackdropClose',
      'disableDialogBackdropClose'
    ],
    ['setDisableAnimations', 'disableAnimations', 'disableAnimations']
  ] as const)('%s writes configStore %s then state', (setter, key, field) => {
    useSettingsState.getState()[setter](true)
    expect(calls[0]).toEqual({ fn: 'storeSet', args: [key, true] })
    expect(useSettingsState.getState()[field]).toBe(true)
    // anti-vacuity: nothing was written under any other key
    expect(storeSets()).toEqual([key])
  })

  it('setTheme writes config, then state, then window.setTheme, in that order', () => {
    useSettingsState.getState().setTheme('dracula')
    expect(calls.map((c) => c.fn)).toEqual(['storeSet', 'setTheme'])
    expect(calls[0]?.args).toEqual(['theme', 'dracula'])
    expect(useSettingsState.getState().theme).toBe('dracula')
    expect(storeSets()).not.toContain('Theme')
  })

  it('setLanguage updates state and the html lang attribute without config', () => {
    useSettingsState.getState().setLanguage('fr')
    expect(useSettingsState.getState().language).toBe('fr')
    expect(htmlLang).toBe('fr')
    expect(storeSets()).toEqual([])
  })

  it('setZoomPercent persists immediately and debounces setZoomFactor by 500 ms', () => {
    jest.useFakeTimers()
    const s = useSettingsState.getState()
    s.setZoomPercent(120)
    s.setZoomPercent(150)
    expect(storeSets()).toEqual(['zoomPercent', 'zoomPercent'])
    expect(useSettingsState.getState().zoomPercent).toBe(150)
    expect(calls.filter((c) => c.fn === 'setZoomFactor')).toHaveLength(0)
    jest.advanceTimersByTime(499)
    expect(calls.filter((c) => c.fn === 'setZoomFactor')).toHaveLength(0)
    jest.advanceTimersByTime(1)
    expect(calls.filter((c) => c.fn === 'setZoomFactor')).toEqual([
      { fn: 'setZoomFactor', args: ['1.5'] }
    ])
  })

  it('font setters write the CSS property; saveToFile=false skips configStore', () => {
    const s = useSettingsState.getState()
    s.setPrimaryFontFamily('Fira', false)
    expect(cssProps.get('--primary-font-family')).toBe('Fira')
    expect(storeSets()).toEqual([])
    s.setPrimaryFontFamily('Fira')
    s.setSecondaryFontFamily('Lato')
    expect(storeSets()).toEqual(['actionsFontFamily', 'contentFontFamily'])
    expect(cssProps.get('--secondary-font-family')).toBe('Lato')
  })

  it('applySavedFonts re-applies the stored fonts without writing config', () => {
    useSettingsState.setState({
      primaryFontFamily: 'P',
      secondaryFontFamily: 'S'
    })
    applySavedFonts()
    expect(cssProps.get('--primary-font-family')).toBe('P')
    expect(cssProps.get('--secondary-font-family')).toBe('S')
    expect(storeSets()).toEqual([])
  })

  it('handleFocusRow sets state, marks the session pick and writes setSetting', () => {
    const before = wasFocusRowPickedThisSession()
    useSettingsState.getState().handleFocusRow('recent' as never)
    expect(useSettingsState.getState().focusRow).toBe('recent')
    expect(wasFocusRowPickedThisSession()).toBe(true)
    expect(before).toBe(false)
    expect(calls).toContainEqual({
      fn: 'setSetting',
      args: [{ appName: 'default', key: 'focusRow', value: 'recent' }]
    })
  })

  it('plain setters only touch state', () => {
    const s = useSettingsState.getState()
    s.setSideBarCollapsed(true)
    s.setHideChangelogsOnStartup(true)
    s.setLastChangelogShown('1.2.3')
    s.handleExperimentalFeatures({ cometSupport: false })
    const after = useSettingsState.getState()
    expect(after.sidebarCollapsed).toBe(true)
    expect(after.hideChangelogsOnStartup).toBe(true)
    expect(after.lastChangelogShown).toBe('1.2.3')
    expect(after.experimentalFeatures).toEqual({ cometSupport: false })
    expect(calls).toEqual([])
  })

  it('readInitialSettings reads at call time', () => {
    config.set('theme', 'late')
    config.set('zoomPercent', 130)
    config.set('hideTitles', true)
    local.set('sidebar_collapsed', 'true')
    local.set('last_changelog', '"9.9"')
    i18next.language = 'nb_NO'
    const first = readInitialSettings()
    expect(first.theme).toBe('late')
    expect(first.zoomPercent).toBe(130)
    expect(first.hideTitles).toBe(true)
    expect(first.sidebarCollapsed).toBe(true)
    expect(first.lastChangelogShown).toBe('9.9')
    expect(first.primaryFontFamily).toBe(
      'default:--default-primary-font-family'
    )
    expect(first.secondaryFontFamily).toBe(
      'default:--default-secondary-font-family'
    )
    config.set('theme', 'later')
    expect(readInitialSettings().theme).toBe('later')
    config.set('actionsFontFamily', 'Mono')
    expect(readInitialSettings().primaryFontFamily).toBe('Mono')
  })

  it('selectIsRTL is true for fa and ar only', () => {
    expect(selectIsRTL({ language: 'fa' })).toBe(true)
    expect(selectIsRTL({ language: 'ar' })).toBe(true)
    expect(selectIsRTL({ language: 'en' })).toBe(false)
    expect(selectIsRTL({ language: 'arx' })).toBe(false)
  })

  describe('registerSettingsSideEffects', () => {
    it('runs once immediately, then on change of each own field only', () => {
      registerSettingsSideEffects()
      expect(local.get('sidebar_collapsed')).toBe('false')
      expect(local.get('hide_changelogs')).toBe('false')
      expect(local.get('last_changelog')).toBe('null')
      expect(bodyClasses.has('isRTL')).toBe(false)

      useSettingsState.getState().setSideBarCollapsed(true)
      expect(local.get('sidebar_collapsed')).toBe('true')
      useSettingsState.getState().setHideChangelogsOnStartup(true)
      expect(local.get('hide_changelogs')).toBe('true')
      useSettingsState.getState().setLastChangelogShown('2.0')
      expect(local.get('last_changelog')).toBe('"2.0"')

      // an unrelated field does not rewrite the keys
      local.set('sidebar_collapsed', 'sentinel')
      useSettingsState.getState().setHideTitles(true)
      expect(local.get('sidebar_collapsed')).toBe('sentinel')
    })

    it('toggles the isRTL body class from language', () => {
      registerSettingsSideEffects()
      useSettingsState.getState().setLanguage('ar')
      expect(bodyClasses.has('isRTL')).toBe(true)
      useSettingsState.getState().setLanguage('en')
      expect(bodyClasses.has('isRTL')).toBe(false)
    })
  })
})
