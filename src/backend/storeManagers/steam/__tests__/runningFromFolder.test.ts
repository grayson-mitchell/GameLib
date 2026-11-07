import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

import {
  isProcessRunningFromFolder,
  psOutputHasFolder
} from '../runningFromFolder'

describe('psOutputHasFolder', () => {
  const line = '/x/common/WazHack/WazHack.app/Contents/MacOS/WazHack'
  it('matches a process inside the folder, with or without trailing sep', () => {
    expect(psOutputHasFolder(`a\n${line}\nb`, '/x/common/WazHack')).toBe(true)
    expect(psOutputHasFolder(line, '/x/common/WazHack/')).toBe(true)
  })
  it('does not match a sibling with the same prefix', () => {
    expect(
      psOutputHasFolder('/x/common/WazHack2/run', '/x/common/WazHack')
    ).toBe(false)
  })
  it('matches folders containing spaces', () => {
    expect(
      psOutputHasFolder(
        '/x/common/Schedule I/Schedule I.app/Contents/MacOS/x',
        '/x/common/Schedule I'
      )
    ).toBe(true)
  })
  it.each(['', 'relative/dir', '/'])('throws on folder %p', (folder) => {
    expect(() => psOutputHasFolder('anything', folder)).toThrow()
  })
})

describe('isProcessRunningFromFolder (injected runner)', () => {
  const folder = '/x/common/WazHack'
  it('true on match, false without', async () => {
    await expect(
      isProcessRunningFromFolder(folder, {
        platform: 'darwin',
        runPs: async () => '/x/common/WazHack/run\n'
      })
    ).resolves.toBe(true)
    await expect(
      isProcessRunningFromFolder(folder, {
        platform: 'darwin',
        runPs: async () => '/other/run\n'
      })
    ).resolves.toBe(false)
  })
  it('rejects when the runner fails', async () => {
    await expect(
      isProcessRunningFromFolder(folder, {
        platform: 'linux',
        runPs: async () => {
          throw new Error('ps exited 1')
        }
      })
    ).rejects.toThrow('ps exited 1')
  })
  it('rejects a bad folder before spawning', async () => {
    const runPs = jest.fn().mockResolvedValue('')
    await expect(
      isProcessRunningFromFolder('', { platform: 'darwin', runPs })
    ).rejects.toThrow()
    expect(runPs).not.toHaveBeenCalled()
  })
  it('win32 returns false without spawning', async () => {
    const runPs = jest.fn()
    await expect(
      isProcessRunningFromFolder(folder, { platform: 'win32', runPs })
    ).resolves.toBe(false)
    expect(runPs).not.toHaveBeenCalled()
  })
})

const realDescribe = process.platform === 'win32' ? describe.skip : describe
realDescribe('isProcessRunningFromFolder (real ps)', () => {
  let tmp: string
  let child: ChildProcess
  let profile: ReturnType<typeof createFakeHomeProfile>

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'gamelib-runfolder-'))
    writeFileSync(join(tmp, 'hold.sh'), 'sleep 30\n')
    profile = createFakeHomeProfile({ prefix: 'gamelib-runfolder-test-' })
    child = spawn('/bin/sh', [join(tmp, 'hold.sh')], {
      env: profile.childEnv(),
      stdio: 'ignore'
    })
    child.unref()
  })
  afterAll(() => {
    child.kill('SIGKILL')
    profile.dispose()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('finds the process by its folder, not a sibling', async () => {
    await expect(isProcessRunningFromFolder(tmp)).resolves.toBe(true)
    await expect(isProcessRunningFromFolder(tmp + '2')).resolves.toBe(false)
  })
})
