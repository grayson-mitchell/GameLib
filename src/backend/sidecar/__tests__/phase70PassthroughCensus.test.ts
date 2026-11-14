/**
 * Phase 70 (D-11): `phase70Passthrough()` is deleted and nothing may reintroduce it. A plain
 * file walk over src/ and meta/; it spawns nothing.
 */
import { readdirSync, readFileSync } from 'fs'
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

describe('phase70Passthrough census', () => {
  it('finds no use of the deleted helper under src/ or meta/', () => {
    const files: string[] = []
    walk(join(ROOT, 'src'), files)
    walk(join(ROOT, 'meta'), files)
    expect(files.length).toBeGreaterThan(100)
    const hits = files
      .filter((f) => resolve(f) !== SELF)
      .filter((f) => {
        const text = readFileSync(f, 'utf-8')
        return NEEDLES.some((n) => text.includes(n))
      })
    expect(hits).toEqual([])
  })
})
