import { macSteamPathEnabled } from '../library/macSteamPathFlag'

describe('macSteamPathEnabled', () => {
  it('is on by default and only exactly "off" disables it', () => {
    expect(macSteamPathEnabled({})).toBe(true)
    expect(macSteamPathEnabled({ GAMELIB_STEAM_MAC_PATH: 'on' })).toBe(true)
    expect(macSteamPathEnabled({ GAMELIB_STEAM_MAC_PATH: 'off' })).toBe(false)
    expect(macSteamPathEnabled({ GAMELIB_STEAM_MAC_PATH: 'OFF' })).toBe(true)
  })
})
