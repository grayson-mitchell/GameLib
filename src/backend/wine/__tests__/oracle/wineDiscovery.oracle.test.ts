/**
 * The wine discovery oracle (87-08, D-22 and D-08): CrossOver, wine-on-mac, Wineskin, Game Porting
 * Toolkit, system GPTK, Whisky, the Linux set with its Proton directories and custom paths,
 * `getAlternativeWine`'s aggregate order, and `getDefaultWineBinary` (`Default Wine - Not Found`),
 * driven on a fake HOME and recorded as the goldens the Rust `gamelib-wine` discovery slice has to
 * reproduce.
 *
 * Artefacts (inputs are hand-authored in `cases.json`; everything else is written from the TS):
 *   golden/discovery/              one case per discovery behaviour: the returned list in order, the
 *                                  spawn trace (`mdfind`, `--version`), the rust invokes and the tree
 *   vectors/default_wine.json      `getDefaultWineBinary` over a scripted PATH
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite every artefact from the TS
 *   (default)                        recompute and compare, offline
 *
 * Nothing reads the real PATH, HOME or /Applications. Bundles live under `<HOME>/Applications` and
 * `<TOOLS>`, every `mdfind` and `--version` spawn is scripted (a function that takes its bundle paths
 * from `mdfind` needs no real root), `os.homedir()` is pinned to the fake HOME for the Lutris
 * directory, and PATH holds only the scripted directories. The one absolute path the TS hard-codes,
 * `/usr/share/steam`, is made non-existent and directory listings are sorted (`pinHostFilesystem`),
 * so the host cannot change a golden. The goldens are recorded on a POSIX host.
 *
 * `getAlternativeWine` is called with the `GlobalConfig` prototype over a stand-in `this`; its
 * refresh-on-empty-store branch is the wine-manager `updateWineVersionInfos` call that 87-07 records,
 * so every case here stores a release list and never reaches the network.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  loadCases,
  mockPlatform,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import {
  fixturesRoot,
  engineWineOracleMode
} from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import { GlobalConfig } from 'backend/config'
import {
  getCrossover,
  getDefaultWineBinary,
  getGamePortingToolkitWine,
  getLinuxWineSet,
  getSystemGamePortingToolkitWine,
  getWhisky,
  getWineOnMac,
  getWineskinWine
} from 'backend/utils/compatibility_layers'
import type { WineInstallation } from 'common/types'

const CRATE = 'gamelib-wine'
const SLICE = 'discovery'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 51
/** The default-wine vector count. */
const DEFAULT_FLOOR = 8

type Op =
  | 'crossover'
  | 'wine-on-mac'
  | 'wineskin'
  | 'gptk'
  | 'system-gptk'
  | 'whisky'
  | 'mac-set'
  | 'linux-set'
  | 'alternative'

interface DiscoveryCase {
  id: string
  op: Op
  platform: OraclePlatform
  seed: SeedEntry[]
  scripted: {
    program: string
    argv?: string[]
    code?: number
    stdout?: string
    stderr?: string
  }[]
  /** PATH directories (placeholders). Absent: only the scripted bin directory. */
  path?: string[]
  settings?: {
    customWinePaths: string[]
    showValveProton: boolean
    defaultSteamPath: string
  }
  /** What the Rust read of libraryfolders.vdf answers. Absent: the file does not exist. */
  steamLibraries?:
    | { exists: boolean; parsed: boolean; paths: string[] }
    | 'throws'
  scanCustom?: boolean
  /** `getAlternativeWine`: the wine-manager store already holds a release list. */
  releasesStored?: boolean
  note: string
}

const SCRIPTED_BIN = '<HOME>/scripted-bin'

/** The module object the TS reads through; a namespace import is a frozen copy, so spy on this. */
// eslint-disable-next-line @typescript-eslint/no-require-imports
const osModule = (): typeof import('os') => require('os')
// eslint-disable-next-line @typescript-eslint/no-require-imports
const gracefulFs = (): typeof import('graceful-fs') => require('graceful-fs')

async function withPath<T>(
  dirs: readonly string[] | null,
  fn: () => Promise<T> | T
): Promise<T> {
  const saved = process.env.PATH
  if (dirs === null) delete process.env.PATH
  else process.env.PATH = dirs.join(':')
  try {
    return await fn()
  } finally {
    if (saved === undefined) delete process.env.PATH
    else process.env.PATH = saved
  }
}

/**
 * Pins the two host-dependent filesystem answers the discovery reads. `/usr/share/steam` (the one
 * absolute path the Linux set reads) does not exist, so a Linux host with Steam installed cannot
 * change a golden. `readdirSync` lists its entries sorted: the TS lists a directory in whatever order
 * the filesystem returns (alphabetical on APFS, hash order on ext4), and a golden that followed the
 * recording machine's filesystem would fail on the other CI legs. The Rust port sorts too (a D-19
 * hardening), so the order the goldens pin is the sorted one.
 */
