/**
 * The Phase 86 shim and resolver schedule (86-05, D-06 and D-24).
 *
 * D-06: once a service is ported, its TS survives only as a shim (one typed `requestRustInvoke` call
 * whose arguments are built from its parameters) or a resolver (D-24: `const` declarations that gather
 * TS-only inputs, then exactly one typed call), each with a scheduled deletion. This test lists every
 * one, so a shim cannot exist unscheduled and cannot outlive its row.
 *
 * `deletedBy` is the phase that deletes the row: the largest owning phase among its callers by the
 * ROADMAP goals (88 launch and gamedetails, 89/90 Steam, 91 Epic, 92 GOG/Amazon/sideload, 94
 * shortcuts, 98 shell), an integer in 87..99.
 *
 * The discovered set is every exported function in non-test src/backend/info/ plus the function
 * holding every `requestRustInvoke(RUST_INFO_<X>` call site outside src/backend/info/. It must equal
 * SCHEDULE's rows by file and name, in both directions. Plans 86-09 onward add the rows, one with
 * each plan that ports its service, and the planted fixtures below keep the
 * detector proven rather than vacuous (82 D-05).
 *
 * Floor: the walk read 611 non-test .ts/.tsx files under src/backend when measured on 2026-11-22
 * (86-05). The floor sits under that so later deletions cannot trip it; never lower it.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  checkShimShape,
  findExportedFunctions,
  findImporters,
  findRustInfoCalls,
  REPO_ROOT,
  walkStripped
} from 'backend/testUtils/infoPortGate'
import type { ShimRow, StrippedFile } from 'backend/testUtils/infoPortGate'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

const BACKEND_FILES_FLOOR = 400
const INFO_DIR = 'src/backend/info'

interface ScheduleRow extends ShimRow {
  /** The exported function's name. */
  name: string
  /** Repo-relative file holding it. */
  file: string
  /** The `RUST_INFO_*` constant its one typed call sends. */
  channel: string
  /** Repo-relative non-test files that import `file`. */
  callers: readonly string[]
  /** The phase that deletes this row, 87..99. */
  deletedBy: number
}

const OVERRIDES_CALLERS = [
  'src/backend/gamedetails/dispatch.ts',
  'src/backend/gamedetails/overrides.ts'
] as const

/**
 * `anticheat.ts` is imported by the sidecar boot alone (the `releasesInfoReady` listener calls the status
 * and download shims); the launcher's launch-time lookup left with `prepareWineLaunch` in 88.1-15. `callers` is
 * per FILE, so all three rows list the one importer.
 */
const ANTICHEAT_CALLERS = ['src/backend/sidecar/bootstrap.ts'] as const

/**
 * Every importer of `info/wiki.ts` (86-23); `callers` is checked per file, so the two wiki rows share it.
 * The GOG, Epic and Amazon store managers reach `getUmuId` through `resolveLaunchUmuId` (86-27, WR-41),
 * so that helper is the importer and the three managers are not.
 */
const WIKI_CALLERS = [
  'src/backend/storeManagers/storeManagerCommon/umuGameId.ts',
  'src/backend/utils.ts'
] as const

