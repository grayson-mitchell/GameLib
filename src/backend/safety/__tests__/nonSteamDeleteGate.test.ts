/**
 * Phase 82 plan 07 (FND-02, D-05): the non-Steam uninstall and reset files must hold no raw
 * recursive delete. Every GameLib-side recursive delete there (the prefix, GOG's install/support
 * folders, sideload's delete-files folder, resetHeroic) goes through `guardedRemoveTree`; one
 * exception stays, named and justified below. A source scan, so a new `rmSync(x, { recursive })`
 * in these files fails here instead of shipping an unguarded delete.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  findRawRecursiveDeletes,
  scanGuardedFiles,
  type RawRecursiveDelete
} from 'backend/testUtils/rawRecursiveDeletes'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

/** Repo-relative, so the gate reads the same on every checkout. */
const GUARDED_FILES = [
  'src/backend/utils/uninstaller.ts',
  'src/backend/storeManagers/gog/games.ts',
  'src/backend/storeManagers/sideload/games.ts',
  'src/backend/utils.ts'
]

/** Four files are scanned; fewer means the list was emptied or a file moved. */
const FLOOR = 4

interface Allowed {
  file: string
  /** The enclosing function, matched by name rather than by line so edits above do not stale it. */
  fn: string
  reason: string
}

const ALLOWED: Allowed[] = [
  {
    file: 'src/backend/utils.ts',
    fn: 'removeFolder',
    reason:
      'download-queue partial-install cleanup: resolves its target through assertContainedPath under the default install path, no renderer channel reaches it (Phase 72 D-09), and it is outside D-10/D-11 (uninstall and reset)'
  }
]

/** The name of the nearest `function name(` at or above a 1-based line. */
function enclosingFunction(file: string, line: number): string | undefined {
  const lines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n')
  for (let i = Math.min(line, lines.length) - 1; i >= 0; i--) {
    const m = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(
      lines[i] ?? ''
    )
    if (m) return m[1]
  }
  return undefined
}

function scan(): RawRecursiveDelete[] {
  return scanGuardedFiles(
    GUARDED_FILES.map((f) => join(REPO_ROOT, f)),
    FLOOR
  ).map((d) => ({ ...d, file: d.file.slice(REPO_ROOT.length + 1) }))
}

const isAllowed = (d: RawRecursiveDelete): boolean =>
  ALLOWED.some(
    (a) => a.file === d.file && a.fn === enclosingFunction(d.file, d.line)
  )

describe('non-Steam uninstall/reset files hold no raw recursive delete (82-07)', () => {
  it('finds only the allowlisted removeFolder', () => {
    const offenders = scan().filter((d) => !isAllowed(d))
    expect(offenders).toEqual([])
  })

  it('the allowlist is not stale: the removeFolder delete is still found', () => {
    const allowedFound = scan().filter(isAllowed)
    expect(allowedFound).toHaveLength(ALLOWED.length)
    expect(allowedFound[0]?.file).toBe('src/backend/utils.ts')
    for (const a of ALLOWED) expect(a.reason.length).toBeGreaterThan(40)
  })

  it('scans every guarded file (the floor is met, an empty list throws)', () => {
    expect(GUARDED_FILES).toHaveLength(FLOOR)
    expect(() => scanGuardedFiles([], FLOOR)).toThrow(/below the floor/)
  })

  it('a raw recursive delete added to a guarded file would be an offender', () => {
    // Anti-vacuity: the gate is only worth anything if the scan can fail.
    const injected = findRawRecursiveDeletes(
      "import { rmSync } from 'fs'\nrmSync(prefix, { recursive: true })\n",
      'src/backend/utils/uninstaller.ts'
    )
    expect(injected).toHaveLength(1)
    expect(injected.filter((d) => !isAllowed(d))).toHaveLength(1)
  })
})
