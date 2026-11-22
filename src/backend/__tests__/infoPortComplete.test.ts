/**
 * Phase 86 per-slice delete gate (86-05, SC4 and D-02). One `describe('<slice>PortComplete')` per
 * slice, each runnable alone with `-t '<slice>PortComplete'`. A slice's describe fails if a TS file
 * the port deleted comes back, a deleted identifier is named in non-test code, a TS `ipc.handle` or
 * `ipc.on` registers one of the slice's native channels, a `GAMELIB_<SLICE>` rollback flag string
 * appears anywhere under src/ or src-tauri/src (D-13: no flag helper is built), or a store row the
 * Rust host still needs is dropped from storeTable.json (D-18 and D-29 row 5).
 *
 * Modelled on loggerPortComplete (82 D-05): every scan runs over comment-stripped text, every walk has
 * a floor on the files it read, and the self-tests at the bottom plant a violation and watch each
 * scan fail. The scans live in `backend/testUtils/infoPortGate`, shared with infoShimSchedule.
 *
 * The goldens stay after the TS goes: a slice that keeps its oracle fixtures lists them in `kept`.
 *
 * Adding a slice: write its SliceSpec, add `describe('<name>PortComplete', () => runSlice(SPEC))`, and
 * run it red before the deletion. Never lower a floor or widen an allow-list to turn a red run green.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import {
  assertDeleted,
  assertKept,
  checkShimShape,
  findIdentifiers,
  findRollbackFlag,
  findRustInfoCalls,
  findTsRegistrations,
  REPO_ROOT,
  walkStripped
} from 'backend/testUtils/infoPortGate'
import type { StrippedFile } from 'backend/testUtils/infoPortGate'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

/**
 * Floors (82 D-05). Measured 2026-11-22 (86-05, after the images_cache deletion) over non-test
 * .ts/.tsx/.rs files under src/ and meta/: 1329 files. The floor sits well under that so the later
 * 87-99 deletions cannot trip it; it only has to prove the walk read a real tree. Never lower it to
 * make a red run green. src-tauri/src held 66 .rs files and src/backend 612 .ts/.tsx files.
 */
const SCANNED_FILES_FLOOR = 800
const RUST_FILES_FLOOR = 40
const BACKEND_FILES_FLOOR = 400

interface SliceSpec {
  /** Repo-relative TS files the port deleted. */
  deleted: readonly string[]
  /** Repo-relative paths that must survive the deletion (golden fixtures, kept modules). */
  kept?: readonly string[]
  /** Identifiers deleted with the slice; none may be named in non-test code under `identifierRoot`. */
  forbiddenIdentifiers: readonly string[]
  identifierRoot: string
  /** The rollback flag no fallback window was named for (D-13). */
  flag: string
  /** A manifest slice whose native channels must have no TS `ipc.handle` or `ipc.on`. */
  manifestSlice?: string
  /** The measured channel count of `manifestSlice`; the check fails below it. */
  channelsFloor?: number
  /** `storeTable.json` row keys that must outlive the TS store registration (D-29 row 5). */
  storeRowKeys?: readonly string[]
}

interface Manifest {
  channels: Record<string, { slice: string }>
}

const manifest = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'src', 'common', 'types', 'ipc', 'nativeChannels.json'),
    'utf8'
  )
) as Manifest

const storeTable = JSON.parse(
  readFileSync(
    join(REPO_ROOT, 'src', 'common', 'types', 'ipc', 'storeTable.json'),
    'utf8'
  )
) as { rows: { key: string; kind: string; tsNames: string[] }[] }
const storeTableKeys = storeTable.rows.map((r) => r.key)

const tsWalk = walkStripped(['src', 'meta'])
const flagWalk = walkStripped(['src', 'src-tauri/src'])
const rustWalk = walkStripped(['src-tauri/src'], { ext: /\.rs$/ })

const channelsOf = (slice: string): string[] =>
  Object.entries(manifest.channels)
    .filter(([, spec]) => spec.slice === slice)
    .map(([name]) => name)

