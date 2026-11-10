import fs from 'fs'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { getDiskInfo_unix } from '../unix'
import type { Path } from 'backend/schemas'

describe('getDiskInfo_unix', () => {
  it('Works with root path', async () => {
    const accessSyp = jest
      .spyOn(fs.promises, 'access')
      .mockImplementation(async () => Promise.resolve())
    const runner = createScriptedRunner([
      {
        cmd: 'df',
        match: () => true,
        result: {
          stdout:
            'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 100 90 10 90% /'
        }
      }
    ])

    const ret = await getDiskInfo_unix({ runner }, '/' as Path)
    expect(ret.totalSpace).toBe(100 * 1024)
    expect(ret.freeSpace).toBe(10 * 1024)
    expect(accessSyp).toHaveBeenCalledTimes(1)
    expect(runner.calls.map((c) => [c.cmd, c.argv])).toEqual([
      ['df', ['-P', '-k', '/']]
    ])
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 30_000 })
  })

  it('Works with nested path', async () => {
    const accessSyp = jest
      .spyOn(fs.promises, 'access')
      .mockImplementation(async (path) => {
        if (path === '/foo/bar/baz') {
          return Promise.reject(new Error())
        }
        return Promise.resolve()
      })
    const runner = createScriptedRunner([
      {
        cmd: 'df',
        match: () => true,
        result: {
          stdout:
            'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sda1 100 90 10 90% /foo/bar'
        }
      }
    ])

    const ret = await getDiskInfo_unix({ runner }, '/foo/bar/baz' as Path)
    expect(ret.totalSpace).toBe(100 * 1024)
    expect(ret.freeSpace).toBe(10 * 1024)
    expect(accessSyp).toHaveBeenCalledTimes(2)
    expect(runner.calls.map((c) => [c.cmd, c.argv])).toEqual([
      ['df', ['-P', '-k', '/foo/bar']]
    ])
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 30_000 })
  })

  it('rejects when df cannot spawn', async () => {
    jest.spyOn(fs.promises, 'access').mockImplementation(async () => undefined)
    const runner = createScriptedRunner([
      { cmd: 'df', match: () => true, error: { code: 'ENOENT' } }
    ])
    await expect(getDiskInfo_unix({ runner }, '/' as Path)).rejects.toThrow(
      'ENOENT'
    )
  })

  it('throws on a timed-out df with no output', async () => {
    jest.spyOn(fs.promises, 'access').mockImplementation(async () => undefined)
    const runner = createScriptedRunner([
      {
        cmd: 'df',
        match: () => true,
        result: { timedOut: true, code: null, signal: 'SIGKILL' }
      }
    ])
    await expect(getDiskInfo_unix({ runner }, '/' as Path)).rejects.toThrow(
      'no data line'
    )
  })

  it('throws on a non-zero df with no output', async () => {
    jest.spyOn(fs.promises, 'access').mockImplementation(async () => undefined)
    const runner = createScriptedRunner([
      { cmd: 'df', match: () => true, result: { code: 1 } }
    ])
    await expect(getDiskInfo_unix({ runner }, '/' as Path)).rejects.toThrow(
      'no data line'
    )
  })
})
