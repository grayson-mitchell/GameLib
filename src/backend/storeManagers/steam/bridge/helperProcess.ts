/**
 * Phase 51 Plan 01 (D-51-01) -- the per-appId native bridge-helper process
 * registry and its observable readiness signal.
 *
 * Supersedes Phase 24 Plan 06's D-03 (ONE shared, long-lived helper handle,
 * reused across every bridge game) and D-04 (single generic identity-only
 * AppID 480). D-51-01: every bridge launch spawns its OWN helper, told the
 * game's real AppID over argv -- `helpers` below is a
 * `Map<appId, BridgeHelperEntry>`, never a module-scoped singleton handle.
 * D-51-03 (two bridge games running at once, no lock) falls directly out
 * of this: a second appId simply gets a second entry in the map, spawned
 * and polled completely independently of the first.
 *
 * The OS assigns each helper's listening port (the native helper binds
 * port 0 and reports whatever it got, `bridge_helper.c`'s `LISTEN` line) --
 * there is no fixed, shared port left anywhere in this module. This file
 * parses that `LISTEN` line off the child's own stderr to learn the port,
 * then reuses the same CONTROL HEALTH/WHOAMI probe shape Phase 24 Plan 06
 * established, now parameterized by that per-appId port instead of a
 * fixed constant.
 *
 * D-06 (observable readiness, carried forward): because bottle launches are
 * fire-and-forget (`runWineCommand({ wait: false })`), the bridge cannot
 * assume success -- `ensureBridgeHelperReady()` probes the helper over the
 * protocol.ts (24-02) CONTROL frame:
 *  - HEALTH: independent of the init OUTCOME, but only served once the
 *    helper reaches its accept loop, which is after `SteamAPI_InitFlat` has
 *    run (success or failure) -- proves "process up and serving".
 *  - WHOAMI: answerable ok only AFTER `SteamAPI_InitFlat` succeeded against
 *    the live signed-in Mac Steam -- proves "init succeeded against a live
 *    session".
 * 51-REVIEW WR-02: the helper is single-threaded, so connections made while
 * InitFlat runs sit unanswered in the listen backlog. The backend therefore
 * waits for the helper's `READY` stderr line (bounded by INIT_WAIT_BUDGET_MS)
 * before the HEALTH/WHOAMI probe.
 *
 * 261027-aue: `SteamAPI_InitFlat` fails FAST when Steam is quit or still
 * signing in (it never waits), so a launch used to dead-end in under a second.
 * The helper's `INIT   InitFlat failed ... err=<text>` stderr line is now
 * classified (`classifyInitFlatError`): the two known Steam-state texts start
 * Steam (when it is not running) and respawn a FRESH helper on a bounded
 * schedule (InitFlat runs once per process, so a failed helper can never
 * recover); every other failure keeps the D-51-04 path unchanged.
 *
 * These are two DISTINCT states (24-02 review finding #7): "process up, no
 * live Steam session" (`status: 'not-inited'`) is reported differently from
 * "helper never answered at all" (`status: 'unreachable'`) so a caller can
 * surface a meaningfully different failure message instead of one generic
 * timeout.
 */

import { Socket } from 'node:net'

import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { sendFrontendMessage } from 'backend/ipc'
import { isMac } from 'backend/constants/environment'
import {
  HELLO_ROLE_PROBE,
  encodeControl,
  encodeHello,
  decodeResponse,
  STATUS_OK,
  FrameTooLargeError
} from './protocol'
import { NUMERIC_APP_ID } from '../gameConstants'
import type { BridgeHelperEntry } from './helperRegistry'
import { classifyInitFlatError, ensureHelperSpawned } from './helperSpawn'
import type { HelperSpawnDeps, InitFlatErrorCause } from './helperSpawn'

// Same 127.0.0.1-only loopback host every native helper (bridge_helper.c)
// binds -- T-51-01 (carries forward T-24-01), never a routable interface.
// The PORT is no longer fixed -- see BridgeHelperEntry.port below.
const BRIDGE_HELPER_HOST = '127.0.0.1'

