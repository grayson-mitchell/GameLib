/**
 * The schema version the shell stamps on a store at rest, by store key, for the test disk sink and
 * the suites that assert a stamped file (85-23). It mirrors the shell's migration table
 * (`gamelib-store` `Chains::baseline`): settings global and game at v2, the seven library chains at
 * v3, every other store at the baseline v1. Pure, no module state.
 *
 * It replaces the TS versioning engine's `currentVersionOf` for these callers, which went with the
 * engine; a store the table does not name is at v1, as in the shell.
 */
const AT_ABOVE_BASELINE: Readonly<Record<string, number>> = {
  'settings/global': 2,
  'settings/game': 2,
  'store_cache/steam_library': 3,
  'store_cache/gog_library': 3,
  'gog_store/installed': 3,
  'store_cache/legendary_library': 3,
  'store_cache/nile_library': 3,
  'sideload_apps/library': 3,
  'store/download-manager': 3
}

export function storeSchemaVersionOf(storeKey: string): number {
  return AT_ABOVE_BASELINE[storeKey] ?? 1
}
