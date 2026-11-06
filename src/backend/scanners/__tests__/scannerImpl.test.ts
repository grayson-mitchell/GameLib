import { SCAN_OPS } from '../scanTypes'
import {
  SCANNER_DEFAULTS,
  SCANNER_ENV_KEYS,
  SCANNER_OPS,
  resolveScannerImpl,
  type ScannerName
} from '../scannerImpl'

const NAMES = Object.keys(SCANNER_ENV_KEYS) as ScannerName[]

describe('resolveScannerImpl', () => {
  it('returns the default with an empty env', () => {
    expect(resolveScannerImpl('importScan', {})).toBe(
      SCANNER_DEFAULTS.importScan
    )
    // 63-11: all five default to rust; importScan's divergence was accepted
    // by the user 2026-11-07 (63-PARITY.md).
    expect(SCANNER_DEFAULTS).toEqual({
      peSections: 'rust',
      peSteamDrm: 'rust',
      importScan: 'rust',
      drmScanExe: 'rust',
      machoExports: 'rust'
    })
    for (const n of NAMES)
      expect(resolveScannerImpl(n, {})).toBe(SCANNER_DEFAULTS[n])
  })

  it('accepts exactly rust and ts', () => {
    const k = 'GAMELIB_SCANNER_IMPORT_SCAN'
    expect(resolveScannerImpl('importScan', { [k]: 'rust' })).toBe('rust')
    expect(resolveScannerImpl('importScan', { [k]: 'ts' })).toBe('ts')
  })

  it.each(['RUST', '', 'yes', ' rust'])('ignores %j', (v) => {
    expect(
      resolveScannerImpl('importScan', { GAMELIB_SCANNER_IMPORT_SCAN: v })
    ).toBe('rust')
  })

  it('maps each scanner to its env key', () => {
    expect(SCANNER_ENV_KEYS).toEqual({
      peSections: 'GAMELIB_SCANNER_PE_SECTIONS',
      peSteamDrm: 'GAMELIB_SCANNER_PE_STEAM_DRM',
      importScan: 'GAMELIB_SCANNER_IMPORT_SCAN',
      drmScanExe: 'GAMELIB_SCANNER_DRM_SCAN_EXE',
      machoExports: 'GAMELIB_SCANNER_MACHO_EXPORTS'
    })
    for (const n of NAMES) {
      expect(resolveScannerImpl(n, { [SCANNER_ENV_KEYS[n]]: 'rust' })).toBe(
        'rust'
      )
    }
  })

  it('SCANNER_OPS covers exactly SCAN_OPS', () => {
    const all = NAMES.flatMap((n) => [...SCANNER_OPS[n]]).sort()
    expect(all).toEqual([...SCAN_OPS])
  })
})
