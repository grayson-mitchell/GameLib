/**
 * `installed.json` watcher — sidecar port proof (Phase 35 plan 35-10, Task 1, REQ-35-16).
 *
 * WHAT THIS GUARDS. `src/backend/main.ts:1036-1048` registers a debounced
 * `watch(legendaryInstalled, ...)` that calls
 * `libraryManagerMap['legendary'].refreshInstalled()` 500ms after the last write. That block is
 * an Electron-only side effect: it lives at `main.ts` module scope, and plan 35-01's D-17 census
 * established ZERO import edges from the sidecar into `main.ts`, so under Tauri NOTHING ever
 * refreshed the in-memory `installedGames` map. The surfaced symptom was
 * `legendary sync-saves` computing a save path against a stale map and leaving the save-path
 * field empty (`[Legendary]: Unable to compute default save path <appName>`), which does not
 * self-heal on retry because nothing short of a full library refresh reloads the map.
 *
 * WHY THE TESTS ARE SHAPED THIS WAY. The failure mode of the ported defect is SILENCE — a
 * missing side effect emits nothing — so an assertion that merely proves the watcher was
 * *registered* would pass against a watcher that never fires. Every case below therefore drives
 * a REAL `fs.watch` against a REAL temp file and scores the observable EFFECT (refresh calls),
 * not the registration.
 *
 * THE DEBOUNCE IS THE POINT, AND IT IS ASSERTED IN BOTH DIRECTIONS. `main.ts`'s own comment
 * records why it exists: `watch` fires twice while legendary is still writing chunks, and an
 * un-debounced refresh parses a truncated file. A once-only guard would satisfy the
 * "two writes inside the window produce ONE refresh" case just as well as a debounce does, so
 * the complementary case — two writes SEPARATED by more than the window produce TWO refreshes —
 * is what distinguishes a real debounce from an accidental latch. Both are required.
 *
 * NO `jest.mock('os')` HERE, DELIBERATELY. This suite never resolves the real
 * `~/Library/Application Support/gamelib/legendaryConfig/` path because the watcher takes its
 * target path as a parameter; the temp-dir fixture is passed in explicitly. That also sidesteps
 * the recorded hazard that a per-suite `jest.mock('os')` is inert in this repo.
 *
 * THE REAL 500ms DELAY IS EXERCISED. The watcher exposes no debounce-override parameter, so the
 * production constant is what these timings run against — a test that shortened the window would
 * stop proving the shipped value.
 */

// ── storeManagers — the DEFAULT refresh target, asserted by its own case below ─────────────
const refreshInstalledMock = jest.fn()
const watcherDeps = {
  sendFrontendMessage: (...a: unknown[]) => sendFrontendMessageMock(...a),
  managers: {
    library: {
      legendary: {
        refreshInstalled: (...args: unknown[]) => refreshInstalledMock(...args)
      }
    }
  } as never,
  paths: { appFolder: '/nonexistent/app', toolsPath: '/nonexistent/tools' }
}

// ── logger — the ported `logInfo` line is asserted, not merely assumed present ─────────────
const logInfoMock = jest.fn()
jest.mock('../../logger', () => ({
  logInfo: (...args: unknown[]) => logInfoMock(...args),
  LogPrefix: { Legendary: 'Legendary' }
}))

// ── ipc — D-35-19-09 (live-gate criterion 14, UI half): the renderer notification this plan
// adds. Mocked so the tests below can observe WHETHER and WHEN it fires without a real
// sidecar transport. ─────────────────────────────────────────────────────────────────────────
const sendFrontendMessageMock = jest.fn()

// ── Imports (after mocks) ──────────────────────────────────────────────────────────────────
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  INSTALLED_JSON_REFRESH_DEBOUNCE_MS,
  createInstalledJsonWatcher,
  type InstalledJsonWatcher
} from '../installedJsonWatcher'
import { createClock } from '../../process/clock'
import { createFakeClock } from '../../testUtils/fakeClock'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Long enough for a debounce window to elapse AND for the refresh to have been observed. Kept
 * generous rather than tight: fs.watch delivery latency is not a property this suite is trying
 * to measure, and a tight margin would convert a slow CI box into a false failure.
 */
