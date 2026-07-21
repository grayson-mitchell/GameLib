// Phase 23 (23-06): permanent EDepotFileFlag census instrumentation for the
// G-23-02 root-cause trace (0 of 18,809 HUMANKIND files landed +x). Purely
// observational — a PURE function over data the DepotPlan already carries.
// Never mutates the plan, never touches the filesystem, never chmods
// anything, and never changes any mode-application behavior.
//
// T-23-16 (Information Disclosure, mitigate): the census is AGGREGATE ONLY.
// No `filename`, no path, no per-file data ever leaves this module — only
// counts and a capped list of distinct numeric flag values.
// T-23-17 (Denial of Service, mitigate): distinctFlagValues is capped so a
// huge, highly-varied manifest can't blow up log-line size.

import {
  EXECUTABLE_FLAG,
  CUSTOM_EXECUTABLE_FLAG,
  READONLY_FLAG,
  HIDDEN_FLAG,
  DIRECTORY_FLAG,
  SYMLINK_FLAG,
  type DepotPlan
} from '../depot'

// Distinct-flag-value log cap (T-23-17). Expressed as a bit shift rather than
// a raw decimal literal — this cap is unrelated to any EDepotFileFlag bit
// value, it just needs a round number, and keeping it literal-free here lets
// the "flag constants are imported, not re-literalled" grep gate apply
// cleanly to this whole file (no accidental "32"/"128" substring collision).
const MAX_DISTINCT_FLAG_VALUES = 1 << 5

/** Aggregate-only EDepotFileFlag census over a single DepotPlan. */
export interface DepotFlagsCensus {
  /** Total files across every depot in the plan. */
  totalFiles: number
  /** Files where `file.flags` is truthy — mirrors the EXACT production
   *  truthiness guard at depot.ts:1195 (`if (file.flags)`), so `flags: 0`
   *  does NOT count as flag-bearing here either. */
  flagBearing: number
  /** Files matching `flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG)`. */
  executableFlagged: number
  /** Files matching `flags & READONLY_FLAG`. */
  readonlyFlagged: number
  /** Files matching `flags & HIDDEN_FLAG`. */
  hiddenFlagged: number
  /** Files matching `flags & DIRECTORY_FLAG`. */
  directoryEntries: number
  /** Files matching `flags & SYMLINK_FLAG`. */
  symlinkEntries: number
  /** Files with no chunks or a reported size of 0. */
  zeroSizeEntries: number
  /** Distinct numeric `flags` values seen, ascending, capped at
   *  MAX_DISTINCT_FLAG_VALUES entries to bound log size on huge manifests. */
  distinctFlagValues: number[]
}

/**
 * Pure summarizer: walks every file across every depot in `plan` and reports
 * aggregate EDepotFileFlag counts. This is the entire diagnostic surface
 * needed to eliminate G-23-02 hypotheses H1-H5 from a single log line pair
 * (see 23-TRACE.md) — no filesystem access, no network, no side effects.
 */
export function summarizeDepotFlags(plan: DepotPlan): DepotFlagsCensus {
  let totalFiles = 0
  let flagBearing = 0
  let executableFlagged = 0
  let readonlyFlagged = 0
  let hiddenFlagged = 0
  let directoryEntries = 0
  let symlinkEntries = 0
  let zeroSizeEntries = 0
  const distinctFlagValues = new Set<number>()

  for (const depot of plan.depots) {
    for (const file of depot.files) {
      totalFiles++

      if (!file.chunks.length || Number(file.size) === 0) {
        zeroSizeEntries++
      }

      // Mirror depot.ts:1195's exact `if (file.flags)` guard — a plan with
      // every `flags: undefined` (H1's signature) must report flagBearing: 0.
      if (!file.flags) continue

      flagBearing++
      if (distinctFlagValues.size < MAX_DISTINCT_FLAG_VALUES) {
        distinctFlagValues.add(file.flags)
      }
      if (file.flags & (EXECUTABLE_FLAG | CUSTOM_EXECUTABLE_FLAG)) {
        executableFlagged++
      }
      if (file.flags & READONLY_FLAG) readonlyFlagged++
      if (file.flags & HIDDEN_FLAG) hiddenFlagged++
      if (file.flags & DIRECTORY_FLAG) directoryEntries++
      if (file.flags & SYMLINK_FLAG) symlinkEntries++
    }
  }

  return {
    totalFiles,
    flagBearing,
    executableFlagged,
    readonlyFlagged,
    hiddenFlagged,
    directoryEntries,
    symlinkEntries,
    zeroSizeEntries,
    distinctFlagValues: Array.from(distinctFlagValues).sort((a, b) => a - b)
  }
}

/** Stable, greppable log-line prefix shared by all three depot.ts call sites
 *  (plan-build / download-entry / download-complete) so a single install's
 *  full census trail is trivially greppable out of gamelib.log. */
export const FLAGS_CENSUS_LOG_PREFIX = 'steam-flags-census'

/**
 * Formats a census (plus optional run-scoped counters, e.g. chmodAttempts /
 * jobCount) as a single-line, space-separated key=value string for logInfo.
 * Fixed-size regardless of manifest size (T-23-17) — distinctFlagValues is
 * already capped by summarizeDepotFlags.
 */
export function formatDepotFlagsCensus(
  census: DepotFlagsCensus,
  extra?: Record<string, number | string>
): string {
  const fields: Record<string, number | string> = {
    totalFiles: census.totalFiles,
    flagBearing: census.flagBearing,
    executableFlagged: census.executableFlagged,
    readonlyFlagged: census.readonlyFlagged,
    hiddenFlagged: census.hiddenFlagged,
    directoryEntries: census.directoryEntries,
    symlinkEntries: census.symlinkEntries,
    zeroSizeEntries: census.zeroSizeEntries,
    ...extra,
    distinctFlagValues: `[${census.distinctFlagValues.join(',')}]`
  }
  return Object.entries(fields)
    .map(([k, v]) => `${k}=${v}`)
    .join(' ')
}
