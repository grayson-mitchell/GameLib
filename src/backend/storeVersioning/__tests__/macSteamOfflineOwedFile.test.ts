import {
  createVersioningHarness,
  type VersioningHarness
} from '../../testUtils/testStoreRoot'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { listBackups } from '../backup'
import {
  MAC_STEAM_OFFLINE_OWED_CHAIN,
  ensureMacSteamOfflineOwedMigrated,
  isMacSteamOfflineOwedReadOnly,
  macSteamOfflineOwedCodec,
  macSteamOfflineOwedVersion
} from '../macSteamOfflineOwedFile'

let root: string
let file: string

const legacy = (by: string) =>
  JSON.stringify({ since: '2026-11-01T10:00:00.000Z', by, pid: 4242 })

// One engine and tracker per test: nothing carries over between tests.
let h: VersioningHarness

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'gamelib-owed-'))
  file = join(root, 'mac-steam-offline-owed.json')
  h = createVersioningHarness()
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('macSteamOfflineOwedCodec', () => {
  let stderr: jest.SpyInstance
  beforeEach(() => {
    stderr = jest.spyOn(process.stderr, 'write').mockImplementation(() => true)
  })
  afterEach(() => stderr.mockRestore())

  it('reads integer versions, absent as 0, invalid as 0 with a data-free line', () => {
    expect(macSteamOfflineOwedCodec.read({ version: 1 })).toBe(1)
    expect(macSteamOfflineOwedCodec.read({})).toBe(0)
    expect(macSteamOfflineOwedCodec.read({ version: '1' })).toBe(0)
    expect(macSteamOfflineOwedCodec.read({ version: 1.5 })).toBe(0)
    expect(macSteamOfflineOwedCodec.read({ version: -1 })).toBe(0)
    expect(stderr).toHaveBeenCalledTimes(3)
  })

  it('writes a top-level version without mutating its input', () => {
    const input = { by: 'toggled' }
    expect(macSteamOfflineOwedCodec.write(input, 1)).toEqual({
      by: 'toggled',
      version: 1
    })
    expect(input).toEqual({ by: 'toggled' })
  })
})

describe('ensureMacSteamOfflineOwedMigrated', () => {
  it.each(['toggled', 'toggled-unconfirmed', 'guided'])(
    'adopts a legacy by=%s file byte-identically, 0o600, no backup',
    (by) => {
      writeFileSync(file, legacy(by), { mode: 0o600 })
      const before = readFileSync(file)
      ensureMacSteamOfflineOwedMigrated(h.versioning, file)
      expect(readFileSync(file).equals(before)).toBe(true)
      if (process.platform !== 'win32')
        expect(statSync(file).mode & 0o777).toBe(0o600)
      expect(listBackups(file)).toEqual([])
      expect(readdirSync(root)).toEqual(['mac-steam-offline-owed.json'])
      expect(isMacSteamOfflineOwedReadOnly(h.versioning, file)).toBe(false)
    }
  )

  it('leaves a v1-stamped file untouched and writable', () => {
    writeFileSync(file, JSON.stringify({ version: 1, by: 'toggled' }))
    const before = readFileSync(file)
    ensureMacSteamOfflineOwedMigrated(h.versioning, file)
    expect(readFileSync(file).equals(before)).toBe(true)
    expect(isMacSteamOfflineOwedReadOnly(h.versioning, file)).toBe(false)
  })

  it('treats a version-2 file as newer: read-only, untouched', () => {
    writeFileSync(file, JSON.stringify({ version: 2, by: 'toggled' }))
    const before = readFileSync(file)
    ensureMacSteamOfflineOwedMigrated(h.versioning, file)
    expect(isMacSteamOfflineOwedReadOnly(h.versioning, file)).toBe(true)
    expect(h.versioning.readOnlyReasonOf(file)).toBe('newer')
    expect(readFileSync(file).equals(before)).toBe(true)
  })

  it('has no opinion on malformed JSON', () => {
    writeFileSync(file, '{nope')
    expect(() =>
      ensureMacSteamOfflineOwedMigrated(h.versioning, file)
    ).not.toThrow()
    expect(readFileSync(file, 'utf8')).toBe('{nope')
    expect(isMacSteamOfflineOwedReadOnly(h.versioning, file)).toBe(false)
  })

  it('creates nothing for a missing file', () => {
    ensureMacSteamOfflineOwedMigrated(h.versioning, file)
    expect(existsSync(file)).toBe(false)
    expect(readdirSync(root)).toEqual([])
    expect(isMacSteamOfflineOwedReadOnly(h.versioning, file)).toBe(false)
  })

  it('is at v1, and a v2 migration migrates a legacy file with a backup', () => {
    expect(macSteamOfflineOwedVersion(h.versioning)).toBe(1)
    writeFileSync(file, legacy('toggled'), { mode: 0o600 })
    h.setMigrations(MAC_STEAM_OFFLINE_OWED_CHAIN, [
      { id: 't', to: 2, run: (d) => ({ ...d, extra: true }) }
    ])
    ensureMacSteamOfflineOwedMigrated(h.versioning, file)
    const live = JSON.parse(readFileSync(file, 'utf8'))
    expect(live.version).toBe(2)
    expect(live.extra).toBe(true)
    expect(live.pid).toBe(4242)
    expect(listBackups(file)).toHaveLength(1)
  })
})
