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
import * as ts from 'typescript'

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

/**
 * 86-13, SC4, D-13 and D-28: anti-cheat is Rust's. The TS slice and its oracle are deleted; the
 * golden and recorded fixtures stay for the Rust goldens (86-12). TS keeps the `releasesInfoReady`
 * listener (it owns the online wait until phase 88) and three scheduled shims in
 * `info/anticheat.ts`. `getAnticheatInfo` is a native `info` channel with no sidecar registration,
 * and no non-test TS file reads the data file itself any more: only the crate names it.
 */
const ANTICHEAT: SliceSpec = {
  deleted: [
    'src/backend/anticheat/utils.ts',
    'src/backend/info/__tests__/oracle/anticheat.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-info/tests/fixtures/golden/anticheat',
    'src-tauri/crates/gamelib-info/tests/fixtures/recorded/anticheat'
  ],
  forbiddenIdentifiers: ['downloadAntiCheatData', 'createMD5'],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_ANTICHEAT'
}

describe('anticheatPortComplete', () => {
  runSlice(ANTICHEAT)

  it('getAnticheatInfo has no sidecar ipc.on or ipc.handle (it is a native info channel)', () => {
    expect(findTsRegistrations(tsWalk.files, ['getAnticheatInfo'])).toEqual([])
  })

  it('no non-test TS file names areweanticheatyet.json (the crate owns the data file)', () => {
    expect(findIdentifiers(tsWalk.files, ['areweanticheatyet.json'])).toEqual(
      []
    )
  })
})

/**
 * 86-15 (SC4, D-13, D-17, D-19, D-26): SteamGridDB is Rust. The five `steamgriddb.*` renderer channels
 * are native `info` channels, the key owner and its one-time plaintext migration live in
 * `gamelib-info` (the migration runs at boot, bounded, from `info_dispatch::install`), and the TS
 * slice, its secret store and the oracle are deleted. The goldens and the recorded exchanges stay for
 * the Rust goldens (`golden_steamgrid`).
 */
