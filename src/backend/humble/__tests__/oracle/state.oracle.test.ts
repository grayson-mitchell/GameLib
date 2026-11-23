/**
 * The D-07 byte set (94-08 Task 3): the exact text the TypeScript writes for all eleven Humble
 * state files, so the Rust writer can be held to it on a user's machine, where the change is
 * one-way (D-07).
 *
 * The eleven files are `humble_store/config.json` (`humbleConfigStore`) and the ten
 * `store_cache/humble_*.json`: `library`, `sync`, `revealed`, `ownership_override`, `gifted_at`,
 * `audit`, `local_redeemed`, `notified_expiration`, `settle_declined` and `steam_appid`. They are
 * produced by running the real flows through `flowHarness.runFlowCase` (the real store classes over
 * a fake profile rooted with `createTestStoreRoot(profile.userData)`, no module mock): a sync that
 * seeds the notified baseline and the app-id cache, an exact auto-settle and its Undo (the
 * decline record), an override, a gift link, a mark, a reveal. The one exception is the config
 * store, written with the same `set` calls `HumbleUser` makes at sign-in (the user flows are
 * 94-09's). The bytes come out of the in-process disk sink, the shell's one writer in miniature.
 *
 * What the goldens pin that is easy to miss:
 *   - Every cache entry carries `__timestamp.<key>` holding `Date()`, the local-zone string with
 *     SECOND resolution (`Tue Nov 24 2026 12:00:00 GMT+0000 (Coordinated Universal Time)`). The
 *     cases run in UTC, so the string is host-independent. A sync less than a second later
 *     rewrites every entry with the same bytes; one a minute later changes every timestamp.
 *   - Files are tab-indented with a trailing `__internal__.gamelib.schemaVersion` envelope.
 *
 * Case shapes. `all-eleven-files-populated-by-real-flows` is the reference set. The no-op cases
 * hold `files: {<path>: {before, after, identical}}` for each of the eleven. The legacy case holds
 * a pre-backfill `humble_notified_expiration` (a bare machineName key, written through the TS store
 * class) and its after-backfill bytes. The corrupt-file case is `rustOnly`: the TS test store
 * root does not implement copy-aside.
 *
 * Key values are the literal `REDACTED` and the one account name is `REDACTED` (the redaction scan
 * reads these goldens too, so the file text is shown as UTF-8, never base64).
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
import { libraryFlightPage, postAnswer, LIBRARY_PATH } from './flight'
import { runFlowCase, type FlowEnv, type FlowSteam } from './flowHarness'
import {
  CACTUS,
  CACTUS_MISS,
  EXPIRING,
  FRAMED,
  FRAMED_MISS,
  LEGACY,
  OTHER,
  OTHER_ID,
  OTHER_MISS,
  OWNED,
  PORTAL_HIT,
  PORTAL_ID,
  PORTAL_REVEALED,
  REVEALED_ID,
  REVEALED_OTHER,
  REVEALED_OTHER_MISS,
  resyncAnswers,
  revealOk,
  syncAnswers
} from './libraryFixtures'

const SLICE = 'state'
const STATE_FLOOR = 6

/** The eleven files D-07 inventories. */
const ELEVEN = [
  'humble_store/config.json',
  'store_cache/humble_audit.json',
  'store_cache/humble_gifted_at.json',
  'store_cache/humble_library.json',
  'store_cache/humble_local_redeemed.json',
  'store_cache/humble_notified_expiration.json',
  'store_cache/humble_ownership_override.json',
  'store_cache/humble_revealed.json',
  'store_cache/humble_settle_declined.json',
  'store_cache/humble_steam_appid.json',
  'store_cache/humble_sync.json'
] as const

type FileBytes = { utf8: string } | { base64: string }
type Snapshot = Record<string, FileBytes>

// ---------------------------------------------------------------------------------------------
// The populated boot
// ---------------------------------------------------------------------------------------------

/** What the server answers throughout: the library the flows act on. */
const LIBRARY = [
  PORTAL_REVEALED,
  CACTUS,
  FRAMED,
  OTHER,
  REVEALED_OTHER,
  EXPIRING
]

