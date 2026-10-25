/**
 * quick 261026-avw: removeFixFile covers Steam and only ever removes the
 * downloaded `<app>-<store>.json` direct child of fixesPath.
 */

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'

jest.mock('backend/constants/paths', () => {
  const path = jest.requireActual('path')
  const os = jest.requireActual('os')
  const base = path.join(os.tmpdir(), `gamelib-uninstaller-test-${process.pid}`)
  return {
    defaultWinePrefix: path.join(base, 'prefix'),
    fixesPath: path.join(base, 'fixes'),
    localFixesPath: path.join(base, 'fixes', 'local'),
    gamesConfigPath: path.join(base, 'games')
  }
})
jest.mock('backend/config', () => ({ GlobalConfig: { get: jest.fn() } }))
jest.mock('backend/dialog/dialog', () => ({ notify: jest.fn() }))
jest.mock('backend/storeManagers', () => ({ libraryManagerMap: {} }))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/utils/gameTitle', () => ({ resolveGameTitle: jest.fn() }))
jest.mock('backend/platform', () => ({ Event: {} }))
jest.mock('backend/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))
jest.mock('i18next', () => ({ t: jest.fn((_k: string, d: string) => d) }))

import { removeFixFile } from '../uninstaller'
import { fixesPath, localFixesPath } from 'backend/constants/paths'

beforeEach(() => {
  rmSync(join(fixesPath, '..'), { recursive: true, force: true })
  mkdirSync(localFixesPath, { recursive: true })
})

afterAll(() => {
  rmSync(join(fixesPath, '..'), { recursive: true, force: true })
})

describe('removeFixFile', () => {
  it.each([
    ['284100', 'steam', 'steam'],
    ['1207658930', 'gog', 'gog']
  ] as const)('deletes the downloaded %s file only', (app, runner, store) => {
    const downloaded = join(fixesPath, `${app}-${store}.json`)
    const local = join(localFixesPath, `${app}-${store}.json`)
    const profile = join(fixesPath, `${app}-${store}.profile.json`)
    writeFileSync(downloaded, '{}')
    writeFileSync(local, '{}')
    writeFileSync(profile, '{}')

    removeFixFile(app, runner)

    expect(existsSync(downloaded)).toBe(false)
    expect(existsSync(local)).toBe(true)
    expect(existsSync(profile)).toBe(true)
  })

  it('sideload deletes nothing and does not throw', () => {
    const stray = join(fixesPath, 'x-undefined.json')
    writeFileSync(stray, '{}')
    expect(() => removeFixFile('x', 'sideload')).not.toThrow()
    expect(existsSync(stray)).toBe(true)
  })

  it('a missing file does not throw', () => {
    expect(() => removeFixFile('nope', 'steam')).not.toThrow()
  })
})
