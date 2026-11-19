/**
 * Phase 81 D-01..D-04: the game page's pending-adoption read and its two actions. Driven through an
 * in-memory record store, a scripted runner for the Steam client process probe, a fake
 * requestRustInvoke, the real launch single-flight and a clock whose sleep advances time at once.
 * Only the status sender and i18next are spied.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initHeadless } from 'backend/logger'
import { createLaunchFlights } from 'backend/launchSingleFlight'
import type { Clock } from 'backend/process/types'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import * as backendUtils from 'backend/utils'
import {
  RUST_STEAMPOLL_ADOPTION_UNWATCH,
  RUST_STEAMPOLL_NEXT_NOTICE_SEQ,
  RUST_STEAMPOLL_READ_RUNNING_APP_ID
} from 'common/types/sidecarTransport'
import {
  type AdoptionPushDeps,
  answerSteamAdoptionOpenSteam,
  answerSteamAdoptionRestartNow,
  answerSteamAdoptionStatus,
  getSteamAdoptionStatus,
  noteAdoptionSignedIn,
  openSteamForAdoption,
  pushSteamAdoptionStatus,
  restartSteamNowForAdoption
} from '../adoptionStatus'
import { MAC_STEAM_OFFLINE_OWED_FILE } from '../macSteamClient'
import type SteamGame from '../games'
import type { PendingAdoptionRecord } from '../macSteamAdoption'

beforeAll(() => initHeadless())

const APP_ID = '112100'

function record(): PendingAdoptionRecord {
  return {
    steamPid: 100,
    manifestPath: '/steam/steamapps/appmanifest_112100.acf',
    baseline: { mtimeMs: 1000, content: '"AppState" {}' },
    recordedAt: 1_700_000_000_000
  }
}

function depsWith(entries: Array<[string, unknown]>) {
  const store = new Map<string, unknown>(entries)
  return {
    sendFrontendMessage: jest.fn(),
    steamInstallRuntime: {
      adoption: { pushSeq: { last: 0 }, signedIn: new Map() }
    },
    stores: {
      steam: {
        steamPendingAdoptionStore: {
          get: (k: string) => store.get(k),
          set: (k: string, v: unknown) => store.set(k, v),
          delete: (k: string) => store.delete(k)
        }
      }
    }
  } as unknown as AdoptionPushDeps
}

describe('getSteamAdoptionStatus (D-01)', () => {
  test('a stored valid record is pending, signed-in unknown', () => {
    expect(
      getSteamAdoptionStatus(depsWith([[APP_ID, record()]]), APP_ID)
    ).toEqual({ pending: true, steamSignedIn: null })
  })

  test('no record is not pending', () => {
    expect(getSteamAdoptionStatus(depsWith([]), APP_ID)).toEqual({
      pending: false,
      steamSignedIn: null
    })
  })

  test('a malformed stored value is not pending', () => {
    expect(
      getSteamAdoptionStatus(depsWith([[APP_ID, { steamPid: 'x' }]]), APP_ID)
    ).toEqual({ pending: false, steamSignedIn: null })
  })

  test('only the asked appId counts', () => {
    expect(
      getSteamAdoptionStatus(depsWith([['999', record()]]), APP_ID).pending
    ).toBe(false)
  })
})

describe('the signed-in cache and the page push (D-03, D-07)', () => {
  const pushesOf = (deps: ReturnType<typeof depsWith>) =>
    (deps.sendFrontendMessage as jest.Mock).mock.calls

  test('getSteamAdoptionStatus reads the cached signed-in reading, null when none', () => {
    const deps = depsWith([[APP_ID, record()]])
    expect(getSteamAdoptionStatus(deps, APP_ID).steamSignedIn).toBeNull()
    deps.steamInstallRuntime.adoption.signedIn.set(APP_ID, false)
    expect(getSteamAdoptionStatus(deps, APP_ID).steamSignedIn).toBe(false)
    deps.steamInstallRuntime.adoption.signedIn.set(APP_ID, null)
    expect(getSteamAdoptionStatus(deps, APP_ID).steamSignedIn).toBeNull()
  })

  test('pushSteamAdoptionStatus sends one steamAdoptionStatusChanged with the stored state and a strictly increasing seq', () => {
    const deps = depsWith([[APP_ID, record()]])
    pushSteamAdoptionStatus(deps, APP_ID)
    pushSteamAdoptionStatus(deps, APP_ID)
    expect(pushesOf(deps)).toEqual([
      [
        'steamAdoptionStatusChanged',
        { appName: APP_ID, pending: true, steamSignedIn: null, seq: 1 }
      ],
      [
        'steamAdoptionStatusChanged',
        { appName: APP_ID, pending: true, steamSignedIn: null, seq: 2 }
      ]
    ])
  })

  test('the push carries only appName, two status fields and a seq (T-81-29)', () => {
    const deps = depsWith([[APP_ID, record()]])
    pushSteamAdoptionStatus(deps, APP_ID)
    const payload = pushesOf(deps)[0][1] as Record<string, unknown>
    expect(Object.keys(payload).sort()).toEqual([
      'appName',
      'pending',
      'seq',
      'steamSignedIn'
    ])
  })

  test('pushSteamAdoptionStatus never throws when the push fails', () => {
    const deps = depsWith([[APP_ID, record()]])
    ;(deps.sendFrontendMessage as jest.Mock).mockImplementation(() => {
      throw new Error('transport down')
    })
    expect(() => pushSteamAdoptionStatus(deps, APP_ID)).not.toThrow()
  })

  test('noteAdoptionSignedIn stores the reading and pushes once', () => {
    const deps = depsWith([[APP_ID, record()]])
    noteAdoptionSignedIn(deps, APP_ID, false)
    expect(deps.steamInstallRuntime.adoption.signedIn.get(APP_ID)).toBe(false)
    expect(pushesOf(deps)).toEqual([
      [
        'steamAdoptionStatusChanged',
        { appName: APP_ID, pending: true, steamSignedIn: false, seq: 1 }
      ]
    ])
    noteAdoptionSignedIn(deps, APP_ID, true)
    expect(pushesOf(deps)).toHaveLength(2)
    expect(pushesOf(deps)[1][1]).toMatchObject({
      steamSignedIn: true,
      seq: 2
    })
  })

  test('answerSteamAdoptionStatus includes the cached reading', () => {
    const deps = depsWith([[APP_ID, record()]])
    deps.steamInstallRuntime.adoption.signedIn.set(APP_ID, false)
    expect(answerSteamAdoptionStatus(deps, APP_ID)).toEqual({
      pending: true,
      steamSignedIn: false
    })
  })
})

describe('answerSteamAdoptionStatus (T-81-27)', () => {
  const none = { pending: false, steamSignedIn: null }

  test.each([['abc'], ['12345678901'], [''], [570], [null], [undefined]])(
    'rejects %p with "not pending" and never throws',
    (bad) => {
      expect(
        answerSteamAdoptionStatus(depsWith([[APP_ID, record()]]), bad)
      ).toEqual(none)
    }
  )

  test('a valid appId answers the status', () => {
    expect(
      answerSteamAdoptionStatus(depsWith([[APP_ID, record()]]), APP_ID)
    ).toEqual({ pending: true, steamSignedIn: null })
  })

  test('a store that throws answers "not pending"', () => {
    const deps = {
      stores: {
        steam: {
          steamPendingAdoptionStore: {
            get: () => {
              throw new Error('boom')
            }
          }
        }
      }
    } as unknown as Parameters<typeof getSteamAdoptionStatus>[0]
    expect(answerSteamAdoptionStatus(deps, APP_ID)).toEqual(none)
  })
})

// --- D-02 / D-03: the two actions ------------------------------------------------------------

let sendGameStatusUpdate: jest.SpyInstance
let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'adoption-status-'))
  sendGameStatusUpdate = jest
    .spyOn(backendUtils, 'sendGameStatusUpdate')
    .mockImplementation(() => undefined)
})
afterEach(() => {
  jest.restoreAllMocks()
  rmSync(dir, { recursive: true, force: true })
})

const pgrepGone = { cmd: 'pgrep', argv: ['-x', 'steam'], result: { code: 1 } }
const pgrepRunning = {
  cmd: 'pgrep',
  argv: ['-x', 'steam'],
  result: { code: 0, stdout: '100\n' }
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

interface Harness {
  game: SteamGame
  store: Map<string, unknown>
  openExternal: jest.Mock
  rust: Array<{ channel: string; args: unknown[] }>
  sendFrontendMessage: jest.Mock
  flights: ReturnType<typeof createLaunchFlights>
  /** Hold the running-app read until released, to keep the restart in flight. */
  hold: { release: () => void } | null
}