// The Steam wait budget and respawn interval are the registry's steamWaitSchedule
// (DEFAULT_STEAM_WAIT_SCHEDULE in helperRegistry.ts is the production value).

// Bounded-poll budget (D-06, T-24-10 -- observable failure, never a hang).
// Reused across the wait stages: (1) the freshly-spawned process reporting
// its LISTEN port, (2) its READY line (INIT_WAIT_BUDGET_MS, below), then
// (3) the HEALTH/WHOAMI CONTROL round-trip once that port is known.
const POLL_ATTEMPTS = 6
const POLL_INTERVAL_MS = 250
const PROBE_TIMEOUT_MS = 250
const PORT_WAIT_BUDGET_MS = POLL_ATTEMPTS * POLL_INTERVAL_MS

// How long to wait for the helper's READY line after LISTEN (51-REVIEW WR-02).
// Sized generously for a cold Steam IPC connect or Steam mid-update, NOT
// measured; warm samples in the operator's logs show LISTEN->INIT within 1 s.
// Bounded so a wedged init is still an observable outcome and never a hang
// (D-06, T-24-10).
const INIT_WAIT_BUDGET_MS = 20_000

// Fixed request id -- each probe opens its own short-lived connection (no
// request multiplexing across probes), so there is only ever one
// outstanding request per socket and no correlation ambiguity.
const PROBE_REQUEST_ID = 1

// Not exported (this and EnsureBridgeHelperReadyResult below): verified to have no
// importer anywhere -- not in any tracked .ts/.tsx file (`pnpm find-deadcode` / ts-prune
// flagged the previously-exported forms as over-broad `export` keywords).
// 'fallback-identity' (Phase 51 Plan 12, D-51-04): the full-AppID helper's
// own WHOAMI failed (Steam refused the real AppID -- family-shared title,
// licence check) but a SECOND, identity-only helper (--appid 480
// --identity-only --report-appid <appId>) came up and inited successfully
// against the SAME live Steam session -- the game still launches, with
// SteamID/persona flowing but every AppID-scoped interface answering as a
// stub.
type BridgeHelperReadyStatus =
  | 'ready'
  | 'not-inited'
  | 'unreachable'
  | 'fallback-identity'
  | 'steam-not-running'
  | 'steam-not-signed-in'

interface EnsureBridgeHelperReadyResult {
  status: BridgeHelperReadyStatus
  ready: boolean
  /** The helper's real, OS-assigned ephemeral port, whenever it is known --
   * present on every outcome except the up-front invalid-appId rejection
   * and a helper that never reported a LISTEN line at all. */
  port?: number
  /** WR-03: the launch secret of the exact helper entry that was probed
   * (same entry as `port`). Present on 'ready' / 'fallback-identity'. */
  secret?: string
  error?: string
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms)
    // Jest-safety: never keep the process alive on a pending poll sleep.
    handle.unref?.()
  })
}

interface ProbeResult {
  healthOk: boolean
  /** WR-03: HELLO-with-secret was accepted (only meaningful once healthOk). */
  authOk: boolean
  whoamiOk: boolean
}

/**
 * Opens one short-lived loopback connection to `port` and, over it, sends
 * CONTROL HEALTH then (only if HEALTH answered ok) CONTROL WHOAMI --
 * reusing the helper's persistent-connection read loop for a single
 * request/response pair each, rather than a second connection per slot.
 * Bounded by `PROBE_TIMEOUT_MS` so a helper that never answers (or never
 * accepts the connection) resolves `{ healthOk: false, whoamiOk: false }`
 * instead of hanging (D-06).
 */
