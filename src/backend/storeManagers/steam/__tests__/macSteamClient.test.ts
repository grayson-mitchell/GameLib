/**
 * Phase 79 (79-40): what survives of the Mac Steam helper once the Rust CM session owns the wrap
 * and the owed record: the connection_log state read and the guided Go Offline Continue.
 */
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam', Backend: 'Backend' }
}))

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { createMacSteamClient, readMacSteamCmState } from '../macSteamClient'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'gamelib-mac-steam-client-'))
  mkdirSync(join(dir, 'logs'))
})
afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

const logPath = () => join(dir, 'logs', 'connection_log.txt')

describe('readMacSteamCmState', () => {
  it('returns the last bracketed state word', () => {
    writeFileSync(
      logPath(),
      '[2026-11-01 10:00:00] [Logged On, 1, 2]\n[2026-11-01 10:00:05] [Logged Off, 1, 2]\n'
    )
    expect(readMacSteamCmState(logPath())).toBe('Logged Off')
  })

  it('is null for a missing file or an empty one', () => {
    expect(readMacSteamCmState(join(dir, 'nope.txt'))).toBeNull()
    writeFileSync(logPath(), '')
    expect(readMacSteamCmState(logPath())).toBeNull()
  })
})

describe('checkGuidedOfflineReady', () => {
  const build = (platform: NodeJS.Platform, pgrepCode: number) =>
    createMacSteamClient({
      platform,
      config: { getSettings: () => ({ defaultSteamPath: dir }) } as never,
      runner: createScriptedRunner([
        { cmd: '/usr/bin/pgrep', result: { code: pgrepCode } }
      ])
    })

  it('is not-macos off darwin', async () => {
    expect(await build('linux', 1).checkGuidedOfflineReady()).toEqual({
      status: 'not-macos'
    })
  })

  it('is ready when Steam is not running', async () => {
    expect(await build('darwin', 1).checkGuidedOfflineReady()).toEqual({
      status: 'ready'
    })
  })

  it('is ready when Steam runs and reads Logged Off', async () => {
    writeFileSync(logPath(), '[2026-11-01 10:00:05] [Logged Off, 1, 2]\n')
    expect(await build('darwin', 0).checkGuidedOfflineReady()).toEqual({
      status: 'ready'
    })
  })

  it('is still-online when Steam runs and reads Logged On', async () => {
    writeFileSync(logPath(), '[2026-11-01 10:00:05] [Logged On, 1, 2]\n')
    expect(await build('darwin', 0).checkGuidedOfflineReady()).toEqual({
      status: 'still-online'
    })
  })

  it('is still-online when the running probe fails', async () => {
    expect(await build('darwin', 2).checkGuidedOfflineReady()).toEqual({
      status: 'still-online'
    })
  })
})
