/**
 * Phase 51 Plan 18 (D-51-15): the closing measurement -- re-runs the
 * research session's one-shot owned-Windows-library import census against
 * whatever coverage the build actually SHIPS, on demand, forever. No
 * threshold is pre-set: the tool reports N of M titles routed to the
 * bridge, with every miss classified. Amended 2026-10-23 (quick 261023-oq7):
 * "routed" follows the live resolver (scan-miss titles are placed and
 * launched anyway); "covered" is the old routed meaning and the D-51-15
 * coverage verdict. Amended 2026-10-24 (quick 261024-f0w): "verified" means
 * the helper logged a HELLO for the appid AND the game's own Unity
 * Player.log shows no Steam-init failure; the allowlist's playVerified
 * record is shown separately as "Play recorded (allowlist)".
 * Amended 2026-10-24 (quick 261024-uir): a steam_api*.dll that is the GameLib
 * shim still means "a steam_api ships" -- the original is read from its
 * .gamelib-orig backup, else from the persisted bridge.scan verdict, else the
 * row is 'unconfirmed' (routed, never covered); it is never 'no-steam-api'.
 *
 * Two halves, same split as `captureShellScrollback.ts`/
 * `extractProtonInventory.ts`:
 *
 *  - The CLASSIFIER (`classifyCensusTitle`, `summarizeCensus`) is pure and
 *    unit-tested against fixture inputs -- no filesystem, no objdump spawn.
 *    It composes the SAME pure modules the live bridge uses
 *    (`importParse.ts`, `interfaceVersions.ts`, `shimCoverage.ts`), per the
 *    plan's `evaluateShimCoverage with the shipped sets` key link, so a
 *    census result can never silently diverge from what install/launch
 *    would actually decide.
 *  - The CLI DRIVER (`findBridgeBottles` down to `main`) is operator-run,
 *    read-only, and NEVER unit-tested with a real filesystem/objdump --
 *    exercised live via `pnpm bridge-census` (this plan's second
 *    `<verify>` line). It enumerates `appmanifest_*.acf` across the
 *    shared and per-game bridge bottles, finds each title's own exe,
 *    objdumps it, and classifies.
 *
 * Exe selection (quick 261024-f0w): every candidate exe is objdumped and the
 * one whose arch matches the persisted `steam_metadata.json`
 * `<appId>.bridge.scan.arch` verdict (what install scanned and launch ran) is
 * chosen -- a dual-arch title (AoD.exe x86 + AoD64.exe x64) is no longer
 * measured by whichever exe walks first. With no verdict the first importer
 * is kept and the row's detail says the arch is unconfirmed.
 *
 * T-51-39 (mitigate, low): a row ever printed or returned contains ONLY
 * appid/name/installdir/arch/class/detail/playRecorded/evidence/
 * evidenceDetail -- never a full filesystem path
 * under the user's HOME, and never any other ACF field (no account data).
 * `CensusTitleInput.installdir` is always the bare ACF `installdir` value
 * (a folder NAME, e.g. "Avernum 6"), never the resolved absolute install
 * path -- the absolute path is used internally to find/objdump the exe and
 * is never threaded into a `CensusRow`.
 * Quick 261024-uir: persisted `missingSymbols` are filtered to path-free strings
 * (no '/' or '\\', at most 128 chars) before they can reach `detail`.
 *
 * Declared real-profile arm (CLAUDE.md two-profile rule, gamelib-conventions
 * SKILL.md "Fake-HOME isolation"): this tool's entire purpose is reading
 * the OPERATOR'S REAL, populated CrossOver bottles -- an isolated fake HOME
 * would have nothing to census. The two `spawnSync('/usr/bin/objdump', ...)`
 * calls below are argv-form only (T-24-06/ASVS V5 convention, mirrored from
 * `importScan.ts`) and never pass an `env` option at all, so this file
 * cannot trip `fakeHomeIsolation.test.ts` (which only flags a spawn site
 * that hand-rolls one of the eight home/config/state env keys) -- it is
 * declared here anyway because the convention asks every real-profile arm
 * to name itself in its own docblock, not just the ones the gate happens to
 * reach.
 * Phase 53 (D-53-12): the two spawns are reached through the Promise-wrapped
 * `scanDeps.scanImports` handed to the shared `bridgeScan.ts` (the census owns
 * no scan walk of its own); the declared arm is unchanged and still passes no
 * `env`.
 * Quick 261024-uir: the driver also reads `.gamelib-orig` backups inside the
 * operator's bottles and the persisted `steam_metadata.json` scan verdict,
 * read-only, and still passes no `env` to any spawn.
 *
 * Zero backend imports by design, same discipline `importParse.ts`/
 * `interfaceVersions.ts`/`shimCoverage.ts` already established (D-51-15's
 * own doc comment on `importParse.ts`): only `node:*` builtins, the four
 * pure bridge modules (`importParse.ts`, `interfaceVersions.ts`,
 * `shimCoverage.ts`, and -- quick 261024-br4 -- the Steam CEG / `.bind` PE
 * scanner `peSteamDrm.ts`; by relative path, not a `backend/...` alias), and
 * `@node-steam/vdf` (a plain npm dependency, not a backend module). This
 * keeps `pnpm bridge-census` (`node meta/runTs.cjs --bundle --platform=node
 * --target=node21 meta/bridgeCensus.ts`) bundleable standalone.
 *
 * Repo-relative reads use `process.cwd()`, NOT `__dirname` -- `runTs.cjs`
 * bundles this file into a private `mkdtempSync` tmpdir and runs it from
 * there, so `__dirname` resolves outside the repo (the same `captureShell
 * Scrollback.ts`/`checkBuildBinMirror.ts`/`genI18nGateScope.ts` convention).
 * `pnpm` runs package scripts with the repo root as cwd.
 */

import {
  closeSync,
  existsSync,
  lstatSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  statSync
} from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { parse as parseVdf } from '@node-steam/vdf'

import {
  parseSteamApiImportTable,
  runtimeLoadedSteamApiMarker,
  type ImportTableResult
} from '../src/backend/storeManagers/steam/bridge/importParse'
import {
  readInterfaceVersionStrings,
  resolveRequiredInterfaceVersions,
  selectInterfaceVersionPool,
  usesRuntimeInterfaceLookup
} from '../src/backend/storeManagers/steam/bridge/interfaceVersions'
import {
  evaluateShimCoverage,
  SHIM64_EXPORTED_SYMBOLS
} from '../src/backend/storeManagers/steam/bridge/shimCoverage'
import {
  detectSteamDrmInPe,
  readPeSteamApiDelayImports
} from '../src/backend/storeManagers/steam/bridge/peSteamDrm'
import {
  findRuntimeLoadedSteamApiDlls,
  findSteamApiImporterPes,
  findUnrealLayout,
  partitionManagedImports,
  readFileEffectiveArch,
  resolveWalkRoot,
  scanManagedSteamApi,
  servedFamiliesFor,
  type BridgeImportScan,
  type BridgeScanDeps
} from '../src/backend/storeManagers/steam/bridge/bridgeScan'

// ---------------------------------------------------------------------------
// Pure classifier
// ---------------------------------------------------------------------------

export type CensusClass =
  | 'bridge'
  | 'no-steam-api'
  | 'win64-no-shim'
  | 'missing-symbols'
  | 'unknown-version'
  | 'known-bad'
  | 'no-binary'
  | 'unconfirmed'

/** T-51-39: the ONLY fields a row may ever carry -- never a path, never an
 * account field. */
export interface CensusRow {
  appid: string
  name: string
  installdir: string
  arch: 'x86' | 'x64' | 'none'
  class: CensusClass
  detail: string
  /** True only when the title is routed AND its allowlist seed entry carries
   * a playVerified record. That record is NOT proof the bridge ran the game
   * (it cites Mac Steam In-Game status, which the helper's own SteamAPI_Init
   * produces), so it is shown as "Play recorded (allowlist)", never verified. */
  playRecorded: boolean
  /** 'verified' = HELLO for this appid AND a found, clean game log. */
  evidence: 'verified' | 'unverified' | 'init-failed'
  /** A Steam symbol name or a short fixed reason; never a path or log line. */
  evidenceDetail: string
}

export interface BridgeEvidence {
  status: 'verified' | 'unverified' | 'init-failed'
  detail: string
}

/** Quick 261024-uir: where a steam_api*.dll found in the install tree came
 * from. 'original' = a non-shim file on disk; 'shim-backed' = the GameLib
 * shim with a valid non-shim `.gamelib-orig` beside it; 'shim-only' = the shim
 * with no usable backup. */
export type RuntimeDllProvenance = 'original' | 'shim-backed' | 'shim-only'

export type RuntimeDllName = 'steam_api.dll' | 'steam_api64.dll'

/** Quick 261024-uir: the persisted `<appId>.bridge.scan` verdict, mirroring
 * `bridgeScanVerdictSchema` without importing it (zero-backend-import). */
export interface PersistedScanVerdict {
  status: 'clean' | 'miss'
  arch: 'x86' | 'x64'
  missingSymbols: string[]
  interfaceVersions: Record<string, string>
}

/** Structural twin of bridgeScan's `ManagedScanResult` (`unparsed` optional
 * so fixtures stay small). */
export type CensusManaged =
  | {
      kind: 'mono'
      assemblies: number
      unparsed?: number
      symbols: string[]
      versionStrings: string[]
    }
  | { kind: 'il2cpp'; reason: 'il2cpp: not scanned' }
  | { kind: 'none' }

const RUNTIME_DLL_ARCH: Record<RuntimeDllName, 'x86' | 'x64'> = {
  'steam_api.dll': 'x86',
  'steam_api64.dll': 'x64'
}

