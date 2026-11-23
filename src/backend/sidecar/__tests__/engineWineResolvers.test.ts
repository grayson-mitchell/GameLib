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
  toggleDXVKNVAPI,
  toggleVKD3D,
  type EngineWineResolverDeps
} from '../engineWineResolvers'

const SETTINGS = { winePrefix: '/prefix', marker: 'merged-game-settings' }

function makeDeps(answer: unknown = true): EngineWineResolverDeps & {
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

// T-34.5-31: the three toggle bodies differ by one string literal, so a copy-paste that swapped it would
// install the wrong component with no other failure. Each is proven to send its own tool and no neighbour's.
describe.each([
  ['toggleDXVKNVAPI', toggleDXVKNVAPI, 'dxvk-nvapi'],
  ['toggleVKD3D', toggleVKD3D, 'vkd3d']
] as const)('%s', (_name, resolver, tool) => {
  it(`reads the game settings once and sends the ${tool} tool in the one typed call`, async () => {
    const deps = makeDeps(true)
    expect(await resolver(deps, { appName: 'game-3', action: 'backup' })).toBe(
      true
    )
    expect(deps.settingsFor).toEqual(['game-3'])
    expect(deps.calls).toEqual([
      [
        RUST_WINE_DXVK_INSTALL_REMOVE,
        [{ settings: SETTINGS, tool, action: 'backup' }]
      ]
    ])
  })

  it('forwards a restore as a restore and lets a Rust refusal reach the renderer', async () => {
    const deps = makeDeps(false)
    expect(await resolver(deps, { appName: 'game-3', action: 'restore' })).toBe(
      false
    )
    expect(deps.calls[0]?.[1]).toEqual([
      { settings: SETTINGS, tool, action: 'restore' }
    ])
    const refusing = makeDeps(new Error('wine_dxvk_install_remove:download'))
    await expect(
      resolver(refusing, { appName: 'game-3', action: 'backup' })
    ).rejects.toThrow('wine_dxvk_install_remove:download')
  })
})

describe('registerEngineWineResolvers', () => {
  it('registers the three DXVK toggles once each as invoke handles that resolve the first argument', async () => {
    const deps = makeDeps(true)
    registerEngineWineResolvers(deps)
    const tools: Record<string, string> = {
      toggleDXVK: 'dxvk',
      toggleDXVKNVAPI: 'dxvk-nvapi',
      toggleVKD3D: 'vkd3d'
    }
    for (const [channel, tool] of Object.entries(tools)) {
      const handler = defined(
        deps.registry.handlerMap().get(channel),
        `${channel} handle`
      )
      deps.calls.length = 0
      expect(
        await handler(undefined, { appName: 'game-2', action: 'backup' })
      ).toBe(true)
      expect(deps.calls).toEqual([
        [
          RUST_WINE_DXVK_INSTALL_REMOVE,
          [{ settings: SETTINGS, tool, action: 'backup' }]
        ]
      ])
      expect(deps.registry.listenerMap().has(channel)).toBe(false)
    }
    // Nothing else is registered here: a channel has one owner (D-06).
    expect([...deps.registry.handlerMap().keys()].sort()).toEqual(
      Object.keys(tools).sort()
    )
  })
})
