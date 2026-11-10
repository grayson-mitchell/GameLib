/**
 * Phase 66.1 end-state source gates (plan 27). Zero jest.mock: this file only reads source text,
 * so it adds nothing to the mock ceilings.
 *
 * What it pins: the transitional registries/facades are gone and stay gone; stores modules are
 * only value-imported by the stores factory and the boot; the launcher, command runner,
 * quit handler and every flow registration spawn nothing through child_process directly; and
 * neither the manager table nor any stores module constructs anything at import time.
 *
 * Every scan asserts a minimum file count so a half-empty walk cannot pass.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const BACKEND = join(__dirname, '..')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const isTestInfra = (file: string): boolean =>
  /(^|\/)(__tests__|__mocks__|testUtils)\//.test(relative(BACKEND, file)) ||
  /\.(test|spec)\.tsx?$/.test(file) ||
  /jest\.[A-Za-z]+\.(ts|js)$/.test(file)

const nonTestSources = walk(BACKEND).filter(
  (f) => /\.ts$/.test(f) && !f.endsWith('.d.ts') && !isTestInfra(f)
)

const stripped = new Map<string, string>()
const source = (file: string): string => {
  let text = stripped.get(file)
  if (text === undefined) {
    text = stripSourceComments(readFileSync(file, 'utf-8'))
    stripped.set(file, text)
  }
  return text
}

const rel = (file: string): string => relative(BACKEND, file)

const STORES_MODULES = [
  'constants/key_value_stores.ts',
  ...walk(BACKEND)
    .map(rel)
    .filter(
      (f) =>
        /(^|\/)stores\.ts$/.test(f) &&
        !f.startsWith('stores/') &&
        !f.includes('__tests__')
    )
]

describe('66.1 end state: removed collaborators', () => {
  it('scans a full backend tree', () => {
    expect(nonTestSources.length).toBeGreaterThanOrEqual(400)
  })

  const FORBIDDEN = [
    'libraryManagerMap',
    'storeLaunchHooks',
    'trackedChildren',
    'longLivedChildren',
    'legacyManagerDeps',
    'legacyBootQueue',
    'legacyChildren',
    'services/legacyFacades'
  ]

  it.each(FORBIDDEN)('no non-test file references %s', (name) => {
    const offenders = nonTestSources
      .filter((f) => source(f).includes(name))
      .map(rel)
    expect(offenders).toEqual([])
  })

  it('the legacy facades module does not exist', () => {
    expect(existsSync(join(BACKEND, 'services', 'legacyFacades.ts'))).toBe(
      false
    )
    expect(existsSync(join(BACKEND, 'trackedChildren.ts'))).toBe(false)
    expect(existsSync(join(BACKEND, 'longLivedChildren.ts'))).toBe(false)
  })

  it('utils.ts no longer exports spawnAsync, handleExit or getGame', () => {
    expect(source(join(BACKEND, 'utils.ts'))).not.toMatch(
      /^export (const|async function|function) (spawnAsync|handleExit|getGame)\b/m
    )
  })
})

describe('66.1 end state: stores modules', () => {
  it('finds the 16 stores modules', () => {
    expect(STORES_MODULES).toHaveLength(16)
    for (const m of STORES_MODULES) {
      expect(existsSync(join(BACKEND, m))).toBe(true)
    }
  })

  it('no non-test file outside the stores modules and the stores factory value-imports one', () => {
    const allowed = new Set([...STORES_MODULES, 'stores/createStores.ts'])
    // `typeof import('...')` is a type position, not a value import, so the lookbehind skips it.
    const importRe =
      /^(import|export)\s+(type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]|(?<!typeof\s)(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/gm
    const offenders: string[] = []
    for (const file of nonTestSources) {
      if (allowed.has(rel(file))) continue
      for (const m of source(file).matchAll(importRe)) {
        if (m[2]) continue // import type / export type
        const spec = m[3] ?? m[4] ?? ''
        if (/(^|\/)stores$/.test(spec) || /key_value_stores$/.test(spec)) {
          offenders.push(`${rel(file)} -> ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
  })

  it('storeManagers/index.ts and every stores module have no top-level new', () => {
    const files = ['storeManagers/index.ts', ...STORES_MODULES]
    expect(files.length).toBeGreaterThanOrEqual(17)
    const offenders: string[] = []
    for (const f of files) {
      const text = source(join(BACKEND, f))
      expect(text.length).toBeGreaterThan(0)
      for (const line of text.split('\n')) {
        if (/^(export\s+)?(const|let|var)\s/.test(line) && /\bnew\s/.test(line))
          offenders.push(`${f}: ${line.trim()}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('66.1 end state: no direct child_process', () => {
  const registrations = nonTestSources.filter((f) =>
    /\/sidecar\/[^/]*Registration\.ts$/.test(f)
  )

  it('finds the flow registrations', () => {
    expect(registrations.length).toBeGreaterThanOrEqual(24)
  })

  it('launcher, runner front doors and every registration import no child_process', () => {
    const files = [
      join(BACKEND, 'launcher.ts'),
      join(BACKEND, 'commandRunner.ts'),
      join(BACKEND, 'spawnAsync.ts'),
      join(BACKEND, 'quitHandler.ts'),
      ...registrations
    ]
    const offenders = files
      .filter((f) =>
        /(?:from|require\()\s*['"](?:node:)?child_process['"]/.test(source(f))
      )
      .map(rel)
    expect(offenders).toEqual([])
  })
})
