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

/** D-UAT-08: EResult codes steam-user's getDepotDecryptionKey/getRawManifest
 *  can surface (node_modules/steam-user/components/helpers.js's
 *  eresultError, which stamps the numeric code onto `err.eresult`) where
 *  retrying the SAME request will never succeed — the depot/app combination
 *  is permanently wrong or unavailable, not a transient CM hiccup. Values
 *  per steam-user's own EResult enum:
 *    8  InvalidParam    — malformed request (wrong appId/depotId pairing)
 *    9  FileNotFound    — the depot key/manifest is not resolvable via this
 *                         appId at all (the D-UAT-08 root cause: base appId
 *                         requested for a depot only Steam's CDN will
 *                         authorize under its DLC/sub-app's appId)
 *    15 AccessDenied    — not entitled to this depot under this appId
 *    17 Banned          — account/content banned
 *    40 Blocked         — region/content blocked
 *    42 NoMatch         — no matching depot/manifest record
 *    43 AccountDisabled — account disabled
 *  isNonRetryableDepotError is exported so withPlanBuildRetry (depot.ts) can
 *  fail fast instead of burning all PLAN_BUILD_MAX_ATTEMPTS attempts on an
 *  error that will recur byte-for-byte identically every time. */
const NON_RETRYABLE_ERESULTS = new Set([8, 9, 15, 17, 40, 42, 43])

export function isNonRetryableDepotError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false
  const eresult = (err as { eresult?: unknown }).eresult
  return typeof eresult === 'number' && NON_RETRYABLE_ERESULTS.has(eresult)
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

  // D-UAT-08: a terminal EResult from getDepotDecryptionKey/getRawManifest
  // (depot.ts's wrapDepotKeyError preserves `err.eresult` on the wrapped
  // error it throws) is NEVER a connection drop — no retry will ever fix it
  // — so it must be classified BEFORE the generic connection-dropped pattern
  // below, even though the wrapped message text ("couldn't get decryption
  // key for depot ...") can otherwise look network-adjacent. Deliberately
  // checked via `isNonRetryableDepotError(err)` (the eresult property), NOT
  // a text-pattern match on the wrapped message — a getDepotDecryptionKey
  // failure with NO eresult (e.g. a genuine transient ECONNRESET, still
  // wrapped with the same "couldn't get..." prefix for context) must fall
  // through to the connection-dropped branch below, unchanged.
  if (isNonRetryableDepotError(err)) {
    // G-23-01 (23-09, observability half only): EResult 40 (Blocked) gets its
    // own dedicated copy, checked FIRST inside this branch so ordering
    // relative to the connection-dropped pattern below is unchanged. Owning a
    // depot via the package-ownership gate does not guarantee Steam will
    // issue its decryption key — a region/DRM-gated depot can be Blocked at
    // key-request time even though the account owns it. Every other terminal
    // EResult in NON_RETRYABLE_ERESULTS still falls through to the generic
    // depotUnavailable copy below, unchanged.
    const eresult = (err as { eresult?: unknown }).eresult
    if (eresult === 40) {
      // 23.2-04 disposition: as of plan 23.2-03, a per-depot EResult 40
      // (Blocked) no longer reaches this branch at all -- buildDepotPlan
      // now skips that single depot and continues (skip-and-warn, D-01/D-02
      // of phase 23.2), reporting it upstream via
      // DepotDownloadOutcome.skippedDepots and surfaced to the user through
      // steam.download.notify.depotSkipped, not this key. This branch is
      // now the RESIDUAL TERMINAL path only: it is reached solely when the
      // all-skipped guard fires (every selected depot came back Blocked, so
      // buildDepotPlan throws an Error with .eresult = 40 instead of
      // resolving to a zero-depot plan) -- a genuine "nothing could be
      // installed" failure for which this copy's wording ("blocked...may
      // still be installable directly through the Steam client") remains
      // correct. NON_RETRYABLE_ERESULTS (above) deliberately still
      // contains 40 so withPlanBuildRetry keeps failing fast on it instead
      // of burning PLAN_BUILD_MAX_ATTEMPTS reconnects before the
      // all-skipped guard gets a chance to run.
      //
      // Composed OUTSIDE i18next.t for the same reason as depotUnavailable
      // below — the depot id survives even where i18next is stubbed without
      // interpolation support (never a raw stack trace or internal path,
      // T-21-14; just the same depot/app/eresult context wrapDepotKeyError
      // already composed).
      const base = i18next.t(
        'steam.download.error.depotBlocked',
        'This depot appears to be blocked for your account or region right now. The game may still be installable directly through the Steam client.'
      )
      return {
        key: 'steam.download.error.depotBlocked',
        message: `${base} (${text})`
      }
    }

    // Composed OUTSIDE i18next.t (rather than via {{detail}} interpolation)
    // so the depot id + owning appId + real EResult name are always present
    // in the final message even where i18next.t is stubbed/mocked without
    // interpolation support — never a raw stack trace or internal path
    // (T-21-14), just the same depot/app/eresult context wrapDepotKeyError
    // already composed.
    const base = i18next.t(
      'steam.download.error.depotUnavailable',
      "This game's content isn't available to download right now."
    )
    return {
      key: 'steam.download.error.depotUnavailable',
      message: `${base} (${text})`
    }
  }

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
    message: i18next.t(
      'steam.download.error.generic',
      'The Steam download failed. Retry to continue.'
    )
  }
}
