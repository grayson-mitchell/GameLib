/**
 * The shortcut resolvers (Phase 94 Plans 11 and 22, 86 D-24): each gathers the inputs only TypeScript holds
 * (the game's info, the settings, a GOG store executable and product icon) as `const` declarations and makes
 * exactly one `requestRustInvoke` call; `registerShortcutsResolvers` installs the renderer-facing handles. The
 * path rules, the writers and the Steam `shortcuts.vdf` edit are Rust's (`gamelib-shortcuts`, pinned by its
 * golden replay); this suite pins what the TypeScript sends.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  RUST_SHORTCUTS_ADD,
  RUST_SHORTCUTS_EXIST,
  RUST_SHORTCUTS_REMOVE,
  RUST_SHORTCUTS_STEAM_ADD,
  RUST_SHORTCUTS_STEAM_IS_ADDED,
  RUST_SHORTCUTS_STEAM_REMOVE
} from 'common/types/sidecarTransport'
import type { Runner } from 'common/types'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import { readTauriShellProductionSource } from 'backend/testUtils/tauriShellSource'
import {
  addShortcuts,
  removeNonSteamGame,
  removeShortcuts,
  resolveAddShortcut,
  resolveAddToSteam,
  resolveIsAddedToSteam,
  resolveRemoveFromSteam,
  resolveRemoveShortcut,
  resolveShortcutsExists,
  type ShortcutResolverDeps
} from 'backend/humbleshortcuts/shortcuts'
import type { Game } from 'common/types/game_manager'
import { registerShortcutsResolvers } from '../shortcutsResolvers'

type Call = [channel: string, args: unknown[]]

interface Rig {
  deps: ShortcutResolverDeps
  calls: Call[]
  lookups: string[]
  productApi: jest.Mock
  getExecutable: jest.Mock
}

const SETTINGS = {
  addDesktopShortcuts: true,
  addStartMenuShortcuts: false,
  addSteamShortcuts: false,
  defaultSteamPath: '/steam'
}

function rig(
  gameInfo: Record<string, unknown>,
  options: {
    answer?: unknown
    settings?: Record<string, unknown>
    icon?: string | null
  } = {}
): Rig {
  const calls: Call[] = []
  const lookups: string[] = []
  const getGame = (appName: string) => {
    lookups.push(appName)
    return { getGameInfo: () => gameInfo }
  }
  const productApi = jest.fn(async () =>
    options.icon === null
      ? null
      : {
          data: { images: { icon: options.icon ?? '//images.gog.test/i.png' } }
        }
  )
  const getExecutable = jest.fn(() => 'C:\\Games\\g1\\game.exe')
  const libraryManagers = {
    legendary: { getGame },
    sideload: { getGame },
    steam: { getGame },
    nile: { getGame },
    gog: { getGame, getProductApi: productApi, getExecutable }
  }
  const deps = {
    libraryManagers,
    config: { getSettings: () => ({ ...SETTINGS, ...options.settings }) },
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      calls.push([channel, args])
      return Promise.resolve(options.answer ?? true)
    }) as never
  } as unknown as ShortcutResolverDeps
  return { deps, calls, lookups, productApi, getExecutable }
}

/** Runs `body` with `process.platform` set to `platform`, restoring it afterwards. */
async function onPlatform(
  platform: NodeJS.Platform,
  body: () => Promise<void>
): Promise<void> {
  const original = Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', { value: platform })
  try {
    await body()
  } finally {
    if (original) Object.defineProperty(process, 'platform', original)
  }
}

const legendaryInfo = {
  app_name: 'AppName',
  runner: 'legendary',
  title: 'Plain Game',
  art_square: 'https://art.test/square.jpg',
  art_cover: 'https://art.test/cover.jpg',
  install: {
    is_dlc: false,
    install_path: '/games/plain',
    executable: 'bin/plain'
  }
}

const sent = (rigged: Rig): Record<string, unknown> => {
  expect(rigged.calls).toHaveLength(1)
  const [, args] = rigged.calls[0] as Call
  return JSON.parse(JSON.stringify(args))[0] as Record<string, unknown>
}