const AFTER_WINDOW = INSTALLED_JSON_REFRESH_DEBOUNCE_MS + 400

/** Comfortably INSIDE the debounce window, so a second write coalesces with the first. */
const INSIDE_WINDOW = 80

let watcher: InstalledJsonWatcher
let tempDir: string
let installedJson: string

beforeEach(() => {
  watcher = createInstalledJsonWatcher({ ...watcherDeps, clock: createClock() })
  tempDir = mkdtempSync(join(tmpdir(), 'gamelib-installedjson-watcher-'))
  installedJson = join(tempDir, 'installed.json')
  writeFileSync(installedJson, JSON.stringify({ Iris: { app_name: 'Iris' } }))
  refreshInstalledMock.mockClear()
  refreshInstalledMock.mockResolvedValue(undefined)
  logInfoMock.mockClear()
  sendFrontendMessageMock.mockClear()
})

afterEach(() => {
  watcher.stop()
  rmSync(tempDir, { recursive: true, force: true })
})

/** Writes distinct content each time so the platform cannot coalesce identical no-op writes. */
let writeCounter = 0
function touchInstalledJson(): void {
  writeCounter += 1
  writeFileSync(
    installedJson,
    JSON.stringify({ Iris: { app_name: 'Iris', rev: writeCounter } })
  )
}

describe('installed.json watcher — the debounce', () => {
  it('collapses two writes INSIDE the window into exactly ONE refresh', async () => {
    const refresh = jest.fn()
    expect(watcher.start({ path: installedJson, refresh })).toBe(true)
    await sleep(120)

    touchInstalledJson()
    await sleep(INSIDE_WINDOW)
    touchInstalledJson()

    await sleep(AFTER_WINDOW)

    // The load-bearing assertion. Without the clearTimeout/setTimeout pair this is >= 2, and
    // `LegendaryLibrary.refreshInstalled()` would be parsing a file legendary is mid-way
    // through writing (T-35-41).
    expect(refresh).toHaveBeenCalledTimes(1)
  }, 15000)

  it('does NOT collapse two writes SEPARATED by more than the window — two refreshes', async () => {
    const refresh = jest.fn()
    expect(watcher.start({ path: installedJson, refresh })).toBe(true)
    await sleep(120)

    touchInstalledJson()
    await sleep(AFTER_WINDOW)
    expect(refresh).toHaveBeenCalledTimes(1)

    touchInstalledJson()
    await sleep(AFTER_WINDOW)

    // The complementary case. A once-only latch would still read 1 here, and would have passed
    // the case above — so this is what proves the guard is a DEBOUNCE and not an accident.
    expect(refresh).toHaveBeenCalledTimes(2)
  }, 15000)
})

describe('installed.json watcher — the existsSync guard', () => {
  it('does not start, and never refreshes, when the file is absent', async () => {
    const refresh = jest.fn()
    const missing = join(tempDir, 'no-such-installed.json')

    expect(watcher.start({ path: missing, refresh })).toBe(false)
    expect(watcher.isActive()).toBe(false)

    // Creating the file afterwards must not retroactively arm anything — `main.ts` guards the
    // same way, and a fresh profile has no `installed.json` until the first legendary write.
    writeFileSync(missing, '{}')
    await sleep(AFTER_WINDOW)

    expect(refresh).not.toHaveBeenCalled()
  }, 15000)
})

