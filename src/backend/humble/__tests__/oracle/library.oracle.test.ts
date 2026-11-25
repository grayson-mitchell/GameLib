/**
 * The Humble library, reveal and key-state flows as golden replay (94-08 Task 2, D-06).
 *
 * The stateful flows are goldened, not ported as tests: the Rust library replays each case's
 * calls against the recorded wire exchanges and compares the results, the pushed events and the
 * state bytes. Every case runs through `flowHarness.runFlowCase` (a fresh fake HOME, the real
 * stores, `createHumbleServices`, the wire recorder as the network, the pinned date) and records
 * `{input, calls, requests, stateAfter}`.
 *
 * What is covered: sync (fresh, empty, paged, repeated, within the 15-minute denial cooldown and
 * after it, a network failure that keeps the cache, no credentials, session expired on page 2 and
 * by redirect, pruning, fenced off by a disconnect, single flight), the Steam cross-reference over
 * `fixtures/steamGames.ts` with the Steam session signed in and signed out (and signed in with an
 * empty library), the exact and fuzzy tiers, the exact auto-settle and its Undo decline,
 * recomputeOwnership, getKeys, getSyncState, getAllGiftedAt, getAllOwnershipOverrides,
 * getClaimAnnotations, mark and undo redeemed, setOwnershipOverride (with the server-side refusal
 * of anything that is not a fuzzy match), clearOwnershipOverride, recordGiftLinkOpened (with the
 * owned-elsewhere and UNREVEALED refusals) and revealKey (success, the C2 owned-elsewhere block,
 * the ineligible refusals, each errorKind, a Cloudflare-style HTML 403, a denial cooldown,
 * session expiry, an ambiguous 5xx, a schema error, no credentials, a concurrent duplicate) with
 * getRevealedKeyValue.
 *
 * Findings carried into the goldens:
 *   - A sync's `partial` outcome is unreachable in the TypeScript: the only per-order failure is
 *     the disconnect fence, and a fenced sync returns `failed` first. The fence case records that.
 *   - `humbleAuthState` is pushed only by the user flows (sign-in, health check, disconnect), never
 *     by the library: 94-09's user goldens carry it.
 *   - The sidecar registers no channel for reveal, recompute or single-flight; those calls are
 *     recorded against the library directly, named as such.
 *
 * Key values in a synthetic response are the literal `REDACTED` (see flight.ts). `jest.spyOn`
 * reads the expiry digest and `console.warn`; there is no module mock in this suite.
 *
 * `GAMELIB_WRITE_HUMBLE_GOLDEN=1` writes the goldens and recordings; the default compares.
 */
import {
  assertManifest,
  expectEmptyCasesToFail,
  syncManifest,
  writeOrCompareGolden
} from 'backend/testUtils/humbleOracle/harness'
import type { SyntheticResponse } from 'backend/testUtils/humbleOracle/wireRecorder'
import {
  LIBRARY_ACTION_ID,
  LIBRARY_PATH,
  discoveryResponses,
  libraryFlightPage,
  postAnswer,
  redeemFlight
} from './flight'
import { runFlowCase, type FlowEnv, type FlowSteam } from './flowHarness'
import {
  CACTUS,
  CACTUS_ID,
  CACTUS_MISS,
  EXPIRED,
  EXPIRING,
  FRAMED_MISS,
  FRAMED_REVEALED,
  GOG,
  OTHER,
  OTHER_ID,
  OWNED,
  PORTAL,
  PORTAL_HIT,
  PORTAL_ID,
  PORTAL_REVEALED,
  REVEALED_ID,
  REVEALED_OTHER,
  SIGNED_IN_EMPTY,
  SIGNED_OUT,
  itemN,
  libraryDiscovery,
  resyncAnswers,
  revealOk,
  revealStatus,
  syncAnswers
} from './libraryFixtures'

const SLICE = 'library'
const LIBRARY_FLOOR = 40

// ---------------------------------------------------------------------------------------------
// Script helpers
// ---------------------------------------------------------------------------------------------

const sync = (env: FlowEnv) => env.ipc('humbleSync')
const getKeys = (env: FlowEnv) => env.ipc('humbleGetKeys')
const getSyncState = (env: FlowEnv) => env.ipc('humbleGetSyncState')
const annotations = (env: FlowEnv) => env.ipc('humbleGetClaimAnnotations')
const reveal = (env: FlowEnv, gamekey: string, machineName: string) =>
  env.direct('revealKey', [gamekey, machineName], () =>
    env.services.library.revealKey(gamekey, machineName)
  )
