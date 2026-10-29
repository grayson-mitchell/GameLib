/**
 * Quick 261029-iwy: the running-Steam adoption classifier and driver. Driven
 * purely through injected deps (fake clock advanced by `sleep`); no fs, no
 * spawn, no real timers.
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('../macSteamOffline', () => ({ spawnOpenDetached: jest.fn() }))

import {
  classifySteamSyncTick,
  syncRunningMacSteam,
  STEAM_SYNC_IDLE_TIMEOUT_MS,
  STEAM_SYNC_MAX_MS,
  type AcfSnapshot,
  type SteamSyncDeps
} from '../runningSteamSync'

function acf(fields: Record<string, string>, mtimeMs = 1000): AcfSnapshot {
  const body = Object.entries({ appid: '264160', ...fields })
    .map(([k, v]) => `\t"${k}"\t\t"${v}"`)
    .join('\n')
  return { mtimeMs, content: `"AppState"\n{\n${body}\n}\n` }
}

const own = acf({ StateFlags: '4', buildid: '9044149' })

const tick = (
  current: AcfSnapshot | null,
  extra: { nowMs?: number; startedAtMs?: number; lastChangeAtMs?: number } = {}
) =>
  classifySteamSyncTick({
    baseline: own,
    current,
    nowMs: 5000,
    startedAtMs: 0,
    lastChangeAtMs: 0,
    ...extra
  })

describe('classifySteamSyncTick', () => {
  test("GameLib's own unchanged StateFlags 4 is not complete", () => {
    expect(tick(own)).toEqual({ kind: 'syncing' })
  })
  test.each(['2', '18'])('placeholder StateFlags %s is syncing', (flags) => {
    expect(
      tick(acf({ StateFlags: flags, buildid: '0', SizeOnDisk: '0' }, 2000))
    ).toEqual({ kind: 'syncing' })
  })
  test('StateFlags 4 with buildid 0 is syncing', () => {
    expect(tick(acf({ StateFlags: '4', buildid: '0' }, 2000))).toEqual({
      kind: 'syncing'
    })
  })
  test.each(['4', '6'])('Steam-written flags %s with real buildid', (flags) => {
    expect(
      tick(acf({ StateFlags: flags, buildid: '9044149', x: 'y' }, 2000))
    ).toEqual({ kind: 'adopted' })
  })
  test('same bytes but newer mtime counts as Steam rewriting', () => {
    expect(tick({ ...own, mtimeMs: 2000 })).toEqual({ kind: 'adopted' })
  })
  test('1026 repair reports a rounded percent', () => {
    expect(
      tick(
        acf(
          {
            StateFlags: '1026',
            buildid: '9044149',
            BytesDownloaded: '30',
            BytesToDownload: '120'
          },
          2000
        )
      )
    ).toEqual({ kind: 'syncing', percent: 25 })
  })
  test('1026 with BytesToDownload 0 has no percent', () => {
    expect(
      tick(
        acf(
          { StateFlags: '1026', BytesDownloaded: '0', BytesToDownload: '0' },
          2000
        )
      )
    ).toEqual({ kind: 'syncing' })
  })
  test('absent ACF is syncing', () => {
    expect(tick(null)).toEqual({ kind: 'syncing' })
  })
  test('unparseable content is syncing, never throws', () => {
    expect(tick({ mtimeMs: 2000, content: '"AppState" { "x' })).toEqual({
      kind: 'syncing'
    })
  })
  test('idle timeout', () => {
    expect(tick(own, { nowMs: STEAM_SYNC_IDLE_TIMEOUT_MS })).toEqual({
      kind: 'timeout'
    })
  })
  test('max timeout even while changing', () => {
    expect(
      tick(own, {
        nowMs: STEAM_SYNC_MAX_MS,
        lastChangeAtMs: STEAM_SYNC_MAX_MS - 1
      })
    ).toEqual({ kind: 'timeout' })
  })
})

function makeDeps(
  snapshots: (AcfSnapshot | null)[],
  over: Partial<SteamSyncDeps> = {}
) {
  let clock = 0
  let i = 0
  const calls: string[] = []
  const deps: SteamSyncDeps = {
    readSnapshot: jest.fn(() => {
      calls.push('read')
      const s = snapshots[Math.min(i, snapshots.length - 1)]
      i++
      return s
    }),
    fireUrl: jest.fn((url: string) => {
      calls.push(`fire:${url}`)
    }),
    emit: jest.fn(),
    now: () => clock,
    sleep: jest.fn((ms: number) => {
      clock += ms
      return Promise.resolve()
    }),
    ...over
  }
  return { deps, calls }
}

describe('syncRunningMacSteam', () => {
  test('null baseline is skipped, never fires', async () => {
    const { deps } = makeDeps([null])
    await expect(syncRunningMacSteam('264160', '/m.acf', deps)).resolves.toBe(
      'skipped'
    )
    expect(deps.fireUrl).not.toHaveBeenCalled()
  })

  test('fires once after the baseline read, emits, adopts', async () => {
    const { deps, calls } = makeDeps([
      own,
      acf({ StateFlags: '2', buildid: '0' }, 2000),
      acf(
        { StateFlags: '1026', BytesDownloaded: '60', BytesToDownload: '120' },
        3000
      ),
      acf({ StateFlags: '4', buildid: '9044149' }, 4000)
    ])
    await expect(syncRunningMacSteam('264160', '/m.acf', deps)).resolves.toBe(
      'adopted'
    )
    expect(calls[0]).toBe('read')
    expect(calls.filter((c) => c.startsWith('fire:'))).toEqual([
      'fire:steam://install/264160'
    ])
    expect(deps.emit).toHaveBeenCalledWith('264160', '')
    expect(deps.emit).toHaveBeenCalledWith('264160', '50%')
  })

  test('idle clock resets while the snapshot keeps changing', async () => {
    const snaps: AcfSnapshot[] = [own]
    for (let n = 0; n < 150; n++) {
      snaps.push(
        acf(
          {
            StateFlags: '1026',
            BytesDownloaded: `${n}`,
            BytesToDownload: '1000'
          },
          2000 + n
        )
      )
    }
    snaps.push(acf({ StateFlags: '4', buildid: '1' }, 99999))
    const { deps } = makeDeps(snaps)
    await expect(syncRunningMacSteam('1', '/m.acf', deps)).resolves.toBe(
      'adopted'
    )
  })

  test('times out when nothing changes', async () => {
    const { deps } = makeDeps([own])
    await expect(syncRunningMacSteam('1', '/m.acf', deps)).resolves.toBe(
      'timeout'
    )
  })

  test('aborts mid-loop', async () => {
    const ac = new AbortController()
    const { deps } = makeDeps([own], {
      sleep: jest.fn(() => {
        ac.abort()
        return Promise.resolve()
      })
    })
    await expect(
      syncRunningMacSteam('1', '/m.acf', { ...deps, signal: ac.signal })
    ).resolves.toBe('aborted')
  })
})
