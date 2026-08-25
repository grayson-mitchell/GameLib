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
import { isDecodeStageError } from './depot/decompress'
import type { InstallErrorAction } from 'common/types/game_manager'

/** 37-02 (D-06): the structured affordance a classified failure carries,
 *  separate from its translated message text. 'retry' means the existing
 *  generic error+Retry UI is correct as-is; 'signIn' means the failure needs
 *  a "Sign in to Steam" action instead (D-07 — retrying a not-signed-in
 *  abort can only fail again); 'none' means neither affordance applies
 *  (e.g. disk full, unsafe path — the user must act outside this dialog).
 *  Declared as an ALIAS of InstallErrorAction (common/types/game_manager.ts)
 *  — not a separately-declared identical union — so the two can never drift
 *  apart. common/ cannot import from backend/, so the canonical union lives
 *  there and this backend-local name is just a re-export. */
export type DepotErrorAction = InstallErrorAction

export interface ClassifiedDepotError {
  /** Locale key the classified message was resolved from — useful for tests
   *  and any future analytics, never shown to the user directly. */
  key: string
  /** Plain-language, actionable message safe to surface in the
   *  DownloadManager queue's existing generic error+Retry UI (D-06). */
  message: string
  /** 37-02 (D-06): the structured affordance this failure carries. Every
   *  branch below assigns one explicitly — no optional marker, so a new
   *  branch can't be added without deciding its action. */
  action: DepotErrorAction
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
        message: `${base} (${text})`,
        action: 'none'
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
      message: `${base} (${text})`,
      action: 'none'
    }
  }

  // 37-02 (D-07): a plan-build abort caused by no authenticated Steam CM
  // connection is not a download failure at all — it never reached the
  // network. Checked by the auth abort's OWN signature (depot.ts's
  // buildDepotPlan throws this exact text), before ANY other branch, so it
  // can never be misclassified as a generic/connection-dropped retry case.
  // Deliberately offers no "Retry" wording: retrying without first signing
  // in can only fail again in the identical way.
  if (/no authenticated Steam CM connection/i.test(text)) {
    return {
      key: 'steam.download.error.notSignedIn',
      message: i18next.t(
        'steam.download.error.notSignedIn',
        'You are not signed in to Steam, so this download could not start.'
      ),
      action: 'signIn'
    }
  }

  // Disk-full — Node's ENOSPC surfaces in the message text even after it has
  // already been reduced to a string by downloadDepotFiles.
  if (/ENOSPC/i.test(text)) {
    return {
      key: 'steam.download.error.diskFull',
      message: i18next.t('steam.download.error.diskFull', 'Out of disk space.'),
      action: 'none'
    }
  }

  // Path-traversal reject (T-21-01) — depot.ts's own PathTraversalError message.
  if (/traversal/i.test(text)) {
    return {
      key: 'steam.download.error.unsafePath',
      message: i18next.t(
        'steam.download.error.unsafePath',
        'The download contained an unsafe file path and was stopped.'
      ),
      action: 'none'
    }
  }

  // Whole-file or per-chunk SHA1 verification failure (T-21-03).
  if (/sha1 mismatch/i.test(text)) {
    return {
      key: 'steam.download.error.verifyFailed',
      message: i18next.t(
        'steam.download.error.verifyFailed',
        'A downloaded file failed verification.'
      ),
      action: 'retry'
    }
  }

  // 37-02 (D-08): a fully-exhausted decode-stage failure (fetchChunk's
  // requeue guard gave up after every host/attempt combination produced the
  // SAME deterministic ChunkDecodeError code — see decompress.ts's own
  // doc comment) is a data-decode problem, never a network one, even though
  // its message text is fetchChunk's generic "failed after N attempts:
  // ..." exhaustion wrapper. Checked via `isDecodeStageError(err)` — the
  // PROPERTY carried on `.code`, not a text pattern — same discipline as
  // `isNonRetryableDepotError` above, and must run BEFORE the network
  // alternation below since the message text alone cannot distinguish the
  // two causes.
  if (isDecodeStageError(err)) {
    return {
      key: 'steam.download.error.decodeFailed',
      message: i18next.t(
        'steam.download.error.decodeFailed',
        'Downloaded game data could not be unpacked. This is not a network problem.'
      ),
      action: 'retry'
    }
  }

  // CDN/connection drop — common network error signatures (CDN <status>,
  // ECONNRESET, ETIMEDOUT, ENOTFOUND, EAI_AGAIN, fetch failed, no content
  // servers). 37-02 (D-08): this alternation NO LONGER includes fetchChunk's
  // generic "failed after N attempts" exhaustion-wrapper text — that phrase
  // describes the SHAPE of a failure (every attempt was exhausted), not its
  // CAUSE, and a decode-stage exhaustion (deterministic, never fixed by
  // another pass) now reaches the dedicated branch above via its `.code`
  // before this alternation is ever tested. An exhaustion message with none
  // of these genuine network signatures falls through to the generic case
  // below instead of being misattributed to the network.
  if (
    /CDN \d|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|no content servers/i.test(
      text
    )
  ) {
    return {
      key: 'steam.download.error.connectionDropped',
      // 37-02 (D-06): the affordance ("Retry to continue.") is now carried
      // by `action: 'retry'`, not baked into the message text. The i18next.t
      // lookup key is deliberately the NEW `connectionDroppedV2` locale key
      // (no catalog entry, so this string-literal default always renders) —
      // the OLD `connectionDropped` catalog entry in
      // public/locales/en/translation.json still has the pre-37-02 wording
      // and i18next prefers a catalog hit over the call-site default, so
      // reusing the old key here would silently keep shipping "Retry to
      // continue." wherever that catalog is loaded. `.key` below stays the
      // OLD semantic identifier — unchanged for every existing
      // test/analytics consumer — this V2 split is purely a locale-lookup
      // detail, invisible outside this function.
      message: i18next.t(
        'steam.download.error.connectionDroppedV2',
        'Steam servers dropped the connection.'
      ),
      action: 'retry'
    }
  }

  return {
    key: 'steam.download.error.generic',
    // 37-02 (D-06/D-08): same NEW-key-for-lookup, OLD-key-for-identity split
    // as connectionDropped above — public/locales/en/translation.json's
    // existing `generic` entry still carries "Retry to continue."
    message: i18next.t(
      'steam.download.error.genericV2',
      'The Steam download failed.'
    ),
    action: 'retry'
  }
}
