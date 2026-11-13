/**
 * Unit tests for the shared readAcfInstalldir() helper (quick-260909-pym).
 *
 * Mock strategy follows library.test.ts's established pattern for the same
 * ACF read: automock graceful-fs and @node-steam/vdf, arm existsSync /
 * readFileSync / parse per test (resetMocks:true strips factory
 * implementations before every test, including the first).
 */
import { existsSync, readFileSync } from 'graceful-fs'
import * as vdf from '@node-steam/vdf'
import { join } from 'path'
import * as logger from 'backend/logger'
import { readAcfInstalldir } from '../acfInstalldir'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'

jest.mock('graceful-fs')
jest.mock('@node-steam/vdf')

const STEAMAPPS_DIR = join('/lib', 'steamapps')
const APP_ID = '12345'
const NO_RUST = {
  requestRustInvoke: () => Promise.reject(new Error('rust must not be reached'))
}
const realEnv = process.env.GAMELIB_STEAMFILES_TEXT

beforeEach(() => {
  process.env.GAMELIB_STEAMFILES_TEXT = 'ts'
  ;(existsSync as jest.Mock).mockReturnValue(false)
  ;(readFileSync as jest.Mock).mockReturnValue('')
  ;(vdf.parse as jest.Mock).mockReturnValue({})
})

describe('readAcfInstalldir', () => {
  it('returns AppState.installdir when the manifest exists and parses', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { installdir: 'Avadon The Black Fortress' }
    })

    const result = await readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)

    expect(result).toBe('Avadon The Black Fortress')
    expect(existsSync).toHaveBeenCalledWith(
      join(STEAMAPPS_DIR, `appmanifest_${APP_ID}.acf`)
    )
  })

  it('returns undefined when the manifest file does not exist', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const result = await readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)

    expect(result).toBeUndefined()
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('returns undefined when the file exists but parse throws (corrupt ACF) — must not propagate, same discipline as readAcfState (T-2-01)', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('not valid vdf')
    ;(vdf.parse as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt VDF')
    })

    await expect(
      readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)
    ).resolves.toBeUndefined()
    expect(
      await readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)
    ).toBeUndefined()
  })

  it('returns undefined when the file exists but readFileSync throws', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('EACCES')
    })

    expect(
      await readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)
    ).toBeUndefined()
  })

  it('returns undefined when AppState.installdir is absent', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({ AppState: {} })

    expect(
      await readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)
    ).toBeUndefined()
  })

  it('returns undefined when AppState.installdir is an empty string', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { installdir: '' }
    })

    expect(
      await readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)
    ).toBeUndefined()
  })

  it('returns undefined when AppState.installdir is whitespace-only', async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { installdir: '   ' }
    })

    expect(
      await readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)
    ).toBeUndefined()
  })

  it("D-03: returns the LITERAL on-disk value without sanitizing — a traversal-shaped candidate comes back verbatim, proving the sanitizer is the caller's job", async () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { installdir: '../../evil' }
    })

    expect(await readAcfInstalldir(NO_RUST, STEAMAPPS_DIR, APP_ID)).toBe(
      '../../evil'
    )
  })
})

describe('readAcfInstalldir (rust flag)', () => {
  const acfPath = join(STEAMAPPS_DIR, `appmanifest_${APP_ID}.acf`)
  const readAcf = (record: Record<string, unknown> | null) =>
    stubRustSteamFiles({
      steamfiles_read_acf: () =>
        ({
          exists: record !== null,
          parsed: record !== null,
          readError: null,
          record
        }) as never
    })

  beforeEach(() => {
    process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    if (realEnv === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
    else process.env.GAMELIB_STEAMFILES_TEXT = realEnv
  })

  it('returns the installdir and reads the manifest path through steamfiles', async () => {
    const rust = readAcf({ installdir: 'Avadon' })
    expect(await readAcfInstalldir(rust, STEAMAPPS_DIR, APP_ID)).toBe('Avadon')
    expect(rust.calls).toEqual([
      { channel: 'steamfiles_read_acf', args: { path: acfPath } }
    ])
  })

  it('returns undefined for a missing manifest', async () => {
    const rust = readAcf(null)
    expect(await readAcfInstalldir(rust, STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })

  it('returns undefined for a blank installdir', async () => {
    const rust = readAcf({ installdir: '   ' })
    expect(await readAcfInstalldir(rust, STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })

  it('returns undefined when the record has no installdir', async () => {
    const rust = readAcf({})
    expect(await readAcfInstalldir(rust, STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })

  it('returns the raw traversal-shaped value unsanitised (D-03)', async () => {
    const rust = readAcf({ installdir: '../../evil' })
    expect(await readAcfInstalldir(rust, STEAMAPPS_DIR, APP_ID)).toBe(
      '../../evil'
    )
  })

  it('returns undefined when the invoke rejects, never throwing', async () => {
    const rust = stubRustSteamFiles({})
    expect(await readAcfInstalldir(rust, STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })
})
