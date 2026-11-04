/**
 * Phase 60 plan 07 (D-08, D-12, D-13): launch-side overlay primitives.
 *
 * Builds the CX_ENV tokens that inject the Steam overlay into a bridged game,
 * merges them into an existing CX_ENV, checks the input files, and offers the
 * fail-open prepare functions for the TCP route (clone plus tokens) and the DRM
 * route (tokens only). The Phase 59 fallback engine (Wine-Staging + DXVK)
 * ignores CX_ENV and needs no clone or re-sign, so it gets the same values as
 * plain env vars (D-07). Nothing here throws or rejects; every failure is a step
 * error. The caller passes shimPath and steamBinDir (no games.ts import).
 */
import { isAbsolute, join } from 'path'
import { promises as fs } from 'graceful-fs'

import { overlayStepError, type OverlayStepResult } from './overlayNotice'
import {
  detectCrossoverForOverlay,
  ensureOverlayRunnerClone,
  type OverlayRunnerReady
} from './overlayRunnerClone'
import type { RunTool } from '../drm/runnerClone'

// ts-prune-ignore-next
export type EnvVar = { key: string; value: string }

const APP_ID_RE = /^[0-9]{1,10}$/
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\x00-\x1f\x7f]/

function safePath(p: unknown): p is string {
  return (
    typeof p === 'string' &&
    p !== '' &&
    isAbsolute(p) &&
    !CONTROL_RE.test(p) &&
    !p.includes("'") &&
    !p.includes(':')
  )
}

/**
 * Appends tokens to the CX_ENV entry (case-insensitive key), keeping the
 * existing value first. Rejects a single-quoted value containing a quote.
 */
// ts-prune-ignore-next
export function appendCxEnvTokens(
  env: readonly EnvVar[],
  tokens: readonly string[]
): { status: 'ok'; env: EnvVar[] } | { status: 'error'; cause: string } {
  if (tokens.some((t) => t.slice(t.indexOf("'") + 1, -1).includes("'"))) {
    return { status: 'error', cause: 'invalid CX_ENV value' }
  }
  const idx = env.findIndex((e) => e.key.toUpperCase() === 'CX_ENV')
  const existing = idx >= 0 ? env[idx].value : ''
  const joined = tokens.join(' ')
  const value = existing ? `${existing} ${joined}` : joined
  const rest = env.filter((_, i) => i !== idx)
  return { status: 'ok', env: [...rest, { key: 'CX_ENV', value }] }
}

// 60-11 (G1): dev-only diagnostic input probe. Optional everywhere; an unsafe
// one is dropped so a diagnostic can never fail the overlay.
type OverlayProbe = {
  dylibPath: string
  logPath: string
  experiment?: string
}

// 60-15: closed allowlist for the release-on-open experiment. `key:release+block`
// is excluded because overlay_shim's sendEvent: block would swallow the
// Shift+Tab the key source counts.
const RELEASE_EXPERIMENT_RE = /^(cb:release|cb:release\+block|key:release)$/

function isValidReleaseExperiment(v: string | undefined): boolean {
  return typeof v === 'string' && RELEASE_EXPERIMENT_RE.test(v)
}

type OverlayEnvArgs = {
  appId: string
  shimPath: string
  steamBinDir: string
  probe?: OverlayProbe
}

/**
 * The probe is armed only by the sidecar's own env, exactly '1'. Pure; the
 * caller supplies the trace root, the dylib path and the clock.
 */
// ts-prune-ignore-next
export function overlayInputProbeFromEnv(
  env: Record<string, string | undefined>,
  a: { appId: string; traceRoot: string; dylibPath: string; now: number }
): OverlayProbe | undefined {
  if (env.GAMELIB_OVERLAY_INPUT_PROBE !== '1') return undefined
  const experiment = env.GAMELIB_OVERLAY_RELEASE_EXPERIMENT
  return {
    dylibPath: a.dylibPath,
    logPath: join(a.traceRoot, `input-probe-${a.appId}-${a.now}.log`),
    ...(isValidReleaseExperiment(experiment) ? { experiment } : {})
  }
}

/**
 * The one value builder behind both overlay routes (D-12, shim first). The
 * CX_ENV tokens and the plain env vars derive from it, so they cannot drift.
 */
