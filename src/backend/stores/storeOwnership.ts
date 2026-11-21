/**
 * Who owns a store file: the sidecar's view of `GAMELIB_STORE`, `storeOwnership.json` and the
 * store table (Phase 85, FND-06, D-01).
 *
 * The shell (`src-tauri/src/store_boot.rs`) reads the same two JSON files and decides the same
 * question with the same rules, so a store the sidecar mirrors is a store the shell opened:
 *
 *   - `native` rows are always Rust's, `excluded` rows never (`store/migrations`, D-07);
 *   - any other row is Rust's only in `rust` mode and when its own `storeOwnership.json` flag, or
 *     failing that its family's, is set. A store's own flag wins over its family's.
 *
 * A runtime `store_cache/<name>` key the table does not list is a cache-family store (the same
 * stores `storeNew` builds), so it follows the `cache` family flag and its own override, but only
 * when `RECOGNIZED_CACHE_STORE_NAMES` names it (85-12, T-85-30): the shell refuses every other
 * runtime name `not-owned` and creates no file, and `RUNTIME_CACHE_NAMES` in `store_dispatch.rs`
 * is held equal to that list by a test.
 *
 * Pure: no logger, no IPC, no module state. The environment is a parameter.
 */
import ownershipFile from 'common/types/ipc/storeOwnership.json'
import tableFile from 'common/types/ipc/storeTable.json'
import {
  CACHE_STORE_NAME_PATTERN,
  RECOGNIZED_CACHE_STORE_NAMES
} from 'common/types/storePolicy'

export type StoreMode = 'rust' | 'ts'

/** The `GAMELIB_STORE` value echoed into the one warning is cut to this many characters. */
const MODE_ECHO_MAX = 32

/**
 * `GAMELIB_STORE`: unset or `rust` is `rust`, `ts` is `ts`, anything else is `ts` (the safe side:
 * the stack that has always run) with one stderr line naming the value, sanitised and cut.
 */
export function resolveStoreMode(
  env: Readonly<Record<string, string | undefined>> = process.env
): StoreMode {
  const value = env.GAMELIB_STORE
  if (value === undefined || value === 'rust') return 'rust'
  if (value === 'ts') return 'ts'
  const echoed = value.replace(/[^\x20-\x7e]/g, '?').slice(0, MODE_ECHO_MAX)
  process.stderr.write(
    `[storeOwnership] GAMELIB_STORE=${echoed} not recognised; using ts\n`
  )
  return 'ts'
}

interface TableRowShape {
  key: string
  dir: string
  name: string | null
  family: string
  dotPaths: boolean
}

interface OwnershipShape {
  families: Readonly<Record<string, boolean>>
  stores: Readonly<Record<string, boolean>>
}

const ROWS: readonly TableRowShape[] = tableFile.rows
const rowByKey = (key: string): TableRowShape | undefined =>
  ROWS.find((row) => row.key === key)
const GAMES_CONFIG_PREFIX = 'GamesConfig/'
const CACHE_PREFIX = 'store_cache/'

/** A cache store the table does not list: `store_cache/<plain name>`. */
const RUNTIME_CACHE_ROW: Omit<TableRowShape, 'key' | 'name'> = {
  dir: 'store_cache',
  family: 'cache',
  dotPaths: true
}

/** What `GamesConfig/<app>` names: one plain file name, never a path. */
function isPlainAppName(name: string): boolean {
  return (
    name.length > 0 &&
    name.length <= 255 &&
    name !== '.' &&
    name !== '..' &&
    !/[/\\\0]/.test(name) &&
    !name.includes('..')
  )
}

/**
 * The table row a store key names. A listed row with a file name, the `settings/global` document,
 * `GamesConfig/<app>` (the `settings/game` pattern row) and a runtime `store_cache/<name>` resolve;
 * anything else (an unknown directory, a path escape, the pattern row's own key) is `undefined`.
 */
function rowForStoreKey(storeKey: string): TableRowShape | undefined {
  if (storeKey.startsWith(GAMES_CONFIG_PREFIX)) {
    const app = storeKey.slice(GAMES_CONFIG_PREFIX.length)
    const pattern = rowByKey('settings/game')
    return pattern && isPlainAppName(app) ? pattern : undefined
  }
  const row = rowByKey(storeKey)
  if (row) return row.name === null ? undefined : row
  if (storeKey.startsWith(CACHE_PREFIX)) {
    const name = storeKey.slice(CACHE_PREFIX.length)
    return CACHE_STORE_NAME_PATTERN.test(name)
      ? { ...RUNTIME_CACHE_ROW, key: storeKey, name }
      : undefined
  }
  return undefined
}

