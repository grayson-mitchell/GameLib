/** RED stub: replaced by the real column in the GREEN commit. */
export type SpawnClass = 'game' | 'helper'

export function loadClasses(_crate: string): Record<string, SpawnClass> {
  return {}
}

export function attachSpawnClass<T extends { callSite: string }>(
  spawns: readonly T[],
  _classes: Readonly<Record<string, SpawnClass>>
): (T & { class: SpawnClass })[] {
  return spawns as (T & { class: SpawnClass })[]
}
