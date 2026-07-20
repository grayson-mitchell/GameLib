/**
 * Phase 24 Plan 06 (R2/R7, D-03/D-06) -- the shared, long-lived native
 * bridge-helper process lifecycle and its observable readiness signal.
 *
 * D-03 (shared-helper lifecycle): ONE shared helper is spawned LAZILY on
 * the first bridge launch and reused (a module-scoped ChildProcess handle)
 * for every bridge game until GameLib quits -- never a helper-per-launch,
 * never a helper-per-AppID. `spawnHelperIfNeeded()` is a no-op when a live
 * handle already exists.
 *
 * D-06 (observable readiness): because bottle launches are fire-and-forget
 * (`runWineCommand({ wait: false })`), the bridge cannot assume success --
 * `ensureBridgeHelperReady()` probes the helper over the protocol.ts (24-02)
 * CONTROL frame:
 *  - HEALTH: answerable by the helper immediately at process start, BEFORE
 *    `SteamAPI_InitFlat` completes -- proves "process up".
 *  - WHOAMI: answerable ok only AFTER `SteamAPI_InitFlat` succeeded against
 *    the live signed-in Mac Steam -- proves "init succeeded against a live
 *    session".
 * These are two DISTINCT states (review finding #7): "process up, no live
 * Steam session" (`status: 'not-inited'`) is reported differently from
 * "helper never answered at all" (`status: 'unreachable'`) so a caller can
 * surface a meaningfully different failure message instead of one generic
 * timeout.
 *
 * Per D-04 (bridge_helper.c, 24-02 SUMMARY): the helper runs its single
 * `SteamAPI_InitFlat` once, BEFORE its accept loop starts serving
 * connections -- so once HEALTH succeeds, WHOAMI's answer is already
 * settled for that helper process's lifetime. The poll loop below therefore
 * only needs to keep retrying while the process itself is still coming up
 * (HEALTH not yet answering); once HEALTH answers, a single WHOAMI check is
 * enough to return a final result.
 */

import { spawn, ChildProcess } from 'node:child_process'
import { Socket } from 'node:net'
import { dirname } from 'node:path'

import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import { steamBridgeHelperPath } from 'backend/constants/paths'
import { sendFrontendMessage } from 'backend/ipc'
import {
  encodeControl,
  decodeResponse,
  STATUS_OK,
  FrameTooLargeError
} from './protocol'

const NUMERIC_APP_ID = /^\d+$/

// Same 127.0.0.1-only loopback port the native helper (bridge_helper.c,
// 24-02) binds -- T-24-01, never a routable interface.
const BRIDGE_HELPER_HOST = '127.0.0.1'
const BRIDGE_HELPER_PORT = 54550

// Bounded-poll budget (D-06, T-24-10 -- observable failure, never a hang).
// Reused verbatim on every attempt to both wait for the freshly-spawned
// process to start listening AND bound a single CONTROL round-trip.
const POLL_ATTEMPTS = 6
const POLL_INTERVAL_MS = 250
const PROBE_TIMEOUT_MS = 250

// Fixed request id -- each probe opens its own short-lived connection (no
// request multiplexing across probes), so there is only ever one
// outstanding request per socket and no correlation ambiguity.
const PROBE_REQUEST_ID = 1

export type BridgeHelperReadyStatus = 'ready' | 'not-inited' | 'unreachable'

export interface EnsureBridgeHelperReadyResult {
  status: BridgeHelperReadyStatus
  ready: boolean
  error?: string
}

// D-03: the ONE shared, long-lived helper handle. null when no helper has
// been spawned yet (or the previous one exited/errored and was cleared).
let helperProcess: ChildProcess | null = null

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms)
    // Jest-safety: never keep the process alive on a pending poll sleep.
    handle.unref?.()
  })
}

/**
 * D-03: spawns the shared helper if (and only if) no live handle exists.
 * Called at the top of every `ensureBridgeHelperReady()` -- a second call
 * while the helper is already running is a pure no-op, never a second
 * spawn.
 *
 * cwd is explicitly `dirname(steamBridgeHelperPath)` -- the bundled dir
 * 24-07 stages `steam_appid.txt`=480 into -- so the helper's own
 * `SteamAPI_InitFlat` resolves the generic identity AppID (finding #4 /
 * SPEC AppID-before-init non-negotiable). Argv-form spawn of the fixed,
 * packaged, arch-aware `steamBridgeHelperPath` only -- never an
 * attacker-supplied binary path (T-24-06).
 */