/** Whether a store key is one the shell would accept in a `store` frame. */
export function isStoreKey(storeKey: string): boolean {
  return rowForStoreKey(storeKey) !== undefined
}

/** The family of a store's table row (`cache`, `settings`, `native`, ...), or `undefined` for a key that names no store. */
export function familyOf(storeKey: string): string | undefined {
  return rowForStoreKey(storeKey)?.family
}

/** Whether a store's keys are dot paths (every row but `store/uploadedLogs`). */
export function dotPathsFor(storeKey: string): boolean {
  return rowForStoreKey(storeKey)?.dotPaths ?? true
}

/**
 * Whether Rust owns the file behind `storeKey` under `mode`. `ownership` is a parameter so a test
 * can flip a family; production reads the committed file. `recognizedRuntimeCaches` is likewise a
 * seam: the names a runtime cache (one the table does not list) must be among to be Rust's.
 */
export function isRustOwned(
  storeKey: string,
  mode: StoreMode,
  ownership: OwnershipShape = ownershipFile,
  recognizedRuntimeCaches: readonly string[] = RECOGNIZED_CACHE_STORE_NAMES
): boolean {
  const row = rowForStoreKey(storeKey)
  if (row === undefined) return false
  if (
    storeKey.startsWith(CACHE_PREFIX) &&
    rowByKey(storeKey) === undefined &&
    !recognizedRuntimeCaches.includes(storeKey.slice(CACHE_PREFIX.length))
  ) {
    return false
  }
  if (row.family === 'native') return true
  if (row.family === 'excluded') return false
  if (mode !== 'rust') return false
  // Own-property lookups: a store key is data, never a prototype name.
  if (Object.hasOwn(ownership.stores, storeKey)) {
    return ownership.stores[storeKey] === true
  }
  return Object.hasOwn(ownership.families, row.family)
    ? ownership.families[row.family] === true
    : false
}

type BootReadOnlyReason = 'newer' | 'failed'

/** What the shell told the sidecar about the stores it opened (`GAMELIB_STORE_BOOT`). */
export interface StoreBootEnv {
  /** Stores that refuse writes, by store key. */
  readonly readOnly: ReadonlyMap<string, BootReadOnlyReason>
  /** Caches that could not be read and continue empty. */
  readonly startEmpty: ReadonlySet<string>
}

const EMPTY_BOOT: StoreBootEnv = {
  readOnly: new Map(),
  startEmpty: new Set()
}

/**
 * Parses `GAMELIB_STORE_BOOT` (`{"readOnly":[{"store","reason"}],"startEmpty":["<key>"]}`, written
 * by `store_boot::boot_env_value`) defensively: a missing value is the empty result, and so is one
 * that is not that shape, with one stderr line. Entries of the wrong shape are skipped.
 */
export function readStoreBootEnv(
  env: Readonly<Record<string, string | undefined>> = process.env
): StoreBootEnv {
  const text = env.GAMELIB_STORE_BOOT
  if (text === undefined || text === '') return EMPTY_BOOT
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    process.stderr.write(
      '[storeOwnership] GAMELIB_STORE_BOOT is not JSON; ignoring it\n'
    )
    return EMPTY_BOOT
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    process.stderr.write(
      '[storeOwnership] GAMELIB_STORE_BOOT is not an object; ignoring it\n'
    )
    return EMPTY_BOOT
  }
  const { readOnly, startEmpty } = parsed as Record<string, unknown>
  const readOnlyMap = new Map<string, BootReadOnlyReason>()
  if (Array.isArray(readOnly)) {
    for (const entry of readOnly as unknown[]) {
      if (typeof entry !== 'object' || entry === null) continue
      const { store, reason } = entry as Record<string, unknown>
      if (
        typeof store === 'string' &&
        (reason === 'newer' || reason === 'failed')
      ) {
        readOnlyMap.set(store, reason)
      }
    }
  }
  const startEmptySet = new Set<string>()
  if (Array.isArray(startEmpty)) {
    for (const key of startEmpty as unknown[]) {
      if (typeof key === 'string') startEmptySet.add(key)
    }
  }
  return { readOnly: readOnlyMap, startEmpty: startEmptySet }
}
