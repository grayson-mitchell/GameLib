import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

import {
  createSteamInstallAppRun,
  requestSteamInstallApp,
  requestSteamUninstallApp,
  requestSteamValidateApp,
  VALIDATE_WAIT_TIMEOUT_MS
} from '../steamInstallApp'

jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
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
        { paths: { steamBridgeHelperPath: '/h' }, run }
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
    await requestSteamInstallApp(
      '440',
      {},
      { paths: { steamBridgeHelperPath: '/h' }, run }
    )
    expect(run.mock.calls[0][1]).toEqual(['--steam-installapp', '440'])
  })

  it('maps an unavailable line', async () => {
    const run = runWith(
      '{"result":"unavailable","reason":"steam-not-running"}',
      2
    )
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        { paths: { steamBridgeHelperPath: '/h' }, run }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'steam-not-running' })
  })

  it('maps an error line', async () => {
    const run = runWith('{"result":"error","eAppUpdateError":18}', 3)
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        { paths: { steamBridgeHelperPath: '/h' }, run }
      )
    ).resolves.toEqual({ kind: 'error', code: 18 })
  })

  it('uses the last non-empty stdout line', async () => {
    const run = runWith('noise\n{"result":"ok","folderIndex":0}\n\n')
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        { paths: { steamBridgeHelperPath: '/h' }, run }
      )
    ).resolves.toEqual({ kind: 'ok', folderIndex: 0 })
  })

  it('maps no JSON, a timeout and a rejected run to helper-failed', async () => {
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        { paths: { steamBridgeHelperPath: '/h' }, run: runWith('garbage', 1) }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        { paths: { steamBridgeHelperPath: '/h' }, run: runWith('', null) }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        {
          paths: { steamBridgeHelperPath: '/h' },
          run: jest.fn().mockRejectedValue(new Error('boom'))
        }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
  })

  it('maps a missing helper binary to helper-missing without spawning', async () => {
    mockedExists.mockReturnValue(false)
    const run = jest.fn()
    await expect(
      requestSteamInstallApp(
        '440',
        {},
        { paths: { steamBridgeHelperPath: '/h' }, run }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-missing' })
    expect(run).not.toHaveBeenCalled()
  })

  it('never spawns for a non-digit appId', async () => {
    const run = jest.fn()
    await expect(
      requestSteamInstallApp(
        '4;40',
        {},
        { paths: { steamBridgeHelperPath: '/h' }, run }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'bad-appid' })
    expect(run).not.toHaveBeenCalled()
  })
})

describe('requestSteamUninstallApp (quick 261106-s3n)', () => {
  const deps = (run: jest.Mock) => ({
    paths: { steamBridgeHelperPath: '/h' },
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

describe('requestSteamValidateApp (quick 261120-p2j)', () => {
  beforeEach(() => {
    mockedExists.mockReturnValue(true)
  })
  const deps = (run: jest.Mock) => ({
    paths: { steamBridgeHelperPath: '/h' },
    platform: 'darwin' as const,
    run
  })

  it('reports unsupported-platform off darwin without spawning', async () => {
    const run = jest.fn()
    await expect(
      requestSteamValidateApp(
        '440',
        { wait: true },
        { ...deps(run), platform: 'linux' }
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'unsupported-platform' })
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects a bad appId without spawning', async () => {
    const run = jest.fn()
    await expect(
      requestSteamValidateApp('4;40', { wait: false }, deps(run))
    ).resolves.toEqual({ kind: 'unavailable', reason: 'bad-appid' })
    expect(run).not.toHaveBeenCalled()
  })

  it('reports helper-missing when the binary is absent', async () => {
    mockedExists.mockReturnValue(false)
    const run = jest.fn()
    await expect(
      requestSteamValidateApp('440', { wait: true }, deps(run))
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-missing' })
    expect(run).not.toHaveBeenCalled()
  })

  it('passes --wait, the long timeout and the signal to run', async () => {
    const run = runWith(
      '{"result":"ok","tracked":true,"finished":true,"installState":4}'
    )
    const signal = new AbortController().signal
    await requestSteamValidateApp('440', { wait: true, signal }, deps(run))
    expect(run).toHaveBeenCalledWith(
      '/h',
      ['--steam-validateapp', '440', '--wait'],
      VALIDATE_WAIT_TIMEOUT_MS,
      signal
    )
  })

  it('without wait uses the short default timeout and no --wait', async () => {
    const run = runWith('{"result":"ok","tracked":false}')
    await requestSteamValidateApp('440', { wait: false }, deps(run))
    const [, args, timeout] = run.mock.calls[0]
    expect(args).toEqual(['--steam-validateapp', '440'])
    expect(timeout).toBeLessThan(VALIDATE_WAIT_TIMEOUT_MS)
  })

  it('maps ok tracked/finished', async () => {
    const run = runWith(
      '{"result":"ok","tracked":true,"finished":true,"installState":4}'
    )
    await expect(
      requestSteamValidateApp('440', { wait: true }, deps(run))
    ).resolves.toEqual({
      kind: 'ok',
      tracked: true,
      finished: true,
      installState: 4
    })
  })

  it('maps ok untracked and a stopped wait', async () => {
    await expect(
      requestSteamValidateApp(
        '440',
        { wait: true },
        deps(
          runWith(
            '{"result":"ok","tracked":false,"reason":"method-unverified:X"}'
          )
        )
      )
    ).resolves.toEqual({
      kind: 'ok',
      tracked: false,
      finished: false,
      installState: null,
      reason: 'method-unverified:X'
    })
    await expect(
      requestSteamValidateApp(
        '440',
        { wait: true },
        deps(
          runWith(
            '{"result":"ok","tracked":true,"finished":false,"installState":516,"reason":"paused"}'
          )
        )
      )
    ).resolves.toMatchObject({ finished: false, reason: 'paused' })
  })

  it('maps refused', async () => {
    await expect(
      requestSteamValidateApp(
        '440',
        { wait: true },
        deps(runWith('{"result":"refused","appId":440}', 3))
      )
    ).resolves.toEqual({ kind: 'refused' })
  })

  it('maps unavailable and a missing result line', async () => {
    await expect(
      requestSteamValidateApp(
        '440',
        { wait: true },
        deps(
          runWith('{"result":"unavailable","reason":"steam-not-running"}', 2)
        )
      )
    ).resolves.toEqual({ kind: 'unavailable', reason: 'steam-not-running' })
    await expect(
      requestSteamValidateApp('440', { wait: true }, deps(runWith('', null)))
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
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

  it('forwards an abort signal to the runner', async () => {
    const runner = helper({ code: 0, stdout: '' })
    const signal = new AbortController().signal
    await createSteamInstallAppRun({ runner })('/h', [], 1000, signal)
    expect(runner.calls[0]?.opts).toMatchObject({ signal })
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
