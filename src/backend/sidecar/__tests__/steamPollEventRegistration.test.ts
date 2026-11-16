/**
 * Phase 80 Plan 11: the steamPollStateEvent handler applies each Rust state event through the
 * existing TS functions, replies with the ack fields, and is idempotent and ordered (R1, R2).
 */
import * as logger from 'backend/logger'

import { createTestManagerDeps } from 'backend/testUtils/testServices'
import { isMac } from 'backend/constants/environment'
import { installPlatformForSource } from '../../storeManagers/steam/library/installRoot'
import type { SteamGameInfo } from 'common/types/steam'
import type { SteamPollStateEvent } from 'common/types/ipc/sidecarInternal'
import type { ManagerDeps } from 'backend/services/types'
import {
  registerSteamPollEventFlows,
  type PollAckReply
} from '../steamPollEventRegistration'

type Handler = (event: unknown, ...args: unknown[]) => Promise<PollAckReply>

function game(over: Partial<SteamGameInfo> = {}): SteamGameInfo {
  return {
    app_name: '480',
    runner: 'steam',
    title: 'Spacewar',
    is_installed: false,
    install: {},
    ...over
  } as SteamGameInfo
}

function setup(seed: SteamGameInfo | null = game()) {
  const sent: Array<[string, unknown]> = []
  const deps: ManagerDeps = createTestManagerDeps({
    sendFrontendMessage: ((channel: string, payload: unknown) => {
      sent.push([channel, payload])
    }) as ManagerDeps['sendFrontendMessage']
  })
  if (seed) deps.steamSession.libraryState.library.set(seed.app_name, seed)
  let handler: Handler | undefined
  const refreshInstallState = jest.fn(() => Promise.resolve(undefined))
  registerSteamPollEventFlows({
    ipc: {
      handle: (channel: string, h: Handler) => {
        if (channel === 'steamPollStateEvent') handler = h
      }
    } as never,
    manager: () => deps,
    refreshInstallState
  })
  const send = (ev: SteamPollStateEvent) => handler!({}, ev)
  const entry = () => deps.steamSession.libraryState.library.get('480')
  return { deps, sent, send, entry, refreshInstallState }
}

const installed: SteamPollStateEvent = {
  kind: 'installed',
  appId: '480',
  seq: 1,
  source: 'native',
  installPath: '/steam/480',
  sizeOnDisk: '2048',
  buildid: '77'
}

beforeEach(() => {
  for (const fn of ['logWarning', 'logError', 'logInfo', 'logDebug'] as const) {
    jest.spyOn(logger, fn).mockImplementation(() => undefined)
  }
})
afterEach(() => jest.restoreAllMocks())

