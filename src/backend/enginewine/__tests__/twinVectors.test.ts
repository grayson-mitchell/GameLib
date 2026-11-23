/**
 * The engine twin's vector test (Phase 87, 87-28, D-24 extended).
 *
 * `engineKeyFor`, `isWritableEngineOverride`, `importEngineSettings` and `getPerGameBottleNameFor`
 * (`enginewine/twin.ts`) are called synchronously by the launch paths and the settings and install flows,
 * so they stay as scheduled TS twins of the Rust `gamelib-engine` functions
 * (`engineWineShimSchedule.test.ts`). This test is what pins them to Rust: it replays the same
 * `engine_twin.json` vectors that `gamelib-engine`'s `tests/twin_vectors.rs` replays against
 * `key::engine_key_for_json`, `config::is_writable_engine_override`, `config::import_engine_settings` and
 * `game_engine::per_game_bottle_name_for`. The vectors were recorded from the TS by the 87-12 oracle
 * (`engineConfig.oracle.test.ts`), so if either side drifts, one of the two replays fails.
 *
 * A long input is stored as a generator (`{ "repeat": { "char", "count" } }`) so the file stays small; it is
 * expanded here and in the Rust replay before the call.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { REPO_ROOT } from 'backend/testUtils/infoPortGate'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  engineKeyFor,
  getPerGameBottleNameFor,
  importEngineSettings,
  isWritableEngineOverride
} from '../twin'

const VECTORS = join(
  REPO_ROOT,
  'src-tauri',
  'crates',
  'gamelib-engine',
  'tests',
  'fixtures',
  'vectors',
  'engine_twin.json'
)
// `engine_twin.json` holds 386 vectors when recorded (87-12): 158, 34, 51 and 143. Never lower a floor to
// turn a red run green.
const TOTAL_FLOOR = 386
const GROUP_FLOOR = 34

interface Vector {
  id: string
  input: unknown
  expected: unknown
}

const vectors = JSON.parse(readFileSync(VECTORS, 'utf8')) as Record<
  string,
  Vector[]
>

/** A `{ repeat: { char, count } }` generator becomes its string; everything else is copied as it is. */
function materialise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(materialise)
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value)
    const only = entries[0]
    if (entries.length === 1 && only !== undefined && only[0] === 'repeat') {
      const { char, count } = only[1] as { char: string; count: number }
      return char.repeat(count)
    }
    return Object.fromEntries(entries.map(([k, v]) => [k, materialise(v)]))
  }
  return value
}

type Item = Record<string, unknown>

/** What each twin answers for one vector's (expanded) input. */
const REPLAY: Record<string, (input: unknown) => unknown> = {
  engineKeyFor: (input) =>
    engineKeyFor((input as Item).runner as string, (input as Item).appName),
  isWritableEngineOverride: (input) =>
    isWritableEngineOverride((input as Item).value),
  importEngineSettings: (input) => importEngineSettings(input as never),
  getPerGameBottleNameFor: (input) => getPerGameBottleNameFor(input)
}

describe('twin vectors (engine_twin.json)', () => {
  it('anti-vacuity: the file holds the four groups, each over its floor, and answers both ways', () => {
    expect(Object.keys(vectors).sort()).toEqual(Object.keys(REPLAY).sort())
    assertAtOrAboveFloor(
      'engine twin vectors',
      Object.values(vectors).flat().length,
      TOTAL_FLOOR
    )
    for (const [name, list] of Object.entries(vectors)) {
      assertAtOrAboveFloor(
        `engine twin ${name} vectors`,
        list.length,
        GROUP_FLOOR
      )
      const ids = list.map((v) => v.id)
      expect(new Set(ids).size).toBe(ids.length)
      // A group that only ever answers null (or only false) would pass a twin that refuses everything.
      expect(
        list.some((v) => v.expected === null || v.expected === false)
      ).toBe(true)
      expect(
        list.some((v) => v.expected !== null && v.expected !== false)
      ).toBe(true)
    }
  })

  for (const [name, replay] of Object.entries(REPLAY)) {
    it(`${name} answers every recorded vector`, () => {
      const list = vectors[name] ?? []
      const mismatches = list
        .map((v) => ({ id: v.id, got: replay(materialise(v.input)) }))
        .filter(
          (r, i) =>
            JSON.stringify(r.got ?? null) !==
            JSON.stringify((list[i] as Vector).expected)
        )
      expect(mismatches).toEqual([])
    })
  }

  it('a vector whose expected answer is wrong is caught (the replay is not vacuous)', () => {
    const tampered = (vectors['getPerGameBottleNameFor'] ?? []).map((v) =>
      v.expected === 'GameLib-gog-620'
        ? { ...v, expected: 'GameLib-gog-621' }
        : v
    )
    const wrong = tampered.filter(
      (v) =>
        JSON.stringify(
          REPLAY['getPerGameBottleNameFor']?.(materialise(v.input)) ?? null
        ) !== JSON.stringify(v.expected)
    )
    expect(wrong.map((v) => v.id)).toEqual(['bottle-gog-steam-id'])
  })
})
