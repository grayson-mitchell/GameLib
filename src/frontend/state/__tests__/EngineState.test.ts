import type { IpcRendererEvent } from 'backend/platform'
import type { EngineState } from 'common/types/engine'
import {
  engineStateKey,
  handleEngineStateChangedSignal,
  useEngineState
} from '../EngineState'

const make = (over: Partial<EngineState> = {}): EngineState => ({
  runner: 'steam',
  appName: '730',
  engine: 'builtin',
  reason: 'cx-missing',
  engineLabel: null,
  trialDaysRemaining: null,
  showTrialNotice: false,
  crossoverInstalled: false,
  showNoCrossoverNote: true,
  untestedCrossoverBuild: 'x',
  ...over
})
const evt = {} as IpcRendererEvent
const get = (k: string) => useEngineState.getState().byGame[k]

describe('EngineState store', () => {
  beforeEach(() => useEngineState.setState({ byGame: {} }))

  it('builds the key from runner and appName', () => {
    expect(engineStateKey('gog', '1207658924')).toBe('gog:1207658924')
  })

  it('stores a pushed state under its game key', () => {
    handleEngineStateChangedSignal(evt, make())
    expect(get('steam:730').engine).toBe('builtin')
  })

  it('keeps a gog and a steam state with the same appName apart', () => {
    handleEngineStateChangedSignal(evt, make({ appName: '1207658924' }))
    handleEngineStateChangedSignal(
      evt,
      make({ runner: 'gog', appName: '1207658924' })
    )
    expect(Object.keys(useEngineState.getState().byGame)).toHaveLength(2)
  })

  it.each([
    ['legendary', 'Fortnite'],
    ['nile', 'amzn1.adg.product.x']
  ])('accepts %s appName %s', (runner, appName) => {
    handleEngineStateChangedSignal(evt, make({ runner, appName } as never))
    expect(get(engineStateKey(runner, appName))).toBeDefined()
  })

  it.each(['', 'a/b', 'a\\b', '../1', 'a\0b', 'x'.repeat(256)])(
    'ignores a payload whose appName is %p',
    (appName) => {
      handleEngineStateChangedSignal(evt, make({ appName }))
      expect(useEngineState.getState().byGame).toEqual({})
    }
  )

  it('ignores a missing runner and non-objects', () => {
    handleEngineStateChangedSignal(evt, make({ runner: '' as never }))
    handleEngineStateChangedSignal(evt, { appName: '1' } as never)
    handleEngineStateChangedSignal(evt, null as never)
    handleEngineStateChangedSignal(evt, 'x' as never)
    expect(useEngineState.getState().byGame).toEqual({})
  })

  it('hideNotice clears only the named notice', () => {
    handleEngineStateChangedSignal(evt, make())
    useEngineState.getState().hideNotice('steam:730', 'no-crossover')
    const s = get('steam:730')
    expect(s.showNoCrossoverNote).toBe(false)
    expect(s.untestedCrossoverBuild).toBe('x')
    useEngineState.getState().hideNotice('steam:730', 'untested')
    expect(get('steam:730').untestedCrossoverBuild).toBeNull()
  })

  it('remove deletes one game and leaves others', () => {
    handleEngineStateChangedSignal(evt, make({ appName: '63000' }))
    handleEngineStateChangedSignal(evt, make())
    useEngineState.getState().remove('steam:63000')
    expect(Object.keys(useEngineState.getState().byGame)).toEqual(['steam:730'])
  })
})
