/**
 * Behavioural + single-source-of-truth proof for `storeSearch/handlers.ts`
 * (Phase 34.2 Plan 13, closes code-review finding WR-09).
 *
 * Group 1 asserts the Phase 20 D-14 rethrow-don't-swallow error contract
 * directly against the three shared handler bodies, mocking only
 * `../itad` and `../../logger` so the contract is exercised without any
 * network call.
 *
 * Group 2 is the anti-remerge gate: it reads `storeSearch/index.ts` and
 * `sidecar/enrichmentFlowRegistration.ts` as text (comment-stripped, so this
 * file's own prose discussing the phrase `handler failed:` cannot
 * self-invalidate the assertion) and proves the log strings now exist in
 * exactly ONE file -- this module -- and that both registration sites
 * reference it. This is the gate that fails if someone ever re-inlines a
 * copy of the contract into either registration site.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments as stripComments } from 'backend/testUtils/stripSourceComments'

const mockSearchGames = jest.fn()
const mockGetGameDeals = jest.fn()
const mockLookupSteamGids = jest.fn()
jest.mock('../itad', () => ({
  searchGames: (...args: unknown[]) => mockSearchGames(...args),
  getGameDeals: (...args: unknown[]) => mockGetGameDeals(...args),
  lookupSteamGids: (...args: unknown[]) => mockLookupSteamGids(...args)
}))

const mockLogError = jest.fn()
jest.mock('../../logger', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  LogPrefix: { Backend: 'Backend' }
}))

import {
  handleSearchStores,
  handleGetStoreSearchDeals,
  handleGetItadSteamGids
} from '../handlers'
import type { ItadDeps } from '../itad'
import { createItadGate } from '../itadCache'

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.

// The handlers only pass the deps through to the (mocked) ITAD calls.
const fakeStore = {
  get: () => undefined,
  set: () => undefined,
  delete: () => undefined
}
const deps: ItadDeps = {
  appInfo: { version: '1.2.3-test' },
  stores: {
    storeSearch: { itadPricesStore: fakeStore, itadSteamGidsStore: fakeStore }
  },
  miscRuntime: { itadGate: createItadGate() }
}

// What the real adapter throws: a marker-prefixed message, no URL, no key.
const providerError = () => new Error('[storeSearch:rateLimited] search 429')

describe('storeSearch/handlers.ts', () => {
  beforeEach(() => {
    mockSearchGames.mockReset()
    mockGetGameDeals.mockReset()
    mockLookupSteamGids.mockReset()
    mockLogError.mockReset()
  })

  // ── Group 1 — behavioural: the D-14 contract itself ─────────────────────
  describe('behavioural contract (Phase 20 D-14)', () => {
    it('handleSearchStores passes through a successful result unchanged', async () => {
      const fixture = { results: [{ title: 'Portal 2' }], pricedCountry: 'GB' }
      mockSearchGames.mockResolvedValue(fixture)

      const result = await handleSearchStores(deps, 'portal', 'GB')

      expect(result).toBe(fixture)
      expect(mockSearchGames).toHaveBeenCalledWith(deps, 'portal', 'GB')
      expect(mockLogError).not.toHaveBeenCalled()
    })

    it('handleSearchStores REJECTS (never resolves to an empty result) when the provider rejects, and logs the exact channel prefix', async () => {
      mockSearchGames.mockRejectedValue(providerError())

      const outcome = await Promise.allSettled([
        handleSearchStores(deps, 'portal')
      ])

      // D-14: the promise must be REJECTED, never resolved to [] -- assert
      // the settlement status explicitly, not merely imply it from a
      // `.rejects.toThrow` assertion alone.
      expect(outcome[0].status).toBe('rejected')
      if (outcome[0].status === 'rejected') {
        // T-47-28: the stable marker survives the rethrow (it is the only
        // thing the renderer can classify the failure by).
        expect((outcome[0].reason as Error).message).toContain('[storeSearch:')
      }
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('searchStores handler failed:'),
        'Backend'
      )
    })

    it('handleGetStoreSearchDeals passes through a successful result unchanged', async () => {
      const fixture = [{ dealID: '1' }]
      mockGetGameDeals.mockResolvedValue(fixture)

      const result = await handleGetStoreSearchDeals(deps, 'game-1')

      expect(result).toBe(fixture)
      expect(mockGetGameDeals).toHaveBeenCalledWith(deps, 'game-1', 'US')
      expect(mockLogError).not.toHaveBeenCalled()
    })

    it('handleGetStoreSearchDeals REJECTS (never resolves to an empty array) when the provider rejects, and logs the exact channel prefix', async () => {
      mockGetGameDeals.mockRejectedValue(providerError())

      const outcome = await Promise.allSettled([
        handleGetStoreSearchDeals(deps, 'game-1')
      ])

      expect(outcome[0].status).toBe('rejected')
      if (outcome[0].status === 'rejected') {
        // T-47-28: the stable marker survives the rethrow (it is the only
        // thing the renderer can classify the failure by).
        expect((outcome[0].reason as Error).message).toContain('[storeSearch:')
      }
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('getStoreSearchDeals handler failed:'),
        'Backend'
      )
    })

    it('handleGetItadSteamGids passes the appIds through and returns the gid map unchanged', async () => {
      const fixture = { '620': 'gid-620' }
      mockLookupSteamGids.mockResolvedValue(fixture)

      const result = await handleGetItadSteamGids(deps, ['620', '730'])

      expect(result).toBe(fixture)
      expect(mockLookupSteamGids).toHaveBeenCalledWith(deps, ['620', '730'])
      expect(mockLogError).not.toHaveBeenCalled()
    })

    it('handleGetItadSteamGids keeps the log-and-rethrow wrapper when the lookup rejects', async () => {
      mockLookupSteamGids.mockRejectedValue(providerError())

      const outcome = await Promise.allSettled([
        handleGetItadSteamGids(deps, ['620'])
      ])

      expect(outcome[0].status).toBe('rejected')
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('getItadSteamGids handler failed:'),
        'Backend'
      )
    })
  })

  // ── Group 1b — country normalisation (RESEARCH D3) ───────────────────────
  describe('country normalisation (garbled input prices as US, never fails)', () => {
    beforeEach(() => {
      mockSearchGames.mockResolvedValue({ results: [], pricedCountry: 'US' })
      mockGetGameDeals.mockResolvedValue([])
    })

    it.each([
      ['GB', 'GB'],
      ['DE', 'DE'],
      [undefined, 'US'],
      [null, 'US'],
      ['gb', 'US'],
      ['USA', 'US'],
      ['', 'US']
    ])('handleSearchStores country %p -> %p', async (input, expected) => {
      await handleSearchStores(deps, 'portal', input)
      expect(mockSearchGames).toHaveBeenCalledWith(deps, 'portal', expected)
    })

    it.each([
      ['GB', 'GB'],
      [undefined, 'US'],
      [null, 'US'],
      ['gb', 'US'],
      ['USA', 'US']
    ])(
      'handleGetStoreSearchDeals country %p -> %p',
      async (input, expected) => {
        await handleGetStoreSearchDeals(deps, 'game-1', input)
        expect(mockGetGameDeals).toHaveBeenCalledWith(deps, 'game-1', expected)
      }
    )
  })

  // ── Group 2 — single-source-of-truth gate ────────────────────────────────
  describe('single-source-of-truth gate (anti-remerge)', () => {
    it('self-test: stripComments removes a comment-only occurrence of the forbidden phrase before matching', () => {
      const source = [
        '// this comment intentionally says: handler failed:',
        "import { addHandler } from 'backend/ipc'"
      ].join('\n')
      expect(stripComments(source)).not.toMatch(/handler failed:/)
    })

    it("sidecar/enrichmentFlowRegistration.ts references the shared module and contains no 'handler failed:' log string", () => {
      const source = readFileSync(
        join(__dirname, '..', '..', 'sidecar', 'enrichmentFlowRegistration.ts'),
        'utf-8'
      )
      const stripped = stripComments(source)
      expect(stripped).toMatch(/storeSearch\/handlers/)
      expect(stripped).not.toMatch(/handler failed:/)
    })

    it('the shared handlers.ts module itself holds all the log strings (the single source of truth)', () => {
      const source = readFileSync(join(__dirname, '..', 'handlers.ts'), 'utf-8')
      const stripped = stripComments(source)
      expect(stripped).toMatch(/searchStores handler failed:/)
      expect(stripped).toMatch(/getStoreSearchDeals handler failed:/)
      expect(stripped).toMatch(/getItadSteamGids handler failed:/)
    })
  })
})
