/**
 * The Humble adapter oracle (94-08 Task 1, D-05, Pitfall 5): every request the adapter makes,
 * recorded on the wire from the TypeScript against synthetic responses built by `flight.ts`.
 *
 * Each wire case runs on a fresh `createFakeHomeProfile()`, starts the wire recorder in its
 * synthetic mode, points the adapter at it with `pointHumbleAt` (a property replacement, undone in a
 * `finally`, never a module mock) and calls the adapter export the library calls. The golden is
 * `{fn, input, requests, result, actionIds}`:
 *   - `requests` are the requests as they arrived on the socket, in wire order (the recorder's
 *     redacted, normalised form): method, target, headers in arrival order, the multipart fields of
 *     a library page POST in order (`_1_*` first, field `0` last) and the `text/plain;charset=UTF-8`
 *     body of a reveal. The same list is `recorded/adapter/<case>/exchanges.json`, which the Rust
 *     replay (94-23) reads.
 *   - `result` is what the adapter returned, or `{threw}` for the transient class it throws.
 *   - `actionIds` is the action-id owner after the call (the `{id, chunk}` slots).
 * The pure `libraryItemToOrderDetail` mapping is goldened beside them as `{fn, input, output}`.
 *
 * Pitfall 5: a 302 or 307 to auth.humblebundle.com is the expired-session signal. It is never
 * followed, so the case's request list ends at it.
 *
 * Key values in a synthetic response are the literal `REDACTED` (the recorder writes that anyway;
 * a different value would make a replay see something the golden never did). Gamekeys are
 * `fake-gamekey-NNNN`. No real key, cookie or token is ever typed here.
 *
 * `GAMELIB_WRITE_HUMBLE_GOLDEN=1` writes the goldens and recordings; the default compares and
 * replays offline.
 */
import {
  getLibraryOrders,
  getSessionStatus,
  libraryItemToOrderDetail,
  revealKey as adapterRevealKey
} from '../../adapter'
import {
  createHumbleActionIdCache,
  type HumbleActionIdCache,
  type HumbleActionIdEntry
} from '../../actionIdCache'
import {
  assertManifest,
  expectEmptyCasesToFail,
  syncManifest,
  withHumbleOracleProfile,
  withWireRecorder,
  writeOrCompareGolden
} from 'backend/testUtils/humbleOracle/harness'
import type { SyntheticResponse } from 'backend/testUtils/humbleOracle/wireRecorder'
import {
  CHUNK_PATHS,
  FAKE_COOKIE,
  FAKE_KEY_VALUE,
  LIBRARY_ACTION_ID,
  LIBRARY_PATH,
  REDEEM_ACTION_ID,
  REPLACEMENT_ACTION_ID,
  compressAdapterGaps,
  discoveryResponses,
  fullLibraryResponses,
  getAnswer,
  libraryFlightPage,
  libraryPageResponses,
  postAnswer,
  redeemAnswer,
  redeemDiscoveryResponses,
  redeemFlight,
  type FlightItem
} from './flight'

const SLICE = 'adapter'
const ADAPTER_FLOOR = 60

const GAMEKEY = 'fake-gamekey-0001'
const KEY_ID = 'fake_game_one_steam'

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

const itemN = (n: number): FlightItem => ({
  id: `fake-gamekey-${String(n).padStart(4, '0')}`,
  title: `Fake Bundle ${n}`,
  keys: [{ id: `fake_game_${n}_steam`, title: `Fake Game ${n}` }]
})
const items = (count: number): FlightItem[] =>
  Array.from({ length: count }, (_, i) => itemN(i + 1))

/** The pages' own POST target for page `n`. */
const pageTarget = (n: number): string =>
  n > 1 ? `${LIBRARY_PATH}?page=${n}` : LIBRARY_PATH

const primed = (
  chunkIndex: number,
  id = LIBRARY_ACTION_ID
): HumbleActionIdEntry => ({ id, chunk: CHUNK_PATHS[chunkIndex] as string })

