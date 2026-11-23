/**
 * The twin vector tests (Phase 87, D-24): `engine_twin.json` (87-28) and `bottle_twin.json` (87-39).
 *
 * 87-39 adds the bridge's bottle helpers (`getBottleDir`, `sanitizeBottleName`, `isBottleProvisioned`,
 * `buildFallbackGameSettings`, the three marker views, `isPinnedEngineInstalled`): the second describe block
 * replays the 216 vectors of `bottle_twin.json`, which `twin_vectors.rs` replays against the Rust functions.
 * A vector that names fixtures lays them down from the committed `state/bottles` and `state/engines` trees over a
 * fresh fake profile (the placeholders `<HOME>`, `<TOOLS>`, `<APPFOLDER>`, `<USERDATA>` expanded), exactly as the
 * Rust replay does, and the answer is compared with the profile's roots turned back into placeholders.
 *
 * 87-55 adds `selection_twin.json`: `isNonCrossover` and `engineLogLabel`, the engine selection's two pure helpers
 * (Rust: `EngineSelection::engine` and `EngineSelection::log_label`). The last describe block replays its 83 + 83
 * vectors, which `twin_vectors.rs` replays against the Rust selection.
 *
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
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import {
  ENGINE_PINS,
  buildFallbackGameSettings,
  engineKeyFor,
  engineLogLabel,
  getBottleDir,
  getPerGameBottleNameFor,
  importEngineSettings,
  isBottleProvisioned,
  isNonCrossover,
  isPinnedEngineInstalled,
  isWritableEngineOverride,
  readBottleEngineMarkerKind,
  readBottleEngineMarkerSummary,
  restoreNeedsAbsentPin,
  sanitizeBottleName
} from '../twin'
import type { BottleReadContext } from '../twin'
import type { EngineSelection } from 'common/types/engine'

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

// ---------------------------------------------------------------------------------------------
// bottle_twin.json (87-39): the bridge's sync bottle helpers
// ---------------------------------------------------------------------------------------------

const CRATE_FIXTURES = join(
  REPO_ROOT,
  'src-tauri',
  'crates',
  'gamelib-engine',
  'tests',
  'fixtures'
)
const BOTTLE_VECTORS = join(CRATE_FIXTURES, 'vectors', 'bottle_twin.json')

/** The group counts the file held when recorded (87-11); never lower one to turn a red run green. */
const BOTTLE_GROUP_FLOORS: Record<string, number> = {
  getBottleDir: 16,
  sanitizeBottleName: 31,
  isBottleProvisioned: 25,
  buildFallbackGameSettings: 12,
  readBottleEngineMarkerKind: 25,
  readBottleEngineMarkerSummary: 25,
  restoreNeedsAbsentPin: 46,
  isPinnedEngineInstalled: 36
}
const BOTTLE_TOTAL_FLOOR = 216
const SYNTHETIC_PIN_LABEL = 'Wine-Staging 11.20 + DXVK-macOS 1.10.3 (built-in)'
const BOTTLES_REL = join(
  'Library',
  'Application Support',
  'CrossOver',
  'Bottles'
)

const bottleVectors = JSON.parse(
  readFileSync(BOTTLE_VECTORS, 'utf8')
) as Record<string, Vector[]>

interface SeedEntry {
  path: string
  text?: string
  dir?: boolean
  symlink?: string
}

/** A fresh fake profile laid out as the oracle's (`<HOME>`, `<APPFOLDER>`, `<TOOLS>`, `<USERDATA>`). */
class Profile {
  readonly home = realpathSync(mkdtempSync(join(tmpdir(), 'gamelib-twin-')))
  readonly appFolder = join(this.home, '.config', 'GameLib')
  readonly tools = join(this.appFolder, 'tools')
  readonly userData = join(
    this.home,
    'Library',
    'Application Support',
    'GameLib'
  )

  private readonly roots = (): [string, string][] => [
    ['<TOOLS>', this.tools],
    ['<APPFOLDER>', this.appFolder],
    ['<USERDATA>', this.userData],
    ['<HOME>', this.home]
  ]

