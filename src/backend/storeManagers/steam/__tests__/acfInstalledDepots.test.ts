import { mkdtempSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  parseAcfInstalledDepots,
  readAcfInstalledDepots
} from '../acfInstalledDepots'

const FIX = join(__dirname, 'fixtures', 'steamUpdate')
const { readFileSync } = jest.requireActual('fs')

describe('parseAcfInstalledDepots', () => {
  it('keeps 19-digit manifest GIDs as exact strings', () => {
    const r = parseAcfInstalledDepots(
      readFileSync(join(FIX, 'acf-pending.acf'), 'utf-8')
    )
    expect(r.buildid).toBe('3512046')
    expect(r.installedDepots).toEqual([
      { depotId: '333302', manifest: '1547379086645511101', size: '570502668' }
    ])
    expect(r.installedDepots[0]?.manifest).toBe('1547379086645511101')
    expect(String(Number('1547379086645511101'))).not.toBe(
      '1547379086645511101'
    )
  })

  it('handles two depots, CRLF, odd whitespace, nested blocks and key case', () => {
    const text = [
      '"AppState"',
      '{',
      '"BuildID"   "42"',
      '"InstalledDepots"',
      '{',
      '"1"',
      '{ "Manifest" "9223372036854775807" "size" "5" }',
      '"2"',
      '{',
      '"manifest" "123"',
      '}',
      '"3"',
      '{ "manifest" "not-a-number" }',
      '}',
      '"UserConfig" { "language" "english" }',
      '}'
    ].join('\r\n')
    const r = parseAcfInstalledDepots(text)
    expect(r.buildid).toBe('42')
    expect(r.installedDepots.map((d) => d.manifest)).toEqual([
      '9223372036854775807',
      '123'
    ])
  })

  it('returns no depots but still the buildid without an InstalledDepots block', () => {
    expect(parseAcfInstalledDepots('"AppState" { "buildid" "7" }')).toEqual({
      buildid: '7',
      installedDepots: []
    })
  })

  it('reads from disk and returns null when missing or non-numeric appId', () => {
    const dir = mkdtempSync(join(tmpdir(), 'acfdepots-'))
    try {
      writeFileSync(
        join(dir, 'appmanifest_5.acf'),
        '"AppState" { "buildid" "1" }'
      )
      expect(readAcfInstalledDepots(dir, '5')?.buildid).toBe('1')
      expect(readAcfInstalledDepots(dir, '6')).toBeNull()
      expect(readAcfInstalledDepots(dir, '../5')).toBeNull()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