/** One storesearch answer per steam-keyed title (five), a hit for Portal 2 and misses for the rest. */
const APP_ID_ANSWERS: SyntheticResponse[] = [
  PORTAL_HIT,
  CACTUS_MISS,
  FRAMED_MISS,
  OTHER_MISS,
  REVEALED_OTHER_MISS
]
const APP_ID_TITLES = 5

const sync = (env: FlowEnv) => env.ipc('humbleSync')

/** The writes `HumbleUser` makes at sign-in (`user.ts`: `storeHumbleSecret` and `finishLogin`). */
async function signedInConfig(env: FlowEnv): Promise<void> {
  await env.step('configStoreAsSignInWritesIt', [], () => {
    const config = env.stores.humble.configStore
    config.set('encryptionDegraded', false)
    config.set('isLoggedIn', true)
    config.set('expired', false)
    config.set('userData', { username: 'REDACTED' })
  })
}

/** Runs every flow that writes one of the eleven files, in an order that touches each. */
async function populate(env: FlowEnv): Promise<void> {
  await signedInConfig(env)
  await sync(env)
  await env.settleAppIdPass(APP_ID_TITLES)
  await env.ipc('humbleSetOwnershipOverride', 'cactus_steam')
  await env.ipc('humbleRecordGiftLinkOpened', 'framed_steam')
  await env.ipc('humbleMarkRedeemed', {
    gamekey: REVEALED_ID,
    machineName: 'revealed_steam'
  })
  await env.direct('revealKey', [OTHER_ID, 'other_steam'], () =>
    env.services.library.revealKey(OTHER_ID, 'other_steam')
  )
  // The exact auto-settled Portal 2 key is Undone: the decline record is written.
  await env.ipc('humbleUndoRedeemed', {
    gamekey: PORTAL_ID,
    machineName: 'portal2_steam'
  })
}

const populatedAnswers = (): SyntheticResponse[] => [
  ...syncAnswers(LIBRARY),
  ...APP_ID_ANSWERS,
  ...revealOk(OTHER_ID)
]

// ---------------------------------------------------------------------------------------------
// Comparing two snapshots
// ---------------------------------------------------------------------------------------------

interface FileDelta {
  before: FileBytes | null
  after: FileBytes | null
  identical: boolean
}

const same = (a: FileBytes | null, b: FileBytes | null): boolean =>
  JSON.stringify(a) === JSON.stringify(b)

function compare(before: Snapshot, after: Snapshot): Record<string, FileDelta> {
  const out: Record<string, FileDelta> = {}
  for (const path of ELEVEN) {
    const b = before[path] ?? null
    const a = after[path] ?? null
    out[path] = { before: b, after: a, identical: same(b, a) }
  }
  return out
}

const changedPaths = (files: Record<string, FileDelta>): string[] =>
  Object.entries(files)
    .filter(([, delta]) => !delta.identical)
    .map(([path]) => path)

// ---------------------------------------------------------------------------------------------
// Cases
// ---------------------------------------------------------------------------------------------

interface StateCase {
  id: string
  synthetic: SyntheticResponse[]
  steam?: FlowSteam
  script: (env: FlowEnv) => Promise<unknown>
  /** Extra assertions on the case's own result, run in the test. */
  check?: (result: Record<string, unknown>) => void
}

const cases: StateCase[] = []

cases.push({
  id: 'all-eleven-files-populated-by-real-flows',
  synthetic: populatedAnswers(),
  steam: OWNED,
  script: async (env) => {
    await populate(env)
    const files = env.snapshot()
    return { count: Object.keys(files).length, files }
  },
  check: (result) => {
    const files = result.files as Snapshot
    expect(Object.keys(files).sort()).toEqual([...ELEVEN])
    expect(result.count).toBe(11)
  }
})

/**
 * A sync after the populated boot, compared file by file. `settled` first runs one more sync
 * (inside the same second) so the library entries are in the order a sync writes them: the app-id
 * pass patches a key with `{...key, steamAppId, steamAppIdResolved}`, which puts those two fields
 * last, and the next sync writes them in the classifier's order.
 */
