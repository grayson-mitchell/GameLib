/**
 * Sidecar file store (Phase 27 Plan 02 — Task 1).
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
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync
} from 'graceful-fs'
import { dirname, isAbsolute, join } from 'path'
import { getPath } from './pathShim'

export interface FileStoreOptions {
  cwd?: string
  name?: string
  // electron-store accepts additional options (defaults, schema,
  // clearInvalidConfig, ...) that GameLib's call sites pass but this
  // headless replacement does not need to act on.
  [key: string]: unknown
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

function getAtPath(obj: Record<string, unknown>, path: string): unknown {
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
  private data: Record<string, unknown>

  constructor(options: FileStoreOptions = {}) {
    this.filePath = resolveStorePath(options)
    this.data = this.load()
  }

  private load(): Record<string, unknown> {
    if (!existsSync(this.filePath)) return {}
    try {
      const raw = readFileSync(this.filePath, 'utf-8')
      return raw.trim() ? JSON.parse(raw) : {}
    } catch {
      // Mirrors electron-store's clearInvalidConfig behavior — a corrupt
      // file is treated as an empty store rather than a fatal error.
      return {}
    }
  }

  private persist(): void {
    const dir = dirname(this.filePath)
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true })
    }
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }

  has(key: string): boolean {
    return getAtPath(this.data, key) !== undefined
  }

  get(key: string, defaultValue?: unknown): unknown {
    const value = getAtPath(this.data, key)
    return value === undefined ? defaultValue : value
  }

  set(key: string, value: unknown): void {
    setAtPath(this.data, key, value)
    this.persist()
  }

  delete(key: string): void {
    deleteAtPath(this.data, key)
    this.persist()
  }

  clear(): void {
    this.data = {}
    this.persist()
  }

  get store(): Record<string, unknown> {
    return this.data
  }

  set store(value: Record<string, unknown>) {
    this.data = value
    this.persist()
  }

  [Symbol.iterator](): IterableIterator<[string, unknown]> {
    return Object.entries(this.data)[Symbol.iterator]()
  }
}
