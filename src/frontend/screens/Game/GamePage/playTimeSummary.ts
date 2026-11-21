import type { GameContextType } from 'frontend/types'

/**
 * Pure play-time facts for the footer status line (D-17). No React, no store
 * reads: usePlayTime gathers the inputs, this module turns them into numbers.
 */
export interface PlayTimeFacts {
  totalMinutes: number | null
  lastPlayedMs: number | null
  firstPlayedMs: number | null
}

interface PlayTimeInput {
  /** Steam launches its own games, so its totals come from the library sync. */
  steam?: { minutes?: number; lastPlayedSec?: number }
  /** GameLib's own timestamp store for every other runner. */
  local?: {
    totalPlayed?: number
    lastPlayed?: string
    firstPlayed?: string
  } | null
}

function parseDate(value: string | undefined): number | null {
  if (!value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : ms
}

function positiveOrNull(value: number | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null
}

export function playTimeFacts(input: PlayTimeInput): PlayTimeFacts {
  if (input.steam) {
    const lastPlayedSec = positiveOrNull(input.steam.lastPlayedSec)
    return {
      totalMinutes: positiveOrNull(input.steam.minutes),
      lastPlayedMs: lastPlayedSec === null ? null : lastPlayedSec * 1000,
      firstPlayedMs: null
    }
  }
  const local = input.local
  return {
    totalMinutes: positiveOrNull(local?.totalPlayed),
    lastPlayedMs: parseDate(local?.lastPlayed),
    firstPlayedMs: parseDate(local?.firstPlayed)
  }
}

export function splitDuration(totalMinutes: number): {
  hours: number
  minutes: number
} {
  const whole = Math.max(0, Math.floor(totalMinutes))
  return { hours: Math.floor(whole / 60), minutes: whole % 60 }
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const MONTH = 30 * DAY
const YEAR = 365 * DAY

export type RelativeUnit = 'minute' | 'hour' | 'day' | 'month' | 'year'

/** The coarsest unit that is at least 1; negative for the past. */
export function relativeTimeParts(
  thenMs: number,
  nowMs: number
): { value: number; unit: RelativeUnit } {
  const diff = thenMs - nowMs
  const abs = Math.abs(diff)
  const sign = diff < 0 ? -1 : 1
  const steps: [number, RelativeUnit][] = [
    [YEAR, 'year'],
    [MONTH, 'month'],
    [DAY, 'day'],
    [HOUR, 'hour']
  ]
  for (const [size, unit] of steps) {
    if (abs >= size) return { value: sign * Math.floor(abs / size), unit }
  }
  return { value: sign * Math.floor(abs / MINUTE), unit: 'minute' }
}

/**
 * True when no long action owns the status line. While any of these runs the
 * line shows only that action's progress (D-10 single readout).
 */
export function isStatusIdle(is: GameContextType['is']): boolean {
  return !(
    is.installing ||
    is.importing ||
    is.updating ||
    is.moving ||
    is.reparing ||
    is.uninstalling ||
    is.queued ||
    is.launching ||
    is.playing ||
    is.syncing ||
    is.installingRedist ||
    is.preparingDrm ||
    is.downloadingEngine ||
    is.startingSteam ||
    is.installingWinetricksPackages ||
    is.settingUpBottle
  )
}
