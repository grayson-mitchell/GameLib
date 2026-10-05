/**
 * Behavioural tests for the `Winetricks.install` / `Winetricks.runWithArgs` event lifecycle
 * (the three 2026-10-05 winetricks todos: double-install, GUI/list misattribution, and the
 * failed-install-never-reaches-Failed defect).
 *
 * NO REAL WINE OR WINETRICKS IS SPAWNED. `child_process.spawn` is replaced by a factory that
 * hands back an `EventEmitter` stand-in with `stdout`/`stderr` emitters, and each test drives
 * that stand-in's `data`/`exit` events by hand. The 1000ms progress interval runs under jest's
 * modern fake timers, so nothing here waits on a real clock.
 *
 * Importability follows `runWineCommandOnGameGuard.test.ts`'s measured precedent: mocking
 * `'../../storeManagers'` and `'../../launcher'` is enough for `tools/index.ts` to load.
 */
import { EventEmitter } from 'events'

// Declared before the imports: jest.mock factory bodies run at require time. `resetMocks: true`
// (src/backend/jest.config.js) strips implementations before every test, so every return value
// is assigned in `beforeEach`, never at module scope.
const mockSpawn = jest.fn()
const mockSendFrontendMessage = jest.fn()
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
  execAsync: (...args: unknown[]) => mockExecAsync(...args)
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

type ProgressPayload = {
  messages: string[]
  installingComponent: string
  failed?: boolean
}

function progressEvents(): ProgressPayload[] {
  return mockSendFrontendMessage.mock.calls
    .filter(([channel]) => channel === 'progressOfWinetricks')
    .map(([, payload]) => payload as ProgressPayload)
}

describe('Winetricks.install single-flight (double-click todo)', () => {
  it('a second install while one is running does not spawn a second winetricks on the prefix', async () => {
    const first = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    const second = Winetricks.install('gog', 'game', 'vcrun2019')
    await flushMicrotasks()
    expect(children).toHaveLength(1)
    // The refused call must not clear the running install's state either.
    expect(mockSendFrontendMessage).not.toHaveBeenCalledWith(
      'installing-winetricks-component',
      ''
    )
    await second

    children[0].emit('exit', 0)
    await first
    expect(mockSendFrontendMessage).toHaveBeenLastCalledWith(
      'installing-winetricks-component',
      ''
    )

    // Once the first install has finished, a new one is accepted again.
    const third = Winetricks.install('gog', 'game', 'xact')
    await spawned(2)
    children[1].emit('exit', 0)
    await third
  })
})

describe('non-install runs do not borrow the installing verb (GUI/list todo)', () => {
  it("a GUI run's progress and Done events started mid-install carry installingComponent ''", async () => {
    const install = Winetricks.install('gog', 'game', 'dotnet48')
    await spawned(1)

    const gui = Winetricks.run('gog', 'game')
    await spawned(2)

    children[1].stderr.emit('data', 'fixme: some gui err line\n')
    jest.advanceTimersByTime(1000)
    children[1].emit('exit', 0)
    await gui

    const guiEvents = progressEvents()
    expect(guiEvents.length).toBeGreaterThanOrEqual(2)
    for (const payload of guiEvents) {
      expect(payload.installingComponent).toBe('')
    }

    children[0].emit('exit', 0)
    await install
  })

  it('a list-all run mid-install sends its Done untagged', async () => {
    const install = Winetricks.install('gog', 'game', 'dotnet48')
    await spawned(1)

    const list = Winetricks.listAvailable('gog', 'game')
    await spawned(2)
    children[1].emit('exit', 0)
    await list

    const done = progressEvents().filter((p) => p.messages[0] === 'Done')
    expect(done).toHaveLength(1)
    expect(done[0].installingComponent).toBe('')

    children[0].emit('exit', 0)
    await install
  })
})

describe('exit flushes buffered lines and reports failure (failed-install todo)', () => {
  it('lines buffered since the last tick are sent before Done, tagged with the verb', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    // Printed and exited inside the same 1s interval -- no tick ever fires.
    children[0].stderr.emit('data', 'warning: Some download err happened\n')
    children[0].emit('exit', 1)
    await install

    const events = progressEvents()
    const doneIndex = events.findIndex((p) => p.messages[0] === 'Done')
    expect(doneIndex).toBeGreaterThan(0)
    const flushed = events.slice(0, doneIndex)
    expect(flushed.flatMap((p) => p.messages)).toContain(
      'warning: Some download err happened\n'
    )
    for (const payload of flushed) {
      expect(payload.installingComponent).toBe('vcrun2019')
    }
  })

  it('a non-zero exit marks Done as failed for the verb', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)
    children[0].emit('exit', 1)
    await install

    const done = progressEvents().filter((p) => p.messages[0] === 'Done')
    expect(done).toEqual([
      { messages: ['Done'], installingComponent: 'vcrun2019', failed: true }
    ])
  })

  it('a zero exit marks Done as not failed', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)
    children[0].emit('exit', 0)
    await install

    const done = progressEvents().filter((p) => p.messages[0] === 'Done')
    expect(done).toEqual([
      { messages: ['Done'], installingComponent: 'vcrun2019', failed: false }
    ])
  })
})
