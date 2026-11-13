import { withUserGameEnv } from '../gameBridgeWineLaunch'
import { appendCxEnvTokens } from '../bridge/overlay/overlayLaunch'
import type { GameSettings } from 'common/types'

const settings = (
  env: { key: string; value: string }[] | undefined
): GameSettings => ({ enviromentOptions: env }) as unknown as GameSettings

describe('withUserGameEnv', () => {
  it('returns the base untouched when the game has no env', () => {
    const base = settings([{ key: 'A', value: '1' }])
    expect(withUserGameEnv(base, undefined)).toBe(base)
    expect(withUserGameEnv(base, [])).toBe(base)
  })

  it('lets a per-game key replace a global one case-insensitively and keeps the rest', () => {
    const out = withUserGameEnv(
      settings([
        { key: 'A', value: 'global' },
        { key: 'B', value: 'keep' }
      ]),
      [{ key: 'a', value: 'game' }]
    )
    expect(out.enviromentOptions).toEqual([
      { key: 'B', value: 'keep' },
      { key: 'a', value: 'game' }
    ])
  })

  it('keeps a user CX_ENV first through the cx-env overlay merge into the final env', () => {
    const user = 'STEAM_OVERLAY_LOGGING=1 STEAM_OVERLAY_LOGGING_FLUSH=1'
    const launch = withUserGameEnv(settings([{ key: 'X', value: 'y' }]), [
      { key: 'CX_ENV', value: user }
    ])
    const merged = appendCxEnvTokens(launch.enviromentOptions ?? [], [
      "DYLD_INSERT_LIBRARIES='/tmp/shim.dylib'"
    ])
    expect(merged.status).toBe('ok')
    if (merged.status !== 'ok') return
    const cx = merged.env.filter((e) => e.key === 'CX_ENV')
    expect(cx).toEqual([
      {
        key: 'CX_ENV',
        value: `${user} DYLD_INSERT_LIBRARIES='/tmp/shim.dylib'`
      }
    ])
    expect(merged.env).toContainEqual({ key: 'X', value: 'y' })
  })
})
