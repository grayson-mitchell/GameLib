/**
 * Phase 75 deletion gate (P75-G): Steam local file formats are read and
 * written only in Rust (crates/gamelib-steamfiles, driven through rustInvoke).
 * Fails if a deleted TS reader, the TS ACF writer, the two npm packages or the
 * retired D-08 flags come back.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')
const STEAM = 'src/backend/storeManagers/steam'
const FIXTURES = 'src-tauri/crates/gamelib-steamfiles/tests/fixtures'

const DELETED = [
  `${STEAM}/depot/finalizeAcf.ts`,
  `${STEAM}/depot/appManifest.ts`,
  'src/common/typedefs/steam-shortcut-editor.d.ts',
  `${STEAM}/localFiles/steamFilesFlags.ts`,
  `${STEAM}/localFiles/__tests__/oracle`,
  `${STEAM}/localFiles/__tests__/steamFilesGolden.test.ts`,
  'meta/steamFilesParitySweep.ts'
]

const FORBIDDEN = [
  '@node-steam/vdf',
  'steam-shortcut-editor',
  'parseKv1',
  'parseAcfTree',
  'decodeUserAppConfigBetaKey',
  'finalizeToSteam',
  'writeAppManifest',
  'GAMELIB_STEAMFILES_TEXT',
  'GAMELIB_STEAMFILES_SHORTCUTS'
]

const KEPT = [
  `${FIXTURES}/expected.json`,
  `${FIXTURES}/invocations.json`,
  `${FIXTURES}/rust-results.json`,
  `${FIXTURES}/overrides`,
  'src-tauri/crates/gamelib-steamfiles/Cargo.toml',
  'src-tauri/crates/gamelib-steamfiles-cli/Cargo.toml',
  'meta/gamelibSteamfilesCli.ts'
]

// This file names every forbidden symbol by design.
const SELF = join(__dirname, 'steamFilesPortComplete.test.ts')

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|cjs|js)$/.test(e.name)) out.push(full)
  }
}

const stripComments = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !/^\s*\/\//.test(l))
    .join('\n')

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('steam files port complete (Phase 75 P75-G)', () => {
  const files: string[] = []
  walk(join(ROOT, 'src'), files)
  walk(join(ROOT, 'meta'), files)
  const scanned = files.filter((f) => f !== SELF)

  it.each(DELETED)('%s stays deleted', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false)
  })

  it('no forbidden steam-files symbol remains (comments stripped)', () => {
    const hits: string[] = []
    for (const f of scanned) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const needle of FORBIDDEN) {
        if (src.includes(needle)) hits.push(`${relative(ROOT, f)}: ${needle}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('the scan can fail: a forbidden symbol in code is caught, the same symbol in a comment is not', () => {
    const code = "import vdf from '@node-steam/vdf'"
    const comment = '// @node-steam/vdf was removed in 75-35\n/* parseKv1 */'
    expect(stripComments(code).includes('@node-steam/vdf')).toBe(true)
    expect(stripComments(comment).includes('@node-steam/vdf')).toBe(false)
    expect(stripComments(comment).includes('parseKv1')).toBe(false)
  })

  it.each(KEPT)('%s is kept', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(true)
  })

  it('package.json drops @node-steam/vdf and steam-shortcut-editor', () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8')
    ) as PackageJson
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    expect(deps).not.toHaveProperty('@node-steam/vdf')
    expect(deps).not.toHaveProperty('steam-shortcut-editor')
  })

  it('anti-vacuity: the walk scanned a real tree', () => {
    expect(scanned.length).toBeGreaterThanOrEqual(500)
  })
})
