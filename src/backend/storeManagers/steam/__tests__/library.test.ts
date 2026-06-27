/**
 * Unit test scaffold for SteamLibraryManager — Wave 0 RED targets.
 * Covers LIB-01 (refresh / owned apps), LIB-02 (installed state via ACF),
 * and LIB-03 (steamPlaytimeMinutes mapping).
 *
 * All behaviors are registered as it.todo() stubs so this suite stays green
 * until plan 02 implements the production code.
 *
 * Mock strategy follows Phase 1 user.test.ts patterns:
 *  - backend/logger uses factory form to prevent fs-extra native module crash
 *  - resetMocks: true in jest.config means mock implementations must be
 *    re-established in beforeEach
 */

// ── Logger mock (factory form — prevents transitive fs-extra native crash) ───
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: {
    Steam: 'Steam',
    Backend: 'Backend'
  }
}))

// ── backend/utils mock — provides getSteamLibraries() ───────────────────────
jest.mock('backend/utils', () => ({
  getSteamLibraries: jest.fn()
}))

// ── graceful-fs mock — readdirSync, readFileSync, existsSync ─────────────────
jest.mock('graceful-fs')

// ── @node-steam/vdf mock — parse() ───────────────────────────────────────────
jest.mock('@node-steam/vdf')

// ── IPC mock — sendFrontendMessage ───────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── SteamUser mock — controls getClient() return value ───────────────────────
jest.mock('../user')

// ── electronStores mock — steamLibraryStore, steamMetadataStore ──────────────
jest.mock('../electronStores', () => ({
  configStore: {
    get: jest.fn(),
    get_nodefault: jest.fn(),
    set: jest.fn(),
    clear: jest.fn()
  },
  steamLibraryStore: {
    get: jest.fn(),
    set: jest.fn()
  },
  steamMetadataStore: {
    get: jest.fn(),
    set: jest.fn()
  },
  steamSyncStore: {
    get: jest.fn(),
    set: jest.fn()
  }
}))

// ── Describe block ────────────────────────────────────────────────────────────

describe('SteamLibraryManager', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── LIB-01: refresh() and owned app fetch ─────────────────────────────────

  it.todo('LIB-01: refresh() calls getUserOwnedApps and builds a GameInfo per owned app')

  it.todo('LIB-01: refresh() calls sendFrontendMessage pushGameToLibrary once per game')

  // ── LIB-02: install state via ACF StateFlags ──────────────────────────────

  it.todo(
    'LIB-02: buildInstalledMap marks is_installed true when StateFlags bit 4 is set (e.g. 4, 6, 516)'
  )

  it.todo('LIB-02: buildInstalledMap marks is_installed false when StateFlags bit 4 is clear')

  it.todo('LIB-02: a corrupt/unparseable ACF file is skipped without throwing')

  // ── LIB-03: playtime mapping ───────────────────────────────────────────────

  it.todo('LIB-03: GameInfo.extra.steamPlaytimeMinutes equals app.playtime_forever')

  // ── Cache fallback ────────────────────────────────────────────────────────

  it.todo('refresh() serves cached library from steamLibraryStore when getUserOwnedApps throws')
})
