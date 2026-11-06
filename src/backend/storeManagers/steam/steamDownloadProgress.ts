/**
 * quick 261029-sex (spike 050): pure helpers behind the live Steam download percent and speed.
 *
 * Steam does not rewrite the ACF mid-download, so the Downloads hero used to read 0 % for the
 * whole download. The signal that does move is steam_osx's per-flow nettop `bytes_in`, anchored
 * by the `update started : download D/T` line in content_log.txt.
 *
 * LEAF module: no imports, no module-level state. The process plumbing lives in
 * steamDownloadMonitor.ts.
 */

type ContentLogEvent =
  | {
      kind: 'started'
      appId: string
      downloadDone: number
      downloadTotal: number
    }
  | { kind: 'phase'; appId: string; phase: string }
  | { kind: 'ended'; appId: string }
  | { kind: 'session' }

/** content_log.txt is CRLF and `.` never matches `\r`, so strip it before matching. */
export function parseContentLogLine(raw: string): ContentLogEvent | null {
  const line = raw.replace(/\r/g, '')
  // Steam writes this once per client start-up; no update survives a restart.
  if (/^\[[^\]]*\] Client version: /.test(line)) return { kind: 'session' }
  let m = line.match(
    /AppID (\d+) update started : download (\d+)\/(\d+)(?:,|\s|$)/
  )
  const startedAppId = m?.[1]
  if (m && startedAppId !== undefined) {
    return {
      kind: 'started',
      appId: startedAppId,
      downloadDone: Number(m[2]),
      downloadTotal: Number(m[3])
    }
  }
  m = line.match(/AppID (\d+) App update changed : (.*)$/)
  const changedAppId = m?.[1]
  const changedPhase = m?.[2]
  if (changedAppId !== undefined && changedPhase !== undefined) {
    const phase = changedPhase.trim().replace(/,$/, '')
    if (phase === 'None') return { kind: 'ended', appId: changedAppId }
    return { kind: 'phase', appId: changedAppId, phase }
  }
  m = line.match(
    /AppID (\d+) (?:scheduler finished|finished update|update canceled)/
  )
  const endedAppId = m?.[1]
  if (endedAppId !== undefined) return { kind: 'ended', appId: endedAppId }
  return null
}

export type NettopRow =
  | { kind: 'header' }
  | { kind: 'flow'; flow: string; bytesIn: number }

/** Parses one line of `nettop -x -J bytes_in` output (pty, so CRLF). */
export function parseNettopRow(raw: string): NettopRow | null {
  const line = raw.replace(/\r/g, '')
  if (line.startsWith(',bytes_in')) return { kind: 'header' }
  const m = line.match(/^(?:tcp|udp)\S*\s+(\S+),(\d*),/)
  const flow = m?.[1]
  if (!m || !m[2] || flow === undefined) return null
  if (flow.includes('127.0.0.1') || flow.includes('::1')) return null
  const bytesIn = Number(m[2])
  if (!Number.isFinite(bytesIn)) return null
  return { kind: 'flow', flow, bytesIn }
}

export type FlowAccumulator = {
  cum: number
  blocks: number
  flows: Map<string, number>
}

export function createFlowAccumulator(): FlowAccumulator {
  return { cum: 0, blocks: 0, flows: new Map() }
}

/** Applies a parsed row. The first block is a baseline only. Mutates and returns the accumulator. */
export function applyNettopRow(
  acc: FlowAccumulator,
  row: NettopRow
): FlowAccumulator {
  if (row.kind === 'header') {
    acc.blocks++
    return acc
  }
  const prev = acc.flows.get(row.flow)
  if (acc.blocks > 1) {
    // A flow first seen after the baseline counts from 0; a decrease (reused 4-tuple) adds nothing.
    const base = prev ?? 0
    if (row.bytesIn > base) acc.cum += row.bytesIn - base
  }
  acc.flows.set(row.flow, row.bytesIn)
  return acc
}

type ActiveUpdate = {
  downloadDone: number
  downloadTotal: number
  cumAtStart: number
}

export type UpdateTracker = { active: Map<string, ActiveUpdate> }

export function createUpdateTracker(): UpdateTracker {
  return { active: new Map() }
}

export function applyContentLogEvent(
  tracker: UpdateTracker,
  event: ContentLogEvent,
  cumNow: number
): UpdateTracker {
  if (event.kind === 'session') {
    // A new Steam client session: any `update started` before it can never get its end line.
    tracker.active.clear()
  } else if (event.kind === 'started') {
    tracker.active.set(event.appId, {
      downloadDone: event.downloadDone,
      downloadTotal: event.downloadTotal,
      cumAtStart: cumNow
    })
  } else if (event.kind === 'ended') {
    tracker.active.delete(event.appId)
  }
  return tracker
}

export function activeCount(tracker: UpdateTracker): number {
  return tracker.active.size
}

type LiveProgress = {
  bytesDone: number
  total: number
  /** 0..99, unrounded. */
  percent: number
}

export function liveProgress(input: {
  downloadDone: number
  downloadTotal: number
  cumAtStart: number
  cumNow: number
  acfBytesDownloaded: number
  acfBytesToDownload: number
}): LiveProgress | undefined {
  const total =
    input.acfBytesToDownload > 0
      ? input.acfBytesToDownload
      : input.downloadTotal
  if (!(total > 0)) return undefined
  const bytesDone = Math.max(
    input.acfBytesDownloaded,
    input.downloadDone + Math.max(0, input.cumNow - input.cumAtStart)
  )
  return { bytesDone, total, percent: Math.min(99, (bytesDone / total) * 100) }
}

/** Bytes/s over the samples inside `windowMs`. undefined when not measurable. */
export function windowRate(
  samples: { ms: number; cum: number }[],
  nowMs: number,
  windowMs = 3000
): number | undefined {
  const inWin = samples.filter((s) => nowMs - s.ms <= windowMs)
  if (inWin.length < 2) return undefined
  const first = inWin[0]
  const last = inWin[inWin.length - 1]
  if (first === undefined || last === undefined) return undefined
  const dt = last.ms - first.ms
  if (dt < 500) return undefined
  const rate = ((last.cum - first.cum) / dt) * 1000
  if (!Number.isFinite(rate) || rate < 0) return undefined
  return rate
}
