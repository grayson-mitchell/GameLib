import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

import { buildShortcutsFixtures } from './fixtures/buildShortcutsFixtures'

const REPO_ROOT = resolve(__dirname, '../../../../../..')
const SHORTCUTS_DIR = join(
  REPO_ROOT,
  'src-tauri/crates/gamelib-steamfiles/tests/fixtures/shortcuts'
)
const UPSTREAM_SRC = join(
  REPO_ROOT,
  'src/backend/shortcuts/nonesteamgame/__tests__/test_data'
)
const WRITE = process.env.GAMELIB_WRITE_STEAMFILES_FIXTURES === '1'

describe('shortcuts.vdf fixture builder', () => {
  test('empty.vdf is the minimal root map', () => {
    const built = buildShortcutsFixtures()
    expect(built['empty.vdf'].toString('hex')).toBe(
      '0073686f727463757473000808'
    )
  })

  test('building twice yields identical bytes', () => {
    const a = buildShortcutsFixtures()
    const b = buildShortcutsFixtures()
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
    for (const name of Object.keys(a)) {
      expect(a[name].equals(b[name])).toBe(true)
    }
  })

  test('committed fixtures equal the built buffers (or are rewritten)', () => {
    const built = buildShortcutsFixtures()
    if (WRITE) mkdirSync(SHORTCUTS_DIR, { recursive: true })
    for (const [name, buf] of Object.entries(built)) {
      const path = join(SHORTCUTS_DIR, name)
      if (WRITE) {
        writeFileSync(path, buf)
      } else {
        expect(readFileSync(path).equals(buf)).toBe(true)
      }
    }
  })

  test('upstream test_data is copied verbatim', () => {
    const names = readdirSync(UPSTREAM_SRC).filter((n) => n.endsWith('.vdf'))
    expect(names).toHaveLength(7)
    const dest = join(SHORTCUTS_DIR, 'upstream')
    if (WRITE) {
      mkdirSync(dest, { recursive: true })
      for (const n of names) {
        writeFileSync(join(dest, n), readFileSync(join(UPSTREAM_SRC, n)))
      }
    }
    expect(readdirSync(dest).sort()).toEqual([...names].sort())
    for (const n of names) {
      expect(
        readFileSync(join(dest, n)).equals(readFileSync(join(UPSTREAM_SRC, n)))
      ).toBe(true)
    }
  })
})
