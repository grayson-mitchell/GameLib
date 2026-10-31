/**
 * DRM-mode trace grammar and app-log evidence extraction (Phase 56, D-15/D-16).
 *
 * DRM mode has no GameLib shim, so there is no `HELLO shim attached` line.
 * Evidence is instead:
 *   - `[bridge-drm] ...` launch anchor (written by 56-04's
 *     `formatBridgeDrmAnchor`; this module only PARSES it), and
 *   - `[drm-trace] ...` lines written by the patched lsteamclient inside the
 *     Wine process and re-logged by the sidecar as `bridge drm [<appid>]: ...`.
 *
 * Every trace line carries `role=game|helper` (Pitfall 10): lsteamclient also
 * initialises inside the GameLib helper `steam.exe`, so an untagged
 * "CreateInterface was logged" line would pass for the helper.
 *
 * Zero imports by design (D-51-15): meta/bridgeCensus.ts bundles this module
 * with no backend module graph. `grep -c "^import" drmTrace.ts` must print 0.
 *
 * Trace-file and app-log contents are untrusted input. Every function here is
 * pure, never throws, and caps its input size before any regex runs.
 */

export const DRM_TRACE_ENV = 'GAMELIB_DRM_TRACE_FILE'

export const MAX_DRM_TRACE_BYTES = 262144
export const MAX_DRM_TRACE_LINES = 1024
export const MAX_DRM_TRACE_LINE_CHARS = 512
/** Anchor payloads carry a trace path of up to 1024 chars. */
const MAX_DRM_ANCHOR_CHARS = 1280

type DrmTraceRole = 'game' | 'helper'

// Exported for meta/bridgeCensus.ts, which lints under tsconfig.meta.json --
// outside ts-prune's tsconfig.json project, so its import is invisible here.
// ts-prune-ignore-next
export type DrmTraceEvent = {
  appId: string
  pid: number
  role: DrmTraceRole
} & (
  | { event: 'create-interface'; iface: string }
  | { event: 'call'; name: string }
  | {
      event: 'callback'
      id: number
      detail?: { key: 'resp' | 'state'; value: number }
      /** Phase 58 D-08a: per-launch peer ordinal (1..16, never a SteamID64); only on id 1202. */
      peer?: string
    }
  | ({ event: 'p2p' } & DrmP2pOp)
)

/** Phase 58 D-08a: legacy P2P peer/size evidence written by lsteamclient. */
type DrmP2pOp =
  | { op: 'accept'; peer: string; ok: 0 | 1 }
  | { op: 'send' | 'read'; peer: string; bytes: number }

// Exported for meta/bridgeCensus.ts; see DrmTraceEvent.
// ts-prune-ignore-next
export interface DrmP2pEvent {
  /** Order of the line among the game's trace events (ascending). */
  seq: number
  kind: 'request' | 'accept' | 'send' | 'read'
  peer: string
  bytes?: number
  ok?: boolean
}

interface DrmLaunchAnchor {
  appId: string
  mode: 'steamclient-layer'
  crossover: string
  client: string
  trace: string
}

// Exported for meta/bridgeCensus.ts; see DrmTraceEvent.
// ts-prune-ignore-next
export interface DrmEvidence {
  anchored: boolean
  gameInterfaces: string[]
  gameCalls: string[]
  gameCallbacks: number[]
  gameLobbyEnterOk: boolean
  gameConnStates: number[]
  /** D-08a: ordered game-role 1202 / accept / send / read events that name a peer. */
  gameP2p: DrmP2pEvent[]
  helperEvents: number
  pidConflict: boolean
}

const TRACE_CREATE_RE =
  /^\[drm-trace\] appId=(\d{1,10}) pid=([1-9]\d{0,9}) role=(game|helper) event=create-interface iface=([A-Za-z0-9_]{1,64})$/
const TRACE_CALL_RE =
  /^\[drm-trace\] appId=(\d{1,10}) pid=([1-9]\d{0,9}) role=(game|helper) event=call name=([A-Za-z0-9_]{1,128})$/
const TRACE_CALLBACK_RE =
  /^\[drm-trace\] appId=(\d{1,10}) pid=([1-9]\d{0,9}) role=(game|helper) event=callback id=([1-9]\d{0,4})(?: (?:(resp|state)=(-?\d{1,3})|peer=([1-9]\d?)))?$/
const TRACE_P2P_RE =
  /^\[drm-trace\] appId=(\d{1,10}) pid=([1-9]\d{0,9}) role=(game|helper) event=p2p op=(?:(accept) peer=([1-9]\d?) ok=([01])|(send|read) peer=([1-9]\d?) bytes=(\d{1,10}))$/

const MAX_U32 = 4294967295
const MAX_DRM_P2P_EVENTS = 256

const ANCHOR_RE =
  // eslint-disable-next-line no-control-regex
  /^\[bridge-drm\] appId=([0-9]{1,10}) mode=steamclient-layer crossover=([0-9]{1,4}(?:\.[0-9]{1,6}){2,4}) client=([0-9]{1,20}) trace=(\/[^\x00-\x1f\x7f]{0,1023})$/

