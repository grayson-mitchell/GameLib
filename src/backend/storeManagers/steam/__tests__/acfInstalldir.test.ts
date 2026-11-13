/**
 * Unit tests for the shared readAcfInstalldir() helper (quick-260909-pym).
 * Phase 75: the manifest read goes through the steamfiles Rust channel, answered by a stub.
 */
import { join } from 'path'
import * as logger from 'backend/logger'
import { readAcfInstalldir } from '../acfInstalldir'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'

const STEAMAPPS_DIR = join('/lib', 'steamapps')
const APP_ID = '12345'
const realEnv = process.env.GAMELIB_STEAMFILES_TEXT

describe('readAcfInstalldir', () => {
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
    // Phase 75: removed with the flag in plan 34
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
