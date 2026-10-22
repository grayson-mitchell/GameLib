/**
 * Phase 51 Plan 02: pure, dependency-free parser for `objdump
 * --private-headers` PE import tables.
 *
 * Widens the Phase 24 Plan 05 `SteamAPI_*`-only, 32-bit-only scan
 * (`importScan.ts`) to:
 *  - every imported member of the `steam_api(64)?.dll` block, not just
 *    `SteamAPI_*`-prefixed symbols -- the bare accessors (`SteamUser`,
 *    `SteamUtils`, `SteamFriends`, ...) and the `SteamGameServer*` /
 *    `SteamInternal_*` families carry no `SteamAPI_` prefix at all
 *    (ROADMAP sub-decision 1, D-51-13, D-UAT-24-09)
 *  - arch detection: a `steam_api64.dll` heading is reported as arch
 *    'x64' with its symbols, never as "imports nothing" (hazard (a))
 *  - a typed `conflict` signal when a binary reports BOTH headings, so the
 *    caller can fail closed instead of guessing which arch is real
 *
 * Zero imports by design (D-51-15): the closing census tool (51-18) reuses
 * this module unchanged, so it must be bundleable with no backend module
 * graph attached. `grep -c "^import" importParse.ts` must print 0.
 *
 * Accepts both row layouts seen on real owned binaries this session
 * (`fixtures/objdumpImports.ts`):
 *  - GNU objdump: `<vma>\t<hint/ord>  <name>` under a
 *    `vma:  Hint/Ord Member-Name Bound-To` column header (the Phase 24
 *    reconstructed fixtures use this shape)
 *  - Apple LLVM objdump (this machine): `<hint/ord>  <name>` under a
 *    `Hint/Ord  Name` column header, with an interstitial
 *    `lookup <addr> time <ts> fwd <addr> name <addr> addr <addr>` line
 *    before each DLL block (the real captures use this shape)
 *
 * Both header-row shapes and the lookup line are matched and skipped so
 * neither leaks a bogus "symbol" (e.g. the literal word "Name" from the
 * column header, or a trailing hex-looking token from the lookup line).
 */

export type ImportTableResult = {
  dll: 'steam_api.dll' | 'steam_api64.dll' | null
  arch: 'x86' | 'x64' | 'none'
  symbols: string[]
  conflict: boolean
}

// `DLL Name: steam_api.dll` / `DLL Name: steam_api64.dll` (either row
// layout's heading looks the same). Captures the dll name so the x64
// variant can be told apart from x86.
const STEAM_API_HEADING = /DLL Name:\s*(steam_api(64)?\.dll)\s*$/i

// Any other imported DLL's own heading -- ends the steam_api(64)?.dll
// section when encountered while inside it.
const ANY_DLL_HEADING = /DLL Name:/i

// Column-header rows for both layouts: GNU's
// "vma:  Hint/Ord Member-Name Bound-To" and Apple LLVM's "Hint/Ord  Name"
// both contain the literal substring "Hint/Ord".
const HEADER_ROW = /Hint\/Ord/i

// Apple LLVM's interstitial line between a block's last row and the next
// DLL heading: "lookup 00169004 time 00000000 fwd 00000000 name 001690b4
// addr 0012d1ac". Matched explicitly (not just left to fail the trailing-
// identifier test) because a trailing hex token CAN start with a hex letter
// (a-f) immediately after a run of digits, which would otherwise satisfy
// the identifier pattern below and leak a bogus symbol like "d1ac".
const LOOKUP_ROW = /^\s*lookup\s+[0-9a-fA-F]+\s+time\b/i

// The member name is the last identifier-shaped token on a row, accepting
// both a numbered row (GNU: "<vma> <hint> <name>"; Apple LLVM:
// "<hint> <name>") and a name-only data-export row with no ordinal at all
// (e.g. "g_pSteamClientGameServer" -- a drop-in shim must export every
// member of the block, data exports included).
const TRAILING_IDENTIFIER = /([A-Za-z_][A-Za-z0-9_@?$]*)\s*$/

/**
 * Pure parser: extracts the dll name, arch, and every imported member of
 * the `steam_api(64)?.dll` import-table block from `objdump
 * --private-headers` stdout. Returns
 * `{ dll: null, arch: 'none', symbols: [], conflict: false }` when no such
 * heading is present at all (e.g. a non-Steamworks binary). `conflict` is
 * `true` when the output reports BOTH a `steam_api.dll` heading and a
 * `steam_api64.dll` heading -- never expected on a real PE, but callers
 * must fail closed rather than trust whichever heading happened to parse
 * last.
 */
export function parseSteamApiImportTable(
  objdumpOutput: string
): ImportTableResult {
  let dll: ImportTableResult['dll'] = null
  let arch: ImportTableResult['arch'] = 'none'
  let conflict = false
  const symbols: string[] = []
  let inSteamApiSection = false

  for (const line of objdumpOutput.split('\n')) {
    const headingMatch = line.match(STEAM_API_HEADING)
    if (headingMatch) {
      const isX64 = /64/.test(headingMatch[1])
      const headingDll: ImportTableResult['dll'] = isX64
        ? 'steam_api64.dll'
        : 'steam_api.dll'
      if (dll !== null && dll !== headingDll) {
        conflict = true
      }
      dll = headingDll
      arch = isX64 ? 'x64' : 'x86'
      inSteamApiSection = true
      continue
    }
    if (!inSteamApiSection) {
      continue
    }
    if (ANY_DLL_HEADING.test(line)) {
      // Entered the NEXT imported DLL's own block -- the steam_api(64)?.dll
      // block has ended.
      inSteamApiSection = false
      continue
    }
    if (HEADER_ROW.test(line) || LOOKUP_ROW.test(line)) {
      continue
    }
    const symbolMatch = line.match(TRAILING_IDENTIFIER)
    if (symbolMatch) {
      symbols.push(symbolMatch[1])
    }
  }

  return { dll, arch, symbols, conflict }
}
