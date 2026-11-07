/**
 * Phase 63 D-13 deletion gate: the executable scanners exist only in Rust
 * (crates/gamelib-scan). Fails if a deleted TS parser, the fallback flag, or an
 * app-side objdump use comes back.
 */
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')

const DELETED = [
  'src/backend/scanners/scannerImpl.ts',
  'src/backend/scanners/legacyTsScanners.ts',
  'src/backend/scanners/legacyMachoParse.ts',
  'src/backend/scanners/scanNormalize.ts',
  'src/backend/storeManagers/steam/bridge/peSections.ts',
  'src/backend/storeManagers/steam/bridge/peSteamDrm.ts',
  'meta/genScanFixtures.ts',
  'meta/scannerParitySweep.ts'
]

const FORBIDDEN = [
  'GAMELIB_SCANNER_',
  'OBJDUMP_BIN',
  "'/usr/bin/objdump'",
  'parsePeSectionNames',
  'readPeSteamApiDelayImports(',
  'parseMachODefinedExternals',
  'runScanner('
]

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '__tests__') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx)$/.test(e.name)) out.push(full)
  }
}

const stripComments = (src: string): string =>
  src
    .split('\n')
    .filter((l) => !/^\s*(\/\/|\/?\*)/.test(l))
    .join('\n')

describe('scanner port complete (D-13)', () => {
  const files: string[] = []
  walk(join(ROOT, 'src'), files)
  for (const f of readdirSync(join(ROOT, 'meta'))) {
    if (f.endsWith('.ts') && f !== 'bridgeCensus.ts') {
      files.push(join(ROOT, 'meta', f))
    }
  }

  it.each(DELETED)('%s stays deleted', (p) => {
    expect(existsSync(join(ROOT, p))).toBe(false)
  })

  it('no deleted parser, flag or app-side objdump use remains', () => {
    const hits: string[] = []
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'))
      for (const needle of FORBIDDEN) {
        if (src.includes(needle)) hits.push(`${relative(ROOT, f)}: ${needle}`)
      }
    }
    expect(hits).toEqual([])
  })

  it('keeps the census objdump arm (the exemption is real)', () => {
    expect(
      existsSync(
        join(ROOT, 'src/backend/storeManagers/steam/bridge/importParse.ts')
      )
    ).toBe(true)
    expect(readFileSync(join(ROOT, 'meta/bridgeCensus.ts'), 'utf8')).toContain(
      '/usr/bin/objdump'
    )
  })

  it('keeps the permanent Rust regression fixtures', () => {
    expect(
      existsSync(
        join(ROOT, 'src-tauri/crates/gamelib-scan/tests/fixtures/expected.json')
      )
    ).toBe(true)
  })

  it('anti-vacuity: the walk scanned a real tree', () => {
    expect(files.length).toBeGreaterThanOrEqual(500)
  })
})
