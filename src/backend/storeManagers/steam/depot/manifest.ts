// Phase 21 (21-02): Hand-templated `.acf` (appmanifest) writer.
//
// GameLib has only ever READ appmanifest files, via the project's VDF-parsing
// package's parse() function (see library.ts readAcfState()). This module
// WRITES them for the first time — exactly where that library's documented
// 64-bit rounding bug (RESEARCH.md Pitfall 1) becomes fatal. Every 64-bit
// value (InstalledDepots[].manifest, lastOwner) is kept a string end-to-end
// and interpolated directly into the VDF text — the parsing package's own
// serializer is NEVER used here (confirmed unused anywhere in the codebase;
// its numeric handling for 64-bit fields is unverified and risks the same
// precision loss the parse side has).
//
// StateFlags defaults to "1026" (spike 001's adoption value — Steam itself
// verifies/repairs and flips bit 4 to reach "4"); this default is
// unconditional and unchanged. A caller MAY override it to "4" (full
// ownership, Steam runs no verify pass) — but only depot.ts's
// canWriteFullOwnership completeness gate (Phase 23, D-01/D-02,
// spike-003 VALIDATED) is trusted to earn that override. This module itself
// never decides; it only serializes whatever the caller proved.
//
// The write is atomic: text lands in `appmanifest_{appId}.acf.tmp` in the
// same directory, fsynced, then renamed over the final `.acf` (T-21-06) — a
// crash mid-write leaves the prior (or absent) manifest, never a half-written
// one. Read-side sibling this must stay bit-consistent with: library.ts
// readAcfState()'s `parseInt(state.StateFlags, 10) & 4` check.
//
// The `name` and `installdir` string fields are untrusted PICS-sourced values
// (Steam CM network, not user input, but not trusted VDF-structure-wise
// either) — both are VDF-escaped via vdfEscape() before interpolation (WR-01,
// T-21-14-01/02) so a crafted value (embedded `"`, `\`, or newline) can never
// close the quoted string early and inject a sibling AppState key — e.g. a
// second, spoofed StateFlags entry claiming the fully-installed bit. The
// numeric-guarded fields (appid, depotId, manifest GID, size) are untouched
// by this — they are validated separately via assertNumericId / kept as
// plain digit strings.

import * as nodeFsPromises from 'node:fs/promises'
import { join } from 'node:path'

/** Numeric-only guard for appId/depotId before any interpolation (T-21-05). */
const NUMERIC_ID = /^\d+$/

export interface InstalledDepotEntry {
  /** Steam depot id. Guarded numeric — never interpolated unchecked. */
  depotId: string
  /** 64-bit manifest GID. STRING — must never touch a JS Number. */
  manifest: string
  /** Depot size in bytes. */
  size: number
}

export interface AppManifestParams {
  /** Steam appId. Guarded numeric — never interpolated unchecked. */
  appId: string
  installdir: string
  name: string
  /** Measured real bytes on disk — caller supplies; NOT a manifest-derived sum. */
  sizeOnDisk: string
  /** Current public-branch buildid (Phase 23, D-02). Defaults to "0" when
   *  absent/unknown — Steam reads "0" as UpdateRequired and runs its own
   *  verify pass regardless of stateFlags. Numeric-shape guarded before
   *  interpolation (T-23-05); "0" is exempt (the intentional sentinel). */
  buildid?: string
  /** SteamID64 — STRING, never a JS Number. Defaults to "0" when unknown. */
  lastOwner?: string
  /** Override StateFlags. Defaults to "1026" (the unconditional module
   *  default — Steam runs its own verify/repair pass). A caller may pass "4"
   *  (full ownership, no verify pass) ONLY after depot.ts's
   *  canWriteFullOwnership completeness gate (D-01/D-02) has earned it. */
  stateFlags?: string
  /** BytesToDownload/BytesDownloaded value. Defaults to "0" (the 1026 path —
   *  Steam recomputes). A caller passing SizeOnDisk here signals
   *  download-complete (BytesToDownload == BytesDownloaded) under the
   *  StateFlags=4 full-ownership path. */
  bytes?: string
  installedDepots: InstalledDepotEntry[]
}

function assertNumericId(id: string, label: string): void {
  if (!NUMERIC_ID.test(id)) {
    throw new Error(`writeAppManifest: rejected non-numeric ${label} "${id}"`)
  }
}

/**
 * Numeric-shape guard for `buildid` before VDF interpolation (T-23-05,
 * Phase 23-02). Mirrors assertNumericId's shape, but exempts the literal "0"
 * sentinel — the intentional untouched-fallback value (Steam reads "0" as
 * UpdateRequired) is not itself a PICS-sourced numeric value and must remain
 * writable even though it wouldn't otherwise match a "real" digit-string.
 * `buildid` is now unconditionally interpolated (previously only reachable
 * behind the throwaway spike flag), so a crafted/compromised PICS response
 * can no longer inject a sibling AppState key via this field.
 */
