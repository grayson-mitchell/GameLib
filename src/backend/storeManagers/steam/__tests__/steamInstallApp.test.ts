import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

import {
  createSteamInstallAppRun,
  MOVE_WAIT_TIMEOUT_MS,
  requestSteamInstallApp,
  requestSteamMoveApp,
  requestSteamUninstallApp,
  requestSteamValidateApp,
  STEAM_LIBRARY_PATH_MAX_BYTES,
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

import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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

describe('requestSteamMoveApp (quick 261122-9sl)', () => {
  beforeEach(() => {
    mockedExists.mockReturnValue(true)
  })
  const deps = (run: jest.Mock) => ({
    paths: { steamBridgeHelperPath: '/h' },
    platform: 'darwin' as const,
    run
  })
  const opts = { libraryPath: '/libB', wait: true }

  it('reports unsupported-platform off darwin without spawning', async () => {
    const run = jest.fn()
    await expect(
      requestSteamMoveApp('440', opts, { ...deps(run), platform: 'linux' })
    ).resolves.toEqual({ kind: 'unavailable', reason: 'unsupported-platform' })
    expect(run).not.toHaveBeenCalled()
  })

  it('rejects a bad appId without spawning', async () => {
    const run = jest.fn()
    await expect(requestSteamMoveApp('4;40', opts, deps(run))).resolves.toEqual(
      { kind: 'unavailable', reason: 'bad-appid' }
    )
    expect(run).not.toHaveBeenCalled()
  })

  it('reports helper-missing when the binary is absent', async () => {
    mockedExists.mockReturnValue(false)
    const run = jest.fn()
    await expect(requestSteamMoveApp('440', opts, deps(run))).resolves.toEqual({
      kind: 'unavailable',
      reason: 'helper-missing'
    })
    expect(run).not.toHaveBeenCalled()
  })

  it('passes --library, --wait, the long timeout and the signal to run', async () => {
    const run = runWith(
      '{"result":"ok","tracked":true,"finished":true,"installState":4,"folderIndex":1}'
    )
    const signal = new AbortController().signal
    await requestSteamMoveApp('440', { ...opts, signal }, deps(run))
    expect(run).toHaveBeenCalledWith(
      '/h',
      ['--steam-moveapp', '440', '--library', '/libB', '--wait'],
      MOVE_WAIT_TIMEOUT_MS,
      signal
    )
  })

  it('without wait uses the short default timeout and no --wait', async () => {
    const run = runWith('{"result":"ok","tracked":false,"folderIndex":1}')
    await requestSteamMoveApp(
      '440',
      { libraryPath: '/libB', wait: false },
      deps(run)
    )
    const [, args, timeout] = run.mock.calls[0]
    expect(args).toEqual(['--steam-moveapp', '440', '--library', '/libB'])
    expect(timeout).toBeLessThan(MOVE_WAIT_TIMEOUT_MS)
  })

  it('maps ok finished', async () => {
    const run = runWith(
      '{"result":"ok","tracked":true,"finished":true,"installState":4,"folderIndex":1,"fromFolder":0}'
    )
    await expect(requestSteamMoveApp('440', opts, deps(run))).resolves.toEqual({
      kind: 'ok',
      tracked: true,
      finished: true,
      installState: 4,
      folderIndex: 1
    })
  })

  it('maps ok not-finished with a reason, and ok untracked', async () => {
    await expect(
      requestSteamMoveApp(
        '440',
        opts,
        deps(
          runWith(
            '{"result":"ok","tracked":true,"finished":false,"installState":4,"folderIndex":1,"reason":"wait-cap"}'
          )
        )
      )
    ).resolves.toMatchObject({ finished: false, reason: 'wait-cap' })
    await expect(
      requestSteamMoveApp(
        '440',
        opts,
        deps(
          runWith(
            '{"result":"ok","tracked":false,"folderIndex":1,"reason":"method-unverified:GetAppInstallState"}'
          )
        )
      )
    ).resolves.toEqual({
      kind: 'ok',
      tracked: false,
      finished: false,
      installState: null,
      folderIndex: 1,
      reason: 'method-unverified:GetAppInstallState'
    })
  })

  it('maps refused with its reason', async () => {
    await expect(
      requestSteamMoveApp(
        '440',
        opts,
        deps(
          runWith(
            '{"result":"refused","appId":440,"reason":"already-in-folder","folderIndex":1}',
            3
          )
        )
      )
    ).resolves.toEqual({ kind: 'refused', reason: 'already-in-folder' })
  })

  it('maps error with its stage and EAppUpdateError', async () => {
    await expect(
      requestSteamMoveApp(
        '440',
        opts,
        deps(
          runWith(
            '{"result":"error","appId":440,"stage":"MoveApp","eAppUpdateError":16}',
            3
          )
        )
      )
    ).resolves.toEqual({ kind: 'error', stage: 'MoveApp', code: 16 })
  })

  it('maps unavailable, a missing result line and an unrecognised line', async () => {
    await expect(
      requestSteamMoveApp(
        '440',
        opts,
        deps(
          runWith(
            '{"result":"unavailable","reason":"library-not-registered"}',
            2
          )
        )
      )
    ).resolves.toEqual({
      kind: 'unavailable',
      reason: 'library-not-registered'
    })
    await expect(
      requestSteamMoveApp('440', opts, deps(runWith('', null)))
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
    await expect(
      requestSteamMoveApp('440', opts, deps(runWith('{"result":"huh"}')))
    ).resolves.toEqual({ kind: 'unavailable', reason: 'helper-failed' })
  })

  describe('not-settled (quick 261122-n4q)', () => {
    it('maps a not-settled line', async () => {
      await expect(
        requestSteamMoveApp(
          '440',
          opts,
          deps(
            runWith(
              '{"result":"not-settled","reason":"verify-pending","installState":46,"folderIndex":2,"nudged":true}'
            )
          )
        )
      ).resolves.toEqual({
        kind: 'not-settled',
        reason: 'verify-pending',
        installState: 46,
        folderIndex: 2,
        nudged: true
      })
    })

    it('carries addedLibrary and defaults a missing reason to verify-pending', async () => {
      await expect(
        requestSteamMoveApp(
          '440',
          opts,
          deps(runWith('{"result":"not-settled","addedLibrary":true}'))
        )
      ).resolves.toEqual({
        kind: 'not-settled',
        reason: 'verify-pending',
        installState: null,
        folderIndex: null,
        nudged: false,
        addedLibrary: true
      })
    })
  })

  describe('addLibrary (quick 261122-n4q)', () => {
    it('puts --add-library right after the library path and before --wait', async () => {
      const run = runWith(
        '{"result":"ok","tracked":true,"finished":true,"installState":4,"folderIndex":5,"addedLibrary":true}'
      )
      await requestSteamMoveApp('440', { ...opts, addLibrary: true }, deps(run))
      expect(run.mock.calls[0]?.[1]).toEqual([
        '--steam-moveapp',
        '440',
        '--library',
        '/libB',
        '--add-library',
        '--wait'
      ])
    })

    it('omits --add-library when the option is absent or false', async () => {
      const run = runWith('{"result":"ok","tracked":false,"folderIndex":1}')
      await requestSteamMoveApp(
        '440',
        { ...opts, addLibrary: false },
        deps(run)
      )
      expect(run.mock.calls[0]?.[1]).not.toContain('--add-library')
    })

    it('maps addedLibrary on ok, and leaves the key out without it', async () => {
      await expect(
        requestSteamMoveApp(
          '440',
          opts,
          deps(
            runWith(
              '{"result":"ok","tracked":true,"finished":true,"installState":4,"folderIndex":5,"addedLibrary":true}'
            )
          )
        )
      ).resolves.toEqual({
        kind: 'ok',
        tracked: true,
        finished: true,
        installState: 4,
        folderIndex: 5,
        addedLibrary: true
      })
      const plain = await requestSteamMoveApp(
        '440',
        opts,
        deps(
          runWith(
            '{"result":"ok","tracked":true,"finished":true,"installState":4,"folderIndex":5,"addedLibrary":false}'
          )
        )
      )
      expect(plain).not.toHaveProperty('addedLibrary')
    })

    it('carries addedLibrary on an error line', async () => {
      await expect(
        requestSteamMoveApp(
          '440',
          opts,
          deps(
            runWith(
              '{"result":"error","appId":440,"stage":"MoveApp","eAppUpdateError":16,"addedLibrary":true}',
              3
            )
          )
        )
      ).resolves.toEqual({
        kind: 'error',
        stage: 'MoveApp',
        code: 16,
        addedLibrary: true
      })
    })

    it.each([
      'library-not-directory',
      'path-too-long',
      'inside-library',
      'contains-library',
      'add-library-refused',
      'add-library-unverified'
    ])('passes the refused reason %s through', async (reason) => {
      await expect(
        requestSteamMoveApp(
          '440',
          opts,
          deps(
            runWith(`{"result":"refused","appId":440,"reason":"${reason}"}`, 3)
          )
        )
      ).resolves.toEqual({ kind: 'refused', reason })
    })

    it('STEAM_LIBRARY_PATH_MAX_BYTES tracks GL_IA_ADD_PATH_MAX in the helper header', () => {
      const header = readFileSync(
        join(
          __dirname,
          '..',
          '..',
          '..',
          '..',
          '..',
          'native',
          'steam-bridge',
          'helper',
          'gamelib_installapp.h'
        ),
        'utf8'
      )
      const max = /#define GL_IA_ADD_PATH_MAX (\d+)/.exec(header)
      expect(max).not.toBeNull()
      expect(STEAM_LIBRARY_PATH_MAX_BYTES).toBe(Number(max?.[1]))
    })
  })

  it('MOVE_WAIT_TIMEOUT_MS tracks GL_IA_MOVE_WAIT_CAP_S in the helper header', () => {
    const header = readFileSync(
      join(
        __dirname,
        '..',
        '..',
        '..',
        '..',
        '..',
        'native',
        'steam-bridge',
        'helper',
        'gamelib_installapp.h'
      ),
      'utf8'
    )
    const cap = /#define GL_IA_MOVE_WAIT_CAP_S (\d+)/.exec(header)
    expect(cap).not.toBeNull()
    expect(MOVE_WAIT_TIMEOUT_MS).toBe((Number(cap?.[1]) + 120) * 1000)
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
