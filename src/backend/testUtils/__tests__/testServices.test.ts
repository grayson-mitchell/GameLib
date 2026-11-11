import {
  createTestManagers,
  createTestServices,
  createTestStores
} from '../testServices'
import type { Game } from 'common/types/game_manager'

describe('createTestManagers', () => {
  it('throws a named error for an unscripted manager method', () => {
    const managers = createTestManagers()
    expect(() => managers.library.steam.getGame('1')).toThrow(
      'unscripted manager call: steam.getGame'
    )
  })

  it('uses an override verbatim', () => {
    const game = { id: 'g' } as unknown as Game
    const managers = createTestManagers({
      library: { gog: { getGame: () => game } }
    })
    expect(managers.library.gog.getGame('x')).toBe(game)
  })

  it('has empty launchHooks per runner and throwing autoUpdate/initAll', () => {
    const managers = createTestManagers()
    expect(managers.launchHooks.nile).toEqual({})
    expect(managers.launchHooks.sideload).toEqual({})
    expect(() => managers.autoUpdate('gog', [])).toThrow('unscripted')
    expect(() => managers.initAll()).toThrow('unscripted')
  })

  it('keeps an awaited fake safe (no then)', async () => {
    const managers = createTestManagers()
    await expect(Promise.resolve(managers.library.gog)).resolves.toBe(
      managers.library.gog
    )
  })
})

describe('createTestStores', () => {
  it('returns an overridden family verbatim', () => {
    const kvs = { configStore: {} } as never
    const stores = createTestStores({ kvs })
    expect(stores.kvs).toBe(kvs)
  })

  it('does not resolve a family until it is read', () => {
    const stores = createTestStores()
    expect(Object.keys(stores)).toHaveLength(18)
    const desc = Object.getOwnPropertyDescriptor(stores, 'steam')
    expect(typeof desc?.get).toBe('function')
  })
})

describe('createTestServices', () => {
  it('throws unscripted for launcher, command runner, spawnAsync and quit', () => {
    const services = createTestServices()
    expect(() =>
      (services.launcher.prepareLaunch as unknown as () => void)()
    ).toThrow('unscripted launcher call: prepareLaunch')
    expect(() =>
      (services.commandRunner.callRunner as unknown as () => void)()
    ).toThrow('unscripted command runner call: callRunner')
    expect(() => services.spawnAsync('x', [])).toThrow('unscripted spawnAsync')
    expect(() => services.quit.handleExit()).toThrow('unscripted quit')
  })

  it('takes overrides by reference', () => {
    const managers = createTestManagers()
    expect(createTestServices({ managers }).managers).toBe(managers)
  })
})
