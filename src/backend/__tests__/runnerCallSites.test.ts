/**
 * The last TS call sites of the command runner (Phase 88.2, 88.2-22, D-02, D-07, the 82 amendment).
 *
 * - D-07: the managers' `stop()` ends a Rust-launched game through the `trackedKill` shim, with the same filters the TS
 *   `killTracked` took. The deps are the test builders', whose `runner` throws on any unscripted member, so a `stop()` that
 *   still reached the TS registry would fail here rather than pass quietly. The Steam direct launch keeps the TS
 *   `killTracked` (Phase 90's), and a source check pins that.
 * - D-02: the three auth runner calls pass the name of a Rust sanitizer, never a function.
 * - the 82 amendment: gog's deleted-folder call and the launcher's folder-missing prompt send `launch_ask_force_uninstall`.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { createLauncher } from 'backend/launcher'
import { createTestToolsSlices } from 'backend/testUtils/testServices'
import GOGGame from 'backend/storeManagers/gog/games'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { createTestManagerDeps } from 'backend/testUtils/testServices'
import type { ManagerDeps } from 'backend/services/types'
import LegendaryGame from 'backend/storeManagers/legendary/games'
import type { LegendaryAppName } from 'backend/storeManagers/legendary/commands/base'
import NileGame from 'backend/storeManagers/nile/games'
import SideloadGame from 'backend/storeManagers/sideload/games'

const BACKEND = join(__dirname, '..')
const source = (relative: string) =>
  stripSourceComments(readFileSync(join(BACKEND, relative), 'utf8'))

const WINE_SETTINGS = {
  wineVersion: { wineserver: '/nonexistent/wineserver' },
  winePrefix: '/nonexistent/prefix'
}

type Invoke = { channel: string; args: unknown[] }

/** Manager deps whose Rust transport records every request; every other collaborator is the builders' unscripted one. */
function rig() {
  const invokes: Invoke[] = []
  const deps = createTestManagerDeps({
    requestRustInvoke: ((channel: string, args: unknown[]) => {
      invokes.push({ channel, args })
      // launchSettingsFor asks Rust for the effective settings before it stops wine.
      if (channel === 'engine_launch_settings_get')
        return Promise.resolve(WINE_SETTINGS)
      return Promise.resolve(1)
    }) as unknown as ManagerDeps['requestRustInvoke']
  })
  return { deps, invokes }
}

const kills = (invokes: Invoke[]) =>
  invokes.filter((i) => i.channel === 'launch_tracked_kill').map((i) => i.args)

