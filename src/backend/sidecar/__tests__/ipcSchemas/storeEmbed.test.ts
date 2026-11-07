import {
  storeEmbedAsyncArgs,
  storeEmbedSyncArgs
} from 'common/types/ipc/storeEmbed'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const bounds = { x: 0, y: 48, w: 1280, h: 720 }
const noArgs = { valid: [[]], invalid: [['extra']] }

const syncTable: FixtureTable<typeof storeEmbedSyncArgs> = {
  storeEmbedSetBounds: {
    valid: [[bounds], [{ x: -4.5, y: 0, w: 0, h: 0 }]],
    invalid: [
      [{ ...bounds, w: -1 }],
      [{ ...bounds, h: -0.5 }],
      [{ x: 0, y: 0, w: 1 }],
      [{ ...bounds, extra: 1 }],
      [{ ...bounds, x: null }],
      [{ ...bounds, x: 'a' }],
      []
    ]
  }
}

const asyncTable: FixtureTable<typeof storeEmbedAsyncArgs> = {
  storeEmbedOpen: {
    valid: [
      ['https://store.steampowered.com/', bounds, 'steam'],
      ['https://store.steampowered.com/', bounds, 'steam', 'https://x.test/'],
      ['https://www.gog.com/', bounds, 'gog', undefined]
    ],
    invalid: [
      ['not a url', bounds, 'steam'],
      ['https://x.test/', { ...bounds, w: -2 }, 'steam'],
      ['https://x.test/', bounds, ''],
      ['https://x.test/', bounds, 'steam', 'not a url'],
      ['https://x.test/', bounds],
      []
    ]
  },
  storeEmbedHide: noArgs,
  storeEmbedShow: noArgs,
  storeEmbedClose: noArgs,
  storeEmbedTakeNavEvents: noArgs,
  storeEmbedBack: noArgs,
  storeEmbedForward: noArgs,
  storeEmbedReload: noArgs,
  storeEmbedNavigate: {
    valid: [['https://store.steampowered.com/app/220']],
    invalid: [[''], [42], [], ['https://x.test/', 'extra']]
  }
}

describe('storeEmbed IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(storeEmbedSyncArgs, syncTable)
    expectFixtureCoverage(storeEmbedAsyncArgs, asyncTable)
  })
  runFixtureTable(storeEmbedSyncArgs, syncTable)
  runFixtureTable(storeEmbedAsyncArgs, asyncTable)
})
