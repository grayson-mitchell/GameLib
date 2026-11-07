/**
 * Phase 61-16 (D-18): the non-Steam "a game process exists" first-match signal.
 *
 * Spike 068 verdict (PARTIAL, matchShape `z-path`): match a `ps` command line against the
 * game's install dir, case-insensitively, with a trailing separator kept, in up to four forms:
 * the unix path (persistent under GPTK, only the first 1-2 s under CrossOver), the `Z:` form
 * (`Z:` + the absolute path with backslashes), for installs under the home dir, the `Y:`
 * form (`Y:` + the path relative to home with backslashes) and, for installs under the
 * bottle's `drive_c`, the `C:` form (CR-02). The trailing separator stops
 * `Avernum 4` matching `Avernum 4 Remaster`. A bare-basename launch (cwd + `Game.exe`) cannot
 * be matched and is not detected; the non-Steam deadline never kills on a missing match
 * (launchEngine.ts owns that: it only shows a notice).
 *
 * A form matches when the command line starts with it, or carries it as a later argument
 * (GPTK: `wine64-preloader .../wine64 <install>/Game.exe`), preceded by whitespace, a quote or
 * `=`, never glued to a longer path.
 *
 * Scope: only bottle-backed launches are armed (launchEngine.ts). Plain-prefix pinned and Wine
 * Manager launches have no bottle wineserver to stop and are not CrossOver launches.
 *
 * Sidecar exit contract: every timer handle is unref'd, the watcher is bounded by
 * `maxDurationMs` and by consecutive listing failures, and nothing runs at import.
 */
import { homedir } from 'os'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { LAUNCH_DEADLINE_MS } from './launchDeadline'
import { parsePsLine, processListing } from './processListing'

const MAX_CONSECUTIVE_LISTING_FAILURES = 20

function withTrailingSep(path: string, sep: string): string {
  return path.endsWith(sep) ? path : `${path}${sep}`
}

/**
 * Every lowercased prefix form a game process command line can carry, or `[]` when the
 * install path is not usable (empty, relative, or the filesystem root).
 */
export function deriveGameProcessPrefixes(
  installPath: string,
  home: string = homedir(),
  bottleDir?: string
): string[] {
  if (typeof installPath !== 'string' || !installPath.startsWith('/')) return []
  const trimmed = installPath.replace(/\/+$/, '')
  if (trimmed === '') return []

  const forms = [withTrailingSep(trimmed, '/')]
  forms.push(`Z:${withTrailingSep(trimmed.split('/').join('\\'), '\\')}`)

  const homeTrimmed = home.replace(/\/+$/, '')
  if (homeTrimmed !== '' && trimmed.startsWith(`${homeTrimmed}/`)) {
    const rel = trimmed.slice(homeTrimmed.length + 1)
    forms.push(`Y:\\${withTrailingSep(rel.split('/').join('\\'), '\\')}`)
  }

  const bottleTrimmed = (bottleDir ?? '').replace(/\/+$/, '')
  if (bottleTrimmed !== '' && trimmed.startsWith(`${bottleTrimmed}/drive_c/`)) {
    const rel = trimmed.slice(bottleTrimmed.length + '/drive_c/'.length)
    forms.push(`C:\\${withTrailingSep(rel.split('/').join('\\'), '\\')}`)
  }
  return forms.map((form) => form.toLowerCase())
}

/** The unix-path form of the prefix (trailing separator kept), or `null` if not derivable. */
export function deriveGameProcessPrefix(installPath: string): string | null {
  return deriveGameProcessPrefixes(installPath)[0] ?? null
}

function commandMatches(lowerCommand: string, prefixes: string[]): boolean {
  for (const prefix of prefixes) {
    let from = 0
    for (;;) {
      const at = lowerCommand.indexOf(prefix, from)
      if (at === -1) break
      if (at === 0) return true
      const before = lowerCommand[at - 1]
      if (
        before === ' ' ||
        before === '\t' ||
        before === '"' ||
        before === '='
      ) {
        return true
      }
      from = at + 1
    }
  }
  return false
}

type TimerHandle = { unref?: () => void } & object

export interface GameProcessWatchDeps {
  processListing: () => Promise<string>
  setTimer: (fn: () => void, ms: number) => TimerHandle
  clearTimer: (handle: unknown) => void
  homeDir: () => string
}

export function watchForGameProcess(args: {
  installPath: string
  bottleDir?: string
  onFirstMatch: (pid: string) => void
  onGiveUp?: (reason: 'max-duration' | 'listing-failures') => void
  pollMs?: number
  maxDurationMs?: number
  deps?: Partial<GameProcessWatchDeps>
}): { stop(): void } | null {
  const deps: GameProcessWatchDeps = {
    processListing,
    setTimer: (fn, ms) => setTimeout(fn, ms) as TimerHandle,
    clearTimer: (handle) => clearTimeout(handle as NodeJS.Timeout),
    homeDir: () => homedir(),
    ...args.deps
  }
  const prefixes = deriveGameProcessPrefixes(
    args.installPath,
    deps.homeDir(),
    args.bottleDir
  )
  if (prefixes.length === 0) return null

  const pollMs = args.pollMs ?? 1500
  const maxDurationMs = args.maxDurationMs ?? LAUNCH_DEADLINE_MS + 5_000
  const startedAt = Date.now()
  let stopped = false
  let failures = 0
  let timer: TimerHandle | undefined

  const stop = () => {
    if (stopped) return
    stopped = true
    if (timer !== undefined) deps.clearTimer(timer)
    deps.clearTimer(capTimer)
  }
  const giveUp = (reason: 'max-duration' | 'listing-failures') => {
    if (stopped) return
    stop()
    logInfo(
      `gameProcessWatch: gave up (${reason}) after ${Date.now() - startedAt} ms`,
      LogPrefix.Backend
    )
    args.onGiveUp?.(reason)
  }

  const schedule = () => {
    if (stopped) return
    timer = deps.setTimer(() => void poll(), pollMs)
    timer.unref?.()
  }

  const poll = async () => {
    if (stopped) return
    try {
      const stdout = await deps.processListing()
      failures = 0
      if (stopped) return
      for (const line of stdout.split('\n')) {
        const parsed = parsePsLine(line)
        if (!parsed) continue
        if (commandMatches(parsed.command.toLowerCase(), prefixes)) {
          stop()
          // pid and install match only; never log other processes' command lines.
          logInfo(
            `gameProcessWatch: game process seen (pid ${parsed.pid})`,
            LogPrefix.Backend
          )
          args.onFirstMatch(parsed.pid)
          return
        }
      }
    } catch (error) {
      failures += 1
      logWarning(
        `gameProcessWatch: process listing failed (${failures}/${MAX_CONSECUTIVE_LISTING_FAILURES}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        LogPrefix.Backend
      )
      if (failures >= MAX_CONSECUTIVE_LISTING_FAILURES) {
        giveUp('listing-failures')
        return
      }
    }
    schedule()
  }

  const capTimer = deps.setTimer(() => giveUp('max-duration'), maxDurationMs)
  capTimer.unref?.()
  schedule()
  return { stop }
}
