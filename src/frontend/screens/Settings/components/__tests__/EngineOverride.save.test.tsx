import type { ReactElement } from 'react'
import type { EngineOption } from 'common/types/engine'

// G17 desk reproduction: drive the REAL useSetting -> setSetting chain with
// hooks stubbed (no DOM renderer here). SelectField is a recorder, so MUI's own
// event handling is NOT exercised -- only the setter chain is.
let mockStore: Record<string, unknown> = {}
let mockContext: Record<string, unknown> = {}
jest.mock('react', () => ({
  ...jest.requireActual('react'),
  useContext: () => mockContext,
  useState: (init: unknown) => [init, jest.fn()],
  useEffect: (fn: () => void) => {
    fn()
  }
}))
jest.mock('frontend/state/EngineState', () => ({
  engineStateKey: (r: string, a: string) => `${r}:${a}`,
  useEngineState: Object.assign(
    (sel: (s: { byGame: Record<string, unknown> }) => unknown) =>
      sel({ byGame: mockStore }),
    { getState: () => ({ set: jest.fn() }) }
  )
}))
jest.mock('frontend/screens/Settings/SettingsContext', () => ({
  __esModule: true,
  default: {}
}))
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: () => '' }) }))
jest.mock('frontend/components/UI/SelectField', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/components/UI/InfoIcon', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/state/GlobalStateV2', () => ({
  __esModule: true,
  default: { keys: () => ({ settingsModalProps: { isOpen: false } }) }
}))
jest.mock('frontend/state/ContextProvider', () => ({
  __esModule: true,
  default: {}
}))

import EngineOverride from '../EngineOverride'
import { createSettingSetter } from '../../../../hooks/useSettingsContext'
import { gamelibT } from '../../../Game/GamePage/components/__tests__/gamelibT'

const opt = (
  id: string,
  kind: EngineOption['kind'],
  available = true
): EngineOption => ({
  id,
  kind,
  label: id,
  available,
  installed: true,
  isPreviousPin: false
})
const opts: EngineOption[] = [
  opt('automatic', 'automatic'),
  opt('crossover', 'crossover'),
  opt('pinned:wine-staging-11.20', 'pinned'),
  opt('pinned:wine-staging-11.10', 'pinned')
]

type El = ReactElement<Record<string, unknown>>
const APP = '1284190'

const setSetting = jest.fn()

/** Mount the override over a settings context built from the real setter. */
function mount(stored: string) {
  let config: Record<string, unknown> = { engineOverride: stored }
  mockContext = {
    appName: APP,
    getSetting: (k: string, fb: unknown) => config[k] ?? fb,
    setSetting: createSettingSetter({
      appName: APP,
      getConfig: () => config,
      setConfig: (c) => {
        config = c as Record<string, unknown>
      },
      send: (p) => window.api.setSetting(p as never)
    })
  }
  mockStore = {
    [`steam:${APP}`]: { overrideEligible: true, effectiveEngineId: 'x' }
  }
  // useState is a fixed pair, so the stubbed component sees loaded=false and
  // no options; render the view directly with the loaded option list but the
  // real useSetting-derived onChange the component produced.
  const el = EngineOverride() as El
  const onChange = el.props.onChange as (id: string) => void
  return { onChange, el }
}

describe('EngineOverride save chain (G17)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(global as unknown as { window: unknown }).window = {
      api: {
        setSetting,
        logInfo: jest.fn(),
        getEngineState: jest.fn().mockResolvedValue(null),
        listEngineOptions: jest.fn().mockResolvedValue(opts)
      }
    }
  })

  it('stored pinned -> Automatic calls window.api.setSetting', () => {
    const { onChange } = mount('pinned:wine-staging-11.20')
    onChange('automatic')
    expect(setSetting).toHaveBeenCalledTimes(1)
    expect(setSetting).toHaveBeenCalledWith({
      appName: APP,
      key: 'engineOverride',
      value: 'automatic'
    })
  })

  it('stored pinned -> CrossOver calls window.api.setSetting', () => {
    const { onChange } = mount('pinned:wine-staging-11.20')
    onChange('crossover')
    expect(setSetting).toHaveBeenCalledTimes(1)
    expect(setSetting).toHaveBeenCalledWith({
      appName: APP,
      key: 'engineOverride',
      value: 'crossover'
    })
  })

  it('stored pinned -> another pinned saves', () => {
    const { onChange } = mount('pinned:wine-staging-11.20')
    onChange('pinned:wine-staging-11.10')
    expect(setSetting).toHaveBeenCalledWith({
      appName: APP,
      key: 'engineOverride',
      value: 'pinned:wine-staging-11.10'
    })
  })

  it('choosing the stored value does not send', () => {
    const { onChange } = mount('pinned:wine-staging-11.20')
    onChange('pinned:wine-staging-11.20')
    expect(setSetting).not.toHaveBeenCalled()
  })

  it('stored wine-manager:0.0-missing renders the disabled extra, and Automatic saves', async () => {
    const { EngineOverrideView } = await import('../EngineOverride')
    const { onChange } = mount('wine-manager:0.0-missing')
    const view = EngineOverrideView({
      options: opts,
      value: 'wine-manager:0.0-missing',
      loaded: true,
      onChange,
      t: gamelibT
    }) as El
    const sel = (view.props.children as El[]).find((c) => c.props.htmlId) as El
    expect(sel.props.value).toBe('wine-manager:0.0-missing')
    const items = sel.props.children as El[]
    const extra = items[items.length - 1]
    expect(extra.props.disabled).toBe(true)
    expect(extra.props.children).toBe(
      'Wine Manager: 0.0-missing (not installed)'
    )
    ;(sel.props.onChange as (e: unknown) => void)({
      target: { value: 'automatic' }
    })
    expect(setSetting).toHaveBeenCalledWith({
      appName: APP,
      key: 'engineOverride',
      value: 'automatic'
    })
  })
})
