/**
 * Quick 261127-v8b: GOG uninstall keeps save folders that lie inside the install folder.
 *
 * Why this exists: `unins000.exe /KEEPSAVES` kept Balrum's saves (`<install>/files/saves`), and then
 * the whole-tree guarded delete that follows the uninstaller removed the whole install folder
 * anyway, saves included (measured live, 2026-11-27). `planKeptSaves` works out which save folders
 * to leave alone and the exact entries to delete around them; the caller sends those entries
 * through the same Rust guard, so nothing is deleted by a bypass.
 *
 * Exit contract: no timers, no handles, no work at import, no module-level mutable state. Every
 * function is a synchronous walk over the install folder.
 */
import { readdirSync, realpathSync } from 'fs'
import type { Dirent } from 'fs'
import { isAbsolute, join, relative, sep } from 'path'
import type { GOGCloudSavesLocation } from 'common/types/gog'

export type KeptSavesPlan =
  /** Nothing to keep apart: delete the whole install folder, as before. */
  | { kind: 'whole-tree'; rootSave: boolean }
  /** Delete exactly `remove` (absolute entries under `root`), leaving every `kept` folder. */
  | { kind: 'around'; root: string; kept: string[]; remove: string[] }
  /** A folder on a kept save's ancestor chain could not be listed; delete nothing more. */
  | { kind: 'unreadable' }

interface KeepSavesIo {
  readdir?: (dir: string) => Dirent[]
}

const wholeTree = (rootSave: boolean): KeptSavesPlan => ({
  kind: 'whole-tree',
  rootSave
})

// The crate's and the safety fake's fold: NFC plus lowercase on win32 and darwin, exact elsewhere.
// Over-matching keeps more, which is the safe direction.
const fold = (p: string): string =>
  process.platform === 'win32' || process.platform === 'darwin'
    ? p.normalize('NFC').toLowerCase()
    : p

/** Is `candidate` strictly inside `root`? Both already folded. */
function strictlyInside(root: string, candidate: string): boolean {
  const rel = relative(root, candidate)
  if (rel === '' || isAbsolute(rel)) return false
  // First segment only: a folder named "..cache" is inside, not outside.
  return rel.split(sep)[0] !== '..'
}

const canonical = (path: string): string | undefined => {
  try {
    return realpathSync.native(path)
  } catch {
    return undefined
  }
}

export function planKeptSaves(
  installPath: string,
  locations: readonly GOGCloudSavesLocation[],
  io: KeepSavesIo = {}
): KeptSavesPlan {
  const root = canonical(installPath)
  if (root === undefined) return wholeTree(false)
  const foldedRoot = fold(root)

  let rootSave = false
  const kept = new Map<string, string>()
  for (const location of locations) {
    const path = location.location
    // Checked before any resolve, so a relative or %VAR% path is never resolved against cwd.
    if (!path || !isAbsolute(path)) continue
    const real = canonical(path)
    if (real === undefined) continue
    const foldedReal = fold(real)
    if (foldedReal === foldedRoot) {
      rootSave = true
      continue
    }
    if (!strictlyInside(foldedRoot, foldedReal)) continue
    if (!kept.has(foldedReal)) kept.set(foldedReal, real)
  }
  if (kept.size === 0) return wholeTree(rootSave)

  const keptFolded = [...kept.keys()]
  const readdir =
    io.readdir ?? ((dir: string) => readdirSync(dir, { withFileTypes: true }))
  const remove: string[] = []
  const walk = (dir: string): boolean => {
    let entries: Dirent[]
    try {
      entries = readdir(dir)
    } catch {
      return false
    }
    for (const entry of entries) {
      const path = join(dir, entry.name)
      const foldedPath = fold(path)
      if (keptFolded.includes(foldedPath)) continue
      if (keptFolded.some((k) => strictlyInside(foldedPath, k))) {
        // An ancestor of a kept save: descend only into a real directory.
        if (entry.isDirectory() && !entry.isSymbolicLink()) {
          if (!walk(path)) return false
        }
        continue
      }
      remove.push(path)
    }
    return true
  }
  if (!walk(root)) return { kind: 'unreadable' }
  return {
    kind: 'around',
    root,
    kept: [...kept.values()].sort(),
    remove: remove.sort()
  }
}