describe('installed.json watcher — teardown', () => {
  it('stops refreshing after watcher.stop()', async () => {
    const refresh = jest.fn()
    watcher.start({ path: installedJson, refresh })
    await sleep(120)

    watcher.stop()
    expect(watcher.isActive()).toBe(false)

    touchInstalledJson()
    await sleep(AFTER_WINDOW)

    expect(refresh).not.toHaveBeenCalled()
  }, 15000)

  it('drops a refresh already pending inside the debounce window when stopped', async () => {
    const refresh = jest.fn()
    watcher.start({ path: installedJson, refresh })
    await sleep(120)

    touchInstalledJson()
    await sleep(INSIDE_WINDOW)
    // Stop while the debounce timer is still armed. Without clearTimeout in the teardown the
    // queued refresh still lands after the watcher is nominally closed.
    watcher.stop()

    await sleep(AFTER_WINDOW)

    expect(refresh).not.toHaveBeenCalled()
  }, 15000)

  it('refuses a second start rather than opening a second watch handle (T-35-42)', async () => {
    const refresh = jest.fn()
    expect(watcher.start({ path: installedJson, refresh })).toBe(true)
    // THE DETECTING ASSERTION IS THIS RETURN VALUE, and the distinction matters — it was
    // established by deliberately deleting the idempotence guard and re-running.
    //
    // A refresh-COUNT assertion cannot see watcher stacking here: two handles share one
    // `refreshTimeout`, so the second callback merely re-arms the debounce the first one set and
    // the burst still collapses to exactly ONE refresh. The count below therefore reads 1 both
    // when the guard is present and when it is absent, and it is retained only as a
    // non-vacuity anchor, NOT as the T-35-42 signal.
    //
    // What deleting the guard actually produces is a LEAKED libuv handle: the second
    // `watch()` overwrites `activeWatcher`, so `watcher.stop()` can never close the
    // first, and the whole jest worker then parks in `uv__io_poll` and never exits. That is the
    // real-world shape of "one write costs N refreshes" accumulating across library
    // re-initialisations — it hangs rather than failing cleanly, which is precisely why the
    // guard is asserted directly instead of through its downstream effect.
    expect(watcher.start({ path: installedJson, refresh })).toBe(false)
    await sleep(120)

    touchInstalledJson()
    await sleep(AFTER_WINDOW)

    expect(refresh).toHaveBeenCalledTimes(1)
  }, 15000)
})

describe('installed.json watcher — the ported production wiring', () => {
  it('defaults its refresh to libraryManagerMap.legendary.refreshInstalled()', async () => {
    // No `refresh` override: this is the case that proves the port targets the SAME function
    // `main.ts:1046` calls. Every other case injects a spy and would pass against a watcher
    // wired to nothing at all.
    expect(watcher.start({ path: installedJson })).toBe(true)
    await sleep(120)

    touchInstalledJson()
    await sleep(AFTER_WINDOW)

    expect(refreshInstalledMock).toHaveBeenCalledTimes(1)
  }, 15000)

  it('emits the ported logInfo line on the Legendary prefix', async () => {
    // The original defect class is silence. A refresh that happens without the log line leaves
    // the live gate with no discharge signal — `35-AB-RETEST.md` item 2 names the presence of
    // this exact string as the observable that would have settled the item.
    watcher.start({ path: installedJson })
    await sleep(120)

    touchInstalledJson()
    await sleep(AFTER_WINDOW)

    expect(logInfoMock).toHaveBeenCalledWith(
      'installed.json updated, refreshing library',
      'Legendary'
    )
  }, 15000)

  it('pins the debounce delay to the value main.ts ships', () => {
    // `main.ts:1047` passes 500 to setTimeout. Divergence here would be a silent behaviour
    // change smuggled into a port.
    expect(INSTALLED_JSON_REFRESH_DEBOUNCE_MS).toBe(500)
  })
})

