/**
 * Phase 51 Plan 03 -- ROADMAP sub-decision 2 / D-51-07: the single module
 * that owns "what does the shim actually serve" as two coverage dimensions
 * -- exported symbols AND served interface VERSIONS per arch -- so neither
 * dimension lives as a second hand-synced list inside shimGenerate.ts or
 * anywhere else. Every later Phase 51 plan that needs a coverage verdict
 * (51-07's route resolver, 51-09's persistence, 51-16's UI) reads this
 * module instead of re-deriving the composition.
 *
 * Zero backend imports (node:crypto only): this module is pure data +
 * pure functions, so a future standalone census tool (51-18, meta/ tooling)
 * can bundle the exact coverage logic the live bridge uses without pulling
 * in the backend module graph -- the same zero-import-boundary discipline
 * `importParse.ts`/`interfaceVersions.ts` (51-02) already established.
 *
 * SHIM_EXPORTED_SYMBOLS moved here verbatim from shimGenerate.ts (24-CR-02,
 * quick 260930-vrb) -- shimGenerate.ts now IMPORTS it from here rather than
 * declaring it; see shimCoverage.test.ts for the pin against the committed
 * native/steam-bridge/generated/steam_api.def.
 */

import { createHash } from 'node:crypto'

// Mirrors meta/gen_vtables.ts's FLAT_EXPORTS_SUPERSET PLUS the two
// per-interface accessor exports `generateDefFile` appends
// (`...accessorExports`, meta/gen_vtables.ts) -- the single source of
// truth for what 24-01's generator (and 24-07's packaging build) emits
// into the compiled shim's export table (12 symbols total: 10 flat +
// SteamAPI_SteamUser_v023 + SteamAPI_SteamFriends_v018, matching
// native/steam-bridge/generated/steam_api.def exactly). `src/` cannot
// statically import `meta/` (tsconfig `include` is `["src"]` only, and the
// compiled `.dll` ships without its source `.def` at packaged runtime), so
// this is a reviewed, literal copy rather than a derived import. An SDK
// bump/export change in the generator (D-07: regenerate + review the
// source diff) -- including adding/renaming an interface accessor -- must
// update this list in the same review pass (CR-02: a stale copy here
// wrongly rejects every game that imports an interface accessor).
//
// Exported so __tests__/shimCoverage.test.ts can assert this set equals the
// committed native/steam-bridge/generated/steam_api.def export list in both
// directions (the 24-CR-02 pin), and so shimGenerate.ts can import it for
// its own coverage-rejection check.
export const SHIM_EXPORTED_SYMBOLS: ReadonlySet<string> = new Set([
  'SteamAPI_Init',
  'SteamAPI_InitFlat',
  'SteamAPI_Shutdown',
  'SteamAPI_RestartAppIfNecessary',
  'SteamAPI_IsSteamRunning',
  'SteamAPI_RunCallbacks',
  'SteamAPI_RegisterCallback',
  'SteamAPI_UnregisterCallback',
  'SteamAPI_RegisterCallResult',
  'SteamAPI_UnregisterCallResult',
  'SteamAPI_SteamUser_v023',
  'SteamAPI_SteamFriends_v018'
])

// D-51-13: no Win64 shim target exists yet (research's zig cc prototype /
// the fail-closed rule is a later plan's call). Empty until 51-15 -- kept as
// a real, exported constant (not a TODO comment) so every call site that
// reads it today sees the honest "nothing" rather than an absent symbol.
export const SHIM64_EXPORTED_SYMBOLS: ReadonlySet<string> = new Set()

/** A single served interface version's coverage mode: `'wire'` means the
 * shim's helper dispatches real Steam calls for it; `'stub'` means the
 * version is recognized but answers as a stub (D-51-02's one-time notice
 * fires for a stubbed interface). */
export interface ServedInterface {
  family: string
  mode: 'wire' | 'stub'
}

// Initial x86 coverage: the two interfaces 24-01/24-05 already wired
// end-to-end (ISteamUser, ISteamFriends), both fully wired (not stubs).
// Later Phase 51 plans add more entries here as they wire more interfaces --
// this module is the SOLE place that list grows, never a second copy.
export const SHIM_SERVED_INTERFACE_VERSIONS: ReadonlyMap<
  string,
  ServedInterface
> = new Map([
  ['SteamUser023', { family: 'SteamUser', mode: 'wire' }],
  ['SteamFriends018', { family: 'SteamFriends', mode: 'wire' }]
])