const LOG_HEADER_RE =
  /^\(\d{2}:\d{2}:\d{2}\) \[[A-Z]+\]:\s+(?:\[[A-Za-z]+\]:\s+)?/

function stripCr(line: string): string {
  return line.endsWith('\r') ? line.slice(0, -1) : line
}

export function parseDrmTraceLine(line: string): DrmTraceEvent | null {
  try {
    if (typeof line !== 'string' || line.length > MAX_DRM_TRACE_LINE_CHARS) {
      return null
    }
    const l = stripCr(line)
    let m = TRACE_CREATE_RE.exec(l)
    if (m) {
      return {
        appId: m[1],
        pid: Number(m[2]),
        role: m[3] as DrmTraceRole,
        event: 'create-interface',
        iface: m[4]
      }
    }
    m = TRACE_CALL_RE.exec(l)
    if (m) {
      return {
        appId: m[1],
        pid: Number(m[2]),
        role: m[3] as DrmTraceRole,
        event: 'call',
        name: m[4]
      }
    }
    m = TRACE_CALLBACK_RE.exec(l)
    if (m) {
      const id = Number(m[4])
      const key = m[5] as 'resp' | 'state' | undefined
      if (key === 'resp' && id !== 504) return null
      if (key === 'state' && id !== 1221) return null
      if (m[7] !== undefined && (id !== 1202 || /^0+$/.test(m[7]))) return null
      const base = {
        appId: m[1],
        pid: Number(m[2]),
        role: m[3] as DrmTraceRole,
        event: 'callback' as const,
        id
      }
      if (m[7] !== undefined) return { ...base, peer: m[7] }
      return key ? { ...base, detail: { key, value: Number(m[6]) } } : base
    }
    m = TRACE_P2P_RE.exec(l)
    if (m) {
      const head = {
        appId: m[1],
        pid: Number(m[2]),
        role: m[3] as DrmTraceRole,
        event: 'p2p' as const
      }
      if (m[4]) {
        if (/^0+$/.test(m[5])) return null
        return {
          ...head,
          op: 'accept' as const,
          peer: m[5],
          ok: m[6] === '1' ? (1 as const) : (0 as const)
        }
      }
      const bytes = Number(m[9])
      if (/^0+$/.test(m[8]) || bytes > MAX_U32) return null
      return { ...head, op: m[7] as 'send' | 'read', peer: m[8], bytes }
    }
    return null
  } catch {
    return null
  }
}

/** Canonical grammar; 56-12 re-logs this text, never raw file bytes. */
export function formatDrmTraceLine(ev: DrmTraceEvent): string {
  const head = `[drm-trace] appId=${ev.appId} pid=${ev.pid} role=${ev.role}`
  if (ev.event === 'create-interface') {
    return `${head} event=create-interface iface=${ev.iface}`
  }
  if (ev.event === 'callback') {
    return (
      `${head} event=callback id=${ev.id}` +
      (ev.detail ? ` ${ev.detail.key}=${ev.detail.value}` : '') +
      (ev.peer ? ` peer=${ev.peer}` : '')
    )
  }
  if (ev.event === 'p2p') {
    return ev.op === 'accept'
      ? `${head} event=p2p op=accept peer=${ev.peer} ok=${ev.ok}`
      : `${head} event=p2p op=${ev.op} peer=${ev.peer} bytes=${ev.bytes}`
  }
  return `${head} event=call name=${ev.name}`
}

/**
 * Parsing mirror of 56-04's `formatBridgeDrmAnchor`. `trace=` is the LAST
 * field and runs to end of line, spaces included (the macOS appFolder holds
 * `Application Support`); it is never a `\S+` token. There is deliberately no
 * anchor formatter here: 56-04 is the only writer.
 */
export function parseDrmLaunchAnchor(payload: string): DrmLaunchAnchor | null {
  try {
    if (typeof payload !== 'string' || payload.length > MAX_DRM_ANCHOR_CHARS) {
      return null
    }
    const m = ANCHOR_RE.exec(stripCr(payload))
    if (!m) return null
    return {
      appId: m[1],
      mode: 'steamclient-layer',
      crossover: m[2],
      client: m[3],
      trace: m[4]
    }
  } catch {
    return null
  }
}

export function drmRelogPrefix(appId: string): string {
  return `bridge drm [${appId}]: `
}

export function parseDrmTraceFile(
  text: string,
  appId: string
):
  | { status: 'ok'; events: DrmTraceEvent[]; rejected: number }
  | { status: 'oversize' } {
  if (typeof text !== 'string' || text.length > MAX_DRM_TRACE_BYTES) {
    return { status: 'oversize' }
  }
  const events: DrmTraceEvent[] = []
  let rejected = 0
  let seen = 0
  for (const line of text.split('\n')) {
    if (line === '' || line === '\r') continue
    seen++
    if (seen > MAX_DRM_TRACE_LINES) {
      rejected++
      continue
    }
    const ev = parseDrmTraceLine(line)
    if (!ev || ev.appId !== appId) {
      rejected++
      continue
    }
    events.push(ev)
  }
  return { status: 'ok', events, rejected }
}

