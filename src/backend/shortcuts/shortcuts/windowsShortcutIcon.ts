import { readdir, stat } from 'fs/promises'
import { basename, isAbsolute, join, parse, relative } from 'path'
import type { AppPaths } from 'backend/process/context'

/**
 * The icon of a Windows `.lnk` (G-66.4-W2 defect 2: a Steam game's shortcut showed explorer.exe's
 * folder icon because its install record has no `executable`).
 *
 * Source chain, first hit wins:
 *   1. the store's own executable, when it exists on disk;
 *   2. the game's exe, found by a bounded local scan of the install directory;
 *   3. the GameLib shell exe.
 *
 * Rejected (measured 2026-11-13): PICS `config.launch` is a network read, and license-gated apps
 * answer anonymously without `config`; the Steam Uninstall registry key's DisplayIcon is absent
 * or empty for 7 of the 10 installs in the C: library, including both UAT games. The scan needs
 * no network and no logon.
 *
 * Only an existing `.exe`, `.ico` or `.dll` is ever returned: an `IconLocation` extracts an icon
 * resource from such a file, so artwork (`.jpg`, `.png`) is never a valid answer. Never rejects.
 */

type IconSource = 'store-executable' | 'install-dir' | 'gamelib-shell'

interface WindowsShortcutIcon {
  icon: string
  iconIndex: number
  source: IconSource
}

interface ExeCandidate {
  path: string
  relativePath: string
  name: string
  /** Directory levels between the install root and the file: 0 for a file in the root. */
  depth: number
  size: number
}

const ICON_FILE = /\.(exe|ico|dll)$/i

/** Directory levels below the install root that the scan descends into. */
const MAX_DEPTH = 3

/** Directory entries read before the scan stops and ranks what it has found. */
const ENTRY_BUDGET = 20_000

/**
 * Executables that ship beside a game but are not it, matched case-insensitively against the path
 * RELATIVE to the install root. An exe whose name equals the install directory or the title is
 * never excluded (a game called "Crash Bandicoot" is not a crash handler).
 */
const HELPER_EXE =
  /crash|unins|setup|redist|dxsetup|directx|oalinst|easyanticheat|workshop|editor|installer|repair|wipe/i

/** Lowercase, extension-less, keeping only Unicode letters and digits. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '')
}

async function isUsableIconFile(path: string): Promise<boolean> {
  if (!ICON_FILE.test(path)) return false
  try {
    return (await stat(path)).isFile()
  } catch {
    return false
  }
}

/** 0: the exe name equals the install directory or the title. 1: one contains the other. */
function matchTier(exeName: string, names: readonly string[]): 0 | 1 | 2 {
  const base = normalize(parse(exeName).name)
  if (!base) return 2
  if (names.some((name) => name === base)) return 0
  const contained = names.some((name) => {
    const [short, long] =
      base.length <= name.length ? [base, name] : [name, base]
    return short.length >= 3 && long.includes(short)
  })
  return contained ? 1 : 2
}

/**
 * Breadth-first over `installPath`: at most `MAX_DEPTH` levels, at most `ENTRY_BUDGET` entries,
 * symlinks and junctions skipped, per-directory read errors swallowed.
 */
async function scanForExecutables(
  installPath: string
): Promise<ExeCandidate[]> {
  const found: ExeCandidate[] = []
  const queue: Array<{ dir: string; depth: number }> = [
    { dir: installPath, depth: 0 }
  ]
  let budget = ENTRY_BUDGET
  for (let head = 0; head < queue.length && budget > 0; head++) {
    const next = queue[head]
    if (!next) break
    let entries
    try {
      entries = await readdir(next.dir, { withFileTypes: true })
    } catch {
      continue
    }
    entries = entries.slice(0, budget)
    budget -= entries.length
    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      const path = join(next.dir, entry.name)
      if (entry.isDirectory()) {
        if (next.depth < MAX_DEPTH) {
          queue.push({ dir: path, depth: next.depth + 1 })
        }
      } else if (entry.isFile() && /\.exe$/i.test(entry.name)) {
        try {
          const { size } = await stat(path)
          found.push({
            path,
            relativePath: relative(installPath, path),
            name: entry.name,
            depth: next.depth,
            size
          })
        } catch {
          // vanished or unreadable between the listing and the stat: not a candidate
        }
      }
    }
  }
  return found
}

/** Name match first, then shallower, then larger, then the relative path for determinism. */
async function pickInstalledExecutable(
  installPath: string,
  title: string
): Promise<string | undefined> {
  const names = [normalize(basename(installPath)), normalize(title)].filter(
    Boolean
  )
  const ranked = (await scanForExecutables(installPath))
    .map((candidate) => ({
      candidate,
      tier: matchTier(candidate.name, names)
    }))
    .filter(({ candidate, tier }) => {
      return tier === 0 || !HELPER_EXE.test(candidate.relativePath)
    })
    .sort(
      (a, b) =>
        a.tier - b.tier ||
        a.candidate.depth - b.candidate.depth ||
        b.candidate.size - a.candidate.size ||
        (a.candidate.relativePath < b.candidate.relativePath ? -1 : 1)
    )
  return ranked[0]?.candidate.path
}

export async function resolveWindowsShortcutIcon(
  deps: { paths: Pick<AppPaths, 'exe'> },
  game: { title: string; installPath?: string; storeExecutable?: string }
): Promise<WindowsShortcutIcon | undefined> {
  const { title, installPath, storeExecutable } = game
  const hit = (icon: string, source: IconSource): WindowsShortcutIcon => ({
    icon,
    iconIndex: 0,
    source
  })

  if (storeExecutable) {
    const path =
      installPath && !isAbsolute(storeExecutable)
        ? join(installPath, storeExecutable)
        : storeExecutable
    if (await isUsableIconFile(path)) return hit(path, 'store-executable')
  }

  if (installPath) {
    const scanned = await pickInstalledExecutable(installPath, title)
    if (scanned) return hit(scanned, 'install-dir')
  }

  // `paths.exe` throws when GAMELIB_SHELL_EXE is unset; that must not reject addShortcuts.
  let shellExe: string | undefined
  try {
    shellExe = deps.paths.exe
  } catch {
    shellExe = undefined
  }
  if (shellExe && (await isUsableIconFile(shellExe))) {
    return hit(shellExe, 'gamelib-shell')
  }
  return undefined
}
