/**
 * Private atomic write and pre-migration backups (Phase 68, D-08).
 *
 * Deliberately does NOT import `backend/logger`: logger/index.ts imports
 * backend/config and backend/game_config, and logger/stores.ts constructs a
 * store, so importing it from code that store_backend.ts reaches creates a
 * module-init cycle. Diagnostics go to process.stderr, and never carry file
 * contents (T-28-04): these stores hold token material.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from 'graceful-fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'path'

const MAX_BACKUPS_PER_STORE = 3

const errMessage = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

/**
 * Temp-then-rename write at mode 0o600. The parent directory is created 0o700
 * only when absent. Falls back to a direct write when the rename fails, then
 * best-effort removes the orphaned temp file.
 */
export function atomicWritePrivate(
  filePath: string,
  text: string | Buffer
): void {
  const dir = dirname(filePath)
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
  const tmpPath = `${filePath}.tmp-${process.pid}`
  try {
    writeFileSync(tmpPath, text, { mode: 0o600 })
    renameSync(tmpPath, filePath)
  } catch (err) {
    process.stderr.write(
      `[storeVersion] atomic write failed for ${basename(filePath)}: ${errMessage(err)}\n`
    )
    writeFileSync(filePath, text, { mode: 0o600 })
    try {
      unlinkSync(tmpPath)
    } catch {
      /* best effort: the temp file may not exist */
    }
  }
}

function assertInside(candidate: string, root: string): void {
  const rel = relative(resolve(root), resolve(candidate))
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) {
    throw new Error(
      '[storeVersion] refusing a backup path that resolves outside its store directory'
    )
  }
}

function storeName(storePath: string): string {
  const name = basename(storePath, '.json')
  if (name === '' || name === '.' || name === '..') {
    throw new Error('[storeVersion] refusing a store path with no usable name')
  }
  return name
}

const escapeRegExp = (s: string): string =>
  s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

const STAMP_RE = '\\d{8}T\\d{9}Z'

function backupPattern(name: string): RegExp {
  return new RegExp(
    `^${escapeRegExp(name)}\\.v\\d+\\.(${STAMP_RE})\\.bak\\.json$`
  )
}

/** Sorted ascending (oldest first) by the embedded stamp. */
export function listBackups(storePath: string): string[] {
  const dir = dirname(storePath)
  if (!existsSync(dir)) return []
  const re = backupPattern(storeName(storePath))
  const found: { file: string; stamp: string }[] = []
  for (const entry of readdirSync(dir)) {
    const m = re.exec(entry)
    if (m?.[1]) found.push({ file: join(dir, entry), stamp: m[1] })
  }
  found.sort((a, b) =>
    a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : a.file < b.file ? -1 : 1
  )
  return found.map((f) => f.file)
}

function stampOf(d: Date): string {
  return d.toISOString().replace(/[-:]/g, '').replace('.', '')
}

/**
 * Writes `<name>.v<from>.<UTC stamp>.bak.json` next to the store, mode 0o600,
 * skipping the write when the bytes equal the newest existing backup, then
 * keeps only the newest MAX_BACKUPS_PER_STORE. Returns the backup path.
 */
export function writePreMigrationBackup(
  storePath: string,
  fromVersion: number,
  bytes: Buffer,
  now: () => Date = () => new Date()
): string {
  const dir = dirname(storePath)
  const name = storeName(storePath)

  const existing = listBackups(storePath)
  const newest = existing[existing.length - 1]
  if (newest) {
    assertInside(newest, dir)
    try {
      if (readFileSync(newest).equals(bytes)) return newest
    } catch {
      /* unreadable newest backup: fall through and write a fresh one */
    }
  }

  const target = join(dir, `${name}.v${fromVersion}.${stampOf(now())}.bak.json`)
  assertInside(target, dir)
  atomicWritePrivate(target, bytes)

  const all = listBackups(storePath)
  for (const old of all.slice(
    0,
    Math.max(0, all.length - MAX_BACKUPS_PER_STORE)
  )) {
    assertInside(old, dir)
    try {
      unlinkSync(old)
    } catch (err) {
      process.stderr.write(
        `[storeVersion] could not prune ${basename(old)}: ${errMessage(err)}\n`
      )
    }
  }
  return target
}
