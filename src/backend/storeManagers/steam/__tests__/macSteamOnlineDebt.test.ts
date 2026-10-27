/**
 * Phase 54 (54-12): the owed-goonline marker and the restore that pays it.
 * Driven only through injected deps; child_process is mocked so nothing is
 * ever spawned and no steam:// URL is ever fired.
 */
import * as fs from 'fs'
import * as os from 'os'
import { join } from 'path'

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: jest.fn(),
  execFile: jest.fn()
}))

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('backend/platform', () => ({
  shell: { openExternal: jest.fn() }
}))
jest.mock('backend/config', () => ({
  GlobalConfig: {
    get: () => ({ getSettings: () => ({ defaultSteamPath: '' }) })
  }
}))

import { spawn } from 'child_process'
import { logInfo, logWarning } from 'backend/logger'
import {
  GuidedOfflineRequiredError,
  MAC_STEAM_LATE_LOGOFF_WINDOW_MS,
  MAC_STEAM_RESTORE_CONFIRM_MS,
  STEAM_GO_OFFLINE_URL,
  STEAM_GO_ONLINE_URL,
  __macSteamOnlineConfirmForTests,
  __resetMacSteamOfflineForTests,
  checkGuidedOfflineReady,
  isOwnUserPidAlive,
  readMacSteamCmStateSince,
  restoreMacSteamOnlineIfOwed,
  spawnOpenDetached,
  withMacSteamOffline,
  type MacSteamOfflineDeps
} from '../macSteamOffline'

const BASE = new Date(2026, 9, 27, 13, 0, 0).getTime()

function stamp(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `[${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}]`
}
const onlineLine = (ms: number) =>
  `${stamp(ms)} [Logged On, 4, 19] [U:1:1] RecvMsgClientLogOnResponse() : processing complete\r\n`
const offlineLine = (ms: number) =>
  `${stamp(ms)} [Logged Off, 0, 0] [U:1:1] ConnectionDisconnected() not auto reconnecting due to user initiated logoff\r\n`

let dir: string
let logPath: string
let markerPath: string
let clock: number
let urls: string[]
let running: boolean | Error

function makeDeps(
  overrides: Partial<MacSteamOfflineDeps> = {}
): MacSteamOfflineDeps {
  return {
    platform: 'darwin',
    connectionLogPath: () => logPath,
    isSteamRunning: async () => {
      if (running instanceof Error) throw running
      return running
    },
    openUrl: (url) => {
      urls.push(url)
    },
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    onlineDebtPath: () => markerPath,
    openUrlDetached: (url) => {
      urls.push('detached:' + url)
    },
    selfPid: 4242,
    isPidAlive: () => false,
    ...overrides
  }
}

function writeMarker(content?: string, extra: Record<string, unknown> = {}) {
  fs.writeFileSync(
    markerPath,
    content ??
      JSON.stringify({
        since: new Date(clock).toISOString(),
        by: 'toggled',
        pid: 4242,
        ...extra
      })
  )
}

const flush = () => new Promise<void>((r) => setImmediate(r))

beforeEach(() => {
  dir = fs.mkdtempSync(join(os.tmpdir(), 'mac-steam-debt-'))
  logPath = join(dir, 'connection_log.txt')
  markerPath = join(dir, 'owed.json')
  clock = BASE
  urls = []
  running = true
  __resetMacSteamOfflineForTests()
})

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true })
})

