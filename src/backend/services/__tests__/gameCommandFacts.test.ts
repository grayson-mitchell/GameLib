/**
 * The facts a wine command on a game takes from TypeScript (Phase 87, 87-36, D-23). Rust judges every guard; this
 * module's one job beyond reading the library is the ORDER the TS `runWineCommandOnGame` had: resolving the tool
 * settings creates the game's bottle, so a command a guard will refuse must never resolve them.
 */
import { gatherGameCommandFacts } from '../gameCommandFacts'
import type { GameCommandSource } from '../gameCommandFacts'

const resolveToolTarget = jest.fn()
const resolveToolSettingsForId = jest.fn()
const isSteamWineToolsEligible = jest.fn()

jest.mock('../winetricksTarget', () => ({
  resolveToolTarget: (...a: unknown[]) => resolveToolTarget(...a)
}))
jest.mock('backend/engine/toolSettings', () => ({
  resolveToolSettingsForId: (...a: unknown[]) => resolveToolSettingsForId(...a)
}))
jest.mock('backend/storeManagers/steam/bridgeWineTools', () => ({
  isSteamWineToolsEligible: (...a: unknown[]) => isSteamWineToolsEligible(...a)
}))
jest.mock('../engineServices', () => ({
  steamEngineServicesFrom: (source: unknown) => ({ services: source })
}))

const SETTINGS = { winePrefix: '/bottle' }

function makeSource(
  game: {
    isNative?: boolean
    info?: Record<string, unknown>
  } = {},
  getGameCalls: string[] = []
): GameCommandSource {
  const source = {
    paths: { userHome: '/home/u' },
    gameConfigs: {
      get: () => ({ getSettings: () => Promise.resolve({ stored: true }) })
    },
    libraryManagers: new Proxy(
      {},
      {
        get: (_target, runner: string) => ({
          getGame: (appName: string) => {
            getGameCalls.push(`${runner}:${appName}`)
            return {
              isNative: () => game.isNative === true,
              getGameInfo: () =>
                game.info ?? {
                  folder_name: 'Game Folder',
                  install: { install_path: '/games/Game Folder' }
                }
            }
          }
        })
      }
    )
  }
  return source as unknown as GameCommandSource
}

beforeEach(() => {
  resolveToolTarget.mockReset()
  resolveToolSettingsForId.mockReset()
  isSteamWineToolsEligible.mockReset()
  resolveToolTarget.mockImplementation(
    (_source: unknown, runner: string, appName: string) =>
      Promise.resolve({ runner, appName, settings: SETTINGS })
  )
  resolveToolSettingsForId.mockResolvedValue({
    kind: 'stored',
    settings: SETTINGS
  })
})

describe('gatherGameCommandFacts for a game in the library', () => {
  it('reads the library entry and resolves the tool settings with a bottle-creating need', async () => {
    const source = makeSource()
    const facts = await gatherGameCommandFacts(source, 'gog', 'app-1', {
      pendingInstall: false
    })
    expect(facts).toEqual({
      runner: 'gog',
      appName: 'app-1',
      settings: SETTINGS,
      steamEligible: true,
      isNative: false,
      folderName: 'Game Folder',
      installPath: '/games/Game Folder'
    })
    expect(resolveToolTarget).toHaveBeenCalledWith(source, 'gog', 'app-1', {
      ensureBottle: true
    })
    // A store whose games always have a Wine prefix never asks the Steam bottle markers.
    expect(isSteamWineToolsEligible).not.toHaveBeenCalled()
  })

  it('passes the reason through when the game has no usable Wine environment', async () => {
    resolveToolTarget.mockResolvedValue({
      runner: 'gog',
      appName: 'app-1',
      unavailable: 'bottle-not-created'
    })
    const facts = await gatherGameCommandFacts(makeSource(), 'gog', 'app-1', {
      pendingInstall: false
    })
    expect(facts).toMatchObject({ unavailable: 'bottle-not-created' })
    expect(facts).not.toHaveProperty('settings')
  })

  it('lets a failure of the resolver reach the caller, as the TS handler did', async () => {
    resolveToolTarget.mockRejectedValue(new Error('config unreadable'))
    await expect(
      gatherGameCommandFacts(makeSource(), 'gog', 'app-1', {
        pendingInstall: false
      })
    ).rejects.toThrow('config unreadable')
  })
})

