/**
 * The shared fuzzy title-match vectors, replayed against the TypeScript (94-06 Task 3, Pitfall 7).
 *
 * The fuzzy match lives twice: `titleMatch.ts` stays for the renderer (`RedeemSteamKeyDialog`,
 * `common/discounts/badges.ts`) and the Humble ownership dedup, and the Rust port (94-15) carries
 * its own copy. `fixtures/titleMatchVectors.json` is the one vector file both languages replay, so
 * the copies cannot drift. This test replays every vector against the TS; the Rust test reads the
 * same file.
 *
 * `GAMELIB_WRITE_HUMBLE_GOLDEN=1` rewrites the file from `INPUTS` below by running the TS on each
 * pair (no expected value is typed by hand), after which the file must be formatted with prettier
 * (`npx prettier --write`). The default mode replays it.
 *
 * What the inputs cover, and why:
 *   - non-ASCII text: `normalizeTitle` keeps only `[a-z0-9]` and whitespace, so an accented letter
 *     becomes a space (`pok mon`) and a CJK title normalises to nothing. A Rust port that kept
 *     Unicode letters would match where the TS does not, and `fastest-levenshtein` counts UTF-16
 *     units, so a surrogate pair is two units where a `char` count would say one;
 *   - pairs at, just below and just above the 0.85 threshold, on the normalised length;
 *   - the DLC and remaster guards, edition suffixes, `\b` boundaries, parentheticals, punctuation
 *     only, empty and whitespace titles.
 */
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  HUMBLE_FUZZY_MATCH_THRESHOLD,
  fuzzyMatch,
  normalizeTitle,
  titleSimilarity
} from '../titleMatch'

interface TitleMatchVector {
  a: string
  b: string
  normalizedA: string
  normalizedB: string
  /** `1 - distance / maxLen` over the normalised titles, 0 when either is empty. */
  similarity: number
  fuzzyMatch: boolean
}

const VECTORS_FILE = join(__dirname, 'fixtures', 'titleMatchVectors.json')

/** The vector floor the test itself carries, so lowering the file alone cannot weaken it. */
const VECTOR_FLOOR = 60

