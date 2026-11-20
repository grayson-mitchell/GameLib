/**
 * Phase 82 plan 09 (FND-02, D-05, D-16): the Steam uninstall, cancel-cleanup, bridge-bottle and
 * copy-removal files must hold no raw recursive delete. Every GameLib-side recursive delete there
 * goes through `guardedRemoveTree`, or is pre-checked by `checkRemoval` where a Node delete must
 * stay synchronous; the one such exception is named and justified below. A source scan, so a new
 * `rmSync(x, { recursive })` in these files fails here instead of shipping an unguarded delete.
 */
import { readFileSync } from 'fs'
import { join, sep } from 'path'
import {
  findRawRecursiveDeletes,
  scanGuardedFiles,
  type RawRecursiveDelete
} from 'backend/testUtils/rawRecursiveDeletes'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

/** Repo-relative, so the gate reads the same on every checkout. */
const GUARDED_FILES = [
  'src/backend/storeManagers/steam/gameUninstall.ts',
  'src/backend/storeManagers/steam/cancelDelete.ts',
  'src/backend/storeManagers/steam/bridgeBottleLifecycle.ts',
  'src/backend/storeManagers/steam/library/acfState.ts'
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
    file: 'src/backend/storeManagers/steam/cancelDelete.ts',
    fn: 'deleteCancelledSteamInstall',
    reason:
      'Phase 75 critical section: no await between the last in-flight check and the delete; pre-checked by gamelib-safety checkRemoval (D-16)'
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
  ).map((d) => ({
    ...d,
    // Forward slashes on every OS, so the comparison with ALLOWED holds on Windows too.
    file: d.file
      .slice(REPO_ROOT.length + 1)
      .split(sep)
      .join('/')
  }))
}

const isAllowed = (d: RawRecursiveDelete): boolean =>
  ALLOWED.some(
    (a) => a.file === d.file && a.fn === enclosingFunction(d.file, d.line)
  )

describe('Steam uninstall/cancel/copy files hold no raw recursive delete (82-09)', () => {
  it('finds only the allowlisted cancel-delete critical-section delete', () => {
    const offenders = scan().filter((d) => !isAllowed(d))
    expect(offenders).toEqual([])
  })

  it('the allowlist is not stale: the cancel-delete delete is still found, and only that one', () => {
    const found = scan()
    const allowedFound = found.filter(isAllowed)
    expect(ALLOWED).toHaveLength(1)
    expect(allowedFound).toHaveLength(ALLOWED.length)
    expect(found).toHaveLength(ALLOWED.length)
    expect(allowedFound[0]?.file).toBe(
      'src/backend/storeManagers/steam/cancelDelete.ts'
    )
    for (const a of ALLOWED) expect(a.reason.length).toBeGreaterThan(40)
  })

  it('scans every guarded file (the floor is met, an empty list throws)', () => {
    expect(GUARDED_FILES).toHaveLength(FLOOR)
    expect(() => scanGuardedFiles([], FLOOR)).toThrow(/below the floor/)
  })

  it('a raw recursive delete added to a guarded file would be an offender', () => {
    // Anti-vacuity: the gate is only worth anything if the scan can fail.
    for (const file of GUARDED_FILES) {
      const injected = findRawRecursiveDeletes(
        "import { rmSync } from 'node:fs'\nrmSync(installRoot, { recursive: true, force: true })\n",
        file
      )
      expect(injected).toHaveLength(1)
      // Only cancelDelete's own function name is allowlisted; the injected text has none.
      expect(injected.filter((d) => !isAllowed(d))).toHaveLength(1)
      // The DI-converted shape (WR-07): a member call on an injected deps object.
      const di = findRawRecursiveDeletes(
        'deps.fs.rmSync(prefix, { recursive: true })\n',
        file
      )
      expect(di).toHaveLength(1)
      expect(di.filter((d) => !isAllowed(d))).toHaveLength(1)
    }
  })
})
