import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  isAcfUpdatePending,
  readAcfUpdateState,
  type AcfUpdateFields
} from '../library/acfUpdateState'

const FIX = join(__dirname, 'fixtures', 'steamUpdate')

const base: AcfUpdateFields = {
  steamappsDir: '/x',
  buildid: '100',
  targetBuildId: '100',
  stateFlags: 4,
  bytesToDownload: 100,
  bytesDownloaded: 100,
  scheduledAutoUpdate: 0
}

describe('isAcfUpdatePending', () => {
  it('flags bit 0x2 and a differing TargetBuildID', () => {
    expect(isAcfUpdatePending({ ...base, stateFlags: 6 })).toBe(true)
    expect(isAcfUpdatePending({ ...base, targetBuildId: '200' })).toBe(true)
  })
  it('ignores TargetBuildID 0/absent and stale counters', () => {
    expect(isAcfUpdatePending({ ...base, targetBuildId: '0' })).toBe(false)
    expect(isAcfUpdatePending({ ...base, targetBuildId: undefined })).toBe(
      false
    )
    expect(isAcfUpdatePending(base)).toBe(false)
  })
  it('counts a scheduled update only with bytes outstanding', () => {
    expect(
      isAcfUpdatePending({
        ...base,
        scheduledAutoUpdate: 5,
        bytesToDownload: 200,
        bytesDownloaded: 0
      })
    ).toBe(true)
    expect(isAcfUpdatePending({ ...base, scheduledAutoUpdate: 5 })).toBe(false)
  })
})

describe('readAcfUpdateState', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'acfupd-'))
    mkdirSync(join(dir, 'steamapps'))
    writeFileSync(
      join(dir, 'steamapps', 'libraryfolders.vdf'),
      `"libraryfolders"
{
"0"
{
"path" "${dir}"
}
}
`
    )
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const deps = () =>
    ({
      config: { getSettings: () => ({ defaultSteamPath: dir }) }
    }) as never

  it('reads the pending and current fixtures from native roots', async () => {
    copyFileSync(
      join(FIX, 'acf-pending.acf'),
      join(dir, 'steamapps', 'appmanifest_333300.acf')
    )
    const pending = await readAcfUpdateState(deps(), '333300', 'native')
    expect(pending).toMatchObject({
      buildid: '3512046',
      targetBuildId: '5820078',
      stateFlags: 6
    })
    expect(isAcfUpdatePending(pending!)).toBe(true)

    copyFileSync(
      join(FIX, 'acf-current.acf'),
      join(dir, 'steamapps', 'appmanifest_333300.acf')
    )
    const current = await readAcfUpdateState(deps(), '333300', 'native')
    expect(current?.betaKey).toBe('release-101')
    expect(isAcfUpdatePending(current!)).toBe(false)
  })

  it('returns null for a corrupt or missing manifest', async () => {
    expect(await readAcfUpdateState(deps(), '1', 'native')).toBeNull()
    writeFileSync(join(dir, 'steamapps', 'appmanifest_1.acf'), '\u0000{{{')
    expect(await readAcfUpdateState(deps(), '1', 'native')).toBeNull()
  })
})
