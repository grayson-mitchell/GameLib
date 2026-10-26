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
 *  - HEALTH: answerable by the helper immediately at process start, BEFORE
 *    `SteamAPI_InitFlat` completes -- proves "process up".
 *  - WHOAMI: answerable ok only AFTER `SteamAPI_InitFlat` succeeded against
 *    the live signed-in Mac Steam -- proves "init succeeded against a live
 *    session".
 * These are two DISTINCT states (24-02 review finding #7): "process up, no
 * live Steam session" (`status: 'not-inited'`) is reported differently from
 * "helper never answered at all" (`status: 'unreachable'`) so a caller can
 * surface a meaningfully different failure message instead of one generic
 * timeout.
 */

import { spawn, ChildProcess } from 'node:child_process'
import { Socket } from 'node:net'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  steamBridgeHelperPath,
  steamBridgeHelperStateDir
} from 'backend/constants/paths'
import { sendFrontendMessage } from 'backend/ipc'
import { registerLongLivedChild } from 'backend/longLivedChildren'
import {
  encodeControl,
  decodeResponse,
  STATUS_OK,
  FrameTooLargeError
} from './protocol'

const NUMERIC_APP_ID = /^\d+$/

// Same 127.0.0.1-only loopback host every native helper (bridge_helper.c)
// binds -- T-51-01 (carries forward T-24-01), never a routable interface.
// The PORT is no longer fixed -- see BridgeHelperEntry.port below.
const BRIDGE_HELPER_HOST = '127.0.0.1'

// Parses the native helper's own stderr announcement line, e.g.
// `LISTEN 127.0.0.1:64321 appid=206060 mode=full` -- MUST match
// bridge_helper.c's `logts("LISTEN", ...)` format byte-for-byte.
const LISTEN_LINE = /LISTEN 127\.0\.0\.1:(\d+) appid=(\d+)/

// Parses the helper's terminal "now serving" marker, e.g.
// `READY  init=ok appid=206060` -- MUST match bridge_helper.c's
// `logts_f("READY", "init=%s appid=%s", ...)` byte-for-byte. The TWO spaces
// come from logts's `%-6s` padding of the 5-character category.
const READY_LINE = /READY {2}init=(ok|failed|dylib-missing) appid=(\d+)/

const MIN_EPHEMERAL_PORT = 1024
const MAX_PORT = 65535

// Bounded-poll budget (D-06, T-24-10 -- observable failure, never a hang).
// Reused for TWO distinct waits: (1) the freshly-spawned process reporting
// its LISTEN port at all, and (2) the HEALTH/WHOAMI CONTROL round-trip once
// that port is known.
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

interface EnsureBridgeHelperReadyResult {
  status: BridgeHelperReadyStatus
  ready: boolean
  /** The helper's real, OS-assigned ephemeral port, whenever it is known --
   * present on every outcome except the up-front invalid-appId rejection
   * and a helper that never reported a LISTEN line at all. */
  port?: number
  error?: string
}

interface BridgeHelperEntry {
  appId: string
  child: ChildProcess
  /** Null until the LISTEN line is parsed off the child's own stderr. */
  port: number | null
  /** Resolves to the real port once known, or `null` if the process exited
   * (or errored) before ever reporting one. Settles exactly once. */
  portReady: Promise<number | null>
  /** Init outcome parsed from the helper's READY line; null until seen. */
  initOutcome: 'ok' | 'failed' | 'dylib-missing' | null
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
}

// D-51-01: per-appId registry -- replaces the Phase 24 module-scoped
// singleton ChildProcess handle. No module-level `let` of a ChildProcess
// anywhere in this file (pinned by a source-assertion test,
// helperProcess.test.ts).
const helpers = new Map<string, BridgeHelperEntry>()

// Test-only override for the packaged, fixed helper binary path -- lets
// helperIntegration.test.ts point at a real, locally-compiled binary
// without needing to fake the packaged bundle layout. Defaults to the real
// packaged path; never set in production.
let bridgeHelperPathOverride: string | null = null

