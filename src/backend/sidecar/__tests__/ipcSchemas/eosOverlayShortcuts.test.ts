import { eosOverlayAsyncArgs } from 'common/types/ipc/eosOverlay'
import {
  shortcutsAsyncArgs,
  shortcutsSyncArgs
} from 'common/types/ipc/shortcuts'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const eosTable: FixtureTable<typeof eosOverlayAsyncArgs> = {
  getEosOverlayStatus: { valid: [[]], invalid: [['x']] },
  getLatestEosOverlayVersion: { valid: [[]], invalid: [[1]] },
  updateEosOverlayInfo: { valid: [[]], invalid: [['x']] },
  installEosOverlay: { valid: [[]], invalid: [[true]] },
  removeEosOverlay: { valid: [[true], [false]], invalid: [[], ['yes'], [1]] },
  enableEosOverlay: { valid: [['Fortnite']], invalid: [[''], [], [5]] },
  disableEosOverlay: { valid: [['Fortnite']], invalid: [[''], [{}]] },
  isEosOverlayEnabled: {
    valid: [[], ['Fortnite'], [undefined], [null]],
    invalid: [[''], [5], ['a', 'b']]
  }
}

const shortcutsSyncTable: FixtureTable<typeof shortcutsSyncArgs> = {
  processShortcut: {
    valid: [['ctrl+r'], ['ctrl+shift+i']],
    invalid: [[''], [5], []]
  }
}

const pair = {
  valid: [
    ['abc', 'legendary'],
    ['1234', 'steam']
  ],
  invalid: [['', 'gog'], ['abc', 'epic'], ['abc'], [5, 'gog']]
}

const shortcutsAsyncTable: FixtureTable<typeof shortcutsAsyncArgs> = {
  shortcutsExists: pair,
  addShortcut: {
    valid: [
      ['abc', 'gog', true],
      ['abc', 'gog', false],
      ['abc', 'gog'],
      ['abc', 'gog', null]
    ],
    invalid: [
      ['abc', 'epic', true],
      ['', 'gog', true],
      ['abc', 'gog', 'yes']
    ]
  },
  removeShortcut: pair,
  addToSteam: pair,
  removeFromSteam: pair,
  isAddedToSteam: pair
}

describe('eosOverlay and shortcuts IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(eosOverlayAsyncArgs, eosTable)
    expectFixtureCoverage(shortcutsSyncArgs, shortcutsSyncTable)
    expectFixtureCoverage(shortcutsAsyncArgs, shortcutsAsyncTable)
  })
  runFixtureTable(eosOverlayAsyncArgs, eosTable)
  runFixtureTable(shortcutsSyncArgs, shortcutsSyncTable)
  runFixtureTable(shortcutsAsyncArgs, shortcutsAsyncTable)
})