function probeHealthAndWhoami(
  port: number,
  secret: string
): Promise<ProbeResult> {
  return new Promise((resolve) => {
    const socket = new Socket()
    let settled = false
    let stage: 'health' | 'hello' | 'whoami' = 'health'
    let received = Buffer.alloc(0)
    let healthOk = false
    let authOk = false

    const finish = (result: ProbeResult) => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.destroy()
      resolve(result)
    }

    const timeout = setTimeout(
      () => finish({ healthOk, authOk, whoamiOk: false }),
      PROBE_TIMEOUT_MS
    )
    timeout.unref?.()

    socket.once('error', () => finish({ healthOk, authOk, whoamiOk: false }))

    socket.connect(port, BRIDGE_HELPER_HOST, () => {
      socket.write(encodeControl(PROBE_REQUEST_ID, 'health'))
    })

    socket.on('data', (chunk: Buffer) => {
      received = Buffer.concat([received, chunk])

      let decoded
      try {
        decoded = decodeResponse(received)
      } catch (error) {
        if (error instanceof FrameTooLargeError) {
          finish({ healthOk, authOk, whoamiOk: false })
        }
        // Truncated -- wait for more data, up to PROBE_TIMEOUT_MS.
        return
      }

      if (decoded.requestId !== PROBE_REQUEST_ID) {
        finish({ healthOk, authOk, whoamiOk: false })
        return
      }

      received = Buffer.alloc(0)

      if (stage === 'health') {
        healthOk = decoded.status === STATUS_OK
        if (!healthOk) {
          finish({ healthOk: false, authOk: false, whoamiOk: false })
          return
        }
        stage = 'hello'
        // WR-03: WHOAMI is auth-only -- authenticate first. The probe role
        // byte keeps the helper from logging `shim attached`.
        socket.write(encodeHello(PROBE_REQUEST_ID, secret, HELLO_ROLE_PROBE))
        return
      }

      if (stage === 'hello') {
        authOk = decoded.status === STATUS_OK
        if (!authOk) {
          finish({ healthOk: true, authOk: false, whoamiOk: false })
          return
        }
        stage = 'whoami'
        socket.write(encodeControl(PROBE_REQUEST_ID, 'whoami'))
        return
      }

      // stage === 'whoami'
      finish({
        healthOk: true,
        authOk: true,
        whoamiOk: decoded.status === STATUS_OK
      })
    })
  })
}

/**
 * Waits up to `PORT_WAIT_BUDGET_MS` (unref'd, Jest-safe) for `entry`'s
 * LISTEN port to become known. Returns the port immediately if it is
 * already known (the common case once a helper has been up for a moment).
 */
function waitForPort(entry: BridgeHelperEntry): Promise<number | null> {
  if (entry.port !== null) {
    return Promise.resolve(entry.port)
  }
  return new Promise((resolve) => {
    let settled = false
    const finish = (port: number | null) => {
      if (settled) return
      settled = true
      resolve(port)
    }
    const timeout = setTimeout(() => finish(null), PORT_WAIT_BUDGET_MS)
    timeout.unref?.()
    entry.portReady.then(finish)
  })
}

/**
 * Waits up to `INIT_WAIT_BUDGET_MS` (unref'd, cleared on early settle) for
 * `entry`'s READY line. A reused entry that already reported READY resolves
 * immediately; a process that exits/errors first resolves `'exited'`.
 */
function waitForInit(
  entry: BridgeHelperEntry
): Promise<'seen' | 'exited' | 'timeout'> {
  if (entry.initOutcome !== null) {
    return Promise.resolve('seen')
  }
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve('timeout'), INIT_WAIT_BUDGET_MS)
    timeout.unref?.()
    void entry.initReady.then((seen) => {
      clearTimeout(timeout)
      resolve(seen ? 'seen' : 'exited')
    })
  })
}

interface HelperReadinessProbe {
  outcome: 'ready' | 'not-inited' | 'unreachable' | 'steam-wait'
  port?: number
  /** Set when outcome is 'steam-wait'. */
  cause?: InitFlatErrorCause
}