export interface CensusTitleInput {
  appid: string
  name: string
  installdir: string
  /** The closed-taxonomy known-bad reason string, or null/undefined when
   * `appid` is not on the bundled known-bad list. */
  knownBadReason?: string | null
  /** The seed entry carries a `playVerified` record (live evidence). */
  playVerified?: boolean
  /** A steam_api*.dll ships in the install tree although the launch exe's
   * import table has no steam_api entry -- the exe loads it at runtime. Set
   * for a non-shim file OR a shim whose `.gamelib-orig` backup is the game's
   * original. Same signal the live path records as `<dll>@runtime-loaded`. */
  runtimeLoadedDll?: 'steam_api.dll' | 'steam_api64.dll' | null
  /** Quick 261024-uir: the install tree's only steam_api*.dll is the GameLib
   * shim with no `.gamelib-orig` backup. `persistedScan` is the persisted
   * bridge.scan verdict when one exists, else null. Never 'no-steam-api'. */
  shimOnlyRuntimeDll?: {
    dll: 'steam_api.dll' | 'steam_api64.dll'
    persistedScan: PersistedScanVerdict | null
  } | null
  /** Quick 261024-br4: the chosen exe's Steam DRM scan (`peSteamDrm.ts`).
   * `null`/absent when not scanned or the PE did not parse (not CEG). */
  steamDrm?: { cegMarkers: string[]; hasBindSection: boolean } | null
  /** Quick 261024-f0w: set when the chosen exe's arch was not confirmed by a
   * persisted install verdict (dual-arch install). Appended to `detail`;
   * names an arch, never a path. */
  archNote?: string
  /** Quick 261024-f0w: the live-log evidence verdict; absent reads as
   * 'unverified' / 'evidence not collected'. */
  evidence?: BridgeEvidence
  /** D-53-10: the arch the chosen exe launches as (AnyCPU without
   * 32BITREQUIRED/32BITPREFERRED is x64). Reported on rows whose exe imports
   * no steam_api statically, instead of 'none'. */
  launchArch?: 'x86' | 'x64' | null
  /** D-53-04: the Mono / IL2CPP managed scan of the chosen exe's `_Data`
   * dir (the shared `scanManagedSteamApi`). Absent reads as 'none'. */
  managed?: CensusManaged | null
  /** D-53-12: importer PEs (UE Shipping exe, Grim Dawn-style engine dlls)
   * that import the runtime-loaded dll's arch, merged by the driver. Used
   * when the launch exe itself imports no steam_api (arch 'none'). */
  importerEvidence?: {
    symbols: string[]
    dllVersions: string[]
    exeVersions: string[]
  } | null
  /** `null` when no scannable PE exe (with or without a steam_api import)
   * was found anywhere under the title's installdir at all. */
  exe: {
    arch: 'x86' | 'x64' | 'none'
    symbols: string[]
    dllVersions: string[]
    exeVersions: string[]
  } | null
}

/** Injectable coverage dependencies -- defaults to the REAL, shipped
 * modules the live bridge uses. Tests override `x64ExportedSymbols` with an
 * empty set to exercise the 'win64-no-shim' structural case, since the
 * real set has been non-empty since 51-15's D-51-13 GO. */
export interface CensusCoverageDeps {
  resolveRequiredInterfaceVersions: typeof resolveRequiredInterfaceVersions
  evaluateShimCoverage: typeof evaluateShimCoverage
  x64ExportedSymbols: ReadonlySet<string>
}

export const DEFAULT_COVERAGE_DEPS: CensusCoverageDeps = {
  resolveRequiredInterfaceVersions,
  evaluateShimCoverage,
  x64ExportedSymbols: SHIM64_EXPORTED_SYMBOLS
}

/**
 * Pure classifier. Composes `resolveRequiredInterfaceVersions` +
 * `evaluateShimCoverage` -- the exact pipeline `shimGenerate.ts`'s real
 * install-time placement check runs -- so a census verdict can never
 * silently diverge from what a real install/launch would decide.
 *
 * Precedence (each branch is mutually exclusive with the ones below it):
 *  0. `steamDrm.cegMarkers` non-empty -> 'known-bad' with detail exactly
 *     'drm-wrapped' (quick 261024-br4). Checked ahead of a bundled
 *     knownBadReason: a detected CEG is the stronger fact, so a title
 *     bundled as e.g. 'does-not-run' still counts as a DRM miss -- the same
 *     order the live resolver uses (`verdict.drm === 'ceg'` wins).
 *  1. `knownBadReason` present -> 'known-bad' (checked first: a known-bad
 *     title is classified regardless of what its exe looks like. Only a
 *     'drm-wrapped' title is never attempted on the bridge; the live
 *     resolver (amended 2026-10-23) keeps the other reasons on the bridge
 *     behind a notice, but the census still counts them as known-bad).
 *  2. `exe === null` -> 'no-binary' (nothing objdump-able was found at all).
 *  3. `exe.arch === 'none'` (an exe WAS found, but imports nothing from
 *     `steam_api(64)?.dll`): when a steam_api*.dll ships in the install tree
 *     (`runtimeLoadedDll`) -> 'missing-symbols' with the live path's
 *     `<dll>@runtime-loaded` marker (the exe loads it at runtime, so the
 *     import table proves nothing). Quick 261024-uir: a placed GameLib shim
 *     still means "a steam_api ships" -- with a `.gamelib-orig` backup the row
 *     is the original's (`runtimeLoadedDll`); with no backup but a persisted
 *     bridge.scan verdict (`shimOnlyRuntimeDll.persistedScan`) -> 'missing-
 *     symbols' carrying the marker and the persisted symbols; with neither ->
 *     'unconfirmed' (routed, never covered, never play-recorded). Only a tree
 *     with no steam_api*.dll at all -> 'no-steam-api', routed but labelled so
 *     it is never mistaken for a coverage proof.
 *  4. `arch === 'x64'` and the x64 export set is structurally empty ->
 *     'win64-no-shim', without ever calling into coverage resolution --
 *     there is nothing to evaluate against.
 *  5. Any unresolved interface-version family (`resolveRequiredInterface
 *     Versions`'s `problems`, e.g. `"SteamUser@unknown-version"` or
 *     `"SteamUser@ambiguous(...)"`) -> 'unknown-version', carrying every
 *     problem string verbatim.
 *  6. Any symbol/version `evaluateShimCoverage` reports missing ->
 *     'missing-symbols', carrying the list verbatim.
 *  7. Otherwise -> 'bridge'.
 *
 * After classification, a SteamStub `.bind` section (`steamDrm.hasBindSection`)
 * appends an informational suffix to `detail` on every non-known-bad row. It
 * never changes the class, so it never changes routing (SteamStub is in scope
 * for the bridge; bottled Steam is a narrow fallback), and it adds no
 * `CensusRow` key (T-51-39).
 */
export function classifyCensusTitle(
  input: CensusTitleInput,
  deps: CensusCoverageDeps = DEFAULT_COVERAGE_DEPS
): CensusRow {
  let row = classifyCensusTitleCore(input, deps)
  if (input.archNote) {
    const note = input.archNote
    row = { ...row, detail: row.detail ? `${row.detail}; ${note}` : note }
  }
  row = withManagedNote(input, row)
  if (input.steamDrm?.hasBindSection && row.class !== 'known-bad') {
    const note = 'SteamStub .bind section (informational)'
    return { ...row, detail: row.detail ? `${row.detail}; ${note}` : note }
  }
  return row
}

/** The arch the title's managed names are served against: the row's own arch,
 * else the runtime-loaded dll's. */
function managedArchFor(
  input: CensusTitleInput,
  rowArch: CensusRow['arch']
): 'x86' | 'x64' | null {
  if (rowArch !== 'none') return rowArch
  return input.runtimeLoadedDll
    ? RUNTIME_DLL_ARCH[input.runtimeLoadedDll]
    : null
}

/** D-53-04: a Mono row's detail appends the lazy unserved-family count; an
 * IL2CPP row says it was not scanned. Fixed strings and counts only. */
function withManagedNote(input: CensusTitleInput, row: CensusRow): CensusRow {
  const managed = input.managed
  if (!managed || row.class === 'known-bad' || row.class === 'no-binary') {
    return row
  }
  let note = ''
  if (managed.kind === 'il2cpp') {
    note = managed.reason
  } else if (managed.kind === 'mono') {
    const arch = managedArchFor(input, row.arch)
    if (arch) {
      const { unservedFamilyCount } = partitionManagedImports(
        managed.symbols,
        servedFamiliesFor(arch)
      )
      if (unservedFamilyCount > 0) {
        note = `+${unservedFamilyCount} unserved-family imports (lazy)`
      }
    }
  }
  if (!note) return row
  return { ...row, detail: row.detail ? `${row.detail}; ${note}` : note }
}

