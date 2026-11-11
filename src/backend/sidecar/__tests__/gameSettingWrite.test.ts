const mockSetSetting = jest.fn()
const mockGet = jest.fn()
const mockLogError = jest.fn()
const mockSend = jest.fn()
jest.mock('../../ipc', () => ({
  sendFrontendMessage: (...a: unknown[]) => mockSend(...a)
}))
jest.mock('../../logger', () => ({ logError: (m: string) => mockLogError(m) }))

import { applyGameSetting } from '../gameSettingWrite'

const deps = { gameConfigs: { get: (a: string) => mockGet(a) } } as never

describe('applyGameSetting (G17)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockReturnValue({ setSetting: mockSetSetting })
  })

  it('writes once when the config handler works', () => {
    applyGameSetting(deps, '1284190', 'steamEngineOverride', 'automatic')
    expect(mockSetSetting).toHaveBeenCalledTimes(1)
    expect(mockSetSetting).toHaveBeenCalledWith(
      'steamEngineOverride',
      'automatic'
    )
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it('retries once after a transient throw and the write lands', () => {
    mockGet.mockImplementationOnce(() => {
      throw new Error('Unexpected end of JSON input')
    })
    applyGameSetting(deps, '1284190', 'steamEngineOverride', 'automatic')
    expect(mockSetSetting).toHaveBeenCalledTimes(1)
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it('logs to gamelib.log when both attempts throw, never throws itself', () => {
    mockGet.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() =>
      applyGameSetting(deps, '1284190', 'steamEngineOverride', 'automatic')
    ).not.toThrow()
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect(mockLogError.mock.calls[0][0]).toContain('1284190')
  })

  it('WR-04: pushes gameSettingWriteFailed once after both attempts fail', () => {
    mockGet.mockImplementation(() => {
      throw new Error('boom')
    })
    applyGameSetting(deps, '1284190', 'steamEngineOverride', 'automatic')
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledTimes(1)
    expect(mockSend).toHaveBeenCalledWith('gameSettingWriteFailed', {
      appName: '1284190',
      key: 'steamEngineOverride'
    })
  })

  it('WR-04: no push when a write lands on the first or second attempt', () => {
    applyGameSetting(deps, '1284190', 'steamEngineOverride', 'automatic')
    mockGet.mockImplementationOnce(() => {
      throw new Error('transient')
    })
    applyGameSetting(deps, '1284190', 'steamEngineOverride', 'automatic')
    expect(mockSend).not.toHaveBeenCalled()
  })
})
