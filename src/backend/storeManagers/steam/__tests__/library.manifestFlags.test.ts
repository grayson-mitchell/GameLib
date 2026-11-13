import { join } from 'node:path'
import * as logger from 'backend/logger'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import type { AcfReadResult } from '../localFiles/steamFilesTypes'
import {
  isCurrentFullInstall,
  readAppManifestFlags
} from '../library/manifestFlags'

describe('manifestFlags', () => {
  it('isCurrentFullInstall', () => {
    expect(isCurrentFullInstall({ stateFlags: 4, buildid: '25485521' })).toBe(
      true
    )
    expect(isCurrentFullInstall({ stateFlags: 1026, buildid: '1' })).toBe(false)
    expect(isCurrentFullInstall({ stateFlags: 6, buildid: '1' })).toBe(false)
    expect(isCurrentFullInstall({ stateFlags: 4, buildid: '0' })).toBe(false)
    expect(isCurrentFullInstall({ stateFlags: 4, buildid: '' })).toBe(false)
    expect(isCurrentFullInstall(null)).toBe(false)
  })
})

describe('readAppManifestFlags', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => {
    jest.restoreAllMocks()
  })

  const read = (record: Partial<AcfReadResult['record'] & object> | null) =>
    stubRustSteamFiles({
      steamfiles_read_acf: () => ({
        exists: record !== null,
        parsed: record !== null,
        readError: null,
        record: record as AcfReadResult['record']
      })
    })

  it('reads stateFlags and buildid through steamfiles_read_acf', async () => {
    const stub = read({ stateFlags: 4, buildid: '25485521' })
    await expect(
      readAppManifestFlags(stub, '/lib/steamapps', '123')
    ).resolves.toEqual({ stateFlags: 4, buildid: '25485521' })
    expect(stub.calls).toEqual([
      {
        channel: 'steamfiles_read_acf',
        args: { path: join('/lib/steamapps', 'appmanifest_123.acf') }
      }
    ])
  })

  it('maps a missing buildid to the empty string', async () => {
    const stub = read({ stateFlags: 1026, buildid: null })
    await expect(
      readAppManifestFlags(stub, '/lib/steamapps', '123')
    ).resolves.toEqual({ stateFlags: 1026, buildid: '' })
  })

  it('null when not parsed, when stateFlags is null, and when the call rejects', async () => {
    await expect(
      readAppManifestFlags(read(null), '/lib/steamapps', '123')
    ).resolves.toBeNull()
    await expect(
      readAppManifestFlags(
        read({ stateFlags: null, buildid: '1' }),
        '/lib/steamapps',
        '123'
      )
    ).resolves.toBeNull()
    await expect(
      readAppManifestFlags(stubRustSteamFiles({}), '/lib/steamapps', '123')
    ).resolves.toBeNull()
  })
})
