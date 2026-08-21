/**
 * Unit tests for applyDepotFileFlags (Phase 23-01, D-06) — EDepotFileFlag
 * ReadOnly(8)/Hidden(16) application. Windows attrib.exe calls are verified
 * via a mocked child_process.spawnSync (library.test.ts's windowsRunningAppId
 * precedent, __tests__/library.test.ts:2268-2294); POSIX chmod calls run for
 * real against a tmpdir (depot.test.ts's established real-fs discipline for
 * this module family).
 */
import { spawnSync } from 'child_process'
import {
  chmodSync,
  mkdtempSync,
  rmSync,
  statSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyDepotFileFlags } from '../depot/fileAttributes'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

jest.mock('child_process', () => ({
  spawnSync: jest.fn()
}))

const READONLY_FLAG = 8
const HIDDEN_FLAG = 16
const EXECUTABLE_FLAG = 32
const CUSTOM_EXECUTABLE_FLAG = 128

describe('applyDepotFileFlags — POSIX (darwin/linux)', () => {
  let dir: string
  let filePath: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-fileattrs-test-'))
    filePath = join(dir, 'game.bin')
    writeFileSync(filePath, 'content')
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('ReadOnly + Executable → chmod 0o555 (read+execute, no write)', async () => {
    const result = await applyDepotFileFlags(
      filePath,
      READONLY_FLAG | EXECUTABLE_FLAG,
      'darwin'
    )
    expect(result.ok).toBe(true)
    expect(statSync(filePath).mode & 0o777).toBe(0o555)
  })

  it('ReadOnly + CustomExecutable → chmod 0o555 (preserves the exec bit)', async () => {
    const result = await applyDepotFileFlags(
      filePath,
      READONLY_FLAG | CUSTOM_EXECUTABLE_FLAG,
      'linux'
    )
    expect(result.ok).toBe(true)
    expect(statSync(filePath).mode & 0o777).toBe(0o555)
  })

  it('ReadOnly only (no Executable) → chmod 0o444', async () => {
    const result = await applyDepotFileFlags(filePath, READONLY_FLAG, 'darwin')
    expect(result.ok).toBe(true)
    expect(statSync(filePath).mode & 0o777).toBe(0o444)
  })

  it('Hidden set, no ReadOnly → no rename, no throw, documented POSIX no-op', async () => {
    const before = statSync(filePath)
    const result = await applyDepotFileFlags(filePath, HIDDEN_FLAG, 'darwin')
    expect(result.ok).toBe(true)
    // Same path still resolves to the same inode — no rename to a
    // dot-prefixed "hidden" name occurred.
    const after = statSync(filePath)
    expect(after.ino).toBe(before.ino)
    expect(after.mode).toBe(before.mode)
  })

  it('neither ReadOnly nor Hidden set → no-op, mode left untouched', async () => {
    chmodSync(filePath, 0o644)
    const result = await applyDepotFileFlags(
      filePath,
      EXECUTABLE_FLAG,
      'darwin'
    )
    expect(result.ok).toBe(true)
    expect(statSync(filePath).mode & 0o777).toBe(0o644)
  })

  it('a chmod failure (nonexistent path) is reported via { ok: false }, never thrown', async () => {
    const missing = join(dir, 'does-not-exist.bin')
    await expect(
      applyDepotFileFlags(missing, READONLY_FLAG, 'darwin')
    ).resolves.toEqual(expect.objectContaining({ ok: false }))
  })
})

describe('applyDepotFileFlags — Windows (win32)', () => {
  beforeEach(() => {
    ;(spawnSync as jest.Mock).mockReset()
  })

  it('ReadOnly set → spawnSync("attrib", ["+R", path]) argv-form, windowsHide true', async () => {
    ;(spawnSync as jest.Mock).mockReturnValue({ status: 0 })
    const result = await applyDepotFileFlags(
      'C:\\Games\\game.exe',
      READONLY_FLAG,
      'win32'
    )
    expect(result.ok).toBe(true)
    expect(spawnSync).toHaveBeenCalledWith(
      'attrib',
      ['+R', 'C:\\Games\\game.exe'],
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('Hidden set → spawnSync("attrib", ["+H", path])', async () => {
    ;(spawnSync as jest.Mock).mockReturnValue({ status: 0 })
    const result = await applyDepotFileFlags(
      'C:\\Games\\game.exe',
      HIDDEN_FLAG,
      'win32'
    )
    expect(result.ok).toBe(true)
    expect(spawnSync).toHaveBeenCalledWith(
      'attrib',
      ['+H', 'C:\\Games\\game.exe'],
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('both ReadOnly and Hidden set → both flags as separate argv elements, path trailing', async () => {
    ;(spawnSync as jest.Mock).mockReturnValue({ status: 0 })
    const result = await applyDepotFileFlags(
      'C:\\Games\\game.exe',
      READONLY_FLAG | HIDDEN_FLAG,
      'win32'
    )
    expect(result.ok).toBe(true)
    expect(spawnSync).toHaveBeenCalledWith(
      'attrib',
      ['+R', '+H', 'C:\\Games\\game.exe'],
      expect.objectContaining({ windowsHide: true })
    )
  })

  it('a non-zero exit status is reported via { ok: false }, not thrown', async () => {
    ;(spawnSync as jest.Mock).mockReturnValue({
      status: 1,
      stderr: Buffer.from('access denied')
    })
    const result = await applyDepotFileFlags(
      'C:\\Games\\game.exe',
      READONLY_FLAG,
      'win32'
    )
    expect(result.ok).toBe(false)
  })

  it('a result.error (e.g. ENOENT spawning attrib) is reported via { ok: false }, not thrown', async () => {
    ;(spawnSync as jest.Mock).mockReturnValue({
      status: null,
      error: new Error('spawnSync attrib ENOENT')
    })
    const result = await applyDepotFileFlags(
      'C:\\Games\\game.exe',
      READONLY_FLAG,
      'win32'
    )
    expect(result.ok).toBe(false)
  })

  it('a thrown spawnSync error does not propagate out of applyDepotFileFlags', async () => {
    ;(spawnSync as jest.Mock).mockImplementation(() => {
      throw new Error('attrib.exe not available')
    })
    await expect(
      applyDepotFileFlags('C:\\Games\\game.exe', READONLY_FLAG, 'win32')
    ).resolves.toEqual(expect.objectContaining({ ok: false }))
  })

  it('neither ReadOnly nor Hidden set → spawnSync never called', async () => {
    const result = await applyDepotFileFlags(
      'C:\\Games\\game.exe',
      EXECUTABLE_FLAG,
      'win32'
    )
    expect(result.ok).toBe(true)
    expect(spawnSync).not.toHaveBeenCalled()
  })
})
