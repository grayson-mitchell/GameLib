/**
 * Unit test scaffold for SteamGame.getGameInfo lazy metadata — Wave 0 RED targets.
 * Covers LIB-04 (lazy metadata fetch via Steam store appdetails API,
 * pendingFetches dedup, cache persistence, and error handling).
 *
 * All behaviors are registered as it.todo() stubs so this suite stays green
 * until plan 03 implements the production code.
 *
 * Mock strategy follows Phase 1 user.test.ts patterns:
 *  - backend/logger uses factory form to prevent transitive fs-extra native crash
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

// ── axios mock — controls store appdetails API responses ─────────────────────
jest.mock('axios')

// ── IPC mock — sendFrontendMessage ───────────────────────────────────────────
jest.mock('../../../ipc', () => ({
  sendFrontendMessage: jest.fn()
}))

// ── Metadata cache store mock — controls steamMetadataStore ──────────────────
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

describe('SteamGame.getGameInfo lazy metadata', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  // ── LIB-04: synchronous return from in-memory library ────────────────────

  it.todo('LIB-04: getGameInfo returns the existing library entry synchronously')

  // ── LIB-04: lazy metadata fetch via Steam store API ──────────────────────

  it.todo(
    'LIB-04: when art_cover is empty, fetchMetadataIfNeeded calls the Steam store appdetails API'
  )

  it.todo(
    'LIB-04: after fetch, art_cover/art_square/title/genres/about.description are populated from the API response'
  )

  // ── LIB-04: cache persistence ─────────────────────────────────────────────

  it.todo('LIB-04: fetched metadata is written to steamMetadataStore for indefinite reuse')

  // ── LIB-04: frontend update via IPC ──────────────────────────────────────

  it.todo(
    'LIB-04: fetchMetadataIfNeeded calls sendFrontendMessage pushGameToLibrary with the updated GameInfo'
  )

  // ── LIB-04: pendingFetches dedup (T-2-03) ────────────────────────────────

  it.todo(
    'LIB-04: concurrent getGameInfo calls for the same appId only fire one network request (pendingFetches dedup)'
  )

  // ── LIB-04: error handling ────────────────────────────────────────────────

  it.todo('LIB-04: a failed appdetails request is caught and logged without throwing')
})
