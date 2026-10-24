/**
 * quick 261024-tny: applySteamBridgeKnownFixes -- the Steam bridge launch's
 * known-fixes hook. Uses the REAL readKnownFixes (fixes file written under a
 * tmp-redirected fixesPath) so the `<appId>-steam.json` name is proven end to
 * end. Winetricks, runWineCommand, the status sender and the bottle helper are
 * mocked; no child process is spawned.
 */

import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

jest.mock('os', () => {
  const actual = jest.requireActual('os')
  const path = jest.requireActual('path')
  return {
    ...actual,
    homedir: () =>
      path.join(actual.tmpdir(), `gamelib-steambridgefixes-home-${process.pid}`)
  }
})

const mockWinetricksInstall = jest.fn()
const mockRunWineCommand = jest.fn()
const mockSendGameStatusUpdate = jest.fn()
const mockLogWarning = jest.fn()

jest.mock('backend/tools', () => ({
  Winetricks: {
    install: (...args: unknown[]) => mockWinetricksInstall(...args)
  }
}))
jest.mock('backend/launcher', () => ({
  runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args)
}))
jest.mock('backend/utils', () => ({
  sendGameStatusUpdate: (...args: unknown[]) =>
    mockSendGameStatusUpdate(...args)
}))
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('../storeManagers/steam/bottle', () => ({
  getBottleDir: (name: string) => `/mock/Bottles/${name}`
}))

import type { GameSettings } from 'common/types'
import { fixesPath } from '../constants/paths'
import { applySteamBridgeKnownFixes } from '../storeManagers/steam/bridgeKnownFixes'

const APP_ID = '480'
const ROOT =
  '/mock/Bottles/GameLibSteamBridge-480/drive_c/steamapps/common/Game'

const BRIDGE = {
  wineCrossoverBottle: 'GameLibSteamBridge-480',
  winePrefix: '/global/prefix',
  enviromentOptions: [{ key: 'USER', value: 'x' }],
  wineVersion: { type: 'crossover' }
} as unknown as GameSettings

function writeFixes(content: object) {
  writeFileSync(
    join(fixesPath, `${APP_ID}-steam.json`),
    JSON.stringify(content)
  )
}

beforeEach(() => {
  mkdirSync(fixesPath, { recursive: true })
  rmSync(join(fixesPath, `${APP_ID}-steam.json`), { force: true })
  mockWinetricksInstall.mockResolvedValue('installed')
  mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
})

afterAll(() => {
  rmSync(fixesPath, { recursive: true, force: true })
  void tmpdir
})

describe('applySteamBridgeKnownFixes', () => {
  it('does nothing and returns the same object when there is no fixes file', async () => {
    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(result).toBe(BRIDGE)
    expect(mockWinetricksInstall).not.toHaveBeenCalled()
    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockSendGameStatusUpdate).not.toHaveBeenCalled()
  })

  it('runs winetricks verbs against the bridge bottle, sending status first', async () => {
    writeFixes({ title: 't', winetricks: ['vcrun2019', 'd3dx9', '-q'] })

    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(mockSendGameStatusUpdate).toHaveBeenCalledTimes(1)
    expect(mockSendGameStatusUpdate).toHaveBeenCalledWith({
      appName: APP_ID,
      runner: 'steam',
      status: 'winetricks'
    })
    expect(mockWinetricksInstall).toHaveBeenCalledTimes(2)
    for (const [i, verb] of ['vcrun2019', 'd3dx9'].entries()) {
      const call = mockWinetricksInstall.mock.calls[i]
      expect(call.slice(0, 4)).toEqual(['steam', APP_ID, verb, undefined])
      expect(call[4].wineCrossoverBottle).toBe('GameLibSteamBridge-480')
      expect(call[4].winePrefix).toBe('/mock/Bottles/GameLibSteamBridge-480')
    }
    expect(mockSendGameStatusUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      mockWinetricksInstall.mock.invocationCallOrder[0]
    )
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('-q'),
      'Steam'
    )
  })

  it('runs runInPrefix entries through runWineCommand under the install root', async () => {
    writeFixes({ title: 't', runInPrefix: ['redist/vc_redist.x64.exe'] })

    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(mockSendGameStatusUpdate).toHaveBeenCalledWith({
      appName: APP_ID,
      runner: 'steam',
      status: 'redist',
      context: 'FIXES'
    })
    expect(mockRunWineCommand).toHaveBeenCalledWith({
      commandParts: [`${ROOT}/redist/vc_redist.x64.exe`],
      gameSettings: BRIDGE,
      wait: true,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true
    })
  })

  it('skips a runInPrefix entry that escapes the install root', async () => {
    writeFixes({ title: 't', runInPrefix: ['../../../evil.exe'] })

    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockLogWarning).toHaveBeenCalledWith(
      expect.stringContaining('evil.exe'),
      'Steam'
    )
  })

  it('skips runInPrefix when the install root is unknown', async () => {
    writeFixes({ title: 't', runInPrefix: ['setup.exe'] })

    await applySteamBridgeKnownFixes(APP_ID, BRIDGE, undefined)

    expect(mockRunWineCommand).not.toHaveBeenCalled()
    expect(mockLogWarning).toHaveBeenCalled()
  })

  it('returns a NEW settings object carrying the fix env after the user env', async () => {
    writeFixes({ title: 't', envVariables: { DXVK_ASYNC: '1' } })

    const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

    expect(result).not.toBe(BRIDGE)
    expect(result.enviromentOptions).toEqual([
      { key: 'USER', value: 'x' },
      { key: 'DXVK_ASYNC', value: '1' }
    ])
    expect({ ...result, enviromentOptions: undefined }).toEqual({
      ...BRIDGE,
      enviromentOptions: undefined
    })
    expect(BRIDGE.enviromentOptions).toEqual([{ key: 'USER', value: 'x' }])
  })

  describe('failure tolerance', () => {
    it.each([
      [
        'rejects',
        () => mockWinetricksInstall.mockRejectedValue(new Error('x'))
      ],
      [
        'returns failed',
        () => mockWinetricksInstall.mockResolvedValue('failed')
      ],
      [
        'returns refused',
        () => mockWinetricksInstall.mockResolvedValue('refused')
      ]
    ])('Winetricks.install %s: warns, resolves, keeps env', async (_n, arm) => {
      writeFixes({
        title: 't',
        winetricks: ['vcrun2019'],
        envVariables: { DXVK_ASYNC: '1' }
      })
      arm()

      const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('vcrun2019'),
        'Steam'
      )
      expect(result.enviromentOptions).toEqual([
        { key: 'USER', value: 'x' },
        { key: 'DXVK_ASYNC', value: '1' }
      ])
    })

    it('runWineCommand rejecting warns and still resolves with env', async () => {
      writeFixes({
        title: 't',
        runInPrefix: ['setup.exe'],
        envVariables: { A: 'b' }
      })
      mockRunWineCommand.mockRejectedValue(new Error('boom'))

      const result = await applySteamBridgeKnownFixes(APP_ID, BRIDGE, ROOT)

      expect(mockLogWarning).toHaveBeenCalledWith(
        expect.stringContaining('setup.exe'),
        'Steam'
      )
      expect(result.enviromentOptions).toHaveLength(2)
    })
  })
})
