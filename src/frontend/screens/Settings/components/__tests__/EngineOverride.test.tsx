import type { ReactElement } from 'react'
import 'frontend/testUtils/tauriWindow'
import type { EngineOption } from 'common/types/engine'
import { at } from '../../../__tests__/fixtures/indexed'

// No DOM renderer in this project: drive the component function directly with
// hooks stubbed (effects run synchronously, state is a fixed pair).
let mockStore: Record<string, unknown> = {}
let mockContext: Record<string, unknown> = {
  appName: 'default',
  runner: 'steam'
}
let mockStates: unknown[] = []
let stateIdx = 0
interface MockDialog {
  title: string
  message: string
  buttons: { text: string; onClick?: () => void }[]
}
const mockShowDialog = jest.fn<void, [MockDialog]>()
const mockSetSetting = jest.fn()
const mockSet = jest.fn()
jest.mock('react', () =>
  jest
    .requireActual<
      typeof import('frontend/testUtils/storeHookReact')
    >('frontend/testUtils/storeHookReact')
    .withStoreHooks(jest.requireActual('react'), {
      useContext: () => mockContext,
      useState: (init: unknown) => [
        stateIdx < mockStates.length
          ? mockStates[stateIdx++]
          : (stateIdx++, init),
        jest.fn()
      ],
      useEffect: (fn: () => void) => {
        fn()
      }
    } as unknown as Partial<typeof import('react')>)
)
jest.mock('frontend/state/EngineState', () => ({
  engineStateKey: (r: string, a: string) => `${r}:${a}`,
  useEngineState: Object.assign(
    (sel: (s: { byGame: Record<string, unknown> }) => unknown) =>
      sel({ byGame: mockStore }),
    { getState: () => ({ set: mockSet }) }
  )
}))
jest.mock('frontend/screens/Settings/SettingsContext', () => ({
  __esModule: true,
  default: {}
}))
let mockStored: Record<string, string> = {}
jest.mock('frontend/hooks/useSetting', () => ({
  __esModule: true,
  default: (key: string, fb: string) => [
    mockStored[key] ?? fb,
    (v: string) => {
      mockSetSetting(key, v)
    }
  ]
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: mockGamelibT
  })
}))
// CSS-importing UI components cannot load under this jest config; the test
// inspects the element tree, so inert stand-ins are enough.
jest.mock('frontend/components/UI/SelectField', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/components/UI/InfoIcon', () => ({
  __esModule: true,
  default: () => null
}))

import useUiState from 'frontend/state/uiState'
import { resetAllStores } from 'frontend/state/storeKit'
import EngineOverride, {
  EngineOverrideView,
  optionLabel
} from '../EngineOverride'
import {
  gamelibT,
  gamelibT as mockGamelibT
} from '../../../Game/GamePage/components/__tests__/gamelibT'
const opts: EngineOption[] = [
  {
    id: 'automatic',
    kind: 'automatic',
    label: 'Automatic',
    available: true,
    installed: true,
    isPreviousPin: false
  },
  {
    id: 'crossover',
    kind: 'crossover',
    label: 'CrossOver',
    available: false,
    installed: false,
    isPreviousPin: false
  },
  {
    id: 'pinned:wine-staging-11.20',
    kind: 'pinned',
    label: 'Wine Staging 11.20',
    available: true,
    installed: true,
    isPreviousPin: false
  },
  {
    id: 'pinned:wine-staging-11.10',
    kind: 'pinned',
    label: 'Wine Staging 11.10',
    available: true,
    installed: false,
    isPreviousPin: true
  }
]

type El = ReactElement<Record<string, unknown>>
const render = (stored: string | undefined, over = {}) =>
  EngineOverrideView({
    options: opts,
    value: stored || 'automatic',
    loaded: true,
    onChange: jest.fn(),
    t: gamelibT,
    ...over
  }) as El

const select = (el: El) =>
  (el.props.children as El[]).find((c) => c.props.htmlId) as El