function classifyCensusTitleCore(
  input: CensusTitleInput,
  deps: CensusCoverageDeps
): CensusRow {
  const base = {
    appid: input.appid,
    name: input.name,
    installdir: input.installdir
  }
  const withFlags = (
    row: Omit<CensusRow, 'playRecorded' | 'evidence' | 'evidenceDetail'>
  ): CensusRow => ({
    ...row,
    playRecorded:
      input.playVerified === true &&
      (row.class === 'bridge' || row.class === 'no-steam-api'),
    ...(row.class === 'known-bad' && input.evidence?.status === 'verified'
      ? {
          // 53-11: a known-bad row is never verified.
          evidence: 'unverified' as const,
          evidenceDetail: `known-bad: ${row.detail}`
        }
      : {
          evidence: input.evidence?.status ?? 'unverified',
          evidenceDetail: input.evidence?.detail ?? 'evidence not collected'
        })
  })

  if (input.steamDrm && input.steamDrm.cegMarkers.length > 0) {
    return withFlags({
      ...base,
      arch: input.exe?.arch ?? 'none',
      class: 'known-bad',
      detail: 'drm-wrapped'
    })
  }

  if (input.knownBadReason) {
    return withFlags({
      ...base,
      arch: input.exe?.arch ?? 'none',
      class: 'known-bad',
      detail: input.knownBadReason
    })
  }

  if (input.exe === null) {
    return withFlags({
      ...base,
      arch: 'none',
      class: 'no-binary',
      detail: 'no scannable PE executable found under installdir'
    })
  }

  const { arch, symbols, dllVersions, exeVersions } = input.exe

  const launchArch = input.launchArch ?? 'none'
  if (arch === 'none') {
    if (input.runtimeLoadedDll) {
      // D-53-12: the same evidence rule as shimGenerate -- importer PEs or
      // managed required names make the title evaluable; neither leaves the
      // runtime-loaded marker.
      const rtArch = RUNTIME_DLL_ARCH[input.runtimeLoadedDll]
      const managedReq =
        input.managed?.kind === 'mono'
          ? partitionManagedImports(
              input.managed.symbols,
              servedFamiliesFor(rtArch)
            ).required
          : []
      const importer = input.importerEvidence ?? null
      if (importer === null && managedReq.length === 0) {
        return withFlags({
          ...base,
          arch: launchArch,
          class: 'missing-symbols',
          detail: runtimeLoadedSteamApiMarker(input.runtimeLoadedDll)
        })
      }
      return evaluate(
        withFlags,
        base,
        deps,
        rtArch,
        [...new Set([...(importer?.symbols ?? []), ...managedReq])],
        importer?.dllVersions ?? [],
        importer?.exeVersions ?? [],
        input.managed?.kind === 'mono' ? input.managed.versionStrings : null
      )
    }
    if (input.shimOnlyRuntimeDll) {
      const { dll, persistedScan } = input.shimOnlyRuntimeDll
      if (persistedScan) {
        const marker = runtimeLoadedSteamApiMarker(dll)
        const base2 = `${marker}; shim placed over the original, no .gamelib-orig backup -- persisted bridge.scan`
        // A clean verdict still reads missing-symbols: the census never
        // evaluates importer PEs, so the unshimmed original classifies the
        // same way (marker miss). Keeps output independent of launch history.
        const detail =
          persistedScan.status === 'miss'
            ? (() => {
                const list = persistedScan.missingSymbols.filter(
                  (m) => m !== marker
                )
                return list.length > 0
                  ? `${base2} miss: ${list.join(', ')}`
                  : `${base2} miss`
              })()
            : `${base2} clean (importer coverage not re-measured by the census)`
        return withFlags({
          ...base,
          arch: launchArch,
          class: 'missing-symbols',
          detail
        })
      }
      return withFlags({
        ...base,
        arch: launchArch,
        class: 'unconfirmed',
        detail: `${dll} in the install tree is the GameLib shim; no .gamelib-orig backup and no persisted bridge.scan verdict -- original unconfirmed`
      })
    }
    return withFlags({
      ...base,
      arch: 'none',
      class: 'no-steam-api',
      detail:
        'launch exe imports no steam_api and none ships in the install tree'
    })
  }

  const managedReq =
    input.managed?.kind === 'mono'
      ? partitionManagedImports(input.managed.symbols, servedFamiliesFor(arch))
          .required
      : []
  return evaluate(
    withFlags,
    base,
    deps,
    arch,
    [...new Set([...symbols, ...managedReq])],
    dllVersions,
    exeVersions,
    input.managed?.kind === 'mono' ? input.managed.versionStrings : null
  )
}

/** The shared tail of the classifier: structural x64 gap, interface-version
 * resolution (managed constants alone form the pool, 53-05), then coverage. */
function evaluate(
  withFlags: (
    row: Omit<CensusRow, 'playRecorded' | 'evidence' | 'evidenceDetail'>
  ) => CensusRow,
  base: { appid: string; name: string; installdir: string },
  deps: CensusCoverageDeps,
  arch: 'x86' | 'x64',
  symbols: string[],
  dllVersions: string[],
  exeVersions: string[],
  managedVersions: string[] | null
): CensusRow {
  if (arch === 'x64' && deps.x64ExportedSymbols.size === 0) {
    return withFlags({
      ...base,
      arch: 'x64',
      class: 'win64-no-shim',
      detail: 'no Win64 shim capability built (SHIM64 export set empty)'
    })
  }

  const pool = selectInterfaceVersionPool({
    managedVersions,
    dllVersions,
    exeVersions
  })
  const { required, problems } = deps.resolveRequiredInterfaceVersions({
    importedSymbols: symbols,
    dllVersions: pool.dllVersions,
    exeVersions: pool.exeVersions
  })

  if (problems.length > 0) {
    return withFlags({
      ...base,
      arch,
      class: 'unknown-version',
      detail: problems.join(', ')
    })
  }

  const coverage = deps.evaluateShimCoverage({
    arch,
    symbols,
    requiredInterfaceVersions: required,
    versionProblems: []
  })

  if (coverage.missingSymbols.length > 0) {
    return withFlags({
      ...base,
      arch,
      class: 'missing-symbols',
      detail: coverage.missingSymbols.join(', ')
    })
  }

  return withFlags({ ...base, arch, class: 'bridge', detail: '' })
}

export interface JudgedSymbols {
  appid: string
  arch: 'x86' | 'x64' | 'none'
  symbols: string[]
}

const X86_MODERN_OR_FLAT = [
  'SteamInternal_SteamAPI_Init',
  'SteamInternal_ContextInit',
  'SteamInternal_FindOrCreate',
  'SteamInternal_GameServer_Init',
  'SteamAPI_ISteam'
]

/** D-53-09: the x86-launch titles whose judged symbols need the modern
 * SteamInternal_* family or the flat API. Pure. */
export function countX86ModernOrFlat(items: JudgedSymbols[]): {
  count: number
  appids: string[]
} {
  const appids = items
    .filter(
      (i) =>
        i.arch === 'x86' &&
        i.symbols.some((sym) =>
          X86_MODERN_OR_FLAT.some((prefix) => sym.startsWith(prefix))
        )
    )
    .map((i) => i.appid)
  return { count: appids.length, appids: [...new Set(appids)].sort() }
}

/** Rows the live resolver sends to the bridge (amended 2026-10-23, quick
 * 261023-oq7): every class except win64-no-shim, no-binary (counted
 * conservatively as not routed) and known-bad 'drm-wrapped'. Quick
 * 261024-uir: 'unconfirmed' IS routed -- a placed shim is the live path's own
 * evidence of bridge routing -- but is never covered. */
function isRoutedToBridge(row: CensusRow): boolean {
  if (row.class === 'win64-no-shim' || row.class === 'no-binary') return false
  if (row.class === 'known-bad' && row.detail === 'drm-wrapped') return false
  return true
}

/**
 * routed = what the resolver sends to the bridge (see `isRoutedToBridge`),
 * which now includes scan-miss and non-DRM known-bad titles that are placed
 * and launched anyway. covered = class 'bridge' or 'no-steam-api': the shim
 * fully covers the title's symbols (static scan), the D-51-15 coverage
 * verdict ('unconfirmed', quick 261024-uir, is routed but never covered).
 * verified = rows whose evidence is 'verified' (HELLO + clean game
 * log). playRecorded = the allowlist's playVerified record, kept apart. A
 * 'no-binary' row never counts as routed or covered, but it DOES count
 * toward `total`.
 */
export function summarizeCensus(rows: CensusRow[]): {
  routed: number
  covered: number
  verified: number
  initFailed: number
  unverified: number
  playRecorded: number
  total: number
  steamworksUsing: number
  verifiedSteamworksUsing: number
  majority: boolean
  byClass: Record<string, number>
} {
  const byClass: Record<string, number> = {}
  let routed = 0
  let covered = 0
  let verified = 0
  let initFailed = 0
  let unverified = 0
  let playRecorded = 0
  let steamworksUsing = 0
  let verifiedSteamworksUsing = 0

  for (const row of rows) {
    byClass[row.class] = (byClass[row.class] ?? 0) + 1
    // D-53-14: the majority denominator. known-bad and win64-no-shim rows
    // DO use Steamworks, so they stay in; no-steam-api / no-binary do not.
    if (row.class !== 'no-steam-api' && row.class !== 'no-binary') {
      steamworksUsing++
      if (row.evidence === 'verified') verifiedSteamworksUsing++
    }
    if (isRoutedToBridge(row)) {
      routed++
    }
    if (row.class === 'bridge' || row.class === 'no-steam-api') {
      covered++
    }
    if (row.evidence === 'verified') {
      verified++
    } else if (row.evidence === 'init-failed') {
      initFailed++
    } else {
      unverified++
    }
    if (row.playRecorded) {
      playRecorded++
    }
  }

  return {
    routed,
    covered,
    verified,
    initFailed,
    unverified,
    playRecorded,
    total: rows.length,
    steamworksUsing,
    verifiedSteamworksUsing,
    majority: verifiedSteamworksUsing * 2 > steamworksUsing,
    byClass
  }
}

/**
 * Quick 261024-uir: picks the runtime-loaded steam_api dll from the walk's
 * per-dll provenance, mirroring the live `findRuntimeLoadedSteamApiDlls`
 * (steam_api64.dll preferred when both ship). 'original' / 'shim-backed' set
 * `runtimeLoadedDll` (the backup IS the original); 'shim-only' sets
 * `shimOnlyRuntimeDll` carrying the persisted verdict (or null).
 */
export function pickRuntimeSteamApiDll(
  found: Array<{ name: RuntimeDllName; provenance: RuntimeDllProvenance }>,
  persistedScan: PersistedScanVerdict | undefined
): {
  runtimeLoadedDll: RuntimeDllName | null
  shimOnlyRuntimeDll: {
    dll: RuntimeDllName
    persistedScan: PersistedScanVerdict | null
  } | null
} {
  const name: RuntimeDllName | null = found.some(
    (f) => f.name === 'steam_api64.dll'
  )
    ? 'steam_api64.dll'
    : found.length > 0
      ? 'steam_api.dll'
      : null
  if (!name) return { runtimeLoadedDll: null, shimOnlyRuntimeDll: null }
  const provenances = found
    .filter((f) => f.name === name)
    .map((f) => f.provenance)
  if (provenances.includes('original') || provenances.includes('shim-backed')) {
    return { runtimeLoadedDll: name, shimOnlyRuntimeDll: null }
  }
  return {
    runtimeLoadedDll: null,
    shimOnlyRuntimeDll: { dll: name, persistedScan: persistedScan ?? null }
  }
}

export type CensusEngine =
  | 'unity'
  | 'unreal'
  | 'godot'
  | 'gamemaker'
  | 'unknown'

/** D-53-13: engine guess from top-level install entry names (and exe
 * basenames). Pure. Unity wins first (UnityPlayer.dll / *_Data), then
 * Unreal, Godot, GameMaker. */