export function __setBridgeHelperPathForTests(path: string | null): void {
  bridgeHelperPathOverride = path
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

function unrefHandle(handle: unknown): void {
  ;(handle as { unref?: () => void } | null | undefined)?.unref?.()
}

// 51-REVIEW WR-06: once the helper handles are unref'd, a sidecar that drains
// at stdin EOF exits while a helper may still be running. A synchronous
// process 'exit' listener (not a handle, so it holds nothing open, and not a
// stdin 'end' handler, which the exit contract rules out) kills every
// remaining helper at that moment. On unix the Rust shell's process-group reap
// is the backstop; on Windows there is no group reap, so this is the only
// teardown on the drain path. Installed once, on the first spawn.
let exitTeardownInstalled = false

function installExitTeardownOnce(): void {
  if (exitTeardownInstalled) return
  exitTeardownInstalled = true
  process.on('exit', () => shutdownAllBridgeHelpers())
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const handle = setTimeout(resolve, ms)
    // Jest-safety: never keep the process alive on a pending poll sleep.
    handle.unref?.()
  })
}

/**
 * D-51-01: spawns a helper for `appId` if (and only if) no live one already
 * exists for that SAME appId -- the per-appId no-op-if-live guard that
 * replaces Phase 24's single global one. Two different appIds always get
 * two different entries (D-51-03, no lock). A live entry is reused
 * REGARDLESS of its own `identityOnly` flag -- `ensureBridgeHelperReady`
 * never respawns an already-live identity-only fallback entry just to
 * retry full mode (Phase 51 Plan 12, "no respawn" clause).
 *
 * `cwd` is a per-appId staging directory under `steamBridgeHelperStateDir`
 * -- NOT the packaged bundle dir Phase 24 used -- so two concurrently
 * running helpers never race on the same `steam_appid.txt`. The
 * identity-only fallback (D-51-04) gets its OWN `<stateDir>/<appId>/identity`
 * subdirectory so its `steam_appid.txt` (always "480") never collides with
 * a full-mode helper's for the same appId. Argv-form spawn (T-24-06) of the
 * fixed, packaged, arch-aware `steamBridgeHelperPath` (or the test
 * override) ONLY -- never an attacker-supplied binary path. No `env` option
 * is ever passed: the helper must inherit the REAL ambient environment (it
 * needs the real $HOME to find Steam's own dylib) -- this is a production
 * spawn, not an isolated child, and the project's fakeHomeIsolation gate
 * (`src/backend/__tests__/fakeHomeIsolation.test.ts`) pins that this file
 * never hand-rolls a home/config/state env block.
 */
