import {
  diffScanResults,
  exitCodeFor,
  oracleBroken,
  redactPath,
  summarizeSweep,
  type SweepRecord
} from '../scannerParitySweep'

const rec = (over: Partial<SweepRecord>): SweepRecord => ({
  scanner: 'peSections',
  op: 'scan_steamstub_section',
  path: '/x/a.exe',
  ts: { drmWrapper: 'none', readError: null },
  rust: { drmWrapper: 'none', readError: null },
  ...over
})

describe('scannerParitySweep', () => {
  it('diffScanResults ignores key order but not array order', () => {
    expect(
      diffScanResults(
        'scan_steamstub_section',
        { readError: null, drmWrapper: 'none' },
        { drmWrapper: 'none', readError: null }
      )
    ).toBeNull()
    const d = diffScanResults(
      'scan_pe_imported_dlls',
      { names: ['a', 'b'], readError: null },
      { names: ['b', 'a'], readError: null }
    )
    expect(d).not.toBeNull()
    expect(d?.ts).toEqual({ names: ['a', 'b'], readError: null })
  })

  it('summarizeSweep counts per scanner', () => {
    const s = summarizeSweep([
      rec({}),
      rec({ rust: { drmWrapper: 'steamstub', readError: null } }),
      rec({
        scanner: 'peSteamDrm',
        op: 'scan_pe_imported_dlls',
        ts: { names: null, readError: null },
        rust: { names: null, readError: null }
      })
    ])
    expect(s.peSections).toEqual({ checked: 2, equal: 1, diff: 1 })
    expect(s.peSteamDrm).toEqual({ checked: 1, equal: 1, diff: 0 })
    expect(s.machoExports.checked).toBe(0)
  })

  it('redactPath hashes the directory and keeps the basename', () => {
    const r = redactPath('/Users/x/Library/Game/Game.exe')
    expect(r).toMatch(/^[0-9a-f]{12}\/Game\.exe$/)
    expect(r).not.toContain('Users')
  })

  it('exitCodeFor never reports a vacuous green', () => {
    const clean = summarizeSweep([rec({})])
    const dirty = summarizeSweep([
      rec({ rust: { drmWrapper: 'steamstub', readError: null } })
    ])
    expect(exitCodeFor(clean, 1)).toBe(0)
    expect(exitCodeFor(dirty, 1)).toBe(1)
    expect(exitCodeFor(summarizeSweep([]), 0)).toBe(3)
  })

  it('oracleBroken fires when objdump is unreadable but Rust is ok', () => {
    const mk = (tsErr: boolean): SweepRecord =>
      rec({
        scanner: 'importScan',
        op: 'scan_steam_api_imports',
        ts: tsErr
          ? {
              status: 'error',
              error: 'Failed to run objdump: spawn',
              diagnostics: []
            }
          : { status: 'ok', arch: 'x64', dll: null, symbols: [] },
        rust: { status: 'ok', arch: 'x64', dll: null, symbols: [] }
      })
    expect(oracleBroken([mk(false), mk(false)])).toBe(false)
    expect(oracleBroken([])).toBe(false)
    expect(oracleBroken([mk(true), mk(true)])).toBe(true)
  })
})
