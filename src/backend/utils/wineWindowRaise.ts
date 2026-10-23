/**
 * quick/261024-g3m: bring a Wine/CrossOver-launched game's window to the front
 * on macOS. The game window is a separate unbundled Wine process that macOS
 * focus-stealing protection leaves behind GameLib, so Play looks dead.
 *
 * Targets the matched pid(s) first, then falls back to the Windows exe's
 * process name (a matched pid may be a helper that does not own the window).
 * Mechanism: `osascript` + System Events `set frontmost` (same Automation
 * consent the bottled-Steam raise in steam/bottle.ts already uses).
 *
 * Best-effort: never throws, no-op off macOS, bounded (12 attempts at 1500ms
 * spacing + one 2500ms settle re-raise), every timer is unref'd. The first
 * attempt runs immediately (the pid is already known, unlike the bottled
 * path's pre-match guess).
 *
 * The AppleScript text is CONSTANT; pids and names travel only as argv
 * (count-of-pids, pids..., names...), so a hostile exe name cannot alter it.
 */
import { spawnAsync } from 'backend/utils'
import { logInfo, logWarning, LogPrefix } from 'backend/logger'
import { isMac } from 'backend/constants/environment'

const MAX_ATTEMPTS = 12
const ATTEMPT_SPACING_MS = 1500
const SETTLE_MS = 2500

const RAISE_SCRIPT = [
  'on run argv',
  '  set theArgs to argv',
  '  set pidCount to (item 1 of theArgs) as integer',
  '  set argCount to count of theArgs',
  '  tell application "System Events"',
  '    repeat with i from 1 to pidCount',
  '      set pidVal to (item (i + 1) of theArgs) as integer',
  '      set procs to (every process whose unix id is pidVal and visible is true)',
  '      if (count of procs) > 0 then',
  '        set p to item 1 of procs',
  '        set frontmost of p to true',
  '        return (name of p) & " pid=" & (unix id of p)',
  '      end if',
  '    end repeat',
  '    repeat with j from (pidCount + 2) to argCount',
  '      set nameVal to (item j of theArgs)',
  '      set procs to (every process whose name is nameVal and visible is true)',
  '      if (count of procs) > 0 then',
  '        set p to item 1 of procs',
  '        set frontmost of p to true',
  '        return (name of p) & " pid=" & (unix id of p)',
  '      end if',
  '    end repeat',
  '    return "none"',
  '  end tell',
  'end run'
].join('\n')

let cancelled = false
const activeTimers = new Set<ReturnType<typeof setTimeout>>()

/** Test-only: cancel in-flight raises and clear every tracked timer. */
export function __stopWineWindowRaises(): void {
  cancelled = true
  for (const handle of activeTimers) {
    clearTimeout(handle)
  }
  activeTimers.clear()
}

/** `C:\Games\X\X.exe -arg` -> `X.exe`; null when there is no `.exe`. */
export function windowsExeNameFromCommand(command: string): string | null {
  const idx = command.toLowerCase().indexOf('.exe')
  if (idx === -1) return null
  const upToExe = command.slice(0, idx + 4)
  const lastSep = upToExe.lastIndexOf('\\')
  const name = lastSep === -1 ? upToExe : upToExe.slice(lastSep + 1)
  return name || null
}

export async function raiseWineGameWindow(opts: {
  context: string
  pids?: string[]
  processNames?: string[]
}): Promise<void> {
  const { context } = opts
  try {
    if (!isMac) return
    const pids = (opts.pids ?? []).filter((p) => /^\d+$/.test(p))
    const names = (opts.processNames ?? []).filter((n) => n.length > 0)
    if (pids.length === 0 && names.length === 0) return

    cancelled = false
    const args = ['-e', RAISE_SCRIPT, String(pids.length), ...pids, ...names]
    const prefix = `raiseWineGameWindow [${context}]:`

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        const handle = setTimeout(() => {
          activeTimers.delete(handle)
          resolve()
        }, ms)
        activeTimers.add(handle)
        handle.unref?.()
      })
    const tryRaise = async (): Promise<string | null> => {
      try {
        const { stdout } = await spawnAsync('osascript', args)
        const out = stdout.trim()
        return out && out !== 'none' ? out : null
      } catch (error) {
        logWarning([`${prefix} osascript raise failed`, error], LogPrefix.Steam)
        return null
      }
    }

    let raised: string | null = null
    for (let attempt = 0; attempt < MAX_ATTEMPTS && !raised; attempt++) {
      if (cancelled) return
      if (attempt > 0) {
        await sleep(ATTEMPT_SPACING_MS)
        if (cancelled) return
      }
      raised = await tryRaise()
    }

    if (raised) {
      logInfo(`${prefix} raised (${raised})`, LogPrefix.Steam)
      if (cancelled) return
      await sleep(SETTLE_MS)
      if (cancelled) return
      await tryRaise()
    } else if (!cancelled) {
      logWarning(
        `${prefix} no matching process after ${MAX_ATTEMPTS} attempts (pids=${pids.join(',')} names=${names.join(',')})`,
        LogPrefix.Steam
      )
    }
  } catch (error) {
    logWarning(
      [`raiseWineGameWindow [${context}]: failed`, error],
      LogPrefix.Steam
    )
  }
}