function pinHostFilesystem(): void {
  const fs = gracefulFs()
  const realExists = fs.existsSync.bind(fs)
  jest
    .spyOn(fs, 'existsSync')
    .mockImplementation((path) =>
      typeof path === 'string' && path.startsWith('/usr/share/steam')
        ? false
        : realExists(path)
    )
  const realReaddir = fs.readdirSync.bind(fs) as (...args: unknown[]) => unknown
  jest.spyOn(fs, 'readdirSync').mockImplementation(((...args: unknown[]) => {
    const entries = realReaddir(...args)
    return Array.isArray(entries) && entries.every((e) => typeof e === 'string')
      ? [...entries].sort()
      : entries
  }) as never)
}

const expandList = (list: readonly string[], profile: EngineOracleProfile) =>
  list.map((p) => expandPlaceholders(p, profile))

const wineSetResult = (
  set: Iterable<WineInstallation>,
  profile: EngineOracleProfile
): WineInstallation[] => normalisePaths([...set], profile)

const vectorFile = (name: string): string =>
  join(fixturesRoot(CRATE), 'vectors', name)

interface DefaultInput {
  id: string
  /** PATH directories (placeholders); `null` leaves PATH unset. */
  path: string[] | null
  seed: SeedEntry[]
  note: string
}

const exe = (path: string): SeedEntry => ({ path, text: '', mode: '0755' })
const DEFAULT_INPUTS: DefaultInput[] = [
  {
    id: 'wine-with-wineserver',
    path: ['<HOME>/bin-a'],
    seed: [exe('<HOME>/bin-a/wine'), exe('<HOME>/bin-a/wineserver')],
    note: 'wine on PATH with a sibling wineserver: the name is the binary name, wineserver is the sibling'
  },
  {
    id: 'wine-without-wineserver',
    path: ['<HOME>/bin-a'],
    seed: [exe('<HOME>/bin-a/wine')],
    note: 'no sibling wineserver: wineserver is ""'
  },
  {
    id: 'no-wine-on-path',
    path: ['<HOME>/bin-a', '<HOME>/bin-b'],
    seed: [exe('<HOME>/bin-a/other'), { path: '<HOME>/bin-b', dir: true }],
    note: 'no wine anywhere on PATH: the Default Wine - Not Found record with an empty bin'
  },
  {
    id: 'path-unset',
    path: null,
    seed: [],
    note: 'PATH unset: not found'
  },
  {
    id: 'wine-in-second-directory',
    path: ['<HOME>/bin-a', '<HOME>/bin-b'],
    seed: [
      exe('<HOME>/bin-a/wineserver'),
      exe('<HOME>/bin-b/wine'),
      exe('<HOME>/bin-b/wineserver')
    ],
    note: 'PATH order: the first directory has only a wineserver, so wine comes from the second and so does its wineserver'
  },
  {
    id: 'wine-not-executable',
    path: ['<HOME>/bin-a'],
    seed: [{ path: '<HOME>/bin-a/wine', text: '', mode: '0644' }],
    note: 'a wine file without the execute bit is not found'
  },
  {
    id: 'wine-first-match-wins',
    path: ['<HOME>/bin-a', '<HOME>/bin-b'],
    seed: [
      exe('<HOME>/bin-a/wine'),
      exe('<HOME>/bin-b/wine'),
      exe('<HOME>/bin-b/wineserver')
    ],
    note: 'two wines: the first on PATH is used and its (absent) sibling wineserver decides, not the second directory'
  },
  {
    id: 'wine-symlink-not-resolved',
    path: ['<HOME>/bin-a'],
    seed: [
      exe('<HOME>/opt/wine-9/bin/wine'),
      exe('<HOME>/opt/wine-9/bin/wineserver'),
      { path: '<HOME>/bin-a/wine', symlink: '<HOME>/opt/wine-9/bin/wine' },
      exe('<HOME>/bin-a/wineserver')
    ],
    note: 'a wine symlink on PATH is reported as the link; the wineserver beside the link is used, not the target'
  }
]

