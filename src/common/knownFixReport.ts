/**
 * D-03: the single source of truth for the known-fix report wire format, shared
 * by the sidecar client and relay/.
 *
 * RULE: this file imports ONLY `zod`. No path-aliased imports (`common/...`,
 * anything under `backend/`): wrangler's esbuild bundles it from outside relay/
 * and does not apply the root baseUrl (RESEARCH Pitfall 7).
 *
 * D-19: the payload carries no title, user id or path. The schema is strict, so
 * adding such a field is a test failure.
 */
import { z } from 'zod'

/** The only (key, value) pairs a report may carry (D-14). */
export const KNOWN_FIX_REPORT_PAIRS = { macArch: '32', drm: 'ceg' } as const
export type KnownFixReportKey = keyof typeof KNOWN_FIX_REPORT_PAIRS

const KNOWN_FIX_REPORT_OPS = ['add', 'remove'] as const
export type KnownFixReportOp = (typeof KNOWN_FIX_REPORT_OPS)[number]

export const KNOWN_FIX_REPORT_VERSION = 1

/** Relay request body cap in bytes (D-15). */
export const KNOWN_FIX_REPORT_MAX_BYTES = 2048

const knownFixReportSchema = z
  .object({
    v: z.literal(KNOWN_FIX_REPORT_VERSION),
    store: z.literal('steam'),
    appId: z.string().regex(/^[1-9][0-9]{0,9}$/),
    key: z.enum(['macArch', 'drm']),
    value: z.enum(['32', 'ceg']),
    op: z.enum(KNOWN_FIX_REPORT_OPS),
    gamelibVersion: z.string().regex(/^[0-9A-Za-z.+-]{1,40}$/)
  })
  .strict()
  .refine((r) => KNOWN_FIX_REPORT_PAIRS[r.key] === r.value, {
    message: 'pair not allowed'
  })
  .refine((r) => r.op === 'add' || r.key === 'macArch', {
    message: 'only macArch can be removed'
  })

export type KnownFixReport = z.infer<typeof knownFixReportSchema>

export function parseKnownFixReport(
  input: unknown
): { ok: true; report: KnownFixReport } | { ok: false; error: string } {
  const res = knownFixReportSchema.safeParse(input)
  if (res.success) return { ok: true, report: res.data }
  const error = res.error.issues
    .map((i) => i.message)
    .join('; ')
    .slice(0, 200)
  return { ok: false, error }
}

/** D-16 sent-record key and D-13 relay dedup key. */
export function reportSentKey(
  r: Pick<KnownFixReport, 'appId' | 'key' | 'op'>
): string {
  return `${r.appId}:${r.key}:${r.op}`
}

export const RELAY_RESPONSE_STATUSES = [
  'created',
  'updated',
  'counted',
  'already-known',
  'suppressed',
  'skipped',
  'rejected',
  'rate-limited',
  'unavailable'
] as const
type RelayResponseStatus = (typeof RELAY_RESPONSE_STATUSES)[number]

/**
 * The relay writes this body; the client logs only `status` (D-10).
 *
 * @public imported by relay/src/handler.ts, which knip does not scan
 */
export type RelayResponseBody = {
  status: RelayResponseStatus
  detail?: string
  pr?: number
  issue?: number
}