describe('resolveShortcutsExists', () => {
  it('sends one shortcuts_exist call carrying the library title, and resolves the Rust answer', async () => {
    const { deps, calls, lookups } = rig(
      { title: 'Plain Game' },
      { answer: true }
    )
    await expect(
      resolveShortcutsExists(deps, 'AppName', 'legendary')
    ).resolves.toBe(true)
    expect(calls).toEqual([
      [
        RUST_SHORTCUTS_EXIST,
        [{ appName: 'AppName', runner: 'legendary', title: 'Plain Game' }]
      ]
    ])
    expect(lookups).toEqual(['AppName'])
  })

  it('looks the game up in the library of its own runner', async () => {
    const { deps, calls } = rig({ title: 'GOG Game' }, { answer: false })
    await expect(resolveShortcutsExists(deps, 'g1', 'gog')).resolves.toBe(false)
    expect(calls[0]?.[1]).toEqual([
      { appName: 'g1', runner: 'gog', title: 'GOG Game' }
    ])
  })

  it('a game with no title (the empty getGameInfo sentinel) reaches Rust with no title key at all', async () => {
    const rigged = rig({}, { answer: false })
    await expect(
      resolveShortcutsExists(rigged.deps, 'AppName', 'legendary')
    ).resolves.toBe(false)
    // The frame is JSON: an undefined title is dropped, which the Rust arg struct reads as `None`.
    expect(sent(rigged)).toEqual({ appName: 'AppName', runner: 'legendary' })
  })

  it('carries a Rust rejection to the caller', async () => {
    const { deps } = rig({ title: 'T' })
    deps.requestRustInvoke = (() =>
      Promise.reject(new Error('shortcuts_exist:bad-args'))) as never
    await expect(
      resolveShortcutsExists(deps, 'AppName', 'legendary')
    ).rejects.toThrow('shortcuts_exist:bad-args')
  })
})

