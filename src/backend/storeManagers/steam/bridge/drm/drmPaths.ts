/**
 * Phase 56 plan 04: on-disk layout for DRM mode (Claude's discretion in
 * CONTEXT, pinned by the plan outline).
 *
 * Every directory sits under `<appFolder>/steam-bridge/drm/`. The runner
 * clone is keyed by the CrossOver `CFBundleVersion` (D-09/D-10), so a
 * CrossOver update produces a new clone path.
 *
 * This module deliberately does NOT import backend/constants/paths, which
 * renames the legacy folder at module load. Consumers pass `appFolder` in.
 *
 * Each getter returns null rather than throwing on input that fails its regex
 * or escapes its root (T-56-04-01).
 */
import { isAbsolute, join, relative } from 'path'

const MANIFEST_VERSION_RE = /^[0-9]{1,20}$/
const CROSSOVER_BUILD_RE = /^[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/
const COMPONENT_ID_RE = /^steamclient-layer-cx[0-9]{1,4}(\.[0-9]{1,6}){2,4}$/
const APP_ID_RE = /^[0-9]{1,10}$/
const LAUNCH_ID_RE = /^[0-9]{1,16}$/

// ts-prune-ignore-next
export type DrmPaths = {
  root: string
  valveClientRoot: string
  runnersRoot: string
  componentRoot: string
  traceRoot: string
  valveClientDir(manifestVersion: string): string | null
  runnerDir(crossoverBuild: string): string | null
  runnerAppPath(crossoverBuild: string): string | null
  componentDir(componentId: string): string | null
  traceFile(appId: string, launchId: string): string | null
}

function contained(root: string, path: string): string | null {
  const rel = relative(root, path)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) return null
  return path
}

// ts-prune-ignore-next
export function buildDrmPaths(appFolder: string): DrmPaths | null {
  // eslint-disable-next-line no-control-regex
  if (!appFolder || !isAbsolute(appFolder) || /[\x00-\x1f]/.test(appFolder)) {
    return null
  }
  const root = join(appFolder, 'steam-bridge', 'drm')
  const valveClientRoot = join(root, 'valve-client')
  const runnersRoot = join(root, 'runners')
  const componentRoot = join(root, 'component')
  const traceRoot = join(root, 'trace')

  const runnerDir = (build: string): string | null =>
    typeof build === 'string' && CROSSOVER_BUILD_RE.test(build)
      ? contained(runnersRoot, join(runnersRoot, 'crossover-' + build))
      : null

  return {
    root,
    valveClientRoot,
    runnersRoot,
    componentRoot,
    traceRoot,
    valveClientDir: (v) =>
      typeof v === 'string' && MANIFEST_VERSION_RE.test(v)
        ? contained(valveClientRoot, join(valveClientRoot, v))
        : null,
    runnerDir,
    runnerAppPath: (build) => {
      const dir = runnerDir(build)
      return dir ? contained(runnersRoot, join(dir, 'CrossOver')) : null
    },
    componentDir: (id) =>
      typeof id === 'string' && COMPONENT_ID_RE.test(id)
        ? contained(componentRoot, join(componentRoot, id))
        : null,
    traceFile: (appId, launchId) =>
      typeof appId === 'string' &&
      typeof launchId === 'string' &&
      APP_ID_RE.test(appId) &&
      LAUNCH_ID_RE.test(launchId)
        ? contained(traceRoot, join(traceRoot, appId + '-' + launchId + '.log'))
        : null
  }
}

/**
 * The release-asset id 56-10 packages, one per allowlisted CrossOver build.
 */
// ts-prune-ignore-next
export function steamclientLayerComponentId(
  crossoverBuild: string
): string | null {
  return typeof crossoverBuild === 'string' &&
    CROSSOVER_BUILD_RE.test(crossoverBuild)
    ? 'steamclient-layer-cx' + crossoverBuild
    : null
}

/** The `<launch>` token in the trace file name, generated per launch (56-12). */
// ts-prune-ignore-next
export function newDrmLaunchId(now: number = Date.now()): string {
  return Number.isFinite(now) && now >= 0 ? String(Math.trunc(now)) : '0'
}
