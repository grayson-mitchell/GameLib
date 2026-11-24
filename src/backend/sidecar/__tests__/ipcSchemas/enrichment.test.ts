import { enrichmentAsyncArgs } from 'common/types/ipc/enrichment'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const noArgs = { valid: [[]], invalid: [['x']] }
const locale = { countryCode: 'US', locale: 'en-US', currencyCode: 'USD' }

const table: FixtureTable<typeof enrichmentAsyncArgs> = {
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
  getGogDiscounts: {
    valid: [[locale], [locale, true, false]],
    invalid: [
      [],
      [{ countryCode: 'US' }],
      [{ ...locale, extra: 1 }],
      [locale, 'y']
    ]
  }
}

describe('enrichment channel schemas', () => {
  it('has a fixture for every key (4 total)', () => {
    expectFixtureCoverage(enrichmentAsyncArgs, table)
    expect(Object.keys(enrichmentAsyncArgs).length).toBe(4)
  })
  runFixtureTable(enrichmentAsyncArgs, table)

  it('registers every channel in channelSchemas', () => {
    for (const k of Object.keys(enrichmentAsyncArgs)) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })

  // T-67-50 / T-47-42: a rejected API key never reaches the log. The key channels (`steamgriddb.*` since
  // Phase 86 Plan 15, `itad.setApiKey` since Plan 16) are native `info` channels; their rejections are
  // fixed literals in the Rust handlers (`info_dispatch.rs` tests assert the value is never echoed).
})
