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

const SENTINEL = 'SENTINEL-API-KEY-77c1'
const noArgs = { valid: [[]], invalid: [['x']] }
const locale = { countryCode: 'US', locale: 'en-US', currencyCode: 'USD' }

const table: FixtureTable<typeof enrichmentAsyncArgs> = {
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
  getStoreSearchDeals: {
    valid: [
      ['018d937f-0f7e-7172-b2c5-9a6e6b4e38a1'],
      ['018d937f-0f7e-7172-b2c5-9a6e6b4e38a1', 'US']
    ],
    invalid: [[], [''], [1], ['a.b']]
  },
  getItadSteamGids: {
    valid: [[['220', '400']], [[]]],
    invalid: [[['abc']], [[220]], [Array(5001).fill('1')]]
  },
  'itad.getKeyStatus': noArgs,
  'itad.setApiKey': {
    valid: [['k'], ['']],
    invalid: [[], [1], ['x'.repeat(257)]]
  }
}

describe('enrichment channel schemas', () => {
  it('has a fixture for every key (11 total)', () => {
    expectFixtureCoverage(enrichmentAsyncArgs, table)
    expect(Object.keys(enrichmentAsyncArgs).length).toBe(11)
  })
  runFixtureTable(enrichmentAsyncArgs, table)

  it('registers every channel in channelSchemas', () => {
    for (const k of Object.keys(enrichmentAsyncArgs)) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })

  // T-67-50: a rejected API key never reaches the log (itad.setApiKey; the steamgriddb.* key channel
  // is native since Phase 86 Plan 15 and its rejections are fixed literals in the Rust handler).
  describe.each([
    [[{ [SENTINEL]: SENTINEL }]],
    [[SENTINEL.repeat(20)]],
    [[SENTINEL, SENTINEL]]
  ])('itad.setApiKey rejection %#', (badArgs) => {
    it('is value-free', () => {
      const verdict = validateInbound(
        'itad.setApiKey',
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
