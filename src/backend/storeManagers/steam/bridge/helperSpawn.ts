/**
 * Phase 65 Plan 15 (D-08/D-10) -- spawns a per-appId native bridge helper and
 * wires its stderr/stdout relay, LISTEN/READY/INIT/INVITE line parsing and
 * exit handling. Split out of `helperProcess.ts`; all registry state is
 * reached through `./helperRegistry` exports. Readiness (probing, Steam wait
 * loop) stays in `helperProcess.ts`.
 */

import { spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

import { logError, logInfo, logWarning, LogPrefix } from 'backend/logger'
import {
  steamBridgeHelperPath,
  steamBridgeHelperStateDir
} from 'backend/constants/paths'
import { app } from 'backend/platform'
import { newDialogAckId, trackDialogDisplay } from 'backend/dialog/displayAck'
import { registerLongLivedChild } from 'backend/longLivedChildren'
import { BRIDGE_SECRET_ENV } from './protocol'
import {
  helpers,
  stopBridgeHelper,
  unrefHandle,
  installExitTeardownOnce,
  getBridgeHelperPathOverride,
  getBridgeHelperSpawnEnvOverride
} from './helperRegistry'
import type { BridgeHelperEntry } from './helperRegistry'

// Parses the native helper's own stderr announcement line, e.g.
// `LISTEN 127.0.0.1:64321 appid=206060 mode=full` -- MUST match
// bridge_helper.c's `logts("LISTEN", ...)` format byte-for-byte.
const LISTEN_LINE = /LISTEN 127\.0\.0\.1:(\d+) appid=(\d+)/

// Parses the helper's terminal "now serving" marker, e.g.
// `READY  init=ok appid=206060` -- MUST match bridge_helper.c's
// `logts_f("READY", "init=%s appid=%s", ...)` byte-for-byte. The TWO spaces
// come from logts's `%-6s` padding of the 5-character category.
const READY_LINE = /READY {2}init=(ok|failed|dylib-missing) appid=(\d+)/

// Parses the helper's InitFlat failure line, e.g.
// `[ts] INIT   InitFlat failed r=1 err=ConnectToGlobalUser failed appid=206060
// (is Steam running + signed in?) -- serving ...` -- MUST match
// bridge_helper.c's `init_steam_api_once` failure log. The err text is
// arbitrary, so it is captured lazily up to the fixed ` appid=<digits> (is
// Steam running` marker.
const INIT_FAILED_LINE =
  /InitFlat failed r=-?\d+ err=(.*?) appid=(\d+) \(is Steam running/

// Phase 58 Plan 31 (M-01): the helper logs this when the game calls
// ActivateGameOverlayInviteDialog -- MUST match bridge_helper.c's
// `logts_f("INVITE", "dialog appid=%s", ...)` (INVITE fills the 6-char
// category column, so ONE space follows it). Carries no lobby or user ids.
// 58 WR-05: anchored to logts's whole-line shape `[ts] CAT    msg` so another
// line merely containing this text (a game-controlled string) cannot raise
// the window. `\r?` tolerates a CRLF split.
const INVITE_DIALOG_LINE = /^\[[^\]]*\] INVITE +dialog appid=(\d+)\r?$/

// Backend debounce on top of the helper's own 1/2 s rate limit.
const INVITE_REQUEST_DEBOUNCE_MS = 2000

export type InitFlatErrorCause = 'steam-not-running' | 'steam-not-signed-in'

/**
 * 261027-aue: maps the helper's InitFlat err text to a Steam-state cause.
 * Texts measured live (261026-k6o gate). Anything else (including no INIT
 * line at all) is NOT transient and is never retried.
 */
export function classifyInitFlatError(
  err: string | null
): InitFlatErrorCause | 'other' {
  if (!err) return 'other'
  if (err.includes('Could not determine Steam client install directory')) {
    return 'steam-not-running'
  }
  if (err.includes('ConnectToGlobalUser failed')) {
    return 'steam-not-signed-in'
  }
  return 'other'
}

const MIN_EPHEMERAL_PORT = 1024
const MAX_PORT = 65535

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
 * override) ONLY -- never an attacker-supplied binary path. The base env is
 * still the REAL ambient environment (the helper needs the real $HOME to
 * find Steam's own dylib; or the createFakeHomeProfile override in tests)
 * and exactly one var is added: the per-spawn WR-03 launch secret
 * (`GAMELIB_BRIDGE_SECRET`, env only -- argv would be visible in `ps`).
 * That is not a hand-rolled home/config/state env block, which the
 * fakeHomeIsolation gate
 * (`src/backend/__tests__/fakeHomeIsolation.test.ts`) still forbids.
 */
export function ensureHelperSpawned(
  appId: string,
  options?: { identityOnly?: boolean }
): BridgeHelperEntry {
  const existing = helpers.get(appId)
  if (existing && !existing.child.killed) {
    return existing
  }

  const identityOnly = options?.identityOnly ?? false
  const helperPath = getBridgeHelperPathOverride() ?? steamBridgeHelperPath
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

  // WR-03: one fresh 256-bit secret per helper spawn.
  const secret = randomBytes(32).toString('hex')

  const child = spawn(helperPath, args, {
    cwd: stateDir,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Base env: the real ambient process.env on every production path (only a
    // test calling __setBridgeHelperSpawnEnvForTests() with
    // createFakeHomeProfile()'s own env ever overrides it; never a
    // hand-rolled literal). The ONLY addition is the launch secret.
    env: {
      ...(getBridgeHelperSpawnEnvOverride() ?? process.env),
      [BRIDGE_SECRET_ENV]: secret
    }
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
    handleInitFailedLine(line)
    handleReadyLine(line)
    handleInviteDialogLine(line)
  }

  // Phase 58 Plan 31 (T-58-103): same appid rule and own-stream rule as
  // LISTEN/READY. Debounced; not logged again (the relay already logged it).
  const handleInviteDialogLine = (line: string) => {
    const match = INVITE_DIALOG_LINE.exec(line)
    if (!match) return
    if (match[1] !== expectedListenAppId) return
    const entry = helpers.get(appId)
    if (!entry || entry.child !== child) return
    const now = Date.now()
    if (
      entry.lastInviteRequestMs !== 0 &&
      now - entry.lastInviteRequestMs < INVITE_REQUEST_DEBOUNCE_MS
    ) {
      return
    }
    entry.lastInviteRequestMs = now
    // Quick 261101-llf: the picker gets its own `bridge-invite` window, so the main window no
    // longer comes forward over the game (58-36 raised it). The picker window echoes the
    // display ack itself; nothing is pushed to the main window, whose render would
    // false-confirm it.
    logInfo(
      `bridge invite [${appId}]: picker window requested`,
      LogPrefix.Steam
    )
    const ackId = newDialogAckId()
    trackDialogDisplay(ackId, (result) =>
      logInfo(
        result.confirmed
          ? `bridge invite [${appId}]: display=confirmed elapsedMs=${result.elapsedMs}`
          : `bridge invite [${appId}]: display=unconfirmed timeout=${result.timeoutMs}`,
        LogPrefix.Steam
      )
    )
    void app.openBridgeInvitePicker({ appId, ackId }).then((ok) => {
      if (!ok) {
        logWarning(
          `bridge invite [${appId}]: picker window failed`,
          LogPrefix.Steam
        )
      }
    })
  }

  // 261027-aue: same appid rule and own-stream rule as LISTEN/READY (T-aue-01).
  // The err text is not logged again -- the per-line relay already logs it.
  const handleInitFailedLine = (line: string) => {
    const match = INIT_FAILED_LINE.exec(line)
    if (!match) return
    const [, errText, matchedAppId] = match
    if (matchedAppId !== expectedListenAppId) return
    if (errText === undefined) return
    const entry = helpers.get(appId)
    if (entry && entry.child === child) {
      entry.initError = errText
    }
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
    initError: null,
    initReady,
    unregister,
    identityOnly,
    secret,
    lastInviteRequestMs: 0
  }
  helpers.set(appId, entry)
  return entry
}
