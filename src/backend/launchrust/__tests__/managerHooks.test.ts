/**
 * The ManagerHooks handler (Phase 88.2, 88.2-20, D-26): `registerLaunchManagerHooks` answers the Rust shell's
 * `launchManagerCall` (`[op, { runner, appName }]`, op `game_title` or `force_uninstall`) from the library managers. The
 * shell's end of the call is `SidecarManagerHooks` (88.2-18); the frame is validated by the sidecar's boundary and again here.
 */
import { sidecarInternalInvokeArgs } from 'common/types/ipc/sidecarInternal'
import type { StoreManagers } from 'backend/services/types'
import { createIpcRegistry } from 'backend/sidecar/ipcRegistry'

import { registerLaunchManagerHooks } from '../runner'

interface FakeGame {
  getGameInfo: jest.Mock
  forceUninstall: jest.Mock
}

function fakeGame(title: string | undefined): FakeGame {
  return {
    getGameInfo: jest.fn(() => (title === undefined ? {} : { title })),
    forceUninstall: jest.fn(async () => ({ status: 'done' }))
  }
}

/** A manager table whose every runner answers `game` for any app name, and records the asks. */
function managersOver(game: FakeGame) {
  const getGame = jest.fn(() => game)
  const library = Object.fromEntries(
    ['gog', 'legendary', 'nile', 'sideload', 'steam'].map((runner) => [
      runner,
      { getGame }
    ])
  ) as unknown as StoreManagers['library']
  return { library, getGame }
}

function registered(game: FakeGame) {
  const ipc = createIpcRegistry()
  const managers = managersOver(game)
  registerLaunchManagerHooks(ipc, { libraryManagers: managers.library })
  const handler = ipc.getHandler('launchManagerCall')
  if (!handler) throw new Error('launchManagerCall was not registered')
  return {
    ipc,
    getGame: managers.getGame,
    call: (...args: unknown[]) => Promise.resolve(handler(undefined, ...args))
  }
}

describe('registerLaunchManagerHooks (88.2-20)', () => {
  it('registers the one launchManagerCall handler, and its args schema is the sidecar internal one', () => {
    const { ipc } = registered(fakeGame('T'))
    expect(ipc.has('launchManagerCall')).toBe(true)
    expect(
      sidecarInternalInvokeArgs.launchManagerCall.safeParse([
        'game_title',
        { runner: 'gog', appName: 'a' }
      ]).success
    ).toBe(true)
  })

  it('game_title answers the manager title for the runner and app the call names', async () => {
    const game = fakeGame('Some Game')
    const { call, getGame } = registered(game)
    await expect(
      call('game_title', { runner: 'legendary', appName: 'some-app' })
    ).resolves.toBe('Some Game')
    expect(getGame).toHaveBeenCalledTimes(1)
    expect(getGame).toHaveBeenCalledWith('some-app')
    expect(game.forceUninstall).not.toHaveBeenCalled()
  })

  it('force_uninstall calls the manager once and answers once it is done', async () => {
    const game = fakeGame('Some Game')
    const { call, getGame } = registered(game)
    await expect(
      call('force_uninstall', { runner: 'gog', appName: 'some-app' })
    ).resolves.toBe(true)
    expect(game.forceUninstall).toHaveBeenCalledTimes(1)
    expect(getGame).toHaveBeenCalledWith('some-app')
    expect(game.getGameInfo).not.toHaveBeenCalled()
  })

  it('a manager that throws rejects the call, so the shell answers its own hook failure', async () => {
    const game = fakeGame('T')
    game.forceUninstall.mockRejectedValue(new Error('disk gone'))
    const { call } = registered(game)
    await expect(
      call('force_uninstall', { runner: 'gog', appName: 'a' })
    ).rejects.toThrow('disk gone')
  })
})
