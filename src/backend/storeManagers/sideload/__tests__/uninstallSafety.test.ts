/**
 * Phase 82 plan 07 (FND-02, D-22, D-12): a sideloaded game's "delete files" folder goes through
 * the Rust guard (kind sideload-folder) BEFORE the library entry is touched. A refusal leaves the
 * entry and the folder alone; the verdicts themselves (protected root, another known install,
 * other executables in the folder) are decided in gamelib-safety and tested there. Real tmp
 * folders, an injected safety transport, no module mocked.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { initHeadless } from 'backend/logger'
import SideloadGame from '../games'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { fakeSafetyRustInvoke } from 'backend/testUtils/fakeSafetyRust'
import type { RequestRustInvoke } from 'backend/host'

type Deps = ConstructorParameters<typeof SideloadGame>[1]

const ID = 'sideload-1'
const root = join(tmpdir(), `gamelib-sideload-uninstall-safety-${process.pid}`)
const paths = createTestAppPaths(root)
const folder = join(root, 'games', 'My Sideloaded Game')
const executable = join(folder, 'game.exe')

interface Harness {
  game: SideloadGame
  sent: [string, unknown][]
  library: { app_name: string }[]
  librarySet: unknown[][]
  notified: unknown[]
}

function build(
  requestRustInvoke: RequestRustInvoke,
  otherInstall?: { appName: string; path: string }
): Harness {
  const entry = {
    app_name: ID,
    title: 'My Sideloaded Game',
    runner: 'sideload',
    is_installed: true,
    install: { executable, platform: 'Windows' }
  }
  const library = [entry]
  const librarySet: unknown[][] = []
  const sent: [string, unknown][] = []
  const notified: unknown[] = []
  const deps = {
    paths,
    requestRustInvoke,
    sendFrontendMessage: (channel: string, payload: unknown) => {
      sent.push([channel, payload])
    },
    appRuntime: { events: { emit: () => true } },
    notifications: { show: (props: unknown) => void notified.push(props) },
    config: {
      getSettings: () => ({
        defaultInstallPath: '',
        sharedWinePrefix: '',
        defaultSteamPath: join(root, 'no-steam'),
        addDesktopShortcuts: false
      })
    },
    stores: {
      sideload: {
        libraryStore: {
          get: () => library,
          set: (_k: string, value: unknown[]) => void librarySet.push(value)
        }
      },
      kvs: { configStore: { get: () => [], set: () => undefined } }
    },
    libraryManagers: {
      sideload: {
        getListOfGames: () => library,
        getGame: () => ({ getGameInfo: () => entry })
      },
      gog: {
        getListOfGames: () =>
          otherInstall
            ? [
                {
                  app_name: otherInstall.appName,
                  is_installed: true,
                  install: { install_path: otherInstall.path }
                }
              ]
            : [],
        getGame: () => ({ getGameInfo: () => ({ title: 'Other Game' }) })
      }
    },
    runner: { killTracked: () => undefined }
  } as unknown as Deps
  return {
    game: new SideloadGame(ID, deps),
    sent,
    library,
    librarySet,
    notified
  }
}

const notices = (h: Harness) =>
  h.sent.filter(([channel]) => channel === 'removalRefusedNotice')

// The real logger needs its writer (the jest-contained fake HOME holds the file).
beforeAll(() => initHeadless())

beforeEach(() => {
  rmSync(root, { recursive: true, force: true })
  mkdirSync(folder, { recursive: true })
  writeFileSync(executable, 'x')
  writeFileSync(join(folder, 'save.dat'), 'x')
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('SideloadGame.uninstall delete-files guard (82-07, D-22)', () => {
  it('rejects when the check rejects: folder and library entry intact, refusal reported', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectCheck: true })
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({
      shouldRemovePrefix: false,
      deleteFiles: true
    })

    expect(res).toEqual({
      stdout: '',
      stderr: 'rust-invoke-failed',
      refused: true
    })
    expect(existsSync(executable)).toBe(true)
    expect(existsSync(join(folder, 'save.dat'))).toBe(true)
    expect(h.librarySet).toEqual([])
    expect(h.notified).toEqual([])
    expect(notices(h)).toEqual([
      [
        'removalRefusedNotice',
        {
          kind: 'uninstall',
          outcome: 'refused',
          reason: 'rust-invoke-failed',
          title: 'My Sideloaded Game',
          appName: ID,
          runner: 'sideload'
        }
      ]
    ])
  })

  it('a folder the guard calls shared is refused with folder-looks-shared and left intact', async () => {
    // A second .exe in the folder reads as `no` + folder-looks-shared (decided by the crate).
    const { requestRustInvoke } = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'folder-looks-shared'
    })
    writeFileSync(join(folder, 'other-tool.exe'), 'x')
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({
      shouldRemovePrefix: false,
      deleteFiles: true
    })

    expect(res.refused).toBe(true)
    expect(existsSync(join(folder, 'other-tool.exe'))).toBe(true)
    expect(h.librarySet).toEqual([])
    expect(notices(h)[0]?.[1]).toMatchObject({ reason: 'folder-looks-shared' })
  })

  it('asks about the folder as a sideload-folder with the game executable and its own key', async () => {
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      rejectCheck: true
    })
    const h = build(requestRustInvoke)

    await h.game.uninstall({ shouldRemovePrefix: false, deleteFiles: true })

    const req = calls[0]?.args[0] as {
      targets: unknown[]
      selfKey: string
      knownInstalls: { key: string }[]
    }
    expect(req.targets).toEqual([
      {
        id: 'folder',
        path: folder,
        kind: 'sideload-folder',
        executable: 'game.exe'
      }
    ])
    expect(req.selfKey).toBe(`sideload:${ID}`)
    // The caller's own entry is excluded from the known installs.
    expect(req.knownInstalls.map((k) => k.key)).not.toContain(`sideload:${ID}`)
  })

  it('a dedicated folder is removed, then the library entry is dropped', async () => {
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke()
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({
      shouldRemovePrefix: false,
      deleteFiles: true
    })

    expect(res).toEqual({ stderr: '', stdout: '' })
    expect(existsSync(folder)).toBe(false)
    expect(h.librarySet).toEqual([[]])
    expect(notices(h)).toEqual([])
    // 86-09: the recent-games entry is dropped through Rust. The fake rejects that channel, and the
    // uninstall still reports success: the bookkeeping failure is logged, never raised.
    expect(
      calls.filter((c) => c.channel === 'info_recent_remove').map((c) => c.args)
    ).toEqual([[{ appName: ID }]])
  })

  it('a delete that rejects after the check reports failed and keeps the library entry', async () => {
    const { requestRustInvoke } = fakeSafetyRustInvoke({ rejectRemove: true })
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({
      shouldRemovePrefix: false,
      deleteFiles: true
    })

    expect(res).toEqual({
      stdout: '',
      stderr: 'rust-invoke-failed',
      failed: true
    })
    expect(h.librarySet).toEqual([])
    expect(notices(h)[0]?.[1]).toMatchObject({
      outcome: 'failed',
      reason: 'rust-invoke-failed'
    })
  })

  it('IN-03: a second-stage guard that refuses reports refused, not failed, and keeps the entry and folder', async () => {
    const yes = fakeSafetyRustInvoke().requestRustInvoke
    const refusing = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'folder-looks-shared'
    }).requestRustInvoke
    let checks = 0
    const requestRustInvoke: RequestRustInvoke = (channel, args) =>
      channel === 'safety_check_removal' && ++checks === 2
        ? refusing(channel, args)
        : yes(channel, args)
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({
      shouldRemovePrefix: false,
      deleteFiles: true
    })

    expect(checks).toBe(2)
    expect(res).toEqual({
      stdout: '',
      stderr: 'folder-looks-shared',
      refused: true
    })
    expect(res.failed).toBeUndefined()
    expect(notices(h)).toHaveLength(1)
    expect(notices(h)[0]?.[1]).toMatchObject({
      outcome: 'refused',
      reason: 'folder-looks-shared'
    })
    expect(h.librarySet).toEqual([])
    expect(existsSync(executable)).toBe(true)
  })

  it('names the other game when another store has an install in the folder', async () => {
    const inner = fakeSafetyRustInvoke({
      checkVerdict: 'no',
      reason: 'nested-known-install'
    }).requestRustInvoke
    const requestRustInvoke: RequestRustInvoke = async (channel, args) => {
      const reply = (await inner(channel, args)) as {
        items: Record<string, unknown>[]
      }
      return {
        ...reply,
        items: reply.items.map((i) => ({ ...i, otherKey: 'gog:g1' }))
      }
    }
    const h = build(requestRustInvoke, {
      appName: 'g1',
      path: join(folder, 'gog-game')
    })

    await h.game.uninstall({ shouldRemovePrefix: false, deleteFiles: true })

    expect(notices(h)[0]?.[1]).toMatchObject({
      reason: 'nested-known-install',
      otherTitle: 'Other Game'
    })
    expect(existsSync(executable)).toBe(true)
  })

  it('without deleteFiles it never asks Rust for a safety check or a delete and just drops the library entry', async () => {
    const { requestRustInvoke, calls } = fakeSafetyRustInvoke({
      rejectCheck: true
    })
    const h = build(requestRustInvoke)

    const res = await h.game.uninstall({ shouldRemovePrefix: true })

    expect(res).toEqual({ stderr: '', stdout: '' })
    // No safety check or delete is asked: the Rust calls are the recent-games bookkeeping (86-09) and, since Phase 94
    // Plan 22, the two shortcut removals (`shortcuts_remove`, `shortcuts_steam_remove`; the fake rejects them and the
    // uninstall logs and carries on).
    expect(calls.map((c) => c.channel).sort()).toEqual(
      [
        'info_recent_remove',
        'shortcuts_remove',
        'shortcuts_steam_remove'
      ].sort()
    )
    expect(existsSync(executable)).toBe(true)
    expect(h.librarySet).toEqual([[]])
  })
})
