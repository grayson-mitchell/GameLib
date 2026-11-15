/**
 * Phase 80 plan 03: the committed Rust golden must equal what the real i18next renders today.
 * A locale edit that changes a poll notification fails here until the golden is regenerated.
 */
import { existsSync } from 'node:fs'
import {
  GOLDEN_PATH,
  generate,
  readCommitted,
  serialize
} from '../../../meta/genI18nGolden'

// The backend jest project shadows i18next with a key-echoing mock; this test needs the real one.
jest.unmock('i18next')

describe('i18n golden', () => {
  it('rendered.json is fresh', async () => {
    expect(existsSync(GOLDEN_PATH)).toBe(true)
    const fresh = serialize(await generate())
    if (fresh !== readCommitted()) {
      throw new Error(
        'gamelib-i18n golden is stale: run node meta/runTs.cjs --bundle --platform=node --target=node22 meta/genI18nGolden.ts'
      )
    }
  })

  it('every row is rendered text, never the raw key', async () => {
    const rows = await generate()
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      expect(row.rendered).not.toBe('')
      expect(row.rendered).not.toBe(row.key)
    }
  })
})