const MIXED_ITEMS: FlightItem[] = [
  {
    id: 'fake-gamekey-0101',
    title: 'Fake Mixed Bundle',
    keys: [
      { id: 'fake_unrevealed_steam', title: 'Fake Unrevealed' },
      {
        id: 'fake_revealed_steam',
        title: 'Fake Revealed',
        gameKey: null,
        redeemedAt: '2026-01-01T00:00:00.000Z',
        keyFormatted: FAKE_KEY_VALUE
      },
      {
        id: 'fake_expired_gog',
        title: 'Fake Expired',
        keyIntegrationId: 'gog',
        expired: true,
        redemptionExpiryDate: '$D2026-02-03T00:00:00.000Z'
      },
      {
        id: 'fake_direct_epic',
        title: 'Fake Direct',
        keyIntegrationId: 'epic_keyless',
        directRedeem: true
      }
    ]
  },
  {
    id: 'fake-gamekey-0102',
    title: 'Fake Group',
    itemType: 'entitlement-group',
    keys: []
  },
  { id: 'fake-gamekey-0103', title: 'Fake Downloads Only', keys: [] }
]

// ---------------------------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------------------------

interface WireCase {
  id: string
  fn: string
  input: Record<string, unknown>
  synthetic: SyntheticResponse[]
  prime?: { library?: HumbleActionIdEntry; redeem?: HumbleActionIdEntry }
  run: (ids: HumbleActionIdCache) => Promise<unknown>
}

const wireCases: WireCase[] = []

function sessionCase(
  id: string,
  cookie: string,
  answer: SyntheticResponse
): void {
  wireCases.push({
    id,
    fn: 'getSessionStatus',
    input: { cookie },
    synthetic: [answer],
    run: () => getSessionStatus(cookie)
  })
}

const sessionPath = '/api/auth/session-status'
const json = (status: number, body: unknown): SyntheticResponse =>
  getAnswer(sessionPath, status, JSON.stringify(body), 'application/json')

sessionCase(
  'session-status-authenticated-bare-cookie',
  'REDACTED',
  json(200, { status: 'authenticated' })
)
sessionCase(
  'session-status-authenticated-ory-cookie',
  FAKE_COOKIE,
  json(200, { status: 'authenticated' })
)
sessionCase(
  'session-status-anonymous',
  FAKE_COOKIE,
  json(200, { status: 'anonymous' })
)
sessionCase(
  'session-status-unrecognised-body',
  FAKE_COOKIE,
  json(200, { status: 'second-factor-pending' })
)
sessionCase('session-status-null-body', FAKE_COOKIE, json(200, null))
sessionCase(
  'session-status-redirect-to-auth-host-not-followed',
  FAKE_COOKIE,
  getAnswer(sessionPath, 302, '', 'text/html', [
    ['location', 'https://auth.humblebundle.com/login?flow=fake-flow']
  ])
)
sessionCase(
  'session-status-401',
  FAKE_COOKIE,
  json(401, { status: 'anonymous' })
)
sessionCase('session-status-500', FAKE_COOKIE, json(500, {}))

function libraryCase(
  id: string,
  synthetic: SyntheticResponse[],
  extra: {
    prime?: WireCase['prime']
    cookie?: string
    input?: Record<string, unknown>
  } = {}
): void {
  wireCases.push({
    id,
    fn: 'getLibraryOrders',
    input: {
      cookie: extra.cookie ?? FAKE_COOKIE,
      primedLibraryAction: extra.prime?.library ?? null,
      ...extra.input
    },
    synthetic,
    prime: extra.prime,
    run: (ids) => getLibraryOrders(extra.cookie ?? FAKE_COOKIE, ids)
  })
}

