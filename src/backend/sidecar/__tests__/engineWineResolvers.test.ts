/**
 * The scheduled resolvers of the engine and wine services (Phase 87, D-23): each renderer channel makes
 * exactly one typed Rust call, carrying the tool it names and the game's merged settings, and is
 * registered once, here. The shape (consts then one returned call) and the channel each row sends are
 * pinned separately by `engineWineShimSchedule.test.ts`; this file pins the behaviour: which channel, with
 * which arguments, what the renderer gets back, and that a Rust refusal reaches the renderer.
 */
import {
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_WINETRICKS_APPLY,
  RUST_WINE_WINETRICKS_AVAILABLE,
  RUST_WINE_WINETRICKS_INSTALLED
} from 'common/types/sidecarTransport'
import { defined } from 'backend/testUtils/indexed'

import { createIpcRegistry, type IpcRegistry } from '../ipcRegistry'
import {
  registerEngineWineResolvers,
  toggleDXVK,
  toggleDXVKNVAPI,
  toggleVKD3D,
  winetricksApply,
  winetricksAvailable,
  winetricksInstalled,
  type EngineWineResolverDeps
} from '../engineWineResolvers'

const SETTINGS = { winePrefix: '/prefix', marker: 'merged-game-settings' }
const TOOL_SETTINGS = {
  winePrefix: '/bottle',
  marker: 'resolved-tool-settings'
}

function makeDeps(answer: unknown = true): EngineWineResolverDeps & {
  registry: IpcRegistry
  calls: Array<[string, unknown[]]>
  settingsFor: string[]
  targetFor: Array<[string, string, { ensureBottle: boolean }]>
} {
  const calls: Array<[string, unknown[]]> = []
  const settingsFor: string[] = []
  const targetFor: Array<[string, string, { ensureBottle: boolean }]> = []
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
    winetricksTarget: (runner, appName, opts) => {
      targetFor.push([runner, appName, opts])
      return Promise.resolve({
        runner,
        appName,
        settings: TOOL_SETTINGS
      } as never)
    },
    calls,
    settingsFor,
    targetFor
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
    // Nothing else is registered here beyond the DXVK toggles and the Winetricks family: a channel has one
    // owner (D-06).
    expect([...deps.registry.handlerMap().keys()].sort()).toEqual(
      [
        ...Object.keys(tools),
        'winetricksApply',
        'winetricksAvailable',
        'winetricksInstalled'
      ].sort()
    )
  })

  it('registers the three Winetricks resolvers once each, as invoke handles that carry the renderer arguments in order', async () => {
    const deps = makeDeps({ marker: 'rust-answer' })
    registerEngineWineResolvers(deps)
    const handle = (channel: string) =>
      defined(deps.registry.handlerMap().get(channel), `${channel} handle`)
    const verbs = ['vcrun2019', 'corefonts']
    expect(
      await handle('winetricksApply')(undefined, 'gog', 'app-1', verbs)
    ).toEqual({ marker: 'rust-answer' })
    await handle('winetricksAvailable')(undefined, 'sideload', 'app-2')
    await handle('winetricksInstalled')(undefined, 'legendary', 'app-3')
    expect(deps.calls.map(([channel]) => channel)).toEqual([
      RUST_WINE_WINETRICKS_APPLY,
      RUST_WINE_WINETRICKS_AVAILABLE,
      RUST_WINE_WINETRICKS_INSTALLED
    ])
    expect(deps.calls[0]?.[1][1]).toBe(verbs)
    for (const channel of [
      'winetricksApply',
      'winetricksAvailable',
      'winetricksInstalled'
    ]) {
      expect(deps.registry.listenerMap().has(channel)).toBe(false)
    }
  })
})

// 87-35 (D-23): the Winetricks family. Each resolver gathers the game's Wine environment as one const and makes the
// one typed call; the apply and the catalog read create the game's bottle, the installed-list read never does.
describe('winetricksApply', () => {
  it('resolves the target with a bottle-creating need and sends it with the verbs exactly as the renderer sent them', async () => {
    const deps = makeDeps({ accepted: true })
    const verbs = ['xact', 'corefonts']
    expect(await winetricksApply(deps, 'gog', 'app-1', verbs)).toEqual({
      accepted: true
    })
    expect(deps.targetFor).toEqual([['gog', 'app-1', { ensureBottle: true }]])
    expect(deps.calls).toEqual([
      [
        RUST_WINE_WINETRICKS_APPLY,
        [{ runner: 'gog', appName: 'app-1', settings: TOOL_SETTINGS }, verbs]
      ]
    ])
    // Identity: the guard in Rust judges the payload, the resolver does not re-shape it.
    expect(deps.calls[0]?.[1][1]).toBe(verbs)
  })

  it('sends a payload that is no list as it came (the Rust guard answers an invalid result, not this resolver)', async () => {
    const deps = makeDeps({ accepted: false, reason: 'invalid' })
    await winetricksApply(deps, 'gog', 'app-1', 'vcrun2019')
    expect(deps.calls[0]?.[1][1]).toBe('vcrun2019')
  })

  it("lets Rust's refusal reach the renderer instead of swallowing it", async () => {
    const deps = makeDeps(new Error('wine_winetricks_apply:bad-args'))
    await expect(
      winetricksApply(deps, 'gog', 'app-1', ['xact'])
    ).rejects.toThrow('wine_winetricks_apply:bad-args')
  })

  it('sends the reason when the game has no usable Wine environment, with no settings', async () => {
    const deps = makeDeps({ accepted: false })
    deps.winetricksTarget = (runner, appName) =>
      Promise.resolve({ runner, appName, unavailable: 'bottle-not-created' })
    await winetricksApply(deps, 'steam', '480', ['xact'])
    expect(deps.calls[0]?.[1][0]).toEqual({
      runner: 'steam',
      appName: '480',
      unavailable: 'bottle-not-created'
    })
  })
})

describe('winetricksAvailable', () => {
  it('resolves the target with a bottle-creating need and answers the components Rust listed', async () => {
    const components = [{ verb: 'vcrun2019', name: 'VC++', category: 'dlls' }]
    const deps = makeDeps(components)
    expect(
      await winetricksAvailable(deps, { runner: 'sideload', appName: 'a-2' })
    ).toBe(components)
    expect(deps.targetFor).toEqual([
      ['sideload', 'a-2', { ensureBottle: true }]
    ])
    expect(deps.calls).toEqual([
      [
        RUST_WINE_WINETRICKS_AVAILABLE,
        [{ runner: 'sideload', appName: 'a-2', settings: TOOL_SETTINGS }]
      ]
    ])
  })
})

describe('winetricksInstalled', () => {
  it('resolves the target without creating a bottle and answers the log lines Rust read', async () => {
    const lines = ['vcrun2019', 'corefonts']
    const deps = makeDeps(lines)
    expect(
      await winetricksInstalled(deps, { runner: 'legendary', appName: 'a-3' })
    ).toBe(lines)
    expect(deps.targetFor).toEqual([
      ['legendary', 'a-3', { ensureBottle: false }]
    ])
    expect(deps.calls).toEqual([
      [
        RUST_WINE_WINETRICKS_INSTALLED,
        [{ runner: 'legendary', appName: 'a-3', settings: TOOL_SETTINGS }]
      ]
    ])
  })
})