const revealedValue = (env: FlowEnv, gamekey: string, machineName: string) =>
  env.ipc('humbleGetRevealedKeyValue', { gamekey, machineName })
const markRedeemed = (env: FlowEnv, gamekey: string, machineName: string) =>
  env.ipc('humbleMarkRedeemed', { gamekey, machineName })
const undoRedeemed = (env: FlowEnv, gamekey: string, machineName: string) =>
  env.ipc('humbleUndoRedeemed', { gamekey, machineName })

// ---------------------------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------------------------

interface FlowCase {
  id: string
  synthetic: SyntheticResponse[]
  steam?: FlowSteam
  cookie?: string
  script: (env: FlowEnv) => Promise<void>
}

const cases: FlowCase[] = []
const flow = (c: FlowCase): void => {
  cases.push(c)
}

// ── sync ──────────────────────────────────────────────────────────────────────────────────

flow({
  id: 'sync-fresh-empty-library',
  synthetic: syncAnswers([]),
  script: async (env) => {
    await sync(env)
    await getKeys(env)
    await getSyncState(env)
  }
})
flow({
  id: 'sync-fresh-single-page-with-the-steam-session-signed-out',
  synthetic: syncAnswers([PORTAL, OTHER, GOG, REVEALED_OTHER, EXPIRING]),
  steam: SIGNED_OUT,
  script: async (env) => {
    await getKeys(env)
    await sync(env)
    await getKeys(env)
    await getSyncState(env)
    await annotations(env)
  }
})
flow({
  id: 'sync-fresh-three-pages',
  synthetic: syncAnswers(Array.from({ length: 12 }, (_, i) => itemN(i + 1))),
  script: async (env) => {
    await sync(env)
    await getSyncState(env)
  }
})
flow({
  id: 'sync-twice-reuses-the-cached-action-id',
  synthetic: [...syncAnswers([OTHER, GOG]), ...resyncAnswers([OTHER, GOG])],
  script: async (env) => {
    await sync(env)
    env.advance(60_000)
    await sync(env)
    await getSyncState(env)
  }
})
flow({
  id: 'sync-denied-403-starts-the-cooldown-then-blocks-then-lapses',
  synthetic: [
    ...libraryDiscovery(),
    postAnswer(LIBRARY_PATH, 403),
    ...resyncAnswers([OTHER])
  ],
  script: async (env) => {
    await sync(env)
    await getSyncState(env)
    env.advance(5 * 60_000)
    await sync(env)
    env.advance(11 * 60_000)
    await sync(env)
    await getSyncState(env)
    await getKeys(env)
  }
})
flow({
  id: 'sync-denied-429-starts-the-cooldown',
  synthetic: [...libraryDiscovery(), postAnswer(LIBRARY_PATH, 429)],
  script: async (env) => {
    await sync(env)
    await getSyncState(env)
  }
})
flow({
  id: 'sync-network-failure-keeps-the-cache-and-records-a-network-error',
  synthetic: [...syncAnswers([OTHER, GOG]), postAnswer(LIBRARY_PATH, 502)],
  script: async (env) => {
    await sync(env)
    await getKeys(env)
    env.advance(60_000)
    await sync(env)
    await getSyncState(env)
    await getKeys(env)
  }
})
flow({
  id: 'sync-action-id-not-found-records-a-network-error',
  synthetic: discoveryResponses({
    pagePath: LIBRARY_PATH,
    actionId: LIBRARY_ACTION_ID,
    actionName: 'filterUserLibrary',
    holder: null
  }),
  script: async (env) => {
    await sync(env)
    await getSyncState(env)
  }
})
flow({
  id: 'sync-without-credentials-fails-without-a-request',
  synthetic: [],
  cookie: '',
  script: async (env) => {
    await sync(env)
    await getSyncState(env)
  }
})
flow({
  id: 'sync-session-expired-on-page-two-commits-nothing',
  synthetic: [
    ...libraryDiscovery(),
    postAnswer(
      LIBRARY_PATH,
      200,
      libraryFlightPage({
        page: 1,
        totalPages: 2,
        totalDocs: 6,
        items: Array.from({ length: 5 }, (_, i) => itemN(i + 1))
      })
    ),
    postAnswer(`${LIBRARY_PATH}?page=2`, 401)
  ],
  script: async (env) => {
    await sync(env)
    await getSyncState(env)
    await getKeys(env)
  }
})
flow({
  id: 'sync-session-expired-by-a-redirect-to-the-auth-host',
  synthetic: [
    ...libraryDiscovery(),
    postAnswer(LIBRARY_PATH, 307, '', 'text/plain', [
      ['location', 'https://auth.humblebundle.com/self-service/login/browser']
    ])
  ],
  script: async (env) => {
    await sync(env)
    await getSyncState(env)
  }
})
flow({
  id: 'sync-prunes-items-absent-from-the-fresh-library',
  synthetic: [...syncAnswers([OTHER, GOG, EXPIRING]), ...resyncAnswers([GOG])],
  script: async (env) => {
    await sync(env)
    await getKeys(env)
    env.advance(60_000)
    await sync(env)
    await getKeys(env)
  }
})
flow({
  id: 'sync-fenced-off-by-a-disconnect-commits-nothing',
  synthetic: syncAnswers([OTHER, GOG]),
  script: async (env) => {
    env.onEvent = (event) => {
      if (event.channel === 'humbleSyncProgress') {
        env.services.syncFence.invalidate()
      }
    }
    await sync(env)
    env.onEvent = undefined
    await getSyncState(env)
    await getKeys(env)
  }
})
flow({
  id: 'sync-single-flight-concurrent-calls-share-one-run',
  synthetic: syncAnswers([OTHER, GOG]),
  script: async (env) => {
    await env.concurrent('humbleSync', 3)
    await getKeys(env)
  }
})