const libraryDiscovery = (
  options: Partial<Parameters<typeof discoveryResponses>[0]> = {}
): SyntheticResponse[] =>
  discoveryResponses({
    pagePath: LIBRARY_PATH,
    actionId: LIBRARY_ACTION_ID,
    actionName: 'filterUserLibrary',
    ...options
  })

libraryCase('library-one-page', fullLibraryResponses(items(2)))
libraryCase('library-bare-cookie', fullLibraryResponses(items(1)), {
  cookie: 'REDACTED'
})
libraryCase('library-empty', fullLibraryResponses([]))
libraryCase(
  'library-three-pages-threads-prev-state-and-request-id',
  fullLibraryResponses(items(12), { requestIds: true })
)
libraryCase('library-prev-state-drops-undefined-marker', [
  ...libraryDiscovery(),
  postAnswer(
    pageTarget(1),
    200,
    libraryFlightPage({
      page: 1,
      totalPages: 2,
      totalDocs: 6,
      items: items(5),
      extraResultFields: { redemptionExpiryDate: '$undefined' }
    })
  ),
  postAnswer(
    pageTarget(2),
    200,
    libraryFlightPage({
      page: 2,
      totalPages: 2,
      totalDocs: 6,
      items: [itemN(6)]
    })
  )
])
libraryCase('library-mixed-items', fullLibraryResponses(MIXED_ITEMS))
libraryCase('library-duplicate-item-across-pages', [
  ...libraryDiscovery(),
  postAnswer(
    pageTarget(1),
    200,
    libraryFlightPage({ page: 1, totalPages: 2, totalDocs: 3, items: items(2) })
  ),
  postAnswer(
    pageTarget(2),
    200,
    libraryFlightPage({
      page: 2,
      totalPages: 2,
      totalDocs: 3,
      items: [itemN(2), itemN(3)]
    })
  )
])
libraryCase(
  'library-cached-action-id-skips-discovery',
  libraryPageResponses(items(2)),
  {
    prime: { library: primed(1) }
  }
)
libraryCase(
  'library-stale-cached-id-rediscovers-with-known-chunk-first',
  [
    postAnswer(pageTarget(1), 404, 'Server action not found', 'text/plain'),
    // The known chunk (bbb) is tried first, so it is the only chunk fetched.
    ...libraryDiscovery({
      actionId: REPLACEMENT_ACTION_ID,
      holder: 1,
      fetched: [CHUNK_PATHS[1]]
    }),
    ...libraryPageResponses(items(1))
  ],
  { prime: { library: primed(1) } }
)
libraryCase('library-chunk-scan-finds-id-in-third-chunk', [
  ...libraryDiscovery({ holder: 2 }),
  ...libraryPageResponses(items(1))
])
libraryCase(
  'library-action-id-not-found-is-schema-error',
  libraryDiscovery({ holder: null })
)
libraryCase('library-page-401', [getAnswer(LIBRARY_PATH, 401)])
libraryCase('library-page-403', [getAnswer(LIBRARY_PATH, 403)])
libraryCase('library-page-429', [getAnswer(LIBRARY_PATH, 429)])
libraryCase('library-page-502-throws', [getAnswer(LIBRARY_PATH, 502)])
libraryCase('library-page-404-is-schema-error', [getAnswer(LIBRARY_PATH, 404)])
libraryCase('library-page-redirect-to-auth-host-is-session-expired', [
  getAnswer(LIBRARY_PATH, 302, '', 'text/html', [
    ['location', 'https://auth.humblebundle.com/login?flow=fake-flow']
  ])
])
libraryCase('library-page-redirect-elsewhere-is-schema-error', [
  getAnswer(LIBRARY_PATH, 302, '', 'text/html', [
    ['location', '/somewhere-else']
  ])
])
libraryCase('library-post-401', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 401)
])
libraryCase('library-post-403', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 403)
])
libraryCase('library-post-429', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 429)
])
libraryCase('library-post-500-throws', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 500)
])
libraryCase('library-post-redirect-to-auth-host-never-followed', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 307, '', 'text/plain', [
    ['location', 'https://auth.humblebundle.com/self-service/login/browser']
  ])
])
libraryCase('library-fresh-id-404-is-rejected-without-a-second-discovery', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 404, 'Server action not found', 'text/plain')
])
libraryCase(
  'library-stale-cached-id-rediscovered-still-stale-is-rejected',
  [
    postAnswer(pageTarget(1), 404, 'Server action not found', 'text/plain'),
    ...libraryDiscovery({
      actionId: REPLACEMENT_ACTION_ID,
      holder: 1,
      fetched: [CHUNK_PATHS[1]]
    }),
    postAnswer(pageTarget(1), 404, 'Server action not found', 'text/plain')
  ],
  { prime: { library: primed(1) } }
)
libraryCase('library-post-html-on-a-fresh-id-is-rejected-and-clears-the-slot', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 200, '<html>not flight</html>', 'text/html')
])
libraryCase('library-post-redirect-elsewhere-on-a-fresh-id-is-rejected', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 302, '', 'text/plain', [['location', '/elsewhere']])
])
libraryCase('library-post-unrecognised-shape-is-schema-error', [
  ...libraryDiscovery(),
  postAnswer(pageTarget(1), 200, '0:{"a":"$@1"}\n1:{"nope":1}\n')
])
libraryCase('library-session-expires-on-page-two', [
  ...libraryDiscovery(),
  postAnswer(
    pageTarget(1),
    200,
    libraryFlightPage({ page: 1, totalPages: 2, totalDocs: 6, items: items(5) })
  ),
  postAnswer(pageTarget(2), 401)
])
libraryCase('library-server-ignores-paging-and-echoes-the-query', [
  ...libraryDiscovery(),
  postAnswer(
    pageTarget(1),
    200,
    libraryFlightPage({
      page: 1,
      totalPages: 3,
      totalDocs: 15,
      items: items(5)
    })
  ),
  // The server answers page 2 with page 1 again, echoing the query it read.
  postAnswer(
    pageTarget(2),
    200,
    libraryFlightPage({
      page: 1,
      totalPages: 3,
      totalDocs: 15,
      items: items(5),
      echoedQuery: 'page=2'
    })
  )
])
libraryCase('library-reported-page-differs-with-fresh-items', [
  ...libraryDiscovery(),
  postAnswer(
    pageTarget(1),
    200,
    libraryFlightPage({
      page: 1,
      totalPages: 2,
      totalDocs: 10,
      items: items(5)
    })
  ),
  postAnswer(
    pageTarget(2),
    200,
    libraryFlightPage({
      page: 7,
      totalPages: 2,
      totalDocs: 10,
      items: items(10).slice(5)
    })
  )
])
libraryCase('library-fewer-items-than-total-docs-is-incomplete', [
  ...libraryDiscovery(),
  postAnswer(
    pageTarget(1),
    200,
    libraryFlightPage({
      page: 1,
      totalPages: 2,
      totalDocs: 10,
      items: [itemN(1)]
    })
  ),
  postAnswer(
    pageTarget(2),
    200,
    libraryFlightPage({
      page: 2,
      totalPages: 2,
      totalDocs: 10,
      items: [itemN(2)]
    })
  )
])
libraryCase(
  'library-page-cap-of-200-is-a-schema-error',
  [
    ...libraryDiscovery(),
    ...Array.from({ length: 200 }, (_, i) =>
      postAnswer(
        pageTarget(i + 1),
        200,
        libraryFlightPage({
          page: i + 1,
          totalPages: 100000,
          totalDocs: 100000,
          items: [itemN(i + 1)]
        })
      )
    )
  ],
  { input: { note: 'totalPages 100000, one fresh item per page' } }
)