export function detectEngine(entryNames: string[]): CensusEngine {
  const names = entryNames.map((n) => n.toLowerCase())
  // IN-04: `<x>_data` is Unity's data dir only when `<x>.exe` sits beside it;
  // a bare `save_data` folder is not evidence of an engine.
  if (
    names.includes('unityplayer.dll') ||
    names.some(
      (n) => n.endsWith('_data') && names.includes(`${n.slice(0, -5)}.exe`)
    )
  ) {
    return 'unity'
  }
  if (
    names.includes('engine') ||
    names.some((n) => n.endsWith('-win64-shipping.exe'))
  ) {
    return 'unreal'
  }
  if (
    names.some((n) => n.endsWith('.pck') || /^libgodotsteam.*\.dll$/.test(n))
  ) {
    return 'godot'
  }
  if (names.includes('data.win')) return 'gamemaker'
  return 'unknown'
}

const UE_INIT_FAILED = [
  /LogSteamShared:\s*Warning:\s*SteamAPI failed to initialize/,
  /LogOnline:\s*Warning:\s*STEAM:\s*Steam API failed to initialize/
]
const UE_INIT_OK =
  /LogOnline:\s*STEAM:\s*\[AppId:\s*\d+\]\s*Client API initialized 1/

const HELPER_PREFIX = /bridge helper \[(\d+)\]:\s?/
const LOGGER_HEADER = /^\(\d{1,2}:\d{2}:\d{2}\) \[/

/** 53-11 (WR-03, census side): the helper-line payloads that belong to
 * `appid`. A line belongs to it when it carries `bridge helper [<appid>]:`, or
 * when it is a logger continuation line (no `(hh:mm:ss) [` header) that
 * follows the nearest preceding prefix line for the same appid. A logger
 * header line without a prefix ends the continuation. Pure. */
export function attributeHelperLines(appid: string, text: string): string[] {
  const out: string[] = []
  let current: string | null = null
  for (const line of text.split('\n')) {
    const m = HELPER_PREFIX.exec(line)
    if (m) {
      current = m[1]
      if (current === appid) out.push(line.slice(m.index + m[0].length))
      continue
    }
    if (LOGGER_HEADER.test(line)) {
      current = null
      continue
    }
    if (current === appid && line.trim() !== '') out.push(line)
  }
  return out
}

/** 53-18 (WR-01): anchored per-appid HELLO matcher. Applied to an attributed
 * helper payload, so a game-supplied version string inside a FWD/NOVER line
 * (`[ts] FWD ... x] HELLO ...`) can never match: only a payload that STARTS
 * `[<ts>] HELLO  shim attached appid=<appid>` counts. */
function helloRegex(appid: string): RegExp {
  return new RegExp(
    `^\\[[^\\]]*\\]\\s+HELLO\\s+shim attached appid=${appid}(?![0-9])`
  )
}

/** 53-18 (WR-01): true when `text` holds a genuine helper HELLO for `appid`. */
function hasHello(appid: string, text: string): boolean {
  if (!/^\d+$/.test(appid)) return false
  const hello = helloRegex(appid)
  return attributeHelperLines(appid, text).some((l) => hello.test(l))
}

/** 53-11 + 53-18: app-log evidence for `appid` comes from a single launch.
 * Takes the newest file holding a genuine HELLO (a `bridge helper [<appid>]:`
 * line whose payload starts with the HELLO, WR-01) and returns its text from
 * that appid's LAST HELLO to end of file, then (WR-06) appends the full text
 * of every newer file in ascending mtime order so evidence written after a
 * gamelib.log rotation is still read; null when no file has a HELLO. Pure. */
export function appLogSegmentFor(
  appid: string,
  files: Array<{ name: string; mtimeMs: number; text: string }>
): string | null {
  if (!/^\d+$/.test(appid)) return null
  const hello = helloRegex(appid)
  const sorted = [...files].sort((a, b) => b.mtimeMs - a.mtimeMs)
  for (const f of sorted) {
    let last = -1
    let offset = 0
    for (const line of f.text.split('\n')) {
      const m = HELPER_PREFIX.exec(line)
      if (
        m &&
        m[1] === appid &&
        hello.test(line.slice(m.index + m[0].length))
      ) {
        last = offset
      }
      offset += line.length + 1
    }
    if (last < 0) continue
    const newer = files
      .filter((o) => o.mtimeMs > f.mtimeMs)
      .sort((x, y) => x.mtimeMs - y.mtimeMs)
    let out = f.text.slice(last)
    for (const o of newer) {
      if (!out.endsWith('\n')) out += '\n'
      out += o.text
    }
    return out
  }
  return null
}

/** Identity calls: a game that really initialised Steam asks who it is. */
const IDENTITY_CALL =
  /^SteamUser\d+\.(GetSteamID|BLoggedOn)$|^SteamFriends\d+\.GetPersonaName$/

/** DISTINCT game-originated bridge CALLs (`Interface.Method`) for `appid` that
 * follow a HELLO for the same appid in the same app-log text. Read only from
 * GameLib's own app logs (T-53-09), appid bracket-anchored. */
function findGameCalls(appid: string, appLogTexts: string[]): string[] {
  const hello = helloRegex(appid)
  const call = /^\[[^\]]*\]\s+CALL\s+([A-Za-z0-9_]+\.[A-Za-z0-9_]+)\s*$/
  const found = new Set<string>()
  for (const text of appLogTexts) {
    const payloads = attributeHelperLines(appid, text)
    const h = payloads.findIndex((l) => hello.test(l))
    if (h < 0) continue
    for (const l of payloads.slice(h + 1)) {
      const m = call.exec(l)
      if (m) found.add(m[1])
    }
  }
  return [...found]
}

/** D-53-15: the init/shutdown family. A title whose judged steam_api import set
 * is made up of only these names has no interface call to observe, so a
 * successful game-originated init is the only evidence it can give. */
const INIT_SHUTDOWN_FAMILY: ReadonlySet<string> = new Set([
  'SteamAPI_Init',
  'SteamAPI_InitSafe',
  'SteamAPI_InitFlat',
  'SteamInternal_SteamAPI_Init',
  'SteamAPI_Shutdown'
])

/** D-53-15: true only when `symbols` is non-empty and every entry is in the
 * init/shutdown family. Any other symbol (an interface accessor, RunCallbacks,
 * a `<dll>@runtime-loaded` marker, ...) makes it false. Pure. */
export function isInitOnlyImportSet(symbols: string[]): boolean {
  return symbols.length > 0 && symbols.every((s) => INIT_SHUTDOWN_FAMILY.has(s))
}

/** D-53-15: the game's own init report for `appid` (a `GINIT` line the helper
 * writes only from the shim's REPORT_INIT frame), scanned after the first HELLO
 * and anchored at payload start so a GINIT-looking string inside a FWD/NOVER
 * payload never matches. The helper's own `INIT` category is never read.
 * Returns the first success (ok=1 AND session=1), else the first matching
 * non-success line, else null. */
function findGameInit(
  appid: string,
  appLogTexts: string[]
): { fn: string; success: boolean } | null {
  const hello = helloRegex(appid)
  const ginit =
    /^\[[^\]]*\]\s+GINIT\s+fn=(SteamAPI_Init|SteamInternal_SteamAPI_Init|SteamAPI_InitSafe|SteamAPI_InitFlat)\s+ret=(-?\d+)\s+ok=([01])\s+session=([01])\s*$/
  let failure: { fn: string; success: boolean } | null = null
  for (const text of appLogTexts) {
    const payloads = attributeHelperLines(appid, text)
    const h = payloads.findIndex((l) => hello.test(l))
    if (h < 0) continue
    for (const l of payloads.slice(h + 1)) {
      const m = ginit.exec(l)
      if (!m) continue
      if (m[3] === '1' && m[4] === '1') return { fn: m[1], success: true }
      failure ??= { fn: m[1], success: false }
    }
  }
  return failure
}

/** First `NOVER` flat-lookup version attributed to `appid` (the sanitised
 * version token only, T-53-46), or null. */
function findNover(appid: string, appLogTexts: string[]): string | null {
  for (const text of appLogTexts) {
    for (const l of attributeHelperLines(appid, text)) {
      const m = /^\[[^\]]*\]\s+NOVER\s+flat lookup ver=([A-Za-z0-9_]+)/.exec(l)
      if (m) return m[1]
    }
  }
  return null
}

/**
 * Quick 261024-f0w + D-53-13 + 53-11 (VERIFICATION gap 4): pure live-evidence
 * check, per engine. Order: no HELLO -> unverified. Unity (the default): no
 * game log -> unverified; a NOVER line for the appid in the launch segment ->
 * init-failed (a flat lookup answered NULL is exactly a Steamworks.NET
 * CSteamAPIContext.Init failure); failure marker -> init-failed; else
 * verified (HELLO + clean Player.log). Unreal: Saved-log failure markers win
 * (init-failed), then `Client API initialized 1` -> verified (a NOVER is
 * noted, non-fatal), else CALL evidence. Godot / GameMaker / unknown log
 * nothing about Steam init, so CALL evidence is used: at least 2 distinct
 * game-originated CALL methods, one an identity call
 * (SteamUser*.GetSteamID/BLoggedOn, SteamFriends*.GetPersonaName); one CALL
 * (ELEX 411300) is unverified, and CALL-only evidence plus a NOVER reads
 * unverified. Helper-originated lines (HELLO, FWD) never count, and Mac Steam
 * In-Game status is deliberately NOT an input.
 *
 * D-53-15: with `initOnlyImports` (judged import set is init/shutdown only)
 * the verdict is HELLO + an anchored `GINIT ... ok=1 session=1` line, nothing
 * else. The helper's own `INIT` line and In-Game status are never inputs.
 */
