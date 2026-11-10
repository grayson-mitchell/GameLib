// Store-agnostic macOS Mach-O architecture detection and the shared 32-bit
// "install the Windows version instead" confirm dialog.
//
// Extracted from steam/library.ts (quick 261029-t39) so GOG and Epic native Mac
// installs run the same ground-truth check. This module deliberately imports no
// store and no game manager: the Steam test mocks (child_process, graceful-fs,
// backend/logger, backend/platform, i18next) reach it only because the import
// specifiers here match the ones those tests mock.

import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import { basename, join, resolve, relative, isAbsolute } from 'path'
import i18next from 'i18next'
import { logWarning, LogPrefix } from 'backend/logger'
import { dialog } from 'backend/platform'
import type { Runner } from 'common/types'
import type { ProcessRunner } from 'backend/process/types'
import { storeCapabilities } from 'common/storeCapabilities'

/** Maximum bundle files probed per game (false-flag-safe union). */
const MAX_CANDIDATES = 8

function archsFromFileOutput(output: string): string[] {
  const archs: string[] = []
  if (/\bx86_64\b/.test(output)) archs.push('x86_64')
  if (/\barm64\b/.test(output)) archs.push('arm64')
  if (/\bi386\b/.test(output)) archs.push('i386')
  return archs
}

/** Per-probe bound; a hung lipo/file must not stall an install check. */
const PROBE_TIMEOUT_MS = 5_000

/** Runner slice the probes need: only `run`. */
export type MachOProbeDeps = { runner: Pick<ProcessRunner, 'run'> }

/** One probe: stdout on a clean exit, null on spawn error, timeout or non-zero. */
async function probeText(
  deps: MachOProbeDeps,
  cmd: string,
  argv: string[]
): Promise<string | null> {
  try {
    const r = await deps.runner.run(cmd, argv, {
      timeoutMs: PROBE_TIMEOUT_MS,
      stdin: ''
    })
    if (r.timedOut || r.code !== 0) return null
    return r.stdout
  } catch {
    return null
  }
}

/**
 * Runs `lipo -archs` on the given binary through the runner (argv form, never a shell-
 * interpolated string; T-18-03-01), falling back to `file` when lipo yields nothing (not
 * installed / binary lipo does not recognize / timed out). Total: resolves [] and never
 * rejects when BOTH tools fail -- inconclusive, NEVER a 32-bit verdict on its own
 * (verdictFromArchs below is the sole place that turns an arch list into a '32'/'64'
 * answer). Exported for unit testing.
 */
export async function machOArchsOfAsync(
  deps: MachOProbeDeps,
  binaryPath: string
): Promise<string[]> {
  const lipo = await probeText(deps, 'lipo', ['-archs', binaryPath])
  if (lipo !== null) {
    const archs = lipo.trim().split(/\s+/).filter(Boolean)
    if (archs.length > 0) return archs
  }
  const file = await probeText(deps, 'file', [binaryPath])
  return file === null ? [] : archsFromFileOutput(file)
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

/**
 * CFBundleExecutable from an XML Info.plist, or null (binary plist, missing
 * key, unreadable). Only a bare file name is accepted, so the result cannot
 * leave Contents/MacOS.
 */
function bundleExecutableName(appBundlePath: string): string | null {
  try {
    const xml = String(
      readFileSync(join(appBundlePath, 'Contents', 'Info.plist'), 'utf8')
    )
    const m = /<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/.exec(
      xml
    )
    const name = m?.[1]?.trim()
    return name && name === basename(name) && name !== '..' ? name : null
  } catch {
    return null
  }
}

// Prefers the bundle's declared executable: the first directory entry can be
// a data file (Dungeons of Dredmor's MacOS dir lists DredmorSchema.xsd before
// the i386 `dredmor` binary), which made the check inconclusive.
function firstBundleBinary(appBundlePath: string): string | null {
  const macOsDir = join(appBundlePath, 'Contents', 'MacOS')
  if (!existsSync(macOsDir)) return null
  const declared = bundleExecutableName(appBundlePath)
  if (declared && existsSync(join(macOsDir, declared))) {
    return join(macOsDir, declared)
  }
  const bins = readdirSync(macOsDir)
  const firstBin = bins[0]
  return firstBin !== undefined ? join(macOsDir, firstBin) : null
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
        // The declared executable first, so the cap never drops it.
        add(first)
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
    const isSteam = storeCapabilities[runner].usesBottleRuntime
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