// ── the Steam cross-reference ─────────────────────────────────────────────────────────────

flow({
  id: 'steam-signed-out-never-sets-ownership',
  synthetic: syncAnswers([PORTAL, CACTUS]),
  steam: SIGNED_OUT,
  script: async (env) => {
    await sync(env)
    await getKeys(env)
  }
})
flow({
  id: 'steam-signed-in-with-an-empty-library-is-a-closed-gate',
  synthetic: syncAnswers([PORTAL, CACTUS]),
  steam: SIGNED_IN_EMPTY,
  script: async (env) => {
    await sync(env)
    await getKeys(env)
  }
})
flow({
  id: 'steam-signed-in-resolves-the-exact-and-the-fuzzy-tier',
  synthetic: [...syncAnswers([PORTAL, CACTUS]), PORTAL_HIT, CACTUS_MISS],
  steam: OWNED,
  script: async (env) => {
    await sync(env)
    await env.settleAppIdPass(2)
    await getKeys(env)
    await getSyncState(env)
  }
})
flow({
  id: 'steam-exact-owned-revealed-key-auto-settles-to-redeemed',
  synthetic: [...syncAnswers([PORTAL_REVEALED]), PORTAL_HIT],
  steam: OWNED,
  script: async (env) => {
    await sync(env)
    await env.settleAppIdPass(1)
    await getKeys(env)
    await annotations(env)
  }
})
flow({
  id: 'steam-an-unanswered-title-is-cached-as-a-miss-and-not-asked-again',
  synthetic: [
    ...syncAnswers([CACTUS]),
    ...resyncAnswers([CACTUS]),
    CACTUS_MISS
  ],
  steam: OWNED,
  script: async (env) => {
    await sync(env)
    await env.settleAppIdPass(1)
    env.advance(60_000)
    await sync(env)
    await env.settleAppIdPass(1)
    await getKeys(env)
  }
})
flow({
  id: 'recompute-ownership-after-the-steam-library-arrives',
  synthetic: syncAnswers([CACTUS, OTHER]),
  steam: SIGNED_IN_EMPTY,
  script: async (env) => {
    await sync(env)
    await getKeys(env)
    await env.step('seedSteamLibrary', ['signed in, owned library'], () =>
      env.setSteam(OWNED)
    )
    await env.direct('recomputeOwnership', [], () =>
      env.services.library.recomputeOwnership()
    )
    await getKeys(env)
  }
})

// ── ownership override ────────────────────────────────────────────────────────────────────

const fuzzyOwned = (extra: SyntheticResponse[] = []): SyntheticResponse[] => [
  ...syncAnswers([CACTUS]),
  CACTUS_MISS,
  ...extra
]
const syncFuzzy = async (env: FlowEnv): Promise<void> => {
  await sync(env)
  await env.settleAppIdPass(1)
  await getKeys(env)
}

