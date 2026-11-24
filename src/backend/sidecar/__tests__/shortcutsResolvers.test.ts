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
  RUST_SHORTCUTS_EXIST
} from 'common/types/sidecarTransport'
import type { Runner } from 'common/types'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'
import {
  resolveAddShortcut,
  resolveShortcutsExists,
  type ShortcutResolverDeps
} from 'backend/humbleshortcuts/shortcuts'
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
      'addShortcut'
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