  expand(text: string): string {
    return this.roots().reduce(
      (out, [token, root]) => out.split(token).join(root),
      text
    )
  }

  /** Every profile root in `text` as its placeholder, longest root first. */
  normalise<T>(value: T): T {
    const table = this.roots().sort((a, b) => b[1].length - a[1].length)
    return JSON.parse(
      table.reduce(
        (out, [token, root]) => out.split(root).join(token),
        JSON.stringify(value)
      )
    ) as T
  }

  /** Copies a committed fixture tree, expanding placeholders in its text files and keeping modes. */
  copyTree(source: string, target: string): void {
    mkdirSync(target, { recursive: true })
    for (const entry of readdirSync(source, { withFileTypes: true })) {
      const from = join(source, entry.name)
      const to = join(target, entry.name)
      if (entry.isDirectory()) {
        this.copyTree(from, to)
        continue
      }
      const bytes = readFileSync(from)
      if (bytes.includes(0)) copyFileSync(from, to)
      else writeFileSync(to, this.expand(bytes.toString('utf8')))
      chmodSync(to, statSync(from).mode & 0o7777)
    }
  }

  lay(input: Record<string, unknown>): void {
    const engines = input['engines']
    if (typeof engines === 'string' && engines !== 'none') {
      this.copyTree(
        join(CRATE_FIXTURES, 'state', 'engines', engines),
        this.tools
      )
    }
    for (const name of (input['fixtures'] as string[] | undefined) ?? []) {
      this.copyTree(
        join(CRATE_FIXTURES, 'state', 'bottles', name),
        join(this.home, BOTTLES_REL, name)
      )
    }
    for (const entry of (input['seed'] as SeedEntry[] | undefined) ?? []) {
      const target = this.expand(entry.path)
      if (!target.startsWith(this.home))
        throw new Error(`seed outside: ${target}`)
      if (entry.dir) {
        mkdirSync(target, { recursive: true })
        continue
      }
      mkdirSync(dirname(target), { recursive: true })
      if (entry.symlink !== undefined) {
        symlinkSync(this.expand(entry.symlink), target)
      } else {
        writeFileSync(target, this.expand(entry.text ?? ''))
      }
    }
  }

  dispose(): void {
    rmSync(this.home, { recursive: true, force: true })
  }

  /** What the read-only marker views are handed: the home and the pinned-engine owner's two answers. */
  ctx(): BottleReadContext {
    const root = join(this.tools, 'steam-engines')
    return {
      paths: { userHome: this.home },
      fallback: {
        pinnedEngineRoot: () => root,
        isPinnedEngineInstalled: (pin) => isPinnedEngineInstalled(root, pin)
      }
    }
  }
}

/** The pin variants of the `isPinnedEngineInstalled` vectors, derived from the current pin. */
const PIN_VARIANTS: Record<
  string,
  (pin: typeof ENGINE_PINS.current) => typeof ENGINE_PINS.current
> = {
  current: (pin) => pin,
  'wine-sha-differs': (pin) => ({
    ...pin,
    wine: { ...pin.wine, sha256: 'f'.repeat(64) }
  }),
  'dxvk-sha-differs': (pin) => ({
    ...pin,
    dxvk: { ...pin.dxvk, sha256: 'f'.repeat(64) }
  }),
  'other-id': (pin) => ({ ...pin, id: 'wine-staging-0.0' })
}

/** A `sanitizeBottleName` argument: the function takes `string | null` but must survive anything. */
function nameArgument(input: Item): unknown {
  switch (input['kind']) {
    case 'string':
      return input['value']
    case 'null':
      return null
    case 'undefined':
      return undefined
    case 'number':
      return input['value']
    default:
      return {}
  }
}

