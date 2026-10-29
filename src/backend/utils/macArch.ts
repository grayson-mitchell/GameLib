// Store-agnostic macOS Mach-O architecture detection and the shared 32-bit
// "install the Windows version instead" confirm dialog.
//
// Extracted from steam/library.ts (quick 261029-t39) so GOG and Epic native Mac
// installs run the same ground-truth check. This module deliberately imports no
// store and no game manager: the Steam test mocks (child_process, graceful-fs,
// backend/logger, backend/platform, i18next) reach it only because the import
// specifiers here match the ones those tests mock.

import { execFile, execFileSync } from 'child_process'
import { existsSync, readdirSync } from 'graceful-fs'
import { join, resolve, relative, isAbsolute } from 'path'
import i18next from 'i18next'
import { logWarning, LogPrefix } from 'backend/logger'
import { dialog } from 'backend/platform'
import type { Runner } from 'common/types'

/** Maximum bundle files probed per game (false-flag-safe union). */
const MAX_CANDIDATES = 8

function archsFromFileOutput(output: string): string[] {
  const archs: string[] = []
  if (/\bx86_64\b/.test(output)) archs.push('x86_64')
  if (/\barm64\b/.test(output)) archs.push('arm64')
  if (/\bi386\b/.test(output)) archs.push('i386')
  return archs
}

/**
 * Runs `lipo -archs` on the given binary — argv-form execFileSync (command +
 * array, never a shell-interpolated string; T-18-03-01). Falls back to `file`
 * when lipo throws (not installed / binary lipo doesn't recognize).
 * Returns [] when BOTH tools fail — inconclusive, NEVER a 32-bit verdict on
 * its own (verdictFromArchs below is the sole place that turns an arch list
 * into a '32'/'64' answer). Exported for unit testing.
 */
export function machOArchsOf(binaryPath: string): string[] {
  try {
    const output = execFileSync('lipo', ['-archs', binaryPath], {
      encoding: 'utf8',
      timeout: 5000
    })
    return output.trim().split(/\s+/).filter(Boolean)
  } catch {
    try {
      const output = execFileSync('file', [binaryPath], {
        encoding: 'utf8',
        timeout: 5000
      })
      return archsFromFileOutput(output)
    } catch {
      return [] // neither tool available/succeeded — inconclusive, NOT 32-bit
    }
  }
}

function execFileText(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    try {
      execFile(
        cmd,
        args,
        { encoding: 'utf8', timeout: 5000 },
        (err, stdout) => {
          if (err) reject(err)
          else resolvePromise(String(stdout))
        }
      )
    } catch (e) {
      reject(e)
    }
  })
}

/**
 * Async twin of machOArchsOf (argv-form execFile, no shell, no env override;
 * T-t39-01). Total: resolves [] and never rejects.
 */
export async function machOArchsOfAsync(binaryPath: string): Promise<string[]> {
  try {
    const output = await execFileText('lipo', ['-archs', binaryPath])
    return output.trim().split(/\s+/).filter(Boolean)
  } catch {
    try {
      const output = await execFileText('file', [binaryPath])
      return archsFromFileOutput(output)
    } catch {
      return []
    }
  }
}

/**
 * Maps a Mach-O arch list to a verdict. A universal binary (any x86_64/arm64
 * slice present) is runnable — '64' wins even alongside an i386 slice. Empty
 * input is inconclusive: null, never '32' (T-18-03-03 — the false-flag-safe
 * invariant at this subprocess boundary). Exported for unit testing.
 */
export function verdictFromArchs(archs: string[]): '32' | '64' | null {
  if (archs.length === 0) return null // inconclusive — do not overwrite existing hint
  if (archs.includes('x86_64') || archs.includes('arm64')) return '64'
  if (archs.includes('i386')) return '32'
  return null
}

function firstBundleBinary(appBundlePath: string): string | null {
  const macOsDir = join(appBundlePath, 'Contents', 'MacOS')
  if (!existsSync(macOsDir)) return null
  const bins = readdirSync(macOsDir)
  return bins.length ? join(macOsDir, bins[0]) : null
}

/**
 * Locates the installed Mach-O binary to inspect. Prefers a supplied launch
 * executable path (resolved relative to installPath); otherwise, when
 * installPath is itself a `.app` bundle (GOG) uses its Contents/MacOS/<first
 * file>, else scans installPath for a top-level *.app bundle. Containment
 * (T-18-03-04): a supplied launchExecutable that escapes installPath's own
 * subtree — via `..` segments or an absolute path — is rejected (logged +
 * skipped), not just join()'d. Never throws, returns null on any miss.
 * Exported for unit testing.
 */
