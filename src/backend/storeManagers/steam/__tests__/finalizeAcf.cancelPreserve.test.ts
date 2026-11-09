import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { finalizeToSteam } from '../depot/finalizeAcf'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))
jest.mock('../user')

describe('finalizeToSteam cancel preserves an installed manifest', () => {
  let dir: string
  let acf: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'finalizeCancel-'))
    acf = join(dir, 'appmanifest_123.acf')
  })
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  const base = () => ({
    targetSteamappsDir: dir,
    installdir: 'Cool Game',
    name: 'Cool Game',
    depots: []
  })
  const manifest = (flags: string) =>
    `"AppState"\n{\n\t"appid"\t"123"\n\t"StateFlags"\t"${flags}"\n\t"buildid"\t"99"\n}\n`

  it('leaves a StateFlags 4 manifest byte-identical on outcome cancelled', async () => {
    writeFileSync(acf, manifest('4'))
    await finalizeToSteam('123', { ...base(), outcome: 'cancelled' })
    expect(readFileSync(acf, 'utf-8')).toBe(manifest('4'))
  })

  it('writes 1026 over a 1026 manifest', async () => {
    writeFileSync(acf, manifest('1026'))
    await finalizeToSteam('123', { ...base(), outcome: 'cancelled' })
    expect(readFileSync(acf, 'utf-8')).toContain('"StateFlags"\t\t"1026"')
    expect(readFileSync(acf, 'utf-8')).not.toBe(manifest('1026'))
  })

  it('writes 1026 when there is no manifest', async () => {
    await finalizeToSteam('123', { ...base(), outcome: 'cancelled' })
    expect(readFileSync(acf, 'utf-8')).toContain('"StateFlags"\t\t"1026"')
  })

  it('startup-resume finalize (outcome undefined) still writes over a 4 manifest', async () => {
    writeFileSync(acf, manifest('4'))
    await finalizeToSteam('123', base())
    expect(readFileSync(acf, 'utf-8')).toContain('"StateFlags"\t\t"1026"')
  })
})
