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
 * Quick 261024-j4l: `objdump --private-headers` does NOT list the PE Delay
 * Import Directory, so a delay-only importer (Manor Lords' Shipping exe) used
 * to scan as "imports nothing". The scan now also reads the delay table with
 * the zero-spawn ranged reader in `peSteamDrm.ts` and merges it in.
 */

import { closeSync, existsSync, openSync, readSync } from 'fs'
import { dirname, isAbsolute, join, relative, resolve } from 'path'
import { spawnAsync } from 'backend/utils'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { parseImportedDllNames, parseSteamApiImportTable } from './importParse'
import { readPeSteamApiDelayImports } from './peSteamDrm'

// Pattern repeated verbatim across bottle.ts:836, clientSetup.ts:40,
// allowlist.ts:33 -- reuse the SAME regex value/name, do not redefine a
// divergent one.
const NUMERIC_APP_ID = /^\d+$/

const OBJDUMP_BIN = '/usr/bin/objdump'

const CONFLICTING_HEADINGS_ERROR =
  'conflicting steam_api.dll and steam_api64.dll import headings'

const CLOSURE_MAX_DEPTH = 2
const CLOSURE_MAX_DLLS = 32
const SYSTEM_DLLS = new Set([
  'kernel32.dll',
  'user32.dll',
  'ntdll.dll',
  'msvcrt.dll',
  'advapi32.dll',
  'gdi32.dll',
  'shell32.dll',
  'ole32.dll',
  'oleaut32.dll',
  'ws2_32.dll',
  'winmm.dll'
])

function isFollowableName(name: string): boolean {
  if (/[\\/]/.test(name) || name.includes('..')) return false
  const lower = name.toLowerCase()
  if (SYSTEM_DLLS.has(lower) || /^(api|ext)-ms-/i.test(lower)) return false
  return true
}

function isContainedWithin(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  return rel !== '' && !rel.startsWith('..') && !isAbsolute(rel)
}

type ClosureBlock = ReturnType<typeof parseSteamApiImportTable>

/** Breadth-first walk of same-directory DLL imports; returns steam_api blocks found. */
async function scanImportClosure(
  appId: string,
  exePath: string,
  exeStdout: string
): Promise<{ blocks: { name: string; parsed: ClosureBlock }[] }> {
  const dir = dirname(exePath)
  const root = resolve(dir)
  const blocks: { name: string; parsed: ClosureBlock }[] = []
  const visited = new Set<string>()
  let examined = 0
  let frontier = parseImportedDllNames(exeStdout)
  for (let depth = 1; depth <= CLOSURE_MAX_DEPTH && frontier.length; depth++) {
    const next: string[] = []
    for (const name of frontier) {
      const key = name.toLowerCase()
      if (visited.has(key) || !isFollowableName(name)) continue
      if (/^steam_api(64)?\.dll$/i.test(name)) continue
      const full = join(dir, name)
      if (!isContainedWithin(root, resolve(full)) || !existsSync(full)) continue
      if (examined >= CLOSURE_MAX_DLLS) return { blocks }
      visited.add(key)
      examined++
      try {
        const r = await spawnAsync(OBJDUMP_BIN, ['--private-headers', full])
        if (r.code !== 0) {
          logWarning(
            `scanSteamApiImports: objdump exited with code ${r.code} for followed DLL "${full}" (appId ${appId}); skipping`,
            LogPrefix.Steam
          )
          continue
        }
        const parsed = parseSteamApiImportTable(r.stdout)
        if (parsed.arch !== 'none' || parsed.conflict) {
          blocks.push({ name, parsed })
        }
        next.push(...parseImportedDllNames(r.stdout))
      } catch (error) {
        logWarning(
          [
            `scanSteamApiImports: objdump failed for followed DLL "${full}" (appId ${appId}); skipping`,
            error
          ],
          LogPrefix.Steam
        )
      }
    }
    frontier = next
  }
  return { blocks }
}

// Not exported: verified to have no importer anywhere -- not in any tracked .ts/.tsx
// file (`pnpm find-deadcode` / ts-prune flagged the previously-exported form as an
// over-broad `export` keyword).
type ImportScanResult =
  | {
      status: 'ok'
      arch: 'x86' | 'x64' | 'none'
      dll: string | null
      symbols: string[]
      /** quick 261024-j4l: the subset read from the delay import table.
       *  ABSENT (not []) when the PE has no steam_api delay imports. */
      delaySymbols?: string[]
    }
  | { status: 'error'; error: string }

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
 * quick 261024-j4l: ranged fd reads into the pure delay-import reader (never
 * slurps the exe; the fd is always closed). Any open/read error returns null,
 * silently: objdump already succeeded or the path is a test stub, and "no
 * delay evidence" is the safe reading.
 */
function readDelayImports(
  exePath: string
): ReturnType<typeof readPeSteamApiDelayImports> | null {
  let fd: number | null = null
  try {
    fd = openSync(exePath, 'r')
    const handle = fd
    return readPeSteamApiDelayImports((offset, length) => {
      const buf = Buffer.alloc(length)
      const n = readSync(handle, buf, 0, length, offset)
      return n < length ? null : new Uint8Array(buf.buffer, buf.byteOffset, n)
    })
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // best effort
      }
    }
  }
}

