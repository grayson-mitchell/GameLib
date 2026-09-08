// Phase 23.1 plan 05 (coordinator-directed fix): unit coverage for
// LogWriter's new `skipInitialArchive` constructor param, added so that
// `decompressWorker.ts` can call `backend/logger`'s `initHeadless(true)`
// from inside a spawned `worker_threads.Worker` without racing the sidecar
// main thread's own writer to "rotate" (rename) the shared, live
// `gamelib.log` on the worker's own first log write. See log_writer.ts's
// own doc comment on the constructor for the full multi-writer rationale.
//
// Deliberately constructs LogWriter with an EXPLICIT, isolated temp-file
// path (never `getLogFilePath({})` / `os.homedir()`), so this test never
// touches -- and is entirely independent of -- the containment mechanism
// `jest.setupContainment.ts` installs for the whole Backend project.

import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// `LogWriter#writeString()`'s pre-existing (not this plan's) "print this
// message only once when a new log file is created and it's not the
// general log" branch calls the module-level `logDebug` from `./index` --
// which dereferences that module's OWN `heroicLogWriter` singleton, never
// initialized in this unit test (deliberately: this test never calls
// `init()`/`initHeadless()`, to stay fully independent of
// `getLogFilePath({})` / `os.homedir()` / the containment mechanism this
// whole file avoids relying on). Mocked inertly here, same pattern this
// codebase already uses for `backend/logger` elsewhere (e.g.
// decompressPool.test.ts) -- unrelated to, and does not weaken, the
// `skipInitialArchive` behavior under test.
jest.mock('../index', () => ({
  getLogFilePath: jest.fn(
    () => '/__gamelib-logwriter-test-never-matches__/gamelib.log'
  ),
  logDebug: jest.fn()
}))

// Debug session `bootstrapwirings-log-drop`: widens the window between "the
// append syscall has created/extended the file on disk" and "the JS
// continuation that observes it has run". That gap is real and unavoidable
// with the genuine `fs/promises.appendFile` -- the write lands on a libuv
// threadpool thread, while `#wasWrittenTo` is only flipped once the event
// loop picks the completion up -- but its real width is set by OS scheduling,
// so pinning the invariant against it directly would be a race, not a test.
// Holding the resolution for a fixed span models the same ordering
// deterministically.
//
// Deliberately a plain module-level `let` plus a plain `async` function, never
// `jest.fn()`: this project's backend jest config sets `resetMocks: true`,
// which strips implementations supplied inside a `jest.mock` factory before
// every test (see the `heroicLogWriter`/`logDebug` mock above, which survives
// only because it is never asserted on).
let holdAppendFileResolutionMs = 0

jest.mock('fs/promises', () => {
  const actualPromises =
    jest.requireActual<typeof import('fs/promises')>('fs/promises')
  const { appendFileSync } = jest.requireActual<typeof import('fs')>('fs')
  return {
    ...actualPromises,
    appendFile: async (
      path: string,
      data: string,
      options?: Parameters<typeof appendFileSync>[2]
    ) => {
      appendFileSync(path, data, options)
      if (holdAppendFileResolutionMs > 0)
        await new Promise((resolve) =>
          setTimeout(resolve, holdAppendFileResolutionMs)
        )
    }
  }
})

import LogWriter from '../log_writer'

