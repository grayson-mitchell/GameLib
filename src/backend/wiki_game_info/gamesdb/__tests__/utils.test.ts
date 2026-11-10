import { GamesDBInfo } from 'common/types'
import { axiosClient } from 'backend/utils'
import testData from './test-data.json'
import { getInfoFromGamesDB } from '../utils'
import { logError } from 'backend/logger'
import GOGLibraryManager from 'backend/storeManagers/gog/library'
import {
  createTestManagerDeps,
  createTestStores
} from 'backend/testUtils/testServices'
import { createStoreRegistry } from 'backend/stores/storeRegistry'
import { createGogStores } from 'backend/storeManagers/gog/stores'

const gogStores = createGogStores({ registry: createStoreRegistry() })

jest.mock('backend/logger')
jest.mock('backend/store_backend')

// The real GOG manager over the real gog stores: the lookup's own cache and
// error handling stay under test, only the HTTP client is stubbed.
const deps = {
  libraryManagers: {
    gog: new GOGLibraryManager(
      createTestManagerDeps({ stores: createTestStores({ gog: gogStores }) })
    )
  }
}

describe('getInfoFromGamesDB', () => {
  test('fetches successfully', async () => {
    jest.spyOn(axiosClient, 'get').mockResolvedValue({
      data: testData
    })

    const result = await getInfoFromGamesDB(
      deps,
      'Jotun',
      'Grouse',
      'legendary'
    )
    expect(result).toStrictEqual(testGamesDBInfo)
  })

  test('skip not supported runner', async () => {
    jest.spyOn(axiosClient, 'get').mockResolvedValue({
      data: testData
    })

    const result = await getInfoFromGamesDB(deps, 'Jotun', 'Grouse', 'sideload')
    expect(result).toStrictEqual({ steamID: '' })
  })

  test('skips steam without a network call', async () => {
    const getSpy = jest.spyOn(axiosClient, 'get').mockResolvedValue({
      data: testData
    })
    getSpy.mockClear()

    const result = await getInfoFromGamesDB(deps, 'X', '220', 'steam')
    expect(result).toStrictEqual({ steamID: '' })
    expect(getSpy).not.toHaveBeenCalled()
  })

  test('catches axios throws', async () => {
    jest.spyOn(axiosClient, 'get').mockRejectedValueOnce({
      response: {
        data: 'Failed'
      }
    })

    const result = await getInfoFromGamesDB(
      deps,
      'Jotun',
      'Grouse',
      'legendary'
    )
    expect(result).toStrictEqual({ steamID: '' })
    expect(logError).toBeCalledWith(
      ['Was not able to get GamesDB data for Grouse', 'Failed'],
      'ExtraGameInfo'
    )
  })
})

const testGamesDBInfo = {
  steamID: '323580'
} as GamesDBInfo
