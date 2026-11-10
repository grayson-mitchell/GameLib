/**
 * Phase 65 Plan 15 (D-08/D-10) -- the bridge-helper registry: the single owner
 * of the per-appId `helpers` map, the test-only path/env/wait-schedule
 * overrides (with their `__set...ForTests` seams and getters), the exit
 * teardown. Split out of `helperProcess.ts` so the spawn and
 * readiness code reach this state only through exports. A leaf: no top-level
 * work, so `backend/utils` can import it headlessly.
 */

import type { LongLivedHandle } from 'backend/process/types'
import { logInfo, LogPrefix } from 'backend/logger'

let steamWaitScheduleOverride: { budgetMs: number; intervalMs: number } | null =
  null

export function __setSteamWaitScheduleForTests(
  schedule: { budgetMs: number; intervalMs: number } | null
): void {
  steamWaitScheduleOverride = schedule
}

export function getSteamWaitScheduleOverride(): {
  budgetMs: number
  intervalMs: number
} | null {
  return steamWaitScheduleOverride
}

export interface BridgeHelperEntry {
  appId: string
  /** The runner's long-lived handle for the helper process. */
  child: LongLivedHandle
  /** Null until the LISTEN line is parsed off the child's own stderr. */
  port: number | null
  /** Resolves to the real port once known, or `null` if the process exited
   * (or errored) before ever reporting one. Settles exactly once. */
  portReady: Promise<number | null>
  /** Init outcome parsed from the helper's READY line; null until seen. */
  initOutcome: 'ok' | 'failed' | 'dylib-missing' | null
  /** 261027-aue: the err text of the helper's `INIT InitFlat failed` line;
   * null until (unless) seen. */
  initError: string | null
  /** Resolves true once the READY line is seen, false if the process exits
   * or errors first. Settles exactly once. */
  initReady: Promise<boolean>
  unregister: () => void
  /** Phase 51 Plan 12 (D-51-04): true when this entry is the identity-only
   * 480 fallback helper (spawned after the full-AppID helper's own WHOAMI
   * failed), false for a normal full-AppID helper. Registered under the
   * SAME appId key either way -- `stopBridgeHelper`/`onStopped` tear it
   * down identically regardless of which kind it is. */
  identityOnly: boolean
  /** WR-03: per-spawn launch secret (64 lowercase hex). Handed to the helper
   * via env only (never argv) and to the shim via gamelib_bridge.cfg. Never
   * logged. */
  secret: string
  /** Phase 58 Plan 31: Date.now() of the last invite-dialog push (debounce). */
  lastInviteRequestMs: number
}

// D-51-01: per-appId registry -- replaces the Phase 24 module-scoped
// singleton ChildProcess handle. No module-level `let` of a ChildProcess
// anywhere in this file (pinned by a source-assertion test,
// helperProcess.test.ts).
const helpers = new Map<string, BridgeHelperEntry>()

export { helpers }

// Test-only override for the packaged, fixed helper binary path -- lets
// helperIntegration.test.ts point at a real, locally-compiled binary
// without needing to fake the packaged bundle layout. Defaults to the real
// packaged path; never set in production.
let bridgeHelperPathOverride: string | null = null

export function __setBridgeHelperPathForTests(path: string | null): void {
  bridgeHelperPathOverride = path
}

export function getBridgeHelperPathOverride(): string | null {
  return bridgeHelperPathOverride
}

// Test-only override for the real, unmocked spawn's child env (Phase 51
// Plan 01, Task 3 live-tracer divergence follow-up). `ensureHelperSpawned`
// below passes NO `env` option in the default (null) case -- the production
// spawn must inherit the real ambient environment, per the fakeHomeIsolation
// gate's prohibition on a hand-rolled env literal. `jest.setupContainment.ts`
// mutates `process.env`/`os.homedir()` as SEEN BY JEST'S OWN SANDBOXED JS,
// but `node:child_process`'s builtin module is loaded once, outside that
// per-test-file sandbox, and reads the REAL host `process.env` when building
// a child's environment block -- so that containment never reaches a real
// spawned child (measured live, 2026-10-17: a jest test observes
// `process.env.HOME` redirected to a fake root while a child spawned from
// that same test still inherits the developer's real `$HOME`). On a machine
// with a genuinely-installed native Steam.app, `helperIntegration.test.ts`'s
// real (unmocked) `ensureBridgeHelperReady()` call was therefore never
// actually isolated -- it only ever asserted `'not-inited'` because no real
// dylib existed at the real $HOME's canonical Steam path on prior test
// hosts. Per CLAUDE.md's "never a hand-rolled env literal -- use
// createFakeHomeProfile()" convention, the test now passes this hook
// `createFakeHomeProfile()`'s own `.env` explicitly, closing the gap for
// real rather than relying on ambient propagation that does not happen.
let bridgeHelperSpawnEnvOverride: NodeJS.ProcessEnv | null = null

