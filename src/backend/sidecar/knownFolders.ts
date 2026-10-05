/**
 * The user's real Desktop/Documents folders for `pathShim.getPath()`, the way Electron's own
 * `app.getPath('desktop'|'documents')` resolves them:
 *
 *   - Linux: `$XDG_CONFIG_HOME/user-dirs.dirs` (written by `xdg-user-dirs-update`), so a
 *     localized desktop (`~/Schreibtisch`) or a moved one is honoured. The env var
 *     (`XDG_DESKTOP_DIR`) still wins when it is exported.
 *   - Windows: the `User Shell Folders` registry key, which is where OneDrive (and a user's own
 *     "Move" in the folder's Location tab) redirects Desktop and Documents. Read with `reg.exe`
 *     through argv -- no shell, no new native dependency -- once per folder per process.
 *
 * Every lookup returns `undefined` when it cannot answer, and the caller falls back to
 * `homedir()/<Name>`, which is what the shim always returned before.
 */
import { spawnSync } from 'child_process'
import { readFileSync } from 'fs'
import { homedir } from 'os'
import { join, posix, win32 } from 'path'

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

export const USER_SHELL_FOLDERS_KEY =
  'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders'

/** `reg.exe` value names: Documents is stored as `Personal`. */
export type WindowsShellFolder = 'Desktop' | 'Personal'

/** Pulls `valueName`'s data out of `reg query <key> /v <valueName>` output. */
export function parseRegQueryValue(
  output: string,
  valueName: string
): string | undefined {
  for (const line of output.split(/\r?\n/)) {
    const match = /^\s+(.+?)\s{2,}(REG_EXPAND_SZ|REG_SZ)\s{2,}(.*?)\s*$/.exec(
      line
    )
    if (match && match[1].toLowerCase() === valueName.toLowerCase()) {
      return match[3]
    }
  }
  return undefined
}

/** Expands `%NAME%` against `env` (case-insensitively, as Windows does). Returns `undefined` if
 * any variable is unset, rather than leaving a literal `%NAME%` in a path. */
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

const windowsFolderCache = new Map<WindowsShellFolder, string | undefined>()

/** Test seam: forget cached Windows lookups. */
export function clearKnownFolderCache(): void {
  windowsFolderCache.clear()
}

/**
 * The redirected location of a Windows shell folder, or `undefined` when it cannot be read.
 * `reg.exe` prints in the console code page, so a path typed with characters outside it can
 * come back mangled; the registry default (`%USERPROFILE%\Desktop`) is ASCII and expanded here
 * from the real, UTF-16-safe environment, which covers the OneDrive case.
 */
export function readWindowsShellFolder(
  name: WindowsShellFolder,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (windowsFolderCache.has(name)) return windowsFolderCache.get(name)

  let resolved: string | undefined
  try {
    const result = spawnSync(
      'reg.exe',
      ['query', USER_SHELL_FOLDERS_KEY, '/v', name],
      { encoding: 'utf8', timeout: 5000, windowsHide: true }
    )
    if (result && result.status === 0 && typeof result.stdout === 'string') {
      const raw = parseRegQueryValue(result.stdout, name)
      const expanded =
        raw === undefined ? undefined : expandWindowsEnv(raw, env)
      if (expanded && win32.isAbsolute(expanded) && !expanded.includes('�')) {
        resolved = win32.normalize(expanded)
      }
    }
  } catch {
    resolved = undefined
  }
  windowsFolderCache.set(name, resolved)
  return resolved
}
