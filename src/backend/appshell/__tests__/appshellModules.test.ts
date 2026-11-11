/**
 * Direct-call behavior tests for the D-07/D-08 extracted app-shell modules
 * (Phase 34.1 Plan 02, REQ-34.1-04). Every exported function is invoked
 * DIRECTLY -- never through `backend/main`, never through IPC/RPC -- proving
 * the same observable behavior the Electron `main.ts` handlers had before
 * extraction. A by-construction source gate also proves the modules stay
 * Electron-free (D-09), mirroring `downloadQueueFlows.test.ts`'s own gate.
 */

import { readFileSync as readSourceFile, readdirSync } from 'fs'
import { join } from 'path'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

// ── graceful-fs mock (themes.ts) — deterministic fs behavior, no real disk ──
jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn()
}))

// ── backend/utils mock (releases.ts) — proves the thin startup-gating
// closure reaches (or doesn't reach) the real getLatestReleases/
// getCurrentChangelog exports without exercising their own internals ───────
jest.mock('../../utils', () => ({
  getLatestReleases: jest.fn(),
  getCurrentChangelog: jest.fn()
}))

// ── i18next mock (language.ts) — mirrors
// downloadmanager/__tests__/utils.test.ts's own __esModule default shape ────
jest.mock('i18next', () => ({
  __esModule: true,
  default: {
    changeLanguage: jest.fn().mockResolvedValue(undefined)
  }
}))

// ── backend/logger mock (language.ts) — heroicLogWriter is unset until
// bootstrap.ts's init() runs (this repo's own documented gotcha); mocked so
// logInfo() is a no-op rather than throwing on the unset writer ────────────
jest.mock('../../logger', () => ({
  logInfo: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import {
  getLatestReleases as mockedGetLatestReleases,
  getCurrentChangelog as mockedGetCurrentChangelog
} from '../../utils'
import i18next from 'i18next'
import { createTestStores } from 'backend/testUtils/testServices'
import { backendEvents } from '../../backend_events'

import {
  getLatestReleasesForStartup,
  getCurrentChangelogEntry
} from '../releases'
import { changeLanguage } from '../language'
import { defined } from 'backend/testUtils/indexed'

const mockedI18nextChangeLanguage = i18next.changeLanguage as jest.Mock
// language.ts takes its stores by parameter; the gameInfoStore is a stub, so no disk I/O happens.
const mockedGameInfoStoreClear = jest.fn()
const languageKvs = { configStore: {} } as never
const languageDeps = {
  stores: createTestStores({
    legendary: { gameInfoStore: { clear: mockedGameInfoStoreClear } } as never,
    kvs: languageKvs
  })
}

/** A config slice over a fresh settings object. */
function mockAppSettings(partial: Record<string, unknown>) {
  const setSetting = jest.fn()
  const config = {
    getSettings: () => partial as never,
    setSetting
  }
  return { setSetting, config }
}

describe('backend/appshell/releases.ts (REQ-34.1-04)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('REQ-34.1-04 getLatestReleasesForStartup returns [] and does not call getLatestReleases when checkForUpdatesOnStartup is false', async () => {
    const { config } = mockAppSettings({ checkForUpdatesOnStartup: false })

    const result = await getLatestReleasesForStartup({ config })

    expect(result).toEqual([])
    expect(mockedGetLatestReleases).not.toHaveBeenCalled()
  })

  it("REQ-34.1-04 getLatestReleasesForStartup forwards getLatestReleases()'s result when checkForUpdatesOnStartup is true", async () => {
    const { config } = mockAppSettings({ checkForUpdatesOnStartup: true })
    const releases = [{ id: 1, tag_name: 'v1.0.0' }]
    ;(mockedGetLatestReleases as jest.Mock).mockResolvedValue(releases)

    const result = await getLatestReleasesForStartup({ config })

    expect(result).toBe(releases)
    expect(mockedGetLatestReleases).toHaveBeenCalledTimes(1)
  })

  it("REQ-34.1-04 getCurrentChangelogEntry forwards to backend/utils's getCurrentChangelog", async () => {
    const changelog = { id: 2, tag_name: 'v1.1.0' }
    ;(mockedGetCurrentChangelog as jest.Mock).mockResolvedValue(changelog)

    const result = await getCurrentChangelogEntry()

    expect(result).toBe(changelog)
    expect(mockedGetCurrentChangelog).toHaveBeenCalledTimes(1)
  })
})

describe('backend/appshell/language.ts (REQ-34.1-04)', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('REQ-34.1-04 changeLanguage calls i18next.changeLanguage, clears gameInfoStore, writes the language setting, and emits languageChanged', async () => {
    const { setSetting, config } = mockAppSettings({})
    const emitSpy = jest.spyOn(backendEvents, 'emit')

    await changeLanguage({ ...languageDeps, config }, 'fr')

    expect(mockedI18nextChangeLanguage).toHaveBeenCalledWith('fr')
    expect(mockedGameInfoStoreClear).toHaveBeenCalledTimes(1)
    expect(setSetting).toHaveBeenCalledWith('language', 'fr', languageKvs)
    expect(emitSpy).toHaveBeenCalledWith('languageChanged')

    emitSpy.mockRestore()
  })

  it('REQ-34.1-04 changeLanguage emits languageChanged LAST, after GlobalConfig.setSetting', async () => {
    const { setSetting, config } = mockAppSettings({})
    const emitSpy = jest.spyOn(backendEvents, 'emit')

    await changeLanguage({ ...languageDeps, config }, 'de')

    const setSettingOrder = setSetting.mock.invocationCallOrder[0]
    const emitOrder = defined(
      emitSpy.mock.invocationCallOrder[0],
      'emit call order'
    )

    expect(setSettingOrder).toBeLessThan(emitOrder)

    emitSpy.mockRestore()
  })
})

describe('backend/appshell source gate (REQ-34.1-04)', () => {
  // Comment-stripping now delegates to the shared
  // `backend/testUtils/stripSourceComments` util (strips block comments
  // first, then the line-prefix filter), imported above as `stripComments`.

  it('REQ-34.1-04 source gate: no file under src/backend/appshell/ imports the real electron module', () => {
    const appshellDir = join(__dirname, '..')
    const files = readdirSync(appshellDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith('.ts'))
      .map((entry) => entry.name)

    expect(files.length).toBeGreaterThan(0)

    for (const file of files) {
      const stripped = stripComments(
        readSourceFile(join(appshellDir, file), 'utf-8')
      )
      expect(stripped).not.toMatch(/from\s+['"]electron['"]/)
      expect(stripped).not.toMatch(/require\(\s*['"]electron['"]\s*\)/)
    }
  })
})
