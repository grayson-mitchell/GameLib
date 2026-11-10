/**
 * Quick 261029-mkz: backend persistence + auto-set rules for "Runs for me".
 * The store is an in-memory fake; backend/ipc is mocked.
 */
const mockData: { games?: Record<string, string> } = {}

const deps = {
  stores: {
    runsForMe: {
      runsForMeStore: {
        get: (key: 'games', def: unknown) =>
          mockData[key] === undefined ? def : mockData[key],
        set: (key: 'games', value: Record<string, string>) => {
          mockData[key] = value
        }
      }
    }
  } as never
}
jest.mock('backend/ipc', () => ({ sendFrontendMessage: jest.fn() }))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import { sendFrontendMessage } from 'backend/ipc'
import {
  getRunsForMeMap,
  recordPlaySession,
  setRunsForMeByUser
} from '../index'

const mockedSend = sendFrontendMessage as jest.Mock

describe('runsForMe backend', () => {
  beforeEach(() => {
    delete mockData.games
  })

  it('auto-sets at 60 s and pushes the full map once', () => {
    recordPlaySession(deps, 'a', 'gog', 60_000, 'darwin')
    expect(getRunsForMeMap(deps)).toEqual({ a_gog: 'auto' })
    expect(mockedSend).toHaveBeenCalledTimes(1)
    expect(mockedSend).toHaveBeenCalledWith('runsForMeChanged', {
      a_gog: 'auto'
    })
  })

  it('does nothing at 59 s', () => {
    recordPlaySession(deps, 'a', 'gog', 59_000, 'darwin')
    expect(getRunsForMeMap(deps)).toEqual({})
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it('user-off is never overwritten by auto; user-on can be set later', () => {
    setRunsForMeByUser(deps, 'a', 'gog', false)
    mockedSend.mockClear()
    recordPlaySession(deps, 'a', 'gog', 600_000, 'darwin')
    expect(getRunsForMeMap(deps)).toEqual({ a_gog: 'user-off' })
    expect(mockedSend).not.toHaveBeenCalled()
    setRunsForMeByUser(deps, 'a', 'gog', true)
    expect(getRunsForMeMap(deps)).toEqual({ a_gog: 'user-on' })
  })

  it.each(['linux', 'win32'])('records nothing on %s', (platform) => {
    recordPlaySession(deps, 'a', 'gog', 600_000, platform)
    expect(getRunsForMeMap(deps)).toEqual({})
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it('round-trips an appName containing dots', () => {
    setRunsForMeByUser(deps, 'Foo.Bar.Baz', 'steam', true)
    expect(getRunsForMeMap(deps)).toEqual({ 'Foo.Bar.Baz_steam': 'user-on' })
  })

  it('drops invalid values from a hand-edited store', () => {
    mockData.games = { ok_gog: 'auto', bad_gog: 'maybe' }
    expect(getRunsForMeMap(deps)).toEqual({ ok_gog: 'auto' })
  })
})