/**
 * Runs `objdump --private-headers <exePath>` (argv-form only) and returns
 * the game's exact imported `steam_api(64)?.dll` arch, dll name, and symbol
 * set. Never throws -- objdump failure (non-zero exit / spawn error /
 * missing file) is caught and surfaced as a logged warning + a typed
 * `{ status: 'error' }` result, mirroring `killBottleWineServer`'s
 * best-effort catch shape. A binary reporting BOTH a `steam_api.dll` and a
 * `steam_api64.dll` heading (never expected on a real PE) is also surfaced
 * as a typed error rather than guessing which arch is real (T-51-06).
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

  const exeParsed = parseSteamApiImportTable(result.stdout)
  let parsed: ClosureBlock = exeParsed
  const closure = await scanImportClosure(appId, exePath, result.stdout)
  const contributing: string[] = []
  for (const { name, parsed: b } of closure.blocks) {
    if (b.conflict || (parsed.arch !== 'none' && b.arch !== parsed.arch)) {
      logWarning(
        `scanSteamApiImports: ${CONFLICTING_HEADINGS_ERROR} (via ${name}) for appId ${appId} ("${exePath}")`,
        LogPrefix.Steam
      )
      return { status: 'error', error: CONFLICTING_HEADINGS_ERROR }
    }
    parsed = {
      dll: parsed.dll ?? b.dll,
      arch: parsed.arch === 'none' ? b.arch : parsed.arch,
      symbols: [...new Set([...parsed.symbols, ...b.symbols])],
      conflict: parsed.conflict
    }
    contributing.push(name)
  }
  if (contributing.length > 0) {
    logInfo(
      `scanSteamApiImports: appId ${appId} steam_api imported via ${contributing.join(', ')} (Phase 52 closure)`,
      LogPrefix.Steam
    )
  }
  if (parsed.conflict) {
    logWarning(
      `scanSteamApiImports: ${CONFLICTING_HEADINGS_ERROR} for appId ${appId} ("${exePath}")`,
      LogPrefix.Steam
    )
    return { status: 'error', error: CONFLICTING_HEADINGS_ERROR }
  }

  const delay = readDelayImports(exePath)
  if (!delay || !delay.parsed || delay.dll === null) {
    return {
      status: 'ok',
      arch: parsed.arch,
      dll: parsed.dll,
      symbols: parsed.symbols
    }
  }

  if (
    delay.conflict ||
    (parsed.arch !== 'none' && parsed.arch !== delay.arch)
  ) {
    logWarning(
      `scanSteamApiImports: ${CONFLICTING_HEADINGS_ERROR} (import table vs delay import table) for appId ${appId} ("${exePath}")`,
      LogPrefix.Steam
    )
    return { status: 'error', error: CONFLICTING_HEADINGS_ERROR }
  }

  const arch = parsed.arch === 'none' ? delay.arch : parsed.arch
  const dll = parsed.dll ?? delay.dll
  logInfo(
    `scanSteamApiImports: appId ${appId} delay-imports ${delay.symbols.length} symbol(s) from ${delay.dll} ("${exePath}")`,
    LogPrefix.Steam
  )
  return {
    status: 'ok',
    arch,
    dll,
    symbols: [...new Set([...parsed.symbols, ...delay.symbols])],
    delaySymbols: delay.symbols
  }
}
