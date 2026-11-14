import {
  STEAMCM_CM_DEFAULT,
  STEAMCM_SIGNIN_DEFAULT,
  steamCmImpl,
  steamCmSignInImpl
} from '../steamCmFlags'

describe('steamCmFlags', () => {
  test('defaults are ts', () => {
    expect(STEAMCM_CM_DEFAULT).toBe('ts')
    expect(STEAMCM_SIGNIN_DEFAULT).toBe('ts')
    expect(steamCmImpl({})).toBe('ts')
    expect(steamCmSignInImpl({})).toBe('ts')
  })

  test('accepts rust, rejects wrong case', () => {
    expect(steamCmImpl({ GAMELIB_STEAMCM_CM: 'rust' })).toBe('rust')
    expect(steamCmImpl({ GAMELIB_STEAMCM_CM: 'RUST' })).toBe(STEAMCM_CM_DEFAULT)
    expect(steamCmSignInImpl({ GAMELIB_STEAMCM_SIGNIN: 'x' })).toBe(
      STEAMCM_SIGNIN_DEFAULT
    )
  })

  test('flags are independent', () => {
    expect(steamCmSignInImpl({ GAMELIB_STEAMCM_CM: 'rust' })).toBe('ts')
    expect(steamCmImpl({ GAMELIB_STEAMCM_SIGNIN: 'rust' })).toBe('ts')
  })

  test('reads env at call time', () => {
    const prev = process.env.GAMELIB_STEAMCM_CM
    try {
      process.env.GAMELIB_STEAMCM_CM = 'rust'
      expect(steamCmImpl()).toBe('rust')
      process.env.GAMELIB_STEAMCM_CM = 'ts'
      expect(steamCmImpl()).toBe('ts')
    } finally {
      if (prev === undefined) delete process.env.GAMELIB_STEAMCM_CM
      else process.env.GAMELIB_STEAMCM_CM = prev
    }
  })
})
