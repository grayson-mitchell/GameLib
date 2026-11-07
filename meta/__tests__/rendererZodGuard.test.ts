/**
 * V67-C / D-04: zod must not enter the renderer bundle (classic zod 4 is ~454 KB minified).
 *
 * This is a SOURCE-LEVEL stand-in for a bundle check: cheap, runs in the meta project, needs
 * no vite build. Rules:
 *   (a) no non-test file under src/frontend or src/preload value-imports `zod` or anything
 *       under `common/types/ipc` (only `import type` / `export type` qualify; an inline
 *       `import { type X }` does not, because under isolatedModules it can keep a
 *       side-effect import);
 *   (b) src/common/types/ipc/index.ts contains only type imports/exports;
 *   (c) src/common/types/sidecarTransport.ts imports neither zod nor ./ipc;
 *   (d) transitive: following value imports from frontend/preload files through src/common
 *       never reaches a module that value-imports zod or common/types/ipc.
 *
 * Known limit (T-67-14, accepted): does not trace into node_modules or src/backend.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { at } from './fixtures/indexed'

const REPO = join(__dirname, '..', '..')
const SRC = join(REPO, 'src')
const COMMON = join(SRC, 'common')
const IPC_DIR = join(COMMON, 'types', 'ipc')

function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/** Specifiers of every value (non-type) import/export/require/dynamic import. */
function valueImportSpecifiers(source: string): string[] {
  const text = stripComments(source)
  const specs: string[] = []
  const add = (re: RegExp) => {
    for (const m of text.matchAll(re)) specs.push(at(m, 1, 'specifier'))
  }
  // static `import ... from 'x'` / `export ... from 'x'`, excluding `import type` / `export type`
  add(/\b(?:import|export)\s+(?!type\b)[^;'"]*?\bfrom\s*['"]([^'"]+)['"]/g)
  // side-effect `import 'x'`
  add(/\bimport\s*['"]([^'"]+)['"]/g)
  // dynamic import( 'x' ) and require( 'x' )
  add(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]\s*\)/g)
  return specs
}

function resolveSpecifier(
  spec: string,
  fromFile: string,
  exists: (p: string) => boolean = (p) => existsSync(p) && !isDir(p)
): string | null {
  let base: string | null = null
  if (spec.startsWith('.')) base = resolve(dirname(fromFile), spec)
  else if (spec === 'common' || spec.startsWith('common/'))
    base = join(SRC, spec)
  if (!base) return null
  for (const c of [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx')
  ]) {
    if (exists(c)) return c
  }
  return base
}

function isDir(p: string): boolean {
  try {
    return readdirSync(p) !== undefined
  } catch {
    return false
  }
}

function isZod(spec: string): boolean {
  return spec === 'zod' || spec.startsWith('zod/')
}

function isIpcTarget(
  spec: string,
  fromFile: string,
  exists?: (p: string) => boolean
): boolean {
  const abs = resolveSpecifier(spec, fromFile, exists)
  if (!abs) return false
  return abs === IPC_DIR || abs.startsWith(IPC_DIR + '/')
}

function isForbidden(
  spec: string,
  fromFile: string,
  exists?: (p: string) => boolean
): boolean {
  return isZod(spec) || isIpcTarget(spec, fromFile, exists)
}

/** Rule (a)/(c) detector: forbidden value imports directly in one file. */
export function directViolations(source: string, file: string): string[] {
  return valueImportSpecifiers(source).filter((s) => isForbidden(s, file))
}

/** Rule (b) detector: any non-type import/export statement. */
export function nonTypeStatements(source: string): string[] {
  const text = stripComments(source)
  const hits: string[] = []
  for (const m of text.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^;]*$/gm)) {
    hits.push(m[0].trim())
  }
  return hits
}

type ReadFn = (file: string) => string | null

/** Rule (d) detector: returns the chain to the first forbidden module, or null. */
export function transitiveChain(
  entry: string,
  read: ReadFn,
  visited = new Set<string>()
): string[] | null {
  const source = read(entry)
  if (source === null) return null
  const exists = (p: string) => read(p) !== null
  for (const spec of valueImportSpecifiers(source)) {
    if (isForbidden(spec, entry, exists)) return [entry, spec]
    const next = resolveSpecifier(spec, entry, exists)
    if (!next || !(next === COMMON || next.startsWith(COMMON + '/'))) continue
    if (visited.has(next)) continue
    visited.add(next)
    const sub = transitiveChain(next, read, visited)
    if (sub) return [entry, ...sub]
  }
  return null
}