function spawnHelperIfNeeded(): void {
  if (helperProcess && !helperProcess.killed) {
    return
  }

  logInfo(
    `spawnHelperIfNeeded: spawning the shared bridge helper from ${steamBridgeHelperPath} (D-03)`,
    LogPrefix.Steam
  )

  const child = spawn(steamBridgeHelperPath, [], {
    cwd: dirname(steamBridgeHelperPath),
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout?.on('data', (data: Buffer) => {
    logInfo(`bridge helper: ${data.toString().trim()}`, LogPrefix.Steam)
  })
  child.stderr?.on('data', (data: Buffer) => {
    logWarning(`bridge helper: ${data.toString().trim()}`, LogPrefix.Steam)
  })
  child.on('exit', (code, signal) => {
    logWarning(
      `bridge helper exited (code=${code} signal=${signal}) -- a future ensureBridgeHelperReady() call will respawn it`,
      LogPrefix.Steam
    )
    if (helperProcess === child) {
      helperProcess = null
    }
  })
  child.on('error', (error) => {
    logError(['bridge helper process error', error], LogPrefix.Steam)
    if (helperProcess === child) {
      helperProcess = null
    }
  })

  helperProcess = child
}

interface ProbeResult {
  healthOk: boolean
  whoamiOk: boolean
}

/**
 * Opens one short-lived loopback connection and, over it, sends CONTROL
 * HEALTH then (only if HEALTH answered ok) CONTROL WHOAMI -- reusing the
 * helper's persistent-connection read loop (D-03/24-02) for a single
 * request/response pair each, rather than a second connection per slot.
 * Bounded by `PROBE_TIMEOUT_MS` so a helper that never answers (or never
 * accepts the connection) resolves `{ healthOk: false, whoamiOk: false }`
 * instead of hanging (D-06).
 */
function probeHealthAndWhoami(): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    let stage: 'health' | 'whoami' = 'health'
    let received = Buffer.alloc(0)
    let healthOk = false

    const finish = (result: ProbeResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.destroy()
      resolve(result)
    }

    const timeout = setTimeout(
      () => finish({ healthOk, whoamiOk: false }),
      PROBE_TIMEOUT_MS
    )
    timeout.unref?.()

    socket.once('error', () => finish({ healthOk, whoamiOk: false }))

    socket.connect(BRIDGE_HELPER_PORT, BRIDGE_HELPER_HOST, () => {
      socket.write(encodeControl(PROBE_REQUEST_ID, 'health'))
    })

    socket.on('data', (chunk: Buffer) => {
      received = Buffer.concat([received, chunk])

      let decoded
      try {
        decoded = decodeResponse(received)
      } catch (error) {
        if (error instanceof FrameTooLargeError) {
          finish({ healthOk, whoamiOk: false })
        }
        // Truncated -- wait for more data, up to PROBE_TIMEOUT_MS.
        return
      }

      if (decoded.requestId !== PROBE_REQUEST_ID) {
        finish({ healthOk, whoamiOk: false })
        return
      }

      received = Buffer.alloc(0)

      if (stage === 'health') {
        healthOk = decoded.status === STATUS_OK
        if (!healthOk) {
          finish({ healthOk: false, whoamiOk: false })
          return
        }
        stage = 'whoami'
        socket.write(encodeControl(PROBE_REQUEST_ID, 'whoami'))
        return
      }

      // stage === 'whoami'
      finish({ healthOk: true, whoamiOk: decoded.status === STATUS_OK })
    })
  })
}

/**
 * D-03/D-06: lazily spawns the ONE shared bridge helper (reused across
 * every bridge game), then bounded-polls its CONTROL HEALTH/WHOAMI
 * readiness -- returning an observable ready/not-ready result rather than
 * assuming success, since the caller's own launch (`runWineCommand({ wait:
 * false })`) is fire-and-forget.
 *
 *  - `appId` guarded with the same `/^\d+$/` rule as
 *    `ensureSteamClientReady`/`buildSteamProtocolUrl` (T-24-07 lineage).
 *  - HEALTH ok + WHOAMI ok -> `{ status: 'ready', ready: true }`.
 *  - HEALTH ok, WHOAMI not ok (process up, no live Steam session) ->
 *    `{ status: 'not-inited', ready: false }` -- a DISTINCT reason from
 *    unreachable (finding #7) -- and fires `steamBridgeSetupRequired`.
 *  - HEALTH never answers within the poll budget ->
 *    `{ status: 'unreachable', ready: false }` (D-06 observable failure)
 *    and fires `steamBridgeSetupRequired`.
 */
export async function ensureBridgeHelperReady(
  appId: string
): Promise<EnsureBridgeHelperReadyResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `ensureBridgeHelperReady: rejected non-numeric appId "${appId}" (T-24-07)`,
      LogPrefix.Steam
    )
    return {
      status: 'unreachable',
      ready: false,
      error: `Invalid appId: "${appId}"`
    }
  }

  spawnHelperIfNeeded()

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)

    const { healthOk, whoamiOk } = await probeHealthAndWhoami()

    if (!healthOk) {
      continue
    }

    if (whoamiOk) {
      return { status: 'ready', ready: true }
    }

    logWarning(
      `ensureBridgeHelperReady: bridge helper is up but not initialized against a live Steam session for appId ${appId} (finding #7 -- distinct from unreachable)`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: appId,
      reason: 'not-inited'
    })
    return {
      status: 'not-inited',
      ready: false,
      error:
        'Bridge helper process is up but not initialized against a live Steam session'
    }
  }

  logWarning(
    `ensureBridgeHelperReady: bridge helper unreachable within the poll budget for appId ${appId} (D-06 observable failure)`,
    LogPrefix.Steam
  )
  sendFrontendMessage('steamBridgeSetupRequired', {
    appName: appId,
    reason: 'unreachable'
  })
  return {
    status: 'unreachable',
    ready: false,
    error: 'Bridge helper unreachable within the poll budget'
  }
}

/**
 * Finding #8: torn down from the main-process app-quit lifecycle (Task 3,
 * `main.ts` before-quit) so the long-lived shared helper never orphans on
 * quit. A no-op when no helper was ever spawned -- safe to call
 * unconditionally on every quit, including quits where no bridge game was
 * ever launched this session.
 */
export function shutdownBridgeHelper(): void {
  if (!helperProcess) {
    return
  }

  logInfo(
    'shutdownBridgeHelper: terminating the shared bridge helper (app quit, finding #8)',
    LogPrefix.Steam
  )
  const child = helperProcess
  helperProcess = null
  child.kill()
}

/**
 * Test-only reset of the module-scoped shared-helper handle -- mirrors
 * bottle.ts's `__stopBottledRaiseLoops` test-hook convention. Never called
 * from production code.
 */
export function __resetBridgeHelperStateForTests(): void {
  helperProcess = null
}
