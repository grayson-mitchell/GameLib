import type { IpcRendererEvent } from 'backend/platform'
import type { SteamEngineState } from 'common/types/steam'
import {
  handleSteamEngineStateChangedSignal,
  useSteamEngineState
} from '../SteamEngineState'

const make = (over: Partial<SteamEngineState> = {}): SteamEngineState => ({
  appId: '730',
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
    handleSteamEngineStateChangedSignal(evt, make())
    expect(useSteamEngineState.getState().byAppId['730'].engine).toBe('builtin')
  })

  it.each(['', 'abc', '12 3', '../1', '123456789012'])(
    'ignores a payload whose appId is %p',
    (appId) => {
      handleSteamEngineStateChangedSignal(evt, make({ appId }))
      expect(useSteamEngineState.getState().byAppId).toEqual({})
    }
  )

  it('hideNotice clears only the named notice', () => {
    handleSteamEngineStateChangedSignal(evt, make())
    useSteamEngineState.getState().hideNotice('730', 'no-crossover')
    const s = useSteamEngineState.getState().byAppId['730']
    expect(s.showNoCrossoverNote).toBe(false)
    expect(s.untestedCrossoverBuild).toBe('x')
    useSteamEngineState.getState().hideNotice('730', 'untested')
    expect(
      useSteamEngineState.getState().byAppId['730'].untestedCrossoverBuild
    ).toBeNull()
  })
})