describeSkipOnWindows('wine discovery oracle (87-08)', () => {
  afterEach(() => {
    jest.restoreAllMocks()
  })

  const cases = loadCases<DiscoveryCase>(CRATE, SLICE)

  it.each(cases)('$id', async (c) => {
    const restorePlatform = mockPlatform(c.platform)
    try {
      await withEngineOracleProfile(
        async (profile) => {
          const events: unknown[] = []
          const tracer = createSpawnTracer({
            baseEnv: profile.fake.childEnv(),
            scripted: c.scripted.map((s) => ({
              ...s,
              program: expandPlaceholders(s.program, profile),
              argv: s.argv?.map((a) => expandPlaceholders(a, profile)),
              stdout: expandPlaceholders(s.stdout ?? '', profile),
              stderr: expandPlaceholders(s.stderr ?? '', profile)
            }))
          })
          const runner = tracer.runner
          const settings = c.settings && {
            customWinePaths: expandList(c.settings.customWinePaths, profile),
            showValveProton: c.settings.showValveProton,
            defaultSteamPath: expandPlaceholders(
              c.settings.defaultSteamPath,
              profile
            )
          }
          const config = { getSettings: () => settings } as never
          const requestRustInvoke = ((channel: string, args: unknown[]) => {
            events.push({ kind: 'rustInvoke', channel, args })
            if (c.steamLibraries === 'throws') {
              return Promise.reject(new Error('rust unavailable'))
            }
            const answer = c.steamLibraries ?? {
              exists: false,
              parsed: false,
              paths: []
            }
            return Promise.resolve({
              ...answer,
              paths: expandList(answer.paths, profile)
            })
          }) as never
          const linuxDeps = {
            runner,
            config,
            paths: profile.paths,
            requestRustInvoke
          }
          jest.spyOn(osModule(), 'homedir').mockReturnValue(profile.home)
          pinHostFilesystem()
          const dirs = [...expandList(c.path ?? [], profile)]
          if (!dirs.includes(expandPlaceholders(SCRIPTED_BIN, profile))) {
            dirs.push(expandPlaceholders(SCRIPTED_BIN, profile))
          }

          const standIn = Object.create(GlobalConfig.prototype) as Record<
            string,
            unknown
          >
          standIn.getSettings = () => settings
          standIn.deps = { requestRustInvoke }

          const result = await withPath(dirs, async () => {
            switch (c.op) {
              case 'crossover':
                return wineSetResult(await getCrossover({ runner }), profile)
              case 'wine-on-mac':
                return wineSetResult(
                  await getWineOnMac({ runner, paths: profile.paths }),
                  profile
                )
              case 'wineskin':
                return wineSetResult(
                  await getWineskinWine({ runner, paths: profile.paths }),
                  profile
                )
              case 'gptk':
                return wineSetResult(
                  await getGamePortingToolkitWine({ paths: profile.paths }),
                  profile
                )
              case 'system-gptk':
                return wineSetResult(
                  await getSystemGamePortingToolkitWine({ runner }),
                  profile
                )
              case 'whisky':
                return wineSetResult(
                  await getWhisky({ paths: profile.paths }),
                  profile
                )
              case 'mac-set':
                return wineSetResult(
                  await (standIn as unknown as GlobalConfig).getMacOsWineSet({
                    runner,
                    paths: profile.paths
                  }),
                  profile
                )
              case 'linux-set':
                return wineSetResult(
                  await getLinuxWineSet(linuxDeps, c.scanCustom),
                  profile
                )
              case 'alternative':
                return normalisePaths(
                  await (standIn as unknown as GlobalConfig).getAlternativeWine(
                    {
                      wineDownloaderInfoStore: {
                        get: (_key: string, fallback: unknown) =>
                          c.releasesStored ? [{ version: 'stored' }] : fallback
                      },
                      runner,
                      paths: profile.paths,
                      sendFrontendMessage: () => undefined
                    } as never,
                    c.scanCustom
                  ),
                  profile
                )
            }
          })
          tracer.expectAllConsumed()
          writeOrCompareGolden(CRATE, SLICE, c.id, {
            result: { op: c.op, note: c.note, result },
            events: normalisePaths(events, profile),
            after: snapshotTree(profile.home),
            spawns: normalisePaths(tracer.records, profile)
          })
        },
        { seed: c.seed }
      )
    } finally {
      restorePlatform()
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, FLOOR)
    assertManifest(CRATE, SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FLOOR)
  })

  it('records getDefaultWineBinary over a scripted PATH', async () => {
    const vectors: unknown[] = []
    for (const input of DEFAULT_INPUTS) {
      const expected = await withEngineOracleProfile(
        async (profile) =>
          withPath(
            input.path === null ? null : expandList(input.path, profile),
            () => normalisePaths(getDefaultWineBinary(), profile)
          ),
        { seed: input.seed }
      )
      vectors.push({ ...input, expected })
    }
    assertAtOrAboveFloor('default_wine vectors', vectors.length, DEFAULT_FLOOR)
    const names = vectors.map(
      (v) => (v as { expected: WineInstallation }).expected.name
    )
    // Both outcomes are present, so a function that always finds or never finds wine cannot pass.
    expect(names).toContain('Default Wine - Not Found')
    expect(names).toContain('wine')

    const text = `${JSON.stringify(vectors, null, 2)}\n`
    const mode = engineWineOracleMode()
    if (mode === 'record') return
    if (mode === 'write') {
      mkdirSync(dirname(vectorFile('default_wine.json')), { recursive: true })
      writeFileSync(vectorFile('default_wine.json'), text)
      return
    }
    expect(existsSync(vectorFile('default_wine.json'))).toBe(true)
    expect(text).toBe(readFileSync(vectorFile('default_wine.json'), 'utf8'))
    assertAtOrAboveFloor(
      'default_wine committed vectors',
      (JSON.parse(text) as unknown[]).length,
      DEFAULT_FLOOR
    )
  })
})
