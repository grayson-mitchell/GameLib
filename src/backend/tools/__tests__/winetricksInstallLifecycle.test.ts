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
const mockRecordMissingDependencies = jest.fn()
const mockRecordUnsupportedWine = jest.fn()

jest.mock('../winetricksEnvironment', () => ({
  recordMissingDependencies: (...args: unknown[]) =>
    mockRecordMissingDependencies(...args),
  recordUnsupportedWine: (...args: unknown[]) =>
    mockRecordUnsupportedWine(...args)
}))

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

import type { WinetricksLogLine } from 'common/types'
import { logDebug, logError } from 'backend/logger'
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
  lines?: WinetricksLogLine[]
  percent?: number
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
    children[0].emit('close', 0)
    await first
    expect(mockSendFrontendMessage).toHaveBeenLastCalledWith(
      'installing-winetricks-component',
      ''
    )

    // Once the first install has finished, a new one is accepted again.
    const third = Winetricks.install('gog', 'game', 'xact')
    await spawned(2)
    children[1].emit('exit', 0)
    children[1].emit('close', 0)
    await third
  })
})

describe('non-install runs do not borrow the installing verb (list todo)', () => {
  // The sibling "GUI run" case (`Winetricks.run('gog', 'game')`, proving progress/Done events
  // mid-install carried `installingComponent ''`) is deleted here — Phase 45 D-17 removed
  // `Winetricks.run` (and the `['-q', '--gui']` call it made) entirely, so there is no GUI
  // branch left to misattribute the installing verb. The list-all case below is kept; it proves
  // the same non-vacuity for `Winetricks.listAvailable`, the other non-install caller.
  it('a list-all run mid-install sends its Done untagged', async () => {
    const install = Winetricks.install('gog', 'game', 'dotnet48')
    await spawned(1)

    const list = Winetricks.listAvailable('gog', 'game')
    await spawned(2)
    children[1].emit('exit', 0)
    children[1].emit('close', 0)
    await list

    const done = progressEvents().filter((p) => p.messages[0] === 'Done')
    expect(done).toHaveLength(1)
    expect(done[0].installingComponent).toBe('')

    children[0].emit('exit', 0)
    children[0].emit('close', 0)
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
    children[0].emit('close', 1)
    await install

    const events = progressEvents()
    const doneIndex = events.findIndex((p) => p.messages[0] === 'Done')
    expect(doneIndex).toBeGreaterThan(0)
    const flushed = events.slice(0, doneIndex)
    expect(flushed.flatMap((p) => p.messages)).toContain(
      'warning: Some download err happened'
    )
    for (const payload of flushed) {
      expect(payload.installingComponent).toBe('vcrun2019')
    }
  })

  it('output that arrives after exit but before close still lands before Done', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    // 'exit' can fire while stdio is still draining; the abort line arrives after it.
    children[0].emit('exit', 1)
    children[0].stderr.emit('data', 'late abort err line\n')
    children[0].emit('close', 1)
    await install

    const events = progressEvents()
    const doneIndex = events.findIndex((p) => p.messages[0] === 'Done')
    expect(events.slice(0, doneIndex).flatMap((p) => p.messages)).toContain(
      'late abort err line'
    )
  })

  it('sends Done from the exit fallback when close never arrives', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    // A lingering wineserver can hold the pipes open, so 'close' never fires.
    children[0].emit('exit', 0)
    expect(progressEvents().some((p) => p.messages[0] === 'Done')).toBe(false)
    jest.advanceTimersByTime(2000)
    await install

    const done = progressEvents().filter((p) => p.messages[0] === 'Done')
    expect(done).toEqual([
      { messages: ['Done'], installingComponent: 'vcrun2019', failed: false }
    ])
  })

  it('a non-zero exit marks Done as failed for the verb', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)
    children[0].emit('exit', 1)
    children[0].emit('close', 1)
    await install

    const done = progressEvents().filter((p) => p.messages[0] === 'Done')
    expect(done).toHaveLength(1)
    expect(done[0]).toMatchObject({
      messages: ['Done'],
      installingComponent: 'vcrun2019',
      failed: true
    })
  })

  it('a zero exit marks Done as not failed', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)
    children[0].emit('exit', 0)
    children[0].emit('close', 0)
    await install

    const done = progressEvents().filter((p) => p.messages[0] === 'Done')
    expect(done).toEqual([
      { messages: ['Done'], installingComponent: 'vcrun2019', failed: false }
    ])
  })

  it('a non-zero exit appends a synthetic error line naming the exit code to the Done lines', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)
    children[0].emit('exit', 3)
    children[0].emit('close', 3)
    await install

    const done = progressEvents().filter((p) => p.messages[0] === 'Done')
    expect(done).toHaveLength(1)
    const lines = done[0].lines ?? []
    expect(lines[lines.length - 1]).toEqual({
      kind: 'error',
      text: expect.stringContaining('3')
    })
  })
})

const CURL_ROW_42 =
  ' 42 12.3M   42 5229k    0     0  1234k      0  0:00:10  0:00:04  0:00:06 1233k'
const CURL_ROW_60 =
  ' 60 12.3M   60 7400k    0     0  1234k      0  0:00:10  0:00:06  0:00:04 1233k'

async function finishInstall(install: Promise<unknown>): Promise<void> {
  children[children.length - 1].emit('exit', 0)
  children[children.length - 1].emit('close', 0)
  await install
}

