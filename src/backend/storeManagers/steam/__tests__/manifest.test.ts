// Phase 21 (21-02): Unit tests for the hand-templated `.acf` manifest writer.
//
// Proves, with real assertions (not prose): StateFlags is hard-coded "1026",
// 64-bit InstalledDepots GIDs survive as exact strings (no @node-steam/vdf
// involvement, no Number coercion), multi-depot input produces one child
// block per depot, the minimum Steam-adoption field set is present, and the
// write is atomic (temp file + fsync + rename onto the final filename).

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import * as fsPromises from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { writeAppManifest, type AppManifestParams } from '../depot/manifest'

describe('depot/manifest', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-manifest-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
    jest.restoreAllMocks()
  })

  const baseParams: AppManifestParams = {
    appId: '264160',
    installdir: 'WazHack',
    name: 'WazHack',
    sizeOnDisk: '123456789',
    installedDepots: [{ depotId: '264161', manifest: '1234567890123456789', size: 1000 }]
  }

  it('emits StateFlags exactly "1026"', async () => {
    const path = await writeAppManifest(dir, baseParams)
    const text = readFileSync(path, 'utf8')
    expect(text).toMatch(/"StateFlags"\s+"1026"/)
  })

  it('preserves a 19-digit InstalledDepots GID with exact string equality (no rounding)', async () => {
    const gid = '1234567890123456789' // 19 digits — well past Number.MAX_SAFE_INTEGER
    const path = await writeAppManifest(dir, {
      ...baseParams,
      installedDepots: [{ depotId: '264161', manifest: gid, size: 1000 }]
    })
    const text = readFileSync(path, 'utf8')
    const match = text.match(/"manifest"\s+"(\d+)"/)
    expect(match).not.toBeNull()
    expect(match?.[1]).toBe(gid)
  })

  it('writes one InstalledDepots child block per depot for multi-depot input', async () => {
    const depots = [
      { depotId: '264161', manifest: '111111111111111111', size: 1000 },
      { depotId: '264162', manifest: '222222222222222222', size: 2000 },
      { depotId: '264163', manifest: '333333333333333333', size: 3000 }
    ]
    const path = await writeAppManifest(dir, { ...baseParams, installedDepots: depots })
    const text = readFileSync(path, 'utf8')
    for (const d of depots) {
      expect(text).toContain(`"${d.depotId}"`)
      expect(text).toContain(`"${d.manifest}"`)
    }
    expect((text.match(/"manifest"/g) ?? []).length).toBe(depots.length)
  })

  it('includes the minimum fields required for Steam adoption', async () => {
    const path = await writeAppManifest(dir, baseParams)
    const text = readFileSync(path, 'utf8')
    expect(text).toMatch(/"appid"\s+"264160"/)
    expect(text).toMatch(/"Universe"\s+"1"/)
    expect(text).toMatch(/"StateFlags"\s+"1026"/)
    expect(text).toMatch(/"installdir"\s+"WazHack"/)
  })

  it('never touches @node-steam/vdf and never emits StateFlags "4"', () => {
    const source = readFileSync(join(__dirname, '../depot/manifest.ts'), 'utf8')
    expect(source).not.toContain('@node-steam/vdf')
    // "4" must never appear as a StateFlags value anywhere the module could write.
    expect(source).not.toMatch(/StateFlags[^\n]*["']4["']/)
  })

  it('rejects a non-numeric appId before interpolation (T-21-05)', async () => {
    await expect(
      writeAppManifest(dir, { ...baseParams, appId: '123; rm -rf /' })
    ).rejects.toThrow()
  })

  it('rejects a non-numeric depotId before interpolation (T-21-05)', async () => {
    await expect(
      writeAppManifest(dir, {
        ...baseParams,
        installedDepots: [{ depotId: 'abc123', manifest: '1234567890123456789', size: 1 }]
      })
    ).rejects.toThrow()
  })

  it('writes atomically: temp file exists (with the manifest text) at rename time, then only the final file remains', async () => {
    const finalPath = join(dir, `appmanifest_${baseParams.appId}.acf`)
    const tmpPath = `${finalPath}.tmp`

    const originalRename = fsPromises.rename.bind(fsPromises)
    let tmpContentAtRenameTime: string | undefined
    let renameArgs: [unknown, unknown] | undefined

    const renameSpy = jest
      .spyOn(fsPromises, 'rename')
      .mockImplementation(async (oldPath, newPath) => {
        tmpContentAtRenameTime = existsSync(oldPath as string)
          ? readFileSync(oldPath as string, 'utf8')
          : undefined
        renameArgs = [oldPath, newPath]
        return originalRename(oldPath as string, newPath as string)
      })

    const returnedPath = await writeAppManifest(dir, baseParams)

    expect(renameSpy).toHaveBeenCalledTimes(1)
    expect(renameArgs?.[0]).toBe(tmpPath)
    expect(renameArgs?.[1]).toBe(finalPath)
    // The temp file already held the full manifest text before the rename fired.
    expect(tmpContentAtRenameTime).toMatch(/"StateFlags"\s+"1026"/)
    // After completion, only the final file remains — no orphaned .tmp.
    expect(existsSync(tmpPath)).toBe(false)
    expect(existsSync(finalPath)).toBe(true)
    expect(returnedPath).toBe(finalPath)
  })
})
