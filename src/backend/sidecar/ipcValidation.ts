/**
 * Boundary validation for inbound renderer IPC (Phase 67, D-08..D-11).
 *
 * Called once per inbound frame from `sidecarRpc.ts` `dispatchInvoke` / `dispatchSend`, the single
 * production reader of the handler/listener registries. Synchronous, no timers, no boot-time
 * work (sidecar exit contract).
 *
 * D-10: a rejection reports the channel, sanitised issue paths and issue codes ONLY. Issue
 * messages, inputs and unrecognized key names can echo argument values (tokens, paths) into a
 * log that may be uploaded, so they are never read here.
 *
 * Deliberately does not import `backend/logger`: sidecarRpc is a low-level module and the logger
 * pulls config. `bootstrap.ts` installs a sink so rejections reach gamelib.log.
 */
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import type { ChannelEntry } from 'common/types/ipc/schemaTypes'

export type InboundVerdict =
  | { ok: true }
  | { ok: false; channel: string; paths: string[]; codes: string[] }

const MAX_ENTRIES = 20
const MAX_SEGMENT = 64

const MAX_CHANNEL = 64

/**
 * Mirrors the Rust relay's `echo_channel` (T-67-61): an unknown channel name is attacker
 * controlled, so it is cut to 64 chars and anything outside printable ASCII becomes `?`
 * before it reaches the log line or the IPC_INVALID_ARGS wire error (67 review WR-02).
 */
function sanitiseChannel(channel: string): string {
  return String(channel)
    .slice(0, MAX_CHANNEL)
    .replace(/[^\x21-\x7e ]/g, '?')
}

function sanitisePath(path: readonly PropertyKey[]): string {
  if (path.length === 0) return '(args)'
  return path
    .map((seg) =>
      String(seg)
        .slice(0, MAX_SEGMENT)
        .replace(/[^A-Za-z0-9_-]/g, '?')
    )
    .join('.')
}

export function validateInbound(
  channel: string,
  kind: 'invoke' | 'send',
  args: unknown[],
  schemas: Readonly<Record<string, ChannelEntry>> = channelSchemas
): InboundVerdict {
  const entry = Object.prototype.hasOwnProperty.call(schemas, channel)
    ? schemas[channel]
    : undefined
  // Fail closed (D-08, D-09): ipcSchemaCoverage guarantees every registered channel has a
  // schema, so a miss here is an unknown or newly added channel, never a legitimate caller.
  // A push entry describes an OUTBOUND payload (often typing-only), never an inbound one, so an
  // inbound frame that only matches a push name fails closed too (67 review WR-01).
  if (!entry || entry.kind === 'push') {
    return {
      ok: false,
      channel: sanitiseChannel(channel),
      paths: ['(channel)'],
      codes: ['no_schema']
    }
  }
  void kind
  const result = entry.args.safeParse(args)
  if (result.success) return { ok: true }
  const paths: string[] = []
  const codes: string[] = []
  for (const issue of result.error.issues.slice(0, MAX_ENTRIES)) {
    paths.push(sanitisePath(issue.path))
    codes.push(issue.code)
  }
  return { ok: false, channel, paths, codes }
}

export function formatRejectionLog(
  kind: 'invoke' | 'send',
  verdict: Extract<InboundVerdict, { ok: false }>
): string {
  return `[sidecarRpc] IPC_INVALID_ARGS kind=${kind} channel=${verdict.channel} paths=${verdict.paths.join(',')} codes=${verdict.codes.join(',')}`
}

// Per-channel rejection throttle (67 review WR-03). A hot channel (a per-frame send whose NaN
// becomes null, a looping logError) must not write a stderr + gamelib.log line per frame.
// Counter against the injected clock: NO timer, so it cannot hold the event loop open (sidecar
// exit contract). The first LOG_BURST rejections per channel per window are logged; the rest are
// counted, and one "suppressed N" line is emitted when the next window opens.
const LOG_BURST = 5
const LOG_WINDOW_MS = 60_000
const MAX_TRACKED_CHANNELS = 256

interface ThrottleState {
  windowStart: number
  logged: number
  suppressed: number
}

export interface IpcValidatorDeps {
  /** The boot clock's `now` (a plain function so a test drives the throttle window). */
  now: () => number
  /** Receives every emitted rejection line (the logger sink; fail-soft). */
  sink: (line: string) => void
}

export interface IpcValidator {
  validateInbound: typeof validateInbound
  /** Writes the rejection line to stderr (forwarded by the shell) and the sink. */
  logRejection(
    kind: 'invoke' | 'send',
    verdict: Extract<InboundVerdict, { ok: false }>
  ): void
}

/**
 * Per-boot validator (D-05): the throttle map lives in this closure, so two validators never
 * share rejection counts and nothing survives a boot.
 */
export function createIpcValidator(deps: IpcValidatorDeps): IpcValidator {
  const throttle = new Map<string, ThrottleState>()

  function emit(line: string): void {
    process.stderr.write(`${line}\n`)
    try {
      deps.sink(line)
    } catch {
      // Fail-soft: a broken sink must not break dispatch.
    }
  }

  function logRejection(
    kind: 'invoke' | 'send',
    verdict: Extract<InboundVerdict, { ok: false }>
  ): void {
    const now = deps.now()
    const key = `${kind}:${verdict.channel}`
    let st = throttle.get(key)
    if (st && now - st.windowStart >= LOG_WINDOW_MS) {
      if (st.suppressed > 0) {
        emit(
          `[sidecarRpc] IPC_INVALID_ARGS kind=${kind} channel=${verdict.channel} suppressed=${st.suppressed} (last ${LOG_WINDOW_MS / 1000}s)`
        )
      }
      st = undefined
    }
    if (!st) {
      if (throttle.size >= MAX_TRACKED_CHANNELS) {
        // Map iterates in insertion order: evict the oldest tracked channel.
        const oldest = throttle.keys().next()
        if (!oldest.done) throttle.delete(oldest.value)
      }
      st = { windowStart: now, logged: 0, suppressed: 0 }
    }
    // Re-insert so a re-opened window counts as the newest entry.
    throttle.delete(key)
    throttle.set(key, st)
    if (st.logged >= LOG_BURST) {
      st.suppressed += 1
      return
    }
    st.logged += 1
    emit(formatRejectionLog(kind, verdict))
  }

  return { validateInbound, logRejection }
}
