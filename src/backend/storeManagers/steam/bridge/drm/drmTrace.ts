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
)

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
  helperEvents: number
  pidConflict: boolean
}

const TRACE_CREATE_RE =
  /^\[drm-trace\] appId=(\d{1,10}) pid=([1-9]\d{0,9}) role=(game|helper) event=create-interface iface=([A-Za-z0-9_]{1,64})$/
const TRACE_CALL_RE =
  /^\[drm-trace\] appId=(\d{1,10}) pid=([1-9]\d{0,9}) role=(game|helper) event=call name=([A-Za-z0-9_]{1,128})$/

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
    return null
  } catch {
    return null
  }
}

/** Canonical grammar; 56-12 re-logs this text, never raw file bytes. */
export function formatDrmTraceLine(ev: DrmTraceEvent): string {
  const head = `[drm-trace] appId=${ev.appId} pid=${ev.pid} role=${ev.role}`
  return ev.event === 'create-interface'
    ? `${head} event=create-interface iface=${ev.iface}`
    : `${head} event=call name=${ev.name}`
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
      if (ev.event === 'create-interface') ifaces.add(ev.iface)
      else calls.add(ev.name)
    }
    let pidConflict = false
    for (const p of gamePids) if (helperPids.has(p)) pidConflict = true
    return {
      anchored: true,
      gameInterfaces: [...ifaces],
      gameCalls: [...calls],
      helperEvents,
      pidConflict
    }
  } catch {
    return empty
  }
}
