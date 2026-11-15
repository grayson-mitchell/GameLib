import { macSteamPathEnabled } from '../library/macSteamPathFlag'

describe('macSteamPathEnabled', () => {
  it('is off by default and only exactly "on" enables it', () => {
    expect(macSteamPathEnabled({})).toBe(false)
    expect(macSteamPathEnabled({ GAMELIB_STEAM_MAC_PATH: 'on' })).toBe(true)
    expect(macSteamPathEnabled({ GAMELIB_STEAM_MAC_PATH: 'ON' })).toBe(false)
    expect(macSteamPathEnabled({ GAMELIB_STEAM_MAC_PATH: '1' })).toBe(false)
  })
})
