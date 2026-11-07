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
  if (!entry) {
    return { ok: false, channel, paths: ['(channel)'], codes: ['no_schema'] }
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

let rejectionSink: ((line: string) => void) | null = null

export function setIpcRejectionLogSink(
  sink: ((line: string) => void) | null
): void {
  rejectionSink = sink
}

/** Writes the rejection line to stderr (forwarded by the shell) and the optional sink. */
export function logRejection(
  kind: 'invoke' | 'send',
  verdict: Extract<InboundVerdict, { ok: false }>
): void {
  const line = formatRejectionLog(kind, verdict)
  process.stderr.write(`${line}\n`)
  if (rejectionSink) {
    try {
      rejectionSink(line)
    } catch {
      // Fail-soft: a broken sink must not break dispatch.
    }
  }
}
