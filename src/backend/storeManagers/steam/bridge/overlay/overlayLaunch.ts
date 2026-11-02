/**
 * Phase 60 plan 07 (D-08, D-12, D-13): launch-side overlay primitives.
 *
 * Builds the CX_ENV tokens that inject the Steam overlay into a bridged game,
 * merges them into an existing CX_ENV, checks the input files, and offers the
 * fail-open prepare functions for the TCP route (clone plus tokens) and the DRM
 * route (tokens only). Nothing here throws or rejects; every failure is a step
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

type EnvVar = { key: string; value: string }

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

/** D-12 tokens, shim first. No GPU or OS gate (D-13). */
// ts-prune-ignore-next
export function buildOverlayCxTokens(a: {
  appId: string
  shimPath: string
  steamBinDir: string
}): OverlayStepResult<{ tokens: string[] }> {
  try {
    if (typeof a.appId !== 'string' || !APP_ID_RE.test(a.appId)) {
      return overlayStepError('env', 'invalid appId')
    }
    if (!safePath(a.shimPath) || !safePath(a.steamBinDir)) {
      return overlayStepError('env', 'unsafe overlay path')
    }
    const loader = join(a.steamBinDir, 'steamloader.dylib')
    const renderer = join(a.steamBinDir, 'gameoverlayrenderer.dylib')
    return {
      status: 'ok',
      tokens: [
        `DYLD_INSERT_LIBRARIES='${a.shimPath}:${loader}:${renderer}'`,
        `SteamOverlayGameId=${a.appId}`,
        `SteamGameId=${a.appId}`,
        `SteamAppId=${a.appId}`
      ]
    }
  } catch (e) {
    return overlayStepError('env', e)
  }
}

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

type TokenArgs = { appId: string; shimPath: string; steamBinDir: string }

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