// D-35-19-09 (live-gate criterion 14, UI half): before this plan, `refreshInstalled()` rebuilt
// the in-memory map but nothing told the renderer, so the Library view never re-rendered without
// a manual refresh even though the backend state was already correct. These cases target the
// DEFAULT refresh path exclusively — `sendFrontendMessage` lives inside the module's own default
// arrow, not inside a caller-supplied `refresh` override, so every case here omits `refresh` and
// asserts against `refreshInstalledMock`/`sendFrontendMessageMock` instead of an injected spy.
//
// RED-PROOF (case a): commenting out this module's `sendFrontendMessage('refreshLibrary',
// 'legendary')` line and re-running case (a) alone failed with:
//   expect(jest.fn()).toHaveBeenCalledTimes(1)
//   Expected number of calls: 1
//   Received number of calls: 0
// Restoring the line returned it to green. See the SUMMARY for the full captured output.
describe('installed.json watcher — the renderer refresh signal (D-35-19-09)', () => {
  it('(a) sends refreshLibrary/legendary exactly once after refreshInstalled resolves', async () => {
    expect(watcher.start({ path: installedJson })).toBe(true)
    await sleep(120)

    touchInstalledJson()
    await sleep(AFTER_WINDOW)

    expect(refreshInstalledMock).toHaveBeenCalledTimes(1)
    expect(sendFrontendMessageMock).toHaveBeenCalledTimes(1)
    expect(sendFrontendMessageMock).toHaveBeenCalledWith(
      'refreshLibrary',
      'legendary'
    )
  }, 15000)

  it('(b) sends refreshLibrary AFTER refreshInstalled resolves, not alongside it', async () => {
    const order: string[] = []
    refreshInstalledMock.mockImplementation(async () => {
      // A delay here is the point: if the send were racing the refresh rather than awaiting
      // it, this artificial delay would let the send's order-record land FIRST.
      await sleep(50)
      order.push('refreshInstalled')
    })
    sendFrontendMessageMock.mockImplementation(() => {
      order.push('sendFrontendMessage')
    })

    expect(watcher.start({ path: installedJson })).toBe(true)
    await sleep(120)

    touchInstalledJson()
    await sleep(AFTER_WINDOW)

    expect(order).toEqual(['refreshInstalled', 'sendFrontendMessage'])
  }, 15000)

  it('(c) sends refreshLibrary ZERO times when refreshInstalled rejects', async () => {
    // A rejecting refresh propagates exactly as it did before this plan (no catch was added
    // here — see this module's own comment on why one must not be). That is deliberate
    // production behaviour, not a leak this test should fail on: the promise returned by the
    // module's internal `refresh` arrow is never stored by anything (its caller is
    // `setTimeout(refresh, ...)`, which discards a callback's return value), so it rejects
    // unhandled by construction. Jest circus fails the currently-running test on any
    // unhandled rejection observed during it, which would otherwise fail THIS case for the
    // exact behaviour it exists to prove.
    //
    // Rather than fight jest's process-level listener (later found NOT to be a plain
    // `process.on('unhandledRejection', ...)` registration jest itself removes/restores
    // cleanly), this wraps the real `setTimeout` for the duration of the case only and
    // attaches a `.catch()` directly to the SPECIFIC promise the debounce callback returns —
    // the same promise that would otherwise go unhandled. This changes nothing about
    // production behaviour (the module still receives no catch, and the rejection still
    // happens); it only gives THIS TEST a handle to observe-and-swallow it, exactly once,
    // scoped to calls made while this spy is installed.
    // The boot clock discards a callback's return value (as `setTimeout` did), so this test's
    // clock wraps the real one and attaches a `.catch()` to the promise the debounce callback
    // returns, the same promise that would otherwise go unhandled.
    const realClock = createClock()
    watcher = createInstalledJsonWatcher({
      ...watcherDeps,
      clock: {
        ...realClock,
        setTimeout: (fn, ms, opts) =>
          realClock.setTimeout(
            () => {
              const result = fn() as unknown
              if (
                result &&
                typeof (result as Promise<unknown>).catch === 'function'
              ) {
                ;(result as Promise<unknown>).catch(() => {
                  /* expected: refreshInstalledMock rejects below; production adds no catch
                     here by design -- this only observes the rejection in the test process. */
                })
              }
            },
            ms,
            opts
          )
      }
    })

    try {
      refreshInstalledMock.mockRejectedValueOnce(
        new Error('malformed installed.json')
      )

      expect(watcher.start({ path: installedJson })).toBe(true)
      await sleep(120)

      touchInstalledJson()
      await sleep(AFTER_WINDOW)

      expect(refreshInstalledMock).toHaveBeenCalledTimes(1)
      expect(sendFrontendMessageMock).not.toHaveBeenCalled()
    } finally {
      watcher.stop()
    }
  }, 15000)

  it('(d) collapses two writes INSIDE the window into exactly ONE send, same as the refresh', async () => {
    expect(watcher.start({ path: installedJson })).toBe(true)
    await sleep(120)

    touchInstalledJson()
    await sleep(INSIDE_WINDOW)
    touchInstalledJson()

    await sleep(AFTER_WINDOW)

    expect(refreshInstalledMock).toHaveBeenCalledTimes(1)
    expect(sendFrontendMessageMock).toHaveBeenCalledTimes(1)
  }, 15000)
})

