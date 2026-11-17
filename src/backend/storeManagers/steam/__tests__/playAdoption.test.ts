/**
 * Phase 81 D-14: the Play-time adoption gate on every OS. Driven through an in-memory record store,
 * a scripted runner for the Steam client process probe, a fake requestRustInvoke for
 * steampoll_adoption_read, and a clock whose sleep advances time at once. Only the notification,
 * the status sender, the launch watcher and i18next are mocked.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initHeadless } from 'backend/logger'
import {
  RUST_STEAMFILES_READ_ACF,
  RUST_STEAMPOLL_ADOPTION_READ,
  RUST_STEAMPOLL_NEXT_NOTICE_SEQ,
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_READ_RUNNING_APP_ID
} from 'common/types/sidecarTransport'
import type { Clock } from 'backend/process/types'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import i18next from 'i18next'
import * as dialog from 'backend/dialog/dialog'
import * as backendUtils from 'backend/utils'
import * as launchedDeps from '../steamLaunchedDeps'
import { gatePlayOnAdoption } from '../playAdoption'
import {
  readPendingAdoption,
  type PendingAdoptionRecord
} from '../macSteamAdoption'
import { MAC_STEAM_OFFLINE_OWED_FILE } from '../macSteamClient'
import type SteamGame from '../games'
import type { AdoptionReading } from '../pollRust/steamPollTypes'

// The real logger needs a writer; HOME is redirected by the backend jest containment setup.
beforeAll(() => initHeadless())

// Spies, not module mocks: the notification, the status sender, the launch watcher and the copy
// lookup are the only seams this gate has outside its injected deps.
let notify: jest.SpyInstance
let sendGameStatusUpdate: jest.SpyInstance
let watchSteamLaunch: jest.SpyInstance
beforeEach(() => {
  notify = jest.spyOn(dialog, 'notify').mockImplementation(() => undefined)
  sendGameStatusUpdate = jest
    .spyOn(backendUtils, 'sendGameStatusUpdate')
    .mockImplementation(() => undefined)
  watchSteamLaunch = jest
    .spyOn(launchedDeps, 'watchSteamLaunch')
    .mockImplementation(() => undefined)
  jest
    .spyOn(i18next, 't')
    .mockImplementation(((_key: string, fallback: string) => fallback) as never)
})
afterEach(() => jest.restoreAllMocks())

const APP_ID = '112100'
const pgrepLinux = (code: number, stdout = '') => ({
  cmd: 'pgrep',
  argv: ['-x', 'steam'],
  result: { code, stdout }
})

/** One client-process probe answer on `platform`: running (pid 100) or gone. */
const probe = (platform: NodeJS.Platform, running: boolean) =>
  platform === 'win32'
    ? {
        cmd: join(
          process.env.SystemRoot ?? 'C:\\Windows',
          'System32',
          'tasklist.exe'
        ),
        result: {
          code: 0,
          stdout: running ? '"steam.exe","100","Console","1","10 K"\r\n' : ''
        }
      }
    : pgrepLinux(running ? 0 : 1, running ? '100\n' : '')

interface Harness {
  game: SteamGame
  store: Map<string, unknown>
  runner: ReturnType<typeof createScriptedRunner>
  openExternal: jest.Mock
  rust: Array<{ channel: string; args: unknown[] }>
  dir: string
}

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'play-adoption-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

function record(): PendingAdoptionRecord {
  return {
    steamPid: 100,
    manifestPath: join(dir, `appmanifest_${APP_ID}.acf`),
    baseline: { mtimeMs: 1000, content: '"AppState" {}' },
    recordedAt: 1_700_000_000_000
  }
}

function reading(over: Partial<AdoptionReading> = {}): AdoptionReading {
  return {
    adopted: false,
    signedIn: true,
    steamRunning: true,
    helperState: null,
    evidence: null,
    ...over
  }
}

/** A clock whose sleeps resolve at once and move time forward, so the 30 s wait is instant. */
function instantClock(): Clock {
  let now = 0
  return {
    now: () => now,
    setTimeout: (fn: () => void, ms: number) => {
      now += ms
      queueMicrotask(fn)
      return { id: 1 }
    }
  } as unknown as Clock
}