const noop = (id: string, advanceMs: number, settled: boolean): StateCase => ({
  id,
  synthetic: [
    ...populatedAnswers(),
    ...resyncAnswers(LIBRARY),
    ...(settled ? resyncAnswers(LIBRARY) : [])
  ],
  steam: OWNED,
  script: async (env) => {
    await populate(env)
    if (settled) {
      env.advance(100)
      await sync(env)
      await env.settleAppIdPass(APP_ID_TITLES)
    }
    const before = env.snapshot()
    env.advance(advanceMs)
    await sync(env)
    await env.settleAppIdPass(APP_ID_TITLES)
    const files = compare(before, env.snapshot())
    return {
      advancedMs: advanceMs,
      settled,
      files,
      changed: changedPaths(files)
    }
  }
})

const noopWithinASecond = noop(
  'noop-sync-within-a-second-changes-only-humble-sync',
  750,
  true
)
noopWithinASecond.check = (result) => {
  const files = result.files as Record<string, FileDelta>
  expect(Object.keys(files)).toHaveLength(11)
  expect(result.changed).toEqual(['store_cache/humble_sync.json'])
  expect(Object.values(files).filter((f) => f.identical)).toHaveLength(10)
}
cases.push(noopWithinASecond)

const noopAMinuteLater = noop(
  'noop-sync-a-minute-later-rewrites-the-timestamps',
  60_000,
  true
)
noopAMinuteLater.check = (result) => {
  const changed = result.changed as string[]
  expect(changed).toContain('store_cache/humble_sync.json')
  expect(changed).toContain('store_cache/humble_library.json')
  // The user-state files no sync writes stay as they were.
  for (const untouched of [
    'humble_store/config.json',
    'store_cache/humble_revealed.json',
    'store_cache/humble_gifted_at.json',
    'store_cache/humble_ownership_override.json',
    'store_cache/humble_settle_declined.json'
  ]) {
    expect(changed).not.toContain(untouched)
  }
}
cases.push(noopAMinuteLater)

const firstResync = noop(
  'first-resync-after-the-app-id-pass-reorders-the-library-entry-keys',
  750,
  false
)
firstResync.check = (result) => {
  // The values are the same and only the key order moved, yet the bytes differ: a byte-exact
  // Rust writer has to reproduce the order, not just the data.
  expect(result.changed).toEqual([
    'store_cache/humble_library.json',
    'store_cache/humble_sync.json'
  ])
}
cases.push(firstResync)

cases.push({
  id: 'first-sync-seeds-the-notified-baseline-silently',
  synthetic: syncAnswers([EXPIRING]),
  script: async (env) => {
    await sync(env)
    const calls = env.calls.flatMap((c) => c.expiryDigest)
    return {
      expiryDigest: calls,
      notifiedExpiration:
        env.snapshot()['store_cache/humble_notified_expiration.json'] ?? null
    }
  },
  check: (result) => {
    expect(result.expiryDigest).toEqual([
      { keyCount: 1, suppressNotifications: true }
    ])
    expect(result.notifiedExpiration).not.toBeNull()
  }
})

cases.push({
  id: 'legacy-notified-expiration-is-backfilled-to-a-composite-key',
  synthetic: [...syncAnswers([LEGACY]), ...resyncAnswers([LEGACY])],
  script: async (env) => {
    await sync(env)
    // A pre-composite-key file: the entry is keyed by the bare machineName. Written through the
    // TS store class, as the old build wrote it.
    await env.step('writeTheLegacyBareKey', ['legacy_gog'], () => {
      const store = env.stores.humble.humbleNotifiedExpirationStore
      store.delete('fake-gamekey-0009:legacy_gog')
      store.set('legacy_gog', { expiration: '2027-05-06T00:00:00.000Z' })
    })
    const before = env.snapshot()
    env.advance(1000)
    await sync(env)
    const after = env.snapshot()
    const path = 'store_cache/humble_notified_expiration.json'
    return {
      path,
      before: before[path] ?? null,
      after: after[path] ?? null,
      expiryDigest: env.calls.at(-1)?.expiryDigest ?? []
    }
  },
  check: (result) => {
    const before = (result.before as { utf8: string }).utf8
    const after = (result.after as { utf8: string }).utf8
    expect(before).not.toContain('fake-gamekey-0009:legacy_gog')
    expect(after).toContain('fake-gamekey-0009:legacy_gog')
    // The legacy bare key is left in place: the backfill is idempotent.
    expect(after).toContain('"legacy_gog"')
  }
})

