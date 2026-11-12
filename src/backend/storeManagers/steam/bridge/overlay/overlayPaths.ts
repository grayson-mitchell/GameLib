/**
 * Phase 60: on-disk layout for the overlay, sibling to the DRM root under
 * `<appFolder>/steam-bridge/overlay/`. Does NOT import process/appPaths
 * (which renames the legacy folder at load); callers pass `appFolder`.
 * Each getter returns null on bad input or escape (T-60-02-04).
 */
import { isAbsolute, join, relative } from 'path'

const CROSSOVER_BUILD_RE = /^[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/

export type OverlayPaths = {
  root: string
  runnersRoot: string
  traceRoot: string
  runnerDir(crossoverBuild: string): string | null
  runnerCxRoot(crossoverBuild: string): string | null
}

function contained(root: string, path: string): string | null {
  const rel = relative(root, path)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return path
}

export function buildOverlayPaths(appFolder: string): OverlayPaths | null {
  // eslint-disable-next-line no-control-regex
  if (!appFolder || !isAbsolute(appFolder) || /[\x00-\x1f]/.test(appFolder)) {
    return null
  }
  const root = join(appFolder, 'steam-bridge', 'overlay')
  const runnersRoot = join(root, 'runners')
  const traceRoot = join(root, 'trace')

  const runnerDir = (build: string): string | null =>
    typeof build === 'string' && CROSSOVER_BUILD_RE.test(build)
      ? contained(runnersRoot, join(runnersRoot, 'crossover-' + build))
      : null

  return {
    root,
    runnersRoot,
    traceRoot,
    runnerDir,
    runnerCxRoot: (build) => {
      const dir = runnerDir(build)
      return dir ? contained(runnersRoot, join(dir, 'CrossOver')) : null
    }
  }
}