/**
 * Waits (bounded) for `entry`'s own LISTEN port, then bounded-polls its
 * CONTROL HEALTH/WHOAMI readiness against that port -- the shared probe
 * shape reused for BOTH a full-AppID helper and the D-51-04 identity-only
 * fallback helper. Never fires `steamBridgeSetupRequired`; its only log is the
 * init-wait-timeout diagnostic --
 * the caller (`ensureBridgeHelperReady`) owns every observable side effect,
 * since the SAME outcome means something different depending on which
 * stage (full vs. fallback) produced it.
 */
async function probeHelperReadiness(
  entry: BridgeHelperEntry
): Promise<HelperReadinessProbe> {
  const port = await waitForPort(entry)
  if (port === null) {
    return { outcome: 'unreachable' }
  }

  const init = await waitForInit(entry)
  if (init === 'exited') {
    return { outcome: 'unreachable', port }
  }
  if (init === 'timeout') {
    logWarning(
      `bridge helper [${entry.appId}] never reported READY within ${INIT_WAIT_BUDGET_MS}ms -- probing anyway`,
      LogPrefix.Steam
    )
  }

  // 261027-aue: a full-AppID helper whose InitFlat failed with a known
  // Steam-state text has a result that is already known -- skip the polls.
  if (!entry.identityOnly && entry.initOutcome === 'failed') {
    const cause = classifyInitFlatError(entry.initError)
    if (cause !== 'other') {
      return { outcome: 'steam-wait', cause, port }
    }
  }

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)

    const { healthOk, authOk, whoamiOk } = await probeHealthAndWhoami(
      port,
      entry.secret
    )

    if (!healthOk) {
      continue
    }

    if (!authOk) {
      // An auth bug must not masquerade as 'not-inited' (that would trigger
      // the 480 fallback). Never log the secret.
      logWarning(
        `bridge helper [${entry.appId}] rejected the readiness probe's HELLO (launch-secret authentication failed) (WR-03)`,
        LogPrefix.Steam
      )
      return { outcome: 'unreachable', port }
    }

    if (whoamiOk) {
      return { outcome: 'ready', port }
    }

    return { outcome: 'not-inited', port }
  }

  return { outcome: 'unreachable', port }
}

/**
 * 261027-aue: asks Mac Steam to open (`steam://open/main`, a fixed constant --
 * T-aue-03). `activate: false` for the same Console-mode Space reason
 * games.ts gives for rungameid. A failed open is not fatal: the loop still
 * waits, the user may start Steam by hand. macOS only (the bridge is macOS).
 */
async function startSteamDefault(
  deps: Pick<HelperSpawnDeps, 'openExternal'>
): Promise<void> {
  if (!isMac) return
  try {
    await deps.openExternal.openExternal('steam://open/main', {
      activate: false
    })
  } catch (error) {
    logWarning(
      ['startSteamDefault: could not open Steam', error],
      LogPrefix.Steam
    )
  }
}

