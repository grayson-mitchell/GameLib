import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

import {
  createSteamInstallAppRun,
  requestSteamInstallApp,
  requestSteamUninstallApp
} from '../steamInstallApp'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/constants/paths', () => ({
  steamBridgeHelperPath: '/nonexistent/steam-bridge-helper'
}))
jest.mock('node:fs', () => ({
  ...jest.requireActual('node:fs'),
  existsSync: jest.fn()
}))

import { existsSync } from 'node:fs'

const mockedExists = existsSync as jest.Mock

const runWith = (stdout: string, code: number | null = 0, stderr = '') =>
  jest.fn().mockResolvedValue({ stdout, stderr, code })

describe('requestSteamInstallApp', () => {
  beforeEach(() => {
    mockedExists.mockReturnValue(true)
  })

  it('maps an ok line', async () => {
    const run = runWith(
      '{"result":"ok","appId":440,"folderIndex":1,"eAppUpdateError":0}\n'
    )
    await expect(
      requestSteamInstallApp(
        '440',
        { libraryPath: '/lib' },
        { helperPath: '/h', run }
      )
    ).resolves.toEqual({ kind: 'ok', folderIndex: 1 })
    expect(run).toHaveBeenCalledWith(
      '/h',
      ['--steam-installapp', '440', '--library', '/lib'],
      expect.any(Number)
    )
  })

  it('omits --library when undefined', async () => {
    const run = runWith('{"result":"ok","folderIndex":0}')
    await requestSteamInstallApp('440', {}, { helperPath: '/h', run })
    expect(run.mock.calls[0][1]).toEqual(['--steam-installapp', '440'])
  })

  it('maps an unavailable line', async () => {
    const run = runWith(
      '{"result":"unavailable","reason":"steam-not-running"}',
      2
    )
    await expect(
      requestSteamInstallApp('440', {}, { helperPath: '/h', run })
    ).resolves.toEqual({ kind: 'unavailable', reason: 'steam-not-running' })
  })

  it('maps an error line', async () => {
    const run = runWith('{"result":"error","eAppUpdateError":18}', 3)
    await expect(
      requestSteamInstallApp('440', {}, { helperPath: '/h', run })
    ).resolves.toEqual({ kind: 'error', code: 18 })
  })

  it('uses the last non-empty stdout line', async () => {
    const run = runWith('noise\n{"result":"ok","folderIndex":0}\n\n')
    await expect(
      requestSteamInstallApp('440', {}, { helperPath: '/h', run })
    ).resolves.toEqual({ kind: 'ok', folderIndex: 0 })
  })

  it('maps no JSON, a timeout and a rejected run to helper-failed', async () => {
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        { helperPath: '/h', run: runWith('garbage', 1) }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        { helperPath: '/h', run: runWith('', null) }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        {
          helperPath: '/h',
          run: jest.fn().mockRejectedValue(new Error('boom'))
        }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
  })

  it('maps a missing helper binary to helper-missing without spawning', async () => {
    mockedExists.mockReturnValue(false)
    const run = jest.fn()
    await expect(
      requestSteamInstallApp('440', {}, { helperPath: '/h', run })
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-missing' })
    expect(run).not.toHaveBeenCalled()
  })

  it('never spawns for a non-digit appId', async () => {
    const run = jest.fn()
    await expect(
      requestSteamInstallApp('4;40', {}, { helperPath: '/h', run })
    ).resolves.toEqual({ kind: 'unavailable', reason: 'bad-appid' })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('requestSteamUninstallApp (quick 261106-s3n)', () => {
  const deps = (run: jest.Mock) => ({
    helperPath: '/h',
    run,
    platform: 'darwin' as const
  })

  beforeEach(() => {
    mockedExists.mockReturnValue(true)
  })

  it('maps an ok line and passes exactly the uninstall argv', async () => {
    const run = runWith('{"result":"ok","appId":440,"eAppUpdateError":0}')
    await expect(requestSteamUninstallApp('440', deps(run))).resolves.toEqual({
      kind: 'ok'
    })
    expect(run).toHaveBeenCalledWith(
      '/h',
      ['--steam-uninstallapp', '440'],
      expect.any(Number)
    )
  })

  it('maps error 18 with installedApps 0', async () => {
    const run = runWith(
      '{"result":"error","eAppUpdateError":18,"installedApps":0}',
      3
    )
    await expect(requestSteamUninstallApp('440', deps(run))).resolves.toEqual({
      kind: 'error',
      code: 18,
      installedApps: 0
    })
  })

  it.each([
    ['missing', '{"result":"error","eAppUpdateError":18}'],
    ['-1', '{"result":"error","eAppUpdateError":18,"installedApps":-1}']
  ])('maps %s installedApps to null', async (_n, line) => {
    await expect(
      requestSteamUninstallApp('440', deps(runWith(line, 3)))
    ).resolves.toEqual({ kind: 'error', code: 18, installedApps: null })
  })

  it('maps an unavailable line', async () => {
    const run = runWith('{"result":"unavailable","reason":"not-signed-in"}', 2)
    await expect(requestSteamUninstallApp('440', deps(run))).resolves.toEqual({
      kind: 'unavailable',
      reason: 'not-signed-in'
    })
  })

  it('maps no JSON, a timeout and a rejected run to helper-failed', async () => {
    for (const run of [
      runWith('garbage', 1),
      runWith('', null),
      jest.fn().mockRejectedValue(new Error('boom'))
    ]) {
      await expect(requestSteamUninstallApp('440', deps(run))).resolves.toEqual(
        { kind: 'unavailable', reason: 'helper-failed' }
      )
    }
  })

  it('maps a missing helper to helper-missing without spawning', async () => {
    mockedExists.mockReturnValue(false)
    const run = jest.fn()
    await expect(requestSteamUninstallApp('440', deps(run))).resolves.toEqual({
      kind: 'unavailable',
      reason: 'helper-missing'
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('never spawns for a non-digit appId', async () => {
    const run = jest.fn()
    await expect(requestSteamUninstallApp('4;40', deps(run))).resolves.toEqual({
      kind: 'unavailable',
      reason: 'bad-appid'
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('reports unsupported-platform off darwin without spawning', async () => {
    const run = jest.fn()
    await expect(
      requestSteamUninstallApp('440', { ...deps(run), platform: 'linux' })
    ).resolves.toEqual({ kind: 'unavailable', reason: 'unsupported-platform' })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('createSteamInstallAppRun (scripted runner)', () => {
  const helper = (result: object) =>
    createScriptedRunner([{ cmd: '/h', result }])

  it('passes the caller timeout, a 64 KiB cap and no env through to the runner', async () => {
    const runner = helper({ code: 0, stdout: 'out', stderr: 'err' })
    await expect(
      createSteamInstallAppRun({ runner })('/h', ['--x'], 30000)
    ).resolves.toEqual({ stdout: 'out', stderr: 'err', code: 0 })
    expect(runner.calls[0]?.opts).toMatchObject({
      timeoutMs: 30000,
      maxBufferBytes: 64 * 1024,
      stdin: ''
    })
    expect(runner.calls[0]?.env).toBeUndefined()
  })

  it('keeps a non-zero exit code', async () => {
    const runner = helper({ code: 2, stdout: '{"result":"unavailable"}' })
    await expect(
      createSteamInstallAppRun({ runner })('/h', [], 1000)
    ).resolves.toMatchObject({ code: 2 })
  })

  it.each([
    ['timed out', { code: null, timedOut: true }],
    ['truncated', { code: 0, truncated: true }]
  ])('maps a %s helper to code null', async (_n, result) => {
    const runner = helper(result)
    await expect(
      createSteamInstallAppRun({ runner })('/h', [], 1000)
    ).resolves.toMatchObject({ code: null })
  })

  it('maps a spawn error to code null without rejecting', async () => {
    const runner = createScriptedRunner([
      { cmd: '/h', error: { code: 'ENOENT' } }
    ])
    await expect(
      createSteamInstallAppRun({ runner })('/h', [], 1000)
    ).resolves.toEqual({ stdout: '', stderr: '', code: null })
  })
})
