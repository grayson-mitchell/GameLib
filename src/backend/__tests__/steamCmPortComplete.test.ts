/**
 * Phase 79 deletion gate (CF-01): the Steam CM session, sign-in, Refresh,
 * enrichment and depot keys live only in Rust (crates/gamelib-steamcm, driven
 * through rustInvoke). Fails if a deleted TS file, the npm CM clients, the
 * retired D-08 flags or the pnpm patches come back.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')
const STEAM = 'src/backend/storeManagers/steam'
const FIXTURES = 'src-tauri/crates/gamelib-steamcm/tests/fixtures'

const DELETED = [
  `${STEAM}/steamUserLogonAbort.ts`,
  `${STEAM}/macSteamOffline.ts`,
  `${STEAM}/storeVersioning/macSteamOfflineOwedFile.ts`,
  `${STEAM}/cm/steamCmFlags.ts`,
  `${STEAM}/cm/cmLogonId.ts`,
  `${STEAM}/licensedDemos.ts`,
  `${STEAM}/metacriticCapture.ts`,
  `${STEAM}/cdnAuth.ts`,
  `${STEAM}/depot/cdnAuth.ts`,
  'patches/lzma.patch',
  'patches/steam-user.patch',
  'meta/steamcmParitySweep.ts',
  'meta/steamcmRefreshParitySweep.ts'
]

// Package names are matched as module specifiers (import/require/mock),
// because 'steam-user' is also the name of a boot step and a manager id.
const spec = (name: string): RegExp =>
  new RegExp(
    `(?:from\\s*|require\\(\\s*|import\\(\\s*|mock\\(\\s*)['"]${name}(?:/[^'"]*)?['"]`
  )

const FORBIDDEN: Array<[string, RegExp]> = [
  ['steam-user', spec('steam-user')],
  ['steam-session', spec('steam-session')],
  ['GAMELIB_STEAMCM_CM', /GAMELIB_STEAMCM_CM/],
  ['GAMELIB_STEAMCM_SIGNIN', /GAMELIB_STEAMCM_SIGNIN/],
  ['lzma', spec('lzma')],
  ['zstddec', spec('zstddec')],
  ['LoginSession', /\bLoginSession\b/],
  ['_send', /(?<![A-Za-z0-9])_send\b/]
]

const REMOVED_PACKAGES = [
  'steam-user',
  'steam-session',
  '@types/steam-user',
  'lzma',
  'zstddec'
]

const KEPT = [
  `${FIXTURES}/invocations.json`,
  `${FIXTURES}/expected.json`,
  `${FIXTURES}/rust-results.json`,
  'src-tauri/crates/gamelib-steamcm/Cargo.toml',
  'src-tauri/crates/gamelib-steamcm-cli/Cargo.toml',
  'meta/gamelibSteamcmCli.ts'
]

// This file names every forbidden symbol by design.
const SELF = join(__dirname, 'steamCmPortComplete.test.ts')

/** Floor on files scanned (D-05): the original `>= 500`. Never lower. */
const SCANNED_FILES_FLOOR = 500

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    // meta/__tests__/runTsSignals.test.ts writes meta/runTs.__probe__.cjs for a moment; a scan that
    // lists the file and then reads it after the unlink died with ENOENT under full-suite load.
    if (e.name.includes('.__probe__.')) continue
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

const findHits = (src: string): string[] => {
  const code = stripComments(src)
  return FORBIDDEN.filter(([, re]) => re.test(code)).map(([name]) => name)
}

interface PackageJson {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

describe('steam CM port complete (Phase 79 CF-01)', () => {
  const files: string[] = []
  walk(join(ROOT, 'src'), files)
  walk(join(ROOT, 'meta'), files)
  const scanned = files.filter((f) => f !== SELF)

  it.each(DELETED)('%s stays deleted', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false)
  })

  it('no forbidden steam-cm symbol remains (comments stripped)', () => {
    const hits: string[] = []
    for (const f of scanned) {
      const src = readFileSync(f, 'utf8')
      for (const needle of findHits(src))
        hits.push(`${relative(ROOT, f)}: ${needle}`)
    }
    expect(hits).toEqual([])
  })

  it('the scan can fail: a forbidden symbol in code is caught, the same symbol in a comment is not', () => {
    expect(findHits("import SteamUser from 'steam-user'")).toContain(
      'steam-user'
    )
    expect(findHits("const s = require('steam-session')")).toContain(
      'steam-session'
    )
    expect(
      findHits('// steam-user was removed in 79-42\n/* LoginSession */')
    ).toEqual([])
  })

  it.each(KEPT)('%s is kept', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(true)
  })

  it('package.json drops the five CM npm packages', () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, 'package.json'), 'utf8')
    ) as PackageJson
    const deps = { ...pkg.dependencies, ...pkg.devDependencies }
    for (const name of REMOVED_PACKAGES) expect(deps).not.toHaveProperty(name)
  })

  it('pnpm-workspace.yaml carries no lzma or steam-user patch', () => {
    const ws = readFileSync(join(ROOT, 'pnpm-workspace.yaml'), 'utf8')
    expect(ws).not.toMatch(/lzma|steam-user/)
  })

  it('anti-vacuity: the walk scanned a real tree', () => {
    assertAtOrAboveFloor(
      'steamCmPortComplete files',
      scanned.length,
      SCANNED_FILES_FLOOR
    )
    expect(scanned.length).toBeGreaterThanOrEqual(500)
  })

  it('empty-input (D-05): an empty directory walks no files and fails the scan floor', () => {
    const dir = mkdtempSync(join(tmpdir(), 'port-complete-'))
    try {
      const found: string[] = []
      walk(dir, found)
      expect(found).toHaveLength(0)
      expect(() =>
        assertAtOrAboveFloor(
          'steamCmPortComplete files',
          found.length,
          SCANNED_FILES_FLOOR
        )
      ).toThrow(/steamCmPortComplete files/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