// D-51-13: empty until 51-15, same rationale as SHIM64_EXPORTED_SYMBOLS.
export const SHIM64_SERVED_INTERFACE_VERSIONS: ReadonlyMap<
  string,
  ServedInterface
> = new Map()

// D-51-13: whether the (future) Win64 shim answers an unserved required
// interface version with a null-object fallback (a real pointer to a
// do-nothing vtable) rather than reporting it missing outright. False today
// -- there is no Win64 shim at all yet. `evaluateShimCoverageWith` below
// takes this as an explicit parameter (not just reading the module-level
// constant) so tests can exercise the `true` branch before any real Win64
// shim exists.
export const SHIM_X64_NULL_OBJECT_FALLBACK = false

interface ExportSetVersionInputs {
  x86ExportedSymbols: ReadonlySet<string>
  x64ExportedSymbols: ReadonlySet<string>
  x86ServedVersions: ReadonlyMap<string, ServedInterface>
  x64ServedVersions: ReadonlyMap<string, ServedInterface>
  x64NullObjectFallback: boolean
}

function sortedServedEntries(
  servedVersions: ReadonlyMap<string, ServedInterface>
): string[] {
  return [...servedVersions.entries()]
    .map(([version, served]) => `${version}:${served.family}:${served.mode}`)
    .sort()
}

/**
 * D-51-07: computes the shim export-set version stamped onto every persisted
 * scan verdict (51-09's `SteamBridgeScanVerdict.shimExportSetVersion`) --
 * sha256 over sorted x86 exports + '|' + sorted x64 exports + '|' + sorted
 * served versions (with their modes) + '|' + the fallback flag, first 12 hex
 * chars. A later release whose shim covers a previously-missing symbol
 * changes this value, which is exactly the signal `isScanVerdictNowCovered`
 * below uses to auto-clear a stale verdict (no manual "retry" affordance).
 *
 * Exported (not just used to compute SHIM_EXPORT_SET_VERSION below) so
 * shimCoverage.test.ts can prove the hash actually changes when a symbol is
 * added to a COPY of the real inputs, without mutating the real constants.
 */
export function computeExportSetVersion(
  inputs: ExportSetVersionInputs
): string {
  const x86 = [...inputs.x86ExportedSymbols].sort().join(',')
  const x64 = [...inputs.x64ExportedSymbols].sort().join(',')
  const served = [
    ...sortedServedEntries(inputs.x86ServedVersions),
    ...sortedServedEntries(inputs.x64ServedVersions)
  ]
    .sort()
    .join(',')
  const payload = `${x86}|${x64}|${served}|${inputs.x64NullObjectFallback}`
  return createHash('sha256').update(payload).digest('hex').slice(0, 12)
}

/** The real, current shim export-set version -- what every live coverage
 * check and persisted scan verdict actually uses. See `computeExportSetVersion`
 * for the exact composition. */
export const SHIM_EXPORT_SET_VERSION = computeExportSetVersion({
  x86ExportedSymbols: SHIM_EXPORTED_SYMBOLS,
  x64ExportedSymbols: SHIM64_EXPORTED_SYMBOLS,
  x86ServedVersions: SHIM_SERVED_INTERFACE_VERSIONS,
  x64ServedVersions: SHIM64_SERVED_INTERFACE_VERSIONS,
  x64NullObjectFallback: SHIM_X64_NULL_OBJECT_FALLBACK
})

export interface EvaluateShimCoverageInput {
  arch: 'x86' | 'x64'
  /** Every imported symbol (bare accessors included, per 51-02's widened
   * importScan.ts) a game's binary needs. */
  symbols: string[]
  /** family -> exact required interface version, from 51-02's
   * `resolveRequiredInterfaceVersions`. */
  requiredInterfaceVersions: Record<string, string>
  /** `unknown-version` / `ambiguous` problems from 51-02, appended verbatim
   * to the result's `missingSymbols` -- a named problem is never silently
   * dropped, and never magically "covered" by a future shim release either
   * (it is not a symbol or version string any export/served set can ever
   * contain). */
  versionProblems: string[]
}

export interface ShimCoverageResult {
  missingSymbols: string[]
  stubbedInterfaces: string[]
}

interface ShimCoverageSets {
  x86ExportedSymbols: ReadonlySet<string>
  x64ExportedSymbols: ReadonlySet<string>
  x86ServedVersions: ReadonlyMap<string, ServedInterface>
  x64ServedVersions: ReadonlyMap<string, ServedInterface>
  x64NullObjectFallback: boolean
}

