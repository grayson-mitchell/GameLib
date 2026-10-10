/**
 * TDD invariant for Phase 45 Plan 02, Task 3 (D-11 promote): once the send-kind
 * `winetricksInstall` channel is retired, the batch queue's `winetricksApply` must be the ONLY
 * renderer-reachable path that calls `Winetricks.install(`. Four invariants, scanned directly
 * off source text (comment-stripped, following `fakeHomeIsolation.test.ts`'s own walker idiom)
 * rather than asserted indirectly through a registry snapshot, because a half-deleted channel
 * (unregistered but still exported from preload, or vice versa) is exactly the defect class a
 * registry-only check cannot see.
 *
 * Written and run RED before the channel deletion. At RED, Invariant 1 and Invariant 3 both
 * fail — `wineToolsFlowRegistration.ts`'s `ipcMain.on('winetricksInstall', ...)` block and
 * `ipc_handler.ts`'s `addListener('winetricksInstall', ...)` block are both still present, and
 * `src/preload/api/wine.ts` still exports `winetricksInstall` — see the SUMMARY for the exact
 * RED failure line this file produced.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

import { stripSourceComments } from '../../testUtils/stripSourceComments'

const SRC_ROOT = join(__dirname, '..', '..', '..')
const PRUNED_DIRS = new Set(['__tests__', 'node_modules'])
const SCANNED_EXT = /\.(ts|tsx)$/

function toRepoRel(absPath: string): string {
  return relative(SRC_ROOT, absPath).split(sep).join('/')
}

function walk(dir: string, out: string[]): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (PRUNED_DIRS.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(full, out)
    } else if (SCANNED_EXT.test(entry.name)) {
      out.push(full)
    }
  }
}

interface FileSource {
  rel: string
  stripped: string
}

const scannedPaths: string[] = []
walk(SRC_ROOT, scannedPaths)

const sources: FileSource[] = scannedPaths.map((absPath) => ({
  rel: toRepoRel(absPath),
  stripped: stripSourceComments(readFileSync(absPath, 'utf-8'))
}))

/** Anti-vacuity floor: a walk that silently scans nothing (wrong root, pruned too much) must
 * fail loud, not pass empty. Measured directly off this tree: 759 non-test .ts/.tsx files live
 * under src/ as of this plan; 400 gives generous headroom without being a number nobody could
 * fail under a real regression. */
const MIN_FILES_SCANNED = 400

function findFile(rel: string): FileSource {
  const file = sources.find((f) => f.rel === rel)
  if (!file) {
    throw new Error(
      `expected to find ${rel} among the ${sources.length} scanned files — the walk or the path is wrong`
    )
  }
  return file
}

describe('winetricksInstallPathInvariant (Phase 45 Plan 02, D-11 promote: winetricksApply is the only renderer install path)', () => {
  it('non-vacuity: the walk scanned at least 400 non-test .ts/.tsx files under src/', () => {
    expect(sources.length).toBeGreaterThanOrEqual(MIN_FILES_SCANNED)
  })

  it('Invariant 1: Winetricks.install( appears only in backend/tools/winetricksQueue.ts and backend/launcher.ts', () => {
    const expectedCallers = new Set([
      'backend/tools/winetricksQueue.ts',
      'backend/launcher.ts'
    ])
    const actualCallers = new Set(
      sources
        .filter((f) => f.stripped.includes('Winetricks.install('))
        .map((f) => f.rel)
    )
    expect(actualCallers).toEqual(expectedCallers)
  })

  it('non-vacuity: Winetricks.install( is actually found at least once in winetricksQueue.ts', () => {
    const queue = findFile('backend/tools/winetricksQueue.ts')
    const occurrences = queue.stripped.split('Winetricks.install(').length - 1
    expect(occurrences).toBeGreaterThanOrEqual(1)
  })

  it('Invariant 2: no non-test file under src/ contains the literal --gui', () => {
    const offenders = sources
      .filter((f) => f.stripped.includes('--gui'))
      .map((f) => f.rel)
    expect(offenders).toEqual([])
  })

  it('Invariant 3: no file under src/backend registers winetricksInstall via ipcMain.on/handle, addListener or addHandler; preload exports no winetricksInstall', () => {
    const REGISTRATION_RE =
      /\b(?:ipcMain\.on|ipcMain\.handle|addListener|addHandler)\(\s*['"]winetricksInstall['"]/
    const offenders = sources
      .filter(
        (f) => f.rel.startsWith('backend/') && REGISTRATION_RE.test(f.stripped)
      )
      .map((f) => f.rel)
    expect(offenders).toEqual([])

    const preload = findFile('preload/api/wine.ts')
    expect(preload.stripped).not.toMatch(/\bwinetricksInstall\b/)
  })

  it('Invariant 4: preload/api/wine.ts exports winetricksApply built with makeHandlerInvoker', () => {
    const preload = findFile('preload/api/wine.ts')
    expect(preload.stripped).toMatch(
      /export const winetricksApply = makeHandlerInvoker\(\s*['"]winetricksApply['"]\s*\)/
    )
  })

  it('non-vacuity: winetricksApply is actually found in the sidecar registration module', () => {
    const registration = findFile(
      'backend/sidecar/wineToolsFlowRegistration.ts'
    )
    expect(registration.stripped).toContain('winetricksApply')
  })
})