function revealCase(
  id: string,
  synthetic: SyntheticResponse[],
  extra: {
    prime?: boolean
    gamekey?: string
    keyindex?: string | number
  } = {}
): void {
  const params = {
    gamekey: extra.gamekey ?? GAMEKEY,
    machineName: KEY_ID,
    keyindex: extra.keyindex ?? 'steam'
  }
  wireCases.push({
    id,
    fn: 'revealKey',
    input: {
      cookie: FAKE_COOKIE,
      ...params,
      primedRedeemAction: extra.prime ?? false
    },
    synthetic,
    prime: extra.prime
      ? { redeem: { id: REDEEM_ACTION_ID, chunk: CHUNK_PATHS[0] } }
      : undefined,
    run: (ids) => adapterRevealKey(FAKE_COOKIE, ids, params)
  })
}

const okReveal = (gamekey = GAMEKEY): SyntheticResponse =>
  redeemAnswer(
    gamekey,
    200,
    redeemFlight({
      success: true,
      key: FAKE_KEY_VALUE,
      orderStatus: 'complete'
    })
  )

revealCase('reveal-ok', [...redeemDiscoveryResponses(GAMEKEY), okReveal()])
revealCase('reveal-cached-action-id-skips-discovery', [okReveal()], {
  prime: true
})
revealCase(
  'reveal-numeric-keyindex-is-posted-as-a-string',
  [...redeemDiscoveryResponses(GAMEKEY), okReveal()],
  { keyindex: 3 }
)
revealCase(
  'reveal-gamekey-is-percent-encoded-in-the-path',
  [
    ...redeemDiscoveryResponses('fake gamekey/0002'),
    okReveal('fake gamekey/0002')
  ],
  { gamekey: 'fake gamekey/0002' }
)
for (const errorKind of [
  'already_redeemed',
  'order_unavailable',
  'rate_limited'
]) {
  revealCase(`reveal-rejected-by-server-${errorKind}`, [
    ...redeemDiscoveryResponses(GAMEKEY),
    redeemAnswer(
      GAMEKEY,
      200,
      redeemFlight({ success: false, errorKind, orderStatus: 'complete' })
    )
  ])
}
revealCase('reveal-rejected-by-server-without-an-error-kind', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 200, redeemFlight({ success: false }))
])
revealCase('reveal-success-without-a-key-is-schema-error', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(
    GAMEKEY,
    200,
    redeemFlight({ success: true, orderStatus: 'complete' })
  )
])
revealCase('reveal-401', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 401, '')
])
revealCase('reveal-403-json', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 403, '{"error":"forbidden"}', 'application/json')
])
revealCase('reveal-403-cloudflare-style-html', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(
    GAMEKEY,
    403,
    '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>',
    'text/html; charset=UTF-8'
  )
])
revealCase('reveal-429', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 429, '')
])
revealCase('reveal-502-throws', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 502, '')
])
revealCase('reveal-redirect-to-auth-host-never-followed', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 302, '', 'text/plain', [
    ['location', 'https://auth.humblebundle.com/login']
  ])
])
revealCase('reveal-redirect-elsewhere-on-a-fresh-id-is-schema-error', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 302, '', 'text/plain', [['location', '/elsewhere']])
])
revealCase(
  'reveal-stale-cached-id-rediscovers-once-then-ok',
  [
    redeemAnswer(GAMEKEY, 404, 'Server action not found', 'text/plain'),
    ...redeemDiscoveryResponses(GAMEKEY, REPLACEMENT_ACTION_ID),
    okReveal()
  ],
  { prime: true }
)
revealCase('reveal-fresh-id-rejected-as-stale-is-schema-error', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 404, 'Server action not found', 'text/plain')
])
revealCase('reveal-unrecognised-body-is-schema-error', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 200, '0:{"a":"$@1"}\n')
])
revealCase('reveal-response-not-flight-is-stale', [
  ...redeemDiscoveryResponses(GAMEKEY),
  redeemAnswer(GAMEKEY, 200, '<html>x</html>', 'text/html')
])
revealCase('reveal-discovery-page-401', [
  getAnswer(`${LIBRARY_PATH}/${GAMEKEY}`, 401)
])
revealCase('reveal-discovery-page-403', [
  getAnswer(`${LIBRARY_PATH}/${GAMEKEY}`, 403)
])
revealCase('reveal-discovery-page-502-throws', [
  getAnswer(`${LIBRARY_PATH}/${GAMEKEY}`, 502)
])
revealCase('reveal-discovery-redirect-to-auth-host', [
  getAnswer(`${LIBRARY_PATH}/${GAMEKEY}`, 302, '', 'text/html', [
    ['location', 'https://auth.humblebundle.com/login']
  ])
])
revealCase(
  'reveal-action-id-not-found-is-schema-error',
  discoveryResponses({
    pagePath: `${LIBRARY_PATH}/${GAMEKEY}`,
    actionId: REDEEM_ACTION_ID,
    actionName: 'redeemEntitlementAction',
    holder: null,
    listed: [CHUNK_PATHS[0]]
  })
)

