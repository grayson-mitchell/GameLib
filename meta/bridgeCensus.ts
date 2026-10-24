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
  usesRuntimeInterfaceLookup
} from '../src/backend/storeManagers/steam/bridge/interfaceVersions'
import {
  evaluateShimCoverage,
  SHIM64_EXPORTED_SYMBOLS
} from '../src/backend/storeManagers/steam/bridge/shimCoverage'
import { detectSteamDrmInPe } from '../src/backend/storeManagers/steam/bridge/peSteamDrm'

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
  if (input.steamDrm?.hasBindSection && row.class !== 'known-bad') {
    const note = 'SteamStub .bind section (informational)'
    return { ...row, detail: row.detail ? `${row.detail}; ${note}` : note }
  }
  return row
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
    evidence: input.evidence?.status ?? 'unverified',
    evidenceDetail: input.evidence?.detail ?? 'evidence not collected'
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

  if (arch === 'none') {
    if (input.runtimeLoadedDll) {
      return withFlags({
        ...base,
        arch: 'none',
        class: 'missing-symbols',
        detail: runtimeLoadedSteamApiMarker(input.runtimeLoadedDll)
      })
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
          arch: 'none',
          class: 'missing-symbols',
          detail
        })
      }
      return withFlags({
        ...base,
        arch: 'none',
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

  if (arch === 'x64' && deps.x64ExportedSymbols.size === 0) {
    return withFlags({
      ...base,
      arch: 'x64',
      class: 'win64-no-shim',
      detail: 'no Win64 shim capability built (SHIM64 export set empty)'
    })
  }

  const { required, problems } = deps.resolveRequiredInterfaceVersions({
    importedSymbols: symbols,
    dllVersions,
    exeVersions
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
  byClass: Record<string, number>
} {
  const byClass: Record<string, number> = {}
  let routed = 0
  let covered = 0
  let verified = 0
  let initFailed = 0
  let unverified = 0
  let playRecorded = 0

  for (const row of rows) {
    byClass[row.class] = (byClass[row.class] ?? 0) + 1
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

/**
 * Quick 261024-f0w: pure live-evidence check. Order: no HELLO -> unverified;
 * no game log -> unverified; failure marker -> init-failed; else verified.
 * Mac Steam In-Game status is deliberately NOT an input: it comes from the
 * helper's own SteamAPI_Init, not from the game.
 */
export function classifyBridgeEvidence(input: {
  appid: string
  appLogTexts: string[]
  gameLogTexts: string[]
}): BridgeEvidence {
  if (!/^\d+$/.test(input.appid)) {
    return { status: 'unverified', detail: 'no HELLO' }
  }
  const hello = new RegExp(
    `HELLO\\s+shim attached appid=${input.appid}(?![0-9])`
  )
  if (!input.appLogTexts.some((t) => hello.test(t))) {
    return { status: 'unverified', detail: 'no HELLO' }
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
    `${summary.routed} of ${summary.total} routed to the bridge; ${summary.verified} of ${summary.total} verified running through the bridge (HELLO + clean game log; ${summary.initFailed} init-failed, ${summary.unverified} unverified); ${summary.playRecorded} of ${summary.total} play recorded in the allowlist; ${summary.covered} of ${summary.total} symbols covered by the shim (static scan) (${byClassSummary})`
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
// Quick 261024-f0w: the app log (+ rotated sibling); `logger/paths.ts` darwin
// branch. Carries the helper's `HELLO  shim attached appid=<id>` lines.
const APP_LOG_PATHS = [
  join(homedir(), 'Library/Logs/GameLib/gamelib.log'),
  join(homedir(), 'Library/Logs/GameLib/gamelib.log.old')
]
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
function findUnityPlayerLogs(bottleDir: string): string[] {
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

/** Only a per-game `GameLibSteamBridge-<appId>` bottle can attribute a
 * Player.log to one title; shared bottles read 'unverified'. */
function collectEvidence(
  entry: ManifestEntry,
  appLogTexts: string[]
): BridgeEvidence {
  if (entry.bottleName !== `GameLibSteamBridge-${entry.appid}`) {
    return { status: 'unverified', detail: 'no per-game bridge bottle' }
  }
  return classifyBridgeEvidence({
    appid: entry.appid,
    appLogTexts,
    gameLogTexts: readTexts(
      findUnityPlayerLogs(join(BOTTLES_DIR, entry.bottleName))
    )
  })
}

/** Finds a non-shim steam_api(64).dll anywhere under `dir` (same depth bound
 * as walkExes). Prefers steam_api64.dll when both ship, matching the live
 * path's rule. */
function findRuntimeSteamApiDll(
  dir: string,
  depth: number,
  found: Set<'steam_api.dll' | 'steam_api64.dll'>
): void {
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
      findRuntimeSteamApiDll(full, depth + 1, found)
    } else if (entry.isFile()) {
      const lower = entry.name.toLowerCase()
      if (lower === 'steam_api.dll' || lower === 'steam_api64.dll') {
        try {
          if (!isGameLibShimBytes(readFileSync(full))) {
            found.add(lower)
          }
        } catch {
          // unreadable -- treat as absent
        }
      }
    }
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
  appLogTexts: string[]
): Promise<CensusRow> {
  const evidence = collectEvidence(entry, appLogTexts)
  const knownBadReason = knownBad.get(entry.appid) ?? null
  const playVerified = playVerifiedSet.has(entry.appid)

  const exePaths: string[] = []
  walkExes(entry.installPath, 0, exePaths)

  const selected = chooseExe(exePaths, persistedArch)
  if (!selected) {
    return classifyCensusTitle({
      appid: entry.appid,
      name: entry.name,
      installdir: entry.installdir,
      knownBadReason,
      playVerified,
      evidence,
      exe: null
    })
  }

  const { chosen, archNote } = selected
  const steamDrm = scanExeSteamDrm(chosen.path)
  const { arch, symbols } = chosen.table
  let dllVersions: string[] = []
  let exeVersions: string[] = []

  let runtimeLoadedDll: 'steam_api.dll' | 'steam_api64.dll' | null = null
  if (arch === 'none') {
    const found = new Set<'steam_api.dll' | 'steam_api64.dll'>()
    findRuntimeSteamApiDll(entry.installPath, 0, found)
    runtimeLoadedDll = found.has('steam_api64.dll')
      ? 'steam_api64.dll'
      : found.has('steam_api.dll')
        ? 'steam_api.dll'
        : null
  }

  if (arch !== 'none') {
    const dllName = arch === 'x64' ? 'steam_api64.dll' : 'steam_api.dll'
    const dllPath = join(dirname(chosen.path), dllName)
    if (existsSync(dllPath)) {
      try {
        const buf = readFileSync(dllPath)
        if (!isGameLibShimBytes(buf)) {
          const versionResult = await readInterfaceVersionStrings(dllPath)
          if (versionResult.status === 'ok') {
            dllVersions = versionResult.versions
          }
        }
      } catch {
        // unreadable original dll -- leave dllVersions empty, same as "not found"
      }
    }

    if (usesRuntimeInterfaceLookup(symbols)) {
      const exeVersionResult = await readInterfaceVersionStrings(chosen.path)
      if (exeVersionResult.status === 'ok') {
        exeVersions = exeVersionResult.versions
      }
    }
  }

  return classifyCensusTitle({
    appid: entry.appid,
    name: entry.name,
    installdir: entry.installdir,
    knownBadReason,
    playVerified,
    runtimeLoadedDll,
    steamDrm,
    archNote: archNote || undefined,
    evidence,
    exe: { arch, symbols, dllVersions, exeVersions }
  })
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
export async function runCensus(): Promise<CensusRow[]> {
  const knownBad = loadKnownBad()
  const playVerifiedSet = loadPlayVerified()
  const metadataText = loadSteamMetadataText()
  const appLogTexts = readTexts(APP_LOG_PATHS)
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
        appLogTexts
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
