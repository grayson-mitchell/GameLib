/**
 * Quick 261029-mkz: backend persistence + auto-set rules for "Runs for me".
 * The store is an in-memory fake; backend/ipc is mocked.
 */
const mockData: { games?: Record<string, string> } = {}

jest.mock('../electronStores', () => ({
  runsForMeStore: {
    get: (key: 'games', def: unknown) =>
      mockData[key] === undefined ? def : mockData[key],
    set: (key: 'games', value: Record<string, string>) => {
      mockData[key] = value
    }
  }
}))
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
    recordPlaySession('a', 'gog', 60_000, 'darwin')
    expect(getRunsForMeMap()).toEqual({ a_gog: 'auto' })
    expect(mockedSend).toHaveBeenCalledTimes(1)
    expect(mockedSend).toHaveBeenCalledWith('runsForMeChanged', {
      a_gog: 'auto'
    })
  })

  it('does nothing at 59 s', () => {
    recordPlaySession('a', 'gog', 59_000, 'darwin')
    expect(getRunsForMeMap()).toEqual({})
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it('user-off is never overwritten by auto; user-on can be set later', () => {
    setRunsForMeByUser('a', 'gog', false)
    mockedSend.mockClear()
    recordPlaySession('a', 'gog', 600_000, 'darwin')
    expect(getRunsForMeMap()).toEqual({ a_gog: 'user-off' })
    expect(mockedSend).not.toHaveBeenCalled()
    setRunsForMeByUser('a', 'gog', true)
    expect(getRunsForMeMap()).toEqual({ a_gog: 'user-on' })
  })

  it.each(['linux', 'win32'])('records nothing on %s', (platform) => {
    recordPlaySession('a', 'gog', 600_000, platform)
    expect(getRunsForMeMap()).toEqual({})
    expect(mockedSend).not.toHaveBeenCalled()
  })

  it('round-trips an appName containing dots', () => {
    setRunsForMeByUser('Foo.Bar.Baz', 'steam', true)
    expect(getRunsForMeMap()).toEqual({ 'Foo.Bar.Baz_steam': 'user-on' })
  })

  it('drops invalid values from a hand-edited store', () => {
    mockData.games = { ok_gog: 'auto', bad_gog: 'maybe' }
    expect(getRunsForMeMap()).toEqual({ ok_gog: 'auto' })
  })
})
