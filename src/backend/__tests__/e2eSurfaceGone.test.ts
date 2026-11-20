/**
 * Phase 82 D-19 / D-05 deletion gate: the CI=e2e mock surface is gone from src/. No shipped code
 * path may swap a real store backend for a stub or redirect the app folder through an environment
 * variable. Fails if an e2e branch, mock file, stub-listener registration or command-stub channel
 * comes back, and just as loudly if the walk scans nothing (an empty or mis-rooted scan would
 * leave a "finds no hits" gate green forever).
 *
 * Two tiers, because the one remaining e2e mention in src/ is legitimate and lives in a test:
 * `tauriShellSource.test.ts` pins the Rust shell's own `CI=e2e` guard (it refuses to rewrite the
 * host's gamelib:// OS registration during an automated run), which is not a mock backend.
 *   - Shipped source (everything outside a `__tests__` directory) may not carry any quoted
 *     "e2e" literal or any of the named patterns.
 *   - Test source may not carry the stub-surface symbols or a `CI === 'e2e'` comparison.
 * This file names every pattern by design, so it is skipped.
 */
import { assertAtOrAboveFloor } from 'backend/testUtils/censusFloor'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, relative } from 'path'

const ROOT = join(__dirname, '..', '..', '..')
const SELF = join(__dirname, 'e2eSurfaceGone.test.ts')

/** Floor on files scanned (D-05): shipped + test source under src/. Never lower. */
const SCANNED_FILES_FLOOR = 500

const STUB_SURFACE: RegExp[] = [
  /CI\s*===\s*['"]e2e['"]/,
  /e2eMock/,
  /StubListeners/,
  /CommandStub/
]
const SHIPPED_ONLY: RegExp[] = [
  /CI\s*[!=]==\s*['"]e2e['"]/,
  /CI=e2e/,
  /['"]e2e['"]/
]

interface Hit {
  file: string
  pattern: string
}

function walk(dir: string, out: string[]): void {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue
    const full = join(dir, e.name)
    if (e.isDirectory()) walk(full, out)
    else if (/\.(ts|tsx|cjs|js)$/.test(e.name)) out.push(full)
  }
}

/** Patterns from the rule set that match `source` (comments stripped) at `relPath`. */
function matchedPatterns(relPath: string, source: string): string[] {
  const isTest = relPath.split(/[\\/]/).includes('__tests__')
  const patterns = isTest ? STUB_SURFACE : [...STUB_SURFACE, ...SHIPPED_ONLY]
  const code = stripSourceComments(source)
  return patterns.filter((p) => p.test(code)).map(String)
}

/** Walks `dir`, asserts the scan is not vacuous, and returns every hit. */
function scan(dir: string): Hit[] {
  const files: string[] = []
  walk(dir, files)
  const scanned = files.filter((f) => f !== SELF)
  assertAtOrAboveFloor(
    'e2eSurfaceGone files',
    scanned.length,
    SCANNED_FILES_FLOOR
  )
  return scanned.flatMap((file) =>
    matchedPatterns(relative(ROOT, file), readFileSync(file, 'utf-8')).map(
      (pattern) => ({ file: relative(ROOT, file), pattern })
    )
  )
}

describe('e2e surface gone (Phase 82 D-19)', () => {
  it('src/ carries no CI=e2e mock surface', () => {
    expect(scan(join(ROOT, 'src'))).toEqual([])
  })

  it('an empty scan fails the floor instead of passing vacuously', () => {
    const empty = mkdtempSync(join(tmpdir(), 'e2e-surface-gone-'))
    try {
      expect(() => scan(empty)).toThrow(/below the floor of 500/)
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })

  describe('the matcher detects each pattern', () => {
    it.each([
      ["if (process.env.CI === 'e2e') return", 'src/backend/a.ts'],
      ["if (process.env.CI !== 'e2e') go()", 'src/backend/a.ts'],
      ['// not a comment line\nconst x = "CI=e2e"', 'src/backend/a.ts'],
      ["const mode = 'e2e'", 'src/backend/a.ts'],
      ["import { m } from './e2eMock'", 'src/backend/a.ts'],
      ['registerStubListeners()', 'src/backend/a.ts'],
      ['setLegendaryCommandStub()', 'src/backend/a.ts'],
      ["it('x', () => { if (CI === 'e2e') {} })", 'src/backend/__tests__/a.ts'],
      ["import { m } from './e2eMock'", 'src/backend/__tests__/a.ts'],
      ['expect(StubListeners)', 'src/backend/__tests__/a.ts'],
      ['expect(CommandStub)', 'src/backend/__tests__/a.ts']
    ])('flags %j in %s', (source, relPath) => {
      expect(matchedPatterns(relPath, source)).not.toEqual([])
    })

    it('ignores a mention inside a comment', () => {
      expect(
        matchedPatterns(
          'src/backend/a.ts',
          "// CI === 'e2e' e2eMock CommandStub\n/* StubListeners */\nconst ok = 1"
        )
      ).toEqual([])
    })

    it('lets a test pin the Rust shell guard string without tripping the shipped-only tier', () => {
      expect(
        matchedPatterns(
          'src/backend/__tests__/tauriShellSource.test.ts',
          "test('the CI=e2e guard', () => expect(s).toContain('Ok(\"e2e\")'))"
        )
      ).toEqual([])
    })
  })
})