const SCHEDULE: readonly ScheduleRow[] = [
  // 86-09, recent games: both bodies are one typed call into `gamelib-info`. `callers` is checked
  // per FILE (every importer of `recentGames.ts`), so both rows list all three importers: the
  // launch paths (launcher.ts, steam/launchDispatch.ts) call addRecentGame and the sideload
  // uninstall (sideload/games.ts) calls removeRecentGame. `deletedBy` is per function.
  {
    name: 'addRecentGame',
    file: 'src/backend/info/recentGames.ts',
    shape: 'shim',
    channel: 'RUST_INFO_RECENT_ADD',
    callers: [
      'src/backend/storeManagers/sideload/games.ts',
      'src/backend/storeManagers/steam/launchDispatch.ts'
    ],
    deletedBy: 90
  },
  {
    name: 'removeRecentGame',
    file: 'src/backend/info/recentGames.ts',
    shape: 'shim',
    channel: 'RUST_INFO_RECENT_REMOVE',
    callers: [
      'src/backend/storeManagers/sideload/games.ts',
      'src/backend/storeManagers/steam/launchDispatch.ts'
    ],
    deletedBy: 92
  },
  // 86-11, per-game overrides: four one-call shims over `gamelib-info` `overrides`. Every function
  // answers a Promise now, so the two callers gained an `await` (Pitfall 9): `getGameInfo` awaits
  // `attachOverrides` (dispatch.ts) and `setGameMetadataOverride` awaits `setGameOverrides` then
  // `getAllGameOverrides` (overrides.ts). `getGameOverrides` has no non-test caller left (it
  // served `attachOverrides` inside the deleted TS module); it stays as the shim for the
  // `info_overrides_get` op until phase 88 deletes the file. `callers` is per FILE, so all four
  // rows list both importers. Phase 88 owns the game-details dispatchers.
  {
    name: 'getGameOverrides',
    file: 'src/backend/info/gameOverrides.ts',
    shape: 'shim',
    channel: 'RUST_INFO_OVERRIDES_GET',
    callers: OVERRIDES_CALLERS,
    deletedBy: 88
  },
  {
    name: 'getAllGameOverrides',
    file: 'src/backend/info/gameOverrides.ts',
    shape: 'shim',
    channel: 'RUST_INFO_OVERRIDES_GET_ALL',
    callers: OVERRIDES_CALLERS,
    deletedBy: 88
  },
  {
    name: 'setGameOverrides',
    file: 'src/backend/info/gameOverrides.ts',
    shape: 'shim',
    channel: 'RUST_INFO_OVERRIDES_SET',
    callers: OVERRIDES_CALLERS,
    deletedBy: 88
  },
  {
    name: 'attachOverrides',
    file: 'src/backend/info/gameOverrides.ts',
    shape: 'shim',
    channel: 'RUST_INFO_OVERRIDES_ATTACH',
    callers: OVERRIDES_CALLERS,
    deletedBy: 88
  },
  // 86-13, anti-cheat: three one-call shims over `gamelib-info` `anticheat`. The sidecar boot's
  // `releasesInfoReady` listener keeps TS's check-then-wait order: it calls `anticheatStatus`, and
  // only when the file is stale waits for the network and calls `anticheatDownload`. That online
  // wait is TS until phase 88 ports `online_monitor`, which deletes both; the launcher's launch-time
  // lookup (`gameAnticheatInfo`) goes with phase 88's launch rewrite.
  {
    name: 'anticheatStatus',
    file: 'src/backend/info/anticheat.ts',
    shape: 'shim',
    channel: 'RUST_INFO_ANTICHEAT_STATUS',
    callers: ANTICHEAT_CALLERS,
    deletedBy: 88
  },
  {
    name: 'anticheatDownload',
    file: 'src/backend/info/anticheat.ts',
    shape: 'shim',
    channel: 'RUST_INFO_ANTICHEAT_DOWNLOAD',
    callers: ANTICHEAT_CALLERS,
    deletedBy: 88
  },
  {
    name: 'gameAnticheatInfo',
    file: 'src/backend/info/anticheat.ts',
    shape: 'shim',
    channel: 'RUST_INFO_ANTICHEAT_INFO',
    callers: ANTICHEAT_CALLERS,
    deletedBy: 88
  },
  // 86-18, GOG discounts: a RESOLVER (D-24), not a shim. The catalog fetch is Rust; the one input
  // Rust cannot gather is the GOG access token, which needs the `gogdl` child process, so the
  // resolver reads it (`const token`, only when a flag asks for the account filters) and makes the
  // one call. `getGogDiscounts` stays TS-registered for that reason, and phase 92 ports GOG's
  // `gogdl` auth, after which Rust reads the token itself and the registration goes native.
  {
    name: 'getGogDiscounts',
    file: 'src/backend/info/discounts.ts',
    shape: 'resolver',
    inputs: ['token'],
    channel: 'RUST_INFO_GOG_DISCOUNTS',
    callers: ['src/backend/sidecar/enrichmentFlowRegistration.ts'],
    deletedBy: 92
  },
  // 86-19, the CrossOver rating map: a RESOLVER (D-24), not a shim. The index fetch, its bounds, the
  // cache, the back-off and the lookups are Rust; the one input Rust cannot gather is the library's game
  // list, which lives in every library manager's memory, so the resolver reads it (`const games`) and
  // makes the one call. `getCrossoverIndex` stays TS-registered for that reason (and in main.rs's
  // LONG_RUNNING_CHANNELS); phase 92 ports the last library manager (GOG/Amazon/sideload), after which
  // Rust holds the library itself and the registration goes native.
  {
    name: 'getCrossoverIndex',
    file: 'src/backend/info/crossover.ts',
    shape: 'resolver',
    inputs: ['games'],
    channel: 'RUST_INFO_CROSSOVER_RATING_MAP',
    callers: ['src/backend/sidecar/enrichmentFlowRegistration.ts'],
    deletedBy: 92
  },
  // 86-23, wiki game info and umu. Both functions live in `info/wiki.ts`, and `callers` is per
  // FILE, so each row lists every importer: `resolveLaunchUmuId`, the best-effort helper the GOG, Epic and
  // Amazon store managers call for the Linux launch GAMEID (86-27, WR-41), and `utils.ts` (`clearCache`'s
  // wiki cache clear). `getUmuId` is a one-call shim; its callers are the last library managers to port,
  // so phase 92 deletes it. `clearWikiGameInfoCache` is a one-call shim behind `clearCache`, a synchronous
  // function in `utils.ts` that the shell-files, GOG, Nile and Legendary paths call; phase 98 (shell)
  // deletes it. Phase 94 plan 24 deleted the third row, the `getWikiGameInfo` resolver: the Rust
  // shortcuts crate reaches the wiki lookup in-process through the shell's `WikiLookup`.
  {
    name: 'getUmuId',
    file: 'src/backend/info/wiki.ts',
    shape: 'shim',
    channel: 'RUST_INFO_UMU_GET',
    callers: WIKI_CALLERS,
    deletedBy: 92
  },
  {
    name: 'clearWikiGameInfoCache',
    file: 'src/backend/info/wiki.ts',
    shape: 'shim',
    channel: 'RUST_INFO_WIKI_CACHE_CLEAR',
    callers: WIKI_CALLERS,
    deletedBy: 98
  }
]

