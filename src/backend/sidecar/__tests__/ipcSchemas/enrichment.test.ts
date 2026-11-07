import { enrichmentAsyncArgs } from 'common/types/ipc/enrichment'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  formatRejectionLog,
  validateInbound
} from 'backend/sidecar/ipcValidation'
import {
  expectFixtureCoverage,
  roundTrip,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const SENTINEL = 'SENTINEL-STEAMGRIDDB-KEY-77c1'
const noArgs = { valid: [[]], invalid: [['x']] }
const locale = { countryCode: 'US', locale: 'en-US', currencyCode: 'USD' }
const gridQuery = {
  gameId: 123,
  styles: ['alternate'],
  dimensions: ['600x900']
}

const table: FixtureTable<typeof enrichmentAsyncArgs> = {
  getAnticheatInfo: {
    valid: [['ns-1'], ['']],
    invalid: [[], [1], ['x'.repeat(2000)]]
  },
  getKnownFixes: {
    valid: [['abc', 'gog']],
    invalid: [[], ['abc'], ['abc', 'epic'], ['', 'gog']]
  },
  getGamelibFixStatus: {
    valid: [['abc', 'steam']],
    invalid: [[], ['abc', 1]]
  },
  getRunsForMeMap: noArgs,
  setRunsForMe: {
    valid: [[{ appName: 'a', runner: 'gog', on: true }]],
    invalid: [
      [],
      [{ appName: 'a', runner: 'gog' }],
      [{ appName: 'a', runner: 'gog', on: true, x: 1 }]
    ]
  },
  getCrossoverIndex: noArgs,
  removeRecent: { valid: [['abc']], invalid: [[], [''], [{}]] },
  getWikiGameInfo: {
    valid: [
      ['Title', 'abc', 'gog'],
      ['Title', 'abc', 'gog', true]
    ],
    invalid: [
      [],
      ['Title'],
      ['Title', 'abc', 'bogus'],
      ['t', 'a', 'gog', 'yes']
    ]
  },
  getGogDiscounts: {
    valid: [[locale], [locale, true, false]],
    invalid: [
      [],
      [{ countryCode: 'US' }],
      [{ ...locale, extra: 1 }],
      [locale, 'y']
    ]
  },
  searchStores: {
    valid: [['half-life'], ['']],
    invalid: [[], [1], ['x'.repeat(300)]]
  },
  getStoreSearchDeals: { valid: [['123']], invalid: [[], [''], [1]] },
  getStoreSearchStoreMap: noArgs,
  'steamgriddb.hasApiKey': noArgs,
  'steamgriddb.setApiKey': {
    valid: [['abcdef0123'], ['']],
    invalid: [[], [1], ['k'.repeat(300)], [null]]
  },
  'steamgriddb.searchGame': {
    valid: [['doom']],
    invalid: [[], [1], ['q'.repeat(300)]]
  },
  'steamgriddb.getGrids': {
    valid: [[gridQuery], [{ gameId: 1 }]],
    invalid: [[], [{ gameId: 0 }], [{ gameId: 1.5 }], [{ ...gridQuery, x: 1 }]]
  },
  'steamgriddb.getHeroes': {
    valid: [[gridQuery]],
    invalid: [[], [{ gameId: '1' }], [{ gameId: 1, styles: [1] }]]
  }
}

describe('enrichment channel schemas', () => {
  it('has a fixture for every key (17 total)', () => {
    expectFixtureCoverage(enrichmentAsyncArgs, table)
    expect(Object.keys(enrichmentAsyncArgs).length).toBe(17)
  })
  runFixtureTable(enrichmentAsyncArgs, table)

  it('registers every channel in channelSchemas', () => {
    for (const k of Object.keys(enrichmentAsyncArgs)) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })

  // T-67-50: a rejected API key never reaches the log.
  describe.each([
    [[{ [SENTINEL]: SENTINEL }]],
    [[SENTINEL.repeat(20)]],
    [[SENTINEL, SENTINEL]]
  ])('steamgriddb.setApiKey rejection %#', (badArgs) => {
    it('is value-free', () => {
      const verdict = validateInbound(
        'steamgriddb.setApiKey',
        'invoke',
        roundTrip(badArgs) as unknown[]
      )
      expect(verdict.ok).toBe(false)
      if (verdict.ok) return
      expect(JSON.stringify(verdict)).not.toContain(SENTINEL)
      expect(formatRejectionLog('invoke', verdict)).not.toContain(SENTINEL)
    })
  })
})