const INPUTS: readonly (readonly [string, string])[] = [
  // The documented must-match fixtures.
  ['Assault Android Cactus+', 'Assault Android Cactus'],
  ['FRAMED Collection', 'Framed Collection'],
  ['Into the Breach', 'Into The Breach (Steam)'],
  ['Stardew Valley', 'Stardew Valley'],
  ['Portal 2', 'Portal 2'],
  // Identical modulo case, spacing, punctuation.
  ['HADES', 'hades'],
  ['Half-Life 2', 'Half Life 2'],
  ['Half-Life: Alyx', 'Half Life Alyx'],
  ['  Spaced   Out  ', 'Spaced Out'],
  ["Baldur's Gate 3", 'Baldurs Gate 3'],
  [
    'Dr. Langeskov, The Tiger, and The Terribly Cursed Emerald',
    'Dr Langeskov The Tiger and The Terribly Cursed Emerald'
  ],
  // Trademark symbols and parentheticals.
  ['DOOM™', 'DOOM'],
  ['Alan Wake®', 'Alan Wake'],
  ['Hades © Supergiant', 'Hades Supergiant'],
  ['Celeste (Steam)', 'Celeste'],
  ['Celeste (Windows) (Steam Key)', 'Celeste'],
  ['(Steam) Celeste', 'Celeste'],
  ['Unbalanced (paren', 'Unbalanced'],
  // Edition suffixes: stripped, on a word boundary.
  ['Game of the Year Edition Fallout 3', 'Fallout 3'],
  [
    'The Witcher 3: Wild Hunt - Game of the Year Edition',
    'The Witcher 3: Wild Hunt'
  ],
  ['Metro 2033 Redux Definitive Edition', 'Metro 2033 Redux'],
  ['Skyrim Enhanced Edition', 'Skyrim'],
  ['Tomb Raider Anniversary Edition', 'Tomb Raider'],
  ['Civilization Complete Edition', 'Civilization'],
  ['Dishonored Ultimate Edition', 'Dishonored'],
  ['Payday Deluxe Edition', 'Payday'],
  ['Dungeon Standard Edition', 'Dungeon'],
  ['Borderlands GOTY', 'Borderlands'],
  ['Borderlands GOTY Edition', 'Borderlands'],
  ['Borderlands GOTYX', 'Borderlands'],
  ['Mirror Collection', 'Mirror'],
  ['Mirror Collections', 'Mirror'],
  ['The Collection Agency', 'The Agency'],
  // DLC guard: the longer raw title carries a keyword the shorter does not.
  ['Game X: Season Pass', 'Game X'],
  ['Game X', 'Game X: Season Pass'],
  ['Game X: Season Pass', 'Game X: Season Pass'],
  ['Hades Soundtrack', 'Hades'],
  ['Hades DLC', 'Hades'],
  ['Hades Expansion', 'Hades'],
  ['Hades Artbook', 'Hades'],
  ['Hades Art Book', 'Hades'],
  ['Hades Content Pack', 'Hades'],
  ['Hades Bonus Content', 'Hades'],
  ['Hades Upgrade Pack', 'Hades'],
  ['Hades dlc', 'Hades DLC'],
  // Remaster and remake guard.
  ['Portal 2 Remastered', 'Portal 2'],
  ['Portal 2', 'Portal 2 Remastered'],
  ['Portal 2 Remastered', 'Portal 2 Remastered'],
  ['Resident Evil 2 Remake', 'Resident Evil 2'],
  ['Remake Tactics', 'Tactics'],
  // Substring is not a match.
  ['Batman', 'Batman: Arkham Knight'],
  ['Batman: Arkham Knight', 'Batman: Arkham City'],
  ['Totally Different', 'Portal 2'],
  ['Game', 'Game 2'],
  ['Doom', 'Doom 2'],
  // Non-ASCII that normalises to ASCII with a space where the letter was.
  ['Pokémon Café', 'Pokemon Cafe'],
  ['Pokémon Café', 'Pok mon Caf'],
  ['Pokémon', 'Pokmon'],
  ['Café', 'Cafe'],
  ['Naïve', 'Naive'],
  ['Über', 'Uber'],
  ['Zoë', 'Zoe'],
  ['Mañana', 'Manana'],
  ['straße', 'strasse'],
  ['Æon', 'Aeon'],
  ['İstanbul', 'Istanbul'],
  ['Ｈades', 'Hades'],
  ['Café Collection', 'Café'],
  // Non-ASCII that normalises to nothing.
  ['日本語のタイトル', '日本語のタイトル'],
  ['日本語のタイトル', '別のタイトル'],
  ['日本語のタイトル', 'Hades'],
  ['Привет мир', 'Привет мир'],
  ['ΣΊΣΥΦΟΣ', 'ΣΊΣΥΦΟΣ'],
  ['🎮🎮', '🎮🎮'],
  ['Hades 🎮', 'Hades'],
  ['Hades 🎮🎮', 'Hades 🎮'],
  // Punctuation only, empty, whitespace.
  ['!!!', '???'],
  ['!!!', '!!!'],
  ['...', 'Hades'],
  ['', ''],
  ['', 'Hades'],
  ['Hades', ''],
  ['   ', '   '],
  ['\t\n', 'Hades'],
  // Digits and roman numerals are different titles.
  ['Final Fantasy 7', 'Final Fantasy VII'],
  ['Final Fantasy 7', 'Final Fantasy 7'],
  ['Left 4 Dead 2', 'Left 4 Dead'],
  ['Tekken 7', 'Tekken 8'],
  // Distance ratios around 0.85 on the normalised length L (d = edit distance).
  // L=7, d=1 -> 0.857 (above)
  ['abcdefg', 'abcdefh'],
  // L=6, d=1 -> 0.833 (below)
  ['abcdef', 'abcdeg'],
  // L=14, d=2 -> 0.857 (above)
  ['abcdefghijklmn', 'abcdefghijklxy'],
  // L=13, d=2 -> 0.846 (below)
  ['abcdefghijklm', 'abcdefghijkxy'],
  // L=27, d=4 -> 0.852 (above)
  ['abcdefghijklmnopqrstuvwxyza', 'abcdefghijklmnopqrstuvwqqqq'],
  // L=26, d=4 -> 0.846 (below)
  ['abcdefghijklmnopqrstuvwxyz', 'abcdefghijklmnopqrstuvabcd'],
  // L=20, d=3 -> 0.85 (the threshold itself)
  ['abcdefghijklmnopqrst', 'abcdefghijklmnopqxyz'],
  // L=20, d=2 -> 0.9 (above), d=4 -> 0.8 (below)
  ['abcdefghijklmnopqrst', 'abcdefghijklmnopqrxy'],
  ['abcdefghijklmnopqrst', 'abcdefghijklmnopwxyz'],
  // L=40, d=6 -> 0.85 (the threshold itself)
  [
    'abcdefghijklmnopqrstabcdefghijklmnopqrst',
    'abcdefghijklmnopqrstabcdefghijklmnxyzxyz'
  ],
  // L=60, d=9 -> 0.85 (the threshold itself)
  [
    'abcdefghijklmnopqrstabcdefghijklmnopqrstabcdefghijklmnopqrst',
    'abcdefghijklmnopqrstabcdefghijklmnopqrstabcdefghijkxyzxyzxyz'
  ],
  // Different lengths: the distance counts the insertions.
  ['abcdefghijklmnopqrst', 'abcdefghijklmnopqrstuvw'],
  ['abcdefghij', 'abcdefghijklm']
]

/** The vector for one pair, from the TypeScript. */
function vectorFor(a: string, b: string): TitleMatchVector {
  return {
    a,
    b,
    normalizedA: normalizeTitle(a),
    normalizedB: normalizeTitle(b),
    similarity: titleSimilarity(a, b),
    fuzzyMatch: fuzzyMatch(a, b)
  }
}

