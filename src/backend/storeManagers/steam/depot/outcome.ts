// Depot download entry points (62-10). Since 73-19 every job runs in Rust (depotRust/); this module
// keeps the public signatures callers import, plus the failure selection the Rust error map uses.

import {
  describeDepotFailure,
  type DepotDownloadFailure,
  type DownloadSteamDepotsOpts
} from './planModel'
import type { DepotErrorAction } from '../depotErrors'
import { downloadSteamDepotsRust } from '../depotRust/install'
import { downloadSelectedDepotFilesRust } from '../depotRust/secondary'

interface DepotDownloadOutcome {
  status: 'done' | 'error' | 'cancelled'
  error?: string
  /** 23.2-03 (G-23-01): depot ids skipped by the EResult-40 skip-and-warn policy, threaded out
   *  so the caller can surface a completion notice. Undefined when the job failed before its
   *  depot refs existed. */
  skippedDepots?: string[]
  /** 37-02 (D-06/D-07): the affordance classifyDepotError assigned to `error`, so games.ts can
   *  render the right dialog without re-classifying. Undefined on every non-error status. */
  errorAction?: DepotErrorAction
}

/**
 * Quick 260927-v8i (D-01/D-03): the one deterministic pick of the failure that describes a failed
 * run. Both the classifier input (depotRust/errorMap.ts) and the `first:` fragment of
 * {@link formatDownloadFailureSummary} use it, so the two never describe one run two ways.
 *
 * A run-level record (`scope: 'run'`, the stall give-up) wins over any file-level one: when the
 * run gave up, a single file failure beside it is usually a symptom of the same dying run, and the
 * stall copy carries the actionable `retry`. Otherwise the first record wins. Array order is
 * completion order, not priority, which is why this exists at all.
 *
 * D-05: precondition `failures` is non-empty; every caller checks it first.
 */
export function selectPrimaryDepotFailure(
  failures: DepotDownloadFailure[]
): DepotDownloadFailure {
  const primary = failures.find((f) => f.scope === 'run') ?? failures[0]
  if (primary === undefined) {
    throw new Error('selectPrimaryDepotFailure: failures must be non-empty')
  }
  return primary
}

/**
 * Quick 260927-tpm (D-A/D-C): the aggregate download-failed log line. It counts FILE-level
 * failures only and reports a run-level give-up as its own trailing fragment, so N file failures
 * always read as N, never N+1. `first:` is the {@link selectPrimaryDepotFailure} record.
 */
export function formatDownloadFailureSummary(
  appId: string,
  failures: DepotDownloadFailure[],
  classificationKey: string
): string {
  const fileFailures = failures.filter((f) => f.scope !== 'run')
  const runFailure = failures.find((f) => f.scope === 'run')
  const first = selectPrimaryDepotFailure(failures)
  const runFragment = runFailure ? `; run: ${runFailure.error}` : ''
  return (
    `downloadSteamDepots: appId=${appId} download failed — ` +
    `${fileFailures.length} file failure(s), classified as ` +
    `${classificationKey}; first: file="${first.file}" ` +
    `${describeDepotFailure(first.cause ?? first.error)}` +
    runFragment
  )
}

/**
 * Normalised depot path used to select files: backslashes to slashes, leading slashes stripped,
 * lowercased. Shared with bridge/originalRestore.ts; Rust's normalize_depot_path is its port.
 */
export function normalizeDepotPath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '').toLowerCase()
}

export interface DownloadSelectedDepotFilesOpts extends DownloadSteamDepotsOpts {
  /** Files to fetch, in the {@link normalizeDepotPath} form, sent to Rust as-is (D-02). */
  selectPaths: string[]
}

export interface DownloadSelectedDepotFilesResult {
  status: 'done' | 'cancelled' | 'error'
  /** The files fetched: manifest filename (Windows separators), size, lowercase hex sha1. */
  files: Array<{ filename: string; size: number; sha1: string }>
  error?: string
  failures?: DepotDownloadFailure[]
}

/**
 * Quick 261026-lif: fetch ONLY the listed files into `<targetSteamappsDir>/common/<installdir>/`
 * as one Rust select_files job. A partial fetch into a staging tree: no appmanifest ACF is ever
 * written, and directory and symlink entries are never selected. NEVER throws: every failure maps
 * to a structured status.
 */
export async function downloadSelectedDepotFiles(
  appId: string,
  opts: DownloadSelectedDepotFilesOpts
): Promise<DownloadSelectedDepotFilesResult> {
  return downloadSelectedDepotFilesRust(appId, opts)
}

/**
 * The public depot-download orchestrator (SteamGame.install()'s call site). Node does the CM half
 * and Rust fetches, writes, verifies and finalizes (73-13). The appmanifest write is always the
 * last filesystem action, and NEVER throws: every failure maps to a structured outcome the
 * caller and the DownloadManager queue consume directly.
 */
export async function downloadSteamDepots(
  appId: string,
  opts: DownloadSteamDepotsOpts
): Promise<DepotDownloadOutcome> {
  return downloadSteamDepotsRust(appId, opts)
}