describe('resolveAddShortcut', () => {
  it('sends one shortcuts_add call for a sideload game with the library inputs and the settings, notify true', async () => {
    const rigged = rig({ ...legendaryInfo, runner: 'sideload' })
    await resolveAddShortcut(rigged.deps, 'AppName', 'sideload', true)
    const [channel] = rigged.calls[0] as Call
    expect(channel).toBe(RUST_SHORTCUTS_ADD)
    expect(sent(rigged)).toEqual({
      game: {
        appName: 'AppName',
        runner: 'sideload',
        title: 'Plain Game',
        isDlc: false,
        artSquare: 'https://art.test/square.jpg',
        artCover: 'https://art.test/cover.jpg',
        installPath: '/games/plain',
        executable: 'bin/plain',
        canAddSteamShortcut: true
      },
      settings: {
        addDesktopShortcuts: true,
        addStartMenuShortcuts: false,
        addSteamShortcuts: false,
        defaultSteamPath: '/steam'
      },
      fromMenu: true,
      notify: true
    })
    expect(rigged.productApi).not.toHaveBeenCalled()
    expect(rigged.getExecutable).not.toHaveBeenCalled()
  })

  it('a Steam game cannot add a Steam shortcut, a DLC is flagged, and an absent fromMenu is not sent', async () => {
    const rigged = rig({
      ...legendaryInfo,
      runner: 'steam',
      install: { is_dlc: true }
    })
    await resolveAddShortcut(rigged.deps, 'AppName', 'steam', undefined)
    const call = sent(rigged)
    expect(call.game).toMatchObject({
      runner: 'steam',
      isDlc: true,
      canAddSteamShortcut: false
    })
    expect(call).not.toHaveProperty('fromMenu')
  })

  it('a GOG game on Linux asks the product API for its icon only when the install ships none', async () => {
    await onPlatform('linux', async () => {
      const rigged = rig({
        ...legendaryInfo,
        runner: 'gog',
        app_name: 'g1',
        install: { is_dlc: false, install_path: join(tmpdir(), 'gamelib-none') }
      })
      await resolveAddShortcut(rigged.deps, 'g1', 'gog', false)
      expect(rigged.productApi).toHaveBeenCalledTimes(1)
      expect(rigged.getExecutable).not.toHaveBeenCalled()
      expect(
        (sent(rigged).game as Record<string, unknown>).gogProductIcon
      ).toBe('//images.gog.test/i.png')
    })
  })

  it('a GOG install that ships goggame-<id>.ico or support/icon.png never costs a product API call', async () => {
    const root = mkdtempSync(join(tmpdir(), 'gamelib-shortcuts-resolver-'))
    try {
      const withIco = join(root, 'ico')
      const withPng = join(root, 'png')
      mkdirSync(withIco)
      mkdirSync(join(withPng, 'support'), { recursive: true })
      writeFileSync(join(withIco, 'goggame-g1.ico'), '')
      writeFileSync(join(withPng, 'support', 'icon.png'), '')
      await onPlatform('linux', async () => {
        for (const installPath of [withIco, withPng]) {
          const rigged = rig({
            ...legendaryInfo,
            runner: 'gog',
            app_name: 'g1',
            install: { is_dlc: false, install_path: installPath }
          })
          await resolveAddShortcut(rigged.deps, 'g1', 'gog', false)
          expect(rigged.productApi).not.toHaveBeenCalled()
          expect(sent(rigged).game).not.toHaveProperty('gogProductIcon')
        }
      })
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('a failed product API call is no icon, never a failed add', async () => {
    await onPlatform('darwin', async () => {
      const rigged = rig({ ...legendaryInfo, runner: 'gog', app_name: 'g1' })
      rigged.productApi.mockRejectedValueOnce(new Error('offline'))
      await expect(
        resolveAddShortcut(rigged.deps, 'g1', 'gog', false)
      ).resolves.toBe(true)
      expect(sent(rigged).game).not.toHaveProperty('gogProductIcon')
      const none = rig(
        { ...legendaryInfo, runner: 'gog', app_name: 'g1' },
        { icon: null }
      )
      await resolveAddShortcut(none.deps, 'g1', 'gog', false)
      expect(sent(none).game).not.toHaveProperty('gogProductIcon')
    })
  })

  it('a GOG game on Windows sends the library manager executable and asks no icon API', async () => {
    await onPlatform('win32', async () => {
      const rigged = rig({ ...legendaryInfo, runner: 'gog', app_name: 'g1' })
      await resolveAddShortcut(rigged.deps, 'g1', 'gog', false)
      expect(rigged.getExecutable).toHaveBeenCalledWith('g1')
      expect(rigged.productApi).not.toHaveBeenCalled()
      expect(sent(rigged).game).toMatchObject({
        gogExecutable: 'C:\\Games\\g1\\game.exe'
      })
    })
  })

  it('a GOG game with no metadata sends no executable instead of failing the add', async () => {
    await onPlatform('win32', async () => {
      const rigged = rig({ ...legendaryInfo, runner: 'gog', app_name: 'g1' })
      rigged.getExecutable.mockImplementation(() => {
        throw new Error('No game metadata, cannot get executable')
      })
      await resolveAddShortcut(rigged.deps, 'g1', 'gog', false)
      expect(sent(rigged).game).not.toHaveProperty('gogExecutable')
    })
  })

  it('a game the library holds no title for is sent with an empty title, for Rust to refuse', async () => {
    const rigged = rig({ app_name: 'x', runner: 'legendary' })
    await resolveAddShortcut(rigged.deps, 'x', 'legendary', false)
    expect(sent(rigged).game).toMatchObject({ title: '', isDlc: false })
  })
})

describe('the other renderer resolvers', () => {
  it('resolveRemoveShortcut sends one shortcuts_remove call for the game, notify true, and no settings', async () => {
    const rigged = rig(legendaryInfo)
    await resolveRemoveShortcut(rigged.deps, 'AppName', 'legendary')
    const [channel] = rigged.calls[0] as Call
    expect(channel).toBe(RUST_SHORTCUTS_REMOVE)
    expect(sent(rigged)).toEqual({
      game: expect.objectContaining({
        appName: 'AppName',
        title: 'Plain Game',
        isDlc: false
      }),
      notify: true
    })
    expect(rigged.productApi).not.toHaveBeenCalled()
  })

  it.each([
    ['resolveAddToSteam', resolveAddToSteam, RUST_SHORTCUTS_STEAM_ADD],
    [
      'resolveRemoveFromSteam',
      resolveRemoveFromSteam,
      RUST_SHORTCUTS_STEAM_REMOVE
    ],
    [
      'resolveIsAddedToSteam',
      resolveIsAddedToSteam,
      RUST_SHORTCUTS_STEAM_IS_ADDED
    ]
  ] as const)(
    '%s sends one %s call carrying the game and the settings, answering what Rust answers',
    async (_name, resolver, channel) => {
      const rigged = rig(legendaryInfo, { answer: 'rust-answer' })
      await expect(resolver(rigged.deps, 'AppName', 'legendary')).resolves.toBe(
        'rust-answer'
      )
      expect(rigged.calls).toHaveLength(1)
      expect((rigged.calls[0] as Call)[0]).toBe(channel)
      expect(sent(rigged)).toEqual({
        game: expect.objectContaining({
          appName: 'AppName',
          runner: 'legendary'
        }),
        settings: expect.objectContaining({ defaultSteamPath: '/steam' })
      })
    }
  )

  it('only Add to Steam draws an icon here, so a GOG game costs a product API call there and nowhere else', async () => {
    await onPlatform('linux', async () => {
      const gog = {
        ...legendaryInfo,
        runner: 'gog',
        app_name: 'g1',
        install: { is_dlc: false }
      }
      for (const [resolver, calls] of [
        [resolveAddToSteam, 1],
        [resolveRemoveFromSteam, 0],
        [resolveIsAddedToSteam, 0],
        [resolveRemoveShortcut, 0]
      ] as const) {
        const rigged = rig(gog)
        await resolver(rigged.deps, 'g1', 'gog')
        expect(rigged.productApi).toHaveBeenCalledTimes(calls)
      }
    })
  })

  it('a GOG game on Windows adds Windows shortcuts with no icon API call unless Add to Steam is on', async () => {
    await onPlatform('win32', async () => {
      const gog = { ...legendaryInfo, runner: 'gog', app_name: 'g1' }
      const plain = rig(gog)
      await resolveAddShortcut(plain.deps, 'g1', 'gog', false)
      expect(plain.productApi).not.toHaveBeenCalled()
      const withSteam = rig(gog, { settings: { addSteamShortcuts: true } })
      await resolveAddShortcut(withSteam.deps, 'g1', 'gog', false)
      expect(withSteam.productApi).toHaveBeenCalledTimes(1)
    })
  })
})

describe('the store managers resolvers (same signature, notify false)', () => {
  const game = (info: Record<string, unknown>) =>
    ({ getGameInfo: () => info }) as unknown as Game

  it('addShortcuts reads the Game it is given, passes fromMenu and notify false, and never looks the game up', async () => {
    const rigged = rig({})
    await addShortcuts(rigged.deps, game(legendaryInfo), true)
    expect(rigged.lookups).toEqual([])
    const [channel] = rigged.calls[0] as Call
    expect(channel).toBe(RUST_SHORTCUTS_ADD)
    expect(sent(rigged)).toMatchObject({
      game: { appName: 'AppName', title: 'Plain Game' },
      fromMenu: true,
      notify: false
    })
  })

  it('addShortcuts rejects with what Rust rejects, so a partial failure reaches its caller', async () => {
    const rigged = rig({})
    rigged.deps.requestRustInvoke = (() =>
      Promise.reject(
        new Error('Could not write shortcuts: /d/Plain Game.lnk: denied')
      )) as never
    await expect(
      addShortcuts(rigged.deps, game(legendaryInfo))
    ).rejects.toThrow('Could not write shortcuts: /d/Plain Game.lnk: denied')
  })

  it('addShortcuts reads the game before its first await, as the TS did', async () => {
    const rigged = rig({})
    let read = false
    const late = {
      getGameInfo: () => {
        read = true
        return legendaryInfo
      }
    } as unknown as Game
    const pending = addShortcuts(rigged.deps, late)
    expect(read).toBe(true)
    await pending
  })

  it('removeShortcuts and removeNonSteamGame send their own channel with notify false and the Steam path', async () => {
    const remove = rig({})
    await removeShortcuts(remove.deps, game(legendaryInfo))
    expect((remove.calls[0] as Call)[0]).toBe(RUST_SHORTCUTS_REMOVE)
    expect(sent(remove)).toMatchObject({
      game: { appName: 'AppName' },
      notify: false
    })

    const steam = rig({})
    await removeNonSteamGame(steam.deps, game(legendaryInfo))
    expect((steam.calls[0] as Call)[0]).toBe(RUST_SHORTCUTS_STEAM_REMOVE)
    expect(sent(steam)).toMatchObject({
      game: { appName: 'AppName' },
      settings: { defaultSteamPath: '/steam' }
    })
  })
})

describe('registerShortcutsResolvers', () => {
  function register(rigged: Rig) {
    const ipc = createIpcRegistry()
    registerShortcutsResolvers({
      ipc,
      managers: { library: rigged.deps.libraryManagers } as never,
      config: rigged.deps.config,
      requestRustInvoke: rigged.deps.requestRustInvoke
    })
    return ipc
  }

  it('registers the renderer handles and nothing else, and shortcutsExists answers from Rust', async () => {
    const rigged = rig({ title: 'Plain Game' }, { answer: true })
    const ipc = register(rigged)
    expect([...ipc.handlerMap().keys()]).toEqual([
      'shortcutsExists',
      'addShortcut',
      'removeShortcut',
      'addToSteam',
      'removeFromSteam',
      'isAddedToSteam'
    ])
    expect([...ipc.listenerMap().keys()]).toEqual([])
    await expect(
      ipc.getHandler('shortcutsExists')?.(
        undefined,
        'AppName',
        'legendary' satisfies Runner
      )
    ).resolves.toBe(true)
    expect(rigged.calls).toHaveLength(1)
  })

  it('addShortcut answers the renderer with the disk re-check Rust reports, passing fromMenu through', async () => {
    for (const existsAfter of [true, false]) {
      const rigged = rig(legendaryInfo, {
        answer: { written: [], failed: [], refused: [], existsAfter }
      })
      const ipc = register(rigged)
      await expect(
        ipc.getHandler('addShortcut')?.(undefined, 'AppName', 'legendary', true)
      ).resolves.toBe(existsAfter)
      expect(sent(rigged)).toMatchObject({ fromMenu: true, notify: true })
    }
  })

  it('removeShortcut answers the renderer with the disk re-check Rust reports', async () => {
    for (const existsAfter of [true, false]) {
      const rigged = rig(legendaryInfo, {
        answer: { removed: [], refused: [], existsAfter }
      })
      const ipc = register(rigged)
      await expect(
        ipc.getHandler('removeShortcut')?.(undefined, 'AppName', 'legendary')
      ).resolves.toBe(existsAfter)
      expect(sent(rigged)).toMatchObject({ notify: true })
    }
  })

  it('addToSteam and isAddedToSteam answer a boolean, and removeFromSteam resolves undefined', async () => {
    const ipc = register(rig(legendaryInfo, { answer: true }))
    await expect(
      ipc.getHandler('addToSteam')?.(undefined, 'AppName', 'legendary')
    ).resolves.toBe(true)
    await expect(
      ipc.getHandler('isAddedToSteam')?.(undefined, 'AppName', 'legendary')
    ).resolves.toBe(true)
    const no = register(rig(legendaryInfo, { answer: false }))
    await expect(
      no.getHandler('addToSteam')?.(undefined, 'AppName', 'legendary')
    ).resolves.toBe(false)
    const gone = register(rig(legendaryInfo, { answer: null }))
    await expect(
      gone.getHandler('removeFromSteam')?.(undefined, 'AppName', 'legendary')
    ).resolves.toBeUndefined()
  })

  it('a Rust rejection reaches the renderer call, never a swallowed false', async () => {
    const rigged = rig(legendaryInfo)
    rigged.deps.requestRustInvoke = (() =>
      Promise.reject(new Error('shortcuts_steam_add:not-ready'))) as never
    const ipc = register(rigged)
    await expect(
      ipc.getHandler('addToSteam')?.(undefined, 'AppName', 'legendary')
    ).rejects.toThrow('shortcuts_steam_add:not-ready')
  })

  it('addShortcut treats a null fromMenu (JSON turns undefined into null) as absent', async () => {
    const rigged = rig(legendaryInfo, { answer: { existsAfter: true } })
    const ipc = register(rigged)
    await ipc.getHandler('addShortcut')?.(
      undefined,
      'AppName',
      'legendary',
      null
    )
    expect(sent(rigged)).not.toHaveProperty('fromMenu')
  })
})

// F-34.5-G6-08 discriminator (plan 34.5-45), carried over from the deleted `shortcutsFlows.test.ts`: a REAL
// `{id, kind:'invoke', channel:'addToSteam'}` frame through the REAL `startRpcServer` loop, asserting on the
// PARSED STDOUT FRAME rather than on the handler's own return value. `frame.ok === true`, an OWN `result` key
// (`JSON.stringify` OMITS a key whose value is `undefined`, so a dropped key and a `false` value are different
// failures) and `result === true`.
describe('F-34.5-G6-08 discriminator — addToSteam over the REAL RPC frame path', () => {
  const settle = (): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, 25))

  async function frameFor(answer: unknown): Promise<Record<string, unknown>> {
    const { PassThrough } = await import('node:stream')
    const rpc = (
      await import('../../testUtils/testSidecarRpc')
    ).createTestSidecarRpc()
    const ipc = createIpcRegistry()
    const rigged = rig(legendaryInfo, { answer })
    registerShortcutsResolvers({
      ipc,
      managers: { library: rigged.deps.libraryManagers } as never,
      config: rigged.deps.config,
      requestRustInvoke: rigged.deps.requestRustInvoke
    })
    const input = new PassThrough()
    const output = new PassThrough()
    const frames: Record<string, unknown>[] = []
    let buffer = ''
    output.on('data', (chunk: Buffer | string) => {
      buffer += chunk.toString()
      let newlineIndex = buffer.indexOf('\n')
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex)
        buffer = buffer.slice(newlineIndex + 1)
        if (line.trim().length > 0) {
          try {
            frames.push(JSON.parse(line) as Record<string, unknown>)
          } catch {
            // a non-JSON diagnostic line
          }
        }
        newlineIndex = buffer.indexOf('\n')
      }
    })
    rpc.start(input, output, ipc)
    input.write(
      `${JSON.stringify({
        id: 'g6-08-frame-1',
        kind: 'invoke',
        channel: 'addToSteam',
        args: ['AppName', 'legendary']
      })}\n`
    )
    await settle()
    const frame = frames.find((f) => f.id === 'g6-08-frame-1')
    expect(frame).toBeDefined()
    return frame as Record<string, unknown>
  }

  it("the emitted stdout frame has ok:true, an OWN 'result' key, and result === true", async () => {
    const frame = await frameFor(true)
    expect(frame.ok).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(frame, 'result')).toBe(true)
    expect(frame.result).toBe(true)
  })

  it('a false answer keeps its own result key too, so a refusal is never mistaken for a dropped value', async () => {
    const frame = await frameFor(false)
    expect(frame.ok).toBe(true)
    expect(Object.prototype.hasOwnProperty.call(frame, 'result')).toBe(true)
    expect(frame.result).toBe(false)
  })

  // Pins interfaces fact 2 (34.5-45-PLAN.md): the Rust leg's response branch can never deliver a genuine
  // `undefined` -- the smallest value it can produce is `null` (Serde's `unwrap_or(Value::Null)`). A
  // source-text assertion, so this floor cannot silently change without this test noticing.
  it("main.rs's response branch still floors a missing result at Value::Null (source-text pin)", () => {
    expect(readTauriShellProductionSource()).toContain('unwrap_or(Value::Null)')
  })
})