export function locateMachOBinary(
  installPath: string,
  launchExecutable?: string,
  logPrefix: LogPrefix = LogPrefix.Backend
): string | null {
  if (launchExecutable) {
    // T-18-03-04: verify containment BEFORE touching the filesystem.
    const candidate = resolve(installPath, launchExecutable)
    const rel = relative(installPath, candidate)
    if (rel.startsWith('..') || isAbsolute(rel)) {
      logWarning(
        `locateMachOBinary rejected launchExecutable '${launchExecutable}' — escapes installPath subtree; skipping`,
        logPrefix
      )
    } else if (launchExecutable.endsWith('.app')) {
      try {
        const bin = firstBundleBinary(candidate)
        if (bin) return bin
      } catch {
        // fall through to bundle scan
      }
    } else if (existsSync(candidate)) {
      return candidate
    }
  }
  try {
    if (installPath.endsWith('.app')) {
      return firstBundleBinary(installPath)
    }
    const entries = readdirSync(installPath)
    const appBundle = entries.find((e) => e.endsWith('.app'))
    if (!appBundle) return null
    return firstBundleBinary(join(installPath, appBundle))
  } catch {
    return null
  }
}

/**
 * Up to MAX_CANDIDATES files to probe: the contained launchExecutable when it
 * is a file, then every entry of the resolved bundle's Contents/MacOS. The
 * verdict over their union is false-flag-safe (any 64-bit slice wins). Never
 * throws; [] on any miss.
 */
export function locateMachOCandidates(
  installPath: string,
  launchExecutable?: string,
  logPrefix: LogPrefix = LogPrefix.Backend
): string[] {
  const out: string[] = []
  const add = (p: string) => {
    if (!out.includes(p) && out.length < MAX_CANDIDATES) out.push(p)
  }
  try {
    if (launchExecutable && !launchExecutable.endsWith('.app')) {
      const candidate = resolve(installPath, launchExecutable)
      const rel = relative(installPath, candidate)
      if (rel.startsWith('..') || isAbsolute(rel)) {
        logWarning(
          `locateMachOCandidates rejected launchExecutable '${launchExecutable}' — escapes installPath subtree; skipping`,
          logPrefix
        )
      } else if (existsSync(candidate)) {
        add(candidate)
      }
    }
    // Bundle scan is independent of launchExecutable so a shell-launcher
    // launchExecutable still leaves the real Contents/MacOS binaries probed.
    const first = locateMachOBinary(installPath, undefined, logPrefix)
    if (first) {
      const macOsDir = join(first, '..')
      if (/[\\/]Contents[\\/]MacOS$/.test(macOsDir)) {
        for (const name of readdirSync(macOsDir)) add(join(macOsDir, name))
      } else {
        add(first)
      }
    }
  } catch {
    return out
  }
  return out
}

/**
 * Confirm dialog offering to replace a 32-bit native Mac install with the
 * Windows version. Returns true only when the user picked the first button.
 * Never throws.
 *
 * Steam keeps its original strings byte-for-byte; other runners use the
 * generic gamelib:box.mac32Detected.* keys.
 */
export async function promptMac32WindowsReinstall(
  runner: Runner,
  title?: string
): Promise<boolean> {
  try {
    const isSteam = runner === 'steam'
    const { response } = await dialog.showMessageBox(
      isSteam
        ? {
            title: i18next.t(
              'gamelib:box.steam.mac32Detected.title',
              '32-bit macOS build detected'
            ),
            message: i18next.t(
              'gamelib:box.steam.mac32Detected.message',
              "This game's macOS build is 32-bit only and cannot run on this version of macOS. GameLib can reinstall it through CrossOver instead, which will redownload the Windows version."
            ),
            buttons: [
              i18next.t(
                'gamelib:box.steam.mac32Detected.confirm',
                'Reinstall via CrossOver'
              ),
              i18next.t('gamelib:box.cancel', 'Cancel')
            ],
            // D-07 fail-safe (Phase 33 Plan 03): buttons[0] is the destructive
            // branch (force-uninstall + reinstall) -- an explicit cancelId
            // declares buttons[1] ("Cancel") as the safe decline so a
            // degraded/timed-out dialog never auto-confirms the recovery.
            cancelId: 1
          }
        : {
            title: i18next.t(
              'gamelib:box.mac32Detected.title',
              '32-bit macOS build detected'
            ),
            message: i18next.t(
              'gamelib:box.mac32Detected.message',
              "This game's macOS build is 32-bit only and cannot run on this version of macOS. GameLib can remove it and install the Windows version instead, which runs through your Wine or CrossOver setup."
            ),
            ...(title ? { detail: title } : {}),
            buttons: [
              i18next.t(
                'gamelib:box.mac32Detected.confirm',
                'Install Windows version'
              ),
              i18next.t('gamelib:box.cancel', 'Cancel')
            ],
            cancelId: 1
          }
    )
    return response === 0
  } catch {
    return false
  }
}
