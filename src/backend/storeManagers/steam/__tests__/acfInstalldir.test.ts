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
import { readAcfInstalldir } from '../acfInstalldir'

jest.mock('graceful-fs')
jest.mock('@node-steam/vdf')

const STEAMAPPS_DIR = join('/lib', 'steamapps')
const APP_ID = '12345'

beforeEach(() => {
  ;(existsSync as jest.Mock).mockReturnValue(false)
  ;(readFileSync as jest.Mock).mockReturnValue('')
  ;(vdf.parse as jest.Mock).mockReturnValue({})
})

describe('readAcfInstalldir', () => {
  it('returns AppState.installdir when the manifest exists and parses', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { installdir: 'Avadon The Black Fortress' }
    })

    const result = readAcfInstalldir(STEAMAPPS_DIR, APP_ID)

    expect(result).toBe('Avadon The Black Fortress')
    expect(existsSync).toHaveBeenCalledWith(
      join(STEAMAPPS_DIR, `appmanifest_${APP_ID}.acf`)
    )
  })

  it('returns undefined when the manifest file does not exist', () => {
    ;(existsSync as jest.Mock).mockReturnValue(false)

    const result = readAcfInstalldir(STEAMAPPS_DIR, APP_ID)

    expect(result).toBeUndefined()
    expect(readFileSync).not.toHaveBeenCalled()
  })

  it('returns undefined when the file exists but parse throws (corrupt ACF) — must not propagate, same discipline as readAcfState (T-2-01)', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('not valid vdf')
    ;(vdf.parse as jest.Mock).mockImplementation(() => {
      throw new Error('corrupt VDF')
    })

    expect(() => readAcfInstalldir(STEAMAPPS_DIR, APP_ID)).not.toThrow()
    expect(readAcfInstalldir(STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })

  it('returns undefined when the file exists but readFileSync throws', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockImplementation(() => {
      throw new Error('EACCES')
    })

    expect(readAcfInstalldir(STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })

  it('returns undefined when AppState.installdir is absent', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({ AppState: {} })

    expect(readAcfInstalldir(STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })

  it('returns undefined when AppState.installdir is an empty string', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { installdir: '' }
    })

    expect(readAcfInstalldir(STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })

  it('returns undefined when AppState.installdir is whitespace-only', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { installdir: '   ' }
    })

    expect(readAcfInstalldir(STEAMAPPS_DIR, APP_ID)).toBeUndefined()
  })

  it('D-03: returns the LITERAL on-disk value without sanitizing — a traversal-shaped candidate comes back verbatim, proving the sanitizer is the caller\'s job', () => {
    ;(existsSync as jest.Mock).mockReturnValue(true)
    ;(readFileSync as jest.Mock).mockReturnValue('content')
    ;(vdf.parse as jest.Mock).mockReturnValue({
      AppState: { installdir: '../../evil' }
    })

    expect(readAcfInstalldir(STEAMAPPS_DIR, APP_ID)).toBe('../../evil')
  })
})
