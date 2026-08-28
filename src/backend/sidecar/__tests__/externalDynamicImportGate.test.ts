/**
 * AST gate: forbid native dynamic `import('electron')` under `src/backend` and
 * `src/sidecar` (quick/260815-vvz, defect 1).
 *
 * **Why this exists.** `package.json`'s `build:sidecar` script marks `electron` `--external`
 * for esbuild, so a STATIC `import { app } from 'electron'`
 * compiles to a plain CJS `require('electron')` — which the sidecar's `Module._load` hook
 * (`installElectronHook.ts`) intercepts and rewrites to `electronStub.ts` before any backend
 * module is imported. A DYNAMIC `import('electron')`, by contrast, esbuild leaves untouched as
 * a native ESM dynamic import in the CJS bundle (because the target is external) — Node's
 * native ESM loader resolves it, and that loader never consults `Module._load`. The real
 * `electron` npm package (whose CJS export is a bare path STRING, not an object with an `app`
 * property) loads instead, so `const { app } = await import('electron')` silently resolves
 * `app` to `undefined`. This is EXACTLY how `raiseFrontmostBottledProcess`'s `app.hide()`
 * yield-fallback (`bottle.ts`) crashed with `TypeError: Cannot read properties of undefined
 * (reading 'hide')` under the packaged/dev sidecar, while every jest suite covering it stayed
 * green (see this gate's sibling `bottle.test.ts` tests 2a/2b, which are explicitly GREEN today
 * and prove nothing about this defect — jest's own module resolution downlevels `await
 * import('electron')` to a `require()` through jest's registry, which resolves to the mock).
 *
 * **A regex over each file's own text cannot see this reliably** (multi-line imports, string
 * concatenation edge cases, comments containing the literal text) — this walks the real
 * TypeScript AST, following `electronReachLedger.test.ts`'s established file-discovery and
 * traversal conventions in this same directory rather than inventing new ones.
 */

import * as ts from 'typescript'
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative, resolve } from 'path'

const REPO_ROOT = resolve(join(__dirname, '../../../..'))

/** The modules whose dynamic `import()` esbuild leaves as a native ESM import that
 * `Module._load` cannot intercept. Shared by Gate 1 and Gate 3 so the known-bad self-test
 * cannot drift from the real check.
 *
 * Phase 35 Plan 05 (D-04): `'electron-store'` was removed from this list because the package
 * itself was removed from `package.json`. A gate entry naming a package that no longer exists
 * is a trap -- it reads as coverage while asserting nothing. `electron` is now the ONLY
 * specifier `installElectronHook.ts` intercepts, and therefore the only one where a dynamic
 * `import()` silently gets different semantics from the static form. Its replacement,
 * `conf` (via the first-party `backend/store_backend.ts`), is not intercepted by anything, so
 * a dynamic import of it would resolve the same module as the static form -- no hazard, and
 * nothing to gate. */
export const FORBIDDEN_DYNAMIC_IMPORT_MODULES = ['electron']

export interface DynamicImportHit {
  file: string
  line: number
  specifier: string
}

/**
 * Walks a single already-parsed source file for `CallExpression` nodes whose callee is the
 * native `import` keyword (`ts.SyntaxKind.ImportKeyword` -- dynamic `import(...)` parses this
 * way, distinct from a plain `Identifier` named `import`) and whose sole argument is a string
 * literal in `FORBIDDEN_DYNAMIC_IMPORT_MODULES`. Exported (not just used internally) so Gate 3's
 * known-bad self-test can call the exact same detector the real scan uses.
 */
export function findForbiddenDynamicImports(
  sourceFile: ts.SourceFile
): DynamicImportHit[] {
  const hits: DynamicImportHit[] = []

  function visit(node: ts.Node): void {
    if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length > 0 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      const specifier = node.arguments[0].text
      if (FORBIDDEN_DYNAMIC_IMPORT_MODULES.includes(specifier)) {
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(sourceFile)
        )
        hits.push({
          file: sourceFile.fileName,
          line: line + 1,
          specifier
        })
      }
    }
    ts.forEachChild(node, visit)
  }

  visit(sourceFile)
  return hits
}

