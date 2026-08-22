/**
 * Regression coverage for the nile 1.2.0 upgrade (upstream 0e2f4ca3b).
 *
 * nile 1.2.0 made two coupled breaking changes to the user data file:
 *   1. it moved   `user.json` -> `current_user.json`, and
 *   2. it FLATTENED the payload -- the fields that used to live under
 *      `extensions.customer_info` are now the top-level object.
 *
 * Both halves fail SILENTLY when only one side moves: the old
 * `user.extensions.customer_info` read against a 1.2.0 payload yields
 * `undefined`, which `configStore.set('userData', undefined)` turns into a
 * logged-out user with no error anywhere. These tests pin both halves so the
 * binary pin in meta/releaseTags.ts and this parse cannot drift apart.
 */

const mockExistsSync = jest.fn()
const mockReadFileSync = jest.fn()

jest.mock('graceful-fs', () => ({
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  readFileSync: (...args: unknown[]) => mockReadFileSync(...args)
}))

jest.mock('backend/storeManagers/index', () => ({
  libraryManagerMap: { nile: { runRunnerCommand: jest.fn() } }
}))

jest.mock('backend/logger', () => ({
  logDebug: jest.fn(),
  logInfo: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Nile: 'Nile' }
}))

const mockConfigSet = jest.fn()
const mockConfigDelete = jest.fn()

jest.mock('backend/storeManagers/nile/electronStores', () => ({
  configStore: {
    set: (...args: unknown[]) => mockConfigSet(...args),
    delete: (...args: unknown[]) => mockConfigDelete(...args),
    get_nodefault: jest.fn()
  }
}))

jest.mock('backend/utils', () => ({ clearCache: jest.fn() }))

import { NileUser } from '../user'
import { nileUserData } from '../constants'

// The 1.2.0 on-disk shape: flat, and carrying ONLY the fields nile still emits.
const FLAT_PAYLOAD = { user_id: 'amzn1.account.ABC', name: 'Grayson' }

// The pre-1.2.0 shape, kept verbatim as the known-BAD input below.
const NESTED_PAYLOAD = {
  extensions: {
    customer_info: {
      account_pool: 'Amazon',
      user_id: 'amzn1.account.ABC',
      home_region: 'us-east-1',
      name: 'Grayson',
      given_name: 'Grayson'
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks()
})

describe('NileUser.getUserData -- nile 1.2.0 file move', () => {
  it('reads current_user.json, not the pre-1.2.0 user.json', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(FLAT_PAYLOAD))

    await NileUser.getUserData()

    expect(nileUserData).toMatch(/current_user\.json$/)
    expect(nileUserData).not.toMatch(/[/\\]user\.json$/)
    expect(mockReadFileSync).toHaveBeenCalledWith(nileUserData, 'utf-8')
  })
})

describe('NileUser.getUserData -- nile 1.2.0 flattened payload', () => {
  it('returns and persists the flat payload as-is', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(FLAT_PAYLOAD))

    const result = await NileUser.getUserData()

    expect(result).toEqual(FLAT_PAYLOAD)
    expect(mockConfigSet).toHaveBeenCalledWith('userData', FLAT_PAYLOAD)
    expect(mockConfigDelete).not.toHaveBeenCalled()
  })

  // Non-vacuity: this is the exact input the OLD parse was written for. The old
  // `user.extensions.customer_info` read returned it happily; the 1.2.0 parse
  // must NOT silently hand back the nested wrapper as if it were user data.
  it('does not treat a pre-1.2.0 nested payload as valid user data', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue(JSON.stringify(NESTED_PAYLOAD))

    const result = await NileUser.getUserData()

    expect(result).not.toHaveProperty('user_id')
    expect(result).not.toHaveProperty('name')
  })

  it('clears stored userData when current_user.json is absent', async () => {
    mockExistsSync.mockReturnValue(false)

    expect(await NileUser.getUserData()).toBeUndefined()
    expect(mockConfigDelete).toHaveBeenCalledWith('userData')
    expect(mockReadFileSync).not.toHaveBeenCalled()
  })

  it('clears stored userData when current_user.json is an empty object', async () => {
    mockExistsSync.mockReturnValue(true)
    mockReadFileSync.mockReturnValue('{}')

    expect(await NileUser.getUserData()).toBeUndefined()
    expect(mockConfigDelete).toHaveBeenCalledWith('userData')
    expect(mockConfigSet).not.toHaveBeenCalled()
  })
})
