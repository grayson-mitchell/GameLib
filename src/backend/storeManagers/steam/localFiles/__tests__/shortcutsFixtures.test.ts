import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { join, resolve } from 'path'

import { buildShortcutsFixtures } from './fixtures/buildShortcutsFixtures'

const REPO_ROOT = resolve(__dirname, '../../../../../..')
const SHORTCUTS_DIR = join(
  REPO_ROOT,
  'src-tauri/crates/gamelib-steamfiles/tests/fixtures/shortcuts'
)
const WRITE = process.env.GAMELIB_WRITE_STEAMFILES_FIXTURES === '1'

describe('shortcuts.vdf fixture builder', () => {
  test('empty.vdf is the minimal root map', () => {
    const built = buildShortcutsFixtures()
    expect(built['empty.vdf']?.toString('hex')).toBe(
      '0073686f727463757473000808'
    )
  })

  test('building twice yields identical bytes', () => {
    const a = buildShortcutsFixtures()
    const b = buildShortcutsFixtures()
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort())
    for (const name of Object.keys(a)) {
      expect(a[name]?.equals(b[name] as Buffer)).toBe(true)
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

  // Phase 94 plan 24: the TypeScript non-Steam shortcuts service and its `test_data` were deleted, so the crate's
  // `shortcuts/upstream/` is the only copy of the seven upstream files. It is no longer rewritten from a source.
  test('the upstream test_data copy still holds its seven files', () => {
    const names = readdirSync(join(SHORTCUTS_DIR, 'upstream')).filter((n) =>
      n.endsWith('.vdf')
    )
    expect(names.sort()).toEqual([
      'shortcuts_commandmc.vdf',
      'shortcuts_felipecrs.vdf',
      'shortcuts_missing_appname.vdf',
      'shortcuts_missing_exe.vdf',
      'shortcuts_missing_launchoptions.vdf',
      'shortcuts_redromnon.vdf',
      'shortcuts_valid.vdf'
    ])
  })
})
