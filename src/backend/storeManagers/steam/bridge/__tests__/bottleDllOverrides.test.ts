/**
 * 53-19: applyBridgeBottleDllOverrides -- per-appId DLL override in the bridge
 * bottle (Overlooting 3410180 nvapi64, measured in 53-19-NVAPI.md Arm B).
 * runWineCommand and the logger are mocked; no child process is spawned.
 */

const mockRunWineCommand = jest.fn()
const mockLogWarning = jest.fn()

jest.mock('backend/launcher', () => ({
  runWineCommand: (...args: unknown[]) => mockRunWineCommand(...args)
}))
jest.mock('backend/logger', () => ({
  logWarning: (...args: unknown[]) => mockLogWarning(...args),
  LogPrefix: { Steam: 'Steam' }
}))

import type { GameSettings } from 'common/types'
import {
  BRIDGE_BOTTLE_DLL_OVERRIDES,
  applyBridgeBottleDllOverrides,
  buildOverrideCommandParts
} from '../bottleDllOverrides'

const SETTINGS = {
  wineCrossoverBottle: 'GameLibSteamBridge-3410180',
  wineVersion: { type: 'crossover' }
} as unknown as GameSettings

beforeEach(() => {
  mockRunWineCommand.mockReset()
  mockLogWarning.mockReset()
  mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 0 })
})

describe('applyBridgeBottleDllOverrides', () => {
  it('writes the measured per-exe nvapi64 override for 3410180', async () => {
    const result = await applyBridgeBottleDllOverrides('3410180', SETTINGS)

    expect(result).toBe(SETTINGS)
    expect(mockRunWineCommand).toHaveBeenCalledTimes(1)
    expect(mockRunWineCommand).toHaveBeenCalledWith({
      commandParts: [
        'reg',
        'add',
        'HKEY_CURRENT_USER\\Software\\Wine\\AppDefaults\\Overlooting.exe\\DllOverrides',
        '/v',
        'nvapi64',
        '/t',
        'REG_SZ',
        '/d',
        '',
        '/f'
      ],
      gameSettings: SETTINGS,
      wait: true,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true
    })
  })

  it('scopes the key by exe, or bottle-wide when no exe is set', () => {
    expect(buildOverrideCommandParts('nvapi64', 'Game.exe')[2]).toBe(
      'HKEY_CURRENT_USER\\Software\\Wine\\AppDefaults\\Game.exe\\DllOverrides'
    )
    expect(buildOverrideCommandParts('nvapi64', undefined)[2]).toBe(
      'HKEY_CURRENT_USER\\Software\\Wine\\DllOverrides'
    )
  })

  it('touches nothing for an appId not in the table', async () => {
    const result = await applyBridgeBottleDllOverrides('1691190', SETTINGS)

    expect(result).toBe(SETTINGS)
    expect(mockRunWineCommand).not.toHaveBeenCalled()
  })

  it('ignores a non-numeric appId without throwing', async () => {
    await expect(applyBridgeBottleDllOverrides('../x', SETTINGS)).resolves.toBe(
      SETTINGS
    )
    expect(mockRunWineCommand).not.toHaveBeenCalled()
  })

  it('never rejects: a rejected wine command logs one warning', async () => {
    mockRunWineCommand.mockRejectedValue(new Error('boom'))

    await expect(
      applyBridgeBottleDllOverrides('3410180', SETTINGS)
    ).resolves.toBe(SETTINGS)
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
    expect(String(mockLogWarning.mock.calls[0][0])).toContain('3410180')
    expect(String(mockLogWarning.mock.calls[0][0])).toContain('nvapi64')
  })

  it('never rejects: a non-zero exit code logs one warning', async () => {
    mockRunWineCommand.mockResolvedValue({ stdout: '', stderr: '', code: 1 })

    await expect(
      applyBridgeBottleDllOverrides('3410180', SETTINGS)
    ).resolves.toBe(SETTINGS)
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
    expect(String(mockLogWarning.mock.calls[0][0])).toContain('3410180')
    expect(String(mockLogWarning.mock.calls[0][0])).toContain('nvapi64')
  })
})

describe('BRIDGE_BOTTLE_DLL_OVERRIDES table integrity', () => {
  it('has only safe keys, dll names and exe names', () => {
    expect(Object.keys(BRIDGE_BOTTLE_DLL_OVERRIDES)).toEqual(['3410180'])
    for (const [appId, entry] of Object.entries(BRIDGE_BOTTLE_DLL_OVERRIDES)) {
      expect(appId).toMatch(/^\d+$/)
      for (const dll of entry.dlls) expect(dll).toMatch(/^[a-z0-9_]+$/)
      if (entry.exe !== undefined) {
        expect(entry.exe).toMatch(/^[A-Za-z0-9 _.-]+\.exe$/)
        expect(entry.exe).not.toMatch(/[\\/]/)
      }
    }
  })
})
