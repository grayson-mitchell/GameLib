/**
 * The launch-builder shims (Phase 88.1, 88.1-07, D-01): the store managers reach the Rust builders through
 * `launchrust/builders.ts`. The shape of each shim and the phase that deletes it are pinned by
 * `engineWineShimSchedule.test.ts`; this file pins the channel and the arguments that cross, and that the
 * arguments pass the same zod schema the sidecar checks before the frame is written.
 */
import { rustInvokeArgs } from 'common/types/ipc/rustInvoke'
import {
  RUST_LAUNCH_KNOWN_FIX_ENV,
  RUST_LAUNCH_SETUP_ENV_VARS,
  RUST_LAUNCH_SETUP_WINE_ENV_VARS,
  RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS,
  RUST_LAUNCH_SETUP_WRAPPERS
} from 'common/types/sidecarTransport'
import type { GameSettings } from 'common/types'
import type { RustInvokeDeps } from 'backend/host/rustInvokeDeps'

import {
  getKnownFixesEnvVariables,
  setupEnvVars,
  setupWrapperEnvVars,
  setupWrappers
} from '../builders'

const settings = {
  wineVersion: { type: 'wine', bin: '/w/wine', name: 'Wine-9' },
  winePrefix: '/p',
  wrapperOptions: [{ exe: 'a', args: 'b c' }]
} as unknown as GameSettings

function fakeTransport(answer: unknown): RustInvokeDeps & {
  calls: Array<[string, unknown[]]>
} {
  const calls: Array<[string, unknown[]]> = []
  return {
    calls,
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return answer instanceof Error
        ? Promise.reject(answer)
        : Promise.resolve(answer)
    }) as unknown as RustInvokeDeps['requestRustInvoke']
  }
}

describe('setupWrapperEnvVars', () => {
  it('sends one launch_setup_wrapper_env_vars call carrying the wrapper env object and answers what Rust did', async () => {
    const reply = { HEROIC_APP_NAME: '1234', GAMEID: 'umu-0' }
    const deps = fakeTransport(reply)
    expect(
      await setupWrapperEnvVars(deps, { appName: '1234', appRunner: 'gog' })
    ).toBe(reply)
    expect(deps.calls).toEqual([
      [
        RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS,
        [{ appName: '1234', appRunner: 'gog' }]
      ]
    ])
    expect(RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS).toBe(
      'launch_setup_wrapper_env_vars'
    )
  })

  it('sends arguments that pass the channel schema for each runner, and the schema refuses a stray key or runner', async () => {
    const deps = fakeTransport({})
    for (const appRunner of [
      'gog',
      'legendary',
      'nile',
      'sideload',
      'steam'
    ] as const) {
      await setupWrapperEnvVars(deps, { appName: 'App', appRunner })
    }
    for (const [, args] of deps.calls) {
      expect(() =>
        rustInvokeArgs[RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS].parse(args)
      ).not.toThrow()
    }
    const schema = rustInvokeArgs[RUST_LAUNCH_SETUP_WRAPPER_ENV_VARS]
    expect(() =>
      schema.parse([{ appName: 'a', appRunner: 'gog', extra: 1 }])
    ).toThrow()
    expect(() => schema.parse([{ appName: 'a', appRunner: 'epic' }])).toThrow()
    expect(() => schema.parse([])).toThrow()
  })

  it('rejects with what the transport rejected with, with no TypeScript fallback', async () => {
    const deps = fakeTransport(
      new Error('launch_setup_wrapper_env_vars:not-ready')
    )
    await expect(
      setupWrapperEnvVars(deps, { appName: '1', appRunner: 'nile' })
    ).rejects.toThrow('launch_setup_wrapper_env_vars:not-ready')
    expect(deps.calls).toHaveLength(1)
  })
})