/**
 * D-51-01/D-06/D-51-04: lazily spawns a per-appId bridge helper, waits
 * (bounded) for it to report its own OS-assigned port, then bounded-polls
 * its CONTROL HEALTH/WHOAMI readiness against that port -- returning an
 * observable ready/not-ready result rather than assuming success, since
 * the caller's own launch (`runWineCommand({ wait: false })`) is
 * fire-and-forget.
 *
 *  - `appId` guarded with the same `/^\d+$/` rule as
 *    `ensureSteamClientReady`/`buildSteamProtocolUrl` (T-24-07 lineage).
 *  - HEALTH ok + WHOAMI ok -> `{ status: 'ready', ready: true, port }`
 *    (or `'fallback-identity'` instead of `'ready'` when this entry IS the
 *    identity-only fallback, D-51-04).
 *  - Full-AppID helper: HEALTH ok, WHOAMI not ok (process up, no live Steam
 *    session FOR THIS APPID) -- D-51-04: rather than failing outright, this
 *    kills the full child and spawns a second, identity-only (480) helper
 *    for the SAME appId (`--identity-only --report-appid <appId>`). If
 *    THAT one's WHOAMI succeeds -> `{ status: 'fallback-identity',
 *    ready: true, port }`, no `steamBridgeSetupRequired` at all (finding
 *    #7's distinct-reason split never applies to a successful fallback --
 *    the game launches). If the identity-only helper ALSO fails WHOAMI
 *    (Steam itself is not signed in/running, not just this appId) ->
 *    `{ status: 'not-inited', ready: false, port }` with exactly ONE
 *    `steamBridgeSetupRequired({ reason: 'not-inited' })` -- never two.
 *  - Port never reported, OR HEALTH never answers within the poll budget,
 *    for the FULL helper -> `{ status: 'unreachable', ready: false, port? }`
 *    (D-06 observable failure) and fires `steamBridgeSetupRequired` --
 *    no fallback attempt at all (an unreachable process proves nothing
 *    about whether Steam itself would accept the real AppID).
 *  - A live entry for `appId` (full OR identity-only) is reused as-is by a
 *    later call -- never respawned just to retry the other mode. EXCEPT an
 *    entry whose InitFlat failed (261027-aue): InitFlat runs once per
 *    process, so it can never become ready and is stopped and respawned.
 *  - 261027-aue: a full helper whose InitFlat failed with a known Steam-state
 *    text (Steam quit / still signing in) enters a bounded wait: Steam is
 *    started when it is not running, `onWaitingForSteam` fires once, and a
 *    fresh helper is respawned every steamWaitSchedule.intervalMs until it is
 *    ready or steamWaitSchedule.budgetMs passes. Budget exhausted ->
 *    `{ status: 'steam-not-running' | 'steam-not-signed-in', ready: false }`
 *    with exactly one `steamBridgeSetupRequired` (fallbackAvailable false).
 *    The 480 fallback is never tried for these causes -- Steam-level failures
 *    fail it identically.
 */