function harness(options: {
  withRecord?: boolean
  script?: Parameters<typeof createScriptedRunner>[0]
  adoptionRead?: AdoptionReading | Error
  runningAppId?: number
  readAcf?: unknown
}): Harness {
  const store = new Map<string, unknown>()
  if (options.withRecord !== false) store.set(APP_ID, record())
  const rust: Harness['rust'] = []
  const runner = createScriptedRunner(options.script ?? [])
  const openExternal = jest.fn().mockResolvedValue(undefined)
  const deps = {
    stores: {
      steam: {
        steamPendingAdoptionStore: {
          get: (k: string) => store.get(k),
          set: (k: string, v: unknown) => store.set(k, v),
          delete: (k: string) => store.delete(k),
          entries: () => [...store.entries()]
        }
      }
    },
    config: { getSettings: () => ({}) },
    requestRustInvoke: (channel: string, args: unknown[]) => {
      rust.push({ channel, args })
      if (channel === RUST_STEAMPOLL_ADOPTION_READ) {
        const r = options.adoptionRead ?? reading()
        return r instanceof Error ? Promise.reject(r) : Promise.resolve(r)
      }
      if (channel === RUST_STEAMPOLL_NEXT_NOTICE_SEQ) {
        return Promise.resolve(7)
      }
      if (channel === RUST_STEAMPOLL_READ_RUNNING_APP_ID) {
        return Promise.resolve(options.runningAppId ?? 0)
      }
      if (channel === RUST_STEAMFILES_READ_ACF) {
        return options.readAcf instanceof Error
          ? Promise.reject(options.readAcf)
          : Promise.resolve(options.readAcf)
      }
      return Promise.resolve(true)
    },
    runner,
    openExternal: { openExternal },
    clock: instantClock(),
    paths: { appFolder: dir, userHome: dir },
    steamProcesses: {
      macSteam: {
        isSteamRunning: jest.fn().mockResolvedValue(false),
        openUrlDetached: jest.fn()
      }
    },
    sendFrontendMessage: jest.fn(),
    appRuntime: {},
    steamSession: {
      libraryState: {
        library: new Map([[APP_ID, { title: 'Dota 2' }]])
      }
    },
    steamInstallRuntime: { noticeSeq: { last: 0 } }
  }
  const game = {
    deps,
    appId: APP_ID,
    getGameInfo: () => ({ title: 'Dota 2' })
  } as unknown as SteamGame
  return { game, store, runner, openExternal, rust, dir }
}

const stored = (h: Harness) =>
  readPendingAdoption(APP_ID, {
    get: (k) => h.store.get(k),
    set: () => undefined,
    delete: () => undefined
  })

// Every steamRequestNotice push the gate sent (D-05: the refusal is an in-app notice).
const noticesOf = (h: Harness) =>
  (h.game.deps.sendFrontendMessage as jest.Mock).mock.calls
    .filter((c) => c[0] === 'steamRequestNotice')
    .map((c) => c[1])

const rungameidOpened = (h: Harness) =>
  h.openExternal.mock.calls.some(([url]) => String(url).includes('rungameid'))

const unwatched = (h: Harness) =>
  h.rust.some((c) => c.channel === RUST_STEAMPOLL_ADOPTION_UNWATCH)

