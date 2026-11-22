// Depot plan model: option interfaces, failure records and the content-server shape (extracted from
// ../depot.ts, 62-09). The EDepotFileFlag constants and the DepotPlan shape went with the TS
// download pipeline in 73-20; the Rust crate owns both now.

import type { GlobalConfigSlice } from 'backend/config'
import { type AuthSessionReason } from '../userTypes'
import type { SteamUserSlice } from 'backend/services/types'
import type { DepotRuntime } from '../steamInstallRuntime'

/** The boot-owned SteamUser members the depot pipeline calls (D-66.3-16). */
export type DepotSteamUser = Pick<
  SteamUserSlice,
  | 'acquireAuthenticated'
  | 'acquireOpenAuthenticated'
  | 'getClient'
  | 'getPersistedSteamId64'
>

/** Numeric-only guard for appId before any network/filesystem use (T-21-05). */
export const NUMERIC_ID = /^\d+$/

/**
 * Render a thrown depot failure for the log with the fields that actually
 * discriminate causes — `code` (fs/HTTP errors: EISDIR, ENOSPC, ECONNRESET)
 * and `eresult` (Steam CM errors) — which `(err as Error).message` alone
 * drops. These are the exact two properties classifyDepotError reads
 * (37-02 D-08), so a failure that reaches the UNCLASSIFIED generic bucket
 * now leaves behind the same evidence the classifier saw and rejected.
 *
 * Exported for depot.test.ts. Never throws: a non-Error thrown value
 * (string, undefined, a rejected non-Error) must still produce a log line
 * rather than replacing a download failure with a TypeError.
 */
export function describeDepotFailure(err: unknown): string {
  // Only string/number are rendered for code/eresult: an object-valued
  // property would stringify to a useless "[object Object]" and is better
  // omitted than logged as noise (also what keeps this no-base-to-string
  // clean rather than suppressed).
  const scalar = (v: unknown): string | undefined =>
    typeof v === 'string' || typeof v === 'number' ? String(v) : undefined

  if (typeof err !== 'object' || err === null) {
    return typeof err === 'string' ? err : String(err)
  }

  const e = err as { message?: unknown; code?: unknown; eresult?: unknown }
  const parts: string[] = []
  if (typeof e.message === 'string' && e.message) {
    parts.push(e.message)
  } else if (err instanceof Error) {
    // `new Error('')` — no message, but the name still identifies the class.
    parts.push(err.name)
  }

  const code = scalar(e.code)
  if (code !== undefined) parts.push(`code=${code}`)
  const eresult = scalar(e.eresult)
  if (eresult !== undefined) parts.push(`eresult=${eresult}`)

  return parts.length ? parts.join(' ') : '[non-Error value thrown]'
}
/**
 * One failed file (or, with `scope: 'run'`, the whole run). Lives here rather than in the TS
 * download module so the Rust error map and `selectPrimaryDepotFailure` outlive it (73-19).
 */
export interface DepotDownloadFailure {
  file: string
  error: string
  /** 37-02: the original thrown value, so classifyDepotError can read `.code`/`.eresult` off it
   *  instead of the flattened `error` string. Optional: not every producer has one. */
  cause?: unknown
  /** Quick 260927-tpm: tags a run-level give-up (the stall bound) so it can be told apart from a
   *  per-file failure. Absent means file-level. */
  scope?: 'run'
}

export interface DownloadSteamDepotsOpts {
  /** The boot-owned install runtime (appinfo order tap, CDN schema, locks, job registry). */
  installRuntime: DepotRuntime
  /** The boot-owned authenticated Steam session the plan build and the lease come from. */
  steamUser: DepotSteamUser
  /** Where Steam is installed (defaultSteamPath), read for the user's localconfig.vdf beta choice. */
  config: Pick<GlobalConfigSlice, 'getSettings'>
  targetSteamappsDir: string
  installdir: string
  /** Required — never defaulted to the host OS here (select.ts's own discipline). */
  os: string
  language?: string
  /** Explicit beta branch override (tests, the updater). Absent means resolve the user's choice
   *  (ACF BetaKey, then Steam's localconfig.vdf). */
  branch?: string
  signal?: AbortSignal
  /** Auto-update: no guided sign-in or Go Offline push on a refused lease. */
  unattended?: boolean
  /** Phase 54, internal: the reason logged with the lease buildDepotPlan
   *  acquires. Defaults to 'user-install'; prescreenBridgeDepots passes
   *  'prescreen'. Never user-facing. */
  sessionReason?: AuthSessionReason
  /** Phase 74: run as a chunk-level delta. Installed GIDs as strings read from the raw ACF,
   *  never vdf-parsed (they exceed 2^53). Only depots absent from the branch's full PICS depot list (base + DLC apps) are retired; skipped or unselected (ownership, language, OS) depots stay. */
  delta?: { oldGidByDepot: ReadonlyMap<string, string> }
  /** Depot ids the ACF records as installed, supplied by verify and the update estimate. With
   *  `delta.oldGidByDepot`'s keys, an installed `config.optionaldlc` depot marks its opt-in DLC
   *  enabled in selection, so it stays in the plan (quick 261120-tbr). A fresh install leaves it absent. */
  installedDepotIds?: ReadonlySet<string>
  /** Quick 261122-rgi: the complete set of opt-in DLC appIds the user wants enabled. When present
   *  it REPLACES the installed-derived set: a fresh-install tick or the Install tab's add/remove
   *  supplies it, and an installed opt-in DLC depot whose DLC is absent from it is retired.
   *  Absent keeps the installed-derived behaviour (quick 261120-tbr). */
  chosenOptInDlc?: ReadonlySet<string>
}

/** Narrow, ADDITIONAL view of PICS appinfo's `common.name` field — not part of
 *  select.ts's own SteamAppInfo (which only needs depots/extended). Widened
 *  locally here purely to read the display name for the manifest writer. */
export interface AppCommonName {
  common?: { name?: string }
}

/** Raw per-server shape client.getContentServers resolves with — the full
 *  field set steam-user's cdn.js actually returns (confirmed by reading
 *  source, widened in diagnostic cycle 4 from a Host/vhost-only declaration).
 *  `usetokenauth` added cycle 7 (steam-install-slow-start): steam-user's own
 *  cdn.js `getContentServers` reduction has this field HARD-CODED commented
 *  out (`//usetokenauth: '1'`) in the installed steam-user@5.3.0 source — so
 *  in practice it is always absent/undefined from every real directory
 *  response observed so far — but is declared as a real field (not assumed
 *  always-false) so a future steam-user version that DOES populate it is
 *  honored automatically by `reduceContentServers`'s `usetokenauth === 1`
 *  check below, matching steam-user's own `contentServer.usetokenauth == 1`
 *  gate exactly.
 *  Named + exported so `reduceContentServers` below is directly testable
 *  against fixture data without a live CM round-trip. */
export interface RawContentServer {
  Host?: string
  vhost?: string
  type?: string
  sourceid?: number
  cell?: number
  // Debug/steam-install-slow-start (cycle 8): the directory's REAL response
  // returns `load`/`weightedload` as STRINGS (confirmed via the cycle-4/5
  // RAW JSON dump, e.g. `"weightedload": "130"`), not numbers — widened from
  // `number` to `number | string` to match what steam-user's cdn.js actually
  // hands back. `reduceContentServers` below coerces via `Number(...)`
  // (NaN-guarded) before storing into `weightedLoads`.
  load?: number | string
  weightedload?: number | string
  preferred_server?: boolean
  NumEntriesInClientList?: number
  https_support?: string
  usetokenauth?: number
  allowed_app_ids?: number[]
}
