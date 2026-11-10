import fs from 'fs'
import path from 'path'
import type { FileHandle } from 'fs/promises'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { getDiskInfo_windows, isWritable_windows } from '../windows'
import type { Path } from 'backend/schemas'
import { defined } from 'backend/testUtils/indexed'

const PS_ARGV = [
  'Get-CimInstance',
  '-Class',
  'Win32_LogicalDisk',
  '-Property',
  'Caption,FreeSpace,Size',
  '|',
  'Select-Object',
  'Caption,FreeSpace,Size',
  '|',
  'ConvertTo-Json',
  '-Compress'
]
const DISKS = JSON.stringify([{ Caption: 'C:', FreeSpace: 10, Size: 100 }])

describe('getDiskInfo_windows', () => {
  it.each(['C:', 'C:/foo/bar/baz'])('Works with path %s', async (p) => {
    const runner = createScriptedRunner([
      { cmd: 'powershell', argv: PS_ARGV, result: { stdout: DISKS } }
    ])
    const ret = await getDiskInfo_windows({ runner }, p as Path)
    expect(ret.totalSpace).toBe(100)
    expect(ret.freeSpace).toBe(10)
    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 30_000 })
    runner.expectAllConsumed()
  })

  it('rejects when powershell cannot spawn', async () => {
    const runner = createScriptedRunner([
      { cmd: 'powershell', argv: PS_ARGV, error: { code: 'ENOENT' } }
    ])
    await expect(getDiskInfo_windows({ runner }, 'C:' as Path)).rejects.toThrow(
      'ENOENT'
    )
  })

  it('returns zeros on a timeout with no output', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'powershell',
        argv: PS_ARGV,
        result: { timedOut: true, code: null, signal: 'SIGKILL' }
      }
    ])
    expect(await getDiskInfo_windows({ runner }, 'C:' as Path)).toEqual({
      freeSpace: 0,
      totalSpace: 0
    })
  })

  it('returns zeros on a non-zero exit with no output', async () => {
    const runner = createScriptedRunner([
      { cmd: 'powershell', argv: PS_ARGV, result: { code: 1 } }
    ])
    expect(await getDiskInfo_windows({ runner }, 'C:' as Path)).toEqual({
      freeSpace: 0,
      totalSpace: 0
    })
  })
})