function harness(
  options: {
    withRecord?: boolean
    script?: Parameters<typeof createScriptedRunner>[0]
    runningAppId?: number
    relaunchFails?: boolean
    holdRestart?: boolean
    // appId -> bottle of a bridged session GameLib launched (quick 261119-se9).
    bridgeLaunched?: Record<string, string>
  } = {}
): Harness {
  const store = new Map<string, unknown>()
  if (options.withRecord !== false) store.set(APP_ID, record())
  const rust: Harness['rust'] = []
  const flights = createLaunchFlights()
  let release: () => void = () => undefined
  const gate = options.holdRestart
    ? new Promise<void>((resolve) => {
        release = resolve
      })
    : null
  const openExternal = jest.fn((url: string) =>
    options.relaunchFails && url === 'steam://open/main'
      ? Promise.reject(new Error('no handler'))
      : Promise.resolve(undefined)
  )
  const sendFrontendMessage = jest.fn()
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
    requestRustInvoke: async (channel: string, args: unknown[]) => {
      rust.push({ channel, args })
      if (channel === RUST_STEAMPOLL_NEXT_NOTICE_SEQ) return 7
      if (channel === RUST_STEAMPOLL_READ_RUNNING_APP_ID) {
        if (gate) await gate
        return options.runningAppId ?? 0
      }
      return true
    },
    runner: createScriptedRunner(options.script ?? [pgrepGone]),
    openExternal: { openExternal },
    clock: instantClock(),
    paths: { appFolder: dir, userHome: dir },
    steamProcesses: {
      macSteam: {
        isSteamRunning: jest.fn().mockResolvedValue(false),
        openUrlDetached: jest.fn()
      }
    },
    sendFrontendMessage,
    appRuntime: { launchFlights: flights },
    steamSession: {
      libraryState: { library: new Map([[APP_ID, { title: 'Dota 2' }]]) },
      gameSession: {
        bridgeLaunchBottles: new Map<string, { bottle: string }>(
          Object.entries(options.bridgeLaunched ?? {}).map(([id, bottle]) => [
            id,
            { bottle }
          ])
        ),
        bridgeLaunchesInFlight: new Map<string, Promise<boolean>>()
      }
    },
    steamInstallRuntime: {
      noticeSeq: { last: 0 },
      adoption: { pushSeq: { last: 0 }, signedIn: new Map() }
    }
  }
  const game = { deps, appId: APP_ID } as unknown as SteamGame
  return {
    game,
    store,
    openExternal,
    rust,
    sendFrontendMessage,
    flights,
    hold: gate ? { release } : null
  }
}

