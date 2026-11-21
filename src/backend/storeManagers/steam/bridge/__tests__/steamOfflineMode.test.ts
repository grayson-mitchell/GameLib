import { join } from 'node:path'
import { readSteamWantsOfflineMode } from '../steamOfflineMode'
import { steamRootDefault } from 'backend/config'
import { RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE } from 'common/types/sidecarTransport'
import * as loggerModule from 'backend/logger'

// No jest.mock (the backend-di-ceilings jestMock ratchet): the logger is spied on the real
// module and silenced; resetMocks (Jest 29) wipes spies, so it is re-armed per test.
beforeEach(() => {
  for (const fn of ['logInfo', 'logWarning', 'logError'] as const) {
    jest.spyOn(loggerModule, fn).mockImplementation(() => undefined)
  }
})

const HOME = '/Users/tester'

function rust(answer: () => Promise<unknown>) {
  return { requestRustInvoke: jest.fn(answer) }
}

describe('readSteamWantsOfflineMode', () => {
  test("reads the Steam root's config/loginusers.vdf through the Rust steamfiles op", async () => {
    const deps = rust(() => Promise.resolve({ wantsOfflineMode: false }))

    await expect(readSteamWantsOfflineMode(deps, HOME)).resolves.toBe(false)

    expect(deps.requestRustInvoke).toHaveBeenCalledWith(
      RUST_STEAMFILES_READ_LOGINUSERS_OFFLINE_MODE,
      [{ path: join(steamRootDefault(HOME), 'config', 'loginusers.vdf') }]
    )
  })

  test.each([true, false, null])(
    'passes the typed result through (%s)',
    async (value) => {
      const deps = rust(() => Promise.resolve({ wantsOfflineMode: value }))
      await expect(readSteamWantsOfflineMode(deps, HOME)).resolves.toBe(value)
    }
  )

  test('a rejected invoke is null, never a throw', async () => {
    const deps = rust(() => Promise.reject(new Error('rust down')))
    await expect(readSteamWantsOfflineMode(deps, HOME)).resolves.toBeNull()
  })
})
