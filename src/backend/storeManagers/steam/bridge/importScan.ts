/**
 * Phase 24 Plan 05 (R3): objdump-based per-game `steam_api` import
 * enumeration.
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
 * done in JS with a line-scoped regex filter; we do NOT shell out to
 * `grep` (24-RESEARCH.md Don't-Hand-Roll table).
 */

import { spawnAsync } from 'backend/utils'
import { logWarning, LogPrefix } from 'backend/logger'

// Pattern repeated verbatim across bottle.ts:836, clientSetup.ts:40,
// allowlist.ts:33 -- reuse the SAME regex value/name, do not redefine a
// divergent one.
const NUMERIC_APP_ID = /^\d+$/

const OBJDUMP_BIN = '/usr/bin/objdump'

// objdump --private-headers groups PE imports under a
// "DLL Name: <name>.dll" heading, one heading per imported DLL, followed by
// its own "vma: Hint/Ord Member-Name Bound-To" table until the next
// "DLL Name:" heading (or EOF). We track section membership line-by-line
// rather than a single multi-line regex so the parser is resilient to
// objdump's exact column widths/whitespace (which vary slightly between
// GNU objdump and Apple LLVM objdump).
const STEAM_API_DLL_HEADING = /DLL Name:\s*steam_api\.dll\s*$/i
const ANY_DLL_HEADING = /DLL Name:/i
const STEAM_API_SYMBOL = /\b(SteamAPI_[A-Za-z0-9_]+)\b/

export type ImportScanResult =
  | { status: 'ok'; symbols: string[] }
  | { status: 'error'; error: string }

/**
 * Pure parser: extracts the exact set of `SteamAPI_*` symbols imported
 * from `steam_api.dll`, in file order, from `objdump --private-headers`
 * stdout. Returns `[]` (not an error) when the binary imports nothing
 * from `steam_api.dll` (e.g. no such DLL heading present at all).
 */
export function parseSteamApiImports(objdumpOutput: string): string[] {
  const symbols: string[] = []
  let inSteamApiSection = false

  for (const line of objdumpOutput.split('\n')) {
    if (STEAM_API_DLL_HEADING.test(line)) {
      inSteamApiSection = true
      continue
    }
    if (!inSteamApiSection) {
      continue
    }
    if (ANY_DLL_HEADING.test(line)) {
      // Entered the NEXT imported DLL's own block -- steam_api.dll's
      // block has ended.
      inSteamApiSection = false
      continue
    }
    const match = line.match(STEAM_API_SYMBOL)
    if (match) {
      symbols.push(match[1])
    }
  }

  return symbols
}

/**
 * Runs `objdump --private-headers <exePath>` (argv-form only) and returns
 * the game's exact imported `steam_api` symbol set. Never throws --
 * objdump failure (non-zero exit / spawn error / missing file) is caught
 * and surfaced as a logged warning + a typed `{ status: 'error' }` result,
 * mirroring `killBottleWineServer`'s best-effort catch shape.
 */
export async function scanSteamApiImports(
  appId: string,
  exePath: string
): Promise<ImportScanResult> {
  if (!NUMERIC_APP_ID.test(appId)) {
    logWarning(
      `scanSteamApiImports: rejected non-numeric appId "${appId}" -- not spawning objdump (T-24-06)`,
      LogPrefix.Steam
    )
    return { status: 'error', error: `Invalid appId: "${appId}"` }
  }

  let result: { code: number | null; stdout: string; stderr: string }
  try {
    result = await spawnAsync(OBJDUMP_BIN, ['--private-headers', exePath])
  } catch (error) {
    logWarning(
      [
        `scanSteamApiImports: objdump failed to run for appId ${appId} ("${exePath}")`,
        error
      ],
      LogPrefix.Steam
    )
    return { status: 'error', error: `Failed to run objdump: ${String(error)}` }
  }

  if (result.code !== 0) {
    logWarning(
      `scanSteamApiImports: objdump exited with code ${result.code} for appId ${appId} ("${exePath}")`,
      LogPrefix.Steam
    )
    return {
      status: 'error',
      error: `objdump exited with code ${result.code} for "${exePath}"`
    }
  }

  return { status: 'ok', symbols: parseSteamApiImports(result.stdout) }
}