const key = (file: string, name: string): string => `${file}#${name}`

/** `file#name` for every function the schedule must list, found in `files`. */
function discover(files: readonly StrippedFile[]): string[] {
  const found = new Set<string>()
  for (const f of files) {
    if (f.path.startsWith(`${INFO_DIR}/`) && /\.tsx?$/.test(f.path)) {
      for (const name of findExportedFunctions(f.path, f.code)) {
        found.add(key(f.path, name))
      }
    }
  }
  for (const call of findRustInfoCalls(
    files.filter((f) => !f.path.startsWith(`${INFO_DIR}/`))
  )) {
    found.add(key(call.path, call.fn))
  }
  return [...found].sort()
}

/** Both directions of the set-equality check. */
function diff(
  discovered: readonly string[],
  scheduled: readonly string[]
): { unscheduled: string[]; orphaned: string[] } {
  return {
    unscheduled: discovered.filter((k) => !scheduled.includes(k)),
    orphaned: scheduled.filter((k) => !discovered.includes(k))
  }
}

const planted = (path: string, code: string): StrippedFile => ({
  path,
  raw: code,
  code
})

const backendWalk = walkStripped(['src/backend'], { ext: /\.tsx?$/ })
const allWalk = walkStripped(['src', 'meta'], { ext: /\.tsx?$/ })