function overlayEnvValues(a: OverlayEnvArgs): OverlayStepResult<{
  vars: EnvVar[]
}> {
  try {
    if (typeof a.appId !== 'string' || !APP_ID_RE.test(a.appId)) {
      return overlayStepError('env', 'invalid appId')
    }
    if (!safePath(a.shimPath) || !safePath(a.steamBinDir)) {
      return overlayStepError('env', 'unsafe overlay path')
    }
    const loader = join(a.steamBinDir, 'steamloader.dylib')
    const renderer = join(a.steamBinDir, 'gameoverlayrenderer.dylib')
    const probe =
      a.probe && safePath(a.probe.dylibPath) && safePath(a.probe.logPath)
        ? a.probe
        : undefined
    return {
      status: 'ok',
      vars: [
        {
          key: 'DYLD_INSERT_LIBRARIES',
          value: `${a.shimPath}:${loader}:${renderer}${
            probe ? `:${probe.dylibPath}` : ''
          }`
        },
        { key: 'SteamOverlayGameId', value: a.appId },
        { key: 'SteamGameId', value: a.appId },
        { key: 'SteamAppId', value: a.appId },
        ...(probe
          ? [
              { key: 'GAMELIB_OVERLAY_PROBE_LOG', value: probe.logPath },
              ...(isValidReleaseExperiment(probe.experiment)
                ? [
                    {
                      key: 'GAMELIB_OVERLAY_RELEASE_EXPERIMENT',
                      value: probe.experiment as string
                    }
                  ]
                : [])
            ]
          : [])
      ]
    }
  } catch (e) {
    return overlayStepError('env', e)
  }
}

/** D-12 tokens, shim first. No GPU or OS gate (D-13). */
// ts-prune-ignore-next
export function buildOverlayCxTokens(
  a: OverlayEnvArgs
): OverlayStepResult<{ tokens: string[] }> {
  const built = overlayEnvValues(a)
  if (built.status === 'error') return built
  return {
    status: 'ok',
    tokens: built.vars.map((v) =>
      v.key === 'DYLD_INSERT_LIBRARIES' ||
      v.key === 'GAMELIB_OVERLAY_PROBE_LOG' ||
      v.key === 'GAMELIB_OVERLAY_RELEASE_EXPERIMENT'
        ? `${v.key}='${v.value}'`
        : `${v.key}=${v.value}`
    )
  }
}

/** Fallback-engine route (D-07): the same values as plain, unquoted env. */
// ts-prune-ignore-next
export function buildOverlayEnvVars(
  a: OverlayEnvArgs
): OverlayStepResult<{ vars: EnvVar[] }> {
  return overlayEnvValues(a)
}

const OVERLAY_ENV_KEYS = new Set([
  'GAMELIB_OVERLAY_PROBE_LOG',
  'GAMELIB_OVERLAY_RELEASE_EXPERIMENT',
  'SteamOverlayGameId',
  'SteamGameId',
  'SteamAppId'
])

/**
 * Merges overlay vars into an env list. Our Steam* keys replace same-key
 * entries (case-sensitive). An existing DYLD_INSERT_LIBRARIES is kept, with
 * ours prepended so the shim stays first. Pure; never mutates its input.
 */
// ts-prune-ignore-next
export function mergeOverlayEnvVars(
  env: readonly EnvVar[],
  vars: readonly EnvVar[]
): EnvVar[] {
  const dyld = vars.find((v) => v.key === 'DYLD_INSERT_LIBRARIES')
  const ours = new Set(vars.map((v) => v.key))
  let existingDyld = ''
  const rest: EnvVar[] = []
  for (const e of env) {
    if (e.key === 'DYLD_INSERT_LIBRARIES') {
      let v = e.value ?? ''
      if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
        v = v.slice(1, -1)
      }
      if (v) existingDyld = existingDyld ? `${existingDyld}:${v}` : v
      continue
    }
    if (OVERLAY_ENV_KEYS.has(e.key) && ours.has(e.key)) continue
    rest.push(e)
  }
  const out = vars.map((v) =>
    v === dyld && existingDyld
      ? { key: v.key, value: `${v.value}:${existingDyld}` }
      : { key: v.key, value: v.value }
  )
  return [...rest, ...out]
}

