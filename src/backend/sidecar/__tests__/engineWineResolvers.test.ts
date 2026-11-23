/**
 * The scheduled resolvers of the engine and wine services (Phase 87, D-23): each renderer channel makes
 * exactly one typed Rust call, carrying the tool it names and the game's merged settings, and is
 * registered once, here. The shape (consts then one returned call) and the channel each row sends are
 * pinned separately by `engineWineShimSchedule.test.ts`; this file pins the behaviour: which channel, with
 * which arguments, what the renderer gets back, and that a Rust refusal reaches the renderer.
 */
import { RUST_WINE_DXVK_INSTALL_REMOVE } from 'common/types/sidecarTransport'
import { defined } from 'backend/testUtils/indexed'

import { createIpcRegistry, type IpcRegistry } from '../ipcRegistry'
import {
  registerEngineWineResolvers,
  toggleDXVK,
  type EngineWineResolverDeps
} from '../engineWineResolvers'

const SETTINGS = { winePrefix: '/prefix', marker: 'merged-game-settings' }

function makeDeps(answer: unknown | Error = true): EngineWineResolverDeps & {
  registry: IpcRegistry
  calls: Array<[string, unknown[]]>
  settingsFor: string[]
} {
  const calls: Array<[string, unknown[]]> = []
  const settingsFor: string[] = []
  const requestRustInvoke = ((channel: string, args: unknown[]) => {
    calls.push([channel, args])
    return answer instanceof Error
      ? Promise.reject(answer)
      : Promise.resolve(answer)
  }) as unknown as EngineWineResolverDeps['requestRustInvoke']
  const registry = createIpcRegistry()
  return {
    registry,
    ipc: registry,
    gameConfigs: {
      get: (appName: string) => {
        settingsFor.push(appName)
        return { getSettings: () => Promise.resolve(SETTINGS) }
      }
    } as unknown as EngineWineResolverDeps['gameConfigs'],
    requestRustInvoke,
    calls,
    settingsFor
  }
}

describe('toggleDXVK', () => {
  it('reads the game settings once and makes the one typed call with the dxvk tool', async () => {
    const deps = makeDeps(true)
    const result = await toggleDXVK(deps, {
      appName: 'game-1',
      action: 'backup'
    })
    expect(result).toBe(true)
    expect(deps.settingsFor).toEqual(['game-1'])
    expect(deps.calls).toEqual([
      [
        RUST_WINE_DXVK_INSTALL_REMOVE,
        [{ settings: SETTINGS, tool: 'dxvk', action: 'backup' }]
      ]
    ])
  })

  it('forwards a restore as a restore, not a backup', async () => {
    const deps = makeDeps(false)
    expect(
      await toggleDXVK(deps, { appName: 'game-1', action: 'restore' })
    ).toBe(false)
    expect(deps.calls[0]?.[1]).toEqual([
      { settings: SETTINGS, tool: 'dxvk', action: 'restore' }
    ])
  })

  it("lets Rust's refusal reach the renderer instead of swallowing it", async () => {
    const deps = makeDeps(new Error('wine_dxvk_install_remove:download'))
    await expect(
      toggleDXVK(deps, { appName: 'game-1', action: 'backup' })
    ).rejects.toThrow('wine_dxvk_install_remove:download')
  })
})

describe('registerEngineWineResolvers', () => {
  it('registers toggleDXVK as an invoke handle that resolves the first argument', async () => {
    const deps = makeDeps(true)
    registerEngineWineResolvers(deps)
    const handler = defined(
      deps.registry.handlerMap().get('toggleDXVK'),
      'toggleDXVK handle'
    )
    expect(
      await handler(undefined, { appName: 'game-2', action: 'backup' })
    ).toBe(true)
    expect(deps.settingsFor).toEqual(['game-2'])
    expect(deps.calls).toHaveLength(1)
    expect(deps.registry.listenerMap().has('toggleDXVK')).toBe(false)
  })
})