/** Row keys in `wanted` that `table` does not list. */
function missingStoreRows(
  table: readonly string[],
  wanted: readonly string[]
): string[] {
  return wanted.filter((k) => !table.includes(k))
}

function runSlice(spec: SliceSpec): void {
  const underRoot: StrippedFile[] = tsWalk.files.filter((f) =>
    f.path.startsWith(`${spec.identifierRoot}/`)
  )

  it.each(spec.deleted)('%s is deleted', (p) => {
    expect(() => assertDeleted([p])).not.toThrow()
  })

  if (spec.kept && spec.kept.length > 0) {
    it.each(spec.kept)('%s is kept', (p) => {
      expect(() => assertKept([p])).not.toThrow()
    })
  }

  it.each(spec.forbiddenIdentifiers)(
    `non-test code under ${spec.identifierRoot} never names %s`,
    (id) => {
      expect(findIdentifiers(underRoot, [id])).toEqual([])
    }
  )

  if (spec.manifestSlice !== undefined) {
    const slice = spec.manifestSlice
    const channels = channelsOf(slice)
    it(`the ${slice} slice names at least ${spec.channelsFloor ?? 1} native channels`, () => {
      assertAtOrAboveFloor(
        `${slice} slice channels`,
        channels.length,
        spec.channelsFloor ?? 1
      )
    })
    it.each(channels)(
      `${slice}-slice channel %s has no sidecar ipc.on or ipc.handle`,
      (name) => {
        expect(findTsRegistrations(tsWalk.files, [name])).toEqual([])
      }
    )
  }

  if (spec.storeRowKeys && spec.storeRowKeys.length > 0) {
    it.each(spec.storeRowKeys)(
      'storeTable.json still lists the %s row',
      (key) => {
        expect(missingStoreRows(storeTableKeys, [key])).toEqual([])
      }
    )
  }

  it(`no ${spec.flag} rollback flag text survives in src/ or src-tauri/src`, () => {
    // This file names the flag to forbid it, and lives under __tests__ (not walked).
    expect(findRollbackFlag(flagWalk.files, spec.flag)).toEqual([])
  })
}

