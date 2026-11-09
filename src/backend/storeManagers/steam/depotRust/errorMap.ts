// D-09: turn Rust failure records back into the signal classifyDepotError reads (it is
// signature/property based, not instanceof based), so the UI sees the same copy and action as
// the legacy TS pipeline. Pure: no timers, handles or side-effecting imports.
//
// Where the legacy TS signal comes from, per kind:
//   cdn_http             decompress.ts ChunkHttpError: message `CDN <status>`
//   decode_failed        chunkDecode.ts ChunkDecodeError: `.code` in DECODE_STAGE_ERROR_CODES
//   size_mismatch        same ChunkDecodeError family: `.code === 'size_mismatch'`
//   disk_full            Node fs error: message contains `ENOSPC`
//   path_traversal       download.ts PathTraversalError: message contains `traversal`
//   sha1_mismatch        download.ts L873 whole-file `SHA1 mismatch` message
//   network              fetch/undici errors: ECONNRESET, ETIMEDOUT, ...
//   no_content_servers   contentServers.ts: `no content servers available`
//   not_signed_in        plan.ts / outcome.ts: `no authenticated Steam CM connection`
//   manifest_unavailable plan.ts wrapDepotKeyError: numeric `.eresult` property
//   stall                downloadFiles.ts run-scoped give-up: `isStall` + `msSinceProgress`
//   manifest_decode, io, symlink_failed, path_collision, delta_unsupported
//                        no dedicated signature: generic bucket (`steam.download.error.generic`)

import { classifyDepotError } from '../depotErrors'
import { DECODE_STAGE_ERROR_CODES } from '../depotDecodeErrors'
import {
  selectPrimaryDepotFailure,
  type downloadSteamDepots
} from '../depot/outcome'
import type { DepotDownloadFailure } from '../depot/planModel'
import type { RustFailure, RustOutcome } from './types'

// The UI-facing outcome shape; derived so depot/outcome.ts need not export its interface.
type DepotDownloadOutcome = Awaited<ReturnType<typeof downloadSteamDepots>>

const NETWORK_SIGNATURE =
  /CDN \d|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|no content servers/i

function ensure(message: string, pattern: RegExp, prefix: string): string {
  return pattern.test(message) ? message : `${prefix}: ${message}`
}

export function rustFailureToError(f: RustFailure): Error {
  const m = f.message
  switch (f.kind) {
    case 'disk_full':
      return new Error(ensure(m, /ENOSPC/i, 'ENOSPC'))
    case 'path_traversal':
      return new Error(ensure(m, /traversal/i, 'path traversal'))
    case 'sha1_mismatch':
      return new Error(ensure(m, /sha1 mismatch/i, 'sha1 mismatch'))
    case 'not_signed_in':
      return new Error(
        ensure(
          m,
          /no authenticated Steam CM connection/i,
          'no authenticated Steam CM connection'
        )
      )
    case 'no_content_servers':
      return new Error(ensure(m, /no content servers/i, 'no content servers'))
    case 'network':
      return new Error(ensure(m, NETWORK_SIGNATURE, 'fetch failed'))
    case 'cdn_http': {
      const err = new Error(
        /CDN \d/.test(m) ? m : `CDN ${f.httpStatus ?? 0}: ${m}`
      ) as Error & { status?: number }
      if (f.httpStatus !== null) err.status = f.httpStatus
      return err
    }
    case 'decode_failed':
    case 'size_mismatch': {
      const err = new Error(m) as Error & { code?: string }
      // A code outside the decode set would silently reclassify as generic, so the kind's own
      // name stands in when the Rust side sent none (both names are in the set).
      const code = f.code ?? f.kind
      err.code = DECODE_STAGE_ERROR_CODES.has(code) ? code : f.kind
      return err
    }
    case 'manifest_unavailable': {
      const err = new Error(m) as Error & { eresult?: number }
      if (f.eresult !== null) err.eresult = f.eresult
      return err
    }
    case 'stall': {
      return Object.assign(new Error(m), {
        isStall: true as const,
        msSinceProgress: f.msSinceProgress ?? 0
      })
    }
    case 'manifest_decode':
    case 'io':
    case 'symlink_failed':
    case 'path_collision':
    case 'delta_unsupported':
      return new Error(m)
  }
}

function toDownloadFailure(f: RustFailure): DepotDownloadFailure {
  const cause = rustFailureToError(f)
  return {
    file: f.file ?? '',
    error: cause.message,
    cause,
    ...(f.scope === 'run' ? { scope: 'run' as const } : {})
  }
}

/**
 * Converts a Rust outcome to the UI-facing outcome. Primary failure selection and
 * classification go through the same `selectPrimaryDepotFailure` / `classifyDepotError` the
 * legacy pipeline uses (D-09), so a run-scoped failure beats a file-level one.
 */
export function rustOutcomeToDepotOutcome(
  o: RustOutcome,
  skippedDepots?: string[]
): DepotDownloadOutcome {
  if (o.status === 'cancelled') return { status: 'cancelled', skippedDepots }
  if (o.status === 'completed') return { status: 'done', skippedDepots }
  const failures = o.failures.map(toDownloadFailure)
  const primary =
    failures.length > 0 ? selectPrimaryDepotFailure(failures) : undefined
  const classified = classifyDepotError(
    primary ? (primary.cause ?? primary.error) : new Error('depot job failed')
  )
  return {
    status: 'error',
    error: classified.message,
    errorAction: classified.action,
    skippedDepots
  }
}