describe('LogWriter skipInitialArchive (Phase 23.1 plan 05)', () => {
  let dir: string
  let logPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-logwriter-test-'))
    logPath = join(dir, 'gamelib.log')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  test("default (skipInitialArchive unset/false): a pre-existing log file IS archived on the writer's first write", async () => {
    writeFileSync(logPath, 'pre-existing content from a prior session\n')

    const writer = new LogWriter(logPath, false, false)
    await writer.logInfo('first message')

    expect(existsSync(logPath + '.old')).toBe(true)
    expect(readFileSync(logPath + '.old', 'utf-8')).toContain(
      'pre-existing content from a prior session'
    )
    // The writer's own first write created a FRESH file at the original path.
    expect(existsSync(logPath)).toBe(true)
    expect(readFileSync(logPath, 'utf-8')).not.toContain('pre-existing content')
  })

  test("skipInitialArchive=true: a pre-existing (live, actively-written) log file is NOT archived on this writer's first write -- it appends instead", async () => {
    writeFileSync(
      logPath,
      'content written by another writer (e.g. the sidecar main thread) earlier in this same session\n'
    )

    const writer = new LogWriter(logPath, false, false, true)
    await writer.logInfo('a worker-thread log line')

    // No rotation happened -- exactly the multi-writer race this flag exists
    // to prevent (decompressWorker.ts's own writer must not clobber the
    // main thread's still-live file).
    expect(existsSync(logPath + '.old')).toBe(false)
    const content = readFileSync(logPath, 'utf-8')
    expect(content).toContain(
      'content written by another writer (e.g. the sidecar main thread) earlier in this same session'
    )
    expect(content).toContain('a worker-thread log line')
  })

  test('skipInitialArchive=true against a path with NO pre-existing file: still just creates and appends normally (no crash, no attempted rename of a nonexistent file)', async () => {
    expect(existsSync(logPath)).toBe(false)

    const writer = new LogWriter(logPath, false, false, true)
    await writer.logInfo('first-ever line, no prior file')

    expect(existsSync(logPath + '.old')).toBe(false)
    expect(readFileSync(logPath, 'utf-8')).toContain(
      'first-ever line, no prior file'
    )
  })
})

// Debug session `bootstrapwirings-log-drop` (2026-09-08).
//
// The three tests above every `await` their single `logInfo` call, which is
// precisely why this defect survived them: awaiting serializes the writes, so
// the rotate gate is only ever entered by one call at a time. NO production
// caller awaits a `logXXX()` -- they are all fire-and-forget -- so overlapping
// entry is the normal case at sidecar boot, not an exotic one.
describe('LogWriter concurrent first-write rotation (debug: bootstrapwirings-log-drop)', () => {
  let dir: string
  let logPath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-logwriter-race-'))
    logPath = join(dir, 'gamelib.log')
    holdAppendFileResolutionMs = 0
  })

  afterEach(() => {
    holdAppendFileResolutionMs = 0
    rmSync(dir, { recursive: true, force: true })
  })

  test('a second write entering while the first is still in flight must not archive away what the first already wrote', async () => {
    holdAppendFileResolutionMs = 50

    const writer = new LogWriter(logPath, false, false)

    // Fire-and-forget, exactly as every production call site does.
    const first = writer.logInfo('first line')

    // Park until the file physically exists. `first` has NOT resolved yet (its
    // append is held), so `#wasWrittenTo` is still false -- this is the window.
    const deadline = Date.now() + 2000
    while (!existsSync(logPath) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1))
    }
    expect(existsSync(logPath)).toBe(true)

    const second = writer.logInfo('second line')
    await Promise.all([first, second])

    // The rotate is a one-per-writer-lifetime concern (see log_writer.ts's
    // constructor docstring). A writer that has already created its file must
    // never rotate it again, whatever the interleaving.
    expect(existsSync(logPath + '.old')).toBe(false)
    const content = readFileSync(logPath, 'utf-8')
    expect(content).toContain('first line')
    expect(content).toContain('second line')
  })

  test('negative control: the same two writes, serialized by awaiting each, never rotate (proves the interleaving is what breaks it, not the held append)', async () => {
    holdAppendFileResolutionMs = 50

    const writer = new LogWriter(logPath, false, false)
    await writer.logInfo('first line')
    await writer.logInfo('second line')

    expect(existsSync(logPath + '.old')).toBe(false)
    const content = readFileSync(logPath, 'utf-8')
    expect(content).toContain('first line')
    expect(content).toContain('second line')
  })
})