flow({
  id: 'override-of-a-fuzzy-match-is-recorded-and-clears-the-flag',
  synthetic: fuzzyOwned(),
  steam: OWNED,
  script: async (env) => {
    await syncFuzzy(env)
    await env.ipc('humbleSetOwnershipOverride', 'cactus_steam')
    await env.direct('humbleGetOwnershipOverrides', [], () =>
      env.services.library.getAllOwnershipOverrides()
    )
    await getKeys(env)
  }
})
flow({
  id: 'override-cleared-restores-the-fuzzy-match',
  synthetic: fuzzyOwned(),
  steam: OWNED,
  script: async (env) => {
    await syncFuzzy(env)
    await env.ipc('humbleSetOwnershipOverride', 'cactus_steam')
    await env.ipc('humbleClearOwnershipOverride', 'cactus_steam')
    await env.direct('humbleGetOwnershipOverrides', [], () =>
      env.services.library.getAllOwnershipOverrides()
    )
    await getKeys(env)
  }
})
flow({
  id: 'override-of-an-exact-match-is-refused-by-the-server-side-check',
  synthetic: [...syncAnswers([PORTAL]), PORTAL_HIT],
  steam: OWNED,
  script: async (env) => {
    await sync(env)
    await env.settleAppIdPass(1)
    await env.ipc('humbleSetOwnershipOverride', 'portal2_steam')
    await env.direct('humbleGetOwnershipOverrides', [], () =>
      env.services.library.getAllOwnershipOverrides()
    )
  }
})
flow({
  id: 'override-of-an-unknown-machine-name-is-refused',
  synthetic: syncAnswers([OTHER]),
  script: async (env) => {
    await sync(env)
    await env.ipc('humbleSetOwnershipOverride', 'no_such_key')
    await env.direct('humbleGetOwnershipOverrides', [], () =>
      env.services.library.getAllOwnershipOverrides()
    )
  }
})

// ── gift link ─────────────────────────────────────────────────────────────────────────────

flow({
  id: 'gift-link-recorded-for-an-owned-unrevealed-key',
  synthetic: fuzzyOwned(),
  steam: OWNED,
  script: async (env) => {
    await syncFuzzy(env)
    await env.ipc('humbleRecordGiftLinkOpened', 'cactus_steam')
    await env.direct('humbleGetGiftedAt', [], () =>
      env.services.library.getAllGiftedAt()
    )
  }
})
flow({
  id: 'gift-link-refused-for-a-revealed-key',
  synthetic: [...syncAnswers([FRAMED_REVEALED]), FRAMED_MISS],
  steam: OWNED,
  script: async (env) => {
    await sync(env)
    await env.settleAppIdPass(1)
    await getKeys(env)
    await env.ipc('humbleRecordGiftLinkOpened', 'framed_steam')
    await env.direct('humbleGetGiftedAt', [], () =>
      env.services.library.getAllGiftedAt()
    )
  }
})
flow({
  id: 'gift-link-refused-when-the-key-is-not-owned-elsewhere',
  synthetic: syncAnswers([OTHER]),
  script: async (env) => {
    await sync(env)
    await env.ipc('humbleRecordGiftLinkOpened', 'other_steam')
    await env.direct('humbleGetGiftedAt', [], () =>
      env.services.library.getAllGiftedAt()
    )
  }
})
flow({
  id: 'gift-link-refused-for-an-unknown-machine-name',
  synthetic: syncAnswers([OTHER]),
  script: async (env) => {
    await sync(env)
    await env.ipc('humbleRecordGiftLinkOpened', 'no_such_key')
    await env.direct('humbleGetGiftedAt', [], () =>
      env.services.library.getAllGiftedAt()
    )
  }
})

// ── mark and undo redeemed ────────────────────────────────────────────────────────────────

