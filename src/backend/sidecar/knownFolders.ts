/**
 * The user's real Desktop/Documents folders for `AppPaths.knownFolder()` (`resolveKnownFolder`), the way Electron's own
 * `app.getPath('desktop'|'documents')` resolves them:
 *
 *   - Linux: `$XDG_CONFIG_HOME/user-dirs.dirs` (written by `xdg-user-dirs-update`), so a
 *     localized desktop (`~/Schreibtisch`) or a moved one is honoured. The env var
 *     (`XDG_DESKTOP_DIR`) still wins when it is exported.
 *   - Windows: the `User Shell Folders` registry key, which is where OneDrive (and a user's own
 *     "Move" in the folder's Location tab) redirects Desktop and Documents. Read first by the Rust
 *     shell through RegGetValueW (UTF-16, rustInvoke `windows_shell_folder_read`), so a redirect
 *     outside the console code page survives; `reg.exe` through the process runner (argv, no shell)
 *     is the fallback when no native answer comes back, and its U+FFFD rejection guards that path.
 *     The native answer carries the value's registry type, and only a REG_EXPAND_SZ value has its
 *     `%VAR%` expanded here against the real environment; a REG_SZ value is literal, as Windows
 *     reads it (quick 261128-7wv, 261128-810). Awaited by the two
 *     win32 consumers (shortcuts.ts, save_sync.ts); `resolveKnownFolder` itself is sync and never reads it.
 *
 * Every lookup returns `undefined` when it cannot answer. The Linux lookup then falls back to
 * `homedir()/<Name>` inside `resolveKnownFolder`. The Windows lookup has NO fallback: on `undefined`,
 * shortcuts.ts writes no Desktop shortcut and reports it, and save_sync.ts leaves out the
 * locations that need Documents. `resolveKnownFolder`'s win32 arms throw (quick
 * 261111-aq4). Live evidence: on a OneDrive-redirected profile `<profile>\Desktop` did not exist
 * and `<profile>\Documents` was a different folder from the real one.
 */
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join, posix, win32 } from 'path'
import { RUST_WINDOWS_SHELL_FOLDER_READ } from 'common/types/sidecarTransport'
import type { RustInvokeDeps } from '../host/rustInvokeDeps'
import type { ProcessRunner } from '../process/types'

const REG_QUERY_TIMEOUT_MS = 5_000

/**
 * Parses `user-dirs.dirs` into `{ XDG_DESKTOP_DIR: '/home/u/Schreibtisch', ... }`.
 *
 * Mirrors GLib's own reader (`load_user_special_dirs`): a value must be double-quoted and start
 * with either `$HOME` (followed by `/` or the closing quote) or `/`; anything else is skipped.
 * A backslash escapes the next character.
 */
export function parseUserDirs(
  content: string,
  home: string
): Record<string, string> {
  const dirs: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const match = /^\s*(XDG_[A-Z]+_DIR)\s*=\s*"(.*)"\s*$/.exec(rawLine)
    if (!match) continue
    const [, key, quoted] = match
    if (key === undefined || quoted === undefined) continue
    const value = quoted.replace(/\\(.)/g, '$1')
    let resolved: string
    if (value === '$HOME' || value.startsWith('$HOME/')) {
      resolved = posix.join(home, value.slice('$HOME'.length))
    } else if (value.startsWith('/')) {
      resolved = value
    } else {
      continue
    }
    // GLib strips a trailing slash; `posix.join` normalises everything else.
    dirs[key] = resolved.length > 1 ? resolved.replace(/\/+$/, '') : resolved
  }
  return dirs
}

/** `XDG_DESKTOP_DIR` etc. from `user-dirs.dirs`, or `undefined` if the file or key is absent. */
export function readXdgUserDir(
  key: 'XDG_DESKTOP_DIR' | 'XDG_DOCUMENTS_DIR',
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  const configHome = env.XDG_CONFIG_HOME || join(homedir(), '.config')
  let content: string
  try {
    content = readFileSync(join(configHome, 'user-dirs.dirs'), 'utf-8')
  } catch {
    return undefined
  }
  return parseUserDirs(content, homedir())[key]
}

const USER_SHELL_FOLDERS_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'

/** `reg.exe` value names: Documents is stored as `Personal`. */
type WindowsShellFolder = 'Desktop' | 'Personal'

/** A shell folder value as the registry holds it: the type decides whether `%VAR%` is expanded. */
export type RegQueryValue = { type: 'REG_SZ' | 'REG_EXPAND_SZ'; data: string }

