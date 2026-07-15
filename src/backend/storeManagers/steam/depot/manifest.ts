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
// StateFlags is hard-coded to "1026" (spike 001's adoption value — Steam
// itself verifies/repairs and flips bit 4 to reach "4"). This module must
// NEVER write StateFlags "4" — only Steam's own verify pass earns that value
// (T-21-07).
//
// The write is atomic: text lands in `appmanifest_{appId}.acf.tmp` in the
// same directory, fsynced, then renamed over the final `.acf` (T-21-06) — a
// crash mid-write leaves the prior (or absent) manifest, never a half-written
// one. Read-side sibling this must stay bit-consistent with: library.ts
// readAcfState()'s `parseInt(state.StateFlags, 10) & 4` check.

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
  /** Free — Steam recomputes on its verify pass. Defaults to "0". */
  buildid?: string
  /** SteamID64 — STRING, never a JS Number. Defaults to "0" when unknown. */
  lastOwner?: string
  installedDepots: InstalledDepotEntry[]
}

function assertNumericId(id: string, label: string): void {
  if (!NUMERIC_ID.test(id)) {
    throw new Error(`writeAppManifest: rejected non-numeric ${label} "${id}"`)
  }
}

function buildInstalledDepotsBlock(depots: InstalledDepotEntry[]): string {
  return depots
    .map((d) => {
      assertNumericId(d.depotId, 'depotId')
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
  const lastOwner = params.lastOwner ?? '0'
  const installedDepotsBlock = buildInstalledDepotsBlock(params.installedDepots)

  return (
    [
      '"AppState"',
      '{',
      `\t"appid"\t\t"${params.appId}"`,
      '\t"Universe"\t\t"1"',
      '\t"StateFlags"\t\t"1026"',
      `\t"installdir"\t\t"${params.installdir}"`,
      `\t"name"\t\t"${params.name}"`,
      `\t"LastUpdated"\t\t"${lastUpdated}"`,
      `\t"SizeOnDisk"\t\t"${params.sizeOnDisk}"`,
      `\t"buildid"\t\t"${buildid}"`,
      `\t"LastOwner"\t\t"${lastOwner}"`,
      '\t"BytesToDownload"\t\t"0"',
      '\t"BytesDownloaded"\t\t"0"',
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