/**
 * The pure core of `evaluateShimCoverage` below, taking every coverage set
 * (including the x64 null-object-fallback flag) as an explicit parameter
 * rather than reading the module-level constants -- lets
 * shimCoverage.test.ts exercise the x64 null-object-fallback `true` branch
 * and arbitrary served/exported sets without any module-level mutation.
 *
 * Order of `missingSymbols` (D-51-07, action text): symbols not exported for
 * the given arch, THEN unserved required interface versions, THEN
 * `versionProblems` verbatim.
 */
export function evaluateShimCoverageWith(
  sets: ShimCoverageSets,
  input: EvaluateShimCoverageInput
): ShimCoverageResult {
  const exportedSymbols =
    input.arch === 'x86' ? sets.x86ExportedSymbols : sets.x64ExportedSymbols
  const servedVersions =
    input.arch === 'x86' ? sets.x86ServedVersions : sets.x64ServedVersions

  const missingSymbols: string[] = []
  const stubbedInterfaces: string[] = []

  for (const symbol of input.symbols) {
    if (!exportedSymbols.has(symbol)) {
      missingSymbols.push(symbol)
    }
  }

  for (const [family, version] of Object.entries(
    input.requiredInterfaceVersions
  )) {
    const served = servedVersions.get(version)
    if (!served) {
      // D-51-13: on x64, a null-object fallback answers an unserved version
      // with a real (do-nothing) pointer rather than nothing at all -- that
      // is a stub, not a missing symbol. Arch-scoped: the fallback never
      // applies to x86 (there is no x86 null-object fallback concept).
      if (input.arch === 'x64' && sets.x64NullObjectFallback) {
        stubbedInterfaces.push(family)
      } else {
        missingSymbols.push(version)
      }
    } else if (served.mode === 'stub') {
      stubbedInterfaces.push(served.family)
    }
  }

  missingSymbols.push(...input.versionProblems)

  return { missingSymbols, stubbedInterfaces }
}

/**
 * The real, live coverage check -- wraps `evaluateShimCoverageWith` with the
 * module's actual export/served sets and the actual
 * `SHIM_X64_NULL_OBJECT_FALLBACK` flag. This is what 51-07's route resolver
 * and shimGenerate.ts's placement check call; `evaluateShimCoverageWith` is
 * for tests that need to vary the sets themselves.
 */
export function evaluateShimCoverage(
  input: EvaluateShimCoverageInput
): ShimCoverageResult {
  return evaluateShimCoverageWith(
    {
      x86ExportedSymbols: SHIM_EXPORTED_SYMBOLS,
      x64ExportedSymbols: SHIM64_EXPORTED_SYMBOLS,
      x86ServedVersions: SHIM_SERVED_INTERFACE_VERSIONS,
      x64ServedVersions: SHIM64_SERVED_INTERFACE_VERSIONS,
      x64NullObjectFallback: SHIM_X64_NULL_OBJECT_FALLBACK
    },
    input
  )
}

/**
 * D-51-07: re-runs the "is this now covered" membership test on a PERSISTED
 * scan verdict's stored `missingSymbols` list ONLY (never a full re-scan --
 * that only happens on the next real install/launch). Returns true iff
 * EVERY stored entry is now either an exported symbol (either arch) or a key
 * in either served-versions map (wire OR stub -- being recognized at all is
 * "covered" for this purpose; whether it is wired or stubbed is a separate,
 * later concern for D-51-02's notice). A differently-shaped stored entry
 * (e.g. a problem string like `SteamUser@unknown-version`, never a bare
 * symbol or version string) can never match either lookup, so it is never
 * covered -- exactly the fail-safe direction D-51-07 wants: an ambiguous
 * historical miss does not silently clear itself.
 *
 * Takes a minimal structural shape (not the full `SteamBridgeScanVerdict`
 * from electronStores.ts) to preserve this module's zero-backend-import
 * boundary -- a real scan verdict satisfies this shape structurally.
 */
export function isScanVerdictNowCovered(scan: {
  missingSymbols: string[]
}): boolean {
  const isCovered = (entry: string): boolean =>
    SHIM_EXPORTED_SYMBOLS.has(entry) ||
    SHIM64_EXPORTED_SYMBOLS.has(entry) ||
    SHIM_SERVED_INTERFACE_VERSIONS.has(entry) ||
    SHIM64_SERVED_INTERFACE_VERSIONS.has(entry)

  return scan.missingSymbols.every(isCovered)
}
