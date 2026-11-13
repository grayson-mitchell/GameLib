import { createTestVersioning } from 'backend/testUtils/testStoreRoot'
import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { mkdtempSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

// quick 261105-ord: a fresh config must not opt the user in to InstallApp.
const dir = mkdtempSync(join(tmpdir(), 'gamelib-config-default-'))

jest.mock('../utils/compatibility_layers', () => ({
  getDefaultWineBinary: () => ({ name: 'x', bin: '', type: 'wine' })
}))
jest.mock('../logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: new Proxy({}, { get: (_t, k) => String(k) })
}))

import { createGlobalConfig } from '../config'
const pathsModule = createTestAppPaths(dir, {
  configPath: join(dir, 'config.json'),
  gamesConfigPath: dir,
  sharedWinePrefix: join(dir, 'prefixes'),
  userHome: dir
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('steamExperimentalInstallApp default', () => {
  it('factory defaults keep the experimental InstallApp feature off', () => {
    expect(
      createGlobalConfig({
        requestRustInvoke: jest.fn(),
        versioning: createTestVersioning(),
        paths: pathsModule
      }).getFactoryDefaults().steamExperimentalInstallApp
    ).toBe(false)
  })

  it('a fresh config with no config file reports it off', () => {
    expect(
      createGlobalConfig({
        requestRustInvoke: jest.fn(),
        versioning: createTestVersioning(),
        paths: pathsModule
      }).getSettings().steamExperimentalInstallApp
    ).toBe(false)
  })
})
