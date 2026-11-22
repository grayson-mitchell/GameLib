/**
 * The settings documents (`<appFolder>/config.json` and `<appFolder>/GamesConfig/<app>.json`) as one
 * read/write seam (Phase 85 plan 15, D-01, research Pattern 3).
 *
 * They are the only persisted state read straight from disk outside the store classes: GlobalConfig,
 * GameConfig, the engine's stored-config read and the Steam title read each did their own
 * `readFileSync`. Once the settings family is Rust-owned, a read straight from disk can miss a write
 * the shell has not applied yet, so every one of them reads through `readSettingsDoc`:
 *
 * - **Rust-owned** (the boot's root, and the path is the document's table path under
 *   `root.userData`; since 85-21 there is no flag, D-03): the document is a
 *   `MirrorCell` of the root's registry, one per file, keyed `settings/global` or
 *   `GamesConfig/<app>`. A read is the cell's view (pending writes included); a cell is created on
 *   the first read of a file that exists, or on the first write. A write is ONE `replace` frame:
 *   the shell owns the bytes (2-space, the chain's `version: 'vN'`, `sync_all`). The shell migrated
 *   every document at boot before this process started (store_boot), so no TS migration runs.
 * - **File read** (a caller with no root, or a path that is not the table path): `readFileSync` +
 *   `JSON.parse` (a corrupt file throws, as it did), the file as it stands. A write on such a path
 *   throws: only the shell writes a settings document (85-23 deleted the TS writer with the
 *   engine). Production always passes the root.
 *
 * A `GamesConfig` document name must be one plain path segment (the `isContainedGameConfig` rule);
 * `storeFrames.isStoreKey` refuses anything else, so such a path never becomes a frame (T-85-37).
 *
 * Pure: no logger (config.ts and game_config.ts import this module and the logger imports them),
 * no timer, no handle (sidecar exit contract).
 */
import { existsSync, readFileSync } from 'graceful-fs'
import { relative, sep } from 'path'
import { isRustOwnedStoreKey, isStoreKey } from './storeFrames'
import type { StoreRoot } from './storeRoot'

/**
 * What the helpers need of the boot's `StoreRoot`. Production passes the root itself. A read-only
 * caller passes `{}` and gets the file-read path: the Rust-owned path needs the root's `userData`
 * and `mirrors`.
 */
export type SettingsDocRoot = Partial<Pick<StoreRoot, 'userData' | 'mirrors'>>

type Doc = Record<string, unknown>

/** The store key of a settings document path, or `undefined` for any other path. */
function docKeyOf(userData: string, path: string): string | undefined {
  const rel = relative(userData, path)
  if (rel === 'config.json') return 'settings/global'
  const parts = rel.split(sep)
  if (parts.length !== 2 || parts[0] !== 'GamesConfig') return undefined
  const file = parts[1] as string
  if (!file.endsWith('.json')) return undefined
  const key = `GamesConfig/${file.slice(0, -'.json'.length)}`
  return isStoreKey(key) ? key : undefined
}

/** The document's store key when the shell owns it under this root, else `undefined`. */
function rustDocKey(root: SettingsDocRoot, path: string): string | undefined {
  if (!root.userData || !root.mirrors) return undefined
  const key = docKeyOf(root.userData, path)
  return key !== undefined && isRustOwnedStoreKey(key) ? key : undefined
}

function cellFor(root: SettingsDocRoot, path: string, storeKey: string) {
  // rustDocKey returned a key, so the root has its registry.
  return (root.mirrors as NonNullable<SettingsDocRoot['mirrors']>).cellFor({
    path,
    storeKey,
    dotPaths: true
  })
}

/**
 * The document at `path`, or `undefined` when there is none. Rust-owned: the cell's view, pending
 * writes included (an unreadable file reads as `{}`, the shell reported it read-only at boot).
 * Otherwise the file parsed (a corrupt file throws, as the direct reads did).
 */
export function readSettingsDoc(
  root: SettingsDocRoot,
  path: string
): Doc | undefined {
  const key = rustDocKey(root, path)
  if (key !== undefined) {
    const cell = root.mirrors?.peek(path)
    if (cell !== undefined) return cell.data
    if (!existsSync(path)) return undefined
    return cellFor(root, path, key).data
  }
  if (!existsSync(path)) return undefined
  return JSON.parse(readFileSync(path, 'utf-8')) as Doc
}

/** Whether the document exists (a Rust-owned one written but not yet applied counts). */
export function settingsDocExists(
  root: SettingsDocRoot,
  path: string
): boolean {
  if (rustDocKey(root, path) !== undefined && root.mirrors?.peek(path)) {
    return true
  }
  return existsSync(path)
}

/**
 * Replaces the whole document: one `replace` frame through the cell, visible to every read at once
 * (a read-only cell refuses it silently). A path the shell does not own (no root, or not the
 * table path) throws: there is no TS writer.
 */
export function writeSettingsDoc(
  root: SettingsDocRoot,
  path: string,
  data: Doc
): void {
  const key = rustDocKey(root, path)
  if (key === undefined) {
    throw new Error(
      '[settingsDocs] a settings write needs the store root and a settings document path'
    )
  }
  cellFor(root, path, key).replace(data)
}

/**
 * The document's file was deleted (an uninstall's settings removal reported `removed`): drop its
 * cell so no read serves the deleted settings and the next write starts over. A path the shell does not
 * own: nothing to drop. `true` when a cell was dropped.
 */
export function dropSettingsDoc(root: SettingsDocRoot, path: string): boolean {
  if (rustDocKey(root, path) === undefined) return false
  return root.mirrors?.drop(path) ?? false
}

/**
 * A reset deleted `config.json` and `GamesConfig/` (its removal reported `removed`), so every
 * settings document's cell is dropped: the cells whose path is `settings/global` or any
 * `GamesConfig/<app>`. No read serves the deleted settings, and the next write starts a new cell at
 * rev 0, which the shell's restarted revs (rev 1 after it evicted the stores) move forward instead
 * of being swallowed as a no-op (C-WR-01). Returns how many cells were dropped; 0 when the root has
 * no `userData` or `mirrors`.
 */
export function dropAllSettingsDocs(root: SettingsDocRoot): number {
  const { userData, mirrors } = root
  if (!userData || !mirrors) return 0
  return mirrors.dropWhere((path) => docKeyOf(userData, path) !== undefined)
}