const notices = (h: Harness) =>
  h.sendFrontendMessage.mock.calls
    .filter((c) => c[0] === 'steamRequestNotice')
    .map((c) => c[1])
const unwatched = (h: Harness) =>
  h.rust.some((c) => c.channel === RUST_STEAMPOLL_ADOPTION_UNWATCH)
const rungameidOpened = (h: Harness) =>
  h.openExternal.mock.calls.some(([url]) => String(url).includes('rungameid'))

describe('restartSteamNowForAdoption (D-02)', () => {
  test('no record: answers no-record and touches nothing', async () => {
    const h = harness({ withRecord: false })
    await expect(restartSteamNowForAdoption(h.game, 'linux')).resolves.toBe(
      'no-record'
    )
    expect(h.openExternal).not.toHaveBeenCalled()
    expect(notices(h)).toEqual([])
  })

  test('quits Steam gracefully and relaunches Steam itself, never a game; only that clears the record', async () => {
    const h = harness()
    await expect(restartSteamNowForAdoption(h.game, 'linux')).resolves.toBe(
      'relaunched'
    )
    expect(h.openExternal.mock.calls).toEqual([
      ['steam://exit', { activate: false }],
      ['steam://open/main']
    ])
    expect(rungameidOpened(h)).toBe(false)
    expect(h.store.has(APP_ID)).toBe(false)
    expect(unwatched(h)).toBe(true)
    expect(
      sendGameStatusUpdate.mock.calls.map(
        (c) => (c[1] as { status: string }).status
      )
    ).toEqual(['steam-starting', 'done'])
    expect(notices(h)).toEqual([])
  })

  test('a game running in Steam: the in-app notice without the launch action, record kept, Steam untouched', async () => {
    const h = harness({ runningAppId: 4000 })
    await expect(restartSteamNowForAdoption(h.game, 'linux')).resolves.toBe(
      'game-running'
    )
    expect(h.openExternal).not.toHaveBeenCalled()
    expect(h.store.has(APP_ID)).toBe(true)
    expect(notices(h)).toEqual([
      {
        appId: APP_ID,
        title: 'Dota 2',
        kind: 'adopt-restart-game-running',
        launchWithoutSteam: false,
        seq: 7
      }
    ])
  })

  test('Steam never quits within 30 s: quit-timeout notice, only steam://exit fired, record kept', async () => {
    const h = harness({ script: [{ ...pgrepRunning, repeat: true }] })
    await expect(restartSteamNowForAdoption(h.game, 'linux')).resolves.toBe(
      'quit-timeout'
    )
    expect(h.openExternal.mock.calls).toEqual([
      ['steam://exit', { activate: false }]
    ])
    expect(h.store.has(APP_ID)).toBe(true)
    expect(notices(h)).toEqual([
      expect.objectContaining({
        kind: 'adopt-restart-quit-timeout',
        launchWithoutSteam: false
      })
    ])
  })

  test('macOS with a go-offline wrap owed: steam-busy notice, Steam untouched', async () => {
    writeFileSync(join(dir, MAC_STEAM_OFFLINE_OWED_FILE), '{}')
    const h = harness()
    await expect(restartSteamNowForAdoption(h.game, 'darwin')).resolves.toBe(
      'steam-busy'
    )
    expect(h.openExternal).not.toHaveBeenCalled()
    expect(h.store.has(APP_ID)).toBe(true)
    expect(notices(h)).toEqual([
      expect.objectContaining({ kind: 'adopt-restart-busy' })
    ])
  })

  test('a throwing relaunch answers error and keeps the record', async () => {
    const h = harness({ relaunchFails: true })
    await expect(restartSteamNowForAdoption(h.game, 'linux')).resolves.toBe(
      'error'
    )
    expect(h.store.has(APP_ID)).toBe(true)
  })

  test('a second click and a Play pressed meanwhile join the flight: in-progress, one restart, no recent game (T-81-28)', async () => {
    const h = harness({ holdRestart: true })
    const first = restartSteamNowForAdoption(h.game, 'linux')
    await Promise.resolve()
    const second = restartSteamNowForAdoption(h.game, 'linux')
    // Play shares the same key; its own launch body must never run while the restart is in flight.
    const play = jest.fn().mockResolvedValue(true)
    const onJoin = jest.fn()
    const playResult = h.flights.singleFlightLaunch(
      'steam',
      APP_ID,
      onJoin,
      play
    )
    h.hold?.release()
    await expect(second).resolves.toBe('in-progress')
    await expect(first).resolves.toBe('relaunched')
    // The flight resolves false: a joining Play records no recent game.
    await expect(playResult).resolves.toBe(false)
    expect(play).not.toHaveBeenCalled()
    expect(onJoin).toHaveBeenCalledTimes(1)
    expect(
      h.openExternal.mock.calls.filter(([u]) => u === 'steam://exit')
    ).toHaveLength(1)
  })
})