describe('EngineOverride', () => {
  it('is a collapsed details with the Engine (advanced) summary', () => {
    const el = render('automatic')
    expect(el.type).toBe('details')
    expect(el.props.open).toBeUndefined()
    const summary = at(el.props.children as El[], 0)
    expect(summary.props.children).toBe('Engine (advanced)')
  })

  it('labels options and disables unavailable ones', () => {
    expect(optionLabel(at(opts, 0), gamelibT)).toBe(
      'Automatic (CrossOver, then built-in)'
    )
    expect(optionLabel(at(opts, 2), gamelibT)).toBe('Wine Staging 11.20')
    expect(optionLabel(at(opts, 3), gamelibT)).toBe(
      'Wine Staging 11.10 (previous build) (downloads on first launch)'
    )
    const items = select(render('automatic')).props.children as El[]
    expect(items).toHaveLength(4)
    expect(items.every((i) => i)).toBe(true)
    expect(at(items, 1).props.disabled).toBe(true)
  })

  it('shows no warning for automatic or unset', () => {
    expect(select(render('automatic')).props.afterSelect).toBeUndefined()
    expect(select(render(undefined)).props.afterSelect).toBeUndefined()
  })

  it('warns and passes the id through for a non-automatic choice', () => {
    const onChange = jest.fn()
    const sel = select(render('pinned:wine-staging-11.20', { onChange }))
    const warn = sel.props.afterSelect as El
    expect(warn.props.children).toBe(
      "Unsupported — known fixes and compatibility ratings don't apply"
    )
    ;(sel.props.onChange as (e: unknown) => void)({
      target: { value: 'pinned:wine-staging-11.20' }
    })
    expect(onChange).toHaveBeenCalledWith('pinned:wine-staging-11.20')
  })

  it('does not flag CrossOver as unsupported (G9)', () => {
    expect(select(render('crossover')).props.afterSelect).toBeUndefined()
  })

  it('warns for a wine-manager choice', () => {
    expect(select(render('wine-manager:X')).props.afterSelect).toBeTruthy()
  })

  it('keeps an uninstalled wine-manager value selected as a disabled entry (WR-05)', () => {
    const onChange = jest.fn()
    const sel = select(render('wine-manager:9.0-gone', { onChange }))
    expect(sel.props.value).toBe('wine-manager:9.0-gone')
    const items = sel.props.children as El[]
    expect(items).toHaveLength(5)
    expect(at(items, 4).props.disabled).toBe(true)
    expect(at(items, 4).props.children).toBe(
      'Wine Manager: 9.0-gone (not installed)'
    )
    expect(sel.props.afterSelect).toBeTruthy()
    ;(sel.props.onChange as (e: unknown) => void)({
      target: { value: 'automatic' }
    })
    expect(onChange).toHaveBeenCalledWith('automatic')
  })

  it('labels an uninstalled pinned value by its id', () => {
    const items = select(render('pinned:old-pin')).props.children as El[]
    expect(at(items, 4).props.children).toBe('old-pin (not installed)')
    expect(at(items, 4).props.disabled).toBe(true)
  })

  it('is disabled and shows the stored value until options load (G12b)', () => {
    const sel = select(
      render('pinned:wine-staging-11.20', {
        loaded: false,
        options: []
      })
    )
    expect(sel.props.disabled).toBe(true)
    expect(sel.props.value).toBe('pinned:wine-staging-11.20')
    expect(sel.props.children as El[]).toHaveLength(1)
  })

  it('puts the help icon on the label line', () => {
    const sel = select(render('automatic'))
    expect(sel.props.labelHelp).toBeTruthy()
    expect(sel.props.label).toBe('Engine')
  })
})