function walk(dir: string): string[] {
  const out: string[] = []
  if (!existsSync(dir)) return out
  for (const e of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!e.isFile() || !/\.(ts|tsx)$/.test(e.name)) continue
    const full = join(e.parentPath ?? (e as { path: string }).path, e.name)
    if (/(__tests__|\.test\.|\.spec\.)/.test(full)) continue
    out.push(full)
  }
  return out
}

const readDisk: ReadFn = (f) =>
  existsSync(f) && !isDir(f) ? readFileSync(f, 'utf8') : null
const rel = (f: string) => relative(REPO, f)

describe('detectors (mutation proof on in-memory snippets)', () => {
  const f = join(SRC, 'frontend', 'x.ts')

  test('rule a: catches value imports, passes type imports', () => {
    expect(directViolations(`import { z } from 'zod'`, f)).toEqual(['zod'])
    expect(directViolations(`import 'zod'`, f)).toEqual(['zod'])
    expect(directViolations(`const z = await import('zod/v4')`, f)).toEqual([
      'zod/v4'
    ])
    expect(directViolations(`const z = require('zod')`, f)).toEqual(['zod'])
    expect(
      directViolations(`import { A } from 'common/types/ipc'`, f)
    ).toHaveLength(1)
    expect(
      directViolations(`export * from '../common/types/ipc/steam'`, f)
    ).toHaveLength(1)
    expect(
      directViolations(`import { type A } from 'common/types/ipc'`, f)
    ).toHaveLength(1)
    expect(
      directViolations(`import type { A } from 'common/types/ipc'`, f)
    ).toEqual([])
    expect(
      directViolations(`export type { A } from 'common/types/ipc'`, f)
    ).toEqual([])
    expect(directViolations(`import { a } from 'common/languages'`, f)).toEqual(
      []
    )
    expect(directViolations(`// import { z } from 'zod'`, f)).toEqual([])
  })

  test('rule b: flags a value statement in an ipc barrel', () => {
    expect(nonTypeStatements(`export { A } from './steam'`)).toHaveLength(1)
    expect(
      nonTypeStatements(
        `export type { A } from './steam'\nimport type { B } from './b'`
      )
    ).toEqual([])
  })

  test('rule d: two-hop chain is reported, type-only second hop is not', () => {
    const entry = join(SRC, 'frontend', 'a.ts')
    const foo = join(COMMON, 'fakeFoo.ts')
    const files: Record<string, string> = {
      [entry]: `import { x } from 'common/fakeFoo'`,
      [foo]: `import { z } from 'zod'`
    }
    const read: ReadFn = (p) => files[p] ?? null
    expect(transitiveChain(entry, read)).toEqual([entry, foo, 'zod'])
    files[foo] = `import type { z } from 'zod'`
    expect(transitiveChain(entry, read)).toBeNull()
  })
})

describe('repo scan', () => {
  const renderer = [
    ...walk(join(SRC, 'frontend')),
    ...walk(join(SRC, 'preload'))
  ]

  test('scan is not vacuous', () => {
    expect(renderer.length).toBeGreaterThan(50)
  })

  test('rule a: no direct zod / common/types/ipc value import in the renderer', () => {
    const bad = renderer.flatMap((file) =>
      directViolations(readFileSync(file, 'utf8'), file).map(
        (s) => `${rel(file)} -> ${s}`
      )
    )
    expect(bad).toEqual([])
  })

  test('rule b: common/types/ipc/index.ts is type-only', () => {
    const idx = join(IPC_DIR, 'index.ts')
    expect(existsSync(idx)).toBe(true)
    expect(nonTypeStatements(readFileSync(idx, 'utf8'))).toEqual([])
  })

  test('rule c: sidecarTransport.ts imports neither zod nor ./ipc', () => {
    const file = join(COMMON, 'types', 'sidecarTransport.ts')
    expect(directViolations(readFileSync(file, 'utf8'), file)).toEqual([])
  })

  test('rule d: no transitive path from the renderer through src/common to zod or ipc', () => {
    const chains = renderer
      .map((file) => transitiveChain(file, readDisk))
      .filter((c): c is string[] => c !== null)
      .map((c) => c.map((p) => (p.startsWith(REPO) ? rel(p) : p)).join(' -> '))
    expect(chains).toEqual([])
  })
})