// 66.4-16 (D-05): the instance owns its handle and its debounce timer -- asserted with a fake
// `fs.watch` and a fake clock, so no real file or wall time is involved.
describe('installed.json watcher -- instance state (66.4-16)', () => {
  function fakeWatch() {
    const handle = { unref: jest.fn(), close: jest.fn() }
    let listener: (() => void) | undefined
    const watch = jest.fn((_target: string, l: () => void) => {
      listener = l
      return handle as never
    })
    return { handle, watch, fire: () => listener?.() }
  }

  it('start() opens one unref d watcher; the debounce runs on the clock; stop() closes and clears', () => {
    const clock = createFakeClock()
    const fw = fakeWatch()
    const refresh = jest.fn()
    const w = createInstalledJsonWatcher({
      ...watcherDeps,
      clock,
      watch: fw.watch,
      exists: () => true
    })
    expect(w.start({ path: '/x/installed.json', refresh })).toBe(true)
    expect(w.start({ path: '/x/installed.json', refresh })).toBe(false)
    expect(fw.watch).toHaveBeenCalledTimes(1)
    expect(fw.handle.unref).toHaveBeenCalledTimes(1)
    clock.assertNoKeepAlive()

    fw.fire()
    clock.advance(INSTALLED_JSON_REFRESH_DEBOUNCE_MS - 1)
    fw.fire()
    expect(clock.pendingCount()).toBe(1)
    clock.advance(INSTALLED_JSON_REFRESH_DEBOUNCE_MS - 1)
    expect(refresh).not.toHaveBeenCalled()
    clock.advance(1)
    expect(refresh).toHaveBeenCalledTimes(1)

    fw.fire()
    expect(clock.pendingCount()).toBe(1)
    w.stop()
    expect(clock.pendingCount()).toBe(0)
    expect(fw.handle.close).toHaveBeenCalledTimes(1)
    expect(w.isActive()).toBe(false)
  })

  it('does not open a watcher for a missing file, and two instances hold their own', () => {
    const a = createInstalledJsonWatcher({
      ...watcherDeps,
      clock: createFakeClock(),
      watch: fakeWatch().watch,
      exists: () => false
    })
    expect(a.start({ path: '/missing' })).toBe(false)
    expect(a.isActive()).toBe(false)

    const fw = fakeWatch()
    const b = createInstalledJsonWatcher({
      ...watcherDeps,
      clock: createFakeClock(),
      watch: fw.watch,
      exists: () => true
    })
    const c = createInstalledJsonWatcher({
      ...watcherDeps,
      clock: createFakeClock(),
      watch: fakeWatch().watch,
      exists: () => true
    })
    expect(b.start({ path: '/x' })).toBe(true)
    expect(c.isActive()).toBe(false)
    expect(c.start({ path: '/x' })).toBe(true)
    b.stop()
    expect(c.isActive()).toBe(true)
    c.stop()
  })
})