describe('steamPollStateEvent handler', () => {
  test('installed builds the install record, persists, pushes and replies title + macArchCheck', async () => {
    const { deps, sent, send, entry } = setup()
    const reply = await send(installed)
    expect(reply).toEqual({
      applied: true,
      title: 'Spacewar',
      macArchCheck: isMac
    })
    expect(entry()?.is_installed).toBe(true)
    expect(entry()?.install?.install_path).toBe('/steam/480')
    expect(entry()?.install?.platform).toBe(installPlatformForSource('native'))
    expect(deps.stores.steam.steamLibraryStore.get('games', [])).toHaveLength(1)
    expect(sent.map(([c]) => c)).toEqual(['pushGameToLibrary'])
  })

  test('installed with no library entry replies applied without fabricating one', async () => {
    const { sent, send, entry } = setup(null)
    const reply = await send(installed)
    expect(reply.applied).toBe(true)
    expect(reply.title).toBe('')
    expect(entry()).toBeUndefined()
    expect(sent).toEqual([])
  })

  test('installed on a bottle source replies macArchCheck false', async () => {
    const { send } = setup()
    const reply = await send({ ...installed, source: 'bottle' })
    expect(reply.macArchCheck).toBe(false)
  })

  test('installIncomplete marks the entry resumable and not installed', async () => {
    const { send, entry, sent } = setup(game({ is_installed: true }))
    const reply = await send({
      kind: 'installIncomplete',
      appId: '480',
      seq: 2
    })
    expect(reply).toEqual({ applied: true, title: 'Spacewar' })
    expect(entry()?.is_installed).toBe(false)
    expect(entry()?.install?.steamResumePending).toBe(true)
    expect(sent.map(([c]) => c)).toEqual(['pushGameToLibrary'])
  })

  test('updateDone completed pushes the existing entry; not completed does not', async () => {
    const { send, sent } = setup()
    await send({ kind: 'updateDone', appId: '480', seq: 3, completed: true })
    expect(sent.map(([c]) => c)).toEqual(['pushGameToLibrary'])
    sent.length = 0
    const reply = await send({
      kind: 'updateDone',
      appId: '480',
      seq: 4,
      completed: false
    })
    expect(reply.applied).toBe(true)
    expect(sent).toEqual([])
  })

  test('uninstalled with no survivor flips the entry to not installed', async () => {
    const { send, entry } = setup(
      game({ is_installed: true, install: { install_path: '/x' } })
    )
    const reply = await send({
      kind: 'uninstalled',
      appId: '480',
      seq: 5,
      source: 'native',
      survivor: null
    })
    expect(reply.applied).toBe(true)
    expect(reply.bridgeAuthoritative).toBe(false)
    expect(entry()?.is_installed).toBe(false)
    expect(entry()?.install).toEqual({})
  })

  test('uninstalled with a survivor re-resolves install_path and stays installed', async () => {
    const { send, entry, sent } = setup(
      game({ is_installed: true, install: { install_path: '/old' } })
    )
    await send({
      kind: 'uninstalled',
      appId: '480',
      seq: 6,
      source: 'native',
      survivor: {
        source: 'bottle',
        installPath: '/bottle/480',
        sizeOnDisk: '10',
        buildid: null
      }
    })
    expect(entry()?.is_installed).toBe(true)
    expect(entry()?.install?.install_path).toBe('/bottle/480')
    expect(sent.map(([c]) => c)).toEqual(['pushGameToLibrary'])
  })

  test('bridgeUninstalled marks the bridge game uninstalled and clears the pill', async () => {
    const { send, entry, sent } = setup(game({ is_installed: true }))
    const reply = await send({
      kind: 'bridgeUninstalled',
      appId: '480',
      seq: 7
    })
    expect(reply.applied).toBe(true)
    expect(entry()?.is_installed).toBe(false)
    expect(sent.map(([c]) => c)).toEqual([
      'pushGameToLibrary',
      'gameStatusUpdate'
    ])
  })

  test('forcedWindowsViaBottleCleared clears the verdict and replies bridgeAuthoritative', async () => {
    const { deps, send } = setup()
    deps.stores.steam.steamMetadataStore.set('480', {
      art_cover: '',
      art_square: '',
      extra: { reqs: [] },
      forcedWindowsViaBottle: true
    } as never)
    const reply = await send({
      kind: 'forcedWindowsViaBottleCleared',
      appId: '480',
      seq: 8
    })
    expect(reply.bridgeAuthoritative).toBe(false)
    expect(
      deps.stores.steam.steamMetadataStore.get('480')?.forcedWindowsViaBottle
    ).toBe(false)
  })

  test('macArchVerdict persists the verdict and updates the library entry', async () => {
    const { deps, send, entry } = setup()
    const reply = await send({
      kind: 'macArchVerdict',
      appId: '480',
      seq: 9,
      verdict: '64'
    })
    expect(reply.applied).toBe(true)
    expect(deps.stores.steam.steamMetadataStore.get('480')?.mac_arch).toBe('64')
    expect(entry()?.mac_arch).toBe('64')
  })

  test('rearmSettled reconciles only when needsReconcile', async () => {
    const { send, refreshInstallState } = setup()
    await send({ kind: 'rearmSettled', seq: 10, needsReconcile: false })
    expect(refreshInstallState).not.toHaveBeenCalled()
    await send({ kind: 'rearmSettled', seq: 11, needsReconcile: true })
    expect(refreshInstallState).toHaveBeenCalledTimes(1)
  })

  test('C-WR-08 rearmSettled acks before the reconcile finishes, and a failed reconcile is logged', async () => {
    const { send, refreshInstallState } = setup()
    let finish!: () => void
    refreshInstallState.mockImplementationOnce(
      () =>
        new Promise<undefined>((r) => {
          finish = () => r(undefined)
        })
    )
    const reply = await send({
      kind: 'rearmSettled',
      seq: 1,
      needsReconcile: true
    })
    expect(reply).toEqual({ applied: true })
    expect(refreshInstallState).toHaveBeenCalledTimes(1)
    finish()

    refreshInstallState.mockImplementationOnce(() =>
      Promise.reject(new Error('scan failed'))
    )
    expect(
      await send({ kind: 'rearmSettled', seq: 2, needsReconcile: true })
    ).toEqual({ applied: true })
    await new Promise((r) => setImmediate(r))
    expect(logger.logWarning).toHaveBeenCalledWith(
      expect.stringContaining('rearmSettled reconcile failed'),
      expect.anything()
    )
  })

  test('C-WR-08 a raw empty or non-numeric sizeOnDisk is stored as 0 bytes', async () => {
    const { send, entry } = setup()
    expect((await send({ ...installed, sizeOnDisk: '' })).applied).toBe(true)
    const empty = entry()?.install?.install_size
    expect(
      (await send({ ...installed, seq: 2, sizeOnDisk: 'garbage' })).applied
    ).toBe(true)
    expect(entry()?.install?.install_size).toBe(empty)
    expect(String(empty)).not.toContain('NaN')
  })

  test('a throwing apply replies applied:false', async () => {
    const { deps, send } = setup()
    deps.stores.steam.steamLibraryStore.set = () => {
      throw new Error('disk full')
    }
    expect(await send(installed)).toEqual({ applied: false })
  })

  test('applying each kind twice yields the same state (idempotent)', async () => {
    const events: SteamPollStateEvent[] = [
      installed,
      { kind: 'installIncomplete', appId: '480', seq: 2 },
      {
        kind: 'uninstalled',
        appId: '480',
        seq: 3,
        source: 'native',
        survivor: null
      }
    ]
    for (const ev of events) {
      const { deps, send, entry } = setup()
      await send(ev)
      const once = JSON.stringify([
        entry(),
        deps.stores.steam.steamLibraryStore.get('games', [])
      ])
      await send(ev)
      expect(
        JSON.stringify([
          entry(),
          deps.stores.steam.steamLibraryStore.get('games', [])
        ])
      ).toBe(once)
    }
  })

  test('pushGameToLibrary is sent before the handler promise resolves', async () => {
    const { sent, send } = setup()
    const order: string[] = []
    const p = send(installed).then(() => order.push('resolve'))
    // the push already happened synchronously inside the apply
    order.push(...sent.map(([c]) => c))
    await p
    expect(order.indexOf('pushGameToLibrary')).toBeLessThan(
      order.indexOf('resolve')
    )
  })
})
