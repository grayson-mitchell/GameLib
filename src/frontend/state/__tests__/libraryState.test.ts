import '../../testUtils/tauriWindow'
import { resetAllStores } from '../storeKit'
import useLibraryState, { installLibraryBridgeSlots } from '../libraryState'

let logged: string[] = []

describe('libraryState bridge slots', () => {
  beforeEach(() => {
    ;(window as unknown as { api: unknown }).api = {
      logError: (message: string) => {
        logged.push(message)
      }
    }
    logged = []
  })

  afterEach(() => {
    resetAllStores()
  })

  it('logs and does nothing before install, refreshLibrary resolving', async () => {
    const s = useLibraryState.getState()
    await expect(s.refreshLibrary({})).resolves.toBeUndefined()
    s.resetRunnerLibrary('gog')
    s.setRefreshing(true)
    expect(logged).toEqual([
      'library slot refreshLibrary called before GlobalState installed it',
      'library slot resetRunnerLibrary called before GlobalState installed it',
      'library slot setRefreshing called before GlobalState installed it'
    ])
  })

  it('routes to the installed implementation', async () => {
    const calls: unknown[][] = []
    installLibraryBridgeSlots({
      refreshLibrary: async (o) => {
        calls.push(['refresh', o])
      },
      resetRunnerLibrary: (r) => {
        calls.push(['reset', r])
      },
      setRefreshing: (v) => {
        calls.push(['refreshing', v])
      }
    })
    const s = useLibraryState.getState()
    await s.refreshLibrary({ library: 'gog' })
    s.resetRunnerLibrary('nile')
    s.setRefreshing(false)
    expect(calls).toEqual([
      ['refresh', { library: 'gog' }],
      ['reset', 'nile'],
      ['refreshing', false]
    ])
    expect(logged).toEqual([])
  })
})
