/**
 * Phase 57: the opt-in known-fix report client.
 *
 * LEAF module. It MUST NOT import electron, backend/ipc or backend/utils; the
 * single permitted exception is the deep path backend/utils/aborthandler/
 * aborthandler, a pure Map module the sidecar exit contract requires. It does
 * nothing at import, never throws, and creates no timers (AbortSignal.timeout's
 * internal timer does not hold the event loop).
 *
 * D-18: Mach-O reports are one-shot best effort because verifyMacArchGroundTruth
 * fires once per install; only the CEG report is naturally retried at the next
 * install or launch. There is no retry queue (D-16).
 */
import axios from 'axios'
import {
  KNOWN_FIX_REPORT_PAIRS,
  KNOWN_FIX_REPORT_VERSION,
  RELAY_RESPONSE_STATUSES,
  parseKnownFixReport,
  reportSentKey,
  type KnownFixReportKey,
  type KnownFixReportOp
} from 'common/knownFixReport'
import { readKnownFixesWithLayer } from './knownFixes'
import { LogPrefix, logInfo, logWarning } from './logger'
import { isMac } from './constants/environment'
import {
  createAbortController,
  deleteAbortController,
  hasAbortController
} from './utils/aborthandler/aborthandler'

// Plan 57-12 replaces the host with the deployed URL after the operator
// checkpoint, and adds a test that the sentinel is gone.
export const RELAY_URL_PENDING_SENTINEL = 'OPERATOR-DEPLOY-PENDING'
export const GAMELIB_FIX_RELAY_URL =
  'https://gamelib-fix-relay.gamelib.workers.dev/v1/reports'

export const RELAY_TIMEOUT_MS = 8000

/** D-04: env override for `wrangler dev` or staging. */
export function relayUrl(): string {
  return process.env.GAMELIB_FIX_RELAY_URL || GAMELIB_FIX_RELAY_URL
}

export type RelayPost = (
  url: string,
  body: unknown,
  signal: AbortSignal
) => Promise<{ status: number; data: unknown }>

export type DetectedFix = {
  appId: string
  key: KnownFixReportKey
  op: KnownFixReportOp
  detector: 'macho' | 'ceg'
}

export interface ReportDeps {
  post: RelayPost
  isMac: () => boolean
  isEnabled: () => boolean
  readWinning: (
    appId: string
  ) => { fix: Record<string, unknown>; layer: string } | null
  sentStore: {
    get: (k: string) => unknown
    set: (k: string, v: unknown) => void
  }
  version: () => string
  now: () => number
  relayUrl: () => string
}

export type ReportOutcome =
  | 'not-mac'
  | 'disabled'
  | 'skipped-local'
  | 'skipped-known'
  | 'skipped-not-32'
  | 'already-sent'
  | 'in-flight'
  | 'no-relay'
  | 'invalid'
  | 'sent'
  | 'rejected'
  | 'retryable'
  | 'error'

function defaultDeps(): ReportDeps {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const lazyVersion = () =>
    (require('./platform') as typeof import('./platform')).app.getVersion()
  const lazyStore = () =>
    (
      require('./storeManagers/steam/electronStores') as typeof import('./storeManagers/steam/electronStores')
    ).steamKnownFixReportStore
  return {
    post: (url, body, signal) =>
      axios.post(url, body, {
        timeout: RELAY_TIMEOUT_MS,
        signal,
        maxRedirects: 0,
        validateStatus: () => true,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': `GameLib/${lazyVersion()}`
        }
      }),
    isMac: () => isMac,
    isEnabled: () => {
      const { GlobalConfig } = require('./config') as typeof import('./config')
      return GlobalConfig.get().getSettings().shareDetectedFixes === true
    },
    readWinning: (appId) => {
      const res = readKnownFixesWithLayer(appId, 'steam')
      return res
        ? {
            fix: res.fix as unknown as Record<string, unknown>,
            layer: res.layer
          }
        : null
    },
    // Lazy per call: electron-store loads only after every gate has passed.
    sentStore: {
      get: (k) => lazyStore().get(k),
      set: (k, v) => lazyStore().set(k, v)
    },
    version: lazyVersion,
    now: Date.now,
    relayUrl
  }
  /* eslint-enable @typescript-eslint/no-require-imports */
}

