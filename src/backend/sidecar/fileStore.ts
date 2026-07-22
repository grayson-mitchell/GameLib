/**
 * Sidecar file store (Phase 27 Plan 02 — Task 1; hardened Phase 29 Plan 01).
 *
 * Minimal synchronous, file-backed replacement for `electron-store`, which
 * throws at construction time under bare Node ("You need to call
 * .initRenderer() from the main process" — spike 009, the second import-time
 * wall). Implements the subset of electron-store's surface GameLib's backend
 * actually calls: `get`/`set`/`has`/`delete`/`clear`, the `.store`
 * getter/setter, and iteration (`Symbol.iterator`, used by
 * `backend/cache.ts`'s `use_in_memory()`).
 *
 * Writes the SAME on-disk JSON layout electron-store itself uses (cwd
 * resolved relative to `app.getPath('userData')` unless absolute; file at
 * `${cwd}/${name}.json`), so a sidecar-written value and an Electron-build-
 * written value read back identically.
 *
 * T-27-03 (Tampering — fileStore JSON path resolution): the on-disk path is
 * resolved ONLY from `pathShim.getPath('userData')` plus the constructor's
 * own `options.cwd`/`options.name` — both fixed at construction time by
 * backend code (e.g. `configStore = new TypeCheckedStoreBackend('configStore',
 * { cwd: 'store' })`), never from an RPC-supplied path. A malicious/malformed
 * request frame cannot redirect a write outside the GameLib config dir.
 *
 * D-14 (in-process same-path sharing): `steamConfigStore` and
 * `steamBottleConfigStore` (src/backend/storeManagers/steam/electronStores.ts)
 * both construct with `{ cwd: 'steam_store' }` and no `name`, so BOTH resolve
 * to the same on-disk file, `${userData}/steam_store/config.json`. Real
 * Electron's `electron-store`/`conf` survives this because it re-reads the
 * file on every access; this file previously cached the loaded JSON once per
 * `FileStore` instance, so the second instance's in-memory copy silently
 * clobbered the first instance's writes on the next `persist()`. `cellRegistry`
 * below keys a single shared `{ data }` cell by resolved `filePath`, so every
 * `FileStore` instance pointed at the same file reads/writes the SAME
 * in-memory object — matching electron-store's effective behavior without
 * re-reading from disk on every call. `new FileStore()` still returns a
 * distinct object each time; only the underlying `data` is shared.
 *
 * D-07 (ACCEPTED cross-process write clobber): the Electron build and the
 * Tauri sidecar build can, in principle, run concurrently against the same
 * `userData` folder. Each process caches the whole JSON file in memory (this
 * cell registry only dedups WITHIN one process) and rewrites it wholesale on
 * every `persist()`, so running both concurrently against the same file can
 * silently erase one process's writes with the other's stale in-memory copy.
 * This is accepted, not engineered around — the shipped product is one app,
 * never both builds live at once against the same profile. The same note is
 * recorded in `.planning/phases/27-tauri-shell-walking-skeleton/SEAM.md`.
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'graceful-fs'
import { dirname, isAbsolute, join } from 'path'
import { isSafeKeyPath } from 'common/types/storePolicy'
import { getPath } from './pathShim'

export interface FileStoreOptions {
  cwd?: string
  name?: string
  // electron-store accepts additional options (defaults, schema,
  // clearInvalidConfig, ...) that GameLib's call sites pass but this
  // headless replacement does not need to act on. `defaults` IS honoured
  // (see the constructor) — every other key is accepted for call-site
  // compatibility and otherwise ignored.
  defaults?: Record<string, unknown>
  [key: string]: unknown
}

interface FileStoreCell {
  data: Record<string, unknown>
}

// D-14: one shared data cell per resolved on-disk path, scoped to this
// process. Test-only reset below; production code never calls it.
const cellRegistry = new Map<string, FileStoreCell>()

/**
 * Test-only. Clears the shared cell registry so each test file/case starts
 * from a clean in-memory state. Production code must never call this — doing
 * so would desync any already-constructed `FileStore` instance from the
 * registry (it would keep its own object reference while a NEW cell gets
 * created for the next `new FileStore()` on the same path).
 */
export function __resetFileStoreRegistry(): void {
  cellRegistry.clear()
}

function resolveStorePath(options: FileStoreOptions): string {
  const name = options.name ?? 'config'
  const { cwd } = options
  const baseDir = cwd
    ? isAbsolute(cwd)
      ? cwd
      : join(getPath('userData'), cwd)
    : getPath('userData')
  return join(baseDir, `${name}.json`)
}