describe('gatherGameCommandFacts for a command Rust will refuse', () => {
  it('a Steam title without its own bottle reads no game and resolves no settings (Pitfall 5)', async () => {
    isSteamWineToolsEligible.mockReturnValue(false)
    const getGameCalls: string[] = []
    const facts = await gatherGameCommandFacts(
      makeSource({}, getGameCalls),
      'steam',
      '480',
      { pendingInstall: false }
    )
    expect(facts).toMatchObject({
      runner: 'steam',
      appName: '480',
      steamEligible: false,
      isNative: false
    })
    expect(facts).toHaveProperty('unavailable')
    expect(isSteamWineToolsEligible).toHaveBeenCalledWith(
      { userHome: '/home/u' },
      '480'
    )
    expect(getGameCalls).toEqual([])
    expect(resolveToolTarget).not.toHaveBeenCalled()
  })

  it('a Steam title with its own bottle is eligible and resolves its settings', async () => {
    isSteamWineToolsEligible.mockReturnValue(true)
    const facts = await gatherGameCommandFacts(makeSource(), 'steam', '480', {
      pendingInstall: false
    })
    expect(facts).toMatchObject({ steamEligible: true, settings: SETTINGS })
    expect(resolveToolTarget).toHaveBeenCalledTimes(1)
  })

  it('a native game reports itself and never creates a bottle', async () => {
    const facts = await gatherGameCommandFacts(
      makeSource({ isNative: true }),
      'legendary',
      'app-2',
      { pendingInstall: false }
    )
    expect(facts).toMatchObject({ isNative: true })
    expect(facts).toHaveProperty('unavailable')
    expect(resolveToolTarget).not.toHaveBeenCalled()
  })

  it.each([
    ['a game info of {}', {}],
    ['an install with no path', { folder_name: 'F', install: {} }],
    [
      'an empty install path',
      { folder_name: 'F', install: { install_path: '' } }
    ]
  ])('%s never creates a bottle', async (_name, info) => {
    const facts = await gatherGameCommandFacts(
      makeSource({ info }),
      'gog',
      'app-3',
      { pendingInstall: false }
    )
    expect(facts).toHaveProperty('unavailable')
    expect(facts).not.toHaveProperty('settings')
    expect(resolveToolTarget).not.toHaveBeenCalled()
  })
})

describe('gatherGameCommandFacts for a pending install (CR-04)', () => {
  it('a sideload game has no library entry: its settings come from the game config, creating the bottle', async () => {
    const getGameCalls: string[] = []
    const source = makeSource({}, getGameCalls)
    const facts = await gatherGameCommandFacts(source, 'sideload', 'a-9', {
      pendingInstall: true
    })
    expect(facts).toEqual({
      runner: 'sideload',
      appName: 'a-9',
      settings: SETTINGS,
      steamEligible: true,
      isNative: false
    })
    expect(resolveToolSettingsForId).toHaveBeenCalledWith(
      { services: source },
      { runner: 'sideload', appName: 'a-9', platform: 'Windows' },
      { stored: true },
      { ensureBottle: true }
    )
    expect(getGameCalls).toEqual([])
    expect(resolveToolTarget).not.toHaveBeenCalled()
  })

  it('answers the reason when the resolver finds no usable environment', async () => {
    resolveToolSettingsForId.mockResolvedValue({
      kind: 'unavailable',
      reason: 'invalid-prefix'
    })
    const facts = await gatherGameCommandFacts(
      makeSource(),
      'sideload',
      'a-9',
      { pendingInstall: true }
    )
    expect(facts).toMatchObject({ unavailable: 'invalid-prefix' })
    expect(facts).not.toHaveProperty('settings')
  })

  it('any other runner resolves nothing: Rust refuses a pending install that is not a sideload', async () => {
    const facts = await gatherGameCommandFacts(makeSource(), 'gog', 'app-1', {
      pendingInstall: true
    })
    expect(facts).toHaveProperty('unavailable')
    expect(resolveToolSettingsForId).not.toHaveBeenCalled()
    expect(resolveToolTarget).not.toHaveBeenCalled()
  })
})

describe('gatherGameCommandFacts on Windows', () => {
  it('reads no game and resolves nothing: the crate spawns the program itself', async () => {
    jest.resetModules()
    jest.doMock('backend/constants/environment', () => ({ isWindows: true }))
    const mod =
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('../gameCommandFacts') as typeof import('../gameCommandFacts')
    const getGameCalls: string[] = []
    const facts = await mod.gatherGameCommandFacts(
      makeSource({}, getGameCalls),
      'legendary',
      'app-1',
      { pendingInstall: false }
    )
    expect(facts).toMatchObject({
      runner: 'legendary',
      appName: 'app-1',
      steamEligible: true,
      isNative: false
    })
    expect(facts).toHaveProperty('unavailable')
    expect(getGameCalls).toEqual([])
    jest.dontMock('backend/constants/environment')
  })
})
