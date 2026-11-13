import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { fsBackedSteamFiles } from './fixtures/stubRustSteamFiles'

const acf = (appid: string, flags: string) =>
  `"AppState"\n{\n\t"appid"\t\t"${appid}"\n\t"StateFlags"\t\t"${flags}"\n\t"installdir"\t\t"Game"\n\t"InstalledDepots"\n\t{\n\t\t"111"\n\t\t{\n\t\t\t"manifest"\t\t"999"\n\t\t\t"size"\t\t"5"\n\t\t}\n\t}\n}\n`

describe('fsBackedSteamFiles', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'stub-steamfiles-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('reads an ACF record', async () => {
    const path = join(dir, 'appmanifest_10.acf')
    writeFileSync(path, acf('10', '4'))
    const { requestRustInvoke } = fsBackedSteamFiles()
    const r = (await requestRustInvoke('steamfiles_read_acf', [{ path }])) as {
      exists: boolean
      parsed: boolean
      record: Record<string, unknown>
    }
    expect(r.exists).toBe(true)
    expect(r.parsed).toBe(true)
    expect(r.record).toMatchObject({
      appid: '10',
      stateFlags: 4,
      installdir: 'Game',
      installedDepots: [
        { depotId: '111', manifest: '999', size: '5', dlcAppId: null }
      ]
    })
  })

  it('reports missing and unparsed files', async () => {
    const bad = join(dir, 'bad.acf')
    writeFileSync(bad, 'nothing here')
    const { requestRustInvoke } = fsBackedSteamFiles()
    expect(
      await requestRustInvoke('steamfiles_read_acf', [
        { path: join(dir, 'nope.acf') }
      ])
    ).toMatchObject({ exists: false })
    expect(
      await requestRustInvoke('steamfiles_read_acf', [{ path: bad }])
    ).toMatchObject({ exists: true, parsed: false })
  })

  it('scans, finds, and reads library folders and running app id', async () => {
    const a = join(dir, 'a')
    const b = join(dir, 'b')
    mkdirSync(a)
    mkdirSync(b)
    writeFileSync(join(a, 'appmanifest_2.acf'), acf('2', '4'))
    writeFileSync(join(a, 'appmanifest_1.acf'), acf('1', '4'))
    writeFileSync(join(b, 'appmanifest_3.acf'), acf('3', '1026'))
    const vdf = join(dir, 'libraryfolders.vdf')
    writeFileSync(
      vdf,
      '"libraryfolders"\n{\n"0"\n{\n"path"\t\t"/x/y"\n}\n"1"\n{\n"path"\t\t"/z"\n}\n}\n'
    )
    const reg = join(dir, 'registry.vdf')
    writeFileSync(reg, '"Steam"\n{\n"RunningAppID"\t\t"42"\n}\n')
    const { requestRustInvoke } = fsBackedSteamFiles()

    const scan = (await requestRustInvoke('steamfiles_scan_acfs', [
      { steamappsDirs: [a, b, join(dir, 'gone')] }
    ])) as { records: { fileName: string }[]; missingDirs: string[] }
    expect(scan.records.map((r) => r.fileName)).toEqual([
      'appmanifest_1.acf',
      'appmanifest_2.acf',
      'appmanifest_3.acf'
    ])
    expect(scan.missingDirs).toEqual([join(dir, 'gone')])

    expect(
      await requestRustInvoke('steamfiles_find_acf', [
        { steamappsDirs: [a, b], appId: '3' }
      ])
    ).toMatchObject({ found: true, steamappsDir: b })
    expect(
      await requestRustInvoke('steamfiles_read_library_folders', [
        { path: vdf }
      ])
    ).toMatchObject({ parsed: true, paths: ['/x/y', '/z'] })
    expect(
      await requestRustInvoke('steamfiles_read_running_app_id', [{ path: reg }])
    ).toEqual({ runningAppId: 42 })
    expect(
      await requestRustInvoke('steamfiles_read_running_app_id', [
        { path: join(dir, 'none') }
      ])
    ).toEqual({ runningAppId: 0 })
  })

  it('rejects unstubbed channels and honours overrides', async () => {
    const { requestRustInvoke } = fsBackedSteamFiles({
      steamfiles_read_running_app_id: () => ({ runningAppId: 7 })
    })
    await expect(
      requestRustInvoke('steamfiles_shortcuts_read', [{ path: 'x' }])
    ).rejects.toThrow('unstubbed steamfiles channel steamfiles_shortcuts_read')
    expect(
      await requestRustInvoke('steamfiles_read_running_app_id', [{ path: 'x' }])
    ).toEqual({ runningAppId: 7 })
  })
})
