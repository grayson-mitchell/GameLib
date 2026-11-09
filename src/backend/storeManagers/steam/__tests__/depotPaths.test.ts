/**
 * depotPaths: the containment check and streaming SHA1 that survive the TS pipeline (73-20).
 * originalRestore.ts and the shared-redist installscript path rely on both (T-73-70).
 */
import { createHash } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  PathTraversalError,
  resolveContainedPath,
  sha1File
} from '../depotPaths'

describe('resolveContainedPath', () => {
  const root = resolve(tmpdir(), 'gamelib-depot-root')

  it('resolves a nested relative filename under the root', () => {
    expect(resolveContainedPath(root, 'bin/game.exe')).toBe(
      join(root, 'bin', 'game.exe')
    )
  })

  it('normalizes backslash separators before resolving', () => {
    expect(resolveContainedPath(root, 'bin\\sub\\game.exe')).toBe(
      join(root, 'bin', 'sub', 'game.exe')
    )
  })

  it('accepts a ".." that stays inside the root', () => {
    expect(resolveContainedPath(root, 'a/../b.txt')).toBe(join(root, 'b.txt'))
  })

  it.each([
    '../escape.txt',
    'a/../../escape.txt',
    '..\\escape.txt',
    '/etc/passwd'
  ])('rejects %s with a PathTraversalError naming traversal', (name) => {
    expect(() => resolveContainedPath(root, name)).toThrow(PathTraversalError)
    expect(() => resolveContainedPath(root, name)).toThrow(/traversal/)
  })
})

describe('sha1File', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'depot-paths-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('returns the hex SHA1 of the file contents', async () => {
    const body = Buffer.alloc(200_000, 7)
    const path = join(dir, 'f.bin')
    writeFileSync(path, body)
    await expect(sha1File(path)).resolves.toBe(
      createHash('sha1').update(body).digest('hex')
    )
  })

  it('hashes an empty file', async () => {
    const path = join(dir, 'empty')
    writeFileSync(path, '')
    await expect(sha1File(path)).resolves.toBe(
      'da39a3ee5e6b4b0d3255bfef95601890afd80709'
    )
  })

  it('rejects when the file does not exist', async () => {
    await expect(sha1File(join(dir, 'missing'))).rejects.toThrow(/ENOENT/)
  })
})