export function classifyBridgeEvidence(input: {
  appid: string
  appLogTexts: string[]
  gameLogTexts: string[]
  engine?: CensusEngine
  /** D-53-15: the row's judged steam_api import set is init/shutdown only. */
  initOnlyImports?: boolean
}): BridgeEvidence {
  if (!/^\d+$/.test(input.appid)) {
    return { status: 'unverified', detail: 'no HELLO' }
  }
  if (!input.appLogTexts.some((t) => hasHello(input.appid, t))) {
    return { status: 'unverified', detail: 'no HELLO' }
  }
  if (input.initOnlyImports === true) {
    // D-53-15: strict -- an init-only row never falls through to the engine
    // logic. HELLO + a GINIT success (ok=1, live session) verifies it; a failed
    // or missing init line does not.
    const g = findGameInit(input.appid, input.appLogTexts)
    if (g === null) return { status: 'unverified', detail: 'no game init line' }
    if (!g.success) return { status: 'unverified', detail: 'game init failed' }
    return { status: 'verified', detail: `game init ${g.fn}` }
  }
  const engine = input.engine ?? 'unity'
  const nover = findNover(input.appid, input.appLogTexts)
  const callVerdict = (): BridgeEvidence => {
    const calls = findGameCalls(input.appid, input.appLogTexts)
    if (calls.length === 0) {
      return { status: 'unverified', detail: 'no game-originated call' }
    }
    if (calls.length >= 2 && calls.some((c) => IDENTITY_CALL.test(c))) {
      return nover === null
        ? { status: 'verified', detail: `game call ${calls[0]}` }
        : { status: 'unverified', detail: `unserved ${nover}` }
    }
    const n = calls.length
    return {
      status: 'unverified',
      detail: `${n} game call${n === 1 ? '' : 's'}; needs 2 incl. identity`
    }
  }
  if (engine === 'godot' || engine === 'gamemaker' || engine === 'unknown') {
    return callVerdict()
  }
  if (engine === 'unreal') {
    if (
      input.gameLogTexts.some((t) => UE_INIT_FAILED.some((re) => re.test(t)))
    ) {
      return { status: 'init-failed', detail: 'UE SteamAPI init failed' }
    }
    if (input.gameLogTexts.some((t) => UE_INIT_OK.test(t))) {
      return {
        status: 'verified',
        detail: nover === null ? '' : `unserved ${nover} (non-fatal)`
      }
    }
    const v = callVerdict()
    if (v.status === 'unverified' && v.detail === 'no game-originated call') {
      return {
        status: 'unverified',
        detail:
          input.gameLogTexts.length === 0
            ? 'no game log found'
            : 'no game-originated call'
      }
    }
    return v
  }
  if (nover !== null && engine === 'unity') {
    return { status: 'init-failed', detail: `unserved ${nover}` }
  }
  if (input.gameLogTexts.length === 0) {
    return { status: 'unverified', detail: 'no game log found' }
  }
  for (const text of input.gameLogTexts) {
    const missing = text.match(
      /EntryPointNotFoundException:\s*((?:SteamAPI|SteamInternal)_\w+)/
    )
    if (missing) {
      return { status: 'init-failed', detail: missing[1] }
    }
  }
  const initFail =
    /(SteamAPI[_.]Init(Ex)?)\s*(\(\))?[^\n]*?(failed|returned false)/i
  for (const text of input.gameLogTexts) {
    const m = text.match(initFail)
    if (m) {
      return {
        status: 'init-failed',
        detail: m[2] ? 'SteamAPI_InitEx' : 'SteamAPI_Init'
      }
    }
  }
  return { status: 'verified', detail: '' }
}

function evidenceCell(r: CensusRow): string {
  return r.evidence === 'verified'
    ? 'verified'
    : `${r.evidence} (${r.evidenceDetail})`
}

/** Markdown table + the "N of M routed to the bridge" summary line the
 * plan's `<verify>` greps for (`pnpm bridge-census | tail -3`). */
export function formatCensusMarkdown(rows: CensusRow[]): string {
  const summary = summarizeCensus(rows)
  const header =
    '| AppID | Name | Installdir | Arch | Class (static scan) | Play recorded (allowlist) | Evidence | Detail |\n' +
    '|---|---|---|---|---|---|---|---|'
  const body = rows
    .map(
      (r) =>
        `| ${r.appid} | ${r.name} | ${r.installdir} | ${r.arch} | ${r.class} | ${r.playRecorded ? 'yes' : 'no'} | ${evidenceCell(r)} | ${r.detail} |`
    )
    .join('\n')
  const byClassSummary = Object.entries(summary.byClass)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([cls, count]) => `${cls}=${count}`)
    .join(', ')

  return [
    header,
    body,
    '',
    `${summary.routed} of ${summary.total} routed to the bridge; ${summary.verified} of ${summary.total} verified running through the bridge (HELLO + clean game log; ${summary.initFailed} init-failed, ${summary.unverified} unverified); ${summary.playRecorded} of ${summary.total} play recorded in the allowlist; ${summary.covered} of ${summary.total} symbols covered by the shim (static scan) (${byClassSummary})`,
    `${summary.verifiedSteamworksUsing} of ${summary.steamworksUsing} Steamworks-using rows verified (majority: ${summary.majority ? 'yes' : 'no'})`
  ].join('\n')
}

// ---------------------------------------------------------------------------
// Impure I/O driver (operator-run, never unit-tested with a real filesystem)
// ---------------------------------------------------------------------------

const BOTTLES_DIR = join(
  homedir(),
  'Library/Application Support/CrossOver/Bottles'
)
const STEAMAPPS_SUBPATH = join(
  'drive_c',
  'Program Files (x86)',
  'Steam',
  'steamapps'
)
// Quick 261024-f0w: the app's persisted per-title metadata. `cache.ts`
// opens `CacheStore('steam_metadata')` with `cwd: 'store_cache'`, and
// `sidecar/pathShim.ts` resolves userData to this directory on macOS.
const STEAM_METADATA_PATH = join(
  homedir(),
  'Library/Application Support/gamelib/store_cache/steam_metadata.json'
)
// Quick 261024-f0w: the app log directory; `logger/paths.ts` darwin branch.
// Carries the helper's `HELLO  shim attached appid=<id>` lines. Pitfall 6:
// gamelib.log AND its rotated gamelib.log* siblings are read, bounded.
const APP_LOG_DIR = join(homedir(), 'Library/Logs/GameLib')
const MAX_APP_LOGS = 12
const MAX_APP_LOG_BYTES = 32 * 1024 * 1024
const MAX_ENGINE_LOGS = 16
const OBJDUMP_BIN = '/usr/bin/objdump'
const MAX_EXE_DEPTH = 4

// Mirrors `shimGenerate.ts`'s `isGameLibShimBytes` marker check verbatim
// (not imported: that module pulls `backend/constants/paths` and other
// backend imports this zero-backend-import tool must not carry). Either
// signal alone is sufficient -- a genuine game dll has no reason to
// contain either string.
const GAMELIB_SHIM_MARKER = 'GameLibSteamBridgeShim'
const GAMELIB_SHIM_LOOPBACK_MARKER = '127.0.0.1'

function isGameLibShimBytes(buf: Buffer): boolean {
  const text = buf.toString('latin1')
  return (
    text.includes(GAMELIB_SHIM_MARKER) ||
    text.includes(GAMELIB_SHIM_LOOPBACK_MARKER)
  )
}

const REDIST_EXE_NAME = /^(vcredist|dxsetup|unitycrashhandler).*\.exe$/i
const UNINSTALLER_EXE_NAME = /unins.*\.exe$/i

function isExcludedExeName(name: string): boolean {
  return REDIST_EXE_NAME.test(name) || UNINSTALLER_EXE_NAME.test(name)
}

/** The three bottle-name shapes D-51-15/D-51-12 route bridge installs
 * through: the legacy shared bottle, the Phase 24 shared bridge bottle, and
 * any per-game `GameLibSteamBridge-<appId>` bottle (D-51-12). */
function isBridgeBottleName(name: string): boolean {
  return (
    name === 'GameLibSteam' ||
    name === 'GameLibSteamBridge' ||
    name.startsWith('GameLibSteamBridge-')
  )
}

function findBridgeBottles(): string[] {
  if (!existsSync(BOTTLES_DIR)) {
    return []
  }
  return readdirSync(BOTTLES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isBridgeBottleName(entry.name))
    .map((entry) => join(BOTTLES_DIR, entry.name))
}

interface ManifestEntry {
  appid: string
  name: string
  installdir: string
  installPath: string
  /** Internal only (never on a CensusRow): the bottle directory name. */
  bottleName: string
}

interface AcfAppState {
  AppState?: { appid?: string; name?: string; installdir?: string }
}

/** Reads every `appmanifest_<appId>.acf` in a bottle's steamapps dir. Never
 * throws -- a missing dir, unreadable file, or corrupt/incomplete ACF is a
 * normal "nothing to report for this entry" outcome, the same discipline
 * `acfInstalldir.ts`'s `readAcfInstalldir` already follows. */
function readManifests(
  steamappsDir: string,
  bottleName: string
): ManifestEntry[] {
  if (!existsSync(steamappsDir)) {
    return []
  }

  const out: ManifestEntry[] = []
  for (const fileName of readdirSync(steamappsDir)) {
    const match = fileName.match(/^appmanifest_(\d+)\.acf$/)
    if (!match) {
      continue
    }
    try {
      const content = readFileSync(join(steamappsDir, fileName), 'utf-8')
      const parsed = parseVdf(content) as AcfAppState
      const name = parsed?.AppState?.name
      const installdir = parsed?.AppState?.installdir
      if (!name || !installdir) {
        continue
      }
      out.push({
        appid: match[1],
        name,
        installdir,
        installPath: join(steamappsDir, 'common', installdir),
        bottleName
      })
    } catch {
      continue // corrupt ACF -- same discipline as acfInstalldir.ts
    }
  }
  return out
}

/** Collects every `*.exe` under `dir`, depth-bounded, excluding known
 * redistributable/uninstaller names. */
function walkExes(dir: string, depth: number, out: string[]): void {
  if (depth > MAX_EXE_DEPTH || !existsSync(dir)) {
    return
  }
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkExes(full, depth + 1, out)
    } else if (
      entry.isFile() &&
      entry.name.toLowerCase().endsWith('.exe') &&
      !isExcludedExeName(entry.name)
    ) {
      out.push(full)
    }
  }
}

