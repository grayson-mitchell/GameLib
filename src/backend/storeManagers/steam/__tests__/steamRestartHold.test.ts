/**
 * Quick 261029-pkp: persisted "Restart Steam to finish" hold record. Uses an
 * injectable in-memory store; electronStores is not mocked.
 */
import {
  clearSteamRestartHold,
  decideSteamRestartHoldRearm,
  listSteamRestartHolds,
  readSteamRestartHold,
  recordSteamRestartHold,
  type SteamRestartHoldRecord,
  type SteamRestartHoldStore
} from '../steamRestartHold'

function memStore(): SteamRestartHoldStore & { map: Map<string, unknown> } {
  const map = new Map<string, unknown>()
  return {
    map,
    get: (k) => map.get(k),
    set: (k, v) => void map.set(k, v),
    delete: (k) => void map.delete(k),
    entries: () => [...map.entries()]
  }
}

const REC: SteamRestartHoldRecord = {
  pids: [{ pid: 111, startToken: 'T1' }],
  recordedAt: 1000,
  macNativeRoute: true,
  skippedDepots: ['5']
}

describe('persistence', () => {
  it('round-trips a record and clears it', () => {
    const s = memStore()
    recordSteamRestartHold('730', REC, s)
    expect(readSteamRestartHold('730', s)).toEqual(REC)
    clearSteamRestartHold('730', s)
    expect(readSteamRestartHold('730', s)).toBeUndefined()
  })

  it.each([
    ['non-object', 'x'],
    ['missing pids', { ...REC, pids: undefined }],
    ['empty pids', { ...REC, pids: [] }],
    ['non-integer pid', { ...REC, pids: [{ pid: 1.5, startToken: 'a' }] }],
    ['non-string token', { ...REC, pids: [{ pid: 1, startToken: 7 }] }],
    ['non-finite recordedAt', { ...REC, recordedAt: Infinity }],
    ['non-string depots', { ...REC, skippedDepots: [1] }]
  ])('read returns undefined for %s', (_n, value) => {
    const s = memStore()
    s.map.set('730', value)
    expect(readSteamRestartHold('730', s)).toBeUndefined()
  })

  it('list returns only valid pairs', () => {
    const s = memStore()
    s.map.set('730', REC)
    s.map.set('bad', { nope: true })
    expect(listSteamRestartHolds(s)).toEqual([['730', REC]])
  })
})

describe('decideSteamRestartHoldRearm()', () => {
  const base = {
    record: REC,
    livePids: [111],
    startTokens: new Map([[111, 'T1']]),
    nowMs: 2000,
    maxAgeMs: 10_000
  }
  it('unknown when livePids is undefined', () => {
    expect(
      decideSteamRestartHoldRearm({ ...base, livePids: undefined })
    ).toEqual({ kind: 'unknown' })
  })
  it('drops when expired', () => {
    expect(decideSteamRestartHoldRearm({ ...base, nowMs: 11_000 })).toEqual({
      kind: 'drop',
      reason: 'expired'
    })
  })
  it('drops when no recorded pid is live', () => {
    expect(decideSteamRestartHoldRearm({ ...base, livePids: [9] })).toEqual({
      kind: 'drop',
      reason: 'steam-exited'
    })
  })
  it('unknown when tokens are unavailable', () => {
    expect(
      decideSteamRestartHoldRearm({ ...base, startTokens: undefined })
    ).toEqual({ kind: 'unknown' })
  })
  it('drops on a differing token (PID reuse)', () => {
    expect(
      decideSteamRestartHoldRearm({
        ...base,
        startTokens: new Map([[111, 'T2']])
      })
    ).toEqual({ kind: 'drop', reason: 'pid-reused' })
  })
  it('arms with only the matching pids', () => {
    const record = {
      ...REC,
      pids: [
        { pid: 111, startToken: 'T1' },
        { pid: 222, startToken: 'X' }
      ]
    }
    expect(
      decideSteamRestartHoldRearm({
        ...base,
        record,
        livePids: [111, 222],
        startTokens: new Map([
          [111, 'T1'],
          [222, 'Y']
        ])
      })
    ).toEqual({ kind: 'arm', pids: [111] })
  })
})
