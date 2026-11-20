/**
 * Phase 70 (D-11): `phase70Passthrough()` is deleted and nothing may reintroduce it. A plain
 * file walk over src/ and meta/; it spawns nothing.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'

const ROOT = resolve(__dirname, '../../../..')
const SKIP_DIRS = new Set(['node_modules', 'build', 'dist', 'target', '.git'])
const SELF = resolve(__filename)
const NEEDLES = ['phase70Passthrough(', 'PHASE70-PASSTHROUGH']

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name), out)
    } else if (/\.(ts|tsx|cjs|mjs|js|json)$/.test(entry.name)) {
      out.push(join(dir, entry.name))
    }
  }
}

/** Floor on files walked (D-05); the original `> 100` bound, unchanged. */
const FILES_FLOOR = 101

describe('phase70Passthrough census', () => {
  it('finds no use of the deleted helper under src/ or meta/', () => {
    const files: string[] = []
    walk(join(ROOT, 'src'), files)
    walk(join(ROOT, 'meta'), files)
    assertAtOrAboveFloor(
      'phase70PassthroughCensus files',
      files.length,
      FILES_FLOOR
    )
    const hits = files
      .filter((f) => resolve(f) !== SELF)
      .filter((f) => {
        const text = readFileSync(f, 'utf-8')
        return NEEDLES.some((n) => text.includes(n))
      })
    expect(hits).toEqual([])
  })

  describe('cannot pass vacuously (D-05)', () => {
    it('an empty directory walk fails the files floor', () => {
      const dir = mkdtempSync(join(tmpdir(), 'phase70-census-'))
      try {
        const files: string[] = []
        walk(dir, files)
        expect(files).toHaveLength(0)
        expect(() =>
          assertAtOrAboveFloor(
            'phase70PassthroughCensus files',
            files.length,
            FILES_FLOOR
          )
        ).toThrow(/phase70PassthroughCensus files/)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})