describe('infoShimSchedule', () => {
  it('anti-vacuity: the walk read a real src/backend tree', () => {
    assertAtOrAboveFloor(
      'infoShimSchedule src/backend files',
      backendWalk.count,
      BACKEND_FILES_FLOOR
    )
  })

  it('the discovered shims and resolvers equal the schedule rows, by file and name', () => {
    const scheduled = SCHEDULE.map((r) => key(r.file, r.name)).sort()
    expect(diff(discover(allWalk.files), scheduled)).toEqual({
      unscheduled: [],
      orphaned: []
    })
  })

  it('every row has a unique file and name', () => {
    const keys = SCHEDULE.map((r) => key(r.file, r.name))
    expect(new Set(keys).size).toBe(keys.length)
  })

  // One loop per check rather than `it.each`, so a schedule that ever empties again does not trip jest's empty-table refusal.
  it('every row has the shape it claims and sends its row channel', () => {
    const calls = findRustInfoCalls(allWalk.files)
    for (const row of SCHEDULE) {
      const source = readFileSync(join(REPO_ROOT, row.file), 'utf8')
      expect({
        row: row.name,
        problems: checkShimShape(source, row.name, row)
      }).toEqual({ row: row.name, problems: [] })
      const sent = calls.find((c) => c.path === row.file && c.fn === row.name)
      expect({ row: row.name, channel: sent?.constant }).toEqual({
        row: row.name,
        channel: row.channel
      })
    }
  })

  it('every row is scheduled for deletion in an integer phase 87..99', () => {
    for (const row of SCHEDULE) {
      expect(Number.isInteger(row.deletedBy)).toBe(true)
      expect(row.deletedBy).toBeGreaterThanOrEqual(87)
      expect(row.deletedBy).toBeLessThanOrEqual(99)
    }
  })

  it('every row is imported by exactly its listed callers', () => {
    for (const row of SCHEDULE) {
      expect({
        row: row.name,
        importers: findImporters(allWalk.files, row.file).sort()
      }).toEqual({ row: row.name, importers: [...row.callers].sort() })
    }
  })
})