flow({
  id: 'mark-redeemed-of-a-revealed-key-and-its-annotation',
  synthetic: syncAnswers([REVEALED_OTHER, OTHER]),
  script: async (env) => {
    await sync(env)
    await markRedeemed(env, REVEALED_ID, 'revealed_steam')
    await getKeys(env)
    await annotations(env)
  }
})
flow({
  id: 'mark-redeemed-refused-for-an-unrevealed-key',
  synthetic: syncAnswers([OTHER]),
  script: async (env) => {
    await sync(env)
    await markRedeemed(env, OTHER_ID, 'other_steam')
    await annotations(env)
  }
})
flow({
  id: 'undo-redeemed-of-a-user-mark-writes-no-decline',
  synthetic: syncAnswers([REVEALED_OTHER]),
  script: async (env) => {
    await sync(env)
    await markRedeemed(env, REVEALED_ID, 'revealed_steam')
    await undoRedeemed(env, REVEALED_ID, 'revealed_steam')
    await getKeys(env)
    await annotations(env)
  }
})
flow({
  id: 'undo-redeemed-of-an-auto-settle-writes-a-decline-and-recompute-does-not-resettle',
  synthetic: [...syncAnswers([PORTAL_REVEALED]), PORTAL_HIT],
  steam: OWNED,
  script: async (env) => {
    await sync(env)
    await env.settleAppIdPass(1)
    await getKeys(env)
    await undoRedeemed(env, PORTAL_ID, 'portal2_steam')
    await getKeys(env)
    await env.direct('recomputeOwnership', [], () =>
      env.services.library.recomputeOwnership()
    )
    await getKeys(env)
    await annotations(env)
  }
})
flow({
  id: 'undo-redeemed-of-a-key-that-is-not-redeemed-is-a-no-op',
  synthetic: syncAnswers([OTHER]),
  script: async (env) => {
    await sync(env)
    await undoRedeemed(env, OTHER_ID, 'other_steam')
    await annotations(env)
  }
})
flow({
  id: 'claim-annotations-cover-every-cached-key',
  synthetic: syncAnswers([OTHER, GOG, REVEALED_OTHER, EXPIRING, EXPIRED]),
  script: async (env) => {
    await sync(env)
    await markRedeemed(env, REVEALED_ID, 'revealed_steam')
    await annotations(env)
  }
})

// ── reveal ────────────────────────────────────────────────────────────────────────────────

