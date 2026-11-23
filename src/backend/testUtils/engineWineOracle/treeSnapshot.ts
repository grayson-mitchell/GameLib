/**
 * A filesystem tree snapshot for the Phase 87 oracles (87-05, D-08).
 *
 * Walks a directory into a sorted list of `{path, kind, mode, sha256 | symlink}`. Paths are
 * relative to the walked root and slash-separated, so the same tree compares equal on any OS.
 * Nothing here follows a symlink: a link is recorded by its target string, never walked.
 *
 * `mode` is the low permission bits with the group and other WRITE bits cleared
 * (`mode & 0o7755`). The bits a process creates a file with depend on the umask (`0022` on a
 * workstation, `0002` on some CI images), and a golden that changed with the machine's umask would
 * be a flaky golden, not a finding. The owner bits and the execute bits stay, because those are
 * what a tar extraction or an install step decides.
 */
import { lstatSync, readdirSync, readFileSync, readlinkSync } from 'fs'
import { createHash } from 'crypto'
import { join } from 'path'

export interface TreeEntry {
  /** Relative to the snapshot root, slash-separated. */
  path: string
  kind: 'file' | 'dir' | 'symlink'
  /** Four octal digits, umask-independent (see the module header). */
  mode: string
  /** Files only: the sha256 of the bytes, hex. */
  sha256?: string
  /** Symlinks only: the target exactly as stored. */
  symlink?: string
}

const modeString = (mode: number): string =>
  (mode & 0o7755).toString(8).padStart(4, '0')

function walk(root: string, rel: string, out: TreeEntry[]): void {
  const dir = rel === '' ? root : join(root, rel)
  for (const name of readdirSync(dir).sort()) {
    const relPath = rel === '' ? name : `${rel}/${name}`
    const full = join(root, relPath)
    const stat = lstatSync(full)
    if (stat.isSymbolicLink()) {
      out.push({
        path: relPath,
        kind: 'symlink',
        mode: modeString(stat.mode),
        symlink: readlinkSync(full)
      })
    } else if (stat.isDirectory()) {
      out.push({ path: relPath, kind: 'dir', mode: modeString(stat.mode) })
      walk(root, relPath, out)
    } else {
      out.push({
        path: relPath,
        kind: 'file',
        mode: modeString(stat.mode),
        sha256: createHash('sha256').update(readFileSync(full)).digest('hex')
      })
    }
  }
}

/** Every entry under `root` (not `root` itself), sorted by path. */
export function snapshotTree(root: string): TreeEntry[] {
  const out: TreeEntry[] = []
  walk(root, '', out)
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
}