describe('openSteamForAdoption (D-03)', () => {
  test('opens Steam forward: one argument, never activate:false', async () => {
    const h = harness()
    await openSteamForAdoption(h.game.deps)
    expect(h.openExternal).toHaveBeenCalledTimes(1)
    expect(h.openExternal).toHaveBeenCalledWith('steam://open/main')
  })
})

describe('the action handler bodies reject a bad appId before doing anything (T-81-27)', () => {
  test.each([['abc'], ['12345678901'], [''], [112100], [null], [undefined]])(
    '%p',
    async (bad) => {
      const h = harness()
      const getGame = jest.fn(() => h.game)
      await expect(answerSteamAdoptionRestartNow(getGame, bad)).resolves.toBe(
        'error'
      )
      await expect(
        answerSteamAdoptionOpenSteam(getGame, bad)
      ).resolves.toBeUndefined()
      expect(getGame).not.toHaveBeenCalled()
      expect(h.openExternal).not.toHaveBeenCalled()
    }
  )

  test('a valid appId reaches the game; a throwing lookup answers error and never rejects', async () => {
    const h = harness()
    await expect(
      answerSteamAdoptionRestartNow(() => h.game, APP_ID)
    ).resolves.toBe('relaunched')
    const boom = () => {
      throw new Error('no such game')
    }
    await expect(answerSteamAdoptionRestartNow(boom, APP_ID)).resolves.toBe(
      'error'
    )
    await expect(
      answerSteamAdoptionOpenSteam(boom, APP_ID)
    ).resolves.toBeUndefined()
  })

  test('Open Steam through the handler body opens steam://open/main', async () => {
    const h = harness()
    await answerSteamAdoptionOpenSteam(() => h.game, APP_ID)
    expect(h.openExternal).toHaveBeenCalledWith('steam://open/main')
  })
})