/** What each bottle helper answers for one vector's (expanded) input, over a fresh profile when it needs one. */
function replayBottle(group: string, input: Item): unknown {
  if (group === 'getBottleDir') {
    return getBottleDir(
      { userHome: input['userHome'] as string },
      input['name'] as string
    )
  }
  if (group === 'sanitizeBottleName') {
    return sanitizeBottleName(nameArgument(input) as string | null)
  }
  const profile = new Profile()
  try {
    profile.lay(input)
    const bottle = (input['bottle'] as string | undefined) ?? ''
    switch (group) {
      case 'isBottleProvisioned':
        return isBottleProvisioned({ userHome: profile.home }, bottle)
      case 'readBottleEngineMarkerKind':
        return readBottleEngineMarkerKind(profile.ctx(), bottle)
      case 'readBottleEngineMarkerSummary':
        return profile.normalise(
          readBottleEngineMarkerSummary(profile.ctx(), bottle)
        )
      case 'restoreNeedsAbsentPin':
        return restoreNeedsAbsentPin(profile.ctx(), bottle)
      case 'buildFallbackGameSettings': {
        const engine = input['engine']
        return profile.normalise(
          buildFallbackGameSettings(
            { userHome: profile.home },
            bottle,
            {
              wineBin: profile.expand(
                '<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wine'
              ),
              wineserverBin: profile.expand(
                '<TOOLS>/steam-engines/wine-staging-11.20/Contents/Resources/wine/bin/wineserver'
              ),
              label: SYNTHETIC_PIN_LABEL,
              version: ENGINE_PINS.current.wine.version,
              dxvk:
                engine === 'no-dxvk'
                  ? null
                  : {
                      dir: profile.expand('<TOOLS>/steam-engines/dxvk'),
                      version: 'v1'
                    }
            },
            JSON.parse(profile.expand(JSON.stringify(input['base'])))
          )
        )
      }
      case 'isPinnedEngineInstalled': {
        const derive = PIN_VARIANTS[input['pin'] as string]
        if (!derive)
          throw new Error(`unknown pin variant ${String(input['pin'])}`)
        return isPinnedEngineInstalled(
          join(profile.tools, 'steam-engines'),
          derive(ENGINE_PINS.current)
        )
      }
      default:
        throw new Error(`unknown vector group ${group}`)
    }
  } finally {
    profile.dispose()
  }
}

describe('twin vectors (bottle_twin.json)', () => {
  it('anti-vacuity: the file holds the eight groups over their floors, answering both ways', () => {
    expect(Object.keys(bottleVectors).sort()).toEqual(
      Object.keys(BOTTLE_GROUP_FLOORS).sort()
    )
    assertAtOrAboveFloor(
      'bottle twin vectors',
      Object.values(bottleVectors).flat().length,
      BOTTLE_TOTAL_FLOOR
    )
    for (const [name, list] of Object.entries(bottleVectors)) {
      assertAtOrAboveFloor(
        `bottle twin ${name} vectors`,
        list.length,
        BOTTLE_GROUP_FLOORS[name] as number
      )
      const ids = list.map((v) => v.id)
      expect(new Set(ids).size).toBe(ids.length)
      // A group that answers one thing for every input would pass a twin that ignores its input.
      expect(
        new Set(list.map((v) => JSON.stringify(v.expected))).size
      ).toBeGreaterThan(1)
      if (!['getBottleDir', 'buildFallbackGameSettings'].includes(name)) {
        // ... and a boolean or nullable group must refuse and accept (a twin that refuses everything); the two
        // groups that always answer a string or an object are covered by the distinct-answers check.
        expect(
          list.some((v) => v.expected === null || v.expected === false)
        ).toBe(true)
        expect(
          list.some((v) => v.expected !== null && v.expected !== false)
        ).toBe(true)
      }
    }
  })

  for (const group of Object.keys(BOTTLE_GROUP_FLOORS)) {
    it(`${group} answers every recorded vector`, () => {
      const list = bottleVectors[group] ?? []
      const mismatches = list
        .map((v) => ({
          id: v.id,
          got: replayBottle(group, materialise(v.input) as Item) ?? null,
          want: v.expected
        }))
        .filter((r) => JSON.stringify(r.got) !== JSON.stringify(r.want))
      expect(mismatches).toEqual([])
    })
  }

  it('a vector whose expected answer is wrong is caught (the replay is not vacuous)', () => {
    const list = bottleVectors['sanitizeBottleName'] ?? []
    const clean = list.find((v) => v.id === 'sanitize-clean') as Vector
    const got = replayBottle('sanitizeBottleName', clean.input as Item)
    expect(got).toBe(clean.expected)
    expect(got).not.toBe(`${String(clean.expected)}-tampered`)
    const pinned = (bottleVectors['isPinnedEngineInstalled'] ?? []).filter(
      (v) => v.expected === true
    )
    expect(pinned.length).toBeGreaterThan(0)
    for (const v of pinned) {
      expect(replayBottle('isPinnedEngineInstalled', v.input as Item)).toBe(
        true
      )
    }
  })
})

