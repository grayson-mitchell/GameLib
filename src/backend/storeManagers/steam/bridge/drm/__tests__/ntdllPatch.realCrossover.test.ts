import { createHash } from 'crypto'
import { existsSync, readFileSync } from 'fs'
import * as path from 'path'
import { applyNtdllPatch } from '../ntdllPatch'
import { findNtdllPatchRow, NTDLL_PATCH_ROWS } from '../ntdllPatchTable'

const BUILD = '26.3.0.39832'
const NTDLL =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/lib/wine/x86_64-windows/ntdll.dll'
const REPO = path.resolve(__dirname, '..', '..', '..', '..', '..', '..', '..')
const PAYLOAD = path.join(
  REPO,
  'build',
  'steamclient-layer',
  'steamclient-layer-cx26.3.0.39832',
  'detour-cx26.3.0.39832.bin'
)

// This is the one test that reads a real CrossOver file. It only reads it:
// nothing is copied, written or committed.
const maybe =
  existsSync(NTDLL) && existsSync(PAYLOAD) ? describe : describe.skip

const sha = (b: Buffer) => createHash('sha256').update(b).digest('hex')

maybe('applyNtdllPatch against real CrossOver 26.3.0.39832', () => {
  it('finds the allowlist row for the installed ntdll', () => {
    expect(findNtdllPatchRow(BUILD, sha(readFileSync(NTDLL)))).toBe(
      NTDLL_PATCH_ROWS[BUILD]
    )
  })

  it('reproduces the pinned patched sha256', () => {
    const r = applyNtdllPatch(
      readFileSync(NTDLL),
      readFileSync(PAYLOAD),
      NTDLL_PATCH_ROWS[BUILD]
    )
    expect(r.status).toBe('patched')
    if (r.status === 'patched') {
      expect(sha(r.bytes)).toBe(
        'c0e21a9a5250f0a97c08d3c3e1798566255387213e2553b1e555264fb9ded97e'
      )
    }
  })
})
