import * as logger from 'backend/logger'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import { readAcfInstalledDepots } from '../acfInstalledDepots'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import type { AcfReadResult } from '../localFiles/steamFilesTypes'

const noRust = stubRustSteamFiles({})

describe('readAcfInstalledDepots on Rust', () => {
  const GID = '1547379086645511101'
  beforeEach(() => {
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  const result = (
    over: Partial<NonNullable<AcfReadResult['record']>>
  ): AcfReadResult => ({
    exists: true,
    parsed: true,
    readError: null,
    record: {
      appid: '5',
      name: null,
      installdir: null,
      stateFlags: null,
      stateFlagsRaw: null,
      sizeOnDisk: null,
      buildid: '3512046',
      lastOwner: null,
      bytesDownloaded: null,
      bytesToDownload: null,
      bytesStaged: null,
      bytesToStage: null,
      targetBuildId: null,
      scheduledAutoUpdate: null,
      betaKey: null,
      installedDepots: [],
      ...over
    }
  })

  it('keeps a 19-digit manifest gid unchanged and passes dlcAppId through', async () => {
    const stub = stubRustSteamFiles({
      [RUST_STEAMFILES_READ_ACF]: () =>
        result({
          installedDepots: [
            {
              depotId: '333302',
              manifest: GID,
              size: '570502668',
              dlcAppId: null
            },
            { depotId: '333303', manifest: '2', size: '7', dlcAppId: '444' }
          ]
        })
    })
    const r = await readAcfInstalledDepots(stub, '/steamapps', '5')
    expect(r).toEqual({
      buildid: '3512046',
      installedDepots: [
        { depotId: '333302', manifest: GID, size: '570502668' },
        { depotId: '333303', manifest: '2', size: '7', dlcAppId: '444' }
      ]
    })
    expect(r?.installedDepots[0]?.manifest).toHaveLength(19)
    expect(stub.calls).toHaveLength(1)
  })

  it('skips a depot whose manifest gid is missing or non-numeric (WR-05)', async () => {
    const stub = stubRustSteamFiles({
      [RUST_STEAMFILES_READ_ACF]: () =>
        result({
          installedDepots: [
            { depotId: '333302', manifest: '', size: '1', dlcAppId: null },
            { depotId: '333303', manifest: 'abc', size: '2', dlcAppId: null },
            { depotId: '333304', manifest: GID, size: '3', dlcAppId: null }
          ]
        })
    })
    const r = await readAcfInstalledDepots(stub, '/steamapps', '5')
    expect(r?.installedDepots).toEqual([
      { depotId: '333304', manifest: GID, size: '3' }
    ])
  })

  it('returns null when the manifest is absent, the id is not numeric, or the invoke rejects', async () => {
    const absent = stubRustSteamFiles({
      [RUST_STEAMFILES_READ_ACF]: () => ({
        exists: false,
        parsed: false,
        readError: null,
        record: null
      })
    })
    expect(await readAcfInstalledDepots(absent, '/s', '5')).toBeNull()
    expect(await readAcfInstalledDepots(absent, '/s', '../5')).toBeNull()
    expect(absent.calls).toHaveLength(1)
    expect(await readAcfInstalledDepots(noRust, '/s', '5')).toBeNull()
  })
})