// ts-prune-ignore-next
export type OverlayLaunchPayload =
  | { kind: 'cx-env'; tokens: string[]; runnerBin: string }
  | { kind: 'env'; vars: EnvVar[] }

type LstatLike = (p: string) => Promise<{ isFile(): boolean }>

/**
 * Requires regular files. The shim is checked with lstat (no symlink follow,
 * T-60-07-03). The Steam dylibs are in the user's own Steam install, which may
 * legitimately be reached through links, so they are checked with stat.
 */
// ts-prune-ignore-next
export async function checkOverlayInputs(
  a: { shimPath: string; steamBinDir: string },
  deps: { lstat?: LstatLike; stat?: LstatLike } = {}
): Promise<OverlayStepResult> {
  try {
    const lstat = deps.lstat ?? ((p: string) => fs.lstat(p))
    const stat = deps.stat ?? ((p: string) => fs.stat(p))
    for (const name of ['steamloader.dylib', 'gameoverlayrenderer.dylib']) {
      const p = join(a.steamBinDir, name)
      try {
        if (!(await stat(p)).isFile()) {
          return overlayStepError('steam-dylibs', `${name} is not a file`)
        }
      } catch {
        return overlayStepError('steam-dylibs', `${name} missing`)
      }
    }
    try {
      if (!(await lstat(a.shimPath)).isFile()) {
        return overlayStepError('shim', 'overlay shim is not a file')
      }
    } catch {
      return overlayStepError('shim', 'overlay shim missing')
    }
    return { status: 'ok' }
  } catch (e) {
    return overlayStepError('env', e)
  }
}

type TokenArgs = OverlayEnvArgs

/** DRM route: inputs, then tokens. Never rejects. */
// ts-prune-ignore-next
export async function prepareOverlayTokens(
  a: TokenArgs,
  deps: {
    checkInputs?: typeof checkOverlayInputs
  } = {}
): Promise<OverlayStepResult<{ tokens: string[] }>> {
  try {
    const inputs = await (deps.checkInputs ?? checkOverlayInputs)(a)
    if (inputs.status === 'error') return inputs
    return buildOverlayCxTokens(a)
  } catch (e) {
    return overlayStepError('env', e)
  }
}

/** Fallback-engine route: inputs, then plain env vars. Never rejects. */
// ts-prune-ignore-next
export async function prepareOverlayEnv(
  a: TokenArgs,
  deps: { checkInputs?: typeof checkOverlayInputs } = {}
): Promise<OverlayStepResult<{ vars: EnvVar[] }>> {
  try {
    const inputs = await (deps.checkInputs ?? checkOverlayInputs)(a)
    if (inputs.status === 'error') return inputs
    return buildOverlayEnvVars(a)
  } catch (e) {
    return overlayStepError('env', e)
  }
}

/** TCP route: inputs, detect, clone, tokens. Never rejects. */
// ts-prune-ignore-next
export async function prepareOverlayLaunch(
  a: TokenArgs & { appFolder: string },
  deps: {
    checkInputs?: typeof checkOverlayInputs
    detect?: typeof detectCrossoverForOverlay
    ensure?: typeof ensureOverlayRunnerClone
    runTool?: RunTool
  } = {}
): Promise<
  OverlayStepResult<{ runner: OverlayRunnerReady; tokens: string[] }>
> {
  try {
    const inputs = await (deps.checkInputs ?? checkOverlayInputs)(a)
    if (inputs.status === 'error') return inputs
    const detected = await (deps.detect ?? detectCrossoverForOverlay)(
      { appFolder: a.appFolder },
      deps.runTool ? { runTool: deps.runTool } : {}
    )
    if (detected.status === 'error') return detected
    const ensured = await (deps.ensure ?? ensureOverlayRunnerClone)(
      { appFolder: a.appFolder, crossover: detected.crossover },
      deps.runTool ? { runTool: deps.runTool } : {}
    )
    if (ensured.status === 'error') return ensured
    const built = buildOverlayCxTokens(a)
    if (built.status === 'error') return built
    return { status: 'ok', runner: ensured.runner, tokens: built.tokens }
  } catch (e) {
    return overlayStepError('env', e)
  }
}
