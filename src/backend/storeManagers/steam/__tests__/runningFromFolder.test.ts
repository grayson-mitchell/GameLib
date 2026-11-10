import { spawn } from 'child_process'
import type { ChildProcess } from 'child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'

import { createRealRunner } from 'backend/testUtils/realRunner'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

import {
  findPidsRunningFromFolder,
  isProcessRunningFromFolder,
  psOutputHasFolder,
  psOutputPidsInFolder
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

describe('psOutputPidsInFolder', () => {
  const folder = '/x/common/WazHack'
  it('returns pids whose executable is inside the folder', () => {
    const out = [
      '  500 /x/common/WazHack/WazHack.app/Contents/MacOS/WazHack -a b',
      '  200 /x/common/WazHack/helper',
      '  600 /x/common/WazHack2/run',
      '  601 /usr/bin/tail -f /x/common/WazHack/log.txt',
      '  602 /x/common/WazHack/steam_osx',
      '  603 /x/common/WazHack/steamwebhelper --x',
      '  604 /x/common/WazHack/Steam.AppBundle/Steam/x',
      '    1 /x/common/WazHack/init',
      '  700 /x/common/WazHack/self',
      'garbage line',
      ''
    ].join('\n')
    expect(psOutputPidsInFolder(out, folder, [700])).toEqual([200, 500])
  })
  it('matches folders with spaces', () => {
    expect(
      psOutputPidsInFolder(
        '  9 /x/common/Schedule I/Schedule I.app/Contents/MacOS/x',
        '/x/common/Schedule I'
      )
    ).toEqual([9])
  })
  it.each(['', 'relative/dir', '/'])('throws on folder %p', (f) => {
    expect(() => psOutputPidsInFolder('1 x', f)).toThrow()
  })
})

describe('findPidsRunningFromFolder (scripted runner)', () => {
  const folder = '/x/common/WazHack'
  const psStep = {
    cmd: '/bin/ps',
    argv: ['-A', '-ww', '-o', 'pid=,args='],
    result: { code: 0, stdout: '  42 /x/common/WazHack/run\n' }
  }
  it('runs ps with a timeout and parses', async () => {
    const runner = createScriptedRunner([psStep])
    await expect(
      findPidsRunningFromFolder({ runner, platform: 'darwin' }, folder)
    ).resolves.toEqual([42])
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 2000 })
  })
  it('win32 and bad folder make no calls', async () => {
    const runner = createScriptedRunner([])
    await expect(
      findPidsRunningFromFolder({ runner, platform: 'win32' }, folder)
    ).resolves.toEqual([])
    await expect(
      findPidsRunningFromFolder({ runner, platform: 'darwin' }, '')
    ).rejects.toThrow()
    expect(runner.calls).toHaveLength(0)
  })
  it.each([{ code: 1 }, { code: null, timedOut: true }])(
    'throws on ps failure %p',
    async (result) => {
      const runner = createScriptedRunner([{ ...psStep, result }])
      await expect(
        findPidsRunningFromFolder({ runner, platform: 'linux' }, folder)
      ).rejects.toThrow()
    }
  )
})

describe('isProcessRunningFromFolder (scripted runner)', () => {
  const folder = '/x/common/WazHack'
  const ps = (result: object) => ({
    cmd: '/bin/ps',
    argv: ['-A', '-ww', '-o', 'args='],
    result
  })
  it('true on match, false without; ps argv, stdin, fake-HOME env and 2000 ms bound', async () => {
    const runner = createScriptedRunner([
      ps({ code: 0, stdout: '/x/common/WazHack/run\n' }),
      ps({ code: 0, stdout: '/other/run\n' })
    ])
    await expect(
      isProcessRunningFromFolder({ runner, platform: 'darwin' }, folder)
    ).resolves.toBe(true)
    await expect(
      isProcessRunningFromFolder({ runner, platform: 'darwin' }, folder)
    ).resolves.toBe(false)
    const call = runner.calls[0]
    expect(call?.opts).toMatchObject({
      timeoutMs: 2000,
      stdin: '',
      replaceEnv: true
    })
    // Fake-HOME env, never the operator's real profile.
    expect(call?.env?.HOME).toBeDefined()
    expect(call?.env?.HOME).not.toBe(process.env.HOME)
  })
  it('rejects when ps times out or exits non-zero', async () => {
    const timedOut = createScriptedRunner([ps({ code: null, timedOut: true })])
    await expect(
      isProcessRunningFromFolder(
        { runner: timedOut, platform: 'linux' },
        folder
      )
    ).rejects.toThrow('timed out')
    const failed = createScriptedRunner([ps({ code: 1 })])
    await expect(
      isProcessRunningFromFolder({ runner: failed, platform: 'linux' }, folder)
    ).rejects.toThrow('ps exited 1')
  })
  it('rejects a bad folder before spawning', async () => {
    const runner = createScriptedRunner([])
    await expect(
      isProcessRunningFromFolder({ runner, platform: 'darwin' }, '')
    ).rejects.toThrow()
    expect(runner.calls).toHaveLength(0)
  })
  it('win32 returns false without spawning', async () => {
    const runner = createScriptedRunner([])
    await expect(
      isProcessRunningFromFolder({ runner, platform: 'win32' }, folder)
    ).resolves.toBe(false)
    expect(runner.calls).toHaveLength(0)
  })
})

const realDescribe = process.platform === 'win32' ? describe.skip : describe
realDescribe('isProcessRunningFromFolder (real ps)', () => {
  let tmp: string
  let child: ChildProcess
  let profile: ReturnType<typeof createFakeHomeProfile>
  let real: ReturnType<typeof createRealRunner>

  beforeAll(() => {
    tmp = mkdtempSync(join(tmpdir(), 'gamelib-runfolder-'))
    writeFileSync(join(tmp, 'hold.sh'), 'sleep 30\n')
    profile = createFakeHomeProfile({ prefix: 'gamelib-runfolder-test-' })
    child = spawn('/bin/sh', [join(tmp, 'hold.sh')], {
      env: profile.childEnv(),
      stdio: 'ignore'
    })
    child.unref()
    real = createRealRunner()
  })
  afterAll(() => {
    child.kill('SIGKILL')
    real.dispose()
    profile.dispose()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('finds the process by its folder, not a sibling', async () => {
    const deps = { runner: real.runner }
    await expect(isProcessRunningFromFolder(deps, tmp)).resolves.toBe(true)
    await expect(isProcessRunningFromFolder(deps, tmp + '2')).resolves.toBe(
      false
    )
  })
})
