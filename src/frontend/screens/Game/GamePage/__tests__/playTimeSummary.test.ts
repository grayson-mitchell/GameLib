import type { GameContextType } from 'frontend/types'
import {
  isStatusIdle,
  playTimeFacts,
  relativeTimeParts,
  splitDuration
} from '../playTimeSummary'

const NOW = Date.parse('2026-11-21T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const HOUR = 60 * 60 * 1000

describe('playTimeFacts (D-17)', () => {
  it('reads Steam minutes and last-played seconds', () => {
    expect(
      playTimeFacts({ steam: { minutes: 760, lastPlayedSec: 1700000000 } })
    ).toEqual({
      totalMinutes: 760,
      lastPlayedMs: 1700000000000,
      firstPlayedMs: null
    })
  })

  it('reads the local timestamp store; an empty first-played is null', () => {
    const facts = playTimeFacts({
      local: {
        totalPlayed: 45,
        lastPlayed: '2026-11-18T10:00:00Z',
        firstPlayed: ''
      }
    })
    expect(facts.totalMinutes).toBe(45)
    expect(facts.lastPlayedMs).toBe(Date.parse('2026-11-18T10:00:00Z'))
    expect(facts.firstPlayedMs).toBeNull()
  })

  it('maps an unparseable date to null', () => {
    const facts = playTimeFacts({
      local: { totalPlayed: 5, lastPlayed: 'not a date', firstPlayed: 'x' }
    })
    expect(facts.lastPlayedMs).toBeNull()
    expect(facts.firstPlayedMs).toBeNull()
  })

  it('treats a never-played game as all null', () => {
    expect(playTimeFacts({ steam: { minutes: 0 } })).toEqual({
      totalMinutes: null,
      lastPlayedMs: null,
      firstPlayedMs: null
    })
    expect(playTimeFacts({ local: null }).totalMinutes).toBeNull()
  })
})

describe('splitDuration', () => {
  it('splits minutes into hours and minutes', () => {
    expect(splitDuration(760)).toEqual({ hours: 12, minutes: 40 })
    expect(splitDuration(45)).toEqual({ hours: 0, minutes: 45 })
  })
})

describe('relativeTimeParts', () => {
  it('uses the coarsest unit that is at least 1', () => {
    expect(relativeTimeParts(NOW - 3 * DAY, NOW)).toEqual({
      value: -3,
      unit: 'day'
    })
    expect(relativeTimeParts(NOW - 2 * HOUR, NOW)).toEqual({
      value: -2,
      unit: 'hour'
    })
    expect(relativeTimeParts(NOW - 40 * DAY, NOW)).toEqual({
      value: -1,
      unit: 'month'
    })
    expect(relativeTimeParts(NOW - 400 * DAY, NOW)).toEqual({
      value: -1,
      unit: 'year'
    })
  })
})

describe('isStatusIdle', () => {
  const idle = {
    installing: false,
    importing: false,
    installingWinetricksPackages: false,
    installingRedist: false,
    preparingDrm: false,
    downloadingEngine: false,
    startingSteam: false,
    launching: false,
    moving: false,
    playing: false,
    queued: false,
    reparing: false,
    settingUpBottle: false,
    syncing: false,
    uninstalling: false,
    updating: false
  } as unknown as GameContextType['is']

  it('is idle when no action flag is set', () => {
    expect(isStatusIdle(idle)).toBe(true)
  })

  it.each([
    'installing',
    'importing',
    'updating',
    'moving',
    'reparing',
    'uninstalling',
    'queued',
    'launching',
    'playing',
    'syncing',
    'installingRedist',
    'preparingDrm',
    'downloadingEngine',
    'startingSteam',
    'installingWinetricksPackages',
    'settingUpBottle'
  ])('is not idle while %s', (flag) => {
    expect(isStatusIdle({ ...idle, [flag]: true })).toBe(false)
  })
})