describe('EngineOverride eligibility gate (WR-04)', () => {
  const api = {
    getEngineState: jest.fn(),
    listEngineOptions: jest.fn()
  }
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global as unknown as { window: unknown }).window = { api }
    api.listEngineOptions.mockResolvedValue(opts)
    api.getEngineState.mockResolvedValue(null)
    mockStore = {}
  })

  it('renders the section when overrideEligible is true and loads options once on mount', () => {
    mockStore = { 'steam:default': { overrideEligible: true } }
    const el = EngineOverride() as El | null
    expect(el).not.toBeNull()
    expect(api.listEngineOptions).toHaveBeenCalledTimes(1)
    expect(api.getEngineState).not.toHaveBeenCalled()
  })

  it.each([false, undefined])(
    'renders nothing when overrideEligible is %p',
    (v) => {
      mockStore = { 'steam:default': { overrideEligible: v } }
      expect(EngineOverride()).toBeNull()
      expect(api.listEngineOptions).not.toHaveBeenCalled()
    }
  )

  it('fetches state once when absent; null result is not stored and renders nothing', async () => {
    expect(EngineOverride()).toBeNull()
    expect(api.getEngineState).toHaveBeenCalledTimes(1)
    expect(api.getEngineState).toHaveBeenCalledWith({
      runner: 'steam',
      appName: 'default'
    })
    await Promise.resolve()
    expect(mockSet).not.toHaveBeenCalled()
  })

  it('stores a non-null fetched state', async () => {
    const result = { appId: 'default', overrideEligible: true }
    api.getEngineState.mockResolvedValue(result)
    EngineOverride()
    await Promise.resolve()
    await Promise.resolve()
    expect(mockSet).toHaveBeenCalledWith(result)
  })
})

const legacyOpt: EngineOption = {
  id: 'legacy:Wine GPTK',
  kind: 'legacy',
  label: 'Legacy: Wine GPTK',
  available: false,
  installed: true,
  isPreviousPin: false
}
const warning =
  "Unsupported — known fixes and compatibility ratings don't apply"

function mountControl(opts2: {
  context: Record<string, unknown>
  stored?: Record<string, string>
  state?: Record<string, unknown>
  states?: unknown[]
}) {
  const { showDialogModal, ...settingsContext } = opts2.context
  mockContext = settingsContext
  useUiState.setState({
    showDialogModal: (showDialogModal as () => void | undefined) ?? jest.fn()
  })
  mockStored = opts2.stored ?? {}
  mockStore = opts2.state ?? {}
  mockStates = opts2.states ?? []
  stateIdx = 0
  const el = EngineOverride() as El
  stateIdx = 0
  return el
}

