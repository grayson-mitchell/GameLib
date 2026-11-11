/**
 * Negative-direction proof for Block F (todo 2026-09-06, quick-260908-k3x): proves the
 * macOS gate INSIDE `checkRosettaWhenMac()` suppresses the probe off macOS.
 *
 * Deliberately a DIRECT call, not an `init()` drive -- the composition to state plainly: Test
 * 1 of the sibling suite (`rosettaBootWiring.test.ts`) proves `init()` calls
 * `checkRosettaWhenMac()` unconditionally; this suite proves the gate inside it suppresses the
 * probe off macOS. Neither half alone is sufficient -- a direct-call test with no wiring
 * assertion is exactly how `shutdownBridgeHelper()` stayed green with zero production callers
 * for a milestone.
 *
 * KNOWN VACUITY, recorded rather than hidden (same words `migrationsWiring.test.ts` uses for
 * its own idempotence test): this whole suite ALSO passes against a `bootstrap.ts` with no
 * Block F wiring at all -- a `checkRosettaWhenMac` that is never called from `init()` still
 * never calls `exec` when directly invoked with `isMac: false`. This suite proves the platform
 * gate, and says nothing on its own about whether anything in production ever reaches it.
 */

// ── backend/constants/environment — PINNED isMac:false / isLinux:true, the mirror image of
// rosettaBootWiring.test.ts's pin, and for the same determinism reason ────────────────────
jest.mock('backend/constants/environment', () => ({
  isWindows: false,
  isMac: false,
  isLinux: true,
  isSteamDeckGameMode: false,
  isFlatpak: false
}))

import { createTestHostServices } from 'backend/testUtils/testHostServices'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { checkRosettaWhenMac } from '../bootstrap'

/** Waits a few microtask/macrotask turns for fire-and-forget async work to progress. */
async function flush(times = 6): Promise<void> {
  for (let i = 0; i < times; i++) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

describe('checkRosettaWhenMac() platform gate (todo 2026-09-06, quick-260908-k3x)', () => {
  it('never runs the arch probe off macOS', async () => {
    // An empty script: any process call would throw "unscripted process call".
    const runner = createScriptedRunner([])
    checkRosettaWhenMac(Promise.resolve(), {
      runner,
      dialogs: createTestHostServices().dialogs
    })
    await flush()

    expect(runner.calls).toHaveLength(0)
  })
})
