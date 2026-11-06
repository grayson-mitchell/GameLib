/**
 * Phase 24 Plan 05 (R3): objdump-based per-game `steam_api` import
 * enumeration. Widened Phase 51 Plan 02, Task 1 (ROADMAP sub-decision 1,
 * hazard (a) / D-51-13): the import table is now parsed for every member of
 * the `steam_api(64)?.dll` block (bare accessors, `SteamGameServer*`,
 * `SteamInternal_*`, not just `SteamAPI_*`) and for arch (`steam_api64.dll`
 * -> 'x64'), never silently reported as "imports nothing".
 *
 * A drop-in shim must export EVERY symbol a game imports from
 * `steam_api.dll` (SPEC.md Constraint) or the game will not load. This
 * module is the "what does this game actually import" half of that
 * contract -- `shimGenerate.ts` (Task 2) is the "does our shim cover it"
 * half.
 *
 * Mirrors `bottle.ts`'s `killBottleWineServer` argv-form `spawnAsync`
 * call-site convention (T-24-06 / ASVS V5): objdump is invoked as
 * `spawnAsync('/usr/bin/objdump', ['--private-headers', exePath])` --
 * NEVER `spawnAsync('objdump --private-headers ' + exePath)`. Parsing is
 * delegated to the pure, dependency-free `importParse.ts` (D-51-15: the
 * closing census tool reuses it unchanged); we do NOT shell out to `grep`
 * (24-RESEARCH.md Don't-Hand-Roll table).
 *
 * Phase 52 Plan 05: the scan also follows a bounded static-import closure
 * (same directory as the exe only, depth <= 2, <= 32 DLLs) so a title whose
 * exe loads steam_api through an importing DLL (Grim Dawn: Engine.dll) reports
 * that arch and those symbols.
 *
 * Phase 63: the scan is native in Rust (gamelib-scan `scan_steam_api_imports`,
 * D-05/D-06: closure walk, delay merge and conflict checks in one round-trip). The
 * objdump implementation is kept as the `ts` fallback in
 * `backend/scanners/legacyTsScanners.ts` until 63-13 (the module is deleted in
 * 63-14). This module validates appId, picks the implementation and forwards the
 * diagnostics to the logger. A transport failure fails closed to a typed error.
 *
 * Quick 261024-j4l: `objdump --private-headers` does NOT list the PE Delay
 * Import Directory, so a delay-only importer (Manor Lords' Shipping exe) used
 * to scan as "imports nothing". The scan now also reads the delay table with
 * the zero-spawn ranged reader in `peSteamDrm.ts` and merges it in.
 */

import { spawnAsync } from 'backend/utils'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { parseSteamApiImportTable } from './importParse'
import { NUMERIC_APP_ID } from '../gameConstants'
import {
  OBJDUMP_BIN,
  steamApiImportsTs
} from '../../../scanners/legacyTsScanners'
import { runScanner } from '../../../scanners/rustScan'
import type { ImportScanResult } from '../../../scanners/scanTypes'

/**
 * Pure wrapper over `parseSteamApiImportTable`: extracts the exact set of
 * symbols imported from the `steam_api(64)?.dll` block, in file order, from
 * `objdump --private-headers` stdout. Returns `[]` (not an error) when the
 * binary imports nothing from `steam_api(64)?.dll` (e.g. no such DLL
 * heading present at all). Kept so existing callers (`shimGenerate.ts`)
 * compile unchanged.
 */
export function parseSteamApiImports(objdumpOutput: string): string[] {
  return parseSteamApiImportTable(objdumpOutput).symbols
}

/**
 * Runs `objdump --private-headers <exePath>` (argv-form only) via the TS
 * oracle and returns the game's exact imported `steam_api(64)?.dll` arch, dll
 * name, and symbol set. Never throws -- objdump failure (non-zero exit / spawn
 * error / missing file) surfaces as a logged warning + a typed
 * `{ status: 'error' }` result. A binary reporting BOTH a `steam_api.dll` and
 * a `steam_api64.dll` heading is also a typed error (T-51-06).
 */
export async function scanSteamApiImports(
  appId: string,
  exePath: string,
  caller = 'scanSteamApiImports'
): Promise<ImportScanResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `scanSteamApiImports: rejected non-numeric appId "${appId}" -- not spawning objdump (T-24-06)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }

  try {
    const { diagnostics, ...result } = await runScanner(
      'importScan',
      'scan_steam_api_imports',
      { exePath, appId },
      () =>
        steamApiImportsTs(
          { exePath, appId },
          {
            runObjdump: (path) =>
              spawnAsync(OBJDUMP_BIN, ['--private-headers', path])
          }
        ),
      caller
    )
    for (const d of diagnostics ?? []) {
      if (d.level === 'warn') logWarning(d.message, LogPrefix.Steam)
      else logInfo(d.message, LogPrefix.Steam)
    }
    return result
  } catch (error) {
    logWarning(
      `scanSteamApiImports: rust scan failed for appId ${appId} ("${exePath}"): ${String(error)}`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Rust scan failed: ${String(error)}` }
  }
}
