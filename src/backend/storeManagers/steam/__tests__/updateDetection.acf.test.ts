import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as logger from 'backend/logger'
import { RUST_STEAMFILES_READ_ACF } from 'common/types/sidecarTransport'
import {
  fsBackedSteamFiles,
  stubRustSteamFiles
} from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import {
  isAcfUpdatePending,
  readAcfUpdateFieldsFromDir,
  readAcfUpdateState,
  type AcfUpdateFields
} from '../library/acfUpdateState'

const FIX = join(__dirname, 'fixtures', 'steamUpdate')

const base: AcfUpdateFields = {
  steamappsDir: '/x',
  buildid: '100',
  targetBuildId: '100',
  stateFlags: 4,
  bytesToDownload: 100,
  bytesDownloaded: 100,
  scheduledAutoUpdate: 0
}

describe('isAcfUpdatePending', () => {
  it('flags bit 0x2 and a differing TargetBuildID', () => {
    expect(isAcfUpdatePending({ ...base, stateFlags: 6 })).toBe(true)
    expect(isAcfUpdatePending({ ...base, targetBuildId: '200' })).toBe(true)
  })
  it('ignores TargetBuildID 0/absent and stale counters', () => {
    expect(isAcfUpdatePending({ ...base, targetBuildId: '0' })).toBe(false)
    expect(isAcfUpdatePending({ ...base, targetBuildId: undefined })).toBe(
      false
    )
    expect(isAcfUpdatePending(base)).toBe(false)
  })
  it('counts a scheduled update only with bytes outstanding', () => {
    expect(
      isAcfUpdatePending({
        ...base,
        scheduledAutoUpdate: 5,
        bytesToDownload: 200,
        bytesDownloaded: 0
      })
    ).toBe(true)
    expect(isAcfUpdatePending({ ...base, scheduledAutoUpdate: 5 })).toBe(false)
  })
})

describe('readAcfUpdateState', () => {
  let dir: string
  beforeEach(() => {
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
    dir = mkdtempSync(join(tmpdir(), 'acfupd-'))
    mkdirSync(join(dir, 'steamapps'))
    writeFileSync(
      join(dir, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders"
{
"0"
{
"path" "${dir}"
}
}
`
    )
  })
  afterEach(() => {
    jest.restoreAllMocks()
    rmSync(dir, { recursive: true, force: true })
  })

  const deps = () =>
    ({
      config: { getSettings: () => ({ defaultSteamPath: dir }) },
      ...fsBackedSteamFiles()
    }) as never

  it('reads the pending and current fixtures from native roots', async () => {
    copyFileSync(
      join(FIX, 'acf-pending.acf'),
      join(dir, 'steamapps', 'appmanifest_333300.acf')
    )
    const pending = await readAcfUpdateState(deps(), '333300', 'native')
    expect(pending).toMatchObject({
      buildid: '3512046',
      targetBuildId: '5820078',
      stateFlags: 6
    })
    expect(isAcfUpdatePending(pending!)).toBe(true)

    copyFileSync(
      join(FIX, 'acf-current.acf'),
      join(dir, 'steamapps', 'appmanifest_333300.acf')
    )
    const current = await readAcfUpdateState(deps(), '333300', 'native')
    expect(current?.betaKey).toBe('release-101')
    expect(isAcfUpdatePending(current!)).toBe(false)
  })

  it('returns null for a corrupt or missing manifest', async () => {
    expect(await readAcfUpdateState(deps(), '1', 'native')).toBeNull()
    writeFileSync(join(dir, 'steamapps', 'appmanifest_1.acf'), '\u0000{{{')
    expect(await readAcfUpdateState(deps(), '1', 'native')).toBeNull()
  })
})

describe('readAcfUpdateFieldsFromDir on Rust', () => {
  beforeEach(() => {
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => jest.restoreAllMocks())

  const rec = (over: Record<string, unknown>) =>
    ({
      exists: true,
      parsed: true,
      readError: null,
      record: {
        buildid: '100',
        stateFlags: 4,
        targetBuildId: null,
        bytesToDownload: null,
        bytesDownloaded: null,
        scheduledAutoUpdate: null,
        betaKey: null,
        installedDepots: [],
        ...over
      }
    }) as never
  const stubFor = (over: Record<string, unknown>) =>
    stubRustSteamFiles({ [RUST_STEAMFILES_READ_ACF]: () => rec(over) })

  it('keeps build ids as exact strings and counters numeric', async () => {
    const f = await readAcfUpdateFieldsFromDir(
      stubFor({
        buildid: '9223372036854775807',
        targetBuildId: '9223372036854775806',
        bytesToDownload: '2048',
        bytesDownloaded: '1024',
        scheduledAutoUpdate: '5',
        betaKey: 'beta_a'
      }),
      '/s',
      '77'
    )
    expect(f).toEqual({
      steamappsDir: '/s',
      buildid: '9223372036854775807',
      targetBuildId: '9223372036854775806',
      stateFlags: 4,
      bytesToDownload: 2048,
      bytesDownloaded: 1024,
      scheduledAutoUpdate: 5,
      betaKey: 'beta_a'
    })
  })

  it('feeds the unchanged pending rules: TargetBuildID and scheduled update', async () => {
    const target = await readAcfUpdateFieldsFromDir(
      stubFor({ targetBuildId: '200' }),
      '/s',
      '77'
    )
    expect(isAcfUpdatePending(target!)).toBe(true)
    const scheduled = await readAcfUpdateFieldsFromDir(
      stubFor({
        scheduledAutoUpdate: '1',
        bytesToDownload: '10',
        bytesDownloaded: '0'
      }),
      '/s',
      '77'
    )
    expect(isAcfUpdatePending(scheduled!)).toBe(true)
    const idle = await readAcfUpdateFieldsFromDir(stubFor({}), '/s', '77')
    expect(isAcfUpdatePending(idle!)).toBe(false)
    expect(idle).not.toHaveProperty('betaKey')
  })

  it('is null without a buildid, when unparsed or absent, on a bad id, and on a rejected invoke', async () => {
    expect(
      await readAcfUpdateFieldsFromDir(stubFor({ buildid: null }), '/s', '77')
    ).toBeNull()
    const unparsed = stubRustSteamFiles({
      [RUST_STEAMFILES_READ_ACF]: () => ({
        exists: true,
        parsed: false,
        readError: null,
        record: null
      })
    })
    expect(await readAcfUpdateFieldsFromDir(unparsed, '/s', '77')).toBeNull()
    expect(
      await readAcfUpdateFieldsFromDir(stubFor({}), '/s', '../x')
    ).toBeNull()
    expect(
      await readAcfUpdateFieldsFromDir(stubRustSteamFiles({}), '/s', '77')
    ).toBeNull()
  })
})