// ---------------------------------------------------------------------------------------------
// The pure mapping
// ---------------------------------------------------------------------------------------------

interface PureCase {
  id: string
  input: unknown
}

const key = (extra: Record<string, unknown>): Record<string, unknown> => ({
  id: 'k',
  keyIntegrationId: 'steam',
  ...extra
})
const withKeys = (
  keys: unknown[],
  extra: Record<string, unknown> = {}
): unknown => ({
  id: 'fake-gamekey-0001',
  title: 'Fake Bundle',
  entitlements: { keys, downloads: [] },
  ...extra
})

const pureCases: PureCase[] = [
  {
    id: 'item-unrevealed-key',
    input: withKeys([
      key({
        title: 'Fake (Steam)',
        gameKey: null,
        redeemedAt: null,
        expired: false,
        redemptionExpiryDate: '$D2030-01-02T00:00:00.000Z'
      })
    ])
  },
  {
    id: 'item-revealed-by-key-formatted',
    input: withKeys([
      key({
        gameKey: null,
        redeemedAt: '2030-01-01T00:00:00.000Z',
        redemptionExpiryDate: '$undefined',
        redemptionData: { keyFormatted: FAKE_KEY_VALUE }
      })
    ])
  },
  {
    id: 'item-revealed-by-game-key-fallback',
    input: withKeys([key({ gameKey: FAKE_KEY_VALUE })])
  },
  {
    id: 'item-empty-key-formatted-falls-back-to-game-key',
    input: withKeys([
      key({ gameKey: FAKE_KEY_VALUE, redemptionData: { keyFormatted: '' } })
    ])
  },
  {
    id: 'item-redeemed-at-only-marks-revealed-without-a-value',
    input: withKeys([key({ redeemedAt: '$D2030-01-01' })])
  },
  {
    id: 'item-null-key-formatted-and-null-redeemed-at',
    input: withKeys([
      key({ redeemedAt: null, redemptionData: { keyFormatted: null } })
    ])
  },
  {
    id: 'item-expired-flag-and-expiry-date',
    input: withKeys([
      key({ expired: true, redemptionExpiryDate: '$D2026-02-03T04:05:06.000Z' })
    ])
  },
  {
    id: 'item-expiry-date-without-the-d-prefix',
    input: withKeys([key({ redemptionExpiryDate: '2026-02-03T04:05:06.000Z' })])
  },
  {
    id: 'item-expiry-date-with-another-flight-marker',
    input: withKeys([key({ redemptionExpiryDate: '$undefined' })])
  },
  {
    id: 'item-expiry-date-unparseable',
    input: withKeys([key({ redemptionExpiryDate: '$Dnot-a-date' })])
  },
  {
    id: 'item-expiry-date-not-a-string',
    input: withKeys([key({ redemptionExpiryDate: 17 })])
  },
  {
    id: 'item-direct-redeem-flag',
    input: withKeys([key({ directRedeem: true })])
  },
  {
    id: 'item-direct-redeem-not-true',
    input: withKeys([key({ directRedeem: 'yes' })])
  },
  {
    id: 'item-key-without-integration-id-is-generic',
    input: withKeys([{ id: 'k', keyIntegrationId: null }])
  },
  {
    id: 'item-key-without-id-gets-an-indexed-machine-name',
    input: withKeys([
      { keyIntegrationId: 'steam' },
      { keyIntegrationId: 'gog' }
    ])
  },
  {
    id: 'item-key-title-falls-back-to-item-title',
    input: withKeys([{ id: 'k', keyIntegrationId: 'steam' }])
  },
  {
    id: 'item-malformed-key-is-skipped',
    input: withKeys(['not-a-key', null, key({ id: 'good' })])
  },
  {
    id: 'item-download-only-group-yields-no-keys',
    input: {
      id: 'd',
      itemType: 'entitlement-group',
      entitlements: { keys: [], downloads: [{ id: 'x' }] }
    }
  },
  {
    id: 'item-without-entitlements-yields-no-keys',
    input: { id: 'e', title: 'No entitlements' }
  },
  {
    id: 'item-null-entitlements-keys',
    input: { id: 'n', entitlements: { keys: null } }
  },
  { id: 'item-non-object-is-dropped', input: 'nope' },
  { id: 'item-without-id-is-dropped', input: { title: 'no id' } },
  { id: 'item-null-is-dropped', input: null }
]

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------

