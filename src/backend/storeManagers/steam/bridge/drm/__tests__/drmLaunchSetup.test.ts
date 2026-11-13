/**
 * Phase 56 plan 11: drmLaunchSetup orchestrator.
 *
 * Every step is an injected fake, apart from the darwin-only real `pgrep` arm.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { GameSettings } from 'common/types'
import { buildDrmPaths } from '../drmPaths'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { drmStepError } from '../steamclientLayerMode'
import {
  createIsMacSteamRunning,
  createSteamDrm,
  DRM_END_SESSION_TIMEOUT_MS,
  DRM_PROGRESS_CONTEXT,
  type DrmLaunchSetupDeps,
  type DrmLaunchSetupInput
} from '../drmLaunchSetup'

import { createAbortRegistry } from 'backend/utils/aborthandler/aborthandler'

// Every step is an injected fake, so the instance's runner is never reached.
const { drmLaunchSetup, prefetchDrmDownloads } = createSteamDrm({
  runner: createScriptedRunner([]),
  aborts: createAbortRegistry(),
  requestRustInvoke: () => Promise.reject(new Error('rust not stubbed'))
})

jest.mock('../../../bridgeBottleLifecycle', () => ({
  endPerGameBridgeBottleSession: jest.fn(() => Promise.resolve(true))
}))
jest.mock('../../../bridgeBottle', () => ({
  DRM_LAUNCH_FORM: 'bin/wine+CX_BOTTLE',
  clearDrmBridgeRunner: jest.fn(),
  getDrmBridgeRunner: jest.fn(),
  setDrmBridgeRunner: jest.fn(() => true),
  getDrmBridgeBottleSettings: jest.fn(() => ({}))
}))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

let idCounter = 700000
const freshId = () => String(++idCounter)

const APP_FOLDER = '/tmp/Application Support/GameLib'
const CROSSOVER = { crossoverBuild: '26.3.0.39832' }
const COMPONENT = { componentId: 'c1', componentDir: '/c/dir', source: 'cache' }
const RUNNER = {
  runnerDir: '/r/dir',
  cxRoot: '/r/dir/CrossOver',
  source: 'cache'
}
const VALVE = {
  clientDir: '/v/dir',
  manifestVersion: '1700000000',
  source: 'cache'
}
const STAGED = { steamDirHost: '/s', helperWinPath: 'C:\\s\\steam.exe' }
const SETTINGS = { marker: 'settings' } as unknown as GameSettings

type Any = any

function makeInput(
  appId: string,
  over: Partial<DrmLaunchSetupInput> = {}
): DrmLaunchSetupInput {
  return {
    appId,
    appFolder: APP_FOLDER,
    bottleName: `GameLibSteamBridge-${appId}`,
    exePath: '/games/x/game.exe',
    installRoot: '/games/x',
    installdir: 'x',
    drmWrapper: 'steamstub',
    ...over
  }
}

function makeDeps(callOrder: string[], over: Partial<DrmLaunchSetupDeps> = {}) {
  const deps = {
    commandRunner: { runWineCommand: jest.fn() },
    spawnAsync: jest.fn(),
    isMacSteamRunning: jest.fn(() => {
      callOrder.push('steam')
      return Promise.resolve(true)
    }),
    detectCrossover: jest.fn(() => {
      callOrder.push('crossover')
      return Promise.resolve({ status: 'ok', ...CROSSOVER })
    }),
    ensureComponent: jest.fn(() => {
      callOrder.push('component')
      return Promise.resolve({ status: 'ok', ...COMPONENT })
    }),
    ensureRunner: jest.fn(() => {
      callOrder.push('runner')
      return Promise.resolve({ status: 'ok', ...RUNNER })
    }),
    ensureValveClient: jest.fn(() => {
      callOrder.push('valve')
      return Promise.resolve({ status: 'ok', ...VALVE })
    }),
    stageBottle: jest.fn(() => {
      callOrder.push('stage')
      return Promise.resolve({ status: 'ok', ...STAGED })
    }),
    buildBottleSettings: jest.fn(() => SETTINGS),
    registerRunner: jest.fn(() => {
      callOrder.push('register')
      return true
    }),
    clearRunner: jest.fn(),
    getRunner: jest.fn(() => undefined),
    endBottleSession: jest.fn(() => {
      callOrder.push('end-session')
      return Promise.resolve(true)
    }),
    sendStatus: jest.fn(),
    ...over
  }
  return deps as Any
}

describe('drmLaunchSetup', () => {
  test('not-applicable for none, undefined and CEG-marked steamstub: no step runs', async () => {
    for (const [drmWrapper, cegMarkers] of [
      ['none', undefined],
      [undefined, undefined],
      ['steamstub', ['STEAM_GUIDD']]
    ] as const) {
      const order: string[] = []
      const deps = makeDeps(order)
      const id = freshId()
      const res = await drmLaunchSetup(
        makeInput(id, {
          drmWrapper,
          cegMarkers: cegMarkers as string[] | undefined
        }),
        deps
      )
      expect(res).toEqual({ status: 'not-applicable', mode: 'tcp' })
      expect(order).toEqual([])
      for (const k of [
        'isMacSteamRunning',
        'detectCrossover',
        'ensureComponent',
        'ensureRunner',
        'ensureValveClient',
        'stageBottle',
        'buildBottleSettings',
        'endBottleSession',
        'registerRunner',
        'sendStatus'
      ]) {
        expect(deps[k]).not.toHaveBeenCalled()
      }
      expect(deps.clearRunner).toHaveBeenCalledTimes(1)
      expect(deps.clearRunner).toHaveBeenCalledWith(id)
    }
  })

  test('happy path: fixed order, result shape and step arguments', async () => {
    const order: string[] = []
    const deps = makeDeps(order)
    const id = freshId()
    const input = makeInput(id, { signal: new AbortController().signal })
    const res = (await drmLaunchSetup(input, deps)) as Any
    expect(order).toEqual([
      'steam',
      'crossover',
      'component',
      'runner',
      'valve',
      'end-session',
      'register',
      'stage'
    ])
    expect(res.status).toBe('ok')
    expect(res.mode).toBe('steamclient-layer')
    expect(res.bottle).toEqual(STAGED)
    expect(res.bottleSettings).toBe(SETTINGS)
    expect(res.launchForm).toBe('bin/wine+CX_BOTTLE')
    expect(res.anchor).toEqual({
      crossover: '26.3.0.39832',
      client: '1700000000'
    })
    expect(res.progressSent).toBe(false)
    expect(deps.detectCrossover.mock.calls[0][0]).toEqual({
      appFolder: APP_FOLDER
    })
    expect(deps.ensureComponent.mock.calls[0][0]).toEqual({
      appFolder: APP_FOLDER,
      crossoverBuild: '26.3.0.39832'
    })
    expect(deps.ensureRunner.mock.calls[0][0]).toEqual({
      appFolder: APP_FOLDER,
      crossover: res.crossover,
      component: res.component
    })
    expect(deps.ensureValveClient.mock.calls[0][0]).toEqual({
      appFolder: APP_FOLDER
    })
    expect(deps.buildBottleSettings).toHaveBeenCalledWith(
      id,
      res.runner,
      'bin/wine+CX_BOTTLE'
    )
    expect(deps.endBottleSession).toHaveBeenCalledWith(
      id,
      input.bottleName,
      DRM_END_SESSION_TIMEOUT_MS
    )
    expect(deps.registerRunner).toHaveBeenCalledWith(
      id,
      res.runner,
      'bin/wine+CX_BOTTLE'
    )
    expect(deps.stageBottle.mock.calls[0][0]).toEqual({
      appId: id,
      bottleName: input.bottleName,
      bottleSettings: SETTINGS,
      exePath: input.exePath,
      installRoot: input.installRoot,
      installdir: input.installdir,
      valveClientDir: '/v/dir',
      componentDir: '/c/dir',
      stageLogDir: buildDrmPaths(APP_FOLDER)?.traceRoot,
      signal: input.signal
    })
  })

  test('passes extraExeDirs only when drmExe differs from exePath', async () => {
    const run = async (drmExe?: string) => {
      const deps = makeDeps([])
      await drmLaunchSetup(
        makeInput(freshId(), { exePath: '/games/x/boot.exe', drmExe }),
        deps
      )
      return deps.stageBottle.mock.calls[0][0]
    }
    expect((await run('/games/x/B/Win64/s.exe')).extraExeDirs).toEqual([
      '/games/x/B/Win64'
    ])
    expect((await run('/games/x/boot.exe')).extraExeDirs).toBeUndefined()
    expect((await run(undefined)).extraExeDirs).toBeUndefined()
  })

  test('Mac Steam not running or probe failure stops before everything', async () => {
    const order: string[] = []
    const deps = makeDeps(order, {
      isMacSteamRunning: jest.fn(() => {
        order.push('steam')
        return Promise.resolve(false)
      })
    })
    const res = await drmLaunchSetup(makeInput(freshId()), deps)
    expect(res).toEqual({
      status: 'error',
      step: 'steam-not-running',
      cause: 'Mac Steam is not running'
    })
    expect(order).toEqual(['steam'])
    expect(deps.clearRunner).not.toHaveBeenCalled()

    const deps2 = makeDeps([], {
      isMacSteamRunning: jest.fn(async () => {
        throw new Error('boom')
      })
    })
    const res2 = (await drmLaunchSetup(makeInput(freshId()), deps2)) as Any
    expect(res2.step).toBe('steam-not-running')
    expect(res2.cause.startsWith('could not check Mac Steam')).toBe(true)
    expect(deps2.detectCrossover).not.toHaveBeenCalled()
  })

  const failures: Array<[string, string, string, string[]]> = [
    [
      'detectCrossover',
      'unsupported-crossover',
      'unsupported-crossover',
      ['component', 'runner', 'valve', 'stage']
    ],
    [
      'ensureComponent',
      'component-missing',
      'component-missing',
      ['runner', 'valve', 'stage']
    ],
    [
      'ensureComponent',
      'component-verify',
      'component-verify',
      ['runner', 'valve', 'stage']
    ],
    ['ensureRunner', 'runner-clone', 'runner-clone', ['valve', 'stage']],
    ['ensureRunner', 'runner-patch', 'runner-patch', ['valve', 'stage']],
    ['ensureValveClient', 'valve-fetch', 'valve-fetch', ['stage']],
    ['ensureValveClient', 'valve-verify', 'valve-verify', ['stage']],
    ['stageBottle', 'bottle-stage', 'bottle-stage', []]
  ]
  test.each(failures)(
    '%s returning %s is returned unchanged and later steps are skipped',
    async (dep, step, _s, later) => {
      const order: string[] = []
      const err = drmStepError(step as Any, 'nope')
      const deps = makeDeps(order, {
        [dep]: jest.fn(() => Promise.resolve(err))
      } as Any)
      const res = await drmLaunchSetup(makeInput(freshId()), deps)
      expect(res).toBe(err)
      for (const l of later) expect(order).not.toContain(l)
      const cleared = [
        'unsupported-crossover',
        'runner-clone',
        'runner-patch'
      ].includes(step)
      expect(deps.clearRunner).toHaveBeenCalledTimes(cleared ? 1 : 0)
    }
  )

  test.each([
    ['detectCrossover', 'unsupported-crossover'],
    ['ensureComponent', 'component-missing'],
    ['ensureRunner', 'runner-clone'],
    ['ensureValveClient', 'valve-fetch'],
    ['buildBottleSettings', 'bottle-stage'],
    ['stageBottle', 'bottle-stage']
  ])('a throwing %s maps to %s and never rejects', async (dep, step) => {
    const deps = makeDeps([], {
      [dep]: jest.fn(() => {
        throw new Error('kaboom')
      })
    } as Any)
    const res = (await drmLaunchSetup(makeInput(freshId()), deps)) as Any
    expect(res.status).toBe('error')
    expect(res.step).toBe(step)
  })

  test('progress: two contexts, consecutive duplicates deduped', async () => {
    const id = freshId()
    const deps = makeDeps([], {
      ensureComponent: jest.fn((_o: Any, d: Any) => {
        d.onFetchStart()
        return Promise.resolve({ status: 'ok', ...COMPONENT })
      }),
      ensureRunner: jest.fn((_o: Any, d: Any) => {
        d.onCloneStart()
        return Promise.resolve({ status: 'ok', ...RUNNER })
      }),
      ensureValveClient: jest.fn((_o: Any, d: Any) => {
        d.onFetchStart()
        return Promise.resolve({ status: 'ok', ...VALVE })
      })
    } as Any)
    const res = (await drmLaunchSetup(makeInput(id), deps)) as Any
    expect(deps.sendStatus).toHaveBeenCalledTimes(2)
    expect(deps.sendStatus.mock.calls[0][0]).toEqual({
      appName: id,
      runner: 'steam',
      status: 'drm-setup',
      context: 'Compatibility runner'
    })
    expect(deps.sendStatus.mock.calls[1][0]).toEqual({
      appName: id,
      runner: 'steam',
      status: 'drm-setup',
      context: 'Steam client files'
    })
    expect(DRM_PROGRESS_CONTEXT.runner).toBe('Compatibility runner')
    expect(res.progressSent).toBe(true)
  })

  test('cached second launch: no progress, no session end, no registration', async () => {
    const deps = makeDeps([], {
      getRunner: jest.fn(() => ({ runner: { runnerDir: RUNNER.runnerDir } }))
    } as Any)
    const res = (await drmLaunchSetup(makeInput(freshId()), deps)) as Any
    expect(res.status).toBe('ok')
    expect(deps.sendStatus).not.toHaveBeenCalled()
    expect(deps.endBottleSession).not.toHaveBeenCalled()
    expect(deps.registerRunner).not.toHaveBeenCalled()
    expect(deps.stageBottle).toHaveBeenCalledTimes(1)
    expect(res.progressSent).toBe(false)
  })

  describe('terminal done after failure (56-27, IN-01)', () => {
    const progressDeps = () => ({
      ensureComponent: jest.fn((_o: Any, d: Any) => {
        d.onFetchStart()
        return Promise.resolve({ status: 'ok', ...COMPONENT })
      })
    })
    const doneOf = (id: string) => ({
      appName: id,
      runner: 'steam',
      status: 'done'
    })

    test('progress then stage error sends done last', async () => {
      const id = freshId()
      const deps = makeDeps([], {
        ...progressDeps(),
        stageBottle: jest.fn(() =>
          Promise.resolve({
            status: 'error',
            step: 'bottle-stage',
            cause: 'boom'
          })
        )
      } as Any)
      const res = (await drmLaunchSetup(makeInput(id), deps)) as Any
      expect(res.status).toBe('error')
      expect(res.step).toBe('bottle-stage')
      const calls = deps.sendStatus.mock.calls
      expect(calls[calls.length - 1][0]).toEqual(doneOf(id))
    })

    test('progress then stage throw sends done and returns bottle-stage error', async () => {
      const id = freshId()
      const deps = makeDeps([], {
        ...progressDeps(),
        stageBottle: jest.fn(async () => {
          throw new Error('kaboom')
        })
      } as Any)
      const res = (await drmLaunchSetup(makeInput(id), deps)) as Any
      expect(res.status).toBe('error')
      expect(res.step).toBe('bottle-stage')
      const calls = deps.sendStatus.mock.calls
      expect(calls[calls.length - 1][0]).toEqual(doneOf(id))
    })

    test('no progress and stage error sends nothing', async () => {
      const deps = makeDeps([], {
        stageBottle: jest.fn(() =>
          Promise.resolve({
            status: 'error',
            step: 'bottle-stage',
            cause: 'boom'
          })
        )
      } as Any)
      await drmLaunchSetup(makeInput(freshId()), deps)
      expect(deps.sendStatus).not.toHaveBeenCalled()
    })

    test('Mac Steam not running sends nothing', async () => {
      const deps = makeDeps([], {
        isMacSteamRunning: jest.fn(() => Promise.resolve(false))
      } as Any)
      const res = (await drmLaunchSetup(makeInput(freshId()), deps)) as Any
      expect(res.status).toBe('error')
      expect(deps.sendStatus).not.toHaveBeenCalled()
    })

    test('progress then success sends no done', async () => {
      const deps = makeDeps([], progressDeps() as Any)
      const res = (await drmLaunchSetup(makeInput(freshId()), deps)) as Any
      expect(res.status).toBe('ok')
      expect(
        deps.sendStatus.mock.calls.some((c: Any) => c[0].status === 'done')
      ).toBe(false)
    })
  })

  test('registration refused gives a bottle-stage error and no stage call', async () => {
    const deps = makeDeps([], { registerRunner: jest.fn(() => false) } as Any)
    const res = (await drmLaunchSetup(makeInput(freshId()), deps)) as Any
    expect(res.step).toBe('bottle-stage')
    expect(res.cause).toContain('runner registration')
    expect(deps.stageBottle).not.toHaveBeenCalled()
  })

  test.each([
    ['appId', { appId: 'abc' }],
    ['bottleName', { bottleName: '' }],
    ['appFolder', { appFolder: 'rel/path' }],
    ['exePath', { exePath: 'rel/game.exe' }]
  ])(
    'invalid %s gives bottle-stage with no dependency called',
    async (_f, over) => {
      const deps = makeDeps([])
      const res = (await drmLaunchSetup(
        makeInput(freshId(), over as Partial<DrmLaunchSetupInput>),
        deps
      )) as Any
      expect(res.status).toBe('error')
      expect(res.step).toBe('bottle-stage')
      expect(deps.isMacSteamRunning).not.toHaveBeenCalled()
    }
  )

  test('concurrent calls for one appId share one run', async () => {
    const deps = makeDeps([])
    const id = freshId()
    const [a, b] = await Promise.all([
      drmLaunchSetup(makeInput(id), deps),
      drmLaunchSetup(makeInput(id), deps)
    ])
    expect(a).toBe(b)
    expect(deps.detectCrossover).toHaveBeenCalledTimes(1)
    expect(deps.stageBottle).toHaveBeenCalledTimes(1)
  })

  describe('createIsMacSteamRunning', () => {
    const probe = (result: Record<string, unknown>) => {
      const runner = createScriptedRunner([{ cmd: '/usr/bin/pgrep', result }])
      return { runner, isRunning: createIsMacSteamRunning({ runner }) }
    }

    test('runs pgrep with the 5 s bound, empty stdin and a fake HOME', async () => {
      const { runner, isRunning } = probe({ code: 0 })
      await expect(isRunning()).resolves.toBe(true)
      const call = runner.calls[0]
      expect(call?.argv).toEqual(['-x', 'steam_osx'])
      expect(call?.opts).toMatchObject({
        timeoutMs: 5000,
        stdin: '',
        replaceEnv: true
      })
      expect(call?.env?.HOME).not.toBe(process.env.HOME)
    })

    test('exit codes map to boolean or error', async () => {
      await expect(probe({ code: 1 }).isRunning(1000)).resolves.toBe(false)
      await expect(probe({ code: 2 }).isRunning(1000)).rejects.toThrow(
        'pgrep exited 2'
      )
    })

    test('a timed-out probe rejects', async () => {
      await expect(
        probe({ code: null, timedOut: true }).isRunning(20)
      ).rejects.toThrow('timed out')
    })

    test('a spawn failure rejects', async () => {
      const runner = createScriptedRunner([
        { cmd: '/usr/bin/pgrep', error: { code: 'ENOENT' } }
      ])
      await expect(createIsMacSteamRunning({ runner })()).rejects.toThrow()
    })
  })

  test('importing the module spawns nothing', async () => {
    await jest.isolateModulesAsync(async () => {
      await import('../drmLaunchSetup')
    })
  })

  test('source gate: no forbidden tokens outside comments', () => {
    const src = readFileSync(join(__dirname, '..', 'drmLaunchSetup.ts'), 'utf8')
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\*|\/\/)/.test(l))
      .join('\n')
    for (const re of [
      /from 'backend\/utils'/,
      /from 'backend\/launcher'/,
      /constants\/paths/,
      /\[bridge-notice\]/,
      /\[bridge-drm\]/,
      /\[drm-trace\]/,
      /markBridgeFailedThisSession/,
      /tellBottledSteamTo/,
      /HKLM/,
      /steamClientSetup/
    ]) {
      expect(code).not.toMatch(re)
    }
  })
})

describe('prefetchDrmDownloads (quick 261029-e2t)', () => {
  const prefetchInput = (appId: string) => ({
    appId,
    appFolder: APP_FOLDER,
    drmWrapper: 'steamstub' as const
  })

  it('runs steps 2-5 only: no Steam check, no runner registration, no bottle', async () => {
    const order: string[] = []
    const deps = makeDeps(order)
    const res = await prefetchDrmDownloads(prefetchInput(freshId()), deps)
    expect(res).toEqual({ status: 'ok' })
    expect(order).toEqual(['crossover', 'component', 'runner', 'valve'])
    expect(deps.isMacSteamRunning).not.toHaveBeenCalled()
    expect(deps.registerRunner).not.toHaveBeenCalled()
    expect(deps.clearRunner).not.toHaveBeenCalled()
    expect(deps.endBottleSession).not.toHaveBeenCalled()
    expect(deps.stageBottle).not.toHaveBeenCalled()
  })

  it("reports fetch progress as 'drm-setup'", async () => {
    const id = freshId()
    const deps = makeDeps([], {
      ensureComponent: jest.fn((_i: Any, h: Any) => {
        h.onFetchStart()
        return Promise.resolve({ status: 'ok', ...COMPONENT })
      }),
      ensureValveClient: jest.fn((_i: Any, h: Any) => {
        h.onFetchStart()
        return Promise.resolve({ status: 'ok', ...VALVE })
      })
    } as Any)
    await prefetchDrmDownloads(prefetchInput(id), deps)
    expect(deps.sendStatus.mock.calls.map((c: Any) => c[0])).toEqual([
      {
        appName: id,
        runner: 'steam',
        status: 'drm-setup',
        context: DRM_PROGRESS_CONTEXT.runner
      },
      {
        appName: id,
        runner: 'steam',
        status: 'drm-setup',
        context: DRM_PROGRESS_CONTEXT.valveClient
      }
    ])
  })

  it('does nothing for a title that is not steamclient-layer', async () => {
    const order: string[] = []
    const deps = makeDeps(order)
    const res = await prefetchDrmDownloads(
      { ...prefetchInput(freshId()), drmWrapper: 'none' },
      deps
    )
    expect(res).toEqual({ status: 'not-applicable' })
    expect(order).toEqual([])
    expect(deps.clearRunner).not.toHaveBeenCalled()
  })

  it('stops at the first failing step, leaves the runner alone, never rejects', async () => {
    const order: string[] = []
    const deps = makeDeps(order, {
      ensureRunner: jest.fn(async () => {
        order.push('runner')
        throw new Error('clone failed')
      })
    } as Any)
    const res = await prefetchDrmDownloads(prefetchInput(freshId()), deps)
    expect(res).toEqual(
      expect.objectContaining({ status: 'error', step: 'runner-clone' })
    )
    expect(res).not.toHaveProperty('stage')
    expect(order).toEqual(['crossover', 'component', 'runner'])
    expect(deps.clearRunner).not.toHaveBeenCalled()
  })
})
