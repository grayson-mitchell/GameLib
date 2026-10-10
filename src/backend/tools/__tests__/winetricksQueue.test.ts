/**
 * Phase 45 Plan 01 (D-11/D-12/D-13): behavioural proof for the backend-
 * resident sequential winetricks install queue. Task 1 covers the tracer's
 * N=1 slice end to end (one spawn, the push sequence, the game-status
 * sequence) plus the minimal busy guard already present in this task's
 * `apply`. Task 2 extends this file with the full guard/order/cancel/
 * environment matrix once `assertWinetricksApplyPayload` and the
 * environment store land.
 *
 * NO REAL WINE OR WINETRICKS IS SPAWNED -- same mocked-spawn harness as
 * `winetricksInstallLifecycle.test.ts` (this suite calls through the real
 * `Winetricks.install`, so it needs the same mocks that file established to
 * import `tools/index.ts` successfully), plus a mock of `sendGameStatusUpdate`
 * from `../../utils` so this file can assert the `winetricks` -> `done`
 * status sequence the queue is responsible for.
 */
import { EventEmitter } from 'events'

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

import { WinetricksQueue } from '../winetricksQueue'

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

function queueChangedPushes(): Array<{
  runner: string
  appName: string
  run: { outcomes: Record<string, string>; status: string } | null
}> {
  return mockSendFrontendMessage.mock.calls
    .filter(([channel]) => channel === 'winetricksQueueChanged')
    .map(([, payload]) => payload)
}

function gameStatuses(): string[] {
  return mockSendGameStatusUpdate.mock.calls.map(
    ([payload]) => (payload as { status: string }).status
  )
}

describe('WinetricksQueue.apply N=1 tracer (D-01/D-11)', () => {
  it('spawns exactly one winetricks process with argv tail ["-q", "vcrun2019"] and installs it to done', async () => {
    const result = WinetricksQueue.apply('gog', 'game', ['vcrun2019'])
    expect(result.accepted).toBe(true)

    await spawned(1)
    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const [, spawnArgs] = mockSpawn.mock.calls[0] as [string, string[]]
    expect(spawnArgs.slice(-2)).toEqual(['-q', 'vcrun2019'])

    children[0].emit('exit', 0)
    children[0].emit('close', 0)
    await flushMicrotasks()

    const pushes = queueChangedPushes()
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
    const first = WinetricksQueue.apply('gog', 'game', ['vcrun2019'])
    expect(first.accepted).toBe(true)
    await spawned(1)

    const second = WinetricksQueue.apply('gog', 'game', ['xact'])
    expect(second).toEqual({
      accepted: false,
      reason: 'busy',
      detail: expect.any(String)
    })
    await flushMicrotasks()
    expect(children).toHaveLength(1)

    children[0].emit('exit', 0)
    children[0].emit('close', 0)
    await flushMicrotasks()
  })
})