async function outcome(run: () => Promise<unknown>): Promise<unknown> {
  try {
    return JSON.parse(JSON.stringify((await run()) ?? null)) as unknown
  } catch (error) {
    return { threw: (error as Error).message }
  }
}

async function runWireCase(c: WireCase): Promise<void> {
  const golden = await withHumbleOracleProfile(async () => {
    const actionIds = createHumbleActionIdCache()
    if (c.prime?.library) actionIds.set('library', c.prime.library)
    if (c.prime?.redeem) actionIds.set('redeem', c.prime.redeem)
    const restoreGaps = compressAdapterGaps()
    let result: unknown
    let requests: unknown
    try {
      await withWireRecorder(
        { slice: SLICE, caseId: c.id, synthetic: c.synthetic },
        async (recorder) => {
          result = await outcome(() => c.run(actionIds))
          requests = [...recorder.requests]
        }
      )
    } finally {
      restoreGaps()
    }
    return {
      fn: c.fn,
      input: c.input,
      requests,
      result,
      actionIds: {
        library: actionIds.get('library'),
        redeem: actionIds.get('redeem')
      }
    }
  })
  writeOrCompareGolden(SLICE, c.id, golden)
}

const allIds = [...wireCases.map((c) => c.id), ...pureCases.map((c) => c.id)]

describe('Humble adapter oracle: requests on the wire', () => {
  it.each(wireCases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      await runWireCase(c)
    },
    120_000
  )
})

describe('Humble adapter oracle: libraryItemToOrderDetail', () => {
  it.each(pureCases.map((c) => [c.id, c] as const))('%s', (_id, c) => {
    const output = JSON.parse(
      JSON.stringify(libraryItemToOrderDetail(c.input) ?? null)
    ) as unknown
    writeOrCompareGolden(SLICE, c.id, {
      fn: 'libraryItemToOrderDetail',
      input: c.input,
      output
    })
  })
})

describe('Humble adapter oracle: guards', () => {
  it('has the vacuous-pass guards', () => {
    syncManifest(SLICE, allIds, ADAPTER_FLOOR)
    assertManifest(SLICE, allIds, ADAPTER_FLOOR)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail(SLICE, ADAPTER_FLOOR)
  })

  it('case ids are unique', () => {
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})