/**
 * Recursively collects every `.ts` file under `root`, EXCLUDING `__tests__` and `__mocks__`
 * directories (this gate polices production source, not test doubles or the tests themselves --
 * a test file legitimately reaching into `jest.mock('electron', ...)` machinery is not the
 * defect this gate exists to catch).
 */
function collectSourceFiles(root: string): string[] {
  const results: string[] = []

  function walk(dir: string): void {
    for (const entry of readdirSync(dir)) {
      if (entry === '__tests__' || entry === '__mocks__') continue
      const full = join(dir, entry)
      const stats = statSync(full)
      if (stats.isDirectory()) {
        walk(full)
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        results.push(full)
      }
    }
  }

  walk(root)
  return results
}

function toRepoRelative(absolutePath: string): string {
  return relative(REPO_ROOT, absolutePath).split('\\').join('/')
}

describe('externalDynamicImportGate (quick/260815-vvz, defect 1 RED-prover)', () => {
  let scannedFiles: string[]
  let allHits: DynamicImportHit[]

  beforeAll(() => {
    const roots = [
      join(REPO_ROOT, 'src/backend'),
      join(REPO_ROOT, 'src/sidecar')
    ]
    scannedFiles = roots.flatMap((root) => collectSourceFiles(root))

    allHits = []
    for (const file of scannedFiles) {
      const content = readFileSync(file, 'utf-8')
      const sourceFile = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.ES2017,
        true
      )
      allHits.push(...findForbiddenDynamicImports(sourceFile))
    }
  }, 30000)

  it('Gate 1: no file under src/backend or src/sidecar (excluding __tests__/__mocks__) contains a dynamic import() of electron or electron-store', () => {
    if (allHits.length > 0) {
      const description = allHits
        .map(
          (hit) => `${toRepoRelative(hit.file)}:${hit.line} (${hit.specifier})`
        )
        .join(', ')
      throw new Error(
        `Found ${allHits.length} forbidden dynamic import() of an esbuild-external module -- ` +
          `these bypass the sidecar's Module._load electron interception (see this file's own ` +
          `docstring for the full mechanism). Replace with a static import instead: ${description}`
      )
    }
    expect(allHits).toEqual([])
  })

  it('Gate 2 (anti-vacuity): the scan visited a plausible number of files, ruling out a silently-stopped traversal', () => {
    // Measured count at authoring time was 265 files under src/backend + src/sidecar (excluding
    // __tests__/__mocks__). 200 is comfortably under that -- a resolver that silently stops
    // traversing (a broken glob, an over-eager filter) would make Gate 1 pass vacuously against
    // an empty or near-empty set; this floor rules that out.
    expect(scannedFiles.length).toBeGreaterThanOrEqual(200)
  })

  describe('Gate 3 (known-bad self-test, committed permanently -- proves Gate 1 is not vacuous)', () => {
    it('detects a dynamic import("electron") destructure -- the exact defect-1 shape', () => {
      const badSource = `
        async function raiseFrontmostBottledProcess() {
          const { app } = await import('electron')
          app.hide()
        }
      `
      const sourceFile = ts.createSourceFile(
        'known-bad-specimen.ts',
        badSource,
        ts.ScriptTarget.ES2017,
        true
      )
      const hits = findForbiddenDynamicImports(sourceFile)
      expect(hits).toHaveLength(1)
      expect(hits[0].specifier).toBe('electron')
    })

    it('reports ZERO hits for the legal control: a static import plus a legal dynamic-internal import', () => {
      const controlSource = `
        import { app } from 'electron'

        async function loadEnvironment() {
          const { isMac } = await import('backend/constants/environment')
          return isMac ? app.getName() : null
        }
      `
      const sourceFile = ts.createSourceFile(
        'known-good-specimen.ts',
        controlSource,
        ts.ScriptTarget.ES2017,
        true
      )
      const hits = findForbiddenDynamicImports(sourceFile)
      expect(hits).toEqual([])
    })
  })
})