function wasSent(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false
  const at = (value as Record<string, unknown>).at
  return typeof at === 'number' && Number.isFinite(at)
}

export async function runKnownFixReport(
  fix: DetectedFix,
  deps: ReportDeps = defaultDeps()
): Promise<ReportOutcome> {
  let abortId: string | undefined
  try {
    if (!deps.isMac()) return 'not-mac'
    if (deps.isEnabled() !== true) return 'disabled'

    const { appId, key, op, detector } = fix
    const value = KNOWN_FIX_REPORT_PAIRS[key]

    const winning = deps.readWinning(appId)
    if (winning?.layer === 'local') return 'skipped-local'
    if (op === 'add') {
      if (winning?.fix[key] === value) return 'skipped-known'
    } else if (winning?.fix.macArch !== '32') {
      return 'skipped-not-32'
    }

    const sentKey = reportSentKey({ appId, key, op })
    if (wasSent(deps.sentStore.get(sentKey))) return 'already-sent'

    const url = deps.relayUrl()
    if (url.includes(RELAY_URL_PENDING_SENTINEL)) {
      logWarning(
        'Known-fix report: relay URL is not deployed yet, nothing sent',
        LogPrefix.Backend
      )
      return 'no-relay'
    }

    const version = deps.version()
    const body = {
      v: KNOWN_FIX_REPORT_VERSION,
      store: 'steam',
      appId,
      key,
      value,
      op,
      gamelibVersion: version
    }
    const parsed = parseKnownFixReport(body)
    if (!parsed.ok) {
      logWarning(
        `Known-fix report: invalid report not sent (${parsed.error})`,
        LogPrefix.Backend
      )
      return 'invalid'
    }

    const id = `known-fix-report:${sentKey}`
    if (hasAbortController(id)) return 'in-flight'
    abortId = id
    const ctrl = createAbortController(id)
    const signal = AbortSignal.any([
      ctrl.signal,
      AbortSignal.timeout(RELAY_TIMEOUT_MS)
    ])

    logInfo(
      `Known-fix report: sending appId ${appId} ${key}=${value} op=${op} (${detector}, GameLib ${version})`,
      LogPrefix.Backend
    )

    let res: { status: number; data: unknown }
    try {
      res = await deps.post(url, parsed.report, signal)
    } catch (e) {
      logInfo(
        `Known-fix report: send failed for appId ${appId} ${key} ${op} (${
          e instanceof Error ? e.message : 'error'
        })`,
        LogPrefix.Backend
      )
      return 'retryable'
    }

    const raw = (res.data as { status?: unknown } | null | undefined)?.status
    const relayStatus = (
      RELAY_RESPONSE_STATUSES as readonly unknown[]
    ).includes(raw)
      ? String(raw)
      : 'unknown'
    logInfo(
      `Known-fix report: relay answered HTTP ${res.status} (${relayStatus}) for appId ${appId} ${key} ${op}`,
      LogPrefix.Backend
    )

    const s = res.status
    if (s >= 200 && s <= 299) {
      deps.sentStore.set(sentKey, { at: deps.now(), status: s })
      return 'sent'
    }
    if (s >= 400 && s <= 499 && s !== 408 && s !== 429) {
      deps.sentStore.set(sentKey, { at: deps.now(), status: s })
      return 'rejected'
    }
    return 'retryable'
  } catch (e) {
    logWarning(
      `Known-fix report: unexpected error (${
        e instanceof Error ? e.message : 'unknown'
      })`,
      LogPrefix.Backend
    )
    return 'error'
  } finally {
    if (abortId) deleteAbortController(abortId)
  }
}

/** Fire-and-forget entry point for the detector hooks. Never throws. */
export function reportDetectedFix(fix: DetectedFix, deps?: ReportDeps): void {
  try {
    void runKnownFixReport(fix, deps).catch(() => undefined)
  } catch {
    // never reaches a caller
  }
}
