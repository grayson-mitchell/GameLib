/**
 * Open-channel policy for the Tauri sidecar (Phase 72 D-06..D-08).
 *
 * The Rust shell (`shell_open.rs`, `relay_commands.rs`) is authoritative and
 * re-checks everything. This module rejects early in the sidecar so a bad
 * renderer value never reaches the platform call, and so the two renderer
 * channels stay strictly split: `openExternalUrl` is URL-only, `openFolder`
 * opens existing non-bundle directories and REVEALS everything else (files,
 * executables, bundles). The constants below mirror the Rust ones; a parity
 * test in `__tests__/openPolicy.test.ts` fails if they drift.
 *
 * Error messages and log lines are fixed literals naming the context and a
 * category only, never the renderer-supplied value (T-28-04 / T-34.6-32).
 */
import { promises as fsp } from 'node:fs'
import { logWarning, LogPrefix } from '../logger'
import { assertPlausibleAbsolutePath } from './rendererPathGuard'

/** Thrown when a renderer-supplied URL or folder target fails the open policy. */
export class OpenPolicyError extends Error {}

/** Mirror of `OPEN_EXTERNAL_ALLOWED_SCHEMES` in relay_commands.rs. */
export const OPEN_EXTERNAL_ALLOWED_SCHEMES: readonly string[] = [
  'https',
  'http',
  'mailto',
  'tel',
  'steam'
]

/** Mirror of `OPEN_EXTERNAL_ALLOWED_EXACT_URLS` in relay_commands.rs. */
export const OPEN_EXTERNAL_ALLOWED_EXACT_URLS: readonly string[] = [
  'x-apple.systempreferences:com.apple.preference.security?Privacy_AppBundles'
]

/** Mirror of `OPEN_PATH_BUNDLE_EXTENSIONS` in shell_open.rs. */
export const OPEN_PATH_BUNDLE_EXTENSIONS: readonly string[] = [
  'app',
  'prefpane',
  'saver',
  'workflow',
  'action',
  'plugin',
  'bundle',
  'framework',
  'component',
  'kext',
  'mdimporter',
  'qlgenerator',
  'xpc',
  'appex',
  'wdgt',
  'pkg',
  'mpkg'
]

function reject(context: string, category: string, message: string): never {
  logWarning(
    `[openPolicy] ${context}: rejected (${category})`,
    LogPrefix.Backend
  )
  throw new OpenPolicyError(message)
}

/** True when the path's extension (ASCII case-insensitive) names a launchable bundle. */
export function isLaunchableBundle(p: string): boolean {
  const base =
    p
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0) return false
  const ext = base.slice(dot + 1).toLowerCase()
  return OPEN_PATH_BUNDLE_EXTENSIONS.includes(ext)
}

/** Return `url` when it is openable as an external URL, else throw. */
export function assertOpenableExternalUrl(
  url: unknown,
  context: string
): string {
  if (typeof url !== 'string') {
    return reject(context, 'not-a-string', 'open policy: invalid url')
  }
  if (OPEN_EXTERNAL_ALLOWED_EXACT_URLS.includes(url)) return url
  const idx = url.indexOf(':')
  if (idx < 0) {
    return reject(context, 'no-scheme', 'open policy: url has no scheme')
  }
  const scheme = url.slice(0, idx).toLowerCase()
  if (!OPEN_EXTERNAL_ALLOWED_SCHEMES.includes(scheme)) {
    return reject(context, 'scheme', 'open policy: url scheme not allowed')
  }
  return url
}

/**
 * Decide how a renderer-supplied folder target is handled: 'open' only for an
 * existing non-bundle directory, 'reveal' for any other existing path.
 */
export async function classifyFolderTarget(
  path: unknown,
  context: string
): Promise<'open' | 'reveal'> {
  try {
    assertPlausibleAbsolutePath(path, context)
  } catch {
    return reject(context, 'shape', 'open policy: invalid path')
  }
  const p = path as string
  if (p.includes('://') || p.startsWith('\\\\') || p.startsWith('//')) {
    return reject(context, 'shape', 'open policy: invalid path')
  }
  let real: string
  let isDir: boolean
  try {
    real = await fsp.realpath(p)
    isDir = (await fsp.stat(real)).isDirectory()
  } catch {
    return reject(context, 'missing', 'open policy: path does not exist')
  }
  return isDir && !isLaunchableBundle(real) ? 'open' : 'reveal'
}