describe('output is classified at its source (D-15)', () => {
  it('never logs wine fixme/err noise or a curl meter row at ERROR, and reports the percent', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    children[0].stderr.emit(
      'data',
      `0024:fixme:ntdll:NtQuerySystemInformation info_class 1\n` +
        `002c:err:module:import_dll Library X.dll not found\n` +
        `fixme:heap:RtlSetHeapInformation stub\n` +
        `${CURL_ROW_42}\r`
    )
    jest.advanceTimersByTime(1000)

    expect(logError).not.toHaveBeenCalled()
    expect(logDebug).toHaveBeenCalledTimes(3)
    const flush = progressEvents().find((p) => (p.lines ?? []).length > 0)
    expect(flush).toBeDefined()
    expect(flush?.percent).toBe(42)
    expect(
      (flush?.lines ?? []).filter((line) => line.kind === 'progress')
    ).toHaveLength(1)

    await finishInstall(install)
  })

  it('collapses two meter rows inside one tick into one progress line carrying the latest percent', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    children[0].stderr.emit('data', `${CURL_ROW_42}\r${CURL_ROW_60}\r`)
    jest.advanceTimersByTime(1000)

    const flush = progressEvents().find((p) => (p.lines ?? []).length > 0)
    const progress = (flush?.lines ?? []).filter(
      (line) => line.kind === 'progress'
    )
    expect(progress).toHaveLength(1)
    expect(progress[0]).toMatchObject({ percent: 60 })
    expect(flush?.percent).toBe(60)

    await finishInstall(install)
  })

  it('never forwards the raw curl meter as a message', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    children[0].stderr.emit('data', `${CURL_ROW_42}\r`)
    jest.advanceTimersByTime(1000)

    for (const payload of progressEvents()) {
      expect(payload.messages.join('\n')).not.toContain('12.3M')
    }

    await finishInstall(install)
  })

  it('reassembles a line split across two chunks before classifying it', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    children[0].stderr.emit('data', '002c:err:mod')
    children[0].stderr.emit('data', 'ule:import_dll gone\n')

    expect(logError).not.toHaveBeenCalled()
    expect(logDebug).toHaveBeenCalledTimes(1)

    await finishInstall(install)
  })

  it('flushes an unterminated final line on close', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)

    children[0].stderr.emit(
      'data',
      'Note: command x returned status 1. Aborting.'
    )
    expect(logError).not.toHaveBeenCalled()
    children[0].emit('exit', 1)
    children[0].emit('close', 1)
    await install

    expect(logError).toHaveBeenCalledTimes(1)
  })

  it('keeps list-all stdout intact for the parser and does not classify it', async () => {
    const chunk = '===== dlls =====\nvcrun2019 Visual C++ 2019 libraries\n'
    const run = Winetricks.runWithArgs('gog', 'game', ['list-all'], true)
    await spawned(1)

    children[0].stdout.emit('data', chunk)
    children[0].emit('exit', 0)
    children[0].emit('close', 0)

    await expect(run).resolves.toEqual([chunk])
    expect(logDebug).not.toHaveBeenCalled()
  })
})

describe('environment recording (D-16)', () => {
  it('records the wine version from the unsupported-wine notice during a list-all run', async () => {
    const run = Winetricks.runWithArgs('gog', 'game', ['list-all'], true)
    await spawned(1)

    children[0].stderr.emit(
      'data',
      'warning: Your version of wine 7.7 is no longer supported upstream. You should upgrade to 8.x\n'
    )
    expect(mockRecordUnsupportedWine).toHaveBeenCalledWith('gog', 'game', '7.7')

    children[0].emit('exit', 0)
    children[0].emit('close', 0)
    await run
  })

  it('records the sorted missing subset of the five host dependencies', async () => {
    mockExecAsync.mockImplementation((command: string) =>
      /which (zenity|7z)$/.test(command)
        ? Promise.reject(new Error('not found'))
        : Promise.resolve({ stdout: '', stderr: '' })
    )
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)
    await flushMicrotasks(60)

    expect(mockRecordMissingDependencies).toHaveBeenCalledTimes(1)
    expect(mockRecordMissingDependencies).toHaveBeenCalledWith('gog', 'game', [
      '7z',
      'zenity'
    ])

    jest.advanceTimersByTime(1000)
    const lines = progressEvents().flatMap((p) => p.lines ?? [])
    expect(lines).toContainEqual({
      kind: 'environment',
      text: expect.stringContaining('zenity not installed!')
    })

    await finishInstall(install)
  })

  it('clears the record with an empty list when every dependency is present', async () => {
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)
    await flushMicrotasks(60)

    expect(mockRecordMissingDependencies).toHaveBeenCalledWith(
      'gog',
      'game',
      []
    )

    await finishInstall(install)
  })

  it('a probe that throws synchronously counts as missing and never rejects the run', async () => {
    mockExecAsync.mockImplementation(() => {
      throw new Error('spawn blew up')
    })
    const install = Winetricks.install('gog', 'game', 'vcrun2019')
    await spawned(1)
    await flushMicrotasks(60)

    expect(mockRecordMissingDependencies).toHaveBeenCalledWith('gog', 'game', [
      '7z',
      'cabextract',
      'curl',
      'unzip',
      'zenity'
    ])

    await expect(finishInstall(install)).resolves.toBeUndefined()
  })
})

describe('onLine hook', () => {
  it('is invoked for every classified line including the synthetic exit line', async () => {
    const seen: WinetricksLogLine[] = []
    const install = Winetricks.install('gog', 'game', 'vcrun2019', (line) =>
      seen.push(line)
    )
    await spawned(1)

    children[0].stderr.emit('data', 'Executing w_do_call vcrun2019\n')
    children[0].emit('exit', 2)
    children[0].emit('close', 2)
    await install

    expect(seen[0]).toEqual({
      kind: 'info',
      text: 'Executing w_do_call vcrun2019'
    })
    expect(seen[seen.length - 1]).toEqual({
      kind: 'error',
      text: expect.stringContaining('2')
    })
  })
})