function ensureHelperSpawned(
  appId: string,
  options?: { identityOnly?: boolean }
): BridgeHelperEntry {
  const existing = helpers.get(appId)
  if (existing && !existing.child.killed) {
    return existing
  }

  const identityOnly = options?.identityOnly ?? false
  const helperPath = bridgeHelperPathOverride ?? steamBridgeHelperPath
  const stateDir = identityOnly
    ? join(steamBridgeHelperStateDir, appId, 'identity')
    : join(steamBridgeHelperStateDir, appId)
  mkdirSync(stateDir, { recursive: true, mode: 0o700 })

  // D-51-04: the native helper's own LISTEN line always echoes whatever
  // --appid it was itself given -- '480' for the identity-only fallback,
  // the real appId for a full-mode helper -- never the registry key this
  // entry is stored under (which is always the real appId, either way).
  const expectedListenAppId = identityOnly ? '480' : appId

  const args = identityOnly
    ? [
        '--appid',
        '480',
        '--port',
        '0',
        '--identity-only',
        '--report-appid',
        appId
      ]
    : ['--appid', appId, '--port', '0']

  logInfo(
    identityOnly
      ? `ensureHelperSpawned: spawning an identity-only (480) fallback bridge helper for appId ${appId} from ${helperPath} (D-51-04)`
      : `ensureHelperSpawned: spawning a bridge helper for appId ${appId} from ${helperPath} (D-51-01)`,
    LogPrefix.Steam
  )

  const child = spawn(helperPath, args, {
    cwd: stateDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Unset (null) on every production path -- inherits the real ambient
    // environment, unchanged. Only a test calling
    // __setBridgeHelperSpawnEnvForTests() with createFakeHomeProfile()'s
    // own env ever populates this; never a hand-rolled literal.
    ...(bridgeHelperSpawnEnvOverride
      ? { env: bridgeHelperSpawnEnvOverride }
      : {})
  })

  // 51-REVIEW WR-06 (sidecar exit contract): the sidecar exits by event-loop
  // drain at stdin EOF, so no handle may hold the loop open past it. The child
  // handle and both piped streams are libuv handles; unref() leaves them fully
  // working (stderr is still read, so the LISTEN line still arrives) and only
  // drops their claim on the loop. Optional calls: test fakes may lack unref.
  unrefHandle(child)
  unrefHandle(child.stdout)
  unrefHandle(child.stderr)
  installExitTeardownOnce()

  let settlePortReady: (port: number | null) => void = () => {}
  let portSettled = false
  const portReady = new Promise<number | null>((resolve) => {
    settlePortReady = resolve
  })

  const settlePortOnce = (port: number | null) => {
    if (portSettled) return
    portSettled = true
    settlePortReady(port)
  }

  let settleInitReady: (ok: boolean) => void = () => {}
  let initSettled = false
  const initReady = new Promise<boolean>((resolve) => {
    settleInitReady = resolve
  })
  const settleInitOnce = (ok: boolean) => {
    if (initSettled) return
    initSettled = true
    settleInitReady(ok)
  }

  const handleStderrLine = (line: string) => {
    handleListenLine(line)
    handleReadyLine(line)
  }

  // T-k6o-01: same appid rule as the LISTEN line (T-51-05), and only from this
  // child's own stream.
  const handleReadyLine = (line: string) => {
    const match = READY_LINE.exec(line)
    if (!match) return
    const [, outcome, matchedAppId] = match
    if (matchedAppId !== expectedListenAppId) return
    const entry = helpers.get(appId)
    if (entry && entry.child === child) {
      entry.initOutcome = outcome as BridgeHelperEntry['initOutcome']
    }
    settleInitOnce(true)
  }

  const handleListenLine = (line: string) => {
    const match = LISTEN_LINE.exec(line)
    if (!match) return
    const [, portStr, matchedAppId] = match
    // T-51-05 (mitigate): only accept a LISTEN line whose own reported
    // appid matches the appid THIS child was spawned with (expectedListenAppId
    // -- '480' for an identity-only fallback, the real appId otherwise), and
    // whose port falls in the ephemeral/registered range -- never a
    // privileged port, never another helper's announcement misattributed to
    // this one.
    if (matchedAppId !== expectedListenAppId) return
    const port = Number(portStr)
    if (
      !Number.isInteger(port) ||
      port < MIN_EPHEMERAL_PORT ||
      port > MAX_PORT
    ) {
      return
    }
    const entry = helpers.get(appId)
    if (entry && entry.child === child) {
      entry.port = port
    }
    settlePortOnce(port)
  }

  // 53-REVIEW WR-03: the logger does not split multi-line messages, so a
  // chunk logged whole carries the appid prefix on its first line only and the
  // census (which reads gamelib.log) would see unattributed CALL lines. Log per
  // line. 53-18 WR-05: lines are reassembled across chunks -- each stream keeps
  // the trailing partial line as a plain-string carry, only complete lines are
  // logged/parsed, and the carry is flushed once when the stream ends. No
  // timers or handles, so the sidecar's exit-by-drain contract is unchanged.
  const relayLines = (
    stream: NodeJS.EventEmitter | null | undefined,
    onLine: (line: string) => void
  ) => {
    let carry = ''
    let flushed = false
    const flush = () => {
      if (flushed) return
      flushed = true
      const rest = carry
      carry = ''
      if (rest !== '') onLine(rest)
    }
    stream?.on('data', (data: Buffer) => {
      const parts = (carry + data.toString()).split('\n')
      carry = parts.pop() ?? ''
      for (const line of parts) onLine(line)
    })
    stream?.on('end', flush)
    // Fallback for a stream object that never emits 'end'.
    child.on('close', flush)
  }
  relayLines(child.stdout, (line) => {
    const trimmed = line.trim()
    if (trimmed) {
      logInfo(`bridge helper [${appId}]: ${trimmed}`, LogPrefix.Steam)
    }
  })
  relayLines(child.stderr, (line) => {
    const trimmed = line.trim()
    if (trimmed) {
      logWarning(`bridge helper [${appId}]: ${trimmed}`, LogPrefix.Steam)
    }
    handleStderrLine(line)
  })
  child.on('exit', (code, signal) => {
    logWarning(
      `bridge helper [${appId}] exited (code=${code} signal=${signal}) -- a future ensureBridgeHelperReady() call will respawn it`,
      LogPrefix.Steam
    )
    settlePortOnce(null)
    settleInitOnce(false)
    if (helpers.get(appId)?.child === child) {
      helpers.delete(appId)
    }
  })
  child.on('error', (error) => {
    logError([`bridge helper [${appId}] process error`, error], LogPrefix.Steam)
    settlePortOnce(null)
    settleInitOnce(false)
    if (helpers.get(appId)?.child === child) {
      helpers.delete(appId)
    }
  })

  const unregister = registerLongLivedChild(
    `steam-bridge-helper-${appId}`,
    () => stopBridgeHelper(appId)
  )

  const entry: BridgeHelperEntry = {
    appId,
    child,
    port: null,
    portReady,
    initOutcome: null,
    initReady,
    unregister,
    identityOnly
  }
  helpers.set(appId, entry)
  return entry
}