/** Pulls `valueName`'s type and data out of `reg query <key> /v <valueName>` output. */
export function parseRegQueryValue(
  output: string,
  valueName: string
): RegQueryValue | undefined {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(.+?)\s{2,}(REG_EXPAND_SZ|REG_SZ)\s{2,}(.*?)\s*$/.exec(
      line
    )
    if (!match) continue
    const [, name, type, data] = match
    if (name === undefined || data === undefined) continue
    if (type !== 'REG_SZ' && type !== 'REG_EXPAND_SZ') continue
    if (name.toLowerCase() === valueName.toLowerCase()) {
      return { type, data }
    }
  }
  return undefined
}

/** The shape of a native `windows_shell_folder_read` answer: a REG_SZ or REG_EXPAND_SZ with string data. */
function isRegQueryValue(answer: unknown): answer is RegQueryValue {
  if (typeof answer !== 'object' || answer === null) return false
  const { type, data } = answer as { type?: unknown; data?: unknown }
  return (
    (type === 'REG_SZ' || type === 'REG_EXPAND_SZ') && typeof data === 'string'
  )
}

/** Expands `%NAME%` against `env` (case-insensitively, as Windows does). Returns `undefined` if
 * any variable is unset, rather than leaving a literal `%NAME%` in a path. It is for REG_EXPAND_SZ
 * data: a REG_SZ value is literal, as Windows reads it, and never reaches this (quick 261128-810). */
export function expandWindowsEnv(
  value: string,
  env: NodeJS.ProcessEnv
): string | undefined {
  const lookup = new Map(
    Object.entries(env).map(([name, v]) => [name.toUpperCase(), v])
  )
  let unresolved = false
  const expanded = value.replace(/%([^%]+)%/g, (_whole, name: string) => {
    const resolved = lookup.get(name.toUpperCase())
    if (resolved === undefined) unresolved = true
    return resolved ?? ''
  })
  return unresolved ? undefined : expanded
}

/**
 * The one acceptance pipeline both the native and the `reg.exe` answer go through: expand `%VAR%`
 * against `env` in a REG_EXPAND_SZ value only (a REG_SZ value is literal), require an absolute path
 * with no U+FFFD, normalise. `undefined` when any step fails.
 */
function acceptShellFolderValue(
  value: RegQueryValue,
  env: NodeJS.ProcessEnv
): string | undefined {
  const expanded =
    value.type === 'REG_EXPAND_SZ'
      ? expandWindowsEnv(value.data, env)
      : value.data
  if (expanded && win32.isAbsolute(expanded) && !expanded.includes('\uFFFD')) {
    return win32.normalize(expanded)
  }
  return undefined
}

/**
 * The redirected location of a Windows shell folder, or `undefined` when it cannot be read.
 *
 * The value is read first by the Rust shell through RegGetValueW (UTF-16, rustInvoke
 * `windows_shell_folder_read`), so a redirect holding characters outside the console code page
 * survives (quick 261128-7wv). The answer is `{ type, data }`, the raw value with its registry type, and
 * a typed answer is final, accepted or not: `reg.exe` would return the same data, only mangled.
 * `reg.exe` through the runner is the fallback when no native answer comes back (`null`, a rejection,
 * any other answer shape, or no `requestRustInvoke` in `deps`). Its output is in the console code
 * page, so a path outside it comes back mangled; the U+FFFD rejection guards that fallback. Only a
 * REG_EXPAND_SZ value is expanded, here, against the real, UTF-16-safe environment; a REG_SZ value
 * is literal, as Windows reads it (quick 261128-810).
 *
 * One registry read per call: both consumers are user-initiated actions, so there is no cache.
 */
export async function readWindowsShellFolder(
  deps: { runner: Pick<ProcessRunner, 'run'> } & Partial<RustInvokeDeps>,
  name: WindowsShellFolder,
  env: NodeJS.ProcessEnv = process.env
): Promise<string | undefined> {
  if (deps.requestRustInvoke) {
    try {
      const native: unknown = await deps.requestRustInvoke(
        RUST_WINDOWS_SHELL_FOLDER_READ,
        [{ name }]
      )
      if (isRegQueryValue(native)) return acceptShellFolderValue(native, env)
    } catch {
      // No native answer: the reg.exe path below answers.
    }
  }
  try {
    const result = await deps.runner.run(
      'reg.exe',
      ['query', USER_SHELL_FOLDERS_KEY, '/v', name],
      { timeoutMs: REG_QUERY_TIMEOUT_MS, windowsHide: true }
    )
    if (result.code !== 0 || result.timedOut) return undefined
    const raw = parseRegQueryValue(result.stdout, name)
    return raw === undefined ? undefined : acceptShellFolderValue(raw, env)
  } catch {
    return undefined
  }
}
