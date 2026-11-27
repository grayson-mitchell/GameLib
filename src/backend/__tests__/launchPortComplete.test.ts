/**
 * Phase 88 per-sub-slice delete gate (88-02, D-18, D-25 and D-30). Launch moves into Rust across four
 * sub-phases (88, 88.1, 88.2, 88.3), and each sub-slice gets its own `describe('<name>PortComplete')`
 * built on `runSlice` from `backend/testUtils/portSliceGate`, runnable alone with
 * `-t '<name>PortComplete'`. The plan that deletes a slice adds its describe here RED first (the files
 * and identifiers still exist), then deletes the TS and watches it go green: sub-phase 88 adds
 * `knownFixPortComplete`, and 88.1, 88.2 and 88.3 add theirs. A `SliceSpec` with nothing deleted would
 * pass vacuously, so no describe exists for a slice before its plan. Never lower a floor or widen an
 * allow-list to turn a red run green.
 *
 * D-18 no rollback: neither `GAMELIB_LAUNCH` nor `GAMELIB_KNOWNFIX` may appear anywhere under src/,
 * src-tauri/src or src-tauri/crates, from the first commit. There is no flag, no dual path and no
 * sidecar fallback; the `noRollbackFlag` describe holds that for the whole phase, independent of any
 * sub-slice. The scan reads raw text, so a flag named in a comment is still caught. This file names the
 * two flags to forbid them and lives under `__tests__`, which the walks skip.
 *
 * Every walk has a floor on the files it read, and the self-tests at the bottom plant each flag and watch
 * the scan fail. The crate walk reads non-test `.rs` files under `src-tauri/crates` (a crate's own
 * `tests/` directory is read too, so a flag named in an integration test is caught): 410 files when
 * measured on 2026-11-25 (88-02). `CRATE_FILES_FLOOR` sits under that so later deletions cannot trip it;
 * never lower it.
 *
 * Modelled on `engineWinePortComplete` (87-03) and loggerPortComplete (82 D-05).
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  findExportedValues,
  findRollbackFlag,
  walkStripped
} from 'backend/testUtils/infoPortGate'
import type { StrippedFile } from 'backend/testUtils/infoPortGate'
import type { SliceSpec } from 'backend/testUtils/portSliceGate'
import {
  BACKEND_FILES_FLOOR,
  flagWalk,
  RUST_FILES_FLOOR,
  runSlice,
  rustWalk,
  SCANNED_FILES_FLOOR,
  storeTable,
  tsWalk
} from 'backend/testUtils/portSliceGate'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { rowsDueIn, SCHEDULE } from './engineWineShimSchedule.test'

/** The two rollback flags D-18 forbids; named here once so the scan and its self-tests agree. */
const FORBIDDEN_FLAGS = ['GAMELIB_LAUNCH', 'GAMELIB_KNOWNFIX'] as const

/** Floor for the crate walk: 410 non-test `.rs` files measured on 2026-11-25; the floor sits under that. */
const CRATE_FILES_FLOOR = 300

/** The crate walk the flag scan adds to `flagWalk` (src and src-tauri/src). */
const crateWalk = walkStripped(['src-tauri/crates'], { ext: /\.rs$/ })

/** Every file the flag scan reads: `flagWalk` plus the crates. */
const scanned = [...flagWalk.files, ...crateWalk.files]

/**
 * 88-16, D-18, D-25 and ROADMAP 88 SC4: the known-fix sub-slice is Rust's (88-08..88-11 ported it, 88-12..88-15
 * switched every caller onto a scheduled shim or twin). The eight TS modules, their eighteen unit tests and their five
 * oracle tests are deleted. The goldens and the recordings the oracles wrote stay, because the Rust replays
 * (`gamelib-knownfix/tests/golden_*.rs`) and the twins' vectors test read them. `src/common/knownFixReport.ts` (the
 * relay worker's shared schema) and `src/common/knownFixOverlayCatalogue.{ts,json}` are shared data, not runtime TS, and
 * `launchrust/knownFixes.ts` and `launchrust/knownFixTwins.ts` are the scheduled survivors.
 *
 * Two files outside the plan's list of 31 go with them because their only subject is gone: the fetch oracle's cases
 * file (`oracle/knownFixFetch.cases.ts` imports the deleted fetcher's two base URLs and nothing else imports it).
 * `oracle/knownFixReader.cases.ts` and `oracle/knownFixOverlay.cases.ts` stay: the twins' vectors test imports them.
 *
 * `forbiddenIdentifiers` is every export of the deleted modules minus the names a shim or twin carries. Candidates
 * left out, each checked with `git grep -w` on 2026-11-25:
 *   - the shim and twin names themselves (readKnownFixes, readKnownFixProfile, readKnownFixLaunchOverrides,
 *     fetchRemoteKnownFixes, applyKnownFixProfileRegistry, knownFixProfileOverlayEnv, applyRegistryFixes,
 *     resolveKnownFixOverlayEnv, reportDetectedFix, DetectedFix, lastEnvOption, formatKnownFixEnvLine, logKnownFixEnv,
 *     withKnownFixEnv, buildOverlayTarGz, readOverlayTarGz, KnownFixPathsDeps, KnownFixLocalPathsDeps);
 *   - TIER1_KNOWN_FIX_KEYS, isValidExeOverrideShape, filterTier1KnownFixes and resolveKnownFixExeOverride, which the
 *     twins file carries as private helpers copied verbatim from the deleted modules;
 *   - validateOverlayEntries, which `src/common/knownFixOverlayCatalogue.ts` (kept shared data) defines for itself.
 */
