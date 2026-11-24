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
import type { SliceSpec } from 'backend/testUtils/portSliceGate'
import {
  BACKEND_FILES_FLOOR,
  channelsOf,
  flagWalk,
  missingStoreRows,
  runSlice,
  rustWalk,
  RUST_FILES_FLOOR,
  SCANNED_FILES_FLOOR,
  storeTable,
  storeTableKeys,
  tsWalk
} from 'backend/testUtils/portSliceGate'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as ts from 'typescript'

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
 * Why the `channel` registration in `source` is not exactly a forward to `resolver`, or an empty list
 * when it is: `deps.ipc.handle('<channel>', <arrow>)` whose body is one expression, a call of
 * `<resolver>` (no block, no statements, no other call around it). Used for the two D-24 resolvers
 * that keep a sidecar registration: `getGogDiscounts` and `getCrossoverIndex`.
 */
function forwardRegistrationProblems(
  source: string,
  channel: string,
  resolver: string
): string[] {
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
      node.arguments[0].text === channel
    ) {
      found.push(node)
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  const [registration] = found
  if (found.length !== 1 || !registration) {
    return [`expected one ${channel} registration, found ${found.length}`]
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
  if (!ts.isCallExpression(body) || body.expression.getText(sf) !== resolver) {
    return [
      `the handler body is not a call of ${resolver}: ${body.getText(sf).slice(0, 60)}`
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

const discountsRegistrationProblems = (source: string): string[] =>
  forwardRegistrationProblems(source, 'getGogDiscounts', 'getGogDiscounts')

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

/**
 * `infoCaches` and `appRuntime` were dependencies of the TS wiki and CrossOver index slices, which 86-24
 * deleted. Two registrations still declare them as inert `?: unknown` members, because
 * `sidecar/handlers.ts` (a file another session had uncommitted edits in when 86-24 ran) still passes
 * both to them. This list is exactly the files that hold such a member and can only shrink: delete the
 * member, the handlers.ts line, then the entry. OWED once handlers.ts is clean.
 */
// Phase 94 Plan 22 deleted `sidecar/shortcutsFlowRegistration.ts` (and with it its inert `infoCaches` and `appRuntime`
// members and the handlers.ts lines that passed them), so only one file is left.
const INERT_DEPS_EXEMPT = ['src/backend/sidecar/enrichmentFlowRegistration.ts']

/**
 * 86-24 (SC4, D-13, D-18 and D-29 row 5): the wiki game info slice, umu included, is Rust. The CodeWeavers,
 * PCGamingWiki, AppleGamingWiki, GamesDB, ProtonDB, Steam Deck, HowLongToBeat and umu lookups and the
 * `wikigameinfo` cache are `gamelib-info` `wiki`; the TS module, its HLTB credentials and its store family
 * are deleted. The three callers that remain (the non-Steam shortcut, the GOG/Epic/Amazon launch GAMEID and
 * the sign-out clear) are the scheduled shims and resolver in `info/wiki.ts` (infoShimSchedule). The goldens,
 * recordings and starting profiles stay for the Rust golden tests.
 */
const WIKI: SliceSpec = {
  deleted: [
    'src/backend/wiki_game_info',
    'src/backend/wiki_game_info/wiki_game_info.ts',
    'src/backend/wiki_game_info/stores.ts',
    'src/backend/wiki_game_info/umu/utils.ts',
    'src/backend/wiki_game_info/howlongtobeat/utils.ts',
    'src/backend/wiki_game_info/howlongtobeat/titleMatch.ts',
    'src/backend/wiki_game_info/pcgamingwiki/utils.ts',
    'src/backend/wiki_game_info/applegamingwiki/utils.ts',
    'src/backend/wiki_game_info/codeweavers/utils.ts',
    'src/backend/wiki_game_info/gamesdb/utils.ts',
    'src/backend/wiki_game_info/protondb/utils.ts',
    'src/backend/wiki_game_info/steamdeck/utils.ts',
    'src/backend/info/__tests__/oracle/wiki.oracle.test.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-info/tests/fixtures/golden/wiki',
    'src-tauri/crates/gamelib-info/tests/fixtures/recorded/wiki',
    'src-tauri/crates/gamelib-info/tests/fixtures/state/wiki',
    'src/backend/info/wiki.ts'
  ],
  forbiddenIdentifiers: [
    'createWikiGameInfoStores',
    'WikiGameInfoDeps',
    'getInfoFromPCGamingWiki',
    'getInfoFromAppleGamingWiki',
    'getInfoFromGamesDB',
    'getInfoFromProtonDB',
    'getSteamDeckComp',
    'getHowLongToBeat',
    'createHltbCredentials',
    'HltbCredentials',
    'pickBestMatch',
    'umuStore'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_WIKI',
  storeRowKeys: ['store_cache/wikigameinfo', 'store_cache/umu']
}

/** Whether `code` constructs a `CacheStore` over the store called `name`. */
const constructsCacheStore = (code: string, name: string): boolean =>
  new RegExp(`new\\s+CacheStore\\s*(<[^(]*>)?\\(\\s*'${name}'`).test(code)

describe('wikiPortComplete', () => {
  runSlice(WIKI)

  it('self-test: a planted CacheStore construction is caught, a different store or a comment is not', () => {
    expect(
      constructsCacheStore("const c = new CacheStore<string>('umu', 60)", 'umu')
    ).toBe(true)
    expect(
      constructsCacheStore(
        "new CacheStore('wikigameinfo', null)",
        'wikigameinfo'
      )
    ).toBe(true)
    expect(constructsCacheStore("new CacheStore('umu_other', 1)", 'umu')).toBe(
      false
    )
    expect(constructsCacheStore("registry.get('umu')", 'umu')).toBe(false)
  })

  it('getWikiGameInfo is a native info channel with no sidecar ipc.on or ipc.handle', () => {
    expect(channelsOf('info')).toContain('getWikiGameInfo')
    expect(findTsRegistrations(tsWalk.files, ['getWikiGameInfo'])).toEqual([])
  })

  it('the three wiki families are gone from the TS store layer: no wikiGameInfo family, no wikigameinfo or umu store constructed', () => {
    expect(
      findIdentifiers(
        tsWalk.files.filter((f) => f.path.startsWith('src/backend/')),
        ['wikiGameInfo']
      )
    ).toEqual([])
    for (const name of ['wikigameinfo', 'umu']) {
      const constructed = tsWalk.files.filter(
        (f) =>
          f.path.startsWith('src/backend/') &&
          constructsCacheStore(f.code, name)
      )
      expect(constructed.map((f) => f.path)).toEqual([])
    }
  })

  it('the wiki cache rows keep their cache kind and renderer names after the TS stores went (EXTRA_ROWS)', () => {
    for (const name of ['wikigameinfo', 'umu']) {
      const row = storeTable.rows.find((r) => r.key === `store_cache/${name}`)
      expect(row).toMatchObject({ kind: 'cache', tsNames: [name] })
    }
    const generator = tsWalk.files.find(
      (f) => f.path === 'meta/genStoreTable.ts'
    )
    expect(generator?.code).toContain("'wikigameinfo'")
    expect(generator?.code).toContain("'umu'")
  })

  // Phase 94 plan 24: the `getWikiGameInfo` resolver (RUST_INFO_WIKI_GET) is deleted; the Rust shortcuts crate reaches the
  // wiki lookup in-process through the shell's `WikiLookup`, so only the two shims remain.
  it('info/wiki.ts holds the two shims and reaches Rust only through the umu and wiki-cache constants', () => {
    const calls = findRustInfoCalls(tsWalk.files).filter((c) =>
      c.path.endsWith('src/backend/info/wiki.ts')
    )
    expect(calls.map((c) => c.constant).sort()).toEqual([
      'RUST_INFO_UMU_GET',
      'RUST_INFO_WIKI_CACHE_CLEAR'
    ])
    const wiki = tsWalk.files.find((f) => f.path === 'src/backend/info/wiki.ts')
    expect(wiki?.code).not.toMatch(/axios|fetch\(|URLSearchParams/)
  })

  it('the inert infoCaches and appRuntime members live only in the exempt registrations', () => {
    const files = tsWalk.files
      .filter((f) => /\b(infoCaches|appRuntime)\?: unknown/.test(f.code))
      .map((f) => f.path)
      .sort()
    expect(files).toEqual([...INERT_DEPS_EXEMPT].sort())
  })
})

/**
 * 86-24 (SC4, D-13, D-18, D-24): the CrossOver index is Rust. The index fetch, schema, cache, back-off, the
 * bundled snapshot, the title normalisation and the rating map are `gamelib-info` `crossover`; the TS module,
 * its fetcher, its store family and the `crossoverIndex` app-runtime slots are deleted, and the goldens stay.
 * `getCrossoverIndex` keeps its sidecar registration as a resolver (D-24: the games come from the library
 * managers' in-memory lists, which stay TS until the library managers port): the registration is allowed,
 * but it may hold nothing beyond the one call to the resolver in `info/crossover.ts`.
 * `meta/measureCrossoverMatching.ts`, a Phase 19 one-off measurement harness, is deleted because its only
 * import target (`crossover_index/normalize`) is gone; its result is recorded in Phase 19.
 */
const CROSSOVER: SliceSpec = {
  deleted: [
    'src/backend/crossover_index',
    'src/backend/crossover_index/index.ts',
    'src/backend/crossover_index/fetcher.ts',
    'src/backend/crossover_index/crossoverRatingMap.ts',
    'src/backend/crossover_index/normalize.ts',
    'src/backend/crossover_index/schema.ts',
    'src/backend/crossover_index/stores.ts',
    'src/backend/info/__tests__/oracle/crossover.oracle.test.ts',
    'meta/measureCrossoverMatching.ts'
  ],
  kept: [
    'src-tauri/crates/gamelib-info/tests/fixtures/golden/crossover',
    'src-tauri/crates/gamelib-info/tests/fixtures/recorded/crossover',
    'src-tauri/crates/gamelib-info/tests/fixtures/state/crossover',
    'src/backend/info/crossover.ts'
  ],
  forbiddenIdentifiers: [
    'createCrossoverIndex',
    'createCrossoverIndexFetcher',
    'createCrossoverIndexStores',
    'buildCrossoverRatingMap',
    'crossoverIndexDescriptor',
    'isCrossoverIndexEligible',
    'CrossoverIndexLookups',
    'NAME_MATCHING_SHIPS',
    'crossoverFetcher'
  ],
  identifierRoot: 'src/backend',
  flag: 'GAMELIB_CROSSOVER',
  storeRowKeys: ['store_cache/crossover_index']
}

describe('crossoverPortComplete', () => {
  runSlice(CROSSOVER)

  it('the rating map and lookups are Rust: getCrossoverIndex is not a native channel and keeps exactly one TS registration', () => {
    expect(channelsOf('info')).not.toContain('getCrossoverIndex')
    expect(findTsRegistrations(tsWalk.files, ['getCrossoverIndex'])).toEqual([
      'src/backend/sidecar/enrichmentFlowRegistration.ts: getCrossoverIndex'
    ])
  })

  it('the getCrossoverIndex registration holds only the forward to the resolver', () => {
    const registration = tsWalk.files.find(
      (f) => f.path === 'src/backend/sidecar/enrichmentFlowRegistration.ts'
    )
    expect(registration).toBeDefined()
    expect(
      forwardRegistrationProblems(
        registration?.raw ?? '',
        'getCrossoverIndex',
        'getCrossoverIndex'
      )
    ).toEqual([])
  })

  it('the resolver is the one place that names the rating-map channel, with the D-24 shape and no HTTP client', () => {
    const resolver = tsWalk.files.find(
      (f) => f.path === 'src/backend/info/crossover.ts'
    )
    expect(resolver).toBeDefined()
    expect(resolver?.code).not.toMatch(/axios|fetch\(|URLSearchParams/)
    expect(
      findRustInfoCalls(tsWalk.files).filter(
        (c) => c.constant === 'RUST_INFO_CROSSOVER_RATING_MAP'
      )
    ).toEqual([
      {
        path: 'src/backend/info/crossover.ts',
        constant: 'RUST_INFO_CROSSOVER_RATING_MAP',
        fn: 'getCrossoverIndex'
      }
    ])
    expect(
      checkShimShape(
        readFileSync(join(REPO_ROOT, 'src/backend/info/crossover.ts'), 'utf8'),
        'getCrossoverIndex',
        { shape: 'resolver', inputs: ['games'] }
      )
    ).toEqual([])
  })

  it('the AppRuntime carries no crossover member and the store table keeps the cache row', () => {
    const runtime = tsWalk.files.find(
      (f) => f.path === 'src/backend/appRuntime.ts'
    )
    expect(runtime).toBeDefined()
    expect(runtime?.code).not.toMatch(/crossover/i)
    const row = storeTable.rows.find(
      (r) => r.key === 'store_cache/crossover_index'
    )
    expect(row).toMatchObject({ kind: 'cache', tsNames: ['crossover_index'] })
    const generator = tsWalk.files.find(
      (f) => f.path === 'meta/genStoreTable.ts'
    )
    expect(generator?.code).toContain("'crossover_index'")
  })

  it('self-test: the registration check passes a plain forward for this channel and names a block or a wrong callee', () => {
    const plain =
      "deps.ipc.handle('getCrossoverIndex', async () => getCrossoverIndex({ a: deps.a }))"
    const block =
      "deps.ipc.handle('getCrossoverIndex', async () => { await load(); return 1 })"
    const wrong =
      "deps.ipc.handle('getCrossoverIndex', async () => buildCrossoverRatingMap(deps))"
    const check = (src: string): string[] =>
      forwardRegistrationProblems(src, 'getCrossoverIndex', 'getCrossoverIndex')
    expect(check(plain)).toEqual([])
    expect(check(block)).toEqual([expect.stringContaining('block body')])
    expect(check(wrong)).toEqual([
      expect.stringContaining('not a call of getCrossoverIndex')
    ])
  })
})

/**
 * 86-24 (D-11): every slice's oracle test is deleted, so the oracle harness and recorder go with the last
 * one. The goldens, recordings and starting profiles are the Rust tests' input and stay, each slice with
 * its MANIFEST.json; `fixtureRedaction.test.ts` imports no slice and keeps guarding what the recordings hold.
 */
const ORACLE_SLICES_WITH_GOLDEN = [
  'anticheat',
  'crossover',
  'discounts',
  'overrides',
  'recent',
  'steamgrid',
  'storeSearch',
  'wiki'
]

describe('oraclePortComplete', () => {
  it('the TS oracle directory (tests, recorder and harness) does not exist', () => {
    expect(() =>
      assertDeleted(['src/backend/info/__tests__/oracle'])
    ).not.toThrow()
  })

  it.each(ORACLE_SLICES_WITH_GOLDEN)(
    'the %s golden MANIFEST.json survives for the Rust golden test',
    (slice) => {
      expect(() =>
        assertKept([
          `src-tauri/crates/gamelib-info/tests/fixtures/golden/${slice}/MANIFEST.json`
        ])
      ).not.toThrow()
    }
  )

  it('fixtureRedaction.test.ts is kept (it imports no slice)', () => {
    expect(() =>
      assertKept(['src/backend/info/__tests__/fixtureRedaction.test.ts'])
    ).not.toThrow()
  })

  it('no non-test file names the oracle recorder or harness', () => {
    expect(
      findIdentifiers(tsWalk.files, [
        'GAMELIB_WRITE_INFO_GOLDEN',
        'oracleMode',
        'recordedCaseDir'
      ])
    ).toEqual([])
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