describe("the managers' stop() ends a Rust-launched game through trackedKill (D-07)", () => {
  it('legendary stop sends { runner: legendary, key: appName }', async () => {
    const { deps, invokes } = rig()
    await new LegendaryGame('app-l' as LegendaryAppName, deps).stop(false)
    expect(kills(invokes)).toEqual([[{ runner: 'legendary', key: 'app-l' }]])
  })

  it('nile stop sends { runner: nile, key: id }', async () => {
    const { deps, invokes } = rig()
    await new NileGame('app-n', deps).stop(false)
    expect(kills(invokes)).toEqual([[{ runner: 'nile', key: 'app-n' }]])
  })

  it('sideload stop sends the sideload filter, then the wine one for a non-native game', async () => {
    const { deps, invokes } = rig()
    const game = new SideloadGame('app-s', deps)
    jest.spyOn(game, 'getGameInfo').mockReturnValue({
      runner: 'sideload',
      app_name: 'app-s',
      install: { executable: '/games/s.exe' }
    } as never)
    jest.spyOn(game, 'isNative').mockReturnValue(false)
    jest.spyOn(game, 'getSettings').mockResolvedValue({
      wineVersion: { wineserver: '/nonexistent/wineserver' },
      winePrefix: '/nonexistent/prefix'
    } as never)
    const spawnAsync = jest.fn(() =>
      Promise.resolve({ code: 0, stdout: '', stderr: '' })
    )
    Object.assign(deps, { spawnAsync })

    await game.stop()

    expect(kills(invokes)).toEqual([
      [{ runner: 'sideload', key: 'app-s' }],
      [{ runner: 'wine', key: 'app-s' }]
    ])
  })

  it('sideload stop sends only the sideload filter for a native game', async () => {
    const { deps, invokes } = rig()
    const game = new SideloadGame('app-s', deps)
    jest.spyOn(game, 'getGameInfo').mockReturnValue({
      runner: 'sideload',
      app_name: 'app-s',
      install: { executable: '/games/s' }
    } as never)
    jest.spyOn(game, 'isNative').mockReturnValue(true)

    await game.stop()

    expect(kills(invokes)).toEqual([[{ runner: 'sideload', key: 'app-s' }]])
  })

  it('the three manager files no longer reach the TS registry', () => {
    for (const file of [
      'storeManagers/legendary/games.ts',
      'storeManagers/nile/games.ts',
      'storeManagers/sideload/games.ts'
    ]) {
      expect(source(file)).not.toMatch(/runner\s*\.\s*killTracked/)
    }
  })

  it("the Steam direct launch's stop keeps the TS killTracked (Phase 90's)", () => {
    const steam = source('storeManagers/steam/games.ts')
    expect(steam).toMatch(/this\.deps\.runner\.killTracked\(/)
    expect(steam).not.toMatch(/trackedKill/)
  })
})

describe('the auth runner calls pass the name of a Rust sanitizer (D-02, T-88.2-33)', () => {
  it('the option type is the two names, not a function', () => {
    expect(readFileSync(join(BACKEND, '../common/types.ts'), 'utf8')).toMatch(
      /logSanitizer\?: 'gogAuth' \| 'nileAuth'/
    )
  })

  it('gog passes gogAuth at both auth calls and nile passes nileAuth at its one', () => {
    const gog = source('storeManagers/gog/user.ts')
    const nile = source('storeManagers/nile/user.ts')
    expect(gog.match(/logSanitizer: 'gogAuth'/g)).toHaveLength(2)
    expect(nile.match(/logSanitizer: 'nileAuth'/g)).toHaveLength(1)
    // No call hands the runner a function any more.
    expect(gog).not.toMatch(/logSanitizer:\s*authLogSanitizer/)
    expect(nile).not.toMatch(/logSanitizer:\s*authLogSanitizer/)
  })
})

describe('the folder-missing prompt is asked in Rust through askForceUninstall (the 82 amendment)', () => {
  const asks = (invokes: Invoke[]) =>
    invokes.filter((i) => i.channel === 'launch_ask_force_uninstall')

  it("gog's launch of a game whose folder is gone sends { runner: gog, appName } and returns false", async () => {
    const { deps, invokes } = rig()
    const game = new GOGGame('gog-1', deps)
    jest.spyOn(game, 'getSettings').mockResolvedValue({} as never)
    jest.spyOn(game, 'getGameInfo').mockReturnValue({
      runner: 'gog',
      app_name: 'gog-1',
      install: {
        install_path: join(BACKEND, 'definitely-not-here'),
        platform: 'windows'
      }
    } as never)

    const launched = await game.launch({} as never)

    expect(launched).toBe(false)
    expect(asks(invokes).map((i) => i.args)).toEqual([
      [{ runner: 'gog', appName: 'gog-1' }]
    ])
  })

  it("the launcher's folder-missing path asks before it reports done, then aborts", async () => {
    const order: string[] = []
    const invokes: Invoke[] = []
    const base = createTestToolsSlices()
    const launcher = createLauncher({
      ...base,
      requestRustInvoke: ((channel: string, args: unknown[]) => {
        invokes.push({ channel, args })
        order.push(channel)
        return Promise.resolve(1)
      }) as unknown as ManagerDeps['requestRustInvoke'],
      sendFrontendMessage: ((channel: string, payload: { status?: string }) => {
        if (channel === 'gameStatusUpdate')
          order.push(`status:${payload.status}`)
      }) as unknown as ManagerDeps['sendFrontendMessage'],
      libraryManagers: {
        gog: {
          getGame: () => ({
            getGameInfo: () => ({
              app_name: 'gog-1',
              install: { install_path: join(BACKEND, 'definitely-not-here') }
            })
          })
        }
      } as never,
      launchHooks: { gog: {} } as never,
      commandRunner: {} as never,
      runner: {} as never,
      spawnAsync: (() => Promise.reject(new Error('unscripted'))) as never,
      stores: {} as never
    })

    const result = await launcher.launchEventCallback({
      appName: 'gog-1',
      runner: 'gog'
    })

    expect(result).toEqual({ status: 'abort' })
    expect(asks(invokes).map((i) => i.args)).toEqual([
      [{ runner: 'gog', appName: 'gog-1' }]
    ])
    expect(order).toEqual(['launch_ask_force_uninstall', 'status:done'])
  })

  it('no non-test file still imports errorHandler or askForceUninstall from backend/utils', () => {
    for (const file of ['launcher.ts', 'storeManagers/gog/games.ts']) {
      const text = source(file)
      expect(text).not.toMatch(/\berrorHandler\b/)
      expect(text).not.toMatch(
        /import\s*{[^}]*\baskForceUninstall\b[^}]*}\s*from\s*['"](\.\/utils|\.\.\/\.\.\/utils|backend\/utils)['"]/
      )
    }
  })
})
