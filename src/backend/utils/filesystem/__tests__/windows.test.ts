import fs from 'fs'
import os from 'os'
import type { FileHandle } from 'fs/promises'
import * as util_os_processes from '../../os/processes'
import { getDiskInfo_windows, isWritable_windows } from '../windows'
import type { Path } from 'backend/schemas'

describe('getDiskInfo_windows', () => {
  it('Works with root path', async () => {
    const spawnWrapperSpy = jest
      .spyOn(util_os_processes, 'genericSpawnWrapper')
      .mockImplementation(async () => {
        return Promise.resolve({
          stdout: JSON.stringify([{ Caption: 'C:', FreeSpace: 10, Size: 100 }]),
          stderr: '',
          exitCode: null,
          signalName: null
        })
      })

    const ret = await getDiskInfo_windows('C:' as Path)
    expect(ret.totalSpace).toBe(100)
    expect(ret.freeSpace).toBe(10)
    expect(spawnWrapperSpy).toHaveBeenCalledWith('powershell', [
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
    ])
    expect(spawnWrapperSpy).toHaveBeenCalledTimes(1)
  })

  it('Works with nested path', async () => {
    const spawnWrapperSpy = jest
      .spyOn(util_os_processes, 'genericSpawnWrapper')
      .mockImplementation(async () => {
        return Promise.resolve({
          stdout: JSON.stringify([{ Caption: 'C:', FreeSpace: 10, Size: 100 }]),
          stderr: '',
          exitCode: null,
          signalName: null
        })
      })

    const ret = await getDiskInfo_windows('C:/foo/bar/baz' as Path)
    expect(ret.totalSpace).toBe(100)
    expect(ret.freeSpace).toBe(10)
    expect(spawnWrapperSpy).toHaveBeenCalledWith('powershell', [
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
    ])
    expect(spawnWrapperSpy).toHaveBeenCalledTimes(1)
  })
})

describe('isWritable_windows', () => {
  // MOCKED ARM -- runs on any host. These spy on `fs.promises` and
  // `genericSpawnWrapper`; they prove the new CONTROL FLOW (including that a
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
      const spawnSpy = jest
        .spyOn(util_os_processes, 'genericSpawnWrapper')
        .mockImplementation(async () =>
          Promise.resolve({
            stdout: JSON.stringify([
              {
                FileSystemRights: 2032127,
                IdentityReference: { Value: 'BUILTIN\\Administrators' }
              },
              {
                FileSystemRights: 2032127,
                IdentityReference: { Value: 'NT AUTHORITY\\SYSTEM' }
              },
              {
                FileSystemRights: 2032127,
                IdentityReference: {
                  Value: 'NT AUTHORITY\\Authenticated Users'
                }
              },
              {
                FileSystemRights: 2032127,
                IdentityReference: { Value: 'BUILTIN\\Users' }
              }
            ]),
            stderr: '',
            exitCode: null,
            signalName: null
          })
        )
      jest
        .spyOn(fs.promises, 'stat')
        .mockResolvedValue({ isDirectory: () => true } as fs.Stats)
      jest.spyOn(fs.promises, 'writeFile').mockResolvedValue(undefined)
      jest.spyOn(fs.promises, 'unlink').mockResolvedValue(undefined)

      const ret = await isWritable_windows('D:/SteamLibrary' as Path)

      expect(ret).toBe(true)
      expect(spawnSpy).not.toHaveBeenCalled()
    })

    it('single-entry ACL does not produce a false negative', async () => {
      // What `ConvertTo-Json -Compress` emits for a ONE-entry ACL: an
      // object, not an array. Pre-fix, `AccessControlEntry.array().parse()`
      // throws on this shape and the `catch` returns `false` -- a second,
      // independent false-`false` path.
      jest
        .spyOn(util_os_processes, 'genericSpawnWrapper')
        .mockImplementation(async () =>
          Promise.resolve({
            stdout: JSON.stringify({
              FileSystemRights: 2032127,
              IdentityReference: {
                Value: `some-domain\\${os.userInfo().username}`
              }
            }),
            stderr: '',
            exitCode: null,
            signalName: null
          })
        )
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
      const writePath = writeSpy.mock.calls[0][0] as string
      const unlinkPath = unlinkSpy.mock.calls[0][0] as string
      expect(unlinkPath).toBe(writePath)
      expect(unlinkPath.startsWith(targetDir)).toBe(true)
      expect(unlinkPath).not.toBe(targetDir)
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