/** Strips one GameLib logger header if present; otherwise returns the line. */
export function appLogPayload(line: string): string {
  return line.replace(LOG_HEADER_RE, '')
}

export function extractDrmEvidence(
  appId: string,
  appLogText: string
): DrmEvidence {
  const empty: DrmEvidence = {
    anchored: false,
    gameInterfaces: [],
    gameCalls: [],
    gameCallbacks: [],
    gameLobbyEnterOk: false,
    gameConnStates: [],
    gameP2p: [],
    helperEvents: 0,
    pidConflict: false
  }
  try {
    if (!/^\d+$/.test(appId) || typeof appLogText !== 'string') return empty
    const lines = appLogText.split('\n')
    let anchorIdx = -1
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].length > MAX_DRM_ANCHOR_CHARS + 128) continue
      const a = parseDrmLaunchAnchor(appLogPayload(lines[i]))
      if (a && a.appId === appId) anchorIdx = i
    }
    if (anchorIdx < 0) return empty

    const prefix = drmRelogPrefix(appId)
    const ifaces = new Set<string>()
    const calls = new Set<string>()
    const callbacks = new Set<number>()
    const connStates = new Set<number>()
    let lobbyEnterOk = false
    const p2p: DrmP2pEvent[] = []
    let seq = 0
    const gamePids = new Set<number>()
    const helperPids = new Set<number>()
    let helperEvents = 0
    let considered = 0
    for (let i = anchorIdx + 1; i < lines.length; i++) {
      if (lines[i].length > MAX_DRM_TRACE_LINE_CHARS + 128) continue
      const payload = appLogPayload(lines[i])
      if (!payload.startsWith(prefix)) continue
      const ev = parseDrmTraceLine(payload.slice(prefix.length))
      if (!ev || ev.appId !== appId) continue
      if (++considered > MAX_DRM_TRACE_LINES) break
      if (ev.role === 'helper') {
        helperEvents++
        helperPids.add(ev.pid)
        continue
      }
      gamePids.add(ev.pid)
      seq++
      if (ev.event === 'create-interface') ifaces.add(ev.iface)
      else if (ev.event === 'p2p') {
        if (p2p.length < MAX_DRM_P2P_EVENTS) {
          p2p.push(
            ev.op === 'accept'
              ? { seq, kind: 'accept', peer: ev.peer, ok: ev.ok === 1 }
              : { seq, kind: ev.op, peer: ev.peer, bytes: ev.bytes }
          )
        }
      } else if (ev.event === 'callback') {
        callbacks.add(ev.id)
        if (ev.id === 1202 && ev.peer && p2p.length < MAX_DRM_P2P_EVENTS) {
          p2p.push({ seq, kind: 'request', peer: ev.peer })
        }
        if (ev.id === 504 && ev.detail?.value === 1) lobbyEnterOk = true
        if (ev.id === 1221 && ev.detail) connStates.add(ev.detail.value)
      } else calls.add(ev.name)
    }
    let pidConflict = false
    for (const p of gamePids) if (helperPids.has(p)) pidConflict = true
    return {
      anchored: true,
      gameInterfaces: [...ifaces],
      gameCalls: [...calls],
      gameCallbacks: [...callbacks].sort((a, b) => a - b),
      gameLobbyEnterOk: lobbyEnterOk,
      gameConnStates: [...connStates].sort((a, b) => a - b),
      gameP2p: p2p,
      helperEvents,
      pidConflict
    }
  } catch {
    return empty
  }
}

/**
 * Phase 58 D-08a over one launch's game-role events. For some peer X ALL of:
 * a 1202 delivery naming X, a later AcceptP2PSessionWithUser(X), a send to X
 * with nonzero bytes, a read from X with nonzero bytes. Returns the flags of
 * the best candidate peer (most clauses met) so a failure can say which clause
 * is missing. The peer is never returned: callers print fixed phrases only.
 */
// Exported for meta/bridgeCensus.ts; see DrmTraceEvent.
// ts-prune-ignore-next
export function scoreLegacyP2pJoin(events: DrmP2pEvent[]): {
  request: boolean
  accepted: boolean
  send: boolean
  read: boolean
  complete: boolean
} {
  const none = {
    request: false,
    accepted: false,
    send: false,
    read: false,
    complete: false
  }
  let best = none
  let bestScore = -1
  const peers = new Set(events.map((e) => e.peer))
  for (const peer of peers) {
    const mine = events.filter((e) => e.peer === peer)
    const reqSeq = mine.find((e) => e.kind === 'request')?.seq
    const request = reqSeq !== undefined
    const accepted =
      request && mine.some((e) => e.kind === 'accept' && e.seq > reqSeq)
    const send = mine.some((e) => e.kind === 'send' && (e.bytes ?? 0) > 0)
    const read = mine.some((e) => e.kind === 'read' && (e.bytes ?? 0) > 0)
    const score = [request, accepted, send, read].filter(Boolean).length
    if (score > bestScore) {
      bestScore = score
      best = {
        request,
        accepted,
        send,
        read,
        complete: request && accepted && send && read
      }
    }
  }
  return best
}
