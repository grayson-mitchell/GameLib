import { createTestAppPaths } from 'backend/testUtils/testAppPaths'
import { createTestVersioning } from 'backend/testUtils/testStoreRoot'
import { mkdirSync } from 'fs'
import { join } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { createGlobalConfig, isFlatpakSteamInstalled } from '../config'

// D-66.2-01: the config factory defaults run before any runner exists, so they
// must spawn nothing. Flatpak Steam is an fs check; the default wine is a PATH scan.
describe('config factory defaults are spawn-free', () => {
  const profile = createFakeHomeProfile()
  afterAll(() => profile.dispose())

  const app = 'app/com.valvesoftware.Steam'

  it('isFlatpakSteamInstalled: user flatpak root counts', () => {
    const userRoot = join(profile.root, '.local/share/flatpak')
    const systemRoot = join(profile.root, 'var/lib/flatpak')
    expect(isFlatpakSteamInstalled([systemRoot, userRoot])).toBe(false)
    mkdirSync(join(userRoot, app), { recursive: true })
    expect(isFlatpakSteamInstalled([systemRoot, userRoot])).toBe(true)
  })

  it('isFlatpakSteamInstalled: system flatpak root counts', () => {
    const userRoot = join(profile.root, 'u2/.local/share/flatpak')
    const systemRoot = join(profile.root, 'u2/var/lib/flatpak')
    mkdirSync(join(systemRoot, app), { recursive: true })
    expect(isFlatpakSteamInstalled([systemRoot, userRoot])).toBe(true)
  })

  it('getFactoryDefaults makes no runner call', () => {
    const runner = createScriptedRunner([])
    const defaults = createGlobalConfig({
      requestRustInvoke: jest.fn(),
      versioning: createTestVersioning(),
      paths: createTestAppPaths(profile.root)
    }).getFactoryDefaults()
    expect(defaults).toBeDefined()
    expect(runner.calls.length).toBe(0)
  })
})