function assertNumericBuildid(buildid: string): void {
  if (buildid === '0') return
  if (!NUMERIC_ID.test(buildid)) {
    throw new Error(
      `writeAppManifest: rejected non-numeric buildid "${buildid}"`
    )
  }
}

/**
 * Escapes a string for safe interpolation into a double-quoted VDF value
 * (WR-01, T-21-14-01/02). Untrusted PICS-sourced `name`/`installdir` values
 * are the only callers — numeric-guarded fields never pass through this.
 * Escaping order matters: backslash MUST be escaped before quote, otherwise
 * a quote's own escaping backslash would itself get re-escaped.
 * Control characters (\r, \n, \t) are neutralized (replaced with a single
 * space) rather than escaped — a raw line break inside a quoted VDF value
 * would break the file's line-oriented structure regardless of escaping.
 */
function vdfEscape(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\r\n\t]/g, ' ')
}

function buildInstalledDepotsBlock(depots: InstalledDepotEntry[]): string {
  return depots
    .map((d) => {
      assertNumericId(d.depotId, 'depotId')
      // The manifest GID is a PICS-sourced string (String(gid) off raw
      // appinfo) — guard it as a plain digit string before interpolation, so
      // the header comment's "validated separately via assertNumericId" claim
      // holds and it cannot inject a sibling VDF key (WR-01 completeness).
      assertNumericId(d.manifest, 'manifest')
      return [
        `\t\t"${d.depotId}"`,
        '\t\t{',
        `\t\t\t"manifest"\t\t"${d.manifest}"`,
        `\t\t\t"size"\t\t"${d.size}"`,
        '\t\t}'
      ].join('\n')
    })
    .join('\n')
}

/**
 * Builds the AppState VDF text by string concatenation — reproduces spike
 * 001's exact field set and mixed casing. Pure/testable independent of fs.
 * Exported for unit testing; `writeAppManifest` is the production entry
 * point Plan 06's finalize function should call.
 */
export function buildAppManifestText(params: AppManifestParams): string {
  assertNumericId(params.appId, 'appId')

  const lastUpdated = Math.floor(Date.now() / 1000).toString()
  const buildid = params.buildid ?? '0'
  assertNumericBuildid(buildid)
  const lastOwner = params.lastOwner ?? '0'
  // Unconditional production defaults (D-01/D-03) — a caller omitting
  // stateFlags/bytes always gets the safe 1026/"0" verify-handoff values.
  const stateFlags = params.stateFlags ?? '1026'
  const bytes = params.bytes ?? '0'
  const installedDepotsBlock = buildInstalledDepotsBlock(params.installedDepots)

  return (
    [
      '"AppState"',
      '{',
      `\t"appid"\t\t"${params.appId}"`,
      '\t"Universe"\t\t"1"',
      `\t"StateFlags"\t\t"${stateFlags}"`,
      `\t"installdir"\t\t"${vdfEscape(params.installdir)}"`,
      `\t"name"\t\t"${vdfEscape(params.name)}"`,
      `\t"LastUpdated"\t\t"${lastUpdated}"`,
      `\t"SizeOnDisk"\t\t"${params.sizeOnDisk}"`,
      `\t"buildid"\t\t"${buildid}"`,
      `\t"LastOwner"\t\t"${lastOwner}"`,
      `\t"BytesToDownload"\t\t"${bytes}"`,
      `\t"BytesDownloaded"\t\t"${bytes}"`,
      '\t"AutoUpdateBehavior"\t\t"0"',
      '\t"InstalledDepots"',
      '\t{',
      installedDepotsBlock,
      '\t}',
      '\t"UserConfig"',
      '\t{',
      '\t}',
      '\t"MountedDepots"',
      '\t{',
      '\t}',
      '}'
    ].join('\n') + '\n'
  )
}

/**
 * Writes a 1026 appmanifest atomically into `targetSteamappsDir`, returning
 * the final path. Never accepts/writes StateFlags "4" — that value is only
 * ever set by Steam's own verify-and-repair pass (T-21-07).
 *
 * Atomic write (T-21-06): text is written to `appmanifest_{appId}.acf.tmp`
 * in the same directory, fsynced, then renamed over the final filename —
 * a crash mid-write never leaves a half-written `.acf`.
 */
export async function writeAppManifest(
  targetSteamappsDir: string,
  params: AppManifestParams
): Promise<string> {
  assertNumericId(params.appId, 'appId')
  const text = buildAppManifestText(params)

  const finalPath = join(targetSteamappsDir, `appmanifest_${params.appId}.acf`)
  const tmpPath = `${finalPath}.tmp`

  const handle = await nodeFsPromises.open(tmpPath, 'w')
  try {
    await handle.writeFile(text, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }

  await nodeFsPromises.rename(tmpPath, finalPath)

  return finalPath
}
