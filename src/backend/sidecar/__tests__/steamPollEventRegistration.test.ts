/**
 * Phase 80 Plan 11: the steamPollStateEvent handler applies each Rust state event through the
 * existing TS functions, replies with the ack fields, and is idempotent and ordered (R1, R2).
 */
import * as logger from 'backend/logger'

import { validateInbound } from '../ipcValidation'
import { createTestManagerDeps } from 'backend/testUtils/testServices'
import { isMac } from 'backend/constants/environment'
import { installPlatformForSource } from '../../storeManagers/steam/library/installRoot'
import type { SteamGameInfo } from 'common/types/steam'
import type { SteamPollStateEvent } from 'common/types/ipc/sidecarInternal'
import type { ManagerDeps } from 'backend/services/types'
import {
  pendingAdoptionStoreFrom,
  readPendingAdoption,
  recordPendingAdoption
} from '../../storeManagers/steam/macSteamAdoption'
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
  registerSteamPollEventFlows({
    ipc: {
      handle: (channel: string, h: Handler) => {
        if (channel === 'steamPollStateEvent') handler = h
      }
    } as never,
    manager: () => deps
  })
  const send = (ev: SteamPollStateEvent) => handler!({}, ev)
  const entry = () => deps.steamSession.libraryState.library.get('480')
  return { deps, sent, send, entry }
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

  test('D-11: a rearmSettled payload is rejected by the inbound schema (the boot re-arm is gone)', () => {
    const verdict = validateInbound('steamPollStateEvent', 'invoke', [
      { kind: 'rearmSettled', seq: 10, needsReconcile: true }
    ])
    expect(verdict.ok).toBe(false)
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

  describe('seq guard (C-IN-04)', () => {
    const uninstalled = (seq: number): SteamPollStateEvent => ({
      kind: 'uninstalled',
      appId: '480',
      seq,
      source: 'native',
      survivor: null
    })

    test('an older installed after a newer uninstalled is consumed without a write', async () => {
      const { send, entry, sent } = setup(game({ is_installed: true }))
      await send(uninstalled(9))
      expect(entry()?.is_installed).toBe(false)
      sent.length = 0
      const reply = await send({ ...installed, seq: 5 })
      expect(reply).toEqual({ applied: true, title: 'Spacewar' })
      expect(entry()?.is_installed).toBe(false)
      expect(sent).toEqual([])
    })

    test('the install-state group shares one seq per app, across kinds', async () => {
      const { send, entry } = setup()
      await send({ ...installed, seq: 10 })
      await send({ kind: 'installIncomplete', appId: '480', seq: 8 })
      expect(entry()?.is_installed).toBe(true)
      expect(entry()?.install?.steamResumePending).toBeUndefined()
    })

    test('other kinds are guarded per (appId, kind) and do not block the install state', async () => {
      const { send, sent } = setup()
      await send({ kind: 'updateDone', appId: '480', seq: 4, completed: true })
      sent.length = 0
      // An older updateDone is consumed.
      expect(
        await send({
          kind: 'updateDone',
          appId: '480',
          seq: 3,
          completed: true
        })
      ).toEqual({ applied: true, title: 'Spacewar' })
      expect(sent).toEqual([])
      // A lower-seq installed still applies: it is a different key.
      await send({ ...installed, seq: 2 })
      expect(sent.map(([c]) => c)).toEqual(['pushGameToLibrary'])
    })

    test('another app is not affected', async () => {
      const { deps, send } = setup()
      deps.steamSession.libraryState.library.set(
        '481',
        game({ app_name: '481', title: 'Other' })
      )
      await send({ ...installed, seq: 50 })
      await send({ ...installed, appId: '481', seq: 3 })
      expect(
        deps.steamSession.libraryState.library.get('481')?.is_installed
      ).toBe(true)
    })

    test('a failed apply records no seq, so the retry of the same event applies', async () => {
      const { deps, send, entry } = setup()
      jest
        .spyOn(deps.stores.steam.steamLibraryStore, 'set')
        .mockImplementationOnce(() => {
          throw new Error('disk full')
        })
      expect(await send(installed)).toEqual({ applied: false })
      expect((await send(installed)).applied).toBe(true)
      expect(entry()?.is_installed).toBe(true)
    })

    test('the guard is per registration (a new sidecar session starts fresh)', async () => {
      const first = setup()
      await first.send({ ...installed, seq: 100 })
      const second = setup()
      await second.send({ ...installed, seq: 1 })
      expect(second.entry()?.is_installed).toBe(true)
    })
  })

  describe('adoptionState (Phase 81 D-07)', () => {
    const adoption = (
      adopted: boolean,
      seq: number,
      signedIn: boolean | null = null
    ): SteamPollStateEvent => ({
      kind: 'adoptionState',
      appId: '480',
      seq,
      adopted,
      signedIn
    })
    const seedRecord = (deps: ManagerDeps) =>
      recordPendingAdoption(
        '480',
        {
          steamPid: 4242,
          manifestPath: '/fake/steamapps/appmanifest_480.acf',
          baseline: { content: 'x', mtimeMs: 1 },
          recordedAt: 1
        },
        pendingAdoptionStoreFrom(deps)
      )

    test('adopted with a stored record clears it and replies applied with the title', async () => {
      const { deps, send } = setup()
      seedRecord(deps)
      expect(
        readPendingAdoption('480', pendingAdoptionStoreFrom(deps))
      ).toBeDefined()
      const reply = await send(adoption(true, 1, true))
      expect(reply).toEqual({ applied: true, title: 'Spacewar' })
      expect(
        readPendingAdoption('480', pendingAdoptionStoreFrom(deps))
      ).toBeUndefined()
    })

    const statusPushes = (sent: Array<[string, unknown]>) =>
      sent.filter(([c]) => c === 'steamAdoptionStatusChanged').map(([, p]) => p)

    test('a signed-out reading is cached and pushed once as pending with steamSignedIn false (D-03)', async () => {
      const { deps, sent, send } = setup()
      seedRecord(deps)
      const reply = await send(adoption(false, 1, false))
      expect(reply).toEqual({ applied: true, title: 'Spacewar' })
      expect(deps.steamInstallRuntime.adoption.signedIn.get('480')).toBe(false)
      expect(statusPushes(sent)).toEqual([
        { appName: '480', pending: true, steamSignedIn: false, seq: 1 }
      ])
      // The record stays: only adopted:true clears it.
      expect(
        readPendingAdoption('480', pendingAdoptionStoreFrom(deps))
      ).toBeDefined()
    })

    test('a later signed-in reading pushes again with a higher seq (D-03)', async () => {
      const { deps, sent, send } = setup()
      seedRecord(deps)
      await send(adoption(false, 1, false))
      await send(adoption(false, 2, true))
      expect(statusPushes(sent)).toEqual([
        { appName: '480', pending: true, steamSignedIn: false, seq: 1 },
        { appName: '480', pending: true, steamSignedIn: true, seq: 2 }
      ])
    })

    test('adopted pushes pending:false once and drops the cached reading (D-07)', async () => {
      const { deps, sent, send } = setup()
      seedRecord(deps)
      await send(adoption(false, 1, false))
      sent.length = 0
      await send(adoption(true, 2, true))
      expect(statusPushes(sent)).toEqual([
        { appName: '480', pending: false, steamSignedIn: null, seq: 2 }
      ])
      expect(deps.steamInstallRuntime.adoption.signedIn.has('480')).toBe(false)
    })

    test('a stale adoptionState event is consumed without a push', async () => {
      const { deps, sent, send } = setup()
      seedRecord(deps)
      await send(adoption(false, 5, false))
      sent.length = 0
      const reply = await send(adoption(false, 4, true))
      expect(reply.applied).toBe(true)
      expect(statusPushes(sent)).toEqual([])
      expect(deps.steamInstallRuntime.adoption.signedIn.get('480')).toBe(false)
    })

    test('adopted with no record replies applied and writes nothing', async () => {
      const { deps, send } = setup()
      const store = pendingAdoptionStoreFrom(deps)
      const set = jest.spyOn(store, 'set')
      const reply = await send(adoption(true, 1))
      expect(reply.applied).toBe(true)
      expect(set).not.toHaveBeenCalled()
      expect(readPendingAdoption('480', store)).toBeUndefined()
    })

    test('not adopted leaves the record untouched and replies applied', async () => {
      const { deps, send } = setup()
      seedRecord(deps)
      const reply = await send(adoption(false, 1, false))
      expect(reply.applied).toBe(true)
      expect(
        readPendingAdoption('480', pendingAdoptionStoreFrom(deps))
      ).toBeDefined()
      pendingAdoptionStoreFrom(deps).delete('480')
    })

    test('a stale seq is answered applied without clearing, and the kind is guarded per (appId, kind)', async () => {
      const { deps, send } = setup()
      await send(adoption(false, 5))
      seedRecord(deps)
      const stale = await send(adoption(true, 4))
      expect(stale).toEqual({ applied: true, title: 'Spacewar' })
      expect(
        readPendingAdoption('480', pendingAdoptionStoreFrom(deps))
      ).toBeDefined()
      // An install-state event with a lower seq still applies: adoptionState is not in that group.
      await send({ ...installed, seq: 2 })
      expect(
        readPendingAdoption('480', pendingAdoptionStoreFrom(deps))
      ).toBeDefined()
      expect((await send(adoption(true, 6))).applied).toBe(true)
      expect(
        readPendingAdoption('480', pendingAdoptionStoreFrom(deps))
      ).toBeUndefined()
    })
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