export async function ensureBridgeHelperReady(
  deps: HelperSpawnDeps,
  appId: string,
  options: {
    onWaitingForSteam?: (cause: InitFlatErrorCause) => void
    startSteam?: () => Promise<void>
  } = {}
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

  // InitFlat runs once per helper process: a failed one can never recover.
  const registry = deps.bridgeHelpers
  if (registry.helpers.get(appId)?.initOutcome === 'failed') {
    registry.stop(appId)
  }

  let entry = ensureHelperSpawned(deps, appId)
  let probe = await probeHelperReadiness(entry)

  let waitStart: number | null = null
  let steamStarted = false
  let notified = false
  const { budgetMs, intervalMs } = registry.steamWaitSchedule
  while (probe.outcome === 'steam-wait') {
    const cause = probe.cause as InitFlatErrorCause
    waitStart ??= Date.now()
    if (!notified) {
      notified = true
      options.onWaitingForSteam?.(cause)
    }
    if (cause === 'steam-not-running' && !steamStarted) {
      steamStarted = true
      await (options.startSteam ?? (() => startSteamDefault(deps)))()
    }
    registry.stop(appId)
    await sleep(intervalMs)
    // Budget is checked BEFORE every new spawn (T-aue-02).
    const elapsed = Date.now() - waitStart
    if (elapsed >= budgetMs) {
      logWarning(
        `ensureBridgeHelperReady: gave up waiting for Steam for appId ${appId} (${cause}) after ${elapsed}ms`,
        LogPrefix.Steam
      )
      sendFrontendMessage('steamBridgeSetupRequired', {
        appName: appId,
        reason: cause,
        fallbackAvailable: false
      })
      return {
        status: cause,
        ready: false,
        error:
          cause === 'steam-not-running'
            ? 'Steam did not start within the wait budget'
            : 'Steam did not finish signing in within the wait budget'
      }
    }
    entry = ensureHelperSpawned(deps, appId)
    probe = await probeHelperReadiness(entry)
  }

  if (probe.outcome === 'unreachable') {
    logWarning(
      probe.port === undefined
        ? `ensureBridgeHelperReady: bridge helper for appId ${appId} never reported a LISTEN port within the poll budget`
        : `ensureBridgeHelperReady: bridge helper unreachable within the poll budget for appId ${appId} (D-06 observable failure)`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: appId,
      reason: 'unreachable'
    })
    return {
      status: 'unreachable',
      ready: false,
      ...(probe.port !== undefined ? { port: probe.port } : {}),
      error: 'Bridge helper unreachable within the poll budget'
    }
  }

  if (probe.outcome === 'ready') {
    return entry.identityOnly
      ? {
          status: 'fallback-identity',
          ready: true,
          port: probe.port,
          secret: entry.secret
        }
      : { status: 'ready', ready: true, port: probe.port, secret: entry.secret }
  }

  // probe.outcome === 'not-inited' from here on.

  if (entry.identityOnly) {
    // D-51-04: the identity-only (480) fallback ALSO failed WHOAMI -- Steam
    // itself is not signed in/running (not just this appId's own real-AppID
    // init), so there is nothing left to fall back to. Exactly one
    // steamBridgeSetupRequired for the whole call, fired here.
    logWarning(
      `ensureBridgeHelperReady: identity-only fallback also failed to initialize against a live Steam session for appId ${appId} (D-51-04)`,
      LogPrefix.Steam
    )
    sendFrontendMessage('steamBridgeSetupRequired', {
      appName: appId,
      reason: 'not-inited'
    })
    return {
      status: 'not-inited',
      ready: false,
      port: probe.port,
      error:
        'Bridge helper process is up but not initialized against a live Steam session'
    }
  }

  // Full-AppID helper's own WHOAMI failed -- D-51-04: attempt the
  // identity-only (480) fallback before reporting anything to the caller.
  // Never fires steamBridgeSetupRequired for the full helper's own
  // not-inited result -- the fallback attempt below decides the final
  // outcome.
  logInfo(
    `ensureBridgeHelperReady: full-AppID WHOAMI failed for appId ${appId} -- attempting an identity-only (480) fallback (D-51-04)`,
    LogPrefix.Steam
  )
  registry.stop(appId)
  const fallbackEntry = ensureHelperSpawned(deps, appId, { identityOnly: true })
  const fallbackProbe = await probeHelperReadiness(fallbackEntry)

  if (fallbackProbe.outcome === 'ready') {
    logInfo(
      `ensureBridgeHelperReady: identity-only fallback is ready for appId ${appId} (D-51-04) -- AppID-scoped interfaces answer as stubs`,
      LogPrefix.Steam
    )
    return {
      status: 'fallback-identity',
      ready: true,
      port: fallbackProbe.port,
      secret: fallbackEntry.secret
    }
  }

  // fallbackProbe.outcome is 'not-inited' or 'unreachable' here -- either
  // way Steam itself did not accept the identity-only fallback either, so
  // this is reported identically to the identityOnly-reuse branch above:
  // exactly one steamBridgeSetupRequired, reason 'not-inited'.
  logWarning(
    `ensureBridgeHelperReady: identity-only fallback also failed to initialize for appId ${appId} -- Steam refused a session for both the real AppID and the identity-only 480 fallback (D-51-04)`,
    LogPrefix.Steam
  )
  // The failed 480 helper is deliberately left registered (helperIntegration
  // inspects it); the next ensureBridgeHelperReady call stops and respawns it
  // because its InitFlat failed (no-reuse rule above).
  sendFrontendMessage('steamBridgeSetupRequired', {
    appName: appId,
    reason: 'not-inited'
  })
  return {
    status: 'not-inited',
    ready: false,
    ...(fallbackProbe.port !== undefined ? { port: fallbackProbe.port } : {}),
    error:
      'Bridge helper process is up but not initialized against a live Steam session'
  }
}
