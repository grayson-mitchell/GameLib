// Depot path containment and streaming SHA1. Moved out of depot/download.ts when the TS
// download pipeline was deleted (73-20); the shared-redist installscript path and
// bridge/originalRestore.ts still need both.

import { createReadStream } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve, relative, isAbsolute } from 'path'

/** Thrown when a decrypted filename resolves outside the target install root (T-21-01). */
export class PathTraversalError extends Error {}

/**
 * Resolve `filename` against `root` and verify containment via relative()
 * BEFORE any fs call — path.join alone is not containment (Phase 18 lesson).
 * A "../"-escaping filename never reaches open()/mkdir(). Backslashes are
 * normalized first so a Windows-style depot path is contained the same way.
 */
export function resolveContainedPath(root: string, filename: string): string {
  const dest = resolve(root, filename.replace(/\\/g, '/'))
  const rel = relative(root, dest)
  if (rel.startsWith('..') || isAbsolute(rel)) {
    throw new PathTraversalError(
      `downloadDepotFiles: rejected path-traversal filename "${filename}" (escapes ${root})`
    )
  }
  return dest
}

/** Streaming whole-file SHA1: a ReadStream piped through createHash, never a
 *  whole-file Buffer read. */
export function sha1File(path: string): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash('sha1')
    const stream = createReadStream(path)
    stream.on('error', reject)
    stream.on('data', (chunk: string | Buffer) => hash.update(chunk))
    stream.on('end', () => resolvePromise(hash.digest('hex')))
  })
}
