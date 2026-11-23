/**
 * The scheduled resolvers of the engine and wine services (Phase 87, D-23): each renderer channel makes
 * exactly one typed Rust call, carrying the tool it names and the game's merged settings, and is
 * registered once, here. The shape (consts then one returned call) and the channel each row sends are
 * pinned separately by `engineWineShimSchedule.test.ts`; this file pins the behaviour: which channel, with
 * which arguments, what the renderer gets back, and that a Rust refusal reaches the renderer.
 */
import {
  RUST_WINE_DXVK_INSTALL_REMOVE,
  RUST_WINE_RUN_COMMAND_FOR_GAME,
  RUST_WINE_WINETRICKS_APPLY,
  RUST_WINE_WINETRICKS_AVAILABLE,
  RUST_WINE_WINETRICKS_INSTALLED
} from 'common/types/sidecarTransport'
import { defined } from 'backend/testUtils/indexed'

import { createIpcRegistry, type IpcRegistry } from '../ipcRegistry'
import {
  registerEngineWineResolvers,
  runWineCommandForGame,
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
  factsFor: Array<[string, string, { pendingInstall: boolean }]>
} {
  const calls: Array<[string, unknown[]]> = []
  const settingsFor: string[] = []
  const targetFor: Array<[string, string, { ensureBottle: boolean }]> = []
  const factsFor: Array<[string, string, { pendingInstall: boolean }]> = []
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
    gameCommandFacts: (runner, appName, opts) => {
      factsFor.push([runner, appName, opts])
      return Promise.resolve({
        runner,
        appName,
        settings: TOOL_SETTINGS,
        steamEligible: true,
        isNative: false,
        folderName: 'Game Folder',
        installPath: '/games/Game Folder'
      } as never)
    },
    calls,
    settingsFor,
    targetFor,
    factsFor
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
        'winetricksInstalled',
        'runWineCommandForGame'
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

// 87-36 (D-23): the wine command on a game. The resolver gathers the facts only TypeScript holds (`gameCommandFacts`),
// then makes the one typed call; every guard is Rust's, so the resolver never judges the command.
describe('runWineCommandForGame', () => {
  const FACTS = {
    runner: 'gog',
    appName: 'app-1',
    settings: TOOL_SETTINGS,
    steamEligible: true,
    isNative: false,
    folderName: 'Game Folder',
    installPath: '/games/Game Folder'
  }

  it('gathers the facts for a game and sends them with the command in one typed call', async () => {
    const deps = makeDeps({ stdout: 'out', stderr: '', code: 0 })
    const result = await runWineCommandForGame(deps, {
      runner: 'gog',
      appName: 'app-1',
      commandParts: ['/games/Game Folder/fix.exe'],
      wait: true,
      protonVerb: 'run'
    })
    expect(result).toEqual({ stdout: 'out', stderr: '', code: 0 })
    expect(deps.factsFor).toEqual([['gog', 'app-1', { pendingInstall: false }]])
    expect(deps.calls).toEqual([
      [
        RUST_WINE_RUN_COMMAND_FOR_GAME,
        [
          {
            ...FACTS,
            pendingInstall: undefined,
            commandParts: ['/games/Game Folder/fix.exe'],
            wait: true,
            protonVerb: 'run',
            startFolder: undefined
          }
        ]
      ]
    ])
  })

  it('sends the commandParts exactly as they came, so the Rust shape guard (not this resolver) judges them', async () => {
    const deps = makeDeps({ stdout: '', stderr: '' })
    for (const commandParts of ['winecfg', [], null, [1], ["it's a path"]]) {
      deps.calls.length = 0
      await runWineCommandForGame(deps, {
        runner: 'gog',
        appName: 'app-1',
        commandParts
      })
      const request = deps.calls[0]?.[1][0] as { commandParts: unknown }
      expect(request.commandParts).toBe(commandParts)
    }
  })

  it('asks for a pending install and passes the caller wait through for it', async () => {
    const deps = makeDeps({ stdout: '', stderr: '' })
    await runWineCommandForGame(deps, {
      runner: 'sideload',
      appName: 'a-2',
      commandParts: ['setup.exe'],
      wait: true,
      pendingInstall: true
    })
    expect(deps.factsFor).toEqual([
      ['sideload', 'a-2', { pendingInstall: true }]
    ])
    expect(deps.calls[0]?.[1][0]).toMatchObject({
      pendingInstall: true,
      wait: true
    })
  })

  it("lets Rust's refusal reach the caller instead of swallowing it", async () => {
    const deps = makeDeps(
      new Error('wine_run_command_for_game:bad-command-parts')
    )
    await expect(
      runWineCommandForGame(deps, {
        runner: 'gog',
        appName: 'app-1',
        commandParts: 'nope'
      })
    ).rejects.toThrow('wine_run_command_for_game:bad-command-parts')
  })

  it('lets a facts failure reach the caller and makes no Rust call', async () => {
    const deps = makeDeps(true)
    deps.gameCommandFacts = () => Promise.reject(new Error('no such game'))
    await expect(
      runWineCommandForGame(deps, {
        runner: 'gog',
        appName: 'missing',
        commandParts: ['winecfg']
      })
    ).rejects.toThrow('no such game')
    expect(deps.calls).toEqual([])
  })

  describe('the renderer channel', () => {
    it('runs the renderer command with wait false and runinprefix, whatever wait the renderer sent', async () => {
      const deps = makeDeps({ stdout: '', stderr: '' })
      registerEngineWineResolvers(deps)
      await deps.registry.getHandler('runWineCommandForGame')?.({} as never, {
        appName: 'app-1',
        runner: 'gog',
        commandParts: ["C:\\Games\\It's here\\a b.exe", '-x'],
        wait: true
      })
      expect(deps.calls[0]?.[1][0]).toMatchObject({
        runner: 'gog',
        appName: 'app-1',
        pendingInstall: false,
        wait: false,
        protonVerb: 'runinprefix',
        commandParts: ["C:\\Games\\It's here\\a b.exe", '-x']
      })
    })

    it('carries the wait only for a pending install, which is sideload only in Rust', async () => {
      const deps = makeDeps({ stdout: '', stderr: '' })
      registerEngineWineResolvers(deps)
      await deps.registry.getHandler('runWineCommandForGame')?.({} as never, {
        appName: 'a-2',
        runner: 'sideload',
        commandParts: ['setup.exe'],
        wait: true,
        pendingInstall: true
      })
      expect(deps.factsFor).toEqual([
        ['sideload', 'a-2', { pendingInstall: true }]
      ])
      expect(deps.calls[0]?.[1][0]).toMatchObject({
        pendingInstall: true,
        wait: true
      })
    })

    it('treats a non-boolean pendingInstall and wait as absent', async () => {
      const deps = makeDeps({ stdout: '', stderr: '' })
      registerEngineWineResolvers(deps)
      await deps.registry.getHandler('runWineCommandForGame')?.({} as never, {
        appName: 'app-1',
        runner: 'gog',
        commandParts: ['winecfg'],
        wait: 'true',
        pendingInstall: 'true'
      })
      expect(deps.calls[0]?.[1][0]).toMatchObject({
        pendingInstall: false,
        wait: false
      })
    })
  })
})