describe('marker lifecycle in the wrap', () => {
  it('toggled: marker exists when gooffline fires, is gone once online is confirmed, keys are since/by/pid', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    let atFire: string | null = null
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL) {
          atFire = fs.existsSync(markerPath)
            ? fs.readFileSync(markerPath, 'utf8')
            : null
          fs.appendFileSync(logPath, offlineLine(clock))
        }
      },
      openUrlDetached: (url) => {
        urls.push('detached:' + url)
        fs.appendFileSync(logPath, onlineLine(clock))
      }
    })
    await withMacSteamOffline(jest.fn().mockResolvedValue('v'), deps)
    await __macSteamOnlineConfirmForTests()
    expect(atFire).not.toBeNull()
    const parsed = JSON.parse(atFire as unknown as string)
    expect(Object.keys(parsed).sort()).toEqual(['by', 'pid', 'since'])
    expect(parsed.by).toBe('toggled')
    expect(parsed.pid).toBe(4242)
    expect(fs.existsSync(markerPath)).toBe(false)
    expect(urls).toEqual([
      STEAM_GO_OFFLINE_URL,
      'detached:' + STEAM_GO_ONLINE_URL
    ])
  })

  it('54-REVIEW WR-01: the in-session goonline goes detached (never the shell frame)', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, offlineLine(clock))
      }
    })
    await withMacSteamOffline(jest.fn().mockResolvedValue('v'), deps)
    await __macSteamOnlineConfirmForTests()
    expect(urls.filter((u) => u === STEAM_GO_ONLINE_URL)).toEqual([])
    expect(urls).toContain('detached:' + STEAM_GO_ONLINE_URL)
  })

  it('54-REVIEW WR-01: an unconfirmed goonline keeps the marker owed', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, offlineLine(clock))
      }
    })
    await withMacSteamOffline(jest.fn().mockResolvedValue('v'), deps)
    await __macSteamOnlineConfirmForTests()
    expect(fs.existsSync(markerPath)).toBe(true)
    expect(
      (logWarning as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('online not confirmed within')
      )
    ).toBe(true)
    expect(
      (logInfo as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('marker cleared')
      )
    ).toBe(false)
  })

  it('54-REVIEW WR-01: a fresh Logged On line is the confirmation fallback', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, offlineLine(clock))
      },
      openUrlDetached: (url) => {
        urls.push('detached:' + url)
        // No 'processing complete' text, but a bracketed Logged On state.
        fs.appendFileSync(
          logPath,
          `${stamp(clock)} [Logged On, 4, 19] [U:1:1] state change\r\n`
        )
      }
    })
    await withMacSteamOffline(jest.fn().mockResolvedValue('v'), deps)
    await __macSteamOnlineConfirmForTests()
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('54-REVIEW WR-01: a late confirmation never clears a marker a newer step recorded', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    let holdPolls = false
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, offlineLine(clock))
      },
      openUrlDetached: (url) => {
        urls.push('detached:' + url)
        holdPolls = true
      },
      sleep: async (ms) => {
        if (holdPolls) await gate
        clock += ms
      }
    })
    await withMacSteamOffline(jest.fn().mockResolvedValue('v'), deps)
    // Steam still reads Logged Off: the guided check records a newer marker.
    await checkGuidedOfflineReady(deps)
    fs.appendFileSync(logPath, onlineLine(clock))
    release()
    await __macSteamOnlineConfirmForTests()
    expect(JSON.parse(fs.readFileSync(markerPath, 'utf8')).by).toBe('guided')
  })

  it('connect throws: goonline still fires and the marker is gone once confirmed', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, offlineLine(clock))
      },
      openUrlDetached: (url) => {
        urls.push('detached:' + url)
        fs.appendFileSync(logPath, onlineLine(clock))
      }
    })
    await expect(
      withMacSteamOffline(jest.fn().mockRejectedValue(new Error('boom')), deps)
    ).rejects.toThrow('boom')
    await __macSteamOnlineConfirmForTests()
    expect(urls).toContain('detached:' + STEAM_GO_ONLINE_URL)
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('LogOff not seen: GuidedOfflineRequiredError and the marker is kept as toggled-unconfirmed from the fire', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    const err = await withMacSteamOffline(jest.fn(), makeDeps()).catch((e) => e)
    expect(err).toBeInstanceOf(GuidedOfflineRequiredError)
    expect(fs.existsSync(markerPath)).toBe(true)
    const parsed = JSON.parse(fs.readFileSync(markerPath, 'utf8'))
    expect(parsed.by).toBe('toggled-unconfirmed')
    expect(Date.parse(parsed.since)).toBe(BASE)
  })

  it("54-REVIEW WR-02: an unconfirmed marker never undoes the user's own later Go Offline", async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    await withMacSteamOffline(jest.fn(), makeDeps()).catch(() => undefined)
    // The user goes offline by hand well after the late-landing window.
    clock = BASE + MAC_STEAM_LATE_LOGOFF_WINDOW_MS + 60000
    fs.appendFileSync(logPath, offlineLine(clock))
    const connect = jest.fn().mockResolvedValue('v')
    const r = await withMacSteamOffline(connect, makeDeps())
    expect(r.wrap).toBe('already-offline')
    expect(urls.filter((u) => u.includes('goonline'))).toEqual([])
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('54-REVIEW WR-02: an unconfirmed marker is owed when the gooffline lands late', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    await withMacSteamOffline(jest.fn(), makeDeps()).catch(() => undefined)
    clock = BASE + 20000
    fs.appendFileSync(logPath, offlineLine(clock))
    const connect = jest.fn().mockResolvedValue('v')
    const r = await withMacSteamOffline(connect, makeDeps())
    expect(r.wrap).toBe('guided-restore')
    expect(urls).toContain('detached:' + STEAM_GO_ONLINE_URL)
  })

  it('running-probe failure writes no marker', async () => {
    running = new Error('ENOENT')
    await withMacSteamOffline(jest.fn(), makeDeps()).catch(() => undefined)
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('already offline with no marker and no guided arm: nothing fired, no marker', async () => {
    fs.writeFileSync(logPath, offlineLine(BASE - 1000))
    const connect = jest.fn().mockResolvedValue('v')
    const r = await withMacSteamOffline(connect, makeDeps())
    expect(r.wrap).toBe('already-offline')
    expect(urls).toEqual([])
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('Logged Off with the marker present: connects as guided-restore, goonline fires, marker cleared', async () => {
    fs.writeFileSync(logPath, offlineLine(BASE - 1000))
    writeMarker()
    const connect = jest.fn().mockResolvedValue('v')
    const r = await withMacSteamOffline(
      connect,
      makeDeps({
        openUrlDetached: (url) => {
          urls.push('detached:' + url)
          fs.appendFileSync(logPath, onlineLine(clock))
        }
      })
    )
    await __macSteamOnlineConfirmForTests()
    expect(connect).toHaveBeenCalledWith('guided-restore')
    expect(r.wrap).toBe('guided-restore')
    expect(urls).toEqual(['detached:' + STEAM_GO_ONLINE_URL])
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('Logged Off with a marker owned by another live pid and no guided arm: already-offline, nothing fired', async () => {
    fs.writeFileSync(logPath, offlineLine(BASE - 1000))
    writeMarker(undefined, { pid: 9999 })
    const connect = jest.fn().mockResolvedValue('v')
    const r = await withMacSteamOffline(
      connect,
      makeDeps({ isPidAlive: (pid) => pid === 9999 })
    )
    expect(r.wrap).toBe('already-offline')
    expect(urls).toEqual([])
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('checkGuidedOfflineReady with Steam running and Logged Off records a guided marker', async () => {
    fs.writeFileSync(logPath, offlineLine(BASE - 1000))
    await checkGuidedOfflineReady(makeDeps())
    expect(JSON.parse(fs.readFileSync(markerPath, 'utf8')).by).toBe('guided')
  })

  it('checkGuidedOfflineReady with Steam not running writes nothing', async () => {
    running = false
    await checkGuidedOfflineReady(makeDeps())
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('a marker write failure logs a warning and the wrap still completes', async () => {
    const blocker = join(dir, 'blocker')
    fs.writeFileSync(blocker, 'x')
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    const deps = makeDeps({
      onlineDebtPath: () => join(blocker, 'sub', 'owed.json'),
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, offlineLine(clock))
      }
    })
    const connect = jest.fn().mockResolvedValue('v')
    const r = await withMacSteamOffline(connect, deps)
    expect(r.wrap).toBe('toggled')
    expect(urls).toEqual([
      STEAM_GO_OFFLINE_URL,
      'detached:' + STEAM_GO_ONLINE_URL
    ])
    expect(
      (logWarning as jest.Mock).mock.calls.some((c) =>
        String(c[0]).includes('could not record the owed goonline')
      )
    ).toBe(true)
  })
})

describe('readMacSteamCmStateSince', () => {
  it('ignores bracketed lines older than sinceMs and returns null when all are older', () => {
    fs.writeFileSync(
      logPath,
      onlineLine(BASE - 5000) + offlineLine(BASE - 4000)
    )
    expect(readMacSteamCmStateSince(logPath, BASE)).toBeNull()
    fs.appendFileSync(logPath, onlineLine(BASE + 2000))
    expect(readMacSteamCmStateSince(logPath, BASE)).toBe('Logged On')
  })

  it('counts a line in the same second as sinceMs (floor to the second)', () => {
    fs.writeFileSync(logPath, onlineLine(BASE))
    expect(readMacSteamCmStateSince(logPath, BASE + 500)).toBe('Logged On')
  })
})

describe('restoreMacSteamOnlineIfOwed', () => {
  it('no marker: not-owed with no probe and no fire', async () => {
    const probe = jest.fn().mockResolvedValue(true)
    const r = await restoreMacSteamOnlineIfOwed(
      'boot',
      makeDeps({ isSteamRunning: probe })
    )
    expect(r).toBe('not-owed')
    expect(probe).not.toHaveBeenCalled()
    expect(urls).toEqual([])
  })

  it('non-darwin with a marker: not-darwin, nothing touched', async () => {
    writeMarker()
    const r = await restoreMacSteamOnlineIfOwed(
      'boot',
      makeDeps({ platform: 'linux' })
    )
    expect(r).toBe('not-darwin')
    expect(urls).toEqual([])
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('boot: goonline via openUrlDetached (never openUrl), confirmed by processing complete, marker cleared', async () => {
    fs.writeFileSync(logPath, offlineLine(BASE - 1000))
    writeMarker()
    const openUrl = jest.fn()
    const r = await restoreMacSteamOnlineIfOwed(
      'boot',
      makeDeps({
        openUrl,
        openUrlDetached: (url) => {
          urls.push('detached:' + url)
          fs.appendFileSync(logPath, onlineLine(clock))
        }
      })
    )
    expect(r).toBe('restored')
    expect(urls).toEqual(['detached:' + STEAM_GO_ONLINE_URL])
    expect(openUrl).not.toHaveBeenCalled()
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('boot: no new line but a fresh Logged On line is the fallback and clears the marker', async () => {
    writeMarker()
    fs.writeFileSync(logPath, onlineLine(BASE + 3000))
    const r = await restoreMacSteamOnlineIfOwed('boot', makeDeps())
    expect(r).toBe('restored')
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('boot: a stale Logged On line older than the marker never clears it', async () => {
    writeMarker()
    fs.writeFileSync(logPath, onlineLine(BASE - 120000))
    const r = await restoreMacSteamOnlineIfOwed('boot', makeDeps())
    expect(r).toBe('restore-unconfirmed')
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('boot: last state Logged Off keeps the marker and waits the full confirm window', async () => {
    writeMarker()
    fs.writeFileSync(logPath, offlineLine(BASE + 1000))
    const r = await restoreMacSteamOnlineIfOwed('boot', makeDeps())
    expect(r).toBe('restore-unconfirmed')
    expect(fs.existsSync(markerPath)).toBe(true)
    expect(clock - BASE).toBeGreaterThanOrEqual(MAC_STEAM_RESTORE_CONFIRM_MS)
  })

  it('Steam not running: nothing fired, marker kept', async () => {
    writeMarker()
    running = false
    const r = await restoreMacSteamOnlineIfOwed('boot', makeDeps())
    expect(r).toBe('kept-not-running')
    expect(urls).toEqual([])
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('probe throws: nothing fired, marker kept', async () => {
    writeMarker()
    running = new Error('ENOENT')
    const r = await restoreMacSteamOnlineIfOwed('shutdown', makeDeps())
    expect(r).toBe('kept-probe-failed')
    expect(urls).toEqual([])
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('shutdown: fires once detached, never sleeps, clears at once', async () => {
    writeMarker()
    const sleep = jest.fn()
    const r = await restoreMacSteamOnlineIfOwed('shutdown', makeDeps({ sleep }))
    expect(r).toBe('restored')
    expect(urls).toEqual(['detached:' + STEAM_GO_ONLINE_URL])
    expect(sleep).not.toHaveBeenCalled()
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it.each(['boot', 'shutdown'] as const)(
    '54-REVIEW WR-02 (%s): an unconfirmed marker with no late LogOff is not owed and is cleared, nothing fired',
    async (trigger) => {
      writeMarker(undefined, { by: 'toggled-unconfirmed' })
      fs.writeFileSync(
        logPath,
        onlineLine(BASE + 1000) +
          offlineLine(BASE + MAC_STEAM_LATE_LOGOFF_WINDOW_MS + 30000)
      )
      const r = await restoreMacSteamOnlineIfOwed(trigger, makeDeps())
      expect(r).toBe('not-owed')
      expect(urls).toEqual([])
      expect(fs.existsSync(markerPath)).toBe(false)
    }
  )

  it('54-REVIEW WR-02: an unconfirmed marker with a late LogOff is restored', async () => {
    writeMarker(undefined, { by: 'toggled-unconfirmed' })
    fs.writeFileSync(logPath, offlineLine(BASE + 8000))
    const r = await restoreMacSteamOnlineIfOwed('shutdown', makeDeps())
    expect(r).toBe('restored')
    expect(urls).toEqual(['detached:' + STEAM_GO_ONLINE_URL])
  })

  it('a garbage marker still counts as owed', async () => {
    writeMarker('\x00not json')
    const r = await restoreMacSteamOnlineIfOwed('shutdown', makeDeps())
    expect(r).toBe('restored')
    expect(urls).toEqual(['detached:' + STEAM_GO_ONLINE_URL])
  })

  it('single-flight: two boot calls share one probe and one outcome', async () => {
    writeMarker()
    fs.writeFileSync(logPath, onlineLine(BASE + 1000))
    const probe = jest.fn().mockResolvedValue(true)
    const deps = makeDeps({ isSteamRunning: probe })
    const a = restoreMacSteamOnlineIfOwed('boot', deps)
    const b = restoreMacSteamOnlineIfOwed('boot', deps)
    const [ra, rb] = await Promise.all([a, b])
    expect(probe).toHaveBeenCalledTimes(1)
    expect(ra).toBe(rb)
  })

  it('per-trigger flights: shutdown does not wait on a boot confirm window', async () => {
    writeMarker()
    fs.writeFileSync(logPath, offlineLine(BASE + 1000))
    let release!: () => void
    const gate = new Promise<void>((r) => {
      release = r
    })
    const deps = makeDeps({
      sleep: async (ms) => {
        await gate
        clock += ms
      }
    })
    const boot = restoreMacSteamOnlineIfOwed('boot', deps)
    await flush()
    const shutdown = await restoreMacSteamOnlineIfOwed('shutdown', deps)
    expect(shutdown).toBe('restored')
    expect(
      urls.filter((u) => u === 'detached:' + STEAM_GO_ONLINE_URL)
    ).toHaveLength(2)
    expect(fs.existsSync(markerPath)).toBe(false)
    release()
    await boot
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it.each(['boot', 'shutdown'] as const)(
    'owner alive (%s): kept-owner-alive with no probe and no URL',
    async (trigger) => {
      writeMarker(undefined, { pid: 9999 })
      const probe = jest.fn().mockResolvedValue(true)
      const r = await restoreMacSteamOnlineIfOwed(
        trigger,
        makeDeps({ isSteamRunning: probe, isPidAlive: () => true })
      )
      expect(r).toBe('kept-owner-alive')
      expect(probe).not.toHaveBeenCalled()
      expect(urls).toEqual([])
      expect(fs.existsSync(markerPath)).toBe(true)
    }
  )

  it('54-REVIEW WR-03: a marker older than this boot is never owned by a live pid', async () => {
    writeMarker(undefined, { pid: 9999 })
    const r = await restoreMacSteamOnlineIfOwed(
      'boot',
      makeDeps({
        isPidAlive: () => true,
        systemBootMs: () => BASE + 1000,
        openUrlDetached: (url) => {
          urls.push('detached:' + url)
          fs.appendFileSync(logPath, onlineLine(clock))
        }
      })
    )
    expect(r).toBe('restored')
    expect(fs.existsSync(markerPath)).toBe(false)
  })

  it('54-REVIEW WR-03: a marker written since this boot still honours a live owner', async () => {
    writeMarker(undefined, { pid: 9999 })
    const r = await restoreMacSteamOnlineIfOwed(
      'boot',
      makeDeps({ isPidAlive: () => true, systemBootMs: () => BASE - 1000 })
    )
    expect(r).toBe('kept-owner-alive')
    expect(urls).toEqual([])
  })

  it('a dead owner is restored', async () => {
    writeMarker(undefined, { pid: 9999 })
    const r = await restoreMacSteamOnlineIfOwed(
      'shutdown',
      makeDeps({ isPidAlive: () => false })
    )
    expect(r).toBe('restored')
  })

  it('our own pid is restored without consulting isPidAlive', async () => {
    writeMarker()
    const alive = jest.fn().mockReturnValue(true)
    const r = await restoreMacSteamOnlineIfOwed(
      'shutdown',
      makeDeps({ isPidAlive: alive })
    )
    expect(r).toBe('restored')
    expect(alive).not.toHaveBeenCalled()
  })

  it('a wrap started during an in-flight boot restore waits for it', async () => {
    writeMarker()
    fs.writeFileSync(logPath, onlineLine(BASE + 1000))
    let release!: (v: boolean) => void
    const held = new Promise<boolean>((r) => {
      release = r
    })
    let calls = 0
    const deps = makeDeps({
      isSteamRunning: () => (++calls === 1 ? held : Promise.resolve(false))
    })
    const boot = restoreMacSteamOnlineIfOwed('boot', deps)
    const connect = jest.fn().mockResolvedValue('v')
    const wrap = withMacSteamOffline(connect, deps)
    await flush()
    expect(connect).not.toHaveBeenCalled()
    release(true)
    await boot
    await wrap
    expect(connect).toHaveBeenCalledTimes(1)
  })
})

describe('shutdown during a wrap (54-REVIEW WR-04)', () => {
  it('a shutdown during the LogOff watch fires goonline, keeps the marker, and the wrap goes back online at once', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    const never = new Promise<void>(() => undefined)
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
      },
      // Every poll and the settle hang: only the shutdown signal moves on.
      sleep: () => never
    })
    const connect = jest.fn().mockResolvedValue('v')
    const wrap = withMacSteamOffline(connect, deps)
    await flush()
    expect(urls).toEqual([STEAM_GO_OFFLINE_URL])
    const r = await restoreMacSteamOnlineIfOwed('shutdown', deps)
    expect(r).toBe('restore-unconfirmed')
    expect(fs.existsSync(markerPath)).toBe(true)
    const w = await wrap
    expect(w.wrap).toBe('toggled')
    expect(urls).toEqual([
      STEAM_GO_OFFLINE_URL,
      'detached:' + STEAM_GO_ONLINE_URL,
      'detached:' + STEAM_GO_ONLINE_URL
    ])
    expect(fs.existsSync(markerPath)).toBe(true)
  })

  it('a shutdown during the connect cuts the settle short, and the restore still clears the marker', async () => {
    fs.writeFileSync(logPath, onlineLine(BASE - 60000))
    let finishConnect!: () => void
    const connecting = new Promise<void>((r) => {
      finishConnect = r
    })
    const deps = makeDeps({
      openUrl: (url) => {
        urls.push(url)
        if (url === STEAM_GO_OFFLINE_URL)
          fs.appendFileSync(logPath, offlineLine(clock))
      },
      sleep: async (ms) => {
        if (ms === 2000) await new Promise<void>(() => undefined)
        clock += ms
      }
    })
    const wrap = withMacSteamOffline(async () => {
      await connecting
      return 'v'
    }, deps)
    await flush()
    const r = await restoreMacSteamOnlineIfOwed('shutdown', deps)
    expect(r).toBe('restored')
    expect(fs.existsSync(markerPath)).toBe(false)
    finishConnect()
    const w = await wrap
    expect(w.wrap).toBe('toggled')
    expect(
      urls.filter((u) => u === 'detached:' + STEAM_GO_ONLINE_URL)
    ).toHaveLength(2)
  })
})

describe('isOwnUserPidAlive (54-REVIEW WR-03)', () => {
  const kill = (code?: string) =>
    jest.spyOn(process, 'kill').mockImplementation(() => {
      if (code === undefined) return true
      throw Object.assign(new Error(code), { code })
    })

  afterEach(() => jest.restoreAllMocks())

  it('a live process of this user is alive', () => {
    kill()
    expect(isOwnUserPidAlive(9999)).toBe(true)
  })

  it.each(['EPERM', 'ESRCH'])('%s is not ours', (code) => {
    kill(code)
    expect(isOwnUserPidAlive(9999)).toBe(false)
  })
})

describe('spawnOpenDetached', () => {
  it('spawns /usr/bin/open -g detached with ignored stdio, no env, and unrefs', () => {
    const child = { on: jest.fn(), unref: jest.fn() }
    ;(spawn as unknown as jest.Mock).mockReturnValue(child)
    spawnOpenDetached('steam://open/goonline')
    expect(spawn).toHaveBeenCalledTimes(1)
    const [bin, args, opts] = (spawn as unknown as jest.Mock).mock.calls[0]
    expect(bin).toBe('/usr/bin/open')
    expect(args).toEqual(['-g', 'steam://open/goonline'])
    expect(opts).toMatchObject({ detached: true, stdio: 'ignore' })
    expect(Object.keys(opts)).not.toContain('env')
    expect(child.on).toHaveBeenCalledWith('error', expect.any(Function))
    expect(child.unref).toHaveBeenCalled()
  })
})