// ---------------------------------------------------------------------------------------------
// selection_twin.json (87-55): the engine selection's two pure helpers
// ---------------------------------------------------------------------------------------------

const SELECTION_VECTORS = join(
  REPO_ROOT,
  'src-tauri',
  'crates',
  'gamelib-engine',
  'tests',
  'fixtures',
  'vectors',
  'selection_twin.json'
)
// `selection_twin.json` holds 83 vectors in each of its two groups when recorded (87-55). Never lower a floor to turn
// a red run green.
const SELECTION_GROUP_FLOOR = 83

const selectionVectors = JSON.parse(
  readFileSync(SELECTION_VECTORS, 'utf8')
) as Record<string, Vector[]>

const SELECTION_REPLAY: Record<
  string,
  (selection: EngineSelection) => unknown
> = {
  isNonCrossover: (selection) => isNonCrossover(selection),
  engineLogLabel: (selection) => engineLogLabel(selection)
}

describe('twin vectors (selection_twin.json)', () => {
  it('anti-vacuity: the file holds the two groups, each over its floor, and both answers occur', () => {
    expect(Object.keys(selectionVectors).sort()).toEqual(
      Object.keys(SELECTION_REPLAY).sort()
    )
    for (const [name, list] of Object.entries(selectionVectors)) {
      assertAtOrAboveFloor(
        `selection twin ${name} vectors`,
        list.length,
        SELECTION_GROUP_FLOOR
      )
      const ids = list.map((v) => v.id)
      expect(new Set(ids).size).toBe(ids.length)
      // A group that answered one value for every input would pass a helper that ignores its argument.
      expect(
        new Set(list.map((v) => JSON.stringify(v.expected))).size
      ).toBeGreaterThan(1)
    }
    // Every selection kind and every reason the bridge writes is covered.
    const kinds = new Set(
      (selectionVectors['isNonCrossover'] ?? []).map(
        (v) => (v.input as { selection: EngineSelection }).selection.kind
      )
    )
    expect([...kinds].sort()).toEqual(['crossover', 'pinned', 'wine-manager'])
  })

  for (const [name, replay] of Object.entries(SELECTION_REPLAY)) {
    it(`${name} answers every recorded vector`, () => {
      const list = selectionVectors[name] ?? []
      const mismatches = list
        .map((v) => ({
          id: v.id,
          got: replay((v.input as { selection: EngineSelection }).selection),
          want: v.expected
        }))
        .filter((r) => JSON.stringify(r.got) !== JSON.stringify(r.want))
      expect(mismatches).toEqual([])
    })
  }

  it('a vector whose expected answer is wrong is caught (the replay is not vacuous)', () => {
    const vector = (selectionVectors['engineLogLabel'] ?? []).find(
      (v) => v.id === 'crossover/cx-healthy/27.0.0.1'
    ) as Vector
    const selection = (vector.input as { selection: EngineSelection }).selection
    expect(engineLogLabel(selection)).toBe(vector.expected)
    expect(engineLogLabel(selection)).not.toBe(
      String(vector.expected).replace('27.0.0.1', '27.0.0.2')
    )
    expect(isNonCrossover(selection)).toBe(false)
  })
})
