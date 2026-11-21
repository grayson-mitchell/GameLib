/**
 * Wait until a condition holds, bounded by elapsed REAL time, never by a count of turns.
 *
 * Why this exists. A counted `setImmediate` loop is not a time bound: 50 idle turns cover about
 * 1 ms of real time (82-20 measured 500 idle turns at 6.7 to 9.8 ms), and on a loaded machine the
 * real fs/promises I/O a test waits for can take far longer. This shape failed three times:
 * - G-82-2-r2 (Test run 44850161668, sharedRedistInstall.test.ts),
 * - G-82-2-r3 (Test run 44858803823, steamBridgeKnownFixes.test.ts),
 * - quick 261121-p6z (the bootstrap.test.ts legacy-zoom cleanup, which failed in the full local
 *   `pnpm test` run on 2026-11-21 with Expected false, received true).
 *
 * Why the clock is captured at module load. On jest 29.7 / @sinonjs/fake-timers 10.3, once fake
 * timers are installed, performance.now, Date.now and process.hrtime all return a FROZEN value, so
 * only a reference taken before installation keeps reading real time. A deadline read from the live
 * performance.now inside the loop would never expire under fake timers.
 *
 * Caller contract:
 * (a) Import this statically at the test file's top level, never through jest.resetModules, fresh()
 *     or a require inside a test body after fake timers are installed: the module would then
 *     capture the frozen clock.
 * (b) If the caller installs fake timers, it must leave setImmediate real (doNotFake includes
 *     'setImmediate').
 * (c) The caller sets a per-test timeout above the 15 s ceiling (30 s is the house value), so a
 *     condition that never holds fails at the caller's expect, not at jest's timeout.
 * (d) It returns rather than throws, so the caller's expect supplies the failure message.
 * (e) It is for "wait until X happens", not for negative "X has not happened yet" probes.
 */
const realNow = performance.now.bind(performance)

/** The default real-time ceiling. It sits inside the 30 s per-test timeout callers set. */
const DEFAULT_DEADLINE_MS = 15_000

export async function yieldUntil(
  done: () => boolean,
  deadlineMs = DEFAULT_DEADLINE_MS
): Promise<void> {
  const deadline = realNow() + deadlineMs
  while (!done() && realNow() < deadline)
    await new Promise((resolve) => setImmediate(resolve))
}
