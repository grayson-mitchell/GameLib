import { readFileSync } from 'fs'
import { join } from 'path'

import {
  parseDump,
  extractRecords,
  dedupRecords,
  assertNonEmpty,
  ZeroRecordError
} from '../buildCrossoverIndex'

const FIXTURE_PATH = join(
  __dirname,
  'fixtures',
  'crossover-dump-sample.tie.xml'
)
const fixtureXml = readFileSync(FIXTURE_PATH, 'utf-8')

// A minimal dump with NO qualifying app at all — exercises the zero-record
// guard (T-02 / Pitfall 2) without touching the real fixture.
const EMPTY_DUMP_XML =
  '<?xml version="1.0" encoding="UTF-8"?><c4p><applications></applications></c4p>'

describe('buildCrossoverIndex', () => {
  describe('extractRecords', () => {
    const records = extractRecords(parseDump(fixtureXml))

    it('returns exactly the Mac-medal Games (excludes non-Games and Linux-only-medal apps)', () => {
      const appids = records.map((r) => r.appid).sort()
      expect(appids).toEqual(['1001', '1002', '2001', '2002', '3001'])
    })

    it('decodes entity-dense names (T-01) instead of leaving them raw', () => {
      const commandAndConquer = records.find((r) => r.appid === '1002')
      expect(commandAndConquer?.name).toBe('Command & Conquer')
      expect(commandAndConquer?.name).not.toContain('&amp;')
    })

    it('derives the canonical name from the bare no-@_lang <name>, not the lang="en" duplicate', () => {
      const halfLife = records.find((r) => r.appid === '1001')
      expect(halfLife?.name).toBe('Half-Life')
    })
  })

  describe('dedupRecords', () => {
    const records = extractRecords(parseDump(fixtureXml))

    it('resolves an exact cxversion+num tie deterministically to the lower appid, byte-identical across runs', () => {
      const run1 = dedupRecords(records)
      const run2 = dedupRecords(records)

      const quakeCollision = run1.collisions.find((c) => c.key === '2310')
      expect(quakeCollision).toBeDefined()
      expect(quakeCollision?.winnerAppid).toBe('2001')

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2))
    })

    it('produces a collisions list (count > 0) for the colliding steamid without throwing', () => {
      expect(() => dedupRecords(records)).not.toThrow()
      const { collisions } = dedupRecords(records)
      expect(collisions.length).toBeGreaterThan(0)
      const collision = collisions.find((c) => c.key === '2310')
      expect(collision?.loserAppids).toContain('2002')
    })
  })

  describe('zero-record guard', () => {
    it('throws / signals failure when extraction yields zero records', () => {
      const records = extractRecords(parseDump(EMPTY_DUMP_XML))
      expect(records).toHaveLength(0)
      expect(() => assertNonEmpty(records)).toThrow(ZeroRecordError)
    })

    it('does not throw for a non-empty extraction', () => {
      const records = extractRecords(parseDump(fixtureXml))
      expect(() => assertNonEmpty(records)).not.toThrow()
    })
  })
})