/** Argv-form `objdump --private-headers <exePath>` (T-24-06/ASVS V5, same
 * convention as `importScan.ts`'s `scanSteamApiImports` -- NEVER a shell
 * string). No `env` option is ever passed, so this spawn site cannot trip
 * `fakeHomeIsolation.test.ts` (which only flags a hand-rolled home/config/
 * state env block). Never throws -- a spawn failure, non-zero exit, or
 * missing binary returns `null`. */
function runObjdump(exePath: string): string | null {
  let result
  try {
    result = spawnSync(OBJDUMP_BIN, ['--private-headers', exePath], {
      encoding: 'utf-8',
      maxBuffer: 64 * 1024 * 1024
    })
  } catch {
    return null
  }
  if (result.error || result.status !== 0) {
    return null
  }
  return result.stdout
}

/** Ranged fd reads into the pure delay-import reader (never a slurp). Null on
 * any fs error -- "no delay evidence". */
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
        // nothing left to release
      }
    }
  }
}

/** D-53-09: per-title judged symbol sets, collected by the driver for the x86
 * modern-SDK / flat-API count (CensusRow stays path- and symbol-free). */
const judgedSymbols: JudgedSymbols[] = []

/** Count of scan-time warnings the shared scan emitted (printed in the footer;
 * the census has no logger). */
let scanWarnings = 0

/** IN-02: runCensus clears the per-run accumulators so a second run in the
 * same process does not double-count. */
export function resetCensusAccumulators(): void {
  judgedSymbols.length = 0
  scanWarnings = 0
}

export function censusAccumulators(): { judged: number; scanWarnings: number } {
  return { judged: judgedSymbols.length, scanWarnings }
}

/** D-53-12: the shared scan's injected dependencies. `scanImports` is the
 * Promise-wrapped objdump driver (the census keeps its own declared
 * real-profile objdump spawn; bridgeScan.ts spawns nothing). */
function scanImportsSync(exePath: string): BridgeImportScan {
  const stdout = runObjdump(exePath)
  if (!stdout) return { status: 'error', error: 'objdump failed' }
  const parsed = parseSteamApiImportTable(stdout)
  if (parsed.conflict) return { status: 'error', error: 'conflict' }
  const delay = readDelayImports(exePath)
  if (!delay || !delay.parsed || delay.dll === null) {
    return { status: 'ok', arch: parsed.arch, symbols: parsed.symbols }
  }
  if (
    delay.conflict ||
    (parsed.arch !== 'none' && parsed.arch !== delay.arch)
  ) {
    return { status: 'error', error: 'conflict' }
  }
  return {
    status: 'ok',
    arch: parsed.arch === 'none' ? delay.arch : parsed.arch,
    symbols: [...new Set([...parsed.symbols, ...delay.symbols])],
    delaySymbols: delay.symbols
  }
}

const scanDeps: BridgeScanDeps = {
  scanImports: (exePath: string) => Promise.resolve(scanImportsSync(exePath)),
  warn: () => {
    scanWarnings++
  },
  isShimBytes: isGameLibShimBytes
}

function loadPlayVerified(): Set<string> {
  const allowlistPath = join(
    process.cwd(),
    'src/backend/storeManagers/steam/bridge/bridge-allowlist.json'
  )
  if (!existsSync(allowlistPath)) {
    return new Set()
  }
  try {
    const parsed = JSON.parse(readFileSync(allowlistPath, 'utf-8')) as {
      seed?: Array<{ appId: string; playVerified?: unknown }>
    }
    return new Set(
      (parsed.seed ?? []).filter((e) => e.playVerified).map((e) => e.appId)
    )
  } catch {
    return new Set()
  }
}

/** Quick 261024-f0w: Unity's `Player.log` files under
 * `drive_c/users/crossover/AppData/LocalLow/<Company>/<Product>/` (exactly two
 * levels, readdir-based). Player.log only, not Player-prev.log: it is the
 * latest run. Never throws. */
export function findUnityPlayerLogs(bottleDir: string): string[] {
  const lowDir = join(
    bottleDir,
    'drive_c',
    'users',
    'crossover',
    'AppData',
    'LocalLow'
  )
  const out: string[] = []
  try {
    for (const company of readdirSync(lowDir, { withFileTypes: true })) {
      if (!company.isDirectory()) continue
      for (const product of readdirSync(join(lowDir, company.name), {
        withFileTypes: true
      })) {
        if (!product.isDirectory()) continue
        const log = join(lowDir, company.name, product.name, 'Player.log')
        if (existsSync(log)) out.push(log)
      }
    }
  } catch {
    // no LocalLow -- no game logs
  }
  return out
}

function readTexts(paths: string[]): string[] {
  const out: string[] = []
  for (const p of paths) {
    try {
      out.push(readFileSync(p, 'utf-8'))
    } catch {
      // missing or unreadable -- skipped
    }
  }
  return out
}

/** Reads at most the last `maxBytes` of a regular file (ranged read, never an
 * unbounded readFileSync). Null when unreadable. */
