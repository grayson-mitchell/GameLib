/**
 * Behavioural + single-source-of-truth proof for `storeSearch/handlers.ts`
 * (Phase 34.2 Plan 13, closes code-review finding WR-09).
 *
 * Group 1 asserts the Phase 20 D-14 rethrow-don't-swallow error contract
 * directly against the three shared handler bodies, mocking only
 * `../cheapshark` and `../../logger` so the contract is exercised without any
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
const mockGetStoreMap = jest.fn()
jest.mock('../cheapshark', () => ({
  searchGames: (...args: unknown[]) => mockSearchGames(...args),
  getGameDeals: (...args: unknown[]) => mockGetGameDeals(...args),
  getStoreMap: (...args: unknown[]) => mockGetStoreMap(...args)
}))

const mockLogError = jest.fn()
jest.mock('../../logger', () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  LogPrefix: { Backend: 'Backend' }
}))

import {
  handleSearchStores,
  handleGetStoreSearchDeals,
  handleGetStoreSearchStoreMap
} from '../handlers'

// Comment-stripping now delegates to the shared
// `backend/testUtils/stripSourceComments` util (strips block comments first,
// then the line-prefix filter), imported above as `stripComments`.

describe('storeSearch/handlers.ts', () => {
  beforeEach(() => {
    mockSearchGames.mockReset()
    mockGetGameDeals.mockReset()
    mockGetStoreMap.mockReset()
    mockLogError.mockReset()
  })

  // ── Group 1 — behavioural: the D-14 contract itself ─────────────────────
  describe('behavioural contract (Phase 20 D-14)', () => {
    it('handleSearchStores passes through a successful result unchanged', async () => {
      const fixture = [{ title: 'Portal 2' }]
      mockSearchGames.mockResolvedValue(fixture)

      const result = await handleSearchStores('portal')

      expect(result).toBe(fixture)
      expect(mockSearchGames).toHaveBeenCalledWith('portal')
      expect(mockLogError).not.toHaveBeenCalled()
    })

    it('handleSearchStores REJECTS (never resolves to an empty result) when the provider rejects, and logs the exact channel prefix', async () => {
      mockSearchGames.mockRejectedValue(new Error('cheapshark unreachable'))

      const outcome = await Promise.allSettled([handleSearchStores('portal')])

      // D-14: the promise must be REJECTED, never resolved to [] -- assert
      // the settlement status explicitly, not merely imply it from a
      // `.rejects.toThrow` assertion alone.
      expect(outcome[0].status).toBe('rejected')
      if (outcome[0].status === 'rejected') {
        expect((outcome[0].reason as Error).message).toBe(
          'cheapshark unreachable'
        )
      }
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('searchStores handler failed:'),
        'Backend'
      )
    })

    it('handleGetStoreSearchDeals passes through a successful result unchanged', async () => {
      const fixture = [{ dealID: '1' }]
      mockGetGameDeals.mockResolvedValue(fixture)

      const result = await handleGetStoreSearchDeals('game-1')

      expect(result).toBe(fixture)
      expect(mockGetGameDeals).toHaveBeenCalledWith('game-1')
      expect(mockLogError).not.toHaveBeenCalled()
    })

    it('handleGetStoreSearchDeals REJECTS (never resolves to an empty array) when the provider rejects, and logs the exact channel prefix', async () => {
      mockGetGameDeals.mockRejectedValue(new Error('cheapshark unreachable'))

      const outcome = await Promise.allSettled([
        handleGetStoreSearchDeals('game-1')
      ])

      expect(outcome[0].status).toBe('rejected')
      if (outcome[0].status === 'rejected') {
        expect((outcome[0].reason as Error).message).toBe(
          'cheapshark unreachable'
        )
      }
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('getStoreSearchDeals handler failed:'),
        'Backend'
      )
    })

    it('handleGetStoreSearchStoreMap passes through a successful result unchanged', async () => {
      const fixture = { g2a: { name: 'G2A' } }
      mockGetStoreMap.mockResolvedValue(fixture)

      const result = await handleGetStoreSearchStoreMap()

      expect(result).toBe(fixture)
      expect(mockLogError).not.toHaveBeenCalled()
    })

    it('handleGetStoreSearchStoreMap REJECTS (never resolves to an empty object) when the provider rejects, and logs the exact channel prefix', async () => {
      mockGetStoreMap.mockRejectedValue(new Error('cheapshark unreachable'))

      const outcome = await Promise.allSettled([handleGetStoreSearchStoreMap()])

      expect(outcome[0].status).toBe('rejected')
      if (outcome[0].status === 'rejected') {
        expect((outcome[0].reason as Error).message).toBe(
          'cheapshark unreachable'
        )
      }
      expect(mockLogError).toHaveBeenCalledWith(
        expect.stringContaining('getStoreSearchStoreMap handler failed:'),
        'Backend'
      )
    })
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

    it("storeSearch/index.ts references the shared module and contains no 'handler failed:' log string", () => {
      const source = readFileSync(join(__dirname, '..', 'index.ts'), 'utf-8')
      const stripped = stripComments(source)
      expect(stripped).toMatch(/from\s+['"]\.\/handlers['"]/)
      expect(stripped).not.toMatch(/handler failed:/)
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

    it('the shared handlers.ts module itself holds all three log strings (the single source of truth)', () => {
      const source = readFileSync(join(__dirname, '..', 'handlers.ts'), 'utf-8')
      const stripped = stripComments(source)
      expect(stripped).toMatch(/searchStores handler failed:/)
      expect(stripped).toMatch(/getStoreSearchDeals handler failed:/)
      expect(stripped).toMatch(/getStoreSearchStoreMap handler failed:/)
    })
  })
})