describe('EngineOverride derived value, Legacy, D-04 and the global variant', () => {
  const api = {
    getEngineState: jest.fn(),
    listEngineOptions: jest.fn(),
    getDefaultEngine: jest.fn()
  }
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global as unknown as { window: unknown }).window = { api }
    api.listEngineOptions.mockResolvedValue(opts)
    api.getEngineState.mockResolvedValue(null)
    api.getDefaultEngine.mockResolvedValue({
      effectiveEngineId: 'automatic',
      engineSource: 'derived',
      legacyLabel: null
    })
  })
  afterEach(() => {
    resetAllStores()
    mockStates = []
    mockStored = {}
    mockContext = { appName: 'default', runner: 'steam' }
  })

  it('a game with no stored engine shows its derived engine (D-08)', () => {
    const el = mountControl({
      context: { appName: 'g1', runner: 'gog' },
      state: {
        'gog:g1': { overrideEligible: true, effectiveEngineId: 'crossover' }
      }
    })
    expect(el.props.value).toBe('crossover')
    expect(mockSetSetting).not.toHaveBeenCalled()
  })

  it('a legacy game shows the disabled Legacy entry and the Unsupported text, same for gog and steam (D-14, D-15)', () => {
    for (const runner of ['gog', 'steam']) {
      const el = mountControl({
        context: { appName: 'g1', runner },
        state: {
          [`${runner}:g1`]: {
            overrideEligible: true,
            effectiveEngineId: 'legacy:Wine GPTK'
          }
        },
        states: [[...opts, legacyOpt], true, undefined]
      })
      const view = EngineOverrideView(el.props as never) as El
      const sel = select(view)
      const items = sel.props.children as El[]
      const legacy = items.find(
        (i) => i.props.value === 'legacy:Wine GPTK'
      ) as El
      expect(legacy.props.disabled).toBe(true)
      expect(legacy.props.children).toBe('Legacy: Wine GPTK')
      expect((sel.props.afterSelect as El).props.children).toBe(warning)
    }
  })

  it('choosing CrossOver on a plain-prefix game confirms; Cancel writes nothing, Move writes engine and bottle (D-04)', () => {
    const el = mountControl({
      context: {
        appName: 'g1',
        runner: 'gog',
        gameInfo: { title: 'Game One' },
        showDialogModal: mockShowDialog
      },
      state: {
        'gog:g1': {
          overrideEligible: true,
          effectiveEngineId: 'pinned:wine-staging-11.20',
          prefixKind: 'plain',
          perGameBottleName: 'GameLib-g1'
        }
      }
    })
    ;(el.props.onChange as (id: string) => void)('crossover')
    expect(mockSetSetting).not.toHaveBeenCalled()
    expect(mockShowDialog).toHaveBeenCalledTimes(1)
    const dialog = at(at(mockShowDialog.mock.calls, 0), 0)
    expect(dialog.title).toBe('Move this game to its own bottle?')
    expect(dialog.message).toContain('Game One')
    expect(dialog.buttons.map((b) => b.text)).toEqual(['Move', 'Cancel'])
    expect(at(dialog.buttons, 1).onClick).toBeUndefined()
    at(dialog.buttons, 0).onClick?.()
    expect(mockSetSetting).toHaveBeenCalledWith('engineOverride', 'crossover')
    expect(mockSetSetting).toHaveBeenCalledWith(
      'wineCrossoverBottle',
      'GameLib-g1'
    )
  })

  it('choosing Automatic on a bottle-backed game writes only the engine (D-08)', () => {
    const el = mountControl({
      context: {
        appName: 'g1',
        runner: 'gog',
        showDialogModal: mockShowDialog
      },
      stored: { engineOverride: 'crossover' },
      state: {
        'gog:g1': {
          overrideEligible: true,
          effectiveEngineId: 'crossover',
          prefixKind: 'bottle',
          perGameBottleName: 'GameLib-g1'
        }
      }
    })
    ;(el.props.onChange as (id: string) => void)('automatic')
    expect(mockShowDialog).not.toHaveBeenCalled()
    expect(mockSetSetting).toHaveBeenCalledTimes(1)
    expect(mockSetSetting).toHaveBeenCalledWith('engineOverride', 'automatic')
  })

  it('never writes a legacy value', () => {
    const el = mountControl({
      context: { appName: 'g1', runner: 'gog' },
      state: {
        'gog:g1': { overrideEligible: true, effectiveEngineId: 'crossover' }
      }
    })
    ;(el.props.onChange as (id: string) => void)('legacy:Wine GPTK')
    expect(mockSetSetting).not.toHaveBeenCalled()
  })

  it('global variant: options for the default, stored value wins, no state needed (D-09)', () => {
    const el = mountControl({
      context: { appName: 'default', isDefault: true },
      stored: { engineOverride: 'pinned:wine-staging-11.20' }
    })
    expect(el.props.value).toBe('pinned:wine-staging-11.20')
    expect(api.listEngineOptions).toHaveBeenCalledWith({ appName: 'default' })
    expect(api.getDefaultEngine).toHaveBeenCalledTimes(1)
    expect(api.getEngineState).not.toHaveBeenCalled()
  })

  it('global Legacy default stays shown and never rewrites the global pick (D-20)', () => {
    const el = mountControl({
      context: {
        appName: 'default',
        isDefault: true,
        showDialogModal: mockShowDialog
      },
      states: [[...opts, legacyOpt], true, 'legacy:Wine GPTK']
    })
    expect(el.props.value).toBe('legacy:Wine GPTK')
    const view = EngineOverrideView(el.props as never) as El
    const sel = select(view)
    expect(
      (sel.props.children as El[]).some(
        (i) => i.props.value === 'legacy:Wine GPTK' && i.props.disabled === true
      )
    ).toBe(true)
    expect(mockSetSetting).not.toHaveBeenCalled()
    ;(el.props.onChange as (id: string) => void)('automatic')
    expect(mockShowDialog).not.toHaveBeenCalled()
    expect(mockSetSetting).toHaveBeenCalledWith('engineOverride', 'automatic')
  })
})