function readTail(path: string, maxBytes: number): string | null {
  let fd: number | undefined
  try {
    const size = statSync(path).size
    const len = Math.min(size, maxBytes)
    const buf = Buffer.alloc(len)
    fd = openSync(path, 'r')
    readSync(fd, buf, 0, len, size - len)
    return buf.toString('utf-8')
  } catch {
    return null
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

/** Pitfall 6 / T-53-10 / T-53-12: gamelib.log plus rotated `gamelib.log.*`
 * siblings, regular files only (lstat; symlinks skipped), newest first, at
 * most MAX_APP_LOGS, each tail-read to MAX_APP_LOG_BYTES. Never throws. */
function findAppLogs(): {
  names: string[]
  texts: string[]
  mtimes: number[]
} {
  const names: string[] = []
  const texts: string[] = []
  const mtimes: number[] = []
  try {
    const found: Array<{ name: string; mtime: number }> = []
    for (const name of readdirSync(APP_LOG_DIR)) {
      if (name !== 'gamelib.log' && !name.startsWith('gamelib.log.')) continue
      try {
        const st = lstatSync(join(APP_LOG_DIR, name))
        if (st.isFile() && !st.isSymbolicLink()) {
          found.push({ name, mtime: st.mtimeMs })
        }
      } catch {
        // vanished -- skipped
      }
    }
    found.sort((a, b) => b.mtime - a.mtime)
    for (const f of found.slice(0, MAX_APP_LOGS)) {
      const text = readTail(join(APP_LOG_DIR, f.name), MAX_APP_LOG_BYTES)
      if (text !== null) {
        names.push(f.name)
        texts.push(text)
        mtimes.push(f.mtime)
      }
    }
  } catch {
    // no log directory
  }
  return { names, texts, mtimes }
}

function crossoverAppData(bottleDir: string, ...rest: string[]): string {
  return join(bottleDir, 'drive_c', 'users', 'crossover', 'AppData', ...rest)
}

function isRegularFile(path: string): boolean {
  try {
    const st = lstatSync(path)
    return st.isFile() && !st.isSymbolicLink()
  } catch {
    return false
  }
}

/** 53-11: which `Saved/Logs` files describe the LATEST run. UE rotates the
 * previous run to `<Project>-backup-<stamp>.log`; those are never read. Returns
 * `<Project>.log` alone when present, else the single newest remaining `.log`.
 * Pure. */
export function selectLatestUnrealLogs(
  entries: Array<{ name: string; mtimeMs: number }>,
  project: string
): string[] {
  const live = entries.filter(
    (e) => e.name.toLowerCase().endsWith('.log') && !/-backup-/i.test(e.name)
  )
  const main = live.find(
    (e) => e.name.toLowerCase() === `${project.toLowerCase()}.log`
  )
  if (main) return [main.name]
  if (live.length === 0) return []
  return [live.reduce((a, b) => (b.mtimeMs > a.mtimeMs ? b : a)).name]
}

/** D-53-13: UE `Saved/Logs/<Project>.log` at
 * `AppData/Local/<Project>/Saved/Logs/` (exactly that depth, <= 16 files),
 * latest run only (53-11). Never throws. */
function findUnrealSavedLogs(bottleDir: string): string[] {
  const out: string[] = []
  const localDir = crossoverAppData(bottleDir, 'Local')
  try {
    for (const project of readdirSync(localDir, { withFileTypes: true })) {
      if (!project.isDirectory()) continue
      const logsDir = join(localDir, project.name, 'Saved', 'Logs')
      let names: string[] = []
      try {
        names = readdirSync(logsDir)
      } catch {
        continue
      }
      const entries: Array<{ name: string; mtimeMs: number }> = []
      for (const n of names) {
        try {
          const st = lstatSync(join(logsDir, n))
          if (st.isFile() && !st.isSymbolicLink()) {
            entries.push({ name: n, mtimeMs: st.mtimeMs })
          }
        } catch {
          // vanished -- skipped
        }
      }
      for (const n of selectLatestUnrealLogs(entries, project.name)) {
        if (out.length >= MAX_ENGINE_LOGS) return out
        out.push(join(logsDir, n))
      }
    }
  } catch {
    // no Local dir
  }
  return out
}

/** D-53-13: Godot user logs at
 * `AppData/Roaming/Godot/app_userdata/<name>/logs/godot.log`. Never throws. */
function findGodotLogs(bottleDir: string): string[] {
  const out: string[] = []
  const base = crossoverAppData(bottleDir, 'Roaming', 'Godot', 'app_userdata')
  try {
    for (const proj of readdirSync(base, { withFileTypes: true })) {
      if (!proj.isDirectory()) continue
      const log = join(base, proj.name, 'logs', 'godot.log')
      if (isRegularFile(log)) out.push(log)
      if (out.length >= MAX_ENGINE_LOGS) break
    }
  } catch {
    // no Godot userdata
  }
  return out
}

function engineLogPaths(engine: CensusEngine, bottleDir: string): string[] {
  if (engine === 'unity') return findUnityPlayerLogs(bottleDir)
  if (engine === 'unreal') return findUnrealSavedLogs(bottleDir)
  if (engine === 'godot') return findGodotLogs(bottleDir)
  return []
}

/** Only a per-game `GameLibSteamBridge-<appId>` bottle can attribute a
 * Player.log to one title; shared bottles read 'unverified'. */
interface AppLogFile {
  name: string
  mtimeMs: number
  text: string
}

function collectEvidence(
  entry: ManifestEntry,
  appLogFiles: AppLogFile[],
  engine: CensusEngine,
  initOnlyImports = false
): BridgeEvidence {
  if (entry.bottleName !== `GameLibSteamBridge-${entry.appid}`) {
    return { status: 'unverified', detail: 'no per-game bridge bottle' }
  }
  const segment = appLogSegmentFor(entry.appid, appLogFiles)
  return classifyBridgeEvidence({
    appid: entry.appid,
    appLogTexts: segment === null ? [] : [segment],
    engine,
    initOnlyImports,
    gameLogTexts: readTexts(
      engineLogPaths(engine, join(BOTTLES_DIR, entry.bottleName))
    )
  })
}

// Mirrors `shimGenerate.ts`'s `ORIGINAL_BACKUP_SUFFIX` (not imported, same
// reason as `GAMELIB_SHIM_MARKER`): the backup of a replaced original is
// `<dll>.gamelib-orig`.
const ORIGINAL_BACKUP_SUFFIX = '.gamelib-orig'

/** Quick 261024-uir: path of the `.gamelib-orig` backup beside `dllPath`, only
 * when it is a regular non-symlink file whose bytes are not the shim --
 * `restoreOriginalIfBackedUp`'s acceptance test. Never throws; read-only (the
 * census never restores, copies or writes). */
function readOriginalBackup(dllPath: string): string | null {
  const backup = dllPath + ORIGINAL_BACKUP_SUFFIX
  try {
    const st = lstatSync(backup)
    if (!st.isFile() || st.isSymbolicLink()) return null
    return isGameLibShimBytes(readFileSync(backup)) ? null : backup
  } catch {
    return null
  }
}

function loadKnownBad(): Map<string, string> {
  const allowlistPath = join(
    process.cwd(),
    'src/backend/storeManagers/steam/bridge/bridge-allowlist.json'
  )
  if (!existsSync(allowlistPath)) {
    return new Map()
  }
  try {
    const parsed = JSON.parse(readFileSync(allowlistPath, 'utf-8')) as {
      knownBad?: Array<{ appId: string; reason: string }>
    }
    return new Map((parsed.knownBad ?? []).map((e) => [e.appId, e.reason]))
  } catch {
    return new Map()
  }
}

interface ChosenExe {
  path: string
  table: ImportTableResult
}

/**
 * Quick 261024-f0w: reads `<appId>.bridge.scan.arch` out of the persisted
 * `steam_metadata.json` text. Mirrors `bridgeScanVerdictSchema.arch` in
 * `bridgeVerdict.ts` without importing it (zero-backend-import). Total:
 * malformed JSON, a missing entry or an arch outside x86/x64 all read as
 * "never scanned" (`undefined`) -- the file is untrusted disk content.
 */
export function readPersistedScanArch(
  metadataJsonText: string | null,
  appId: string
): 'x86' | 'x64' | undefined {
  if (!metadataJsonText) return undefined
  try {
    const parsed = JSON.parse(metadataJsonText) as unknown
    if (!parsed || typeof parsed !== 'object') return undefined
    const entry = (parsed as Record<string, unknown>)[appId] as
      | { bridge?: { scan?: { arch?: unknown } } }
      | null
      | undefined
    const arch = entry?.bridge?.scan?.arch
    return arch === 'x86' || arch === 'x64' ? arch : undefined
  } catch {
    return undefined
  }
}

/**
 * Quick 261024-uir: reads the whole `<appId>.bridge.scan` verdict out of the
 * persisted `steam_metadata.json` text. Same totality discipline as
 * `readPersistedScanArch` (untrusted disk content); missingSymbols entries are
 * dropped unless they are path-free strings of at most 128 chars (T-51-39),
 * and interfaceVersions keeps only string values.
 */
export function readPersistedScanVerdict(
  metadataJsonText: string | null,
  appId: string
): PersistedScanVerdict | undefined {
  if (!metadataJsonText) return undefined
  try {
    const parsed = JSON.parse(metadataJsonText) as unknown
    if (!parsed || typeof parsed !== 'object') return undefined
    const entry = (parsed as Record<string, unknown>)[appId] as
      | { bridge?: { scan?: Record<string, unknown> | null } }
      | null
      | undefined
    const scan = entry?.bridge?.scan
    if (!scan || typeof scan !== 'object') return undefined
    const { status, arch } = scan
    if (status !== 'clean' && status !== 'miss') return undefined
    if (arch !== 'x86' && arch !== 'x64') return undefined
    const missingSymbols = Array.isArray(scan.missingSymbols)
      ? scan.missingSymbols.filter(
          (m): m is string =>
            typeof m === 'string' &&
            m.length <= 128 &&
            !m.includes('/') &&
            !m.includes('\\')
        )
      : []
    const interfaceVersions: Record<string, string> = {}
    const iv = scan.interfaceVersions
    if (iv && typeof iv === 'object' && !Array.isArray(iv)) {
      for (const [k, v] of Object.entries(iv)) {
        if (typeof v === 'string') interfaceVersions[k] = v
      }
    }
    return { status, arch, missingSymbols, interfaceVersions }
  } catch {
    return undefined
  }
}

/**
 * Quick 261024-f0w: pure exe selection over objdump-parsed, non-conflict,
 * steam_api-importing candidates (walk order). The arch install/launch
 * actually scanned is the persisted `bridge.scan.arch` verdict, so it is
 * reused here rather than re-implementing a "prefer x64" heuristic.
 * `resolveBridgeLaunchExe` is not callable from the census: it needs a PICS
 * round-trip over a live CM session plus backend imports.
 *
 * `archNote` is '' when there is nothing to flag. Never contains a path.
 */
export function selectCensusExe(
  candidates: ChosenExe[],
  persistedArch: 'x86' | 'x64' | undefined
): { chosen: ChosenExe; archNote: string } | null {
  if (candidates.length === 0) return null
  const first = candidates[0]
  const hasBoth =
    candidates.some((c) => c.table.arch === 'x86') &&
    candidates.some((c) => c.table.arch === 'x64')

  if (persistedArch) {
    const match = candidates.find((c) => c.table.arch === persistedArch)
    if (match) return { chosen: match, archNote: '' }
    return {
      chosen: first,
      archNote: `persisted ${persistedArch} arch is not among the scanned exes`
    }
  }
  if (hasBoth) {
    return {
      chosen: first,
      archNote: `dual-arch install, no persisted bridge.scan verdict: ${first.table.arch} arch unconfirmed`
    }
  }
  return { chosen: first, archNote: '' }
}

/**
 * Objdumps EVERY candidate exe (no early return), keeps the importing,
 * non-conflict ones (a binary reporting BOTH a `steam_api.dll` and a
 * `steam_api64.dll` heading is skipped rather than guessed, mirroring
 * `scanSteamApiImports`'s fail-closed T-51-06 posture) and delegates the
 * choice to `selectCensusExe`. Falls back to the largest exe (by file size)
 * when none import `steam_api(64)?.dll` at all -- its import table is then
 * `arch: 'none'`, `symbols: []`, classified `no-steam-api` (or runtime-loaded
 * `missing-symbols`).
 */
function chooseExe(
  exePaths: string[],
  persistedArch: 'x86' | 'x64' | undefined
): { chosen: ChosenExe; archNote: string } | null {
  let largest: { path: string; size: number } | null = null
  const candidates: ChosenExe[] = []

  for (const exePath of exePaths) {
    try {
      const size = statSync(exePath).size
      if (!largest || size > largest.size) {
        largest = { path: exePath, size }
      }
    } catch {
      continue
    }

    const stdout = runObjdump(exePath)
    if (!stdout) {
      continue
    }
    const table = parseSteamApiImportTable(stdout)
    if (table.conflict) {
      continue
    }
    if (table.arch !== 'none') {
      candidates.push({ path: exePath, table })
    }
  }

  const selected = selectCensusExe(candidates, persistedArch)
  if (selected) return selected
  if (!largest) {
    return null
  }
  return {
    chosen: {
      path: largest.path,
      table: { dll: null, arch: 'none', symbols: [], conflict: false }
    },
    archNote: ''
  }
}

/** Never throws; the app-written metadata cache, or null when absent. */
function loadSteamMetadataText(): string | null {
  try {
    return readFileSync(STEAM_METADATA_PATH, 'utf-8')
  } catch {
    return null
  }
}

async function classifyInstalledTitle(
  entry: ManifestEntry,
  knownBad: Map<string, string>,
  playVerifiedSet: Set<string>,
  persistedArch: 'x86' | 'x64' | undefined,
  appLogTexts: AppLogFile[],
  persistedScan: PersistedScanVerdict | undefined
): Promise<CensusRow> {
  const knownBadReason = knownBad.get(entry.appid) ?? null
  const playVerified = playVerifiedSet.has(entry.appid)

  const exePaths: string[] = []
  walkExes(entry.installPath, 0, exePaths)

  let topLevel: string[] = []
  try {
    topLevel = readdirSync(entry.installPath)
  } catch {
    // unreadable install dir -- engine stays unknown
  }
  const engine = detectEngine([
    ...topLevel,
    ...exePaths.map((p) => basename(p))
  ])

  // Census-only stand-in choice (the census has no launch config): an Unreal
  // install launches its root-level bootstrap stub, not the Shipping exe the
  // stub starts. The layout probe is the shared bridgeScan one.
  const bottleDirForLayout = join(BOTTLES_DIR, entry.bottleName)
  const ueLayout = await findUnrealLayout(bottleDirForLayout, entry.installPath)
  const rootExes = exePaths.filter((p) => dirname(p) === entry.installPath)
  const selected = chooseExe(
    ueLayout && rootExes.length > 0 ? rootExes : exePaths,
    persistedArch
  )
  if (!selected) {
    return classifyCensusTitle({
      appid: entry.appid,
      name: entry.name,
      installdir: entry.installdir,
      knownBadReason,
      playVerified,
      evidence: collectEvidence(entry, appLogTexts, engine, false),
      exe: null
    })
  }

  const { chosen, archNote } = selected
  const steamDrm = scanExeSteamDrm(chosen.path)
  const bottleDir = join(BOTTLES_DIR, entry.bottleName)
  // D-53-10: the arch the exe launches as (AnyCPU without 32BIT flags is x64).
  const effectiveArch = readFileEffectiveArch(chosen.path)
  const { symbols } = chosen.table
  const arch: 'x86' | 'x64' | 'none' =
    chosen.table.arch !== 'none' && effectiveArch
      ? effectiveArch
      : chosen.table.arch
  let dllVersions: string[] = []
  let exeVersions: string[] = []

  let runtimeLoadedDll: RuntimeDllName | null = null
  let shimOnlyRuntimeDll: ReturnType<
    typeof pickRuntimeSteamApiDll
  >['shimOnlyRuntimeDll'] = null
  let managed: CensusManaged | null = null
  let importerEvidence: CensusTitleInput['importerEvidence'] = null
  if (arch === 'none') {
    // D-53-12: every scan question below is answered by bridgeScan.ts, in the
    // order shimGenerate asks them. Only the stand-in exe choice above is
    // census-only (the census has no launch config).
    const walkRoot = resolveWalkRoot(bottleDir, chosen.path, entry.installPath)
    const unreal = await findUnrealLayout(bottleDir, dirname(chosen.path))
    const runtimeDlls = await findRuntimeLoadedSteamApiDlls(
      walkRoot,
      unreal?.steamworksDir ? [unreal.steamworksDir] : [],
      scanDeps
    )
    const names = (['steam_api.dll', 'steam_api64.dll'] as const).filter((n) =>
      runtimeDlls.some((d) => d.name === n)
    )
    const launchName =
      effectiveArch === 'x64'
        ? 'steam_api64.dll'
        : effectiveArch === 'x86'
          ? 'steam_api.dll'
          : null
    const considered =
      launchName !== null && names.includes(launchName) ? [launchName] : names
    const found = runtimeDlls
      .filter((d) => considered.includes(d.name))
      .map((d) => ({
        name: d.name,
        provenance: !d.isGameLibShim
          ? ('original' as const)
          : readOriginalBackup(d.path)
            ? ('shim-backed' as const)
            : ('shim-only' as const),
        path: d.path
      }))
    ;({ runtimeLoadedDll, shimOnlyRuntimeDll } = pickRuntimeSteamApiDll(
      found,
      persistedScan
    ))
    const rtName = runtimeLoadedDll ?? shimOnlyRuntimeDll?.dll ?? null
    if (rtName) {
      const rtArch = rtName === 'steam_api64.dll' ? 'x64' : 'x86'
      managed = await scanManagedSteamApi(
        chosen.path,
        bottleDir,
        rtArch,
        scanDeps
      )
      if (runtimeLoadedDll) {
        const importers = (
          await findSteamApiImporterPes(
            entry.appid,
            walkRoot,
            chosen.path,
            unreal?.shippingExes ?? [],
            scanDeps
          )
        ).filter((i) => i.arch === rtArch)
        const merged = [...new Set(importers.flatMap((i) => i.symbols))]
        if (importers.length > 0) {
          const original = found.find(
            (f) => f.name === rtName && f.provenance === 'original'
          )
          const backup = found.find(
            (f) => f.name === rtName && f.provenance === 'shim-backed'
          )
          const versionSource =
            original?.path ?? (backup ? readOriginalBackup(backup.path) : null)
          const dllV = versionSource
            ? await readVersionsOrEmpty(versionSource)
            : Object.values(persistedScan?.interfaceVersions ?? {})
          const exeV = usesRuntimeInterfaceLookup(merged)
            ? (
                await Promise.all(
                  importers.map((i) => readVersionsOrEmpty(i.path))
                )
              ).flat()
            : []
          importerEvidence = {
            symbols: merged,
            dllVersions: dllV,
            exeVersions: exeV
          }
        }
      }
    }
  }

  if (arch !== 'none') {
    const dllName = arch === 'x64' ? 'steam_api64.dll' : 'steam_api.dll'
    const dllPath = join(dirname(chosen.path), dllName)
    if (existsSync(dllPath)) {
      try {
        const buf = readFileSync(dllPath)
        if (!isGameLibShimBytes(buf)) {
          dllVersions = await readVersionsOrEmpty(dllPath)
        } else {
          // Quick 261024-uir: the dll is the shim. Read the original from its
          // .gamelib-orig backup, else the persisted verdict's interface
          // versions -- the live path's persistedInterfaceVersions fallback.
          const backup = readOriginalBackup(dllPath)
          dllVersions = backup
            ? await readVersionsOrEmpty(backup)
            : Object.values(persistedScan?.interfaceVersions ?? {})
        }
      } catch {
        // unreadable original dll -- leave dllVersions empty, same as "not found"
      }
    }

    if (usesRuntimeInterfaceLookup(symbols)) {
      exeVersions = await readVersionsOrEmpty(chosen.path)
    }
  }

  const judgedArch: 'x86' | 'x64' | 'none' =
    arch !== 'none'
      ? arch
      : runtimeLoadedDll
        ? RUNTIME_DLL_ARCH[runtimeLoadedDll]
        : 'none'
  const judged = [
    ...symbols,
    ...(importerEvidence?.symbols ?? []),
    ...(managed?.kind === 'mono' ? managed.symbols : [])
  ]
  judgedSymbols.push({
    appid: entry.appid,
    arch: judgedArch,
    symbols: judged
  })
  // D-53-15: unscanned IL2CPP Steam usage is never assumed init-only.
  const initOnly = isInitOnlyImportSet(judged) && managed?.kind !== 'il2cpp'
  const evidence = collectEvidence(entry, appLogTexts, engine, initOnly)

  return classifyCensusTitle({
    appid: entry.appid,
    name: entry.name,
    installdir: entry.installdir,
    knownBadReason,
    playVerified,
    runtimeLoadedDll,
    shimOnlyRuntimeDll,
    steamDrm,
    archNote: archNote || undefined,
    evidence,
    managed,
    importerEvidence,
    launchArch: effectiveArch,
    exe: { arch, symbols, dllVersions, exeVersions }
  })
}

async function readVersionsOrEmpty(path: string): Promise<string[]> {
  try {
    const r = await readInterfaceVersionStrings(path)
    return r.status === 'ok' ? r.versions : []
  } catch {
    return []
  }
}

/** Quick 261024-br4: ranged fd reads (never slurps the exe) into the pure
 * `peSteamDrm.ts` scanner. A failed parse or an fs error reads as null --
 * not CEG. Read-only. */
function scanExeSteamDrm(
  exePath: string
): { cegMarkers: string[]; hasBindSection: boolean } | null {
  let fd: number | null = null
  try {
    fd = openSync(exePath, 'r')
    const handle = fd
    const result = detectSteamDrmInPe((offset, length) => {
      const buf = Buffer.alloc(length)
      const n = readSync(handle, buf, 0, length, offset)
      return n < length ? null : new Uint8Array(buf.buffer, buf.byteOffset, n)
    })
    return result.parsed
      ? { cegMarkers: result.cegMarkers, hasBindSection: result.hasBindSection }
      : null
  } catch {
    return null
  } finally {
    if (fd !== null) {
      try {
        closeSync(fd)
      } catch {
        // already closed / never opened -- nothing to release
      }
    }
  }
}

/** Enumerates every bridge-routed bottle's `appmanifest_*.acf`, de-duped by
 * appid (first occurrence wins -- a title installed in more than one bottle
 * at once is an operator-side artifact, not two distinct owned titles), and
 * classifies each. Read-only throughout: never writes into a bottle, never
 * prints an ACF field beyond appid/name/installdir (T-51-39). */
let lastLogsRead: string[] = []

export async function runCensus(): Promise<CensusRow[]> {
  resetCensusAccumulators()
  const knownBad = loadKnownBad()
  const playVerifiedSet = loadPlayVerified()
  const metadataText = loadSteamMetadataText()
  const appLogs = findAppLogs()
  const appLogTexts: AppLogFile[] = appLogs.texts.map((text, i) => ({
    name: appLogs.names[i],
    mtimeMs: appLogs.mtimes[i],
    text
  }))
  lastLogsRead = appLogs.names
  const seen = new Map<string, ManifestEntry>()

  for (const bottleDir of findBridgeBottles()) {
    const steamappsDir = join(bottleDir, STEAMAPPS_SUBPATH)
    for (const entry of readManifests(steamappsDir, basename(bottleDir))) {
      if (!seen.has(entry.appid)) {
        seen.set(entry.appid, entry)
      }
    }
  }

  const rows: CensusRow[] = []
  for (const entry of seen.values()) {
    rows.push(
      await classifyInstalledTitle(
        entry,
        knownBad,
        playVerifiedSet,
        readPersistedScanArch(metadataText, entry.appid),
        appLogTexts,
        readPersistedScanVerdict(metadataText, entry.appid)
      )
    )
  }
  return rows
}

async function main(): Promise<void> {
  const rows = await runCensus()
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(rows, null, 2))
    return
  }
  console.log(formatCensusMarkdown(rows))
  console.log(`Logs read: ${lastLogsRead.join(', ') || '(none)'}`)
  const x86 = countX86ModernOrFlat(judgedSymbols)
  console.log(
    `x86 titles needing modern SteamInternal_* or flat API: ${x86.count} (${x86.appids.join(', ') || 'none'})`
  )
  console.log(`Scan warnings: ${scanWarnings}`)
}

// `require.main === module` idiom doesn't survive `runTs.cjs` bundling into
// a private tmpdir (same reasoning as `extractProtonInventory.ts`'s own
// bottom guard) -- but this module is also imported directly by its jest
// suite, so `JEST_WORKER_ID` still reliably distinguishes "imported under
// test" from "run as the CLI entrypoint".
if (!process.env.JEST_WORKER_ID) {
  main().catch((error: unknown) => {
    console.error(error)
    process.exit(1)
  })
}
