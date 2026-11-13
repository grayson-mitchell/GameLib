import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as logger from 'backend/logger'
import { stubRustSteamFiles } from '../localFiles/__tests__/fixtures/stubRustSteamFiles'
import type { AcfReadResult } from '../localFiles/steamFilesTypes'
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

describe('readAppManifestFlags on the rust flag', () => {
  const realEnv = process.env.GAMELIB_STEAMFILES_TEXT
  beforeEach(() => {
    process.env.GAMELIB_STEAMFILES_TEXT = 'rust'
    jest.spyOn(logger, 'logDebug').mockImplementation(() => undefined)
  })
  afterEach(() => {
    jest.restoreAllMocks()
    if (realEnv === undefined) delete process.env.GAMELIB_STEAMFILES_TEXT
    else process.env.GAMELIB_STEAMFILES_TEXT = realEnv
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