/**
 * CR-01 (Phase 29 code review): key paths arrive here from renderer-controlled
 * `storeSet`/`storeDelete` frames. `electron-store` — the module this file
 * replaces — delegates path access to `dot-prop`, which rejects these three
 * segment names outright (`dot-prop`'s own `disallowedKeys`). Replacing the
 * library without carrying that guard forward reintroduced a prototype-
 * pollution class the original was immune to: walking `cursor['__proto__']`
 * lands the cursor on `Object.prototype`, and the final assignment then
 * pollutes every object in the sidecar process — the same process that holds
 * Steam session material and dispatches every RPC handler.
 *
 * The guard is applied in ALL THREE path helpers (read, write, delete) so a
 * hostile key can neither probe nor mutate the prototype chain. The segment
 * list itself is single-sourced from `common/types/storePolicy` (a pure,
 * side-effect-free, Electron-free module) so this layer and the policy layer
 * cannot drift apart on what "hostile key" means.
 *
 * `rejectUnsafePath` logs ONE stderr line naming the rejected operation. It
 * never logs the key path or the value — these stores hold token material
 * (T-28-04 convention).
 */
function rejectUnsafePath(op: string): void {
  process.stderr.write(
    `[sidecar/fileStore] rejected a ${op} with a disallowed key path segment\n`
  )
}

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
  if (!isSafeKeyPath(path)) {
    rejectUnsafePath('read')
    return undefined
  }
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc && typeof acc === 'object') {
      return (acc as Record<string, unknown>)[segment]
    }
    return undefined
  }, obj)
}

function setAtPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  if (!isSafeKeyPath(path)) {
    rejectUnsafePath('write')
    return
  }
  const segments = path.split('.')
  const last = segments.pop() as string
  let cursor = obj
  for (const segment of segments) {
    const next = cursor[segment]
    if (typeof next !== 'object' || next === null) {
      cursor[segment] = {}
    }
    cursor = cursor[segment] as Record<string, unknown>
  }
  cursor[last] = value
}

function deleteAtPath(obj: Record<string, unknown>, path: string): void {
  if (!isSafeKeyPath(path)) {
    rejectUnsafePath('delete')
    return
  }
  const segments = path.split('.')
  const last = segments.pop() as string
  let cursor: Record<string, unknown> | undefined = obj
  for (const segment of segments) {
    if (!cursor || typeof cursor[segment] !== 'object') return
    cursor = cursor[segment] as Record<string, unknown>
  }
  if (cursor) delete cursor[last]
}

export default class FileStore {
  private readonly filePath: string
  private readonly cell: FileStoreCell

  constructor(options: FileStoreOptions = {}) {
    this.filePath = resolveStorePath(options)

    let cell = cellRegistry.get(this.filePath)
    if (!cell) {
      const data = load(this.filePath)

      // D-02b: seed `options.defaults` UNDER the loaded data — on-disk
      // values win over defaults; a key present only in `defaults` reads
      // back as the default. Intentional deviation from electron-store/
      // `conf` (which persists defaults to disk at construction): D-02's
      // "full semantics parity NOT required" bar does not require that, and
      // writing on construction would fight D-14's shared-cell/D-07
      // accepted-clobber model. Defaults are NOT written to disk here.
      if (
        options.defaults &&
        typeof options.defaults === 'object' &&
        !Array.isArray(options.defaults)
      ) {
        for (const [key, value] of Object.entries(options.defaults)) {
          if (getAtPath(data, key) === undefined) {
            setAtPath(data, key, value)
          }
        }
      }

      cell = { data }
      cellRegistry.set(this.filePath, cell)
    }
    this.cell = cell
  }

  private persist(): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    const serialized = JSON.stringify(this.cell.data, null, 2)
    const tmpPath = `${this.filePath}.tmp-${process.pid}`
    try {
      // D-10: write to a temp file then rename onto the real path, so a
      // crash mid-persist cannot truncate/corrupt the config file — the
      // rename is atomic on the same filesystem, and readers only ever see
      // either the old complete file or the new complete file.
      writeFileSync(tmpPath, serialized)
      renameSync(tmpPath, this.filePath)
    } catch (err) {
      // T-29-02/T-29-03: never lose a persist — fall back to a direct write.
      // Never log `data`/`serialized` here; these stores hold token material.
      process.stderr.write(
        `[sidecar/fileStore] atomic persist (temp+rename) failed for a store file, falling back to direct write: ${
          err instanceof Error ? err.message : String(err)
        }\n`
      )
      writeFileSync(this.filePath, serialized)
    }
  }

  has(key: string): boolean {
    return getAtPath(this.cell.data, key) !== undefined
  }

  get(key: string, defaultValue?: unknown): unknown {
    const value = getAtPath(this.cell.data, key)
    return value === undefined ? defaultValue : value
  }

  set(key: string, value: unknown): void {
    setAtPath(this.cell.data, key, value)
    this.persist()
  }

  delete(key: string): void {
    deleteAtPath(this.cell.data, key)
    this.persist()
  }

  clear(): void {
    this.cell.data = {}
    this.persist()
  }

  get store(): Record<string, unknown> {
    return this.cell.data
  }

  set store(value: Record<string, unknown>) {
    this.cell.data = value
    this.persist()
  }

  [Symbol.iterator](): IterableIterator<[string, unknown]> {
    return Object.entries(this.cell.data)[Symbol.iterator]()
  }
}

function load(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) return {}
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return raw.trim() ? JSON.parse(raw) : {}
  } catch {
    // Mirrors electron-store's clearInvalidConfig behavior — a corrupt
    // file is treated as an empty store rather than a fatal error.
    return {}
  }
}