const STEAMGRID: SliceSpec = {
  deleted: [
    'src/backend/steamgrid/utils.ts',
    'src/backend/steamgrid/secretStore.ts',
    'src/backend/steamgrid/secureKey.ts',
    'src/backend/sidecar/steamgridSecretStore.ts',
    'src/backend/sidecar/__tests__/steamgridSecretStore.test.ts',
    'src/backend/info/__tests__/oracle/steamgrid.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-info/tests/fixtures/golden/steamgrid',
    'src-tauri/crates/gamelib-info/tests/fixtures/recorded/steamgrid'
  ],
  forbiddenIdentifiers: [
    'SteamGridDbSecretStore',
    'SidecarSteamGridDbSecretStore',
    'SteamGridDbMigrationDeps',
    'createSteamGridDbSecrets',
    'startSidecarSteamGridDbSecretStore',
    'migrateSteamGridDbApiKey',
    'encryptApiKey',
    'decryptApiKey'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_STEAMGRID'
}

const STEAMGRID_CHANNELS = [
  'steamgriddb.getGrids',
  'steamgriddb.getHeroes',
  'steamgriddb.hasApiKey',
  'steamgriddb.searchGame',
  'steamgriddb.setApiKey'
]

/**
 * `steamGridSecrets` is gone from every owner and consumer. Three files still name an inert
 * `steamGridSecrets?: undefined` member, because `sidecar/handlers.ts` (a file another session had
 * uncommitted edits in when 86-15 ran) still passes it on. The exception is exactly those three paths
 * and can only shrink: delete the member, the handlers.ts line and the enrichment deps member, then
 * empty this list.
 */
const STEAMGRID_SECRETS_EXEMPT = [
  'src/backend/services/types.ts',
  'src/backend/sidecar/enrichmentFlowRegistration.ts',
  'src/backend/sidecar/handlers.ts'
]

describe('steamgridPortComplete', () => {
  runSlice(STEAMGRID)

  it('the five steamgriddb.* channels are native info channels', () => {
    const native = channelsOf('info').filter((c) =>
      c.startsWith('steamgriddb.')
    )
    expect([...native].sort()).toEqual(STEAMGRID_CHANNELS)
  })

  it.each(STEAMGRID_CHANNELS)(
    '%s has no sidecar ipc.on or ipc.handle',
    (channel) => {
      expect(findTsRegistrations(tsWalk.files, [channel])).toEqual([])
    }
  )

  it('no zod schema key survives for a steamgriddb.* channel (native.ts types them; the Rust decode owns the bounds)', () => {
    const hits = findIdentifiers(
      tsWalk.files.filter(
        (f) =>
          f.path.startsWith('src/common/') && !f.path.endsWith('/native.ts')
      ),
      STEAMGRID_CHANNELS.map((c) => `'${c}'`)
    )
    expect(hits).toEqual([])
  })

  it('steamGridSecrets is named only in the three files that still carry the inert member', () => {
    const hits = findIdentifiers(
      tsWalk.files.filter((f) => f.path.startsWith('src/backend/')),
      ['steamGridSecrets']
    ).map((h) => h.slice(0, h.indexOf(': ')))
    expect(hits.filter((p) => !STEAMGRID_SECRETS_EXEMPT.includes(p))).toEqual(
      []
    )
  })

  it("the dev vault's TS slot set no longer holds steamGridDbApiKey (Rust owns that slot)", () => {
    const vault = tsWalk.files.find(
      (f) => f.path === 'src/backend/sidecar/devSecretVault.ts'
    )
    expect(vault).toBeDefined()
    expect(vault?.code).not.toContain('steamGridDbApiKey')
  })

  it('the migration is wired in Rust at boot and the TS one is gone', () => {
    const shell = rustWalk.files.find(
      (f) => f.path === 'src-tauri/src/info_dispatch.rs'
    )
    expect(shell?.code).toContain('spawn_sgdb_migration')
    expect(findIdentifiers(tsWalk.files, ['migrateSteamGridDbApiKey'])).toEqual(
      []
    )
  })
})

/**
 * 86-17 (SC4, D-12, D-13, D-18, D-19, D-25, D-26, D-29 row 5): the ITAD store search is Rust. The five
 * renderer channels are native `info` channels (86-16), the key owner lives in `gamelib-info`, and the TS
 * slice (`src/backend/storeSearch`), its secret store, the `itadGate` slot of `miscRuntime`, the
 * `storeSearch` store family, the 'itad-secrets' boot step, the dev vault's `itadApiKey` slot, the
 * sidecar's `__ITAD_API_KEY__` define and the oracle test are deleted. The two cache rows move into
 * `genStoreTable` EXTRA_ROWS, the goldens and recorded exchanges stay for `golden_storeSearch`, and the
 * measured ITAD response samples moved under the gamelib-info fixtures. The priced-country list is one
 * file both sides read (`src/common/itadCoverage.json`).
 */
const STORE_SEARCH: SliceSpec = {
  deleted: [
    'src/backend/storeSearch/itad.ts',
    'src/backend/storeSearch/itadCache.ts',
    'src/backend/storeSearch/itadCoverage.ts',
    'src/backend/storeSearch/itadKey.ts',
    'src/backend/storeSearch/itadSecrets.ts',
    'src/backend/storeSearch/handlers.ts',
    'src/backend/storeSearch/stores.ts',
    'src/backend/storeSearch',
    'src/backend/sidecar/itadSecretStore.ts',
    'src/backend/info/__tests__/oracle/storeSearch.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-info/tests/fixtures/golden/storeSearch',
    'src-tauri/crates/gamelib-info/tests/fixtures/recorded/storeSearch',
    'src-tauri/crates/gamelib-info/tests/fixtures/state/storeSearch/itad-samples',
    'src/common/itadCoverage.json'
  ],
  forbiddenIdentifiers: [
    'ItadSecrets',
    'createItadGate',
    'handleSearchStores',
    'searchGames',
    'createStoreSearchStores'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_STORE_SEARCH',
  storeRowKeys: ['store_cache/itad_prices', 'store_cache/itad_steam_gids']
}

const STORE_SEARCH_CHANNELS = [
  'searchStores',
  'getStoreSearchDeals',
  'getItadSteamGids',
  'itad.getKeyStatus',
  'itad.setApiKey'
]

/**
 * `itadSecrets` is gone from every owner and consumer. Three files still name an inert
 * `itadSecrets?: undefined` member, because `sidecar/handlers.ts` (a file another session had uncommitted
 * edits in when 86-17 ran) still passes it on. The exception is exactly those three paths and can only
 * shrink: delete the member, the handlers.ts line and the enrichment deps member, then empty this list
 * (together with `STEAMGRID_SECRETS_EXEMPT`; OWED once handlers.ts is clean).
 */
const ITAD_SECRETS_EXEMPT = [
  'src/backend/services/types.ts',
  'src/backend/sidecar/enrichmentFlowRegistration.ts',
  'src/backend/sidecar/handlers.ts'
]

describe('storeSearchPortComplete', () => {
  runSlice(STORE_SEARCH)

  it('the five ITAD channels are native info channels', () => {
    const native = new Set(channelsOf('info'))
    expect(STORE_SEARCH_CHANNELS.filter((c) => !native.has(c))).toEqual([])
  })

  it.each(STORE_SEARCH_CHANNELS)(
    '%s has no sidecar ipc.on or ipc.handle',
    (channel) => {
      expect(findTsRegistrations(tsWalk.files, [channel])).toEqual([])
    }
  )

  it('the sidecar bundle names no __ITAD_API_KEY__ define (the key is baked into the shell build only, D-25)', () => {
    expect(findIdentifiers(tsWalk.files, ['__ITAD_API_KEY__'])).toEqual([])
  })

  it('itadSecrets is named only in the three files that still carry the inert member', () => {
    const hits = findIdentifiers(
      tsWalk.files.filter((f) => f.path.startsWith('src/backend/')),
      ['itadSecrets']
    ).map((h) => h.slice(0, h.indexOf(': ')))
    expect(hits.filter((p) => !ITAD_SECRETS_EXEMPT.includes(p))).toEqual([])
  })

  it("the dev vault's TS slot set no longer holds itadApiKey (Rust owns that slot)", () => {
    const vault = tsWalk.files.find(
      (f) => f.path === 'src/backend/sidecar/devSecretVault.ts'
    )
    expect(vault).toBeDefined()
    expect(vault?.code).not.toContain('itadApiKey')
  })

  it('the two cache rows keep their cache kind and renderer names after the TS stores went (EXTRA_ROWS)', () => {
    for (const name of ['itad_prices', 'itad_steam_gids']) {
      const row = storeTable.rows.find((r) => r.key === `store_cache/${name}`)
      expect(row).toMatchObject({ kind: 'cache', tsNames: [name] })
    }
    const generator = tsWalk.files.find(
      (f) => f.path === 'meta/genStoreTable.ts'
    )
    expect(generator?.code).toContain('itad_steam_gids')
  })

  it('the Rust shell reads the shared coverage file (one source for both sides)', () => {
    const coverage = readFileSync(
      join(
        REPO_ROOT,
        'src-tauri',
        'crates',
        'gamelib-info',
        'src',
        'itad',
        'coverage.rs'
      ),
      'utf8'
    )
    expect(coverage).toContain('itadCoverage.json')
  })
})

/**
 * 86-18 (SC4, D-13, D-24): GOG discounts are Rust. The catalog fetch, paging, dedupe, fallback and the
 * request shape are `gamelib-info` `discounts`; the TS fetcher and its oracle are deleted, and the
 * goldens and recordings stay for `golden_discounts`. `getGogDiscounts` keeps its sidecar registration
 * as a resolver (D-24: the GOG access token needs the `gogdl` child process, which stays TS until phase
 * 92), so there is no native-channel check here: the registration is allowed, but it may hold nothing
 * beyond the one call to the resolver. The humble badge tests under `src/backend/discounts/__tests__`
 * test code in `common/` and stay.
 */
const DISCOUNTS: SliceSpec = {
  deleted: [
    'src/backend/discounts/fetchDiscounts.ts',
    'src/backend/info/__tests__/oracle/discounts.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-info/tests/fixtures/golden/discounts',
    'src-tauri/crates/gamelib-info/tests/fixtures/recorded/discounts',
    'src/backend/discounts/__tests__/badges.test.ts',
    'src/backend/discounts/__tests__/storeSearchBadges.test.ts'
  ],
  forbiddenIdentifiers: ['fetchAllDiscounts', 'buildUrl', 'CATALOG_URL'],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_DISCOUNTS'
}

/**
 * Why the `getGogDiscounts` registration in `source` is not exactly a forward to the resolver, or an
 * empty list when it is: `deps.ipc.handle('getGogDiscounts', <arrow>)` whose body is one expression, a
 * call of `getGogDiscounts` (no block, no statements, no other call around it).
 */
function discountsRegistrationProblems(source: string): string[] {
  const sf = ts.createSourceFile(
    'registration.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  )
  const found: ts.CallExpression[] = []
  const visit = (node: ts.Node): void => {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(sf) === 'deps.ipc.handle' &&
      node.arguments[0] !== undefined &&
      ts.isStringLiteralLike(node.arguments[0]) &&
      node.arguments[0].text === 'getGogDiscounts'
    ) {
      found.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const [registration] = found
  if (found.length !== 1 || !registration) {
    return [`expected one getGogDiscounts registration, found ${found.length}`]
  }
  const handler = registration.arguments[1]
  if (!handler || !ts.isArrowFunction(handler)) {
    return ['the handler is not an arrow function']
  }
  if (ts.isBlock(handler.body)) {
    return ['the handler has a block body, not one forwarded call']
  }
  let body: ts.Expression = handler.body
  while (ts.isParenthesizedExpression(body) || ts.isAwaitExpression(body)) {
    body = body.expression
  }
  if (
    !ts.isCallExpression(body) ||
    body.expression.getText(sf) !== 'getGogDiscounts'
  ) {
    return [
      `the handler body is not a call of getGogDiscounts: ${body.getText(sf).slice(0, 60)}`
    ]
  }
  // Nothing inside the forwarded arguments may be another call (a fetch, a log, a lookup).
  const inner: string[] = []
  const walkArgs = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) inner.push(node.getText(sf).slice(0, 40))
    ts.forEachChild(node, walkArgs)
  }
  for (const arg of body.arguments) walkArgs(arg)
  return inner.map((c) => `the forwarded arguments hold a call: ${c}`)
}

describe('discountsPortComplete', () => {
  runSlice(DISCOUNTS)

  it('no non-test TS file names the catalog host (the crate owns the request)', () => {
    expect(findIdentifiers(tsWalk.files, ['catalog.gog.com'])).toEqual([])
  })

  it('the getGogDiscounts registration holds only the forward to the resolver', () => {
    const registration = tsWalk.files.find(
      (f) => f.path === 'src/backend/sidecar/enrichmentFlowRegistration.ts'
    )
    expect(registration).toBeDefined()
    expect(discountsRegistrationProblems(registration?.raw ?? '')).toEqual([])
  })

  it('the resolver is the one place that names the discounts channel, and it imports no HTTP client', () => {
    const resolver = tsWalk.files.find(
      (f) => f.path === 'src/backend/info/discounts.ts'
    )
    expect(resolver).toBeDefined()
    expect(resolver?.code).toContain('RUST_INFO_GOG_DISCOUNTS')
    expect(resolver?.code).not.toMatch(/axios|fetch\(|URLSearchParams/)
    expect(
      findRustInfoCalls(tsWalk.files).filter(
        (c) => c.constant === 'RUST_INFO_GOG_DISCOUNTS'
      )
    ).toEqual([
      {
        path: 'src/backend/info/discounts.ts',
        constant: 'RUST_INFO_GOG_DISCOUNTS',
        fn: 'getGogDiscounts'
      }
    ])
  })

  it('the resolver keeps the D-24 shape: const token, then one typed call', () => {
    const raw = readFileSync(
      join(REPO_ROOT, 'src/backend/info/discounts.ts'),
      'utf8'
    )
    expect(
      checkShimShape(raw, 'getGogDiscounts', {
        shape: 'resolver',
        inputs: ['token']
      })
    ).toEqual([])
  })

  it('self-test: the registration check passes a plain forward and names a block, an extra call and a missing registration', () => {
    const plain =
      "deps.ipc.handle('getGogDiscounts', async (_e, ...args) => getGogDiscounts({ a: deps.a }, args[0], args[1]))"
    const block =
      "deps.ipc.handle('getGogDiscounts', async () => { const x = await axios.get(u); return x })"
    const extra =
      "deps.ipc.handle('getGogDiscounts', async () => getGogDiscounts(deps, fetchPage(1)))"
    const wrong =
      "deps.ipc.handle('getGogDiscounts', async () => somethingElse(deps))"
    expect(discountsRegistrationProblems(plain)).toEqual([])
    expect(discountsRegistrationProblems(block)).toEqual([
      expect.stringContaining('block body')
    ])
    expect(discountsRegistrationProblems(extra)).toEqual([
      expect.stringContaining('hold a call: fetchPage(1)')
    ])
    expect(discountsRegistrationProblems(wrong)).toEqual([
      expect.stringContaining('not a call of getGogDiscounts')
    ])
    expect(discountsRegistrationProblems('const a = 1')).toEqual([
      expect.stringContaining('found 0')
    ])
  })

  it('self-test: a planted fetcher in the resolver text is caught', () => {
    expect(
      findIdentifiers(
        [
          {
            path: 'x.ts',
            raw: '',
            code: "const u = 'https://catalog.gog.com/v1/catalog'"
          }
        ],
        ['fetchAllDiscounts', 'buildUrl', 'CATALOG_URL']
      )
    ).toEqual([])
    expect(
      findIdentifiers(
        [{ path: 'x.ts', raw: '', code: 'const u = buildUrl(1)' }],
        ['buildUrl']
      )
    ).toEqual(['x.ts: buildUrl'])
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
