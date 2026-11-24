/**
 * The spawn-class column of a launch golden (88-04, D-11).
 *
 * Every spawn a launch case records is either a `game` (a process that must outlive GameLib) or a
 * `helper` (anything GameLib runs for its own purposes); the Rust side spawns each through
 * `gamelib-proc` with the matching `SpawnClass`. The TS launcher has no such notion, so the class
 * cannot be recorded from it. It is the ONE hand-authored, non-oracle field of a golden: a
 * `classes.json` per crate fixture root maps a call-site id to its class, and `attachSpawnClass`
 * joins it onto the recorded spawns. A spawn whose call site has no class fails the case by name,
 * so a new spawn cannot slip into a golden unclassified.
 *
 * Each slice's MANIFEST must call this column out as hand-authored.
 *
 *   <fixturesRoot(crate)>/golden/classes.json   { "<call-site>": "game" | "helper", ... }
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { fixturesRoot } from 'backend/testUtils/engineWineOracle/recorder'

export type SpawnClass = 'game' | 'helper'

const isSpawnClass = (value: unknown): value is SpawnClass =>
  value === 'game' || value === 'helper'

const has = (object: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(object, key)

/** Reads the crate's `golden/classes.json`; rejects anything but `game` or `helper`. */
export function loadClasses(crate: string): Record<string, SpawnClass> {
  const file = join(fixturesRoot(crate), 'golden', 'classes.json')
  let parsed: unknown
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'))
  } catch (error) {
    throw new Error(
      `${crate}: cannot read golden/classes.json (${(error as Error).message})`
    )
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${crate}: golden/classes.json must be an object`)
  }
  const out: Record<string, SpawnClass> = {}
  for (const [site, value] of Object.entries(parsed)) {
    if (!isSpawnClass(value)) {
      throw new Error(
        `${crate}: golden/classes.json call site "${site}" has class ${JSON.stringify(value)}; it must be "game" or "helper"`
      )
    }
    out[site] = value
  }
  return out
}

/**
 * Returns each spawn with a `class` taken from `classes[callSite]`. Throws naming the call site
 * when one has no class. The input spawns are not changed.
 */
export function attachSpawnClass<T extends { callSite: string }>(
  spawns: readonly T[],
  classes: Readonly<Record<string, SpawnClass>>
): (T & { class: SpawnClass })[] {
  return spawns.map((spawn) => {
    const spawnClass = has(classes, spawn.callSite)
      ? classes[spawn.callSite]
      : undefined
    if (spawnClass === undefined) {
      throw new Error(
        `spawn class: call site "${spawn.callSite}" has no entry in classes.json`
      )
    }
    return { ...spawn, class: spawnClass }
  })
}