describe('gatePlayOnAdoption', () => {
  test('no record: proceeds with no probe and no Rust call', async () => {
    const h = harness({ withRecord: false })
    await expect(gatePlayOnAdoption(h.game, 'linux')).resolves.toBe('proceed')
    expect(h.runner.calls).toHaveLength(0)
    expect(h.rust).toHaveLength(0)
    expect(h.openExternal).not.toHaveBeenCalled()
  })

  test.each<NodeJS.Platform>(['linux', 'win32'])(
    '%s: an unadopted install restarts Steam once through steam://exit and relaunches with rungameid, clearing the record',
    async (platform) => {
      const h = harness({
        // The pid probe, then one restart poll that finds Steam gone.
        script: [probe(platform, true), probe(platform, false)]
      })
      await expect(gatePlayOnAdoption(h.game, platform)).resolves.toBe(
        'launched'
      )
      expect(h.openExternal.mock.calls).toEqual([
        ['steam://exit', { activate: false }],
        [`steam://rungameid/${APP_ID}`, { activate: false }]
      ])
      expect(stored(h)).toBeUndefined()
      expect(unwatched(h)).toBe(true)
      expect(watchSteamLaunch).toHaveBeenCalledWith(h.game.deps, APP_ID)
      // steam-starting while Steam restarts (D-04), then done; no prompt.
      expect(
        sendGameStatusUpdate.mock.calls.map(
          (c) => (c[1] as { status: string }).status
        )
      ).toEqual(['steam-starting', 'done'])
      expect(notify).not.toHaveBeenCalled()
    }
  )

  test('running but signed out: opens Steam forward, sends done, keeps the record, restarts nothing (D-03)', async () => {
    const h = harness({
      script: [pgrepLinux(0, '100\n')],
      adoptionRead: reading({ signedIn: false })
    })
    await expect(gatePlayOnAdoption(h.game, 'linux')).resolves.toBe(
      'opened-steam'
    )
    expect(h.openExternal).toHaveBeenCalledTimes(1)
    // No second argument: activate:false would send the open to the background.
    expect(h.openExternal).toHaveBeenCalledWith('steam://open/main')
    expect(stored(h)).toBeDefined()
    expect(unwatched(h)).toBe(false)
    expect(sendGameStatusUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ appName: APP_ID, status: 'done' })
    )
    expect(watchSteamLaunch).not.toHaveBeenCalled()
  })

  test('a game running in Steam: refused with the existing copy, record kept, no plain launch (D-05)', async () => {
    const h = harness({
      script: [pgrepLinux(0, '100\n')],
      runningAppId: 4000
    })
    await expect(gatePlayOnAdoption(h.game, 'linux')).resolves.toBe('refused')
    expect(h.openExternal).not.toHaveBeenCalled()
    expect(stored(h)).toBeDefined()
    expect(noticesOf(h)).toEqual([
      {
        appId: APP_ID,
        title: 'Dota 2',
        kind: 'adopt-restart-game-running',
        seq: 7
      }
    ])
    expect(notify).not.toHaveBeenCalled()
    expect(rungameidOpened(h)).toBe(false)
  })

  test('Steam never exits within 30 s: refused, only steam://exit fired, never rungameid, record kept (D-05)', async () => {
    const h = harness({
      script: [
        pgrepLinux(0, '100\n'),
        { ...pgrepLinux(0, '100\n'), repeat: true }
      ]
    })
    await expect(gatePlayOnAdoption(h.game, 'linux')).resolves.toBe('refused')
    expect(h.openExternal.mock.calls).toEqual([
      ['steam://exit', { activate: false }]
    ])
    expect(stored(h)).toBeDefined()
    expect(noticesOf(h)).toEqual([
      {
        appId: APP_ID,
        title: 'Dota 2',
        kind: 'adopt-restart-quit-timeout',
        seq: 7
      }
    ])
    expect(notify).not.toHaveBeenCalled()
    expect(rungameidOpened(h)).toBe(false)
  })

  test('macOS with a go-offline wrap owed: refused as busy, Steam untouched', async () => {
    writeFileSync(join(dir, MAC_STEAM_OFFLINE_OWED_FILE), '{}')
    const h = harness({
      script: [{ cmd: '/usr/bin/pgrep', result: { code: 0, stdout: '100\n' } }]
    })
    await expect(gatePlayOnAdoption(h.game, 'darwin')).resolves.toBe('refused')
    expect(h.openExternal).not.toHaveBeenCalled()
    expect(stored(h)).toBeDefined()
    expect(noticesOf(h)).toEqual([
      { appId: APP_ID, title: 'Dota 2', kind: 'adopt-restart-busy', seq: 7 }
    ])
    expect(notify).not.toHaveBeenCalled()
    expect(rungameidOpened(h)).toBe(false)
  })

  test('an adopted install clears the record and proceeds to a plain launch', async () => {
    const h = harness({
      script: [pgrepLinux(0, '100\n')],
      adoptionRead: reading({ adopted: true })
    })
    await expect(gatePlayOnAdoption(h.game, 'win32')).resolves.toBe('proceed')
    expect(stored(h)).toBeUndefined()
    expect(unwatched(h)).toBe(true)
    expect(h.openExternal).not.toHaveBeenCalled()
  })

  test('Steam not running (per the reading): clears the record and proceeds', async () => {
    const h = harness({
      script: [pgrepLinux(1)],
      adoptionRead: reading({ steamRunning: false })
    })
    await expect(gatePlayOnAdoption(h.game, 'linux')).resolves.toBe('proceed')
    expect(stored(h)).toBeUndefined()
  })

  test('D-10: a failed Rust read uses today rules; Steam not running clears and proceeds', async () => {
    const h = harness({
      script: [pgrepLinux(1)],
      adoptionRead: new Error('rust unavailable')
    })
    await expect(gatePlayOnAdoption(h.game, 'linux')).resolves.toBe('proceed')
    expect(stored(h)).toBeUndefined()
  })

  test('D-10: a failed Rust read with an unreadable ACF proceeds without a restart and keeps the record', async () => {
    writeFileSync(record().manifestPath, '"AppState" {}')
    const h = harness({
      script: [pgrepLinux(0, '100\n')],
      adoptionRead: new Error('rust unavailable'),
      readAcf: new Error('rust unavailable')
    })
    await expect(gatePlayOnAdoption(h.game, 'linux')).resolves.toBe('proceed')
    expect(h.openExternal).not.toHaveBeenCalled()
    expect(stored(h)).toBeDefined()
  })

  test('D-10: a failed Rust read with an unadopted ACF still restarts', async () => {
    writeFileSync(record().manifestPath, '"AppState" {}')
    const h = harness({
      script: [pgrepLinux(0, '100\n'), pgrepLinux(1)],
      adoptionRead: new Error('rust unavailable'),
      readAcf: {
        exists: true,
        parsed: true,
        readError: null,
        record: { stateFlags: 1026, buildid: '0' }
      }
    })
    await expect(gatePlayOnAdoption(h.game, 'linux')).resolves.toBe('launched')
  })
})