const movedExpiry = {
  ...EXPIRING,
  keys: EXPIRING.keys.map((k) => ({
    ...k,
    redemptionExpiryDate: '$D2027-09-10T00:00:00.000Z'
  }))
}
cases.push({
  id: 'a-moved-expiration-rewrites-the-notified-record',
  synthetic: [
    ...syncAnswers([EXPIRING]),
    postAnswer(
      LIBRARY_PATH,
      200,
      libraryFlightPage({
        page: 1,
        totalPages: 1,
        items: [movedExpiry]
      })
    )
  ],
  script: async (env) => {
    await sync(env)
    const path = 'store_cache/humble_notified_expiration.json'
    const before = env.snapshot()
    env.advance(1000)
    await sync(env)
    const after = env.snapshot()
    return {
      path,
      before: before[path] ?? null,
      after: after[path] ?? null,
      expiryDigest: env.calls.at(-1)?.expiryDigest ?? [],
      notifications: env.calls.at(-1)?.notifications ?? []
    }
  },
  check: (result) => {
    expect((result.before as { utf8: string }).utf8).toContain('2027-03-04')
    expect((result.after as { utf8: string }).utf8).toContain('2027-09-10')
    expect(result.expiryDigest).toEqual([
      { keyCount: 1, suppressNotifications: false }
    ])
    // The notify setting is off by default: the digest advances the record and shows nothing.
    expect(result.notifications).toEqual([])
  }
})

cases.push({
  id: 'sync-with-no-user-state-writes-only-library-sync-and-notified',
  synthetic: syncAnswers([OTHER, EXPIRING]),
  script: async (env) => {
    await sync(env)
    return { files: Object.keys(env.snapshot()) }
  },
  check: (result) => {
    expect(result.files).toEqual([
      'store_cache/humble_library.json',
      'store_cache/humble_notified_expiration.json',
      'store_cache/humble_sync.json'
    ])
  }
})

/** The bytes the Rust replay writes before it opens the store (the corrupt case). */
const CORRUPT_INPUTS = {
  'store_cache/humble_library.json': '{"fake-gamekey-0001": {"keys": [',
  'humble_store/config.json': '\u0000\u0000not json'
}

// ---------------------------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------------------------

const RUST_ONLY_ID = 'corrupt-state-file-is-a-rust-only-case'
const allIds = [...cases.map((c) => c.id), RUST_ONLY_ID]

describe('Humble state oracle: the D-07 byte set', () => {
  it.each(cases.map((c) => [c.id, c] as const))(
    '%s',
    async (_id, c) => {
      const golden = (await runFlowCase({
        slice: SLICE,
        caseId: c.id,
        synthetic: c.synthetic,
        steam: c.steam,
        realDigest: true,
        script: c.script
      })) as { result?: Record<string, unknown> }
      c.check?.(golden.result ?? {})
      writeOrCompareGolden(SLICE, c.id, golden)
    },
    120_000
  )

  it('records the corrupt-file case as Rust-only (the TS test store root has no copy-aside)', () => {
    writeOrCompareGolden(SLICE, RUST_ONLY_ID, {
      rustOnly: 'FND-06 copy-aside, 85 D-05',
      reason:
        'The TypeScript test store root does not implement copy-aside, so there is no TS behaviour to record: the Rust store owner moves a file it cannot parse aside and starts empty (FND-06), which 85 D-05 specifies.',
      corruptInputs: CORRUPT_INPUTS
    })
  })
})

describe('Humble state oracle: guards', () => {
  it('has the vacuous-pass guards', () => {
    syncManifest(SLICE, allIds, STATE_FLOOR)
    assertManifest(SLICE, allIds, STATE_FLOOR)
  })

  it('an empty case list fails the floor', () => {
    expectEmptyCasesToFail(SLICE, STATE_FLOOR)
  })

  it('names the eleven files once each', () => {
    expect(new Set(ELEVEN).size).toBe(11)
  })
})
