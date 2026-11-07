import type { IpcRendererEvent } from 'backend/platform'
import type { EngineState } from 'common/types/engine'
import {
  handleEngineStateChangedSignal,
  useSteamEngineState
} from '../SteamEngineState'

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

describe('SteamEngineState store', () => {
  beforeEach(() => useSteamEngineState.setState({ byAppId: {} }))

  it('stores a pushed state under its appId', () => {
    handleEngineStateChangedSignal(evt, make())
    expect(useSteamEngineState.getState().byAppId['730'].engine).toBe('builtin')
  })

  it.each(['', 'abc', '12 3', '../1', '123456789012'])(
    'ignores a payload whose appId is %p',
    (appId) => {
      handleEngineStateChangedSignal(evt, make({ appName: appId }))
      expect(useSteamEngineState.getState().byAppId).toEqual({})
    }
  )

  it('hideNotice clears only the named notice', () => {
    handleEngineStateChangedSignal(evt, make())
    useSteamEngineState.getState().hideNotice('730', 'no-crossover')
    const s = useSteamEngineState.getState().byAppId['730']
    expect(s.showNoCrossoverNote).toBe(false)
    expect(s.untestedCrossoverBuild).toBe('x')
    useSteamEngineState.getState().hideNotice('730', 'untested')
    expect(
      useSteamEngineState.getState().byAppId['730'].untestedCrossoverBuild
    ).toBeNull()
  })

  it('remove deletes one appId and leaves others', () => {
    handleEngineStateChangedSignal(evt, make({ appName: '63000' }))
    handleEngineStateChangedSignal(evt, make())
    useSteamEngineState.getState().remove('63000')
    expect(Object.keys(useSteamEngineState.getState().byAppId)).toEqual(['730'])
  })
})