describe('infoShimSchedule detector (planted fixtures)', () => {
  const SHIM =
    'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [{ a }]) }'

  it('a planted shim passes as shape shim', () => {
    expect(checkShimShape(SHIM, 'f', { shape: 'shim' })).toEqual([])
  })

  it('an expression-bodied arrow shim and a destructured-deps shim pass', () => {
    expect(
      checkShimShape(
        'export const g = (deps, a) => deps.requestRustInvoke(RUST_INFO_X, [a])',
        'g',
        { shape: 'shim' }
      )
    ).toEqual([])
    expect(
      checkShimShape(
        'export async function h({ requestRustInvoke }, a) { return await requestRustInvoke(RUST_INFO_X, [a.id]) }',
        'h',
        { shape: 'shim' }
      )
    ).toEqual([])
  })

  it.each([
    ['a log', 'logInfo(a);', 'logInfo(a)'],
    ['an if', 'if (!a) { return null }', 'if (!a)'],
    ['a try', 'try { await x() } catch { }', 'try {'],
    ['a const', 'const b = a + 1;', 'const b = a + 1']
  ])(
    'a planted shim with %s before the call fails naming the statement',
    (_n, stmt, named) => {
      const src = `export async function f(deps, a) { ${stmt} return deps.requestRustInvoke(RUST_INFO_X, [{ a }]) }`
      const problems = checkShimShape(src, 'f', { shape: 'shim' })
      expect(problems).toHaveLength(1)
      expect(problems[0]).toContain('extra statement before the call')
      expect(problems[0]).toContain(named)
    }
  )

  it('a planted shim that does not return the call fails', () => {
    const src =
      'export async function f(deps, a) { await deps.requestRustInvoke(RUST_INFO_X, [a]) }'
    expect(checkShimShape(src, 'f', { shape: 'shim' })).toEqual([
      expect.stringContaining('the last statement must return the call')
    ])
  })

  it('a planted shim wrapping the call in a transform fails', () => {
    const src =
      'export async function f(deps, a) { return (await deps.requestRustInvoke(RUST_INFO_X, [a])).items }'
    expect(checkShimShape(src, 'f', { shape: 'shim' })).toEqual([
      expect.stringContaining(
        'the returned value must be the requestRustInvoke call'
      )
    ])
  })

  it('a planted function with two requestRustInvoke calls fails', () => {
    const twice =
      'export async function f(deps, a) { await deps.requestRustInvoke(RUST_INFO_X, [a]); return deps.requestRustInvoke(RUST_INFO_Y, [a]) }'
    expect(checkShimShape(twice, 'f', { shape: 'shim' })).toEqual([
      expect.stringContaining('holds 2 requestRustInvoke calls')
    ])
    const nested =
      'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [deps.requestRustInvoke(RUST_INFO_Y, [a])]) }'
    expect(checkShimShape(nested, 'f', { shape: 'shim' })).toEqual([
      expect.stringContaining('holds 2 requestRustInvoke calls')
    ])
  })

  it('a planted call whose first argument is not a RUST_INFO constant fails', () => {
    const src =
      'export async function f(deps, a) { return deps.requestRustInvoke(RUST_APP_EXIT, [a]) }'
    expect(checkShimShape(src, 'f', { shape: 'shim' })).toEqual([
      expect.stringContaining(
        'the first argument must be a RUST_INFO_* constant'
      )
    ])
  })

  it.each([
    [
      'a module constant',
      'const TOKEN = 1;\nexport async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [TOKEN]) }',
      "names 'TOKEN'"
    ],
    [
      'a function call',
      'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [load(a)]) }',
      'CallExpression'
    ],
    [
      'a conditional',
      'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [a ? 1 : 2]) }',
      'ConditionalExpression'
    ],
    [
      'a template with a substitution',
      'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [`k-${a}`]) }',
      'TemplateExpression'
    ]
  ])('a planted shim argument built from %s fails', (_n, src, named) => {
    const problems = checkShimShape(src, 'f', { shape: 'shim' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain(named)
  })

  it('a planted shim calling through something that is not a parameter fails', () => {
    const src =
      'export async function f(a) { return globalRpc.requestRustInvoke(RUST_INFO_X, [a]) }'
    expect(checkShimShape(src, 'f', { shape: 'shim' })).toEqual([
      expect.stringContaining(
        "goes through 'globalRpc', which is not a parameter"
      )
    ])
  })

  it('a missing function and a shim row that names inputs fail', () => {
    expect(checkShimShape(SHIM, 'nope', { shape: 'shim' })).toEqual([
      expect.stringContaining('no exported function of that name')
    ])
    expect(checkShimShape(SHIM, 'f', { shape: 'shim', inputs: ['a'] })).toEqual(
      [expect.stringContaining('a shim row names no inputs')]
    )
  })

  const RESOLVER =
    'export async function r(deps, id) { const games = await load(id); return deps.requestRustInvoke(RUST_INFO_Y, [{ games }]) }'

  it('a planted resolver passes when the row inputs are the const names and fails when they are not', () => {
    expect(
      checkShimShape(RESOLVER, 'r', { shape: 'resolver', inputs: ['games'] })
    ).toEqual([])
    expect(
      checkShimShape(RESOLVER, 'r', { shape: 'resolver', inputs: ['other'] })
    ).toEqual([
      expect.stringContaining(
        "const names [games] are not exactly the row's inputs [other]"
      )
    ])
    expect(
      checkShimShape(RESOLVER, 'r', { shape: 'resolver', inputs: [] })
    ).toEqual([expect.stringContaining('are not exactly the row')])
  })

  it('a planted resolver with several consts passes in any order, and a missing const fails', () => {
    const src =
      'export async function r(deps) { const token = await t(); const games = await g(); return deps.requestRustInvoke(RUST_INFO_Y, [{ token, games }]) }'
    expect(
      checkShimShape(src, 'r', {
        shape: 'resolver',
        inputs: ['games', 'token']
      })
    ).toEqual([])
    expect(
      checkShimShape(src, 'r', { shape: 'resolver', inputs: ['games'] })
    ).toEqual([expect.stringContaining('are not exactly the row')])
  })

  it('a planted resolver with a non-const statement before the call fails naming it', () => {
    const letCase =
      'export async function r(deps) { let games = await g(); return deps.requestRustInvoke(RUST_INFO_Y, [{ games }]) }'
    const logCase =
      'export async function r(deps) { const games = await g(); logInfo(games); return deps.requestRustInvoke(RUST_INFO_Y, [{ games }]) }'
    expect(
      checkShimShape(letCase, 'r', { shape: 'resolver', inputs: ['games'] })
    ).toEqual(
      expect.arrayContaining([
        expect.stringContaining('only const declarations may precede the call')
      ])
    )
    expect(
      checkShimShape(logCase, 'r', { shape: 'resolver', inputs: ['games'] })
    ).toEqual([
      expect.stringContaining(
        'only const declarations may precede the call, found: logInfo(games)'
      )
    ])
  })

  it('a planted resolver argument may read its consts and parameters but not other names', () => {
    const bad =
      'export async function r(deps) { const games = await g(); return deps.requestRustInvoke(RUST_INFO_Y, [{ games, extra }]) }'
    expect(
      checkShimShape(bad, 'r', { shape: 'resolver', inputs: ['games'] })
    ).toEqual([expect.stringContaining("names 'extra'")])
  })

  describe('discovery set-equality', () => {
    const infoFile = planted(
      `${INFO_DIR}/things.ts`,
      `${SHIM}\nexport const g = (deps) => deps.requestRustInvoke(RUST_INFO_X, [])\nfunction hidden() {}`
    )
    const callerFile = planted(
      'src/backend/launch/use.ts',
      'export const callAnon = (deps) => { deps.list.forEach(() => deps.requestRustInvoke(RUST_INFO_Z, [])) }'
    )

    it('discovers exported info functions and the function holding an outside call site', () => {
      expect(discover([infoFile, callerFile])).toEqual([
        'src/backend/info/things.ts#f',
        'src/backend/info/things.ts#g',
        'src/backend/launch/use.ts#callAnon'
      ])
    })

    it('a planted exported function with no schedule row fails the check', () => {
      expect(
        diff(discover([infoFile]), [key(`${INFO_DIR}/things.ts`, 'f')])
      ).toEqual({
        unscheduled: ['src/backend/info/things.ts#g'],
        orphaned: []
      })
    })

    it('a row with no discovered function fails the check', () => {
      expect(
        diff(discover([infoFile]), [
          key(`${INFO_DIR}/things.ts`, 'f'),
          key(`${INFO_DIR}/things.ts`, 'g'),
          key(`${INFO_DIR}/things.ts`, 'gone')
        ])
      ).toEqual({
        unscheduled: [],
        orphaned: ['src/backend/info/things.ts#gone']
      })
    })

    it('an outside call site is discovered by the function that holds it, so an unlisted one fails', () => {
      const held = planted(
        'src/backend/launch/use.ts',
        'export function useIt(deps) { return deps.requestRustInvoke(RUST_INFO_Z, []) }'
      )
      expect(diff(discover([held]), [])).toEqual({
        unscheduled: ['src/backend/launch/use.ts#useIt'],
        orphaned: []
      })
    })

    it('an outside call to a non-INFO channel is not discovered', () => {
      const quiet = planted(
        'src/backend/launch/use.ts',
        'export function useIt(deps) { return deps.requestRustInvoke(RUST_APP_EXIT, []) }'
      )
      expect(discover([quiet])).toEqual([])
    })

    it('with no shims on disk and an empty schedule the check passes (the detector above is not vacuous)', () => {
      expect(diff(discover([]), [])).toEqual({ unscheduled: [], orphaned: [] })
      expect(
        diff(discover([planted('src/backend/a.ts', 'export const a = 1')]), [])
      ).toEqual({
        unscheduled: [],
        orphaned: []
      })
    })
  })

  describe('importer detection', () => {
    const files = [
      planted('src/backend/info/things.ts', 'export const f = 1'),
      planted(
        'src/backend/launch/a.ts',
        "import { f } from 'backend/info/things'"
      ),
      planted('src/backend/launch/b.ts', "export { f } from '../info/things'"),
      planted(
        'src/backend/launch/c.ts',
        "const m = await import('backend/info/things')"
      ),
      planted(
        'src/backend/launch/d.ts',
        "import { f } from 'backend/info/thingsMore'"
      ),
      planted('src/backend/info/e.ts', "import { f } from './things'")
    ]

    it('finds bare, relative, re-export and dynamic importers and not a sibling name', () => {
      expect(findImporters(files, 'src/backend/info/things.ts').sort()).toEqual(
        [
          'src/backend/info/e.ts',
          'src/backend/launch/a.ts',
          'src/backend/launch/b.ts',
          'src/backend/launch/c.ts'
        ]
      )
    })

    it('an unlisted importer is a difference the caller check would report', () => {
      const listed = ['src/backend/launch/a.ts']
      const actual = findImporters(files, 'src/backend/info/things.ts')
      expect(actual.filter((p) => !listed.includes(p)).length).toBeGreaterThan(
        0
      )
    })
  })

  it('self-test: an empty directory walks no files and fails the schedule floor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'info-shim-schedule-'))
    try {
      const walk = walkStripped(['src/backend'], { base: dir })
      expect(walk.count).toBe(0)
      expect(() =>
        assertAtOrAboveFloor(
          'infoShimSchedule src/backend files',
          walk.count,
          BACKEND_FILES_FLOOR
        )
      ).toThrow(/infoShimSchedule src\/backend files/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