interface ProbeResult {
  healthOk: boolean
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
function probeHealthAndWhoami(port: number): Promise<ProbeResult> {
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
  outcome: 'ready' | 'not-inited' | 'unreachable'
  port?: number
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

  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    await sleep(POLL_INTERVAL_MS)

    const { healthOk, whoamiOk } = await probeHealthAndWhoami(port)

    if (!healthOk) {
      continue
    }

    if (whoamiOk) {
      return { outcome: 'ready', port }
    }

    return { outcome: 'not-inited', port }
  }

  return { outcome: 'unreachable', port }
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
 *    later call -- never respawned just to retry the other mode.
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

  const entry = ensureHelperSpawned(appId)
  const probe = await probeHelperReadiness(entry)

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
      ? { status: 'fallback-identity', ready: true, port: probe.port }
      : { status: 'ready', ready: true, port: probe.port }
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
  stopBridgeHelper(appId)
  const fallbackEntry = ensureHelperSpawned(appId, { identityOnly: true })
  const fallbackProbe = await probeHelperReadiness(fallbackEntry)

  if (fallbackProbe.outcome === 'ready') {
    logInfo(
      `ensureBridgeHelperReady: identity-only fallback is ready for appId ${appId} (D-51-04) -- AppID-scoped interfaces answer as stubs`,
      LogPrefix.Steam
    )
    return {
      status: 'fallback-identity',
      ready: true,
      port: fallbackProbe.port
    }
  }

  // fallbackProbe.outcome is 'not-inited' or 'unreachable' here -- either
  // way Steam itself did not accept the identity-only fallback either, so
  // this is reported identically to the identityOnly-reuse branch above:
  // exactly one steamBridgeSetupRequired, reason 'not-inited'.
  logWarning(
    `ensureBridgeHelperReady: identity-only fallback also failed to initialize for appId ${appId} -- Steam appears signed out (D-51-04)`,
    LogPrefix.Steam
  )
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

/**
 * D-51-01: tears down ONLY the helper for `appId`, via `backend/
 * longLivedChildren`'s registry (never called directly from a quit path --
 * see that module's own doc). Safe to call unconditionally, including for
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
 * Tears down every currently-running bridge helper, regardless of appId --
 * the full-app-quit fan-out. Each individual appId is ALSO independently
 * registered on `backend/longLivedChildren`'s own registry (via
 * `ensureHelperSpawned`), so `shutdownLongLivedChildren()` reaches every
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
}
