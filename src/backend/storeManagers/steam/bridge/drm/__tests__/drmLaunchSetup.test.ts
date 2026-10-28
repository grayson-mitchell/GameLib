/**
 * Phase 56 plan 11: drmLaunchSetup orchestrator.
 *
 * Every step is an injected fake, apart from the darwin-only real `pgrep` arm.
 */
import { EventEmitter } from 'events'
import * as childProcess from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import type { GameSettings } from 'common/types'
import { drmStepError } from '../steamclientLayerMode'
import {
  drmLaunchSetup,
  isMacSteamRunning,
  DRM_END_SESSION_TIMEOUT_MS,
  DRM_PROGRESS_CONTEXT,
  type DrmLaunchSetupDeps,
  type DrmLaunchSetupInput
} from '../drmLaunchSetup'

jest.mock('../../../bottle', () => ({
  DRM_LAUNCH_FORM: 'bin/wine+CX_BOTTLE',
  clearDrmBridgeRunner: jest.fn(),
  getDrmBridgeRunner: jest.fn(),
  setDrmBridgeRunner: jest.fn(() => true),
  getDrmBridgeBottleSettings: jest.fn(() => ({})),
  endPerGameBridgeBottleSession: jest.fn(async () => true)
}))
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process')
  return { ...actual, spawn: jest.fn() }
})
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
    isMacSteamRunning: jest.fn(async () => {
      callOrder.push('steam')
      return true
    }),
    detectCrossover: jest.fn(async () => {
      callOrder.push('crossover')
      return { status: 'ok', ...CROSSOVER }
    }),
    ensureComponent: jest.fn(async () => {
      callOrder.push('component')
      return { status: 'ok', ...COMPONENT }
    }),
    ensureRunner: jest.fn(async () => {
      callOrder.push('runner')
      return { status: 'ok', ...RUNNER }
    }),
    ensureValveClient: jest.fn(async () => {
      callOrder.push('valve')
      return { status: 'ok', ...VALVE }
    }),
    stageBottle: jest.fn(async () => {
      callOrder.push('stage')
      return { status: 'ok', ...STAGED }
    }),
    buildBottleSettings: jest.fn(() => SETTINGS),
    registerRunner: jest.fn(() => {
      callOrder.push('register')
      return true
    }),
    clearRunner: jest.fn(),
    getRunner: jest.fn(() => undefined),
    endBottleSession: jest.fn(async () => {
      callOrder.push('end-session')
      return true
    }),
    sendStatus: jest.fn(),
    ...over
  }
  return deps as Any
}

const spawnMock = childProcess.spawn as unknown as jest.Mock
const realSpawn = jest.requireActual('child_process').spawn

describe('drmLaunchSetup', () => {
  beforeEach(() => {
    spawnMock.mockImplementation(realSpawn)
  })

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
      signal: input.signal
    })
  })

  test('Mac Steam not running or probe failure stops before everything', async () => {
    const order: string[] = []
    const deps = makeDeps(order, {
      isMacSteamRunning: jest.fn(async () => {
        order.push('steam')
        return false
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
      const deps = makeDeps(order, { [dep]: jest.fn(async () => err) } as Any)
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
      ensureComponent: jest.fn(async (_o: Any, d: Any) => {
        d.onFetchStart()
        return { status: 'ok', ...COMPONENT }
      }),
      ensureRunner: jest.fn(async (_o: Any, d: Any) => {
        d.onCloneStart()
        return { status: 'ok', ...RUNNER }
      }),
      ensureValveClient: jest.fn(async (_o: Any, d: Any) => {
        d.onFetchStart()
        return { status: 'ok', ...VALVE }
      })
    } as Any)
    const res = (await drmLaunchSetup(makeInput(id), deps)) as Any
    expect(deps.sendStatus).toHaveBeenCalledTimes(2)
    expect(deps.sendStatus.mock.calls[0][0]).toEqual({
      appName: id,
      runner: 'steam',
      status: 'redist',
      context: 'Compatibility runner'
    })
    expect(deps.sendStatus.mock.calls[1][0]).toEqual({
      appName: id,
      runner: 'steam',
      status: 'redist',
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

  describe('isMacSteamRunning', () => {
    const darwinTest = process.platform === 'darwin' ? test : test.skip
    darwinTest('real arm resolves a boolean under a fake HOME', async () => {
      const spy = spawnMock
      const running = await isMacSteamRunning()
      expect(typeof running).toBe('boolean')
      const call = spy.mock.calls[0]
      expect(call[0]).toBe('/usr/bin/pgrep')
      expect(call[1]).toEqual(['-x', 'steam_osx'])
      expect(call[2].env.HOME).not.toBe(process.env.HOME)
    })

    test('a probe that never exits times out and is SIGKILLed', async () => {
      const child = Object.assign(new EventEmitter(), {
        kill: jest.fn(),
        unref: jest.fn()
      })
      spawnMock.mockReturnValue(child as Any)
      await expect(isMacSteamRunning(20)).rejects.toThrow('timed out')
      expect(child.kill).toHaveBeenCalledWith('SIGKILL')
    })

    test('exit codes map to boolean or error', async () => {
      for (const [code, expected] of [
        [0, true],
        [1, false]
      ] as const) {
        const child = Object.assign(new EventEmitter(), {
          kill: jest.fn(),
          unref: jest.fn()
        })
        spawnMock.mockReturnValue(child as Any)
        const p = isMacSteamRunning(1000)
        child.emit('close', code)
        await expect(p).resolves.toBe(expected)
      }
      const child = Object.assign(new EventEmitter(), {
        kill: jest.fn(),
        unref: jest.fn()
      })
      spawnMock.mockReturnValue(child as Any)
      const p = isMacSteamRunning(1000)
      child.emit('close', 2)
      await expect(p).rejects.toThrow('pgrep exited 2')
    })
  })

  test('importing the module spawns nothing', async () => {
    spawnMock.mockClear()
    await jest.isolateModulesAsync(async () => {
      await import('../drmLaunchSetup')
    })
    expect(spawnMock).not.toHaveBeenCalled()
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
