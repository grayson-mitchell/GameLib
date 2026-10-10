/**
 * Phase 45 Plan 01 (D-11/D-12/D-13/D-16/D-18): behavioural proof for the
 * backend-resident sequential winetricks install queue. Task 1 covers the
 * tracer's N=1 slice end to end (one spawn, the push sequence, the
 * game-status sequence). Task 2 adds the full guard/order/cancel/busy/
 * concurrency/remount/environment matrix, now that `assertWinetricksApplyPayload`
 * and the `winetricksEnvironment.ts` store exist and `apply` validates against
 * a real (mocked) catalog.
 *
 * NO REAL WINE OR WINETRICKS IS SPAWNED -- same mocked-spawn harness as
 * `winetricksInstallLifecycle.test.ts` (this suite calls through the real
 * `Winetricks.install`, so it needs the same mocks that file established to
 * import `tools/index.ts` successfully), plus a mock of `sendGameStatusUpdate`
 * from `../../utils` so this file can assert the `winetricks` -> `done`
 * status sequence the queue is responsible for.
 */
import { EventEmitter } from 'events'
import type { WinetricksComponent } from 'common/types'

// Declared before the imports: jest.mock factory bodies run at require time.
// `resetMocks: true` (src/backend/jest.config.js) strips implementations
// before every test, so every return value is assigned in `beforeEach`,
// never at module scope.
const mockSpawn = jest.fn()
const mockSendFrontendMessage = jest.fn()
const mockSendGameStatusUpdate = jest.fn()
const mockGetWineFromProton = jest.fn()
const mockExecAsync = jest.fn()

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: (...args: unknown[]) => mockSpawn(...args)
}))

jest.mock('../../storeManagers', () => ({
  libraryManagerMap: {
    gog: {
      getGame: () => ({
        getSettings: () => Promise.resolve({ wineVersion: {} })
      })
    }
  }
}))

jest.mock('../../launcher', () => ({
  runWineCommand: jest.fn(),
  setupEnvVars: () => ({}),
  setupWineEnvVars: () => ({}),
  validWine: () => Promise.resolve(true)
}))

jest.mock('../../ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
}))

jest.mock('../../utils', () => ({
  ...jest.requireActual('../../utils'),
  getWineFromProton: (...args: unknown[]) => mockGetWineFromProton(...args),
  execAsync: (...args: unknown[]) => mockExecAsync(...args),
  sendGameStatusUpdate: (...args: unknown[]) =>
    mockSendGameStatusUpdate(...args)
}))

jest.mock('backend/utils/compatibility_layers', () => ({
  getUmuPath: jest.fn(),
  isUmuSupported: () => Promise.resolve(false)
}))

jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  // `${toolsPath}/winetricks` "exists", so `Winetricks.download()` is never reached.
  existsSync: () => true
}))

jest.mock('backend/logger', () => {
  const { LogPrefix } = jest.requireActual('backend/logger/constants')
  return {
    LogPrefix,
    logError: jest.fn(),
    logInfo: jest.fn(),
    logWarning: jest.fn(),
    logDebug: jest.fn()
  }
})

import { Winetricks } from '../index'
import { WinetricksQueue } from '../winetricksQueue'
import {
  getEnvironmentReport,
  recordMissingDependencies,
  recordUnsupportedWine
} from '../winetricksEnvironment'

type FakeChild = EventEmitter & {
  stdout: EventEmitter & { setEncoding: () => void }
  stderr: EventEmitter & { setEncoding: () => void }
}

function makeFakeChild(): FakeChild {
  const stream = () =>
    Object.assign(new EventEmitter(), { setEncoding: () => undefined })
  return Object.assign(new EventEmitter(), {
    stdout: stream(),
    stderr: stream()
  })
}

let children: FakeChild[]

// One catalog fixture covering every verb used anywhere in this file --
// `apply()` now validates against `Winetricks.catalogFor`, mocked below so
// no test needs to simulate a real `winetricks list-all` spawn just to
// populate it.
const CATALOG: WinetricksComponent[] = [
  { verb: 'xact', title: 'XACT', category: 'dlls', cached: false },
  { verb: 'corefonts', title: 'Core fonts', category: 'fonts', cached: false },
  { verb: 'd3dx9', title: 'DirectX 9', category: 'dlls', cached: false },
  {
    verb: 'vcrun2019',
    title: 'Visual C++ 2019 libraries',
    category: 'dlls',
    cached: false
  }
]

beforeEach(() => {
  jest.useFakeTimers()
  children = []
  mockSpawn.mockImplementation(() => {
    const child = makeFakeChild()
    children.push(child)
    return child
  })
  mockGetWineFromProton.mockResolvedValue({
    winePrefix: '/fake/prefix',
    wineVersion: { bin: '/fake/wine/bin/wine', type: 'wine' }
  })
  // checkDependencies' `which` probes all succeed -- no "not installed!" lines in the log.
  mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })
  // `resetMocks: true` strips spy implementations between tests too --
  // re-established fresh every time, same idiom as `mockSpawn` above.
  jest.spyOn(Winetricks, 'catalogFor').mockResolvedValue(CATALOG)
})