describe('setupEnvVars', () => {
  it('sends one launch_setup_env_vars call carrying the settings and the install path and answers what Rust did', async () => {
    const reply = { LD_PRELOAD: '' }
    const deps = fakeTransport(reply)
    expect(await setupEnvVars(deps, settings, '/games/g1')).toBe(reply)
    expect(deps.calls).toEqual([
      [RUST_LAUNCH_SETUP_ENV_VARS, [settings, '/games/g1']]
    ])
    expect(RUST_LAUNCH_SETUP_ENV_VARS).toBe('launch_setup_env_vars')
  })

  it('sends no host fact, and an unknown install path passes the channel schema', async () => {
    const deps = fakeTransport({})
    await setupEnvVars(deps, settings)
    await setupEnvVars(deps, settings, '/games/g1')
    for (const [channel, args] of deps.calls) {
      expect(channel).toBe(RUST_LAUNCH_SETUP_ENV_VARS)
      expect(args).toHaveLength(2)
      expect(() =>
        rustInvokeArgs[RUST_LAUNCH_SETUP_ENV_VARS].parse(args)
      ).not.toThrow()
    }
    // JSON turns the absent install path into the null the shell decodes.
    expect(JSON.parse(JSON.stringify(deps.calls[0]?.[1]))).toEqual([
      JSON.parse(JSON.stringify(settings)),
      null
    ])
  })

  it('rejects with what the transport rejected with', async () => {
    const deps = fakeTransport(new Error('launch_setup_env_vars:not-ready'))
    await expect(setupEnvVars(deps, settings)).rejects.toThrow(
      'launch_setup_env_vars:not-ready'
    )
  })
})

describe('setupWrappers', () => {
  it('sends one launch_setup_wrappers call carrying the settings and the three commands', async () => {
    const reply = ['gamescope', '--', 'a', 'b', 'c', 'gamemoderun']
    const deps = fakeTransport(reply)
    expect(
      await setupWrappers(deps, settings, ['mangohud'], 'gamemoderun', [
        'gamescope',
        '--'
      ])
    ).toBe(reply)
    expect(deps.calls).toEqual([
      [
        RUST_LAUNCH_SETUP_WRAPPERS,
        [settings, ['mangohud'], 'gamemoderun', ['gamescope', '--']]
      ]
    ])
    expect(RUST_LAUNCH_SETUP_WRAPPERS).toBe('launch_setup_wrappers')
  })

  it('sends an empty gamescope list as the empty list, apart from none, and every shape passes the channel schema', async () => {
    const deps = fakeTransport([])
    await setupWrappers(deps, settings)
    await setupWrappers(deps, settings, ['mangohud'], undefined, [])
    for (const [, args] of deps.calls) {
      expect(args).toHaveLength(4)
      expect(() =>
        rustInvokeArgs[RUST_LAUNCH_SETUP_WRAPPERS].parse(args)
      ).not.toThrow()
    }
    expect(deps.calls[1]?.[1]).toEqual([settings, ['mangohud'], undefined, []])
  })

  it('rejects with the crate message for an unterminated quote and with no fallback', async () => {
    const deps = fakeTransport(new Error('launch_setup_wrappers:Unterminated'))
    await expect(setupWrappers(deps, settings)).rejects.toThrow(
      'launch_setup_wrappers:Unterminated'
    )
    expect(deps.calls).toHaveLength(1)
  })
})

describe('getKnownFixesEnvVariables', () => {
  it('sends one launch_known_fix_env call carrying the app and the runner and answers what Rust did', async () => {
    const reply = { MY_VAR: '1' }
    const deps = fakeTransport(reply)
    expect(await getKnownFixesEnvVariables(deps, '1234', 'gog')).toBe(reply)
    expect(deps.calls).toEqual([[RUST_LAUNCH_KNOWN_FIX_ENV, ['1234', 'gog']]])
    expect(RUST_LAUNCH_KNOWN_FIX_ENV).toBe('launch_known_fix_env')
  })

  it('sends arguments that pass the channel schema for each runner, and the schema refuses another runner', async () => {
    const deps = fakeTransport({})
    for (const runner of [
      'gog',
      'legendary',
      'nile',
      'sideload',
      'steam'
    ] as const) {
      await getKnownFixesEnvVariables(deps, 'App', runner)
    }
    for (const [, args] of deps.calls) {
      expect(() =>
        rustInvokeArgs[RUST_LAUNCH_KNOWN_FIX_ENV].parse(args)
      ).not.toThrow()
    }
    expect(() =>
      rustInvokeArgs[RUST_LAUNCH_KNOWN_FIX_ENV].parse(['App', 'epic'])
    ).toThrow()
  })
})

describe('the wine env channel', () => {
  it('is reached by no shim yet (88.1-08 wires it with its callers) and its schema takes the settings and a game id', () => {
    expect(RUST_LAUNCH_SETUP_WINE_ENV_VARS).toBe('launch_setup_wine_env_vars')
    const schema = rustInvokeArgs[RUST_LAUNCH_SETUP_WINE_ENV_VARS]
    expect(() => schema.parse([settings, null])).not.toThrow()
    expect(() => schema.parse([settings, 'g1'])).not.toThrow()
    expect(() => schema.parse(['not an object', null])).toThrow()
  })
})
