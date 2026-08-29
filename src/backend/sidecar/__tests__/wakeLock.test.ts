/**
 * `powerSaveBlocker` wake-lock forwarding (Phase 35 Plan 08, D-08/D-05, REQ-35-06).
 *
 * What this file proves, and what it deliberately does NOT:
 *
 * PROVES -- that the JS seam forwards both assertion KINDS distinctly, that ids are unique, and
 * above all that `stop(id)` releases exactly the assertion `start` returned. That pairing is the
 * T-35-31 mitigation: an assertion whose `stop` never reaches it outlives the app and keeps the
 * user's machine awake with no UI left to release it, which on a laptop means an unattended
 * drain to zero. A no-op `stop` is a worse failure than the sleeping-mid-download one this plan
 * fixes, so it gets its own assertion rather than being implied by a passing `start` test.
 *
 * DOES NOT PROVE -- that any OS assertion is actually taken. `requestRustInvoke` is mocked here,
 * so everything below would pass against a Rust side that logged and did nothing. The Rust-side
 * pure logic (kind validation, the id registry) is covered by `main.rs`'s own `#[cfg(test)]`
 * module; the syscalls are verified live at this plan's Task 3 against `pmset -g assertions`.
 */

jest.mock('../sidecarRpc', () => ({
  requestRustInvoke: jest.fn()
}))

import { powerSaveBlocker } from '../../platform'
import { requestRustInvoke } from '../sidecarRpc'
import {
  RUST_INVOKE_CHANNELS,
  RUST_WAKE_LOCK_START,
  RUST_WAKE_LOCK_STOP
} from 'common/types/sidecarTransport'

const mockRequestRustInvoke = requestRustInvoke as jest.Mock

type ProgrammedOutcome =
  | { type: 'resolve'; value: unknown }
  | { type: 'reject'; error: Error }

let callLog: Array<{ channel: string; args: unknown[] }> = []
let warnSpy: jest.SpyInstance

/**
 * What the fake Rust side answers for the NEXT `wake_lock_start`. Modelled as a queue rather
 * than a single value so a test can hand out two DIFFERENT Rust ids and then assert which one
 * each `stop` released -- with one shared value, a `stop` that released the wrong assertion
 * would be indistinguishable from one that released the right one.
 */
let startResults: ProgrammedOutcome[] = []
let stopResult: ProgrammedOutcome = { type: 'resolve', value: null }

/** Lets the fire-and-forget `.then()`/`.catch()` chains inside start/stop settle. */
function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  callLog = []
  startResults = []
  stopResult = { type: 'resolve', value: null }
  warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {})

  // `resetMocks: true` (jest.config.js) wipes even a factory-supplied implementation before
  // every test, so the implementation is re-wired here -- the same gotcha `lifecycleStub.test.ts`
  // and `dialogStub.test.ts` both document.
  mockRequestRustInvoke.mockImplementation(
    (channel: string, args: unknown[]) => {
      callLog.push({ channel, args })
      const outcome =
        channel === RUST_WAKE_LOCK_START
          ? (startResults.shift() ?? { type: 'resolve', value: 1 })
          : stopResult
      return outcome.type === 'resolve'
        ? Promise.resolve(outcome.value)
        : Promise.reject(outcome.error)
    }
  )
})

afterEach(async () => {
  // The stub's `heldWakeLocks` map is module-scoped and this file never calls
  // `jest.resetModules()`, so a lock left held by one test would make the next test's
  // `isStarted()` assertion pass for the wrong reason. Drain it.
  while (powerSaveBlocker.isStarted()) {
    // `stop` on an id the map holds is what clears it; ids are handed out sequentially, so
    // sweeping a generous range is enough and costs nothing.
    for (let id = 1; id <= 64; id++) powerSaveBlocker.stop(id)
    await flushMicrotasks()
    break
  }
  warnSpy.mockRestore()
})

