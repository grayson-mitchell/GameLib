const mockSetSetting = jest.fn()
const mockGet = jest.fn()
const mockLogError = jest.fn()
jest.mock('../../game_config', () => ({
  GameConfig: { get: (a: string) => mockGet(a) }
}))
jest.mock('../../logger', () => ({ logError: (m: string) => mockLogError(m) }))

import { applyGameSetting } from '../gameSettingWrite'

describe('applyGameSetting (G17)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGet.mockReturnValue({ setSetting: mockSetSetting })
  })

  it('writes once when the config handler works', () => {
    applyGameSetting('1284190', 'steamEngineOverride', 'automatic')
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
    applyGameSetting('1284190', 'steamEngineOverride', 'automatic')
    expect(mockSetSetting).toHaveBeenCalledTimes(1)
    expect(mockLogError).not.toHaveBeenCalled()
  })

  it('logs to gamelib.log when both attempts throw, never throws itself', () => {
    mockGet.mockImplementation(() => {
      throw new Error('boom')
    })
    expect(() =>
      applyGameSetting('1284190', 'steamEngineOverride', 'automatic')
    ).not.toThrow()
    expect(mockLogError).toHaveBeenCalledTimes(1)
    expect(mockLogError.mock.calls[0][0]).toContain('1284190')
  })
})
