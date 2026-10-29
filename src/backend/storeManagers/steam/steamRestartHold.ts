/**
 * Quick 261029-pkp (D-UAT-13 follow-up): the persisted "Restart Steam to
 * finish" hold record.
 *
 * The hold itself lives on the in-memory install poll. A GameLib/sidecar
 * restart would lose it, the StateFlags 4 manifest would read as installed,
 * and Play would open Steam's install dialog (the running client never
 * re-read the manifest). So when the hold arms, a record of the Steam
 * process(es) alive at that moment (PID + opaque start-time token) is stored;
 * at boot the hold is re-armed only for an app whose recorded process is
 * still the live one.
 *
 * LEAF module: never throws, does nothing at import. Disk content is
 * untrusted and safe-parsed.
 */

export interface SteamRestartHoldRecord {
  pids: Array<{ pid: number; startToken: string }>
  recordedAt: number
  macNativeRoute: boolean
  skippedDepots: string[]
}

/** Structural subset of CacheStore, so tests can pass an in-memory fake. */
export interface SteamRestartHoldStore {
  get: (key: string) => unknown
  set: (key: string, value: SteamRestartHoldRecord) => void
  delete: (key: string) => void
  entries: () => Array<[string, unknown]>
}

function defaultStore(): SteamRestartHoldStore {
  // Lazy: keeps electron-store out of module load (nothing runs at import).
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { steamRestartHoldStore } =
    require('./electronStores') as typeof import('./electronStores')
  /* eslint-enable @typescript-eslint/no-require-imports */
  return steamRestartHoldStore as unknown as SteamRestartHoldStore
}

function parseRecord(value: unknown): SteamRestartHoldRecord | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  if (!Array.isArray(v.pids) || v.pids.length === 0) return undefined
  const pids: SteamRestartHoldRecord['pids'] = []
  for (const entry of v.pids) {
    if (!entry || typeof entry !== 'object') return undefined
    const e = entry as Record<string, unknown>
    if (
      typeof e.pid !== 'number' ||
      !Number.isSafeInteger(e.pid) ||
      e.pid <= 0 ||
      typeof e.startToken !== 'string' ||
      e.startToken === ''
    ) {
      return undefined
    }
    pids.push({ pid: e.pid, startToken: e.startToken })
  }
  if (typeof v.recordedAt !== 'number' || !Number.isFinite(v.recordedAt)) {
    return undefined
  }
  const skipped = v.skippedDepots
  if (
    !Array.isArray(skipped) ||
    !skipped.every((d): d is string => typeof d === 'string')
  ) {
    return undefined
  }
  return {
    pids,
    recordedAt: v.recordedAt,
    macNativeRoute: v.macNativeRoute === true,
    skippedDepots: skipped
  }
}

export function recordSteamRestartHold(
  appId: string,
  record: SteamRestartHoldRecord,
  store: SteamRestartHoldStore = defaultStore()
): void {
  try {
    store.set(appId, record)
  } catch {
    // Persistence is best-effort; the in-memory hold is unaffected.
  }
}

export function readSteamRestartHold(
  appId: string,
  store: SteamRestartHoldStore = defaultStore()
): SteamRestartHoldRecord | undefined {
  try {
    return parseRecord(store.get(appId))
  } catch {
    return undefined
  }
}

export function clearSteamRestartHold(
  appId: string,
  store: SteamRestartHoldStore = defaultStore()
): void {
  try {
    store.delete(appId)
  } catch {
    // Best-effort.
  }
}

export function listSteamRestartHolds(
  store: SteamRestartHoldStore = defaultStore()
): Array<[string, SteamRestartHoldRecord]> {
  const out: Array<[string, SteamRestartHoldRecord]> = []
  try {
    for (const [appId, value] of store.entries()) {
      const record = parseRecord(value)
      if (record) out.push([appId, record])
    }
  } catch {
    // Unreadable store: behave as empty.
  }
  return out
}

export type SteamRestartHoldRearmDecision =
  | { kind: 'arm'; pids: number[] }
  | { kind: 'drop'; reason: 'expired' | 'steam-exited' | 'pid-reused' }
  | { kind: 'unknown' }

/**
 * Pure re-arm decision. `unknown` means a probe was inconclusive: the caller
 * must neither arm nor delete the record.
 */
export function decideSteamRestartHoldRearm(args: {
  record: SteamRestartHoldRecord
  livePids: number[] | undefined
  startTokens: Map<number, string> | undefined
  nowMs: number
  maxAgeMs: number
}): SteamRestartHoldRearmDecision {
  const { record, livePids, startTokens, nowMs, maxAgeMs } = args
  if (livePids === undefined) return { kind: 'unknown' }
  if (nowMs - record.recordedAt >= maxAgeMs) {
    return { kind: 'drop', reason: 'expired' }
  }
  const candidates = record.pids.filter((p) => livePids.includes(p.pid))
  if (candidates.length === 0) return { kind: 'drop', reason: 'steam-exited' }
  if (startTokens === undefined) return { kind: 'unknown' }
  const matching = candidates.filter(
    (p) => startTokens.get(p.pid) === p.startToken
  )
  if (matching.length === 0) return { kind: 'drop', reason: 'pid-reused' }
  return { kind: 'arm', pids: matching.map((p) => p.pid) }
}
