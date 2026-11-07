import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

import { buildCxbottleConf, writeCxbottleConf } from '../adoptBottle'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gamelib-adopt-'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('buildCxbottleConf', () => {
  it('returns exactly the seven minimal lines with a trailing newline', () => {
    expect(buildCxbottleConf('ABCD-1234')).toBe(
      [
        '[Bottle]',
        '"BottleID" = "ABCD-1234"',
        '"Encoding" = "UTF-8"',
        '"Template" = "win10_64"',
        '"MenuMode" = "ignore"',
        '"AssocMode" = "ignore"',
        '"WineArch" = "win64"',
        ''
      ].join('\n')
    )
  })

  it('has neither Timestamp nor Version', () => {
    const conf = buildCxbottleConf('X')
    expect(conf).not.toMatch(/Timestamp/)
    expect(conf).not.toMatch(/Version/)
  })
})

describe('writeCxbottleConf', () => {
  it('writes an uppercase UUID conf with mode 0644 and leaves no tmp file', () => {
    writeFileSync(join(dir, 'system.reg'), '')
    expect(writeCxbottleConf(dir)).toBe(true)
    const conf = readFileSync(join(dir, 'cxbottle.conf'), 'utf-8')
    expect(conf).toMatch(
      /"BottleID" = "[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}"/
    )
    expect(statSync(join(dir, 'cxbottle.conf')).mode & 0o777).toBe(0o644)
    expect(readdirSync(dir).filter((f) => f.includes('.tmp-'))).toEqual([])
  })

  it('refuses and leaves the file unchanged when a conf already exists', () => {
    writeFileSync(join(dir, 'system.reg'), '')
    writeFileSync(join(dir, 'cxbottle.conf'), 'original')
    expect(writeCxbottleConf(dir)).toBe(false)
    expect(readFileSync(join(dir, 'cxbottle.conf'), 'utf-8')).toBe('original')
  })

  it('refuses when system.reg does not exist', () => {
    expect(writeCxbottleConf(dir)).toBe(false)
    expect(existsSync(join(dir, 'cxbottle.conf'))).toBe(false)
  })
})
