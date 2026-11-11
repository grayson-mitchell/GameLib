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
import * as ts from 'typescript'
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

/**
 * Test infrastructure is excluded from the production scans by name, not by accident. The one
 * place in it that may value-import stores modules is testUtils/testServices.ts (the test-side
 * stores factory); a dedicated test below pins that no other testUtils file does.
 */
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

/**
 * Top-level `const|let|var` statements whose initializer constructs something at import time
 * (a `new X(...)` outside any function body). Matched on the whole statement via the parser,
 * so a prettier-wrapped `const x =\n  new X(` is caught as well as the one-line form.
 */
function topLevelNewStatements(text: string): string[] {
  const sf = ts.createSourceFile('x.ts', text, ts.ScriptTarget.Latest, true)
  const out: string[] = []
  const hasNewOutsideFunctions = (node: ts.Node): boolean => {
    if (ts.isNewExpression(node)) return true
    if (ts.isFunctionLike(node) || ts.isClassLike(node)) return false
    return ts.forEachChild(node, hasNewOutsideFunctions) ?? false
  }
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue
    for (const decl of st.declarationList.declarations) {
      if (decl.initializer && hasNewOutsideFunctions(decl.initializer)) {
        out.push(decl.getText(sf).replace(/\s+/g, ' ').slice(0, 80))
      }
    }
  }
  return out
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

  it('the top-level-new scan catches one-line and prettier-wrapped statements, not factories', () => {
    expect(topLevelNewStatements('export const a = new Map()')).toHaveLength(1)
    expect(topLevelNewStatements('export const a =\n  new Map()')).toHaveLength(
      1
    )
    expect(
      topLevelNewStatements('const a = foo(\n  new Map()\n)')
    ).toHaveLength(1)
    expect(
      topLevelNewStatements(
        'export const make = () => {\n  return new Map()\n}'
      )
    ).toHaveLength(0)
    expect(
      topLevelNewStatements('function f() { return new Map() }')
    ).toHaveLength(0)
  })

  it('testUtils: only testServices.ts value-imports a stores module', () => {
    const files = walk(join(BACKEND, 'testUtils')).filter((f) =>
      /\.ts$/.test(f)
    )
    expect(files.length).toBeGreaterThan(3)
    const importRe =
      /^(import|export)\s+(type\s+)?[\s\S]*?\sfrom\s+['"]([^'"]+)['"]|(?<!typeof\s)(?:require|import)\(\s*['"]([^'"]+)['"]\s*\)/gm
    const offenders: string[] = []
    for (const file of files) {
      if (rel(file) === 'testUtils/testServices.ts') continue
      for (const m of source(file).matchAll(importRe)) {
        if (m[2]) continue
        const spec = m[3] ?? m[4] ?? ''
        if (/(^|\/)stores$/.test(spec) || /key_value_stores$/.test(spec)) {
          offenders.push(`${rel(file)} -> ${spec}`)
        }
      }
    }
    expect(offenders).toEqual([])
    expect(source(join(BACKEND, 'testUtils/testServices.ts'))).not.toMatch(
      /\brequire\(/
    )
  })

  it('storeManagers/index.ts and every stores module have no top-level new', () => {
    const files = ['storeManagers/index.ts', ...STORES_MODULES]
    expect(files.length).toBeGreaterThanOrEqual(17)
    const offenders: string[] = []
    for (const f of files) {
      const text = source(join(BACKEND, f))
      expect(text.length).toBeGreaterThan(0)
      offenders.push(...topLevelNewStatements(text).map((st) => `${f}: ${st}`))
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

describe('66.2 end state: one process runner', () => {
  // The ceilings module is CommonJS (a node script); there is no ESM form to import.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ceilings = require('../../../meta/backendDiCeilings.cjs') as {
    census: () => { childProcess: Record<string, number> }
    loadShards: () => {
      merged: { sanctioned: Record<string, { childProcess: number }> }
      failures: string[]
    }
  }

  it('only src/backend/process/runner.ts imports child_process', () => {
    expect(ceilings.census().childProcess).toEqual({
      'src/backend/process/runner.ts': 1
    })
  })

  it('the sanctioned list has exactly one child_process entry: the runner', () => {
    const { merged, failures } = ceilings.loadShards()
    expect(failures).toEqual([])
    const withCp = Object.entries(merged.sanctioned)
      .filter(([, e]) => e.childProcess > 0)
      .map(([p]) => p)
    expect(withCp).toEqual(['src/backend/process/runner.ts'])
  })

  it('the ESLint config rejects a child_process import in a backend production path', () => {
    const config = readFileSync(
      join(BACKEND, '..', '..', 'eslint.config.mjs'),
      'utf8'
    )
    const start = config.indexOf("files: ['src/backend/**/*.ts']")
    expect(start).toBeGreaterThan(-1)
    const block = config.slice(start, start + 1500)
    expect(block).toContain("name: 'child_process'")
    expect(block).toContain("name: 'node:child_process'")
    expect(block).toContain('...RESTRICTED_PATHS')
    expect(block).toContain("'src/backend/process/runner.ts'")
    expect(block).toMatch(/'no-restricted-imports': \[\s*'error'/)
  })
})

describe('66.3 gates (skeleton; plan 18 adds the end state)', () => {
  // Plan 18 adds the census zeros, shim absence and importer absence. Until then per-plan
  // progress is gated by the moduleState shard ceilings.
  const importsPlatformShim = (
    text: string,
    opts?: { allowTypes?: boolean }
  ): boolean => {
    const code = stripSourceComments(text)
    return code.split('\n').some((line) => {
      if (opts?.allowTypes && /^\s*import\s+type\b/.test(line)) return false
      const m =
        /from\s*(['"])(backend\/platform|(?:\.\.?\/)+platform|\.\/platform)(\/index)?\1/.exec(
          line
        )
      return m !== null
    })
  }
  const callsStaticConfigGet = (text: string): boolean =>
    /\b(GlobalConfig|GameConfig)\.get\(/.test(stripSourceComments(text))

  const OWNED_66_3 = [
    'src/backend/platform/index.ts',
    'src/backend/config.ts',
    'src/backend/game_config.ts',
    'src/backend/online_monitor.ts',
    'src/backend/sidecar/processGuards.ts',
    'src/backend/engine/engineState.ts',
    'src/backend/storeManagers/steam/anonymousClient.ts',
    'src/backend/storeManagers/steam/gameSessionState.ts',
    'src/backend/storeManagers/steam/userSignInState.ts',
    'src/backend/storeManagers/steam/authTrigger.ts',
    'src/backend/storeManagers/steam/state.ts',
    'src/backend/storeManagers/steam/bridge/helperRegistry.ts',
    'src/backend/storeManagers/steam/bridge/shimCoverage.ts',
    'src/backend/tools/winetricksQueue.ts',
    'src/backend/signInProbe/pass.ts',
    'src/backend/signInProbe/outcomes.ts',
    'src/backend/signInProbe/sessionEpoch.ts',
    'src/backend/storeManagers/steam/user.ts',
    'src/backend/storeManagers/steam/bottle.ts',
    'src/backend/tools/dxmt.ts',
    'src/backend/steamgrid/secretStore.ts',
    'src/backend/sidecar/steamgridSecretStore.ts',
    'src/backend/humble/classify.ts',
    'src/backend/humble/library.ts',
    'src/backend/humble/loginWindowSeam.ts',
    'src/backend/humble/secretStore.ts',
    'src/backend/humble/syncFence.ts',
    'src/backend/humble/user.ts'
  ] as const

  it('scans a full backend tree', () => {
    expect(nonTestSources.length).toBeGreaterThanOrEqual(400)
  })

  it('importsPlatformShim fires on shim imports and not on comments or siblings', () => {
    expect(importsPlatformShim("import { app } from 'backend/platform'")).toBe(
      true
    )
    expect(importsPlatformShim("import { a } from '../platform'")).toBe(true)
    expect(
      importsPlatformShim("import { a } from '../../platform/index'")
    ).toBe(true)
    expect(importsPlatformShim("import { a } from './platform'")).toBe(true)
    expect(
      importsPlatformShim("import type { T } from 'backend/platform'", {
        allowTypes: true
      })
    ).toBe(false)
    expect(importsPlatformShim("// from 'backend/platform'")).toBe(false)
    expect(
      importsPlatformShim("import { a } from 'backend/platformCapture'")
    ).toBe(false)
  })

  it('callsStaticConfigGet fires on static config reads and not on comments or injected config', () => {
    expect(
      callsStaticConfigGet('const s = GlobalConfig.get().getSettings()')
    ).toBe(true)
    expect(callsStaticConfigGet('GameConfig.get(appName)')).toBe(true)
    expect(callsStaticConfigGet('deps.config.getSettings()')).toBe(false)
    expect(callsStaticConfigGet('// GlobalConfig.get()')).toBe(false)
    expect(callsStaticConfigGet('gameConfigs.get(appName)')).toBe(false)
  })

  it('OWNED_66_3 lists the 28 files 66.3 owns, all existing and none sanctioned', () => {
    // 66.3-17 deleted humble/humbleStores.ts outright (its holder had no remaining reader), so it
    // leaves the owned list: the file went away, it did not move.
    expect(OWNED_66_3).toHaveLength(28)
    const root = join(BACKEND, '..', '..')
    const sanctioned = [
      'src/backend/logger/index.ts',
      'src/backend/sidecar/bootstrap.ts',
      'src/backend/process/runner.ts'
    ]
    for (const p of OWNED_66_3) {
      expect(existsSync(join(root, p))).toBe(true)
      expect(sanctioned).not.toContain(p)
    }
  })
})
