import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  isCurrentFullInstall,
  readAppManifestFlags
} from '../library/manifestFlags'

const noRust = {
  requestRustInvoke: () => Promise.reject(new Error('not used on the ts flag'))
}

describe('manifestFlags', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'manifestFlags-'))
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function acf(flags: string, buildid?: string) {
    const bid = buildid === undefined ? '' : `\t"buildid"\t"${buildid}"\n`
    writeFileSync(
      join(dir, 'appmanifest_123.acf'),
      `"AppState"\n{\n\t"appid"\t"123"\n\t"StateFlags"\t"${flags}"\n${bid}}\n`
    )
  }

  it('reads a well-formed manifest', async () => {
    acf('4', '25485521')
    await expect(readAppManifestFlags(noRust, dir, '123')).resolves.toEqual({
      stateFlags: 4,
      buildid: '25485521'
    })
  })

  it('returns null for missing, unparseable and NaN', async () => {
    await expect(readAppManifestFlags(noRust, dir, '123')).resolves.toBeNull()
    writeFileSync(join(dir, 'appmanifest_123.acf'), '\u0000{{{ not vdf')
    await expect(readAppManifestFlags(noRust, dir, '123')).resolves.toBeNull()
    acf('abc', '1')
    await expect(readAppManifestFlags(noRust, dir, '123')).resolves.toBeNull()
  })

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