flow({
  id: 'reveal-success-stores-the-value-and-flags-the-key-revealed',
  synthetic: [...syncAnswers([OTHER]), ...revealOk(OTHER_ID)],
  script: async (env) => {
    await sync(env)
    await reveal(env, OTHER_ID, 'other_steam')
    await revealedValue(env, OTHER_ID, 'other_steam')
    await getKeys(env)
    await annotations(env)
  }
})
flow({
  id: 'reveal-then-resync-carries-the-value-forward',
  synthetic: [
    ...syncAnswers([OTHER]),
    ...revealOk(OTHER_ID),
    ...resyncAnswers([OTHER])
  ],
  script: async (env) => {
    await sync(env)
    await reveal(env, OTHER_ID, 'other_steam')
    env.advance(60_000)
    await sync(env)
    await revealedValue(env, OTHER_ID, 'other_steam')
    await getKeys(env)
  }
})
flow({
  id: 'reveal-owned-elsewhere-is-blocked-without-a-redeem-request',
  synthetic: fuzzyOwned(),
  steam: OWNED,
  script: async (env) => {
    await syncFuzzy(env)
    await reveal(env, CACTUS_ID, 'cactus_steam')
    await annotations(env)
  }
})
flow({
  id: 'reveal-after-an-override-is-allowed',
  synthetic: [...fuzzyOwned(), ...revealOk(CACTUS_ID)],
  steam: OWNED,
  script: async (env) => {
    await syncFuzzy(env)
    await env.ipc('humbleSetOwnershipOverride', 'cactus_steam')
    await reveal(env, CACTUS_ID, 'cactus_steam')
    await getKeys(env)
  }
})
flow({
  id: 'reveal-of-an-unknown-key-is-ineligible',
  synthetic: syncAnswers([OTHER]),
  script: async (env) => {
    await sync(env)
    await reveal(env, 'fake-gamekey-9999', 'no_such_key')
  }
})
flow({
  id: 'reveal-of-an-already-revealed-key-is-ineligible',
  synthetic: syncAnswers([REVEALED_OTHER]),
  script: async (env) => {
    await sync(env)
    await reveal(env, REVEALED_ID, 'revealed_steam')
  }
})
flow({
  id: 'reveal-with-an-unresolved-keyindex-is-ineligible',
  synthetic: syncAnswers([OTHER]),
  script: async (env) => {
    await sync(env)
    await env.step('dropKeyindexFromTheCachedRow', [OTHER_ID], () => {
      const store = env.stores.humble.humbleLibraryStore
      const entry = store.get(OTHER_ID)
      if (!entry) throw new Error('the synced row is missing')
      store.set(OTHER_ID, {
        ...entry,
        keys: entry.keys.map((k) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { keyindex, ...rest } = k
          return rest
        })
      })
    })
    await reveal(env, OTHER_ID, 'other_steam')
    await annotations(env)
  }
})
for (const errorKind of [
  'already_redeemed',
  'order_unavailable',
  'rate_limited'
]) {
  flow({
    id: `reveal-rejected-by-server-${errorKind}-rolls-the-flag-back`,
    synthetic: [
      ...syncAnswers([OTHER]),
      ...revealStatus(
        OTHER_ID,
        200,
        redeemFlight({ success: false, errorKind, orderStatus: 'complete' })
      )
    ],
    script: async (env) => {
      await sync(env)
      await reveal(env, OTHER_ID, 'other_steam')
      await annotations(env)
      await getKeys(env)
    }
  })
}
flow({
  id: 'reveal-403-starts-the-cooldown-and-the-next-reveal-is-blocked',
  synthetic: [
    ...syncAnswers([OTHER]),
    ...revealStatus(OTHER_ID, 403, '{"error":"forbidden"}', 'application/json')
  ],
  script: async (env) => {
    await sync(env)
    await reveal(env, OTHER_ID, 'other_steam')
    await getSyncState(env)
    await reveal(env, OTHER_ID, 'other_steam')
  }
})
flow({
  id: 'reveal-cloudflare-style-html-403-is-a-denial',
  synthetic: [
    ...syncAnswers([OTHER]),
    ...revealStatus(
      OTHER_ID,
      403,
      '<!DOCTYPE html><html><head><title>Just a moment...</title></head></html>',
      'text/html; charset=UTF-8'
    )
  ],
  script: async (env) => {
    await sync(env)
    await reveal(env, OTHER_ID, 'other_steam')
    await getSyncState(env)
  }
})
flow({
  id: 'reveal-401-is-a-definitive-failure',
  synthetic: [...syncAnswers([OTHER]), ...revealStatus(OTHER_ID, 401)],
  script: async (env) => {
    await sync(env)
    await reveal(env, OTHER_ID, 'other_steam')
    await annotations(env)
  }
})
flow({
  id: 'reveal-5xx-is-ambiguous-keeps-the-flag-and-stores-no-value',
  synthetic: [...syncAnswers([OTHER]), ...revealStatus(OTHER_ID, 502)],
  script: async (env) => {
    await sync(env)
    await reveal(env, OTHER_ID, 'other_steam')
    await revealedValue(env, OTHER_ID, 'other_steam')
    await getKeys(env)
    await annotations(env)
  }
})
flow({
  id: 'reveal-with-an-unrecognised-body-is-a-definitive-failure',
  synthetic: [
    ...syncAnswers([OTHER]),
    ...revealStatus(OTHER_ID, 200, '0:{"a":"$@1"}\n')
  ],
  script: async (env) => {
    await sync(env)
    await reveal(env, OTHER_ID, 'other_steam')
    await annotations(env)
  }
})
flow({
  id: 'reveal-without-credentials-fails-before-the-write-ahead',
  synthetic: syncAnswers([OTHER]),
  script: async (env) => {
    await sync(env)
    env.setCookie('')
    await reveal(env, OTHER_ID, 'other_steam')
    await annotations(env)
  }
})
flow({
  id: 'reveal-concurrent-duplicate-is-refused-and-posts-once',
  synthetic: [...syncAnswers([OTHER]), ...revealOk(OTHER_ID)],
  script: async (env) => {
    await sync(env)
    await env.direct('revealKey x2', [OTHER_ID, 'other_steam'], () =>
      Promise.all([
        env.services.library.revealKey(OTHER_ID, 'other_steam'),
        env.services.library.revealKey(OTHER_ID, 'other_steam')
      ])
    )
    await revealedValue(env, OTHER_ID, 'other_steam')
  }
})

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------

const allIds = cases.map((c) => c.id)

describe('Humble library oracle: stateful flows', () => {
  it.each(cases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      const golden = await runFlowCase({
        slice: SLICE,
        caseId: c.id,
        synthetic: c.synthetic,
        steam: c.steam,
        cookie: c.cookie,
        script: c.script
      })
      writeOrCompareGolden(SLICE, c.id, golden)
    },
    120_000
  )
})

describe('Humble library oracle: guards', () => {
  it('has the vacuous-pass guards', () => {
    syncManifest(SLICE, allIds, LIBRARY_FLOOR)
    assertManifest(SLICE, allIds, LIBRARY_FLOOR)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail(SLICE, LIBRARY_FLOOR)
  })

  it('case ids are unique and name a plain file', () => {
    expect(new Set(allIds).size).toBe(allIds.length)
    for (const id of allIds) expect(id).toMatch(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
  })
})
