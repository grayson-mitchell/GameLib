import { requestSteamInstallApp } from '../steamInstallApp'

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