/** Throws below the floor: a replay of too few vectors proves nothing. */
function assertAtFloor(vectors: readonly TitleMatchVector[]): void {
  if (vectors.length < VECTOR_FLOOR) {
    throw new Error(
      `title-match vectors: ${vectors.length}, below the floor of ${VECTOR_FLOOR}`
    )
  }
}

/** Every way a vector disagrees with what the TypeScript returns today. */
function replay(vectors: readonly TitleMatchVector[]): string[] {
  const failures: string[] = []
  vectors.forEach((v, index) => {
    const label = `#${index} ${JSON.stringify(v.a)} vs ${JSON.stringify(v.b)}`
    if (normalizeTitle(v.a) !== v.normalizedA) {
      failures.push(`${label}: normalizedA`)
    }
    if (normalizeTitle(v.b) !== v.normalizedB) {
      failures.push(`${label}: normalizedB`)
    }
    if (titleSimilarity(v.a, v.b) !== v.similarity) {
      failures.push(`${label}: similarity`)
    }
    if (fuzzyMatch(v.a, v.b) !== v.fuzzyMatch) {
      failures.push(`${label}: fuzzyMatch`)
    }
  })
  return failures
}

if (process.env.GAMELIB_WRITE_HUMBLE_GOLDEN === '1') {
  writeFileSync(
    VECTORS_FILE,
    `${JSON.stringify(
      INPUTS.map(([a, b]) => vectorFor(a, b)),
      null,
      2
    )}\n`
  )
}

const loadVectors = (): TitleMatchVector[] =>
  JSON.parse(readFileSync(VECTORS_FILE, 'utf8')) as TitleMatchVector[]

describe('shared fuzzy title-match vectors', () => {
  it('replays every vector against titleMatch.ts', () => {
    const vectors = loadVectors()
    assertAtFloor(vectors)
    expect(replay(vectors)).toEqual([])
  })

  it('holds at least the floor of vectors, one per input pair', () => {
    const vectors = loadVectors()
    expect(vectors.length).toBeGreaterThanOrEqual(VECTOR_FLOOR)
    expect(vectors.map((v) => [v.a, v.b])).toEqual(
      INPUTS.map(([a, b]) => [a, b])
    )
  })

  it('an empty vector file fails the floor and replays nothing', () => {
    expect(() => assertAtFloor([])).toThrow(/below the floor/)
  })

  it('covers both verdicts, non-ASCII inputs, empty normalisations and both sides of the threshold', () => {
    const vectors = loadVectors()
    expect(vectors.filter((v) => v.fuzzyMatch).length).toBeGreaterThanOrEqual(
      15
    )
    expect(vectors.filter((v) => !v.fuzzyMatch).length).toBeGreaterThanOrEqual(
      15
    )
    // eslint-disable-next-line no-control-regex
    const nonAscii = /[^\u0000-\u007f]/
    expect(
      vectors.filter((v) => nonAscii.test(v.a) || nonAscii.test(v.b)).length
    ).toBeGreaterThanOrEqual(15)
    expect(
      vectors.filter(
        (v) =>
          (nonAscii.test(v.a) && v.normalizedA === '') ||
          (nonAscii.test(v.b) && v.normalizedB === '')
      ).length
    ).toBeGreaterThanOrEqual(5)
    // The threshold itself, a pair just below it and one just above it.
    const below = vectors.filter(
      (v) => v.similarity >= 0.8 && v.similarity < HUMBLE_FUZZY_MATCH_THRESHOLD
    )
    const above = vectors.filter(
      (v) => v.similarity >= HUMBLE_FUZZY_MATCH_THRESHOLD && v.similarity <= 0.9
    )
    expect(below.length).toBeGreaterThanOrEqual(3)
    expect(above.length).toBeGreaterThanOrEqual(3)
    expect(
      vectors.some((v) => v.similarity === HUMBLE_FUZZY_MATCH_THRESHOLD)
    ).toBe(true)
  })

  it('a mutated copy fails the replay (one fuzzyMatch flipped)', () => {
    const vectors = loadVectors()
    const mutated = vectors.map((v, i) =>
      i === 0 ? { ...v, fuzzyMatch: !v.fuzzyMatch } : v
    )
    expect(replay(mutated)).toEqual([expect.stringContaining('fuzzyMatch')])
  })

  it('a mutated normalisation or similarity also fails the replay', () => {
    const vectors = loadVectors()
    const normalised = vectors.map((v, i) =>
      i === 1 ? { ...v, normalizedA: `${v.normalizedA}x` } : v
    )
    expect(replay(normalised)).toEqual([expect.stringContaining('normalizedA')])
    const similar = vectors.map((v, i) =>
      i === 2 ? { ...v, similarity: v.similarity + 0.01 } : v
    )
    expect(replay(similar)).toEqual([expect.stringContaining('similarity')])
  })
})
