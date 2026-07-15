// Phase 21 (21-06): Error classification -> plain-language, actionable copy (D-06).
//
// The depot-download pipeline surfaces failures from several layers — a
// thrown Error from plan-building/content-server resolution, or a plain
// string from downloadDepotFiles's own DepotDownloadFailure.error (Plan 05
// already reduces per-file failures to `(err as Error).message` before they
// reach the caller). classifyDepotError accepts either shape and maps known
// failure signatures to copy a user can act on — never a raw stack trace or
// internal path (T-21-14).
//
// Classification is signature-based (regex over the error text), not
// instanceof-based: by the time a failure reaches this module it may already
// be a bare string (downloadDepotFiles's failures[] array), so type
// information from the original throw site is not reliably available.

import i18next from 'i18next'

export interface ClassifiedDepotError {
  /** Locale key the classified message was resolved from — useful for tests
   *  and any future analytics, never shown to the user directly. */
  key: string
  /** Plain-language, actionable message safe to surface in the
   *  DownloadManager queue's existing generic error+Retry UI (D-06). */
  message: string
}

function errorText(err: unknown): string {
  if (typeof err === 'string') return err
  if (err instanceof Error) return err.message
  return String(err)
}

/**
 * Maps a depot-download failure (Error or plain string) to plain-language,
 * actionable copy (D-06): "Steam servers dropped the connection", "Out of
 * disk space", etc. Never returns/logs the raw error — only the classified,
 * translated message (T-21-14). Falls back to a generic retry message for
 * anything unrecognized.
 */
export function classifyDepotError(err: unknown): ClassifiedDepotError {
  const text = errorText(err)

  // Disk-full — Node's ENOSPC surfaces in the message text even after it has
  // already been reduced to a string by downloadDepotFiles.
  if (/ENOSPC/i.test(text)) {
    return {
      key: 'steam.download.error.diskFull',
      message: i18next.t('steam.download.error.diskFull', 'Out of disk space.')
    }
  }

  // Path-traversal reject (T-21-01) — depot.ts's own PathTraversalError message.
  if (/traversal/i.test(text)) {
    return {
      key: 'steam.download.error.unsafePath',
      message: i18next.t(
        'steam.download.error.unsafePath',
        'The download contained an unsafe file path and was stopped.'
      )
    }
  }

  // Whole-file or per-chunk SHA1 verification failure (T-21-03).
  if (/sha1 mismatch/i.test(text)) {
    return {
      key: 'steam.download.error.verifyFailed',
      message: i18next.t(
        'steam.download.error.verifyFailed',
        'A downloaded file failed verification.'
      )
    }
  }

  // CDN/connection drop — fetchChunk's exhausted-retries message
  // ("chunk <sha> failed after N attempts: ...") and common network error
  // signatures (CDN <status>, ECONNRESET, ETIMEDOUT, ENOTFOUND, fetch failed).
  if (
    /failed after \d+ attempts|CDN \d|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|no content servers/i.test(
      text
    )
  ) {
    return {
      key: 'steam.download.error.connectionDropped',
      message: i18next.t(
        'steam.download.error.connectionDropped',
        'Steam servers dropped the connection. Retry to continue.'
      )
    }
  }

  return {
    key: 'steam.download.error.generic',
    message: i18next.t('steam.download.error.generic', 'The Steam download failed. Retry to continue.')
  }
}
