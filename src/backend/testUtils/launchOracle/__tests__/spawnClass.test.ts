/**
 * Self-tests for the spawn-class column (88-04, D-11): a recorded spawn must carry the one
 * hand-authored, non-oracle field, and a call site without a class must fail by name.
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { overrideFixturesRoot } from 'backend/testUtils/engineWineOracle/recorder'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { attachSpawnClass, loadClasses } from '../spawnClass'

const CRATE = 'gamelib-selftest'

/** Runs `fn` with fixtures pointed at a fresh temp root holding `classes.json` = `content`. */
function withClassesFile<T>(content: string | null, fn: () => T): T {
  const scratch = createFakeHomeProfile({ prefix: 'gamelib-spawnclass-' })
  const root = join(scratch.root, 'fixtures')
  const restore = overrideFixturesRoot(root)
  try {
    if (content !== null) {
      mkdirSync(join(root, 'golden'), { recursive: true })
      writeFileSync(join(root, 'golden', 'classes.json'), content)
    }
    return fn()
  } finally {
    restore()
    scratch.dispose()
  }
}

describe('attachSpawnClass', () => {
  const spawns = [
    { callSite: 'launch/game', program: 'wine' },
    { callSite: 'launch/script', program: 'sh' }
  ]
  const classes = { 'launch/game': 'game', 'launch/script': 'helper' } as const

  it('adds the class of each call site and leaves the input untouched', () => {
    const out = attachSpawnClass(spawns, classes)
    expect(out).toEqual([
      { callSite: 'launch/game', program: 'wine', class: 'game' },
      { callSite: 'launch/script', program: 'sh', class: 'helper' }
    ])
    expect(spawns[0]).not.toHaveProperty('class')
  })

  it('throws naming the call site when a spawn has no class (planted gap)', () => {
    const planted = { 'launch/game': 'game' } as const
    expect(() => attachSpawnClass(spawns, planted)).toThrow(/launch\/script/)
  })

  it('does not treat an inherited property as a class', () => {
    expect(() => attachSpawnClass([{ callSite: 'toString' }], classes)).toThrow(
      /toString/
    )
  })
})

describe('loadClasses', () => {
  it('reads <fixturesRoot>/golden/classes.json', () => {
    const out = withClassesFile(
      JSON.stringify({ a: 'game', b: 'helper' }),
      () => loadClasses(CRATE)
    )
    expect(out).toEqual({ a: 'game', b: 'helper' })
  })

  it('rejects a value other than game or helper, naming the call site', () => {
    expect(() =>
      withClassesFile(JSON.stringify({ a: 'game', b: 'daemon' }), () =>
        loadClasses(CRATE)
      )
    ).toThrow(/b.*daemon|daemon.*b/)
  })

  it('rejects a file that is not an object of strings', () => {
    expect(() => withClassesFile('[]', () => loadClasses(CRATE))).toThrow(
      /classes\.json/
    )
  })

  it('throws when classes.json is missing', () => {
    expect(() => withClassesFile(null, () => loadClasses(CRATE))).toThrow(
      /classes\.json/
    )
  })
})