describe('powerSaveBlocker forwards to the Rust wake-lock channels (D-08, REQ-35-06)', () => {
  it('both wake-lock channels are members of RUST_INVOKE_CHANNELS', () => {
    // Non-vacuity guard: `requestRustInvoke` REFUSES to emit a frame for any channel outside
    // this allow-list (T-28-03) and rejects instead. Without this, every forwarding assertion
    // below could pass against a channel the transport would never actually send.
    const channels = RUST_INVOKE_CHANNELS as readonly string[]
    expect(channels).toEqual(
      expect.arrayContaining([RUST_WAKE_LOCK_START, RUST_WAKE_LOCK_STOP])
    )
  })

  it('start returns a real id, not the -1 no-op sentinel, and invokes the start channel exactly once', () => {
    startResults = [{ type: 'resolve', value: 100 }]

    const id = powerSaveBlocker.start('prevent-display-sleep')

    expect(typeof id).toBe('number')
    expect(id).not.toBe(-1)
    expect(callLog).toEqual([
      { channel: RUST_WAKE_LOCK_START, args: ['prevent-display-sleep'] }
    ])
  })

  it('start returns its id SYNCHRONOUSLY so launcher.ts assignment keeps working unchanged', () => {
    // `launcher.ts:190` does `powerDisplayId = powerSaveBlocker.start(...)` and real Electron's
    // API is synchronous. This is the assertion that pins why the id is minted JS-side at all:
    // if `start` returned a Promise, every call site would have had to become async.
    startResults = [{ type: 'resolve', value: 100 }]

    const id = powerSaveBlocker.start('prevent-display-sleep')

    expect(id).not.toBeInstanceOf(Promise)
    expect(Number.isInteger(id)).toBe(true)
  })

  it('start never returns 0, which launcher.ts would read as "no lock held"', () => {
    // `launcher.ts`'s re-entry guard is `if (!powerDisplayId)`. A 0 id would make it take a
    // second display assertion on every launch and leak the first -- a real T-35-31 leak
    // reachable from ordinary use, not a theoretical one.
    startResults = [
      { type: 'resolve', value: 100 },
      { type: 'resolve', value: 101 }
    ]

    expect(powerSaveBlocker.start('prevent-display-sleep')).not.toBe(0)
    expect(powerSaveBlocker.start('prevent-app-suspension')).not.toBe(0)
  })

  it('passes the OTHER kind through too -- both kinds reach Rust distinctly', () => {
    // THREAT T-35-32. A test exercising only one kind would pass against an implementation that
    // hardcoded it, and the collapse would ship: either the screen blanks during play or the
    // display is held awake through an eight-hour download.
    startResults = [
      { type: 'resolve', value: 100 },
      { type: 'resolve', value: 101 }
    ]

    powerSaveBlocker.start('prevent-display-sleep')
    powerSaveBlocker.start('prevent-app-suspension')

    expect(callLog).toEqual([
      { channel: RUST_WAKE_LOCK_START, args: ['prevent-display-sleep'] },
      { channel: RUST_WAKE_LOCK_START, args: ['prevent-app-suspension'] }
    ])
    expect(callLog[0].args[0]).not.toEqual(callLog[1].args[0])
  })

  it('two start calls return DIFFERENT ids', () => {
    startResults = [
      { type: 'resolve', value: 100 },
      { type: 'resolve', value: 101 }
    ]

    const first = powerSaveBlocker.start('prevent-display-sleep')
    const second = powerSaveBlocker.start('prevent-app-suspension')

    expect(first).not.toBe(second)
  })

  it('stop invokes the stop channel with exactly the assertion its own start created', async () => {
    // THE PAIRING ASSERTION -- what prevents an assertion leak (T-35-31).
    //
    // The release order here is load-bearing and was chosen after this test was caught passing
    // against a deliberately broken `stop` that released "whichever lock was added last".
    // Releasing in REVERSE order (newest first) cannot tell the two implementations apart: the
    // newest lock IS the caller's lock on the first call, and the only one left on the second.
    // Releasing the OLDEST first is the discriminating case -- a "release the last one"
    // implementation sends 101 where 100 is correct, and goes red on the first assertion.
    startResults = [
      { type: 'resolve', value: 100 },
      { type: 'resolve', value: 101 }
    ]

    const displayId = powerSaveBlocker.start('prevent-display-sleep')
    const systemId = powerSaveBlocker.start('prevent-app-suspension')
    await flushMicrotasks()

    callLog = []
    powerSaveBlocker.stop(displayId) // the OLDER lock, released FIRST
    await flushMicrotasks()
    expect(callLog).toEqual([{ channel: RUST_WAKE_LOCK_STOP, args: [100] }])

    callLog = []
    powerSaveBlocker.stop(systemId)
    await flushMicrotasks()
    expect(callLog).toEqual([{ channel: RUST_WAKE_LOCK_STOP, args: [101] }])
  })

  it('stop ignores an unknown id rather than forwarding a bogus release', async () => {
    // Releasing an id Rust never issued could, with an unlucky collision, release somebody
    // else's assertion. A double stop is the common real case: `launcher.ts` never clears
    // `powerDisplayId` after stopping it.
    startResults = [{ type: 'resolve', value: 100 }]

    const id = powerSaveBlocker.start('prevent-display-sleep')
    await flushMicrotasks()

    powerSaveBlocker.stop(id)
    await flushMicrotasks()
    callLog = []

    powerSaveBlocker.stop(id)
    powerSaveBlocker.stop(99999)
    await flushMicrotasks()

    expect(callLog).toEqual([])
  })

  it('isStarted is false before any start, true while one is held, and false after the matching stop', async () => {
    // D-05: the Phase 33 stub hardcoded `false`. A stale `false` is the lying accessor D-05
    // targets -- it reports nothing holding the machine awake while an assertion is live.
    startResults = [{ type: 'resolve', value: 100 }]

    expect(powerSaveBlocker.isStarted()).toBe(false)

    const id = powerSaveBlocker.start('prevent-display-sleep')
    await flushMicrotasks()
    expect(powerSaveBlocker.isStarted()).toBe(true)

    powerSaveBlocker.stop(id)
    await flushMicrotasks()
    expect(powerSaveBlocker.isStarted()).toBe(false)
  })

  it('isStarted stays true while ONE of two locks is released', async () => {
    // A `size > 0` check is correct; a boolean flag flipped by any stop would not be, and would
    // report the machine as free to sleep while a download was still running.
    startResults = [
      { type: 'resolve', value: 100 },
      { type: 'resolve', value: 101 }
    ]

    const displayId = powerSaveBlocker.start('prevent-display-sleep')
    const systemId = powerSaveBlocker.start('prevent-app-suspension')
    await flushMicrotasks()

    powerSaveBlocker.stop(displayId)
    await flushMicrotasks()
    expect(powerSaveBlocker.isStarted()).toBe(true)

    powerSaveBlocker.stop(systemId)
    await flushMicrotasks()
    expect(powerSaveBlocker.isStarted()).toBe(false)
  })

  it('a rejected requestRustInvoke does not throw out of start, and is logged', async () => {
    // Real Electron's start() is void-of-failure and callers do not guard it, so an unhandled
    // rejection here would take down a game launch. Logged, never silent, never thrown.
    startResults = [{ type: 'reject', error: new Error('rustInvoke: timeout') }]

    let id: number | undefined
    expect(() => {
      id = powerSaveBlocker.start('prevent-display-sleep')
    }).not.toThrow()
    await flushMicrotasks()

    expect(warnSpy).toHaveBeenCalledTimes(1)
    expect(String(warnSpy.mock.calls[0][0])).toContain(RUST_WAKE_LOCK_START)
    // The failed lock is not counted as held: Rust took no assertion, so claiming one would
    // make `isStarted()` lie in the opposite direction.
    expect(powerSaveBlocker.isStarted()).toBe(false)

    // ...and a later stop on that id is a quiet no-op, not an error against a lock Rust never took.
    callLog = []
    expect(() => powerSaveBlocker.stop(id as number)).not.toThrow()
    await flushMicrotasks()
    expect(callLog).toEqual([])
  })

  it('a stop that races an in-flight start still releases the assertion Rust ends up taking', async () => {
    // The narrow window the JS-side id opens: `stop` can land before `start`'s round-trip
    // resolves. Dropping the late Rust id on the floor there would leak an assertion with no id
    // left in the map to release it -- a T-35-31 leak that no other test in this file reaches,
    // because every other test flushes before stopping.
    startResults = [{ type: 'resolve', value: 100 }]

    const id = powerSaveBlocker.start('prevent-display-sleep')
    powerSaveBlocker.stop(id) // deliberately BEFORE the start round-trip settles
    await flushMicrotasks()

    expect(callLog).toEqual([
      { channel: RUST_WAKE_LOCK_START, args: ['prevent-display-sleep'] },
      { channel: RUST_WAKE_LOCK_STOP, args: [100] }
    ])
    expect(powerSaveBlocker.isStarted()).toBe(false)
  })
})
