/**
 * The launcher's four builder members (Phase 88.1, 88.1-07): `createLauncher` binds each to its Rust shim with the
 * deps it was built with and narrows the untyped answer, so a manager gets a typed value or an error and never a
 * malformed variable in a game's environment.
 */
import { createLauncher } from 'backend/launcher'
import type { LauncherDeps } from 'backend/launcher'
import type { GameSettings } from 'common/types'
import {
  RUST_LAUNCH_KNOWN_FIX_ENV,
  RUST_LAUNCH_SETUP_ENV_VARS,
  RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS,
  RUST_LAUNCH_SETUP_WINE_ENV_VARS,
  RUST_LAUNCH_SETUP_WRAPPERS,
  RUST_LAUNCH_VERIFY_WINE_PREFIX
} from 'common/types/sidecarTransport'

const settings = { winePrefix: '/p' } as unknown as GameSettings

function launcherAnswering(answer: unknown) {
  const calls: Array<[string, unknown[]]> = []
  const deps = {
    requestRustInvoke: (channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return Promise.resolve(answer)
    }
  } as unknown as LauncherDeps
  return { launcher: createLauncher(deps), calls }
}

describe('the launcher builder members', () => {
  it('setupWrapperEnvVars and setupEnvVars send their channel and answer a string map', async () => {
    const { launcher, calls } = launcherAnswering({ A: '1' })
    expect(
      await launcher.setupWrapperEnvVars({ appName: 'g', appRunner: 'gog' })
    ).toEqual({ A: '1' })
    expect(await launcher.setupEnvVars(settings, '/games/g')).toEqual({
      A: '1'
    })
    expect(calls).toEqual([
      [
        RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS,
        [{ appName: 'g', appRunner: 'gog' }]
      ],
      [RUST_LAUNCH_SETUP_ENV_VARS, [settings, '/games/g']]
    ])
  })

  it('setupWrappers sends its channel with the three commands in order and answers the words', async () => {
    const { launcher, calls } = launcherAnswering(['gamescope', 'a'])
    expect(
      await launcher.setupWrappers(settings, ['m'], 'gm', ['gamescope'])
    ).toEqual(['gamescope', 'a'])
    expect(calls).toEqual([
      [RUST_LAUNCH_SETUP_WRAPPERS, [settings, ['m'], 'gm', ['gamescope']]]
    ])
  })

  it('getKnownFixesEnvVariables sends its channel and answers no fix as an empty map', async () => {
    const { launcher, calls } = launcherAnswering(null)
    expect(await launcher.getKnownFixesEnvVariables('1', 'nile')).toEqual({})
    expect(calls).toEqual([[RUST_LAUNCH_KNOWN_FIX_ENV, ['1', 'nile']]])
  })

  it('a reply of the wrong shape is an error at the call, never a malformed environment', async () => {
    const { launcher } = launcherAnswering(['not', 'a', 'map'])
    await expect(
      launcher.setupWrapperEnvVars({ appName: 'g', appRunner: 'gog' })
    ).rejects.toThrow('setupWrapperEnvVars: the reply was not a string map')
    await expect(launcher.setupEnvVars(settings)).rejects.toThrow(
      'setupEnvVars: the reply was not a string map'
    )
    const words = launcherAnswering({ a: 1 })
    await expect(words.launcher.setupWrappers(settings)).rejects.toThrow(
      'setupWrappers: the reply was not a list of words'
    )
  })

  it('setupWineEnvVars sends its channel and answers a string map, and an answer of the wrong shape is an error', async () => {
    const { launcher, calls } = launcherAnswering({ WINEPREFIX: '/p' })
    expect(await launcher.setupWineEnvVars(settings, 'g1')).toEqual({
      WINEPREFIX: '/p'
    })
    expect(calls).toEqual([[RUST_LAUNCH_SETUP_WINE_ENV_VARS, [settings, 'g1']]])
    await expect(
      launcherAnswering(['not', 'a', 'map']).launcher.setupWineEnvVars(settings)
    ).rejects.toThrow('setupWineEnvVars: the reply was not a string map')
  })

  it('verifyWinePrefix sends its channel with the settings alone and answers the result, and an answer of the wrong shape is an error', async () => {
    const reply = { res: { stdout: 'a', stderr: 'b', code: 0 } }
    const { launcher, calls } = launcherAnswering(reply)
    expect(await launcher.verifyWinePrefix(settings)).toEqual(reply)
    expect(calls).toEqual([[RUST_LAUNCH_VERIFY_WINE_PREFIX, [settings]]])
    for (const wrong of [null, {}, { res: null }, { res: { stdout: 1 } }]) {
      await expect(
        launcherAnswering(wrong).launcher.verifyWinePrefix(settings)
      ).rejects.toThrow('verifyWinePrefix: the reply was not a command result')
    }
  })
})
