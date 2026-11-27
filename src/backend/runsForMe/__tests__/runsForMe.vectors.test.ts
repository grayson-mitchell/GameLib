/**
 * The runs-for-me vectors (88.3-02, D-11, D-20, D-25): `nextRunsForMeAfterSession`, its three small siblings
 * (`nextRunsForMeAfterUserToggle`, `isRunsForMeOn`, `runsForMeKey`), `getRunsForMeMap` and `recordPlaySession`, recorded from
 * the real TS as the golden the Rust playtime step (88.3-05) has to reproduce.
 *
 * Slice `gamelib-launch/tests/fixtures/golden/runs_for_me/`, in the layout of golden/redaction:
 *   vectors.json    every vector in table order: `{ name, kind, input, output }`. The input is written in THIS file; the
 *                   output is only ever recorded from the TS function (write mode)
 *   MANIFEST.json   `{ count, floor }`
 *
 * This file is a pin, not a driver, and it STAYS after 88.3: the TS module stays for the Steam bottle monitor and the
 * renderer, so the Rust port and the TS answer the same vectors.
 *
 * Isolation: pure functions and a recording store, no HOME, no spawn, no network. The logger is spied on, never mocked.
 * `recordPlaySession`'s `platform` is always passed, never left to its `process.platform` default.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite vectors.json and MANIFEST.json from the TS
 *   (default)                        recompute and compare, offline
 */
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import * as logger from 'backend/logger'
import {
  getRunsForMeMap,
  recordPlaySession,
  type RunsForMeDeps
} from 'backend/runsForMe'
import {
  goldenDir,
  syncManifest
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import {
  isRunsForMeOn,
  nextRunsForMeAfterSession,
  nextRunsForMeAfterUserToggle,
  runsForMeKey,
  RUNS_FOR_ME_AUTO_THRESHOLD_MS,
  type RunsForMeState
} from 'common/runsForMe'
import type { Runner } from 'common/types'

const CRATE = 'gamelib-launch'
const SLICE = 'runs_for_me'
/** The vector count this plan committed; a later edit may raise it, never lower it. */
const RUNS_FOR_ME_FLOOR = 58

const mode = engineWineOracleMode()
const T = RUNS_FOR_ME_AUTO_THRESHOLD_MS

/** `null` stands for an unset state (JSON has no `undefined`). */
type StateIn = RunsForMeState | null

type Kind =
  | 'after-session'
  | 'after-toggle'
  | 'is-on'
  | 'key'
  | 'map'
  | 'record-session'

interface RecordSessionInput {
  platform: string
  appName: string
  runner: Runner
  elapsedMs: number
  /** What `runsForMeStore.get('games', {})` answers (any JSON value, a hand-edited store included). */
  games: unknown
  /** The store, or the push, fails with this message. */
  getThrows?: string
  setThrows?: string
  pushThrows?: string
}

interface Vector {
  name: string
  kind: Kind
  input: Record<string, unknown>
}
interface RecordedVector extends Vector {
  output: unknown
}

const vec = (
  name: string,
  kind: Kind,
  input: Record<string, unknown>
): Vector => ({ name, kind, input })

const STATES: readonly StateIn[] = [null, 'auto', 'user-on', 'user-off']
const stateWord = (state: StateIn): string => state ?? 'unset'
const ELAPSED: readonly (readonly [string, number])[] = [
  ['0', 0],
  ['threshold-minus-1', T - 1],
  ['threshold', T],
  ['threshold-plus-1', T + 1],
  ['an-hour', 3_600_000]
]

function afterSessionVectors(): Vector[] {
  const out: Vector[] = []
  for (const state of STATES) {
    for (const [word, elapsedMs] of ELAPSED) {
      out.push(
        vec(`after-session-${stateWord(state)}-${word}`, 'after-session', {
          current: state,
          elapsedMs
        })
      )
    }
  }
  out.push(
    vec('after-session-unset-negative', 'after-session', {
      current: null,
      elapsedMs: -1
    })
  )
  return out
}

function smallVectors(): Vector[] {
  return [
    vec('after-toggle-on', 'after-toggle', { on: true }),
    vec('after-toggle-off', 'after-toggle', { on: false }),
    ...STATES.map((state) =>
      vec(`is-on-${stateWord(state)}`, 'is-on', { state })
    ),
    vec('key-plain', 'key', { appName: 'Quail', runner: 'legendary' }),
    vec('key-gog', 'key', { appName: '1207658930', runner: 'gog' }),
    vec('key-steam', 'key', { appName: '570', runner: 'steam' }),
    vec('key-with-dots-and-underscores', 'key', {
      appName: 'a.b_c',
      runner: 'sideload'
    }),
    vec('map-valid-states', 'map', {
      games: { a_legendary: 'auto', b_gog: 'user-on', c_nile: 'user-off' }
    }),
    vec('map-drops-garbage-values', 'map', {
      games: {
        a_legendary: 'auto',
        b_gog: 'maybe',
        c_nile: 1,
        d_steam: null,
        e_sideload: true,
        f_legendary: ''
      }
    }),
    vec('map-empty-object', 'map', { games: {} }),
    vec('map-null-is-empty', 'map', { games: null }),
    vec('map-number-is-empty', 'map', { games: 7 }),
    vec('map-string-is-empty', 'map', { games: 'auto' }),
    // Recorded as the TS behaves: an array is an object, so its valid string items come back under their indexes.
    vec('map-array-keeps-valid-items-by-index', 'map', {
      games: ['auto', 'nope', 'user-off']
    })
  ]
}

const session = (
  name: string,
  input: Partial<RecordSessionInput> & { platform: string }
): Vector =>
  vec(name, 'record-session', {
    appName: 'Quail',
    runner: 'legendary',
    elapsedMs: T,
    games: {},
    ...input
  })

function recordSessionVectors(): Vector[] {
  return [
    session('record-darwin-unset-at-threshold', { platform: 'darwin' }),
    session('record-darwin-unset-over-threshold', {
      platform: 'darwin',
      elapsedMs: 3_600_000
    }),
    session('record-darwin-unset-below-threshold', {
      platform: 'darwin',
      elapsedMs: T - 1
    }),
    session('record-darwin-user-off-is-never-overridden', {
      platform: 'darwin',
      elapsedMs: 3_600_000,
      games: { Quail_legendary: 'user-off' }
    }),
    session('record-darwin-user-on-is-left-alone', {
      platform: 'darwin',
      elapsedMs: 3_600_000,
      games: { Quail_legendary: 'user-on' }
    }),
    session('record-darwin-auto-already-set-writes-nothing', {
      platform: 'darwin',
      elapsedMs: 3_600_000,
      games: { Quail_legendary: 'auto' }
    }),
    session('record-linux-unset-over-threshold-is-a-no-op', {
      platform: 'linux',
      elapsedMs: 3_600_000
    }),
    session('record-win32-unset-over-threshold-is-a-no-op', {
      platform: 'win32',
      elapsedMs: 3_600_000
    }),
    session('record-darwin-keeps-the-other-games-in-the-written-record', {
      platform: 'darwin',
      games: { Wren_gog: 'user-on', Heron_nile: 'auto' }
    }),
    session('record-darwin-drops-garbage-from-the-written-record', {
      platform: 'darwin',
      games: { Wren_gog: 'user-on', Heron_nile: 'maybe', Egret_steam: 3 }
    }),
    session('record-darwin-app-name-with-dots-writes-the-whole-record', {
      platform: 'darwin',
      appName: 'com.example.game',
      games: { Wren_gog: 'auto' }
    }),
    session('record-darwin-other-runner-is-a-different-key', {
      platform: 'darwin',
      runner: 'gog',
      games: { Quail_legendary: 'user-off' }
    }),
    session('record-darwin-logs-seconds-rounded-down', {
      platform: 'darwin',
      elapsedMs: T + 499
    }),
    session('record-darwin-logs-seconds-rounded-up', {
      platform: 'darwin',
      elapsedMs: T + 500
    }),
    session('record-darwin-null-store-value-is-treated-as-empty', {
      platform: 'darwin',
      games: null
    }),
    session('record-darwin-array-store-value-is-read-by-index', {
      platform: 'darwin',
      games: ['auto']
    }),
    session('record-darwin-store-get-throws-is-logged-and-swallowed', {
      platform: 'darwin',
      getThrows: 'store unreadable'
    }),
    session('record-darwin-store-set-throws-is-logged-and-swallowed', {
      platform: 'darwin',
      setThrows: 'disk full'
    }),
    session(
      'record-darwin-push-throws-after-the-write-is-logged-and-swallowed',
      {
        platform: 'darwin',
        pushThrows: 'renderer gone'
      }
    ),
    session('record-darwin-store-get-throws-below-threshold-still-logs', {
      platform: 'darwin',
      elapsedMs: 0,
      getThrows: 'store unreadable'
    })
  ]
}

function runsForMeVectors(): Vector[] {
  return [
    ...afterSessionVectors(),
    ...smallVectors(),
    ...recordSessionVectors()
  ]
}

const unset = (value: StateIn): RunsForMeState | undefined => value ?? undefined

/** Runs one vector through the real TS function and returns what it answered or did. */
function recordVector(vector: Vector): unknown {
  const input = vector.input
  switch (vector.kind) {
    case 'after-session':
      return {
        state:
          nextRunsForMeAfterSession(
            unset(input.current as StateIn),
            input.elapsedMs as number
          ) ?? null
      }
    case 'after-toggle':
      return { state: nextRunsForMeAfterUserToggle(input.on as boolean) }
    case 'is-on':
      return { on: isRunsForMeOn(unset(input.state as StateIn)) }
    case 'key':
      return {
        key: runsForMeKey(input.appName as string, input.runner as Runner)
      }
    case 'map': {
      const deps = {
        stores: {
          runsForMe: { runsForMeStore: { get: () => input.games } }
        }
      } as unknown as RunsForMeDeps
      return { map: getRunsForMeMap(deps) }
    }
    case 'record-session':
      return recordSession(input as unknown as RecordSessionInput)
  }
}

/** `recordPlaySession` over a recording store and push, with the logger spied on. */
function recordSession(input: RecordSessionInput): unknown {
  const reads: unknown[] = []
  const writes: { key: string; value: unknown }[] = []
  const frontend: { channel: string; args: unknown }[] = []
  const logs: { level: string; prefix: unknown; text: string }[] = []
  const deps = {
    stores: {
      runsForMe: {
        runsForMeStore: {
          get: (key: string, fallback: unknown) => {
            reads.push({ key, fallback })
            if (input.getThrows !== undefined) {
              throw new Error(input.getThrows)
            }
            return structuredClone(input.games)
          },
          set: (key: string, value: unknown) => {
            if (input.setThrows !== undefined) {
              throw new Error(input.setThrows)
            }
            writes.push({ key, value: structuredClone(value) })
          }
        }
      }
    },
    sendFrontendMessage: (channel: string, ...args: unknown[]) => {
      frontend.push({ channel, args: structuredClone(args) })
      if (input.pushThrows !== undefined) throw new Error(input.pushThrows)
    }
  } as unknown as RunsForMeDeps
  const log =
    (level: string) =>
    (text: unknown, prefix?: unknown): void => {
      logs.push({ level, prefix: prefix ?? null, text: String(text) })
    }
  const spies = [
    jest.spyOn(logger, 'logInfo').mockImplementation(log('info')),
    jest.spyOn(logger, 'logWarning').mockImplementation(log('warning'))
  ]
  let threw: string | null = null
  try {
    recordPlaySession(
      deps,
      input.appName,
      input.runner,
      input.elapsedMs,
      input.platform
    )
  } catch (error) {
    threw = String(error)
  } finally {
    for (const spy of spies) spy.mockRestore()
  }
  return { threw, reads, writes, frontend, logs }
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

describeSkipOnWindows('runs-for-me vectors (88.3-02)', () => {
  const built = runsForMeVectors()
  const file = join(goldenDir(CRATE, SLICE), 'vectors.json')
  const recorded = new Map<string, unknown>()

  const committed = (): RecordedVector[] =>
    JSON.parse(readFileSync(file, 'utf8')) as RecordedVector[]

  afterAll(() => {
    if (mode !== 'write') return
    const vectors: RecordedVector[] = built.map((vector) => {
      if (!recorded.has(vector.name)) {
        throw new Error(`${vector.name}: not recorded`)
      }
      return { ...vector, output: recorded.get(vector.name) }
    })
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, json(vectors))
    syncManifest(
      CRATE,
      SLICE,
      vectors.map((v) => ({ id: v.name })),
      RUNS_FOR_ME_FLOOR
    )
  })

  it.each(built.map((vector) => [vector.name, vector] as const))(
    '%s',
    (_name, vector) => {
      // The output goes through JSON, so it is exactly what the file holds.
      const output = JSON.parse(JSON.stringify(recordVector(vector))) as unknown
      if (mode === 'write') {
        recorded.set(vector.name, output)
        return
      }
      const stored = committed().find((v) => v.name === vector.name)
      if (!stored) {
        throw new Error(`${vector.name} is missing from vectors.json`)
      }
      expect(stored).toEqual({ ...vector, output })
    }
  )

  it('vectors.json lists exactly the vectors the builder produces, in order', () => {
    if (mode !== 'compare') return
    expect(
      committed().map(({ name, kind, input }) => ({ name, kind, input }))
    ).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it('the committed MANIFEST agrees with the vector list and holds at least the floor', () => {
    if (mode !== 'compare') return
    const manifest = JSON.parse(
      readFileSync(join(goldenDir(CRATE, SLICE), 'MANIFEST.json'), 'utf8')
    ) as { count: number; floor: number }
    expect(new Set(built.map((v) => v.name)).size).toBe(built.length)
    expect(manifest.floor).toBeGreaterThanOrEqual(RUNS_FOR_ME_FLOOR)
    expect(manifest.count).toBe(built.length)
    expect(manifest.count).toBeGreaterThanOrEqual(manifest.floor)
  })

  it('the vector list is at or above the floor, and an empty list is not', () => {
    const assertFloor = (count: number): void => {
      if (count < RUNS_FOR_ME_FLOOR) {
        throw new Error(
          `runs-for-me vectors: ${count} is below the floor of ${RUNS_FOR_ME_FLOOR}`
        )
      }
    }
    expect(() => assertFloor(built.length)).not.toThrow()
    expect(() => assertFloor(0)).toThrow(/below the floor/)
  })

  it('every state the module defines is crossed with the five elapsed values', () => {
    const names = new Set(built.map((v) => v.name))
    for (const state of STATES) {
      for (const [word] of ELAPSED) {
        expect(names.has(`after-session-${stateWord(state)}-${word}`)).toBe(
          true
        )
      }
    }
  })

  it('only an unset game can become auto, and only at or past the threshold', () => {
    if (mode !== 'compare') return
    const after = (name: string): unknown =>
      committed().find((v) => v.name === name)?.output
    expect(after('after-session-unset-threshold-minus-1')).toEqual({
      state: null
    })
    expect(after('after-session-unset-threshold')).toEqual({ state: 'auto' })
    expect(after('after-session-user-off-an-hour')).toEqual({
      state: 'user-off'
    })
  })

  it('a user choice is never overridden and a store failure is logged and swallowed', () => {
    if (mode !== 'compare') return
    const out = (
      name: string
    ): { threw: unknown; writes: unknown[]; logs: { level: string }[] } =>
      committed().find((v) => v.name === name)?.output as never
    expect(
      out('record-darwin-user-off-is-never-overridden').writes
    ).toHaveLength(0)
    for (const name of [
      'record-darwin-store-get-throws-is-logged-and-swallowed',
      'record-darwin-store-set-throws-is-logged-and-swallowed'
    ]) {
      const recordedOutput = out(name)
      expect(recordedOutput.threw).toBeNull()
      expect(recordedOutput.logs.map((l) => l.level)).toEqual(['warning'])
    }
  })

  it('no vector holds an operator path or a real home', () => {
    if (mode !== 'compare') return
    expect(readFileSync(file, 'utf8')).not.toMatch(
      /\/Users\/|\/home\/[a-z]|AppData|gamelib-engine-oracle/
    )
  })
})
