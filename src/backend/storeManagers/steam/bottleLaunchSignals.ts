/**
 * D-51-16 (folded todo 2026-10-16-steam-bottle-play-gives-no-feedback-while-
 * steam-is-blocked.md): a pure classifier that distinguishes which of the
 * three measured bottled-Steam launch blockers the bottle's OWN logs show,
 * plus the bounded log-tail reader it consumes.
 *
 * Planner measurement 2026-10-17 of a real GameLibSteam bottle found a
 * clean signal for all three causes:
 *  - self-update:    bootstrap_log.txt `Installing update...`
 *  - other-session:  console_log.txt `GameAction [AppID <appId>, ...] :
 *                     LaunchApp waiting for user response to
 *                     KickingOtherSession "<title>"`
 *  - login:          console_log.txt `LogonFailure <reason>` where
 *                     `<reason>` is not `No Connection` (that reason means
 *                     "not even trying to log on", not a login failure).
 *
 * `classifyBottledSteamBlock` is pure (string tails in, enum out) so it is
 * directly unit-testable against fixtures shaped like the real logs without
 * touching a filesystem. `readBoundedTail` is the one function that does
 * real I/O -- `node:fs/promises` only (open + read from an offset + close
 * in `finally`), never a synchronous whole-file read, so the caller's await
 * chain is never blocked by a slow or huge bottle log file.
 */
import { open } from 'node:fs/promises'
import { join } from 'node:path'

import type { SteamBottleLaunchWaitingCause } from 'common/types/steam'

/** D-51-16: no "Waiting for Steam…" state before this much wall time with
 * no matched game process -- see bottleProcessMonitor.ts's own grace-window
 * wiring. LD-4 (quick 261016-t3e) forbids a deadline on the first MATCH;
 * this constant governs only when the waiting state itself may first
 * appear, not when the monitor gives up. */
export const WAITING_FOR_STEAM_GRACE_MS = 20000

/** D-51-16: once the grace window has passed with no match, re-read the
 * bottle's logs and re-classify at most this often -- bounds the extra
 * filesystem cost of the waiting-state check against a long, walked-away-
 * from block. */
export const WAITING_RECHECK_MS = 15000

/** Default cap for `readBoundedTail` -- T-51-18's mitigation. */
const DEFAULT_MAX_TAIL_BYTES = 65536

/**
 * Read at most `maxBytes` from the END of the file at `path`, using
 * `node:fs/promises` only. Returns `''` (never throws) when the file does
 * not exist or cannot otherwise be opened -- a bottled Steam install that
 * has not written `logs/` yet, or any other transient read failure, is not
 * this function's problem to raise; the caller treats an empty tail as "no
 * signal" either way.
 */
export async function readBoundedTail(
  path: string,
  maxBytes: number = DEFAULT_MAX_TAIL_BYTES
): Promise<string> {
  let handle
  try {
    handle = await open(path, 'r')
  } catch {
    return ''
  }

  try {
    const { size } = await handle.stat()
    const start = Math.max(0, size - maxBytes)
    const length = size - start
    if (length <= 0) {
      return ''
    }
    const buffer = Buffer.alloc(length)
    await handle.read(buffer, 0, length, start)
    return buffer.toString('utf8')
  } catch {
    return ''
  } finally {
    await handle.close()
  }
}

/**
 * The two bottled-Steam log files this detector reads, joined from the
 * bottle's directory. Fixed path, `Program Files (x86)` root only -- the
 * same root `bottle.ts`'s `STEAM_ROOT_SEGMENTS` tries FIRST (GAP-17-PFX86-
 * PATH's win32 fallback is a pre-existing edge case out of this plan's
 * scope; a missing-file read degrades gracefully to `''`, never a throw).
 */
export function bottledSteamLogPaths(bottleDir: string): {
  bootstrap: string
  console: string
} {
  const logsDir = join(
    bottleDir,
    'drive_c',
    'Program Files (x86)',
    'Steam',
    'logs'
  )
  return {
    bootstrap: join(logsDir, 'bootstrap_log.txt'),
    console: join(logsDir, 'console_log.txt')
  }
}

/** A single `[YYYY-MM-DD HH:MM:SS]`-prefixed log line, parsed as LOCAL
 * time per the task's own instruction. */
interface ParsedLine {
  timestampMs: number
  rest: string
}

const TIMESTAMP_PREFIX = /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})\]/

function parseTimestampedLine(line: string): ParsedLine | null {
  const match = TIMESTAMP_PREFIX.exec(line)
  if (!match) return null
  const [, year, month, day, hour, minute, second] = match
  const timestampMs = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ).getTime()
  return { timestampMs, rest: line.slice(match[0].length) }
}

/** Every timestamped line in `tail` whose timestamp is at/after `cutoffMs`.
 * A line with no parseable `[YYYY-MM-DD HH:MM:SS]` prefix is ignored
 * entirely -- it can never count, regardless of cutoff. */
function linesAtOrAfter(tail: string, cutoffMs: number): ParsedLine[] {
  const result: ParsedLine[] = []
  for (const line of tail.split('\n')) {
    const parsed = parseTimestampedLine(line)
    if (!parsed) continue
    if (parsed.timestampMs >= cutoffMs) {
      result.push(parsed)
    }
  }
  return result
}

export interface ClassifyBottledSteamBlockArgs {
  bootstrapTail: string
  consoleTail: string
  appId: string
  launchStartedAt: number
}

/**
 * Classify which (if any) of the three measured causes the bottle's own
 * log tails show for THIS launch. A line counts only when its timestamp is
 * at/after `launchStartedAt - 5000ms` -- the 5s slack absorbs clock-tick
 * rounding between when GameLib recorded `launchStartedAt` and when the
 * bottled Windows Steam client wrote its own log line for the same event.
 *
 * Precedence when several match in the same window: other-session beats
 * self-update beats login (D-51-16's own ordering -- other-session is the
 * most actionable one to name, since it is the only cause the user can
 * resolve from the other computer without touching GameLib at all).
 */
export function classifyBottledSteamBlock({
  bootstrapTail,
  consoleTail,
  appId,
  launchStartedAt
}: ClassifyBottledSteamBlockArgs): SteamBottleLaunchWaitingCause | null {
  const cutoffMs = launchStartedAt - 5000
  const consoleLines = linesAtOrAfter(consoleTail, cutoffMs)
  const bootstrapLines = linesAtOrAfter(bootstrapTail, cutoffMs)

  const otherSessionPattern = new RegExp(
    `GameAction \\[AppID ${escapeRegExp(appId)},[^\\]]*\\]\\s*:\\s*LaunchApp waiting for user response to KickingOtherSession`
  )
  const hasOtherSession = consoleLines.some((line) =>
    otherSessionPattern.test(line.rest)
  )
  if (hasOtherSession) return 'other-session'

  const hasSelfUpdate = bootstrapLines.some((line) =>
    line.rest.includes('Installing update...')
  )
  if (hasSelfUpdate) return 'self-update'

  const hasLogin = consoleLines.some(
    (line) =>
      line.rest.includes('LogonFailure') &&
      !line.rest.includes('LogonFailure No Connection')
  )
  if (hasLogin) return 'login'

  return null
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
