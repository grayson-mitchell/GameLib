import { isGameLibShimBytes } from '../shimOriginals'

describe('isGameLibShimBytes', () => {
  it('is true for a buffer containing the GameLibSteamBridgeShim marker', () => {
    expect(
      isGameLibShimBytes(Buffer.from('xxGameLibSteamBridgeShim/2xx'))
    ).toBe(true)
  })

  it('is true for a buffer containing the ASCII loopback address', () => {
    expect(isGameLibShimBytes(Buffer.from('xx127.0.0.1xx'))).toBe(true)
  })

  it('is false for a buffer containing neither marker', () => {
    expect(isGameLibShimBytes(Buffer.from('just-a-games-own-dll-bytes'))).toBe(
      false
    )
  })
})