/** D-22: images_cache is deleted outright, not ported; nothing replaces it. */
const IMAGES_CACHE: SliceSpec = {
  deleted: ['src/backend/images_cache.ts'],
  forbiddenIdentifiers: [
    'createImageFetches',
    'ImageFetches',
    'initImagesCache',
    'getImageFromCache',
    'imageFetches'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_IMAGES_CACHE'
}

describe('imagesCachePortComplete', () => {
  runSlice(IMAGES_CACHE)
})

/**
 * 86-09, D-05 and D-13: recent games is Rust's. The TS slice and its oracle are deleted; the golden
 * fixtures stay for the Rust golden. Only two scheduled shims (infoShimSchedule) reach it from TS.
 */
const RECENT_GAMES: SliceSpec = {
  deleted: [
    'src/backend/recent_games/recent_games.ts',
    'src/backend/info/__tests__/oracle/recentGames.oracle.test.ts'
  ],
  kept: ['src-tauri/crates/gamelib-info/tests/fixtures/golden/recent'],
  forbiddenIdentifiers: [
    'RecentGamesDeps',
    'getRecentGames',
    'testingExportsRecentGames'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_RECENT_GAMES'
}

describe('recentGamesPortComplete', () => {
  runSlice(RECENT_GAMES)

  it('removeRecent has no sidecar ipc.on or ipc.handle (it is a native info channel)', () => {
    expect(findTsRegistrations(tsWalk.files, ['removeRecent'])).toEqual([])
  })

  it('no non-test backend file reads or writes the games.recent store key (SC4: no TS path writes it)', () => {
    const backend = tsWalk.files.filter((f) =>
      f.path.startsWith('src/backend/')
    )
    expect(findIdentifiers(backend, ['games.recent'])).toEqual([])
  })
})

/**
 * 86-11, SC4, D-13, D-18 and D-29 row 5: per-game overrides are Rust's. The TS module, its store
 * registration and its oracle are deleted; the golden fixtures stay for the Rust golden. The two
 * renderer read channels are native (86-10) and the write is one of four scheduled shims. The
 * `store/game-overrides` table row outlives the TS registration (it moved into EXTRA_ROWS), so the
 * Rust host keeps opening the user's file as user-state.
 */
const GAME_OVERRIDES: SliceSpec = {
  deleted: [
    'src/backend/game_overrides/index.ts',
    'src/backend/game_overrides/stores.ts',
    'src/backend/info/__tests__/oracle/gameOverrides.oracle.test.ts'
  ],
  kept: ['src-tauri/crates/gamelib-info/tests/fixtures/golden/overrides'],
  forbiddenIdentifiers: [
    'createGameOverridesStores',
    'GameOverridesDeps',
    'GameOverridesWriteDeps',
    'removeImagesMatching',
    'gameOverridesStore'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_GAME_OVERRIDES',
  storeRowKeys: ['store/game-overrides']
}

describe('gameOverridesPortComplete', () => {
  runSlice(GAME_OVERRIDES)

  it('getGameMetadataOverride and getAllGameOverrides have no sidecar ipc.on or ipc.handle (they are native info channels)', () => {
    expect(
      findTsRegistrations(tsWalk.files, [
        'getGameMetadataOverride',
        'getAllGameOverrides'
      ])
    ).toEqual([])
  })

  it('the store/game-overrides row keeps its user-state kind and the renderer name after the TS store went', () => {
    const row = storeTable.rows.find((r) => r.key === 'store/game-overrides')
    expect(row).toMatchObject({
      kind: 'user-state',
      tsNames: ['gameOverridesStore']
    })
  })
})

describe('infoPortComplete scans', () => {
  it('anti-vacuity: the walks read real trees', () => {
    assertAtOrAboveFloor(
      'infoPortComplete src and meta files',
      tsWalk.count,
      SCANNED_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'infoPortComplete src-tauri/src files',
      rustWalk.count,
      RUST_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'infoPortComplete src/backend files',
      tsWalk.files.filter((f) => f.path.startsWith('src/backend/')).length,
      BACKEND_FILES_FLOOR
    )
    assertAtOrAboveFloor(
      'infoPortComplete flag walk files',
      flagWalk.count,
      SCANNED_FILES_FLOOR
    )
  })

  const planted = (path: string, raw: string): StrippedFile => ({
    path,
    raw,
    code: raw
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !/^\s*\/\//.test(l))
      .join('\n')
  })

  it('self-test: a deleted identifier in code is caught, in a comment or as a longer word it is not', () => {
    const hits = findIdentifiers(
      [
        planted('x.ts', 'const s = createImageFetches()'),
        planted('y.ts', '// createImageFetches moved\nconst q = 1'),
        planted('z.ts', 'const mageFetchesOk = 1; const myImageFetchesX = 2')
      ],
      ['createImageFetches', 'ImageFetches']
    )
    expect(hits).toEqual(['x.ts: createImageFetches'])
  })

  it('self-test: a comment-stripped walk reports a planted identifier and ignores its comment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'info-port-complete-'))
    try {
      mkdirSync(join(dir, 'src', 'backend', '__tests__'), { recursive: true })
      writeFileSync(
        join(dir, 'src', 'backend', 'a.ts'),
        'export const a = initImagesCache()\n'
      )
      writeFileSync(
        join(dir, 'src', 'backend', 'b.ts'),
        '// initImagesCache was deleted\n/* getImageFromCache */\nexport const b = 1 // initImagesCache\n'
      )
      writeFileSync(
        join(dir, 'src', 'backend', '__tests__', 'c.ts'),
        'initImagesCache()\n'
      )
      writeFileSync(
        join(dir, 'src', 'backend', 'd.test.ts'),
        'initImagesCache()\n'
      )
      const walk = walkStripped(['src'], { base: dir })
      expect(walk.count).toBe(2)
      expect(
        findIdentifiers(walk.files, ['initImagesCache', 'getImageFromCache'])
      ).toEqual(['src/backend/a.ts: initImagesCache'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('self-test: a planted registration is caught on one line and across lines, a comment or sibling channel is not', () => {
    const files = [
      planted('one.ts', "deps.ipc.handle('listThings', f)"),
      planted('multi.ts', "ipc.on(\n  'listThings',\n  f\n)"),
      planted('note.ts', "// ipc.handle('listThings', f)\nconst a = 1"),
      planted('sibling.ts', "ipc.handle('listThingsMore', f)")
    ]
    expect(findTsRegistrations(files, ['listThings'])).toEqual([
      'one.ts: listThings',
      'multi.ts: listThings'
    ])
  })

  it('self-test: a planted rollback flag is caught even in a comment, a different flag is not', () => {
    const files = [
      planted('flag.ts', "const on = process.env['GAMELIB_X_SLICE']"),
      planted('doc.rs', '// GAMELIB_X_SLICE=0 falls back'),
      planted('other.ts', "process.env['GAMELIB_Y_SLICE']")
    ]
    expect(findRollbackFlag(files, 'GAMELIB_X_SLICE')).toEqual([
      'flag.ts',
      'doc.rs'
    ])
  })

  it('self-test: a planted RUST_INFO call is found with its constant and function, a comment or other constant is not', () => {
    const files = [
      planted(
        'a.ts',
        'export async function getThing(deps, id) {\n  return deps.requestRustInvoke(RUST_INFO_THING, [{ id }])\n}'
      ),
      planted('b.ts', '// requestRustInvoke(RUST_INFO_NOPE, [])\nconst x = 1'),
      planted('c.ts', 'requestRustInvoke(RUST_APP_EXIT, [])')
    ]
    expect(findRustInfoCalls(files)).toEqual([
      { path: 'a.ts', constant: 'RUST_INFO_THING', fn: 'getThing' }
    ])
  })

  it('self-test: the shim rule passes one typed call and names an extra statement (the full rule is in infoShimSchedule)', () => {
    const shim =
      'export async function f(deps, a) { return deps.requestRustInvoke(RUST_INFO_X, [{ a }]) }'
    const extra =
      'export async function f(deps, a) { log(a); return deps.requestRustInvoke(RUST_INFO_X, [{ a }]) }'
    expect(checkShimShape(shim, 'f', { shape: 'shim' })).toEqual([])
    expect(checkShimShape(extra, 'f', { shape: 'shim' })).toEqual([
      expect.stringContaining('extra statement before the call: log(a)')
    ])
  })

  it('self-test: assertDeleted fails on a file that exists and assertKept on one that does not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'info-port-complete-'))
    try {
      writeFileSync(join(dir, 'here.ts'), 'export {}\n')
      expect(() => assertDeleted(['here.ts'], dir)).toThrow(/here\.ts/)
      expect(() => assertDeleted(['gone.ts'], dir)).not.toThrow()
      expect(() => assertKept(['gone.ts'], dir)).toThrow(/gone\.ts/)
      expect(() => assertKept(['here.ts'], dir)).not.toThrow()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('self-test: a dropped store row is reported, a present one is not', () => {
    expect(missingStoreRows(['a/b', 'c/d'], ['a/b', 'e/f'])).toEqual(['e/f'])
    expect(missingStoreRows(['a/b'], ['a/b'])).toEqual([])
    expect(missingStoreRows(storeTableKeys, ['store/not-a-real-row'])).toEqual([
      'store/not-a-real-row'
    ])
  })

  it('self-test: an empty directory walks no files and fails the scan floor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'info-port-complete-'))
    try {
      const walk = walkStripped(['src', 'meta'], { base: dir })
      expect(walk.count).toBe(0)
      expect(() =>
        assertAtOrAboveFloor(
          'infoPortComplete src and meta files',
          walk.count,
          SCANNED_FILES_FLOOR
        )
      ).toThrow(/infoPortComplete src and meta files/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