afterEach(() => {
  jest.useRealTimers()
})

// Lets the awaited getSettings/validWine/isUmuSupported/getWineFromProton chain inside
// `runWithArgs` reach `spawn`.
async function flushMicrotasks(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

async function spawned(count: number): Promise<void> {
  await flushMicrotasks()
  if (children.length !== count) {
    throw new Error(
      `expected ${count} spawned winetricks child(ren), saw ${children.length} -- this test proves nothing`
    )
  }
}

interface QueuePushPayload {
  runner: string
  appName: string
  run: {
    outcomes: Record<string, string>
    status: string
    currentVerb: string
  } | null
  busy: boolean
  environment: {
    unsupportedWineVersion: string | null
    missingDependencies: string[]
  }
}

function queueChangedPushes(appName?: string): QueuePushPayload[] {
  const pushes = mockSendFrontendMessage.mock.calls
    .filter(([channel]) => channel === 'winetricksQueueChanged')
    .map(([, payload]) => payload as QueuePushPayload)
  return appName ? pushes.filter((push) => push.appName === appName) : pushes
}

function gameStatuses(): string[] {
  return mockSendGameStatusUpdate.mock.calls.map(
    ([payload]) => (payload as { status: string }).status
  )
}

// Resolves each spawned child in turn (close then exit, matching how
// `runWithArgs` listens) with the given exit code, flushing between each so
// the queue loop's `await Winetricks.install(...)` settles before the next
// verb's spawn is asserted.
async function finishChild(index: number, exitCode: number): Promise<void> {
  children[index].emit('close', exitCode)
  children[index].emit('exit', exitCode)
  await flushMicrotasks()
}

describe('WinetricksQueue.apply N=1 tracer (D-01/D-11)', () => {
  it('spawns exactly one winetricks process with argv tail ["-q", "vcrun2019"] and installs it to done', async () => {
    const result = await WinetricksQueue.apply('gog', 'game', ['vcrun2019'])
    expect(result.accepted).toBe(true)

    await spawned(1)
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const [, spawnArgs] = mockSpawn.mock.calls[0] as [string, string[]]
    expect(spawnArgs.slice(-2)).toEqual(['-q', 'vcrun2019'])

    await finishChild(0, 0)

    const pushes = queueChangedPushes('game')
    expect(pushes.length).toBeGreaterThan(0)
    // `apply()` pushes once itself before the loop starts (every outcome
    // still "pending" at that point) -- the "installing" transition is the
    // loop's own first push, not necessarily index 0.
    const installingPush = pushes.find(
      (push) => push.run?.outcomes.vcrun2019 === 'installing'
    )
    expect(installingPush).toBeDefined()
    const last = pushes[pushes.length - 1]
    expect(last.run?.status).toBe('done')
    expect(last.run?.outcomes.vcrun2019).toBe('installed')

    const statuses = gameStatuses()
    expect(statuses[0]).toBe('winetricks')
    expect(statuses[statuses.length - 1]).toBe('done')

    const finalState = WinetricksQueue.getState('gog', 'game')
    expect(finalState.run?.status).toBe('done')
    expect(finalState.run?.outcomes.vcrun2019).toBe('installed')
    expect(finalState.busy).toBe(false)
  })

  it('refuses a second apply while the first run is in flight, spawning nothing further', async () => {
    const first = await WinetricksQueue.apply('gog', 'busy-run-game', [
      'vcrun2019'
    ])
    expect(first.accepted).toBe(true)
    await spawned(1)

    const second = await WinetricksQueue.apply('gog', 'busy-run-game', ['xact'])
    expect(second).toEqual({
      accepted: false,
      reason: 'busy',
      detail: expect.any(String)
    })
    await flushMicrotasks()
    expect(children).toHaveLength(1)

    await finishChild(0, 0)
  })
})

describe('WinetricksQueue.apply order (D-11)', () => {
  it('spawns three children in exactly the given order, one at a time', async () => {
    const result = await WinetricksQueue.apply('gog', 'order-game', [
      'xact',
      'corefonts',
      'd3dx9'
    ])
    expect(result.accepted).toBe(true)

    await spawned(1)
    expect(mockSpawn.mock.calls[0][1].slice(-2)).toEqual(['-q', 'xact'])

    await finishChild(0, 0)
    await spawned(2)
    expect(mockSpawn.mock.calls[1][1].slice(-2)).toEqual(['-q', 'corefonts'])

    await finishChild(1, 0)
    await spawned(3)
    expect(mockSpawn.mock.calls[2][1].slice(-2)).toEqual(['-q', 'd3dx9'])

    await finishChild(2, 0)

    const state = WinetricksQueue.getState('gog', 'order-game')
    expect(state.run?.status).toBe('done')
    expect(state.run?.outcomes).toEqual({
      xact: 'installed',
      corefonts: 'installed',
      d3dx9: 'installed'
    })
  })
})

describe('WinetricksQueue.apply failure continues (D-12)', () => {
  it('a failing middle verb does not stop the remaining verbs', async () => {
    const result = await WinetricksQueue.apply('gog', 'failure-game', [
      'xact',
      'corefonts',
      'd3dx9'
    ])
    expect(result.accepted).toBe(true)

    await spawned(1)
    await finishChild(0, 0)
    await spawned(2)
    await finishChild(1, 1) // the second verb fails
    await spawned(3)
    await finishChild(2, 0)

    expect(mockSpawn).toHaveBeenCalledTimes(3)
    const state = WinetricksQueue.getState('gog', 'failure-game')
    expect(state.run?.status).toBe('done')
    expect(state.run?.outcomes).toEqual({
      xact: 'installed',
      corefonts: 'failed',
      d3dx9: 'installed'
    })
  })
})

describe('WinetricksQueue.cancelRemaining (D-13)', () => {
  it('cancels only the not-yet-started verbs; the in-progress verb finishes', async () => {
    const result = await WinetricksQueue.apply('gog', 'cancel-game', [
      'xact',
      'corefonts',
      'd3dx9'
    ])
    expect(result.accepted).toBe(true)
    await spawned(1)

    const afterCancel = WinetricksQueue.cancelRemaining('gog', 'cancel-game')
    expect(afterCancel.run?.outcomes.corefonts).toBe('cancelled')
    expect(afterCancel.run?.outcomes.d3dx9).toBe('cancelled')
    expect(afterCancel.run?.outcomes.xact).toBe('installing')

    await finishChild(0, 0)
    await flushMicrotasks()

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const state = WinetricksQueue.getState('gog', 'cancel-game')
    expect(state.run?.status).toBe('done')
    expect(state.run?.outcomes).toEqual({
      xact: 'installed',
      corefonts: 'cancelled',
      d3dx9: 'cancelled'
    })
  })
})

describe('WinetricksQueue busy refusal (D-13)', () => {
  it('refuses apply while a direct Winetricks.install call holds the single-flight slot', async () => {
    const directInstall = Winetricks.install(
      'gog',
      'direct-install-game',
      'xact'
    )
    await spawned(1)

    const refused = await WinetricksQueue.apply('gog', 'direct-install-game', [
      'corefonts'
    ])
    expect(refused).toEqual({
      accepted: false,
      reason: 'busy',
      detail: expect.any(String)
    })
    await flushMicrotasks()
    expect(children).toHaveLength(1)

    await finishChild(0, 0)
    await directInstall
  })
})

describe('WinetricksQueue.apply same-tick concurrency', () => {
  it('two apply calls issued before the catalog await resolves yield exactly one accepted run', async () => {
    const first = WinetricksQueue.apply('gog', 'concurrency-game', [
      'vcrun2019'
    ])
    const second = WinetricksQueue.apply('gog', 'concurrency-game', ['xact'])

    const [firstResult, secondResult] = await Promise.all([first, second])
    const accepted = [firstResult, secondResult].filter(
      (result) => result.accepted
    )
    const busy = [firstResult, secondResult].filter(
      (result) => !result.accepted && result.reason === 'busy'
    )
    expect(accepted).toHaveLength(1)
    expect(busy).toHaveLength(1)

    await spawned(1)
    await finishChild(0, 0)
  })
})

describe('WinetricksQueue.getState remount (D-18)', () => {
  it('a finished run is still readable after a remount, and an unrelated game sees no run', async () => {
    const result = await WinetricksQueue.apply('gog', 'remount-game', [
      'vcrun2019'
    ])
    expect(result.accepted).toBe(true)
    await spawned(1)
    await finishChild(0, 0)

    const state = WinetricksQueue.getState('gog', 'remount-game')
    expect(state.run?.status).toBe('done')
    expect(state.run?.outcomes.vcrun2019).toBe('installed')

    const otherState = WinetricksQueue.getState('gog', 'some-other-game')
    expect(otherState.run).toBeNull()
  })
})

describe('WinetricksQueue environment push (D-16)', () => {
  it('getState().environment matches the store, and a store change pushes fresh state with no run', async () => {
    const runner = 'gog'
    const appName = 'env-game'

    expect(WinetricksQueue.getState(runner, appName).environment).toEqual(
      getEnvironmentReport(runner, appName)
    )

    recordMissingDependencies(runner, appName, ['7z', 'cabextract'])
    await flushMicrotasks()

    const pushesAfterDeps = queueChangedPushes(appName)
    expect(pushesAfterDeps.length).toBeGreaterThan(0)
    const lastAfterDeps = pushesAfterDeps[pushesAfterDeps.length - 1]
    expect(lastAfterDeps.run).toBeNull()
    expect(lastAfterDeps.environment).toEqual(
      getEnvironmentReport(runner, appName)
    )
    expect(lastAfterDeps.environment.missingDependencies).toEqual([
      '7z',
      'cabextract'
    ])

    recordUnsupportedWine(runner, appName, 'wine-staging-9.0')
    await flushMicrotasks()

    const state = WinetricksQueue.getState(runner, appName)
    expect(state.environment).toEqual(getEnvironmentReport(runner, appName))
    expect(state.environment.unsupportedWineVersion).toBe('wine-staging-9.0')
    expect(state.environment.missingDependencies).toEqual(['7z', 'cabextract'])
  })
})