const KNOWN_FIX: SliceSpec = {
  deleted: [
    'src/backend/knownFixes.ts',
    'src/backend/knownFixesRegistry.ts',
    'src/backend/knownFixesFetcher.ts',
    'src/backend/knownFixLaunch.ts',
    'src/backend/knownFixOverlays.ts',
    'src/backend/knownFixOverlayArchive.ts',
    'src/backend/knownFixOverlayInstall.ts',
    'src/backend/knownFixReport.ts',
    'src/backend/__tests__/knownFixLaunch.test.ts',
    'src/backend/__tests__/knownFixOverlayArchive.test.ts',
    'src/backend/__tests__/knownFixOverlayInstall.test.ts',
    'src/backend/__tests__/knownFixOverlays.test.ts',
    'src/backend/__tests__/knownFixReport.test.ts',
    'src/backend/__tests__/knownFixReportDrift.test.ts',
    'src/backend/__tests__/knownFixReportUrl.test.ts',
    'src/backend/__tests__/knownFixes.test.ts',
    'src/backend/__tests__/knownFixesCegSeeds.test.ts',
    'src/backend/__tests__/knownFixesDrm.test.ts',
    'src/backend/__tests__/knownFixesFetcher.test.ts',
    'src/backend/__tests__/knownFixesGamelibStatus.test.ts',
    'src/backend/__tests__/knownFixesLayered.test.ts',
    'src/backend/__tests__/knownFixesMacArch.test.ts',
    'src/backend/__tests__/knownFixesMacArchSeeds.test.ts',
    'src/backend/__tests__/knownFixesOverlay.test.ts',
    'src/backend/__tests__/knownFixesRegistry.test.ts',
    'src/backend/__tests__/knownFixesWithLayer.test.ts',
    'src/backend/__tests__/oracle/knownFixReader.oracle.test.ts',
    'src/backend/__tests__/oracle/knownFixLaunch.oracle.test.ts',
    'src/backend/__tests__/oracle/knownFixRegistry.oracle.test.ts',
    'src/backend/__tests__/oracle/knownFixOverlay.oracle.test.ts',
    'src/backend/__tests__/oracle/knownFixFetch.oracle.test.ts',
    'src/backend/__tests__/oracle/knownFixFetch.cases.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/golden',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/reader',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/registry',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/overlay_archive',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/overlay_install',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/launch_overrides',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/fetcher',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/golden/report',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/recorded',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/recorded/fetcher',
    'src-tauri/crates/gamelib-knownfix/tests/fixtures/recorded/report',
    'src/common/knownFixReport.ts',
    'src/common/knownFixOverlayCatalogue.json',
    'src/common/knownFixOverlayCatalogue.ts',
    'src/backend/launchrust/knownFixes.ts',
    'src/backend/launchrust/knownFixTwins.ts'
  ],
  forbiddenIdentifiers: [
    'TIER1_ROUTING_KEYS',
    'isRoutingOnlyTier1Fix',
    'readKnownFixesWithLayer',
    'readGamelibFixStatus',
    'REGISTRY_FIX_TIMEOUT_MS',
    'ValidRegistryFix',
    'validateRegistryFixes',
    'dllOverridesToRegistryFixes',
    'knownFixProfileRegistryFixes',
    'buildRegistryFixCommandParts',
    'wineRegistryValueIsSet',
    'knownFixPrefixDir',
    'GAMELIB_KNOWN_FIXES_BASE',
    'HEROIC_KNOWN_FIXES_BASE',
    'KnownFixesGet',
    'KnownFixesFetchDeps',
    'OverlayEnvDeps',
    'MAX_OVERLAY_ENTRIES',
    'appendPathList',
    'OverlayArchiveFetch',
    'OverlayInstallDeps',
    'verifyInstalledOverlay',
    'KnownFixOverlayInstalls',
    'createKnownFixOverlayInstalls',
    'RELAY_URL_PENDING_SENTINEL',
    'GAMELIB_FIX_RELAY_URL',
    'relayUrl',
    'ReportDeps',
    'knownFixReportDeps',
    'runKnownFixReport'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_KNOWNFIX',
  manifestSlice: 'knownfix',
  channelsFloor: 2
}

describe('knownFixPortComplete', () => {
  runSlice(KNOWN_FIX)
})

/** The two files that hold every known-fix survivor: the scheduled shims and the scheduled twins. */
const KNOWN_FIX_SURVIVOR_FILES = [
  'src/backend/launchrust/knownFixes.ts',
  'src/backend/launchrust/knownFixTwins.ts'
] as const

/**
 * The phases that may delete a known-fix survivor (88-16, D-25): 88.1 (the launch step moves into Rust), 92 (the
 * managers' own phase), 93 (the download manager) and 97 (the Steam bridge and its TS known-fix application). None is
 * 88, so nothing the sub-phase 88 ports leaves a survivor due inside it.
 */
const KNOWN_FIX_DELETED_BY: readonly number[] = [88.1, 92, 93, 97]

interface SurvivorRow {
  file: string
  name: string
  deletedBy: number
}

/**
 * Both directions between the exported values of `files` and the schedule rows that name those files: an export with
 * no row is unscheduled, a row naming something the file does not export is orphaned.
 */
function survivorDiff(
  files: readonly StrippedFile[],
  schedule: readonly SurvivorRow[],
  survivorFiles: readonly string[] = KNOWN_FIX_SURVIVOR_FILES
): { unscheduled: string[]; orphaned: string[] } {
  const exported = new Set<string>()
  for (const file of survivorFiles) {
    const f = files.find((x) => x.path === file)
    if (f === undefined) {
      throw new Error(`survivor file ${file} was not read by the walk`)
    }
    for (const name of findExportedValues(f.path, f.code)) {
      exported.add(`${file}#${name}`)
    }
  }
  const scheduled = new Set(
    schedule
      .filter((r) => survivorFiles.includes(r.file))
      .map((r) => `${r.file}#${r.name}`)
  )
  return {
    unscheduled: [...exported].filter((k) => !scheduled.has(k)).sort(),
    orphaned: [...scheduled].filter((k) => !exported.has(k)).sort()
  }
}

describe('knownFixSurvivors', () => {
  const rows = SCHEDULE.filter((r) =>
    (KNOWN_FIX_SURVIVOR_FILES as readonly string[]).includes(r.file)
  )

  it('anti-vacuity: both survivor files are read and 14 rows (5 shims, 9 twins) are scheduled', () => {
    // 88.1-15 deleted the two launcher-only shims (applyKnownFixProfileRegistry, knownFixProfileOverlayEnv): 16 -> 14.
    assertAtOrAboveFloor('known-fix survivor rows', rows.length, 14)
    for (const file of KNOWN_FIX_SURVIVOR_FILES) {
      expect(tsWalk.files.some((f) => f.path === file)).toBe(true)
      expect(rows.some((r) => r.file === file)).toBe(true)
    }
  })

  it('every export under launchrust/knownFixes.ts and knownFixTwins.ts is a schedule row, and every row is exported', () => {
    expect(survivorDiff(tsWalk.files, SCHEDULE)).toEqual({
      unscheduled: [],
      orphaned: []
    })
  })

  it('no known-fix row is due in 88 (the sub-phase deletes everything that is not scheduled later)', () => {
    expect(rowsDueIn(SCHEDULE, 88)).toEqual([])
  })

  it('every known-fix row names a deletion phase of 88.1, 92, 93 or 97', () => {
    expect(
      rows
        .filter((r) => !KNOWN_FIX_DELETED_BY.includes(r.deletedBy))
        .map((r) => `${r.file}#${r.name}: ${String(r.deletedBy)}`)
    ).toEqual([])
  })

  describe('planted violations', () => {
    const planted = (path: string, code: string): StrippedFile => ({
      path,
      raw: code,
      code
    })
    const [shims, twins] = KNOWN_FIX_SURVIVOR_FILES
    const row = (file: string, name: string, deletedBy = 97): SurvivorRow => ({
      file,
      name,
      deletedBy
    })

    it('self-test: an exported value with no schedule row is reported unscheduled', () => {
      const files = [
        planted(shims, 'export async function a() {}\nexport const b = 1'),
        planted(twins, 'export function c() {}')
      ]
      expect(survivorDiff(files, [row(shims, 'a'), row(twins, 'c')])).toEqual({
        unscheduled: [`${shims}#b`],
        orphaned: []
      })
    })

    it('self-test: a schedule row naming something the file does not export is reported orphaned, and a type export is not a value', () => {
      const files = [
        planted(shims, 'export type T = 1\nexport function a() {}'),
        planted(twins, 'export function c() {}')
      ]
      expect(
        survivorDiff(files, [
          row(shims, 'a'),
          row(twins, 'c'),
          row(twins, 'gone')
        ])
      ).toEqual({ unscheduled: [], orphaned: [`${twins}#gone`] })
    })

    it('self-test: a survivor file the walk did not read fails loudly instead of passing empty', () => {
      expect(() =>
        survivorDiff([planted(shims, 'export function a() {}')], [])
      ).toThrow(/was not read by the walk/)
    })

    it('self-test: a row due in 88 and a row with a phase outside the allowed four are both found', () => {
      const due = [
        row(shims, 'a', 88),
        row(twins, 'c', 93),
        row(twins, 'd', 90)
      ]
      expect(rowsDueIn(due, 88).map((r) => r.name)).toEqual(['a'])
      expect(
        due
          .filter((r) => !KNOWN_FIX_DELETED_BY.includes(r.deletedBy))
          .map((r) => r.name)
      ).toEqual(['a', 'd'])
    })
  })
})

/**
 * 88.1-17, D-18, D-25 and ROADMAP 88.1 SC3 (builder half): the launch builders are Rust's (88.1-03..88.1-10 ported
 * them, 88.1-07/08 pointed the managers at the shims, 88.1-15/16 retired the prepare steps, the wine self-heal and the
 * Epic status). The builder TS in `launcher.ts`, `gamescopeCommand.ts` and the replaced `utils.ts` rows (with
 * `utils/epicServiceStatus.ts`) are deleted, and so are the oracle tests that drove them. Every golden and recording
 * those oracles wrote stays, because the Rust replays (`gamelib-launch/tests/golden_*.rs`) read them.
 *
 * `launchPrepare.oracle.test.ts` and `launchPrepareWine.oracle.test.ts` went with the prepare adapters in 88.1-15, so
 * they are named here only to hold them deleted.
 *
 * `forbiddenIdentifiers` is every export of the deleted TS minus the names something else carries. Candidates left out,
 * each checked with `git grep -w` on 2026-11-26:
 *   - installFixes, which `launchrust/knownFixTwins.ts` and `steam/bridgeKnownFixes.ts` define for themselves;
 *   - setupEnvVars, setupWrapperEnvVars, setupWineEnvVars, setupWrappers, verifyWinePrefix, getKnownFixesEnvVariables,
 *     prepareLaunch, prepareWineLaunch, isEpicServiceOffline and checkWineBeforeLaunch, which live on as shim, adapter
 *     or Launcher member names; the two `defines no` tests below hold those instead.
 */
const BUILDERS: SliceSpec = {
  deleted: [
    'src/backend/gamescopeCommand.ts',
    'src/backend/__tests__/gamescopeCommand.test.ts',
    'src/backend/__tests__/launcher_wineLibFolders.test.ts',
    'src/backend/utils/epicServiceStatus.ts',
    'src/backend/utils/__tests__/epicServiceStatus.test.ts',
    'src/backend/__tests__/oracle/launchBuilders.oracle.test.ts',
    'src/backend/__tests__/oracle/launchGamescope.oracle.test.ts',
    'src/backend/__tests__/oracle/launchPrepare.oracle.test.ts',
    'src/backend/__tests__/oracle/epicStatus.oracle.test.ts',
    'src/backend/__tests__/oracle/launchPrepareWine.oracle.test.ts',
    'src/backend/__tests__/oracle/checkWine.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/builders',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/gamescope',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/prepare_launch',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/epic_status',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/prepare_wine',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/check_wine',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/classes.json',
    'src-tauri/crates/gamelib-launch/tests/fixtures/recorded/epic_status'
  ],
  forbiddenIdentifiers: [
    'wrapperStoreEnv',
    'filterGameSettingsForLog',
    'getCrossoverBottleFolder',
    'buildGameScopeCommand',
    'probeGamescopeHelp',
    'removeQuoteIfNecessary',
    'isMacSonomaOrHigher',
    'constructAndUpdateRPC',
    'ContinueWithFoundWine',
    'downloadDefaultWine',
    'checkEpicServiceOffline',
    'isNetworkLevelFailure',
    'getFormattedOsName'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_LAUNCH'
}

/** True when `code` declares `name` as a function or a function-valued binding (a member or property name is not one). */
const definesFunction = (code: string, name: string): boolean =>
  new RegExp(
    `(?:\\bfunction\\s*\\*?\\s+${name}\\b|\\b(?:const|let|var)\\s+${name}\\b)`
  ).test(code)

const codeOf = (path: string): string => {
  const f = tsWalk.files.find((x) => x.path === path)
  if (f === undefined) throw new Error(`${path} was not read by the walk`)
  return f.code
}

describe('buildersPortComplete', () => {
  runSlice(BUILDERS)

  it('launcher.ts defines none of the builder or prepare functions (the Launcher members are bound to shims and adapters)', () => {
    const code = codeOf('src/backend/launcher.ts')
    expect(
      [
        'setupEnvVars',
        'setupWrapperEnvVars',
        'setupWineEnvVars',
        'setupWrappers',
        'verifyWinePrefix',
        'getKnownFixesEnvVariables',
        'prepareLaunch',
        'prepareWineLaunch'
      ].filter((name) => definesFunction(code, name))
    ).toEqual([])
  })

  it('utils.ts defines neither isEpicServiceOffline nor checkWineBeforeLaunch (the names live on as a shim and an adapter)', () => {
    const code = codeOf('src/backend/utils.ts')
    expect(
      ['isEpicServiceOffline', 'checkWineBeforeLaunch'].filter((name) =>
        definesFunction(code, name)
      )
    ).toEqual([])
  })

  describe('planted violations', () => {
    it('self-test: a function, an arrow binding and an async function are each found, a member and an import are not', () => {
      expect(definesFunction('export function a() {}', 'a')).toBe(true)
      expect(definesFunction('export async function a() {}', 'a')).toBe(true)
      expect(definesFunction('const a = () => 1', 'a')).toBe(true)
      expect(definesFunction('const o = { a() {} }\no.a()', 'a')).toBe(false)
      expect(definesFunction("import { a as aShim } from './x'", 'a')).toBe(
        false
      )
      expect(definesFunction('function ab() {}', 'a')).toBe(false)
    })

    it('self-test: a function the walk did not read fails loudly instead of passing empty', () => {
      expect(() => codeOf('src/backend/nothing-here.ts')).toThrow(
        /was not read by the walk/
      )
    })
  })
})

/** The three launch TS files 88.1 leaves as scheduled shims: the builders, the prepare steps and the launch utilities. */
const BUILDERS_SURVIVOR_FILES = [
  'src/backend/launchrust/builders.ts',
  'src/backend/launchrust/prepare.ts',
  'src/backend/launchrust/launchUtils.ts'
] as const

/**
 * The interim glue 88.1 leaves, a named table with the phase that deletes each name (88.1-19, ROADMAP 88.1 SC3, and
 * 88 verification warning W-5). These are not schedule rows: they are adapters and reply settlers around the shims, not
 * shims themselves. `launchAdapters.ts` gathers the TS-only facts, makes the one shim call and applies the writes the
 * reply carries (the launch log, the wine self-heal's settings); the three launchers' own `launch()` leave in 92, the
 * Steam bottle provisioning behind `checkWineBeforeLaunch` in 96. `knownFixLaunchReply.ts` turns a rejected known-fix
 * reply into the warning the TS used to log, for the Steam bridge, which leaves in 97.
 */
const INTERIM_GLUE: readonly SurvivorRow[] = [
  {
    file: 'src/backend/launchAdapters.ts',
    name: 'writeLaunchLog',
    deletedBy: 92
  },
  {
    file: 'src/backend/launchAdapters.ts',
    name: 'prepareLaunch',
    deletedBy: 92
  },
  {
    file: 'src/backend/launchAdapters.ts',
    name: 'prepareWineLaunch',
    deletedBy: 92
  },
  {
    file: 'src/backend/launchAdapters.ts',
    name: 'checkWineBeforeLaunch',
    deletedBy: 96
  },
  {
    file: 'src/backend/knownFixLaunchReply.ts',
    name: 'settleKnownFixLaunchOverrides',
    deletedBy: 97
  },
  {
    file: 'src/backend/knownFixLaunchReply.ts',
    name: 'settleKnownFixRegistry',
    deletedBy: 97
  },
  {
    file: 'src/backend/knownFixLaunchReply.ts',
    name: 'settleKnownFixOverlayEnv',
    deletedBy: 97
  }
]

/** The two files the interim glue table covers. */
const INTERIM_GLUE_FILES = [
  'src/backend/launchAdapters.ts',
  'src/backend/knownFixLaunchReply.ts'
] as const

/** The phases that may delete an interim glue name: the launchers (92), the Steam bottle provisioning (96), the bridge (97). */
const INTERIM_GLUE_DELETED_BY: readonly number[] = [92, 96, 97]

/**
 * 88.1-19, D-25 and ROADMAP 88.1 SC3: with 88.1-17 and 88.1-18 the slice's TS is gone, so what is left is a named
 * survivor. Every export of `launchrust/builders.ts`, `prepare.ts` and `launchUtils.ts` is a schedule row and every such
 * row's export exists; every export of the two interim glue files is in the named table above and every table row's
 * export exists (both ways each); nothing is due in 88.1.
 */
describe('buildersSurvivors', () => {
  const shimRows = SCHEDULE.filter((r) =>
    (BUILDERS_SURVIVOR_FILES as readonly string[]).includes(r.file)
  )

  it('anti-vacuity: the three shim files are read and 11 rows are scheduled, and the glue table names 7 survivors in 2 files', () => {
    // 6 builder shims, 3 prepare shims and 2 launch-utility shims, measured on 2026-11-26.
    assertAtOrAboveFloor('builders shim rows', shimRows.length, 11)
    for (const file of BUILDERS_SURVIVOR_FILES) {
      expect(tsWalk.files.some((f) => f.path === file)).toBe(true)
      expect(shimRows.some((r) => r.file === file)).toBe(true)
    }
    assertAtOrAboveFloor('interim glue rows', INTERIM_GLUE.length, 7)
    for (const file of INTERIM_GLUE_FILES) {
      expect(tsWalk.files.some((f) => f.path === file)).toBe(true)
      expect(INTERIM_GLUE.some((r) => r.file === file)).toBe(true)
    }
  })

  it('every export of launchrust/builders.ts, prepare.ts and launchUtils.ts is a schedule row, and every row is exported', () => {
    expect(
      survivorDiff(tsWalk.files, SCHEDULE, BUILDERS_SURVIVOR_FILES)
    ).toEqual({ unscheduled: [], orphaned: [] })
  })

  it('every export of launchAdapters.ts and knownFixLaunchReply.ts is in the interim glue table, and every table row is exported', () => {
    expect(
      survivorDiff(tsWalk.files, INTERIM_GLUE, INTERIM_GLUE_FILES)
    ).toEqual({ unscheduled: [], orphaned: [] })
  })

  it('every interim glue row names a deletion phase of 92, 96 or 97, and none is also a schedule row', () => {
    expect(
      INTERIM_GLUE.filter(
        (r) => !INTERIM_GLUE_DELETED_BY.includes(r.deletedBy)
      ).map((r) => `${r.file}#${r.name}: ${String(r.deletedBy)}`)
    ).toEqual([])
    expect(
      SCHEDULE.filter((r) =>
        (INTERIM_GLUE_FILES as readonly string[]).includes(r.file)
      ).map((r) => `${r.file}#${r.name}`)
    ).toEqual([])
  })

  it('no row is due in 88.1 (nothing the sub-phase ports leaves a survivor due inside it)', () => {
    expect(rowsDueIn(SCHEDULE, 88.1)).toEqual([])
  })

  describe('planted violations', () => {
    const planted = (path: string, code: string): StrippedFile => ({
      path,
      raw: code,
      code
    })
    const [adapters, reply] = INTERIM_GLUE_FILES
    const glue = (file: string, name: string, deletedBy = 92): SurvivorRow => ({
      file,
      name,
      deletedBy
    })

    it('self-test: an export of an interim glue file that is not in the table is reported unscheduled', () => {
      const files = [
        planted(adapters, 'export function a() {}\nexport const stray = 1'),
        planted(reply, 'export async function b() {}')
      ]
      expect(
        survivorDiff(
          files,
          [glue(adapters, 'a'), glue(reply, 'b', 97)],
          INTERIM_GLUE_FILES
        )
      ).toEqual({ unscheduled: [`${adapters}#stray`], orphaned: [] })
    })

    it('self-test: a glue table row naming something the file does not export is reported orphaned', () => {
      const files = [
        planted(adapters, 'export function a() {}'),
        planted(reply, 'export async function b() {}')
      ]
      expect(
        survivorDiff(
          files,
          [glue(adapters, 'a'), glue(reply, 'b', 97), glue(reply, 'gone', 97)],
          INTERIM_GLUE_FILES
        )
      ).toEqual({ unscheduled: [], orphaned: [`${reply}#gone`] })
    })

    it('self-test: a planted row due in 88.1 is found, and a glue phase outside 92, 96 and 97 is found', () => {
      const due = [glue(adapters, 'a', 88.1), glue(reply, 'b', 97)]
      expect(rowsDueIn(due, 88.1).map((r) => r.name)).toEqual(['a'])
      expect(
        [glue(adapters, 'a', 93), glue(reply, 'b', 97)]
          .filter((r) => !INTERIM_GLUE_DELETED_BY.includes(r.deletedBy))
          .map((r) => r.name)
      ).toEqual(['a'])
    })
  })
})

/**
 * 88.1-18, D-18, D-24, D-25 and ROADMAP 88.1 SC3 (system-information half): system information is Rust's
 * (88.1-05 ported the probes and the formatter into `gamelib-info`, 88.1-10 made `getSystemInfo` and
 * `copySystemInfoToClipboard` native, 88.1-15 moved the launch log's system-information line). The whole
 * `utils/systeminfo` tree is deleted, its oracle with it, and so are the TS mirrors of the two pci.ids caches
 * (`createPciIdCaches`, store mirror deletion cell 88). Their `storeTable.json` rows move to `meta/genStoreTable.ts`
 * `EXTRA_ROWS`, so the Rust host keeps owning `store_cache/pci_ids_device` and `store_cache/pci_ids_vendor`
 * (`storeRowKeys`). The goldens the oracle wrote stay: `gamelib-info`'s `golden_sysinfo.rs` replays them.
 *
 * `forbiddenIdentifiers` is every export of the deleted tree that nothing else names, each checked with
 * `git grep -w` on 2026-11-26. `getHeroicVersion` is still a renderer-facing channel name, but it has no TS handle
 * under `src/backend` (the Rust `app` slice serves it), so no non-test backend code names it either.
 * `channelsFloor` is the measured count of the `info` slice in `nativeChannels.json` (17 on 2026-11-26).
 */
const SYSTEM_INFO: SliceSpec = {
  deleted: [
    'src/backend/utils/systeminfo/__tests__/gpuLinux.test.ts',
    'src/backend/utils/systeminfo/__tests__/index.test.ts',
    'src/backend/utils/systeminfo/__tests__/probes.test.ts',
    'src/backend/utils/systeminfo/gpu/index.ts',
    'src/backend/utils/systeminfo/gpu/linux.ts',
    'src/backend/utils/systeminfo/gpu/pci_ids.ts',
    'src/backend/utils/systeminfo/gpu/windows.ts',
    'src/backend/utils/systeminfo/heroicVersion.ts',
    'src/backend/utils/systeminfo/index.ts',
    'src/backend/utils/systeminfo/memory/index.ts',
    'src/backend/utils/systeminfo/memory/linux.ts',
    'src/backend/utils/systeminfo/memory/macos.ts',
    'src/backend/utils/systeminfo/memory/windows.ts',
    'src/backend/utils/systeminfo/osInfo/index.ts',
    'src/backend/utils/systeminfo/osInfo/linux.ts',
    'src/backend/utils/systeminfo/osInfo/windows.ts',
    'src/backend/utils/systeminfo/steamDeck.ts',
    'src/backend/__tests__/oracle/systemInfo.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-info/tests/fixtures/golden/sysinfo',
    'src/common/types/systemInfo.ts'
  ],
  forbiddenIdentifiers: [
    'createSystemInfoCache',
    'formatSystemInfo',
    'createPciIdCaches',
    'populateDeviceAndVendorName',
    'parseLspciGpus',
    'getGpuInfo',
    'getMemoryInfo',
    'getOsInfo',
    'getSteamDeckInfo',
    'getHeroicVersion'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_LAUNCH',
  manifestSlice: 'info',
  channelsFloor: 17,
  storeRowKeys: ['store_cache/pci_ids_device', 'store_cache/pci_ids_vendor']
}

describe('systemInfoPortComplete', () => {
  runSlice(SYSTEM_INFO)

  it('no file is left under src/backend/utils/systeminfo', () => {
    expect(
      tsWalk.files
        .filter((f) => f.path.startsWith('src/backend/utils/systeminfo/'))
        .map((f) => f.path)
    ).toEqual([])
  })

  it('the two pci cache rows keep their cache kind and renderer names after the TS stores went (EXTRA_ROWS)', () => {
    for (const name of ['pci_ids_device', 'pci_ids_vendor']) {
      const row = storeTable.rows.find((r) => r.key === `store_cache/${name}`)
      expect(row).toMatchObject({ kind: 'cache', tsNames: [name] })
    }
    const generator = tsWalk.files.find(
      (f) => f.path === 'meta/genStoreTable.ts'
    )
    expect(generator?.code).toContain('pci_ids_device')
    expect(generator?.code).toContain('pci_ids_vendor')
  })
})

/**
 * 88.2-23, D-11, D-18 and D-25 (runner half): the TS drivers that recorded 88.2's runner goldens are deleted now that
 * every golden has its Rust replay (`gamelib-launch/tests/golden_*.rs`, `gamelib-wine`'s `golden_wine_core`): the runner
 * oracle (slices `runner` and `redaction`), the wine-command oracle (`wine_launch`, `wine_path`, `script`), the error
 * handler oracle and `runnerTrace.ts`, the trace harness all three drive, with its self-test.
 * `spawnAsync.oracle.test.ts` went with the spawnAsync adapter in 88.2-21 (`git rm`); it is named here to hold it deleted.
 * Every golden slice those drivers recorded stays, because the Rust replays read them.
 *
 * `launcher.crossoverEnv.test.ts` is deleted in the same plan, after its RF1 invariants ported to
 * `gamelib-wine/tests/crossover_env.rs` (D-15, task 2). `commandRunner.ts`, its test, the twin's vectors test and
 * `envBuildersFixture.ts` stay for 88.2-24, whose own gate deletes them.
 *
 * `forbiddenIdentifiers` is `createRunnerTrace` and `recordStream`, the only exports of `runnerTrace.ts` that something
 * else could name; each was checked with `git grep -w` on 2026-11-27: only the three drivers and the trace's own
 * self-test named them, all deleted here.
 */
const RUNNER_ORACLE: SliceSpec = {
  deleted: [
    'src/backend/__tests__/oracle/runner.oracle.test.ts',
    'src/backend/__tests__/oracle/runnerWine.oracle.test.ts',
    'src/backend/__tests__/oracle/errorHandler.oracle.test.ts',
    'src/backend/__tests__/oracle/spawnAsync.oracle.test.ts',
    'src/backend/testUtils/launchOracle/runnerTrace.ts',
    'src/backend/testUtils/launchOracle/__tests__/runnerTrace.test.ts',
    'src/backend/__tests__/launcher.crossoverEnv.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/runner',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/redaction',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/wine_launch',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/wine_path',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/script',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/spawn_async',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/error_handler',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/classes.json'
  ],
  forbiddenIdentifiers: ['createRunnerTrace', 'recordStream'],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_LAUNCH'
}

describe('runnerOraclePortComplete', () => {
  runSlice(RUNNER_ORACLE)
})

/**
 * 88.2-24, D-02, D-18, D-25 and ROADMAP 88.2 SC4: the TypeScript command runner is deleted. `commandRunner.ts` (the
 * `createCommandRunner` twin), its test, the twin's vectors test (`wine/__tests__/oracle/wineCore.oracle.test.ts`) and
 * the test-only env copy only that vectors test used (`wine/__tests__/oracle/envBuildersFixture.ts`) are gone. The runner's
 * behaviour lives in Rust (`gamelib-launch`, `gamelib-wine`), and every golden slice stays: the Rust replays read them.
 * The 82 amendment closes here too: `utils.ts` no longer defines `errorHandler` or `askForceUninstall` (the names live on
 * as Rust ops and a shim), and gog's and nile's `authLogSanitizer` are gone (Rust's `LogSanitizer` replaced them).
 *
 * `forbiddenIdentifiers` is the runner-internal names with no surviving use, each checked with `git grep -w` on
 * 2026-11-27 after the deletion: `RunnerProps` and `WineCommandResult` moved to `runnerAdapter.ts` and `CommandRunner` is
 * `services/types.ts`'s, so none of the three is listed. The two `defines no` tests hold the utils names, which live on
 * as op and shim names elsewhere.
 */
const COMMAND_RUNNER: SliceSpec = {
  deleted: [
    'src/backend/commandRunner.ts',
    'src/backend/__tests__/commandRunner.test.ts',
    'src/backend/wine/__tests__/oracle/wineCore.oracle.test.ts',
    'src/backend/wine/__tests__/oracle/envBuildersFixture.ts'
  ],
  kept: RUNNER_ORACLE.kept,
  forbiddenIdentifiers: [
    'createCommandRunner',
    'CommandRunnerDeps',
    'getRunnerCallWithoutCredentials',
    'appNameFromCommandParts',
    'appNameIndexFinders',
    'WINESERVER_WAIT_TIMEOUT_MS',
    'ErrorHandlerDeps',
    'authLogSanitizer'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_LAUNCH'
}

describe('commandRunnerPortComplete', () => {
  runSlice(COMMAND_RUNNER)

  it('utils.ts defines neither errorHandler nor askForceUninstall (the names live on as Rust ops and a shim)', () => {
    const code = codeOf('src/backend/utils.ts')
    expect(
      ['errorHandler', 'askForceUninstall'].filter((name) =>
        definesFunction(code, name)
      )
    ).toEqual([])
  })
})

/**
 * 88.3-14, D-18 and D-25 (funnel half): the TS drivers that recorded `golden/funnel` and `golden/single_flight` are
 * deleted now that Rust replays every case they recorded (`gamelib-launch/tests/funnel.rs` prints `golden funnel: compared
 * 59 floor 59`, `tests/single_flight.rs` prints `golden single_flight: compared 24 floor 24`). The two drivers, `funnelTrace.ts`
 * (the transcript harness both drive) and its self-test go, and so do the two harness files only the drivers used:
 * `fakeLauncherDeps.ts` (imported by the single-flight driver, `funnelTrace.ts` and its own test) and `spawnClass.ts` (no
 * importer outside its own test), each with its test. Every golden stays, because the Rust replays read them.
 *
 * Kept on purpose: `runsForMe.vectors.test.ts` (not a driver; it pins the surviving TS runs-for-me to the vectors Rust
 * reads), and the four harness files a surviving test still imports: `baseEnv.ts` and `probes.ts`
 * (`launchrust/__tests__/knownFixTwins.vectors.test.ts`), `pairwise.ts` and `census.ts` (the `oracle/knownFix*.cases.ts`
 * files, whose twins 97 deletes; `census.ts` and `probes.ts` also serve the window-raise driver, which 88.3-20 retires
 * with the TS raiser). `golden/window_raise` stays kept by the same rule.
 *
 * `forbiddenIdentifiers` is the exports of the deleted files that something else could still name, each checked with
 * `git grep -w` on 2026-11-28: only the deleted files named them (`probes.ts` mentions `createFakeLauncherDeps` in a
 * comment, which this walk strips). The scenario and transcript types are not listed: they are unnamed anywhere else too,
 * but they are exports of one file this slice already holds deleted.
 */
const FUNNEL_ORACLE: SliceSpec = {
  deleted: [
    'src/backend/__tests__/oracle/funnel.oracle.test.ts',
    'src/backend/__tests__/oracle/singleFlight.oracle.test.ts',
    'src/backend/testUtils/launchOracle/funnelTrace.ts',
    'src/backend/testUtils/launchOracle/__tests__/funnelTrace.test.ts',
    'src/backend/testUtils/launchOracle/fakeLauncherDeps.ts',
    'src/backend/testUtils/launchOracle/__tests__/fakeLauncherDeps.test.ts',
    'src/backend/testUtils/launchOracle/spawnClass.ts',
    'src/backend/testUtils/launchOracle/__tests__/spawnClass.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/funnel',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/single_flight',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/runs_for_me',
    'src-tauri/crates/gamelib-launch/tests/fixtures/golden/window_raise',
    'src/backend/runsForMe/__tests__/runsForMe.vectors.test.ts',
    'src/backend/testUtils/launchOracle/baseEnv.ts',
    'src/backend/testUtils/launchOracle/probes.ts',
    'src/backend/testUtils/launchOracle/pairwise.ts',
    'src/backend/testUtils/launchOracle/census.ts'
  ],
  forbiddenIdentifiers: [
    'recordFunnel',
    'createFakeLauncherDeps',
    'recordingLogWriter',
    'attachSpawnClass',
    'loadClasses'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_LAUNCH'
}

describe('funnelOraclePortComplete', () => {
  runSlice(FUNNEL_ORACLE)
})

/** The one file 88.2 leaves as scheduled shims: the runner, the wine command, the script, the spawnAsync and the tracked-kill transport calls. */
const RUNNER_SURVIVOR_FILES = ['src/backend/launchrust/runner.ts'] as const

/**
 * The interim glue 88.2 leaves, a named table with the phase that deletes each name (88.2-24, D-25, ROADMAP 88.2 SC4).
 * These are not schedule rows: they are adapters and a stream table around the shims, not shims themselves.
 * `runnerAdapter.ts` gives every manager the old `commandRunner` shape over the runner transport (`createRunnerAdapter`, the
 * two reply settlers, and the types `RunnerProps`, `WineCommandResult`, `RunnerAdapter` and the call-option types), and
 * leaves with the launchers' Steam bridge in 97; `runnerStream.ts` (`createRunnerStreams` and the stream types)
 * holds the callbacks a caller of `callRunner` or `runWineCommand` watches its output through, and `spawnAsync.ts`
 * (`createSpawnAsync` and the `SpawnAsync` type) is the `spawnAsync` adapter over `launch_spawn_async`; both leave with the
 * managers' own phase (98). A type export is no value, so the walk behind `survivorDiff` does not list it.
 */
const RUNNER_INTERIM_GLUE: readonly SurvivorRow[] = [
  {
    file: 'src/backend/runnerAdapter.ts',
    name: 'createRunnerAdapter',
    deletedBy: 97
  },
  {
    file: 'src/backend/runnerAdapter.ts',
    name: 'settleExecResult',
    deletedBy: 97
  },
  {
    file: 'src/backend/runnerAdapter.ts',
    name: 'settleWineCommandResult',
    deletedBy: 97
  },
  {
    file: 'src/backend/runnerStream.ts',
    name: 'createRunnerStreams',
    deletedBy: 98
  },
  { file: 'src/backend/spawnAsync.ts', name: 'createSpawnAsync', deletedBy: 98 }
]

/** The three files the runner interim glue table covers. */
const RUNNER_INTERIM_GLUE_FILES = [
  'src/backend/runnerAdapter.ts',
  'src/backend/runnerStream.ts',
  'src/backend/spawnAsync.ts'
] as const

/** The phases that may delete a runner interim glue name: the Steam bridge (97) and the managers (98). */
const RUNNER_INTERIM_GLUE_DELETED_BY: readonly number[] = [97, 98]

/**
 * The schedule's rows for `files` plus one row per `register*` helper those rows name in `wiring`. A helper only installs
 * its row's listeners, so it is covered by being named there (the schedule's own rule), and `survivorDiff` can then compare
 * every export of the file both ways.
 */
function rowsWithWiring(
  schedule: readonly (SurvivorRow & { wiring?: readonly string[] })[],
  files: readonly string[]
): SurvivorRow[] {
  const rows = schedule.filter((r) => files.includes(r.file))
  return [
    ...rows,
    ...rows.flatMap((r) =>
      (r.wiring ?? []).map((name) => ({
        file: r.file,
        name,
        deletedBy: r.deletedBy
      }))
    )
  ]
}

/**
 * 88.2-24, D-25 and ROADMAP 88.2 SC4: with the TS runner deleted, what is left of 88.2 is a named survivor. Every export of
 * `launchrust/runner.ts` is a schedule row (or a `register*` wiring helper a row names) and every row's export exists; every
 * export of `runnerAdapter.ts`, `runnerStream.ts` and `spawnAsync.ts` is in the interim glue table and every table row's
 * export exists (both ways each); nothing is due in 88.2.
 */
describe('commandRunnerSurvivors', () => {
  const shimRows = SCHEDULE.filter((r) =>
    (RUNNER_SURVIVOR_FILES as readonly string[]).includes(r.file)
  )

  it('anti-vacuity: the runner shim file is read and 11 rows are scheduled, and the glue table names 5 survivors in 3 files', () => {
    // 11 rows (runnerCall, runnerKill, runnerAbort, wineCommandRun, winePathGet, scriptRun, spawnAsyncRun, trackedKill,
    // trackedKillAll, gamesRunning, askForceUninstall) and two wiring helpers, measured on 2026-11-27.
    assertAtOrAboveFloor('runner shim rows', shimRows.length, 11)
    for (const file of RUNNER_SURVIVOR_FILES) {
      expect(tsWalk.files.some((f) => f.path === file)).toBe(true)
      expect(shimRows.some((r) => r.file === file)).toBe(true)
    }
    assertAtOrAboveFloor(
      'runner interim glue rows',
      RUNNER_INTERIM_GLUE.length,
      5
    )
    for (const file of RUNNER_INTERIM_GLUE_FILES) {
      expect(tsWalk.files.some((f) => f.path === file)).toBe(true)
      expect(RUNNER_INTERIM_GLUE.some((r) => r.file === file)).toBe(true)
    }
  })

  it('every export of launchrust/runner.ts is a schedule row or a wiring helper a row names, and every row is exported', () => {
    expect(
      survivorDiff(
        tsWalk.files,
        rowsWithWiring(SCHEDULE, RUNNER_SURVIVOR_FILES),
        RUNNER_SURVIVOR_FILES
      )
    ).toEqual({ unscheduled: [], orphaned: [] })
  })

  it('every export of runnerAdapter.ts, runnerStream.ts and spawnAsync.ts is in the interim glue table, and every table row is exported', () => {
    expect(
      survivorDiff(tsWalk.files, RUNNER_INTERIM_GLUE, RUNNER_INTERIM_GLUE_FILES)
    ).toEqual({ unscheduled: [], orphaned: [] })
  })

  it('every runner glue row names a deletion phase of 97 or 98, and none is also a schedule row', () => {
    expect(
      RUNNER_INTERIM_GLUE.filter(
        (r) => !RUNNER_INTERIM_GLUE_DELETED_BY.includes(r.deletedBy)
      ).map((r) => `${r.file}#${r.name}: ${String(r.deletedBy)}`)
    ).toEqual([])
    expect(
      SCHEDULE.filter((r) =>
        (RUNNER_INTERIM_GLUE_FILES as readonly string[]).includes(r.file)
      ).map((r) => `${r.file}#${r.name}`)
    ).toEqual([])
  })

  it('no row is due in 88.2 (nothing the sub-phase ports leaves a survivor due inside it)', () => {
    expect(rowsDueIn(SCHEDULE, 88.2)).toEqual([])
  })

  describe('planted violations', () => {
    const planted = (path: string, code: string): StrippedFile => ({
      path,
      raw: code,
      code
    })
    const [shims] = RUNNER_SURVIVOR_FILES
    const [adapter, stream, spawn] = RUNNER_INTERIM_GLUE_FILES
    const glue = (file: string, name: string, deletedBy = 97): SurvivorRow => ({
      file,
      name,
      deletedBy
    })

    it('self-test: an export of a runner glue file that is not in the table is reported unscheduled', () => {
      const files = [
        planted(adapter, 'export function a() {}\nexport const stray = 1'),
        planted(stream, 'export function b() {}'),
        planted(spawn, 'export function c() {}')
      ]
      expect(
        survivorDiff(
          files,
          [glue(adapter, 'a'), glue(stream, 'b', 98), glue(spawn, 'c', 98)],
          RUNNER_INTERIM_GLUE_FILES
        )
      ).toEqual({ unscheduled: [`${adapter}#stray`], orphaned: [] })
    })

    it('self-test: a glue table row naming something the file does not export is reported orphaned', () => {
      const files = [
        planted(adapter, 'export function a() {}'),
        planted(stream, 'export function b() {}'),
        planted(spawn, 'export function c() {}')
      ]
      expect(
        survivorDiff(
          files,
          [
            glue(adapter, 'a'),
            glue(stream, 'b', 98),
            glue(spawn, 'c', 98),
            glue(spawn, 'gone', 98)
          ],
          RUNNER_INTERIM_GLUE_FILES
        )
      ).toEqual({ unscheduled: [], orphaned: [`${spawn}#gone`] })
    })

    it('self-test: an unscheduled export of the shim file and an orphaned shim row are each found, and a wiring helper is covered only when a row names it', () => {
      const code =
        'export function a() {}\nexport function registerA() {}\nexport function stray() {}'
      const files = [planted(shims, code)]
      const rows = [{ ...glue(shims, 'a'), wiring: ['registerA'] }]
      expect(
        survivorDiff(files, rowsWithWiring(rows, [shims]), [shims])
      ).toEqual({ unscheduled: [`${shims}#stray`], orphaned: [] })
      expect(
        survivorDiff(
          [planted(shims, 'export function a() {}')],
          rowsWithWiring(
            [{ ...glue(shims, 'a'), wiring: ['registerGone'] }],
            [shims]
          ),
          [shims]
        )
      ).toEqual({ unscheduled: [], orphaned: [`${shims}#registerGone`] })
    })

    it('self-test: a planted row due in 88.2 is found, and a glue phase outside 97 and 98 is found', () => {
      const due = [glue(adapter, 'a', 88.2), glue(stream, 'b', 98)]
      expect(rowsDueIn(due, 88.2).map((r) => r.name)).toEqual(['a'])
      expect(
        [glue(adapter, 'a', 93), glue(stream, 'b', 98)]
          .filter((r) => !RUNNER_INTERIM_GLUE_DELETED_BY.includes(r.deletedBy))
          .map((r) => r.name)
      ).toEqual(['a'])
    })
  })
})

describe('noRollbackFlag', () => {
  it('anti-vacuity: the walks read real trees', () => {
    assertAtOrAboveFloor(
      'launchPortComplete src and meta files',
      tsWalk.count,
      SCANNED_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'launchPortComplete src-tauri/src files',
      rustWalk.count,
      RUST_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'launchPortComplete src/backend files',
      tsWalk.files.filter((f) => f.path.startsWith('src/backend/')).length,
      BACKEND_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'launchPortComplete flag walk files',
      flagWalk.count,
      SCANNED_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'launchPortComplete src-tauri/crates files',
      crateWalk.count,
      CRATE_FILES_FLOOR
    )
  })

  it.each(FORBIDDEN_FLAGS)(
    'no %s rollback flag text exists in src/, src-tauri/src or src-tauri/crates',
    (flag) => {
      expect(findRollbackFlag(flagWalk.files, flag)).toEqual([])
      expect(findRollbackFlag(crateWalk.files, flag)).toEqual([])
      expect(findRollbackFlag(scanned, flag)).toEqual([])
    }
  )

  describe('planted violations', () => {
    const planted = (path: string, raw: string) => ({
      path,
      raw,
      code: raw
    })

    it('self-test: each planted flag is caught in code, in a comment and as a longer name, a different flag is not', () => {
      const [launch, knownfix] = FORBIDDEN_FLAGS
      const files = [
        planted('flag.ts', `const on = process.env['${launch}']`),
        planted('doc.rs', `// ${knownfix}=0 falls back`),
        planted('longer.ts', `process.env['${launch}_SWITCH']`),
        planted('other.ts', "process.env['GAMELIB_INFO_SLICE']")
      ]
      expect(findRollbackFlag(files, launch)).toEqual(['flag.ts', 'longer.ts'])
      expect(findRollbackFlag(files, knownfix)).toEqual(['doc.rs'])
    })

    it('self-test: a planted tree holding each flag is walked, crates included, and the scan returns it', () => {
      const [launch, knownfix] = FORBIDDEN_FLAGS
      const dir = mkdtempSync(join(tmpdir(), 'launch-port-complete-'))
      try {
        mkdirSync(join(dir, 'src', 'backend', '__tests__'), { recursive: true })
        mkdirSync(join(dir, 'src-tauri', 'src'), { recursive: true })
        mkdirSync(join(dir, 'src-tauri', 'crates', 'gamelib-x', 'src'), {
          recursive: true
        })
        writeFileSync(
          join(dir, 'src', 'backend', 'a.ts'),
          `export const a = process.env['${launch}']\n`
        )
        writeFileSync(
          join(dir, 'src-tauri', 'src', 'b.rs'),
          `// ${knownfix} is the old switch\nfn b() {}\n`
        )
        writeFileSync(
          join(dir, 'src-tauri', 'crates', 'gamelib-x', 'src', 'c.rs'),
          `fn c() { let _ = std::env::var("${launch}"); }\n`
        )
        writeFileSync(
          join(dir, 'src', 'backend', 'clean.ts'),
          'export const clean = 1\n'
        )
        writeFileSync(
          join(dir, 'src', 'backend', '__tests__', 'gate.ts'),
          `process.env['${launch}']\n`
        )
        const walk = walkStripped(['src', 'src-tauri/src'], { base: dir })
        const crates = walkStripped(['src-tauri/crates'], {
          ext: /\.rs$/,
          base: dir
        })
        expect(walk.count).toBe(3)
        expect(crates.count).toBe(1)
        expect(findRollbackFlag(walk.files, launch)).toEqual([
          'src/backend/a.ts'
        ])
        expect(findRollbackFlag(walk.files, knownfix)).toEqual([
          'src-tauri/src/b.rs'
        ])
        expect(findRollbackFlag(crates.files, launch)).toEqual([
          'src-tauri/crates/gamelib-x/src/c.rs'
        ])
        expect(
          findRollbackFlag([...walk.files, ...crates.files], launch)
        ).toEqual(['src/backend/a.ts', 'src-tauri/crates/gamelib-x/src/c.rs'])
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('self-test: an empty directory walks no files and fails the flag-walk and crate-walk floors', () => {
      const dir = mkdtempSync(join(tmpdir(), 'launch-port-complete-'))
      try {
        const walk = walkStripped(['src', 'src-tauri/src'], { base: dir })
        const crates = walkStripped(['src-tauri/crates'], {
          ext: /\.rs$/,
          base: dir
        })
        expect(walk.count).toBe(0)
        expect(crates.count).toBe(0)
        expect(findRollbackFlag(walk.files, FORBIDDEN_FLAGS[0])).toEqual([])
        expect(() =>
          assertAtOrAboveFloor(
            'launchPortComplete flag walk files',
            walk.count,
            SCANNED_FILES_FLOOR
          )
        ).toThrow(/launchPortComplete flag walk files/)
        expect(() =>
          assertAtOrAboveFloor(
            'launchPortComplete src-tauri/crates files',
            crates.count,
            CRATE_FILES_FLOOR
          )
        ).toThrow(/launchPortComplete src-tauri\/crates files/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
