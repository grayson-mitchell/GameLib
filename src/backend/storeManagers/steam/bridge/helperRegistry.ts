/**
 * Phase 65 Plan 15 (D-08/D-10), 66.3-14 (D-05) -- the bridge-helper registry: the single owner
 * of the per-appId `helpers` map and the exit teardown, built once per boot by
 * `createBridgeHelperRegistry`. The wait schedule, the helper binary path and the spawn env are
 * constructor deps (boot passes the production values, tests pass fakes), so the old
 * `__set...ForTests` seams are gone. Split out of `helperProcess.ts` so the spawn and readiness
 * code reach this state only through the instance. A leaf: no top-level work, so
 * `backend/utils` can import it headlessly.
 */

import type { LongLivedHandle } from 'backend/process/types'
import { logInfo, LogPrefix } from 'backend/logger'

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

/**
 * How long a launch keeps waiting for Steam to start / sign in (60 s: a cold Mac Steam launch plus
 * update check plus auto sign-in is tens of seconds, UNMEASURED; the live gate records the real
 * figure) and the gap between respawns (each failing attempt is a sub-second fast-fail spawn
 * writing ~4 log lines, so 3 s caps the loop at ~20 spawns). Boot passes this as the production
 * schedule; a test passes its own.
 */
export const DEFAULT_STEAM_WAIT_SCHEDULE: BridgeHelperRegistryDeps['steamWaitSchedule'] =
  Object.freeze({ budgetMs: 60_000, intervalMs: 3_000 })

export interface BridgeHelperRegistryDeps {
  /** The bounded wait for Steam to start / finish signing in (261027-aue). */
  steamWaitSchedule: { budgetMs: number; intervalMs: number }
  /** The packaged, fixed helper binary path; a test points it at a locally compiled helper. */
  helperPath: () => string
  /**
   * The spawned child's base env. Production returns the real ambient `process.env`; a test that
   * really spawns passes `createFakeHomeProfile()`'s own env (jest's containment never reaches a
   * child, because `node:child_process` reads the REAL host env).
   */
  spawnEnv: () => NodeJS.ProcessEnv
}

export interface BridgeHelperRegistry {
  /** The per-appId map (D-51-01); the spawn and readiness code read and write it. */
  readonly helpers: Map<string, BridgeHelperEntry>
  readonly steamWaitSchedule: BridgeHelperRegistryDeps['steamWaitSchedule']
  helperPath(): string
  spawnEnv(): NodeJS.ProcessEnv
  installExitTeardownOnce(): void
  /** Phase 58 Plan 31: the live helper's port and secret, only when both are known. */
  getConnection(appId: string): { port: number; secret: string } | null
  /**
   * D-51-01: tears down ONLY the helper for `appId`. Safe to call unconditionally, including for
   * an appId whose helper was never spawned this session (a no-op). `bottleProcessMonitor`'s
   * `onStopped` hook calls it the moment a bridge game's own process(es) exit.
   */
  stop(appId: string): void
  /** True while any bridge helper is alive: the quit path asks before ending a hosted session. */
  hasLive(): boolean
  /** Tears down every currently-running helper, regardless of appId (the full-app-quit fan-out). */
  shutdownAll(): void
}

/**
 * 51-REVIEW WR-06: once the helper handles are unref'd, a sidecar that drains at stdin EOF exits
 * while a helper may still be running. A synchronous process 'exit' listener (not a handle, so it
 * holds nothing open, and not a stdin 'end' handler, which the exit contract rules out) kills
 * every remaining helper at that moment. Process listeners are process-global: the one listener
 * and the set of registries it fans out to hang off the process object under this tag, so a
 * second registry (a test boot) adds itself instead of adding a second listener.
 */
const EXIT_TEARDOWN_TAG = Symbol.for('gamelib.bridgeHelperExitTeardown')

function registerProcessExitTeardown(shutdownAll: () => void): void {
  const holder = process as unknown as Record<symbol, Set<() => void>>
  let teardowns = holder[EXIT_TEARDOWN_TAG]
  if (!teardowns) {
    const created = new Set<() => void>()
    teardowns = created
    holder[EXIT_TEARDOWN_TAG] = created
    process.on('exit', () => {
      for (const teardown of created) teardown()
    })
  }
  teardowns.add(shutdownAll)
}

export function createBridgeHelperRegistry(
  deps: BridgeHelperRegistryDeps
): BridgeHelperRegistry {
  const helpers = new Map<string, BridgeHelperEntry>()
  let exitTeardownInstalled = false

  function stop(appId: string): void {
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

  function shutdownAll(): void {
    for (const appId of Array.from(helpers.keys())) {
      stop(appId)
    }
  }

  return {
    helpers,
    steamWaitSchedule: deps.steamWaitSchedule,
    helperPath: deps.helperPath,
    spawnEnv: deps.spawnEnv,
    installExitTeardownOnce(): void {
      if (exitTeardownInstalled) return
      exitTeardownInstalled = true
      registerProcessExitTeardown(shutdownAll)
    },
    getConnection(appId) {
      const entry = helpers.get(appId)
      if (!entry || entry.port === null || !entry.secret) return null
      return { port: entry.port, secret: entry.secret }
    },
    stop,
    hasLive: () => helpers.size > 0,
    shutdownAll
  }
}

/** What the spawn and readiness code (and ManagerDeps) read from the registry. */
export type BridgeHelperSlice = Pick<
  BridgeHelperRegistry,
  | 'helpers'
  | 'steamWaitSchedule'
  | 'helperPath'
  | 'spawnEnv'
  | 'installExitTeardownOnce'
  | 'getConnection'
  | 'stop'
  | 'hasLive'
>