export function __setBridgeHelperSpawnEnvForTests(
  env: NodeJS.ProcessEnv | null
): void {
  bridgeHelperSpawnEnvOverride = env
}

export function getBridgeHelperSpawnEnvOverride(): NodeJS.ProcessEnv | null {
  return bridgeHelperSpawnEnvOverride
}

// 51-REVIEW WR-06: once the helper handles are unref'd, a sidecar that drains
// at stdin EOF exits while a helper may still be running. A synchronous
// process 'exit' listener (not a handle, so it holds nothing open, and not a
// stdin 'end' handler, which the exit contract rules out) kills every
// remaining helper at that moment. On unix the Rust shell's process-group reap
// is the backstop; on Windows there is no group reap, so this is the only
// teardown on the drain path. Installed once, on the first spawn.
let exitTeardownInstalled = false

export function installExitTeardownOnce(): void {
  if (exitTeardownInstalled) return
  exitTeardownInstalled = true
  process.on('exit', () => shutdownAllBridgeHelpers())
}

/** Phase 58 Plan 31: the live helper's port and secret, only when both are known. */
export function getBridgeHelperConnection(
  appId: string
): { port: number; secret: string } | null {
  const entry = helpers.get(appId)
  if (!entry || entry.port === null || !entry.secret) return null
  return { port: entry.port, secret: entry.secret }
}

/**
 * D-51-01: tears down ONLY the helper for `appId`, via the runner's
 * long-lived registry (never called directly from a quit path --
 * see the quit handler). Safe to call unconditionally, including for
 * an appId whose helper was never spawned this session (a no-op).
 *
 * This is the per-appId replacement for Phase 24's old single-shared-helper
 * teardown export (deleted entirely -- pinned by helperProcess.test.ts's
 * own invariant test). bottleProcessMonitor.ts's `onStopped` hook (Phase 51
 * Plan 01 Task 2) calls this the moment a bridge game's own process(es)
 * exit, so a helper's lifetime is tied to its game's, never to the whole
 * app session.
 */
export function stopBridgeHelper(appId: string): void {
  const entry = helpers.get(appId)
  if (!entry) {
    return
  }

  entry.unregister()
  helpers.delete(appId)

  logInfo(
    `stopBridgeHelper: terminating the bridge helper for appId ${appId}`,
    LogPrefix.Steam
  )
  entry.child.kill()
}

/**
 * True while any bridge helper is alive. A helper lives exactly as long as its game
 * (`stopBridgeHelper` runs when the game's process exits), so this is "a bridged game is
 * running and may be hosting a session" -- the quit path asks before ending that.
 */
export function hasLiveBridgeHelper(): boolean {
  return helpers.size > 0
}

/**
 * Tears down every currently-running bridge helper, regardless of appId --
 * the full-app-quit fan-out. Each individual appId is ALSO independently
 * registered on the runner's own long-lived registry (via
 * `ensureHelperSpawned`), so the runner's `teardownAll()` reaches every
 * helper even if this function is never called directly.
 */
export function shutdownAllBridgeHelpers(): void {
  for (const appId of Array.from(helpers.keys())) {
    stopBridgeHelper(appId)
  }
}

/**
 * Test-only reset of the per-appId registry -- mirrors bottle.ts's
 * `__stopBottledRaiseLoops` test-hook convention. Never called from
 * production code.
 */
export function __resetBridgeHelperStateForTests(): void {
  helpers.clear()
  bridgeHelperPathOverride = null
  steamWaitScheduleOverride = null
}