describe('isWritable_windows', () => {
  // MOCKED ARM -- runs on any host. These spy on `fs.promises` and
  // the ACL probe is gone; they prove the new CONTROL FLOW (including that a
  // group-only ACL no longer produces a false `false`, and that the
  // powershell spawn is gone) but say NOTHING about how Windows actually
  // adjudicates an ACL. Never cite this arm as evidence about real ACL
  // behaviour -- see the live arm below for that.
  describe('mocked (any host, proves control flow only)', () => {
    afterEach(() => {
      // `resetMocks: true` (src/backend/jest.config.js) clears mock
      // IMPLEMENTATIONS between tests but does NOT restore the originals.
      // Without this, a stubbed `fs.promises.writeFile` leaks into later
      // tests in this file -- including the live arm, which would then
      // silently probe a neutered `fs` and falsely "pass".
      jest.restoreAllMocks()
    })

    it('group-granted directory is writable (regression: the D:\\SteamLibrary shape)', async () => {
      // The exact ACL the todo measured for D:\SteamLibrary: four GROUP
      // identities, no per-user ACE at all.
      jest
        .spyOn(fs.promises, 'stat')
        .mockResolvedValue({ isDirectory: () => true } as fs.Stats)
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined)

      const ret = await isWritable_windows('D:/SteamLibrary' as Path)

      expect(ret).toBe(true)
    })

    it('single-entry ACL does not produce a false negative', async () => {
      // What `ConvertTo-Json -Compress` emits for a ONE-entry ACL: an
      // object, not an array. Pre-fix, `AccessControlEntry.array().parse()`
      // throws on this shape and the `catch` returns `false` -- a second,
      // independent false-`false` path.
      jest
        .spyOn(fs.promises, 'stat')
        .mockResolvedValue({ isDirectory: () => true } as fs.Stats)
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined)

      const ret = await isWritable_windows('C:/single-entry-acl' as Path)

      expect(ret).toBe(true)
    })

    // CONTRACT PRESERVATION -- deliberately green on both sides of the fix.
    // Asserts UNCHANGED behaviour (`getDiskInfo`'s "path does not have to
    // exist" contract, index.ts:9-12), not new behaviour. Do not read this
    // as RED evidence for the fix.
    it('nonexistent path stays false', async () => {
      const writeSpy = jest.spyOn(fs.promises, 'writeFile')
      jest
        .spyOn(fs.promises, 'stat')
        .mockRejectedValue(
          Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        )

      const ret = await isWritable_windows('C:/does-not-exist' as Path)

      expect(ret).toBe(false)
      expect(writeSpy).not.toHaveBeenCalled()
    })

    it('a refused write is not writable', async () => {
      jest
        .spyOn(fs.promises, 'stat')
        .mockResolvedValue({ isDirectory: () => true } as fs.Stats)
      jest
        .spyOn(fs.promises, 'writeFile')
        .mockRejectedValue(Object.assign(new Error('EPERM'), { code: 'EPERM' }))
      jest
        .spyOn(fs.promises, 'unlink')
        .mockRejectedValue(
          Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
        )

      // The awaited call resolving at all (rather than rejecting) already
      // proves the unlink rejection above was swallowed, not just the write
      // refusal.
      const ret = await isWritable_windows('C:/Program Files' as Path)

      expect(ret).toBe(false)
    })

    it('the probe file is always removed', async () => {
      jest
        .spyOn(fs.promises, 'stat')
        .mockResolvedValue({ isDirectory: () => true } as fs.Stats)
      const writeSpy = jest
        .spyOn(fs.promises, 'writeFile')
        .mockResolvedValue(undefined)
      const unlinkSpy = jest
        .spyOn(fs.promises, 'unlink')
        .mockResolvedValue(undefined)

      const targetDir = 'C:/SteamLibrary' as Path
      await isWritable_windows(targetDir)

      expect(unlinkSpy).toHaveBeenCalledTimes(1)
      const writePath = defined(
        writeSpy.mock.calls[0],
        'writeFile call'
      )[0] as string
      const unlinkPath = defined(
        unlinkSpy.mock.calls[0],
        'unlink call'
      )[0] as string
      expect(unlinkPath).toBe(writePath)
      // `path.join` normalizes separators (backslash on win32), so compare
      // via `path.dirname` rather than a raw string prefix against the
      // forward-slash `targetDir` literal.
      expect(path.dirname(unlinkPath)).toBe(path.normalize(targetDir))
      expect(unlinkPath).not.toBe(path.normalize(targetDir))
    })

    it('an unlink failure cannot change the verdict', async () => {
      jest
        .spyOn(fs.promises, 'stat')
        .mockResolvedValue({ isDirectory: () => true } as fs.Stats)
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
      jest
        .spyOn(fs.promises, 'unlink')
        .mockRejectedValue(Object.assign(new Error('EBUSY'), { code: 'EBUSY' }))

      await expect(isWritable_windows('C:/SteamLibrary' as Path)).resolves.toBe(
        true
      )
    })

    it('an existing non-directory is probed without mutation', async () => {
      jest
        .spyOn(fs.promises, 'stat')
        .mockResolvedValue({ isDirectory: () => false } as fs.Stats)
      const closeMock = jest.fn().mockResolvedValue(undefined)
      const openSpy = jest
        .spyOn(fs.promises, 'open')
        .mockResolvedValue({ close: closeMock } as unknown as FileHandle)
      const writeSpy = jest.spyOn(fs.promises, 'writeFile')

      const targetFile = 'C:/SteamLibrary/somefile.txt' as Path
      const ret = await isWritable_windows(targetFile)

      expect(ret).toBe(true)
      expect(openSpy).toHaveBeenCalledWith(targetFile, 'r+')
      expect(closeMock).toHaveBeenCalledTimes(1)
      expect(writeSpy).not.toHaveBeenCalled()
    })
  })

  // LIVE ARM -- opt-in, real filesystem, real ACLs. Writes a real (zero-byte,
  // immediately deleted) file into a real directory OUTSIDE the jest
  // containment root, so it must never run by default in CI. Set
  // GAMELIB_LIVE_WRITE_PROBE=1 on a real Windows box to exercise it. This is
  // the only arm in this file that says anything about real Windows
  // authorization -- D:\SteamLibrary is the exact path the todo measured as
  // FALSE.
  const liveProbe =
    process.platform === 'win32' && process.env.GAMELIB_LIVE_WRITE_PROBE === '1'
      ? describe
      : describe.skip

  liveProbe('live (opt-in, real Windows ACLs)', () => {
    it('D:\\SteamLibrary is writable', async () => {
      const ret = await isWritable_windows('D:/SteamLibrary' as Path)
      expect(ret).toBe(true)
    })

    it('a nonexistent path under D:\\SteamLibrary is not writable', async () => {
      const ret = await isWritable_windows(
        'D:/SteamLibrary/__gamelib_does_not_exist__' as Path
      )
      expect(ret).toBe(false)
    })
  })
})
