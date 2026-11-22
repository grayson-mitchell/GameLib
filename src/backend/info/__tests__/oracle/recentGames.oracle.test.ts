/**
 * The TS oracle for recent_games (86-04, SC3 and D-11). `recent_games.ts` has no test of its own,
 * so this is the first thing that pins its behaviour: each case starts from a synthetic
 * `store/config.json`, drives `addRecentGame` / `removeRecentGame`, and records the bytes the store
 * file holds afterwards plus every `recentGamesChanged` payload sent. The Rust slice (86-08) has
 * to reproduce both.
 *
 * Write the goldens with `GAMELIB_WRITE_INFO_GOLDEN=1`; without it this is a compare.
 */
import { join } from 'path'
import { existsSync } from 'fs'
import type { GameInfo } from 'common/types'
import { createKvsStores } from 'backend/constants/key_value_stores'
import { createBackendEvents } from 'backend/backend_events'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import {
  addRecentGame,
  removeRecentGame
} from 'backend/recent_games/recent_games'
import {
  assertManifest,
  expectEmptyCasesToFail,
  loadCases,
  pinClock,
  snapshotFiles,
  stateDir,
  syncManifest,
  withOracleProfile,
  writeOrCompareGolden
} from './harness'

const SLICE = 'recent'
/** The floor this test carries; the committed MANIFEST must be at or above it. */
const FLOOR = 9

type Op =
  | { op: 'add'; game: Pick<GameInfo, 'app_name' | 'title' | 'runner'> }
  | { op: 'remove'; appName: string }

interface RecentCase {
  id: string
  note?: string
  ops: Op[]
}

const cases = loadCases<RecentCase>(SLICE)

let restoreClock: () => void
beforeAll(() => {
  restoreClock = pinClock(Date.UTC(2026, 10, 22, 12, 0, 0))
})
afterAll(() => {
  restoreClock()
  syncManifest(SLICE, cases, FLOOR)
})

describe('recent_games oracle', () => {
  it('has at least the floor of cases, and the manifest agrees', () => {
    assertManifest(SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest guard', () => {
    expectEmptyCasesToFail(SLICE, FLOOR)
  })

  it('every case has a before-state file', () => {
    for (const c of cases) {
      expect(
        existsSync(join(stateDir(SLICE, c.id), 'store', 'config.json'))
      ).toBe(true)
    }
  })

  it.each(cases.map((c) => [c.id, c] as const))('%s', async (_id, c) => {
    const events: { channel: string; args: unknown[] }[] = []
    const busEmits: unknown[][] = []
    const result = await withOracleProfile(
      async ({ root, userData }) => {
        const kvs = createKvsStores({ registry: createStoreRegistry(), root })
        const { configStore } = kvs
        const sendFrontendMessage = ((channel: string, ...args: unknown[]) => {
          events.push({ channel, args })
          return true
        }) as unknown as SendFrontendMessage
        const appRuntime = { events: createBackendEvents() }
        const emit = appRuntime.events.emit.bind(appRuntime.events) as (
          ...args: unknown[]
        ) => boolean
        appRuntime.events.emit = ((...args: unknown[]) => {
          busEmits.push(args)
          return emit(...args)
        }) as typeof appRuntime.events.emit
        const deps = {
          stores: { kvs },
          sendFrontendMessage,
          appRuntime
        }
        for (const op of c.ops) {
          if (op.op === 'add') await addRecentGame(deps, op.game as GameInfo)
          else await removeRecentGame(deps, op.appName)
        }
        return {
          recent: configStore.get('games.recent', []),
          files: snapshotFiles(userData)
        }
      },
      stateDir(SLICE, c.id)
    )

    // The frontend push and the event bus carry the same list on every write.
    expect(busEmits.map((args) => args[1])).toEqual(
      events.map((e) => e.args[0])
    )
    writeOrCompareGolden(SLICE, c.id, {
      result: { recent: result.recent, writes: events.length },
      events,
      files: result.files
    })
  })
})
