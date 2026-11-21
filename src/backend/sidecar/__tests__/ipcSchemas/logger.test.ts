import {
  loggerAsyncArgs,
  loggerFrontendMessagesArgs,
  loggerSyncArgs
} from 'common/types/ipc/logger'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const syncTable: FixtureTable<typeof loggerSyncArgs> = {
  showLogFileInFolder: {
    valid: [
      [{}],
      [{ runner: 'legendary' }],
      [{ runner: 'comet' }],
      [{ appName: 'abc', runner: 'gog' }],
      [{ appName: 'abc', runner: 'steam', type: 'install' }]
    ],
    invalid: [
      [],
      [{ runner: 'epic' }],
      [{ appName: 'abc' }],
      [{ appName: '', runner: 'gog' }],
      [{ appName: 'abc', runner: 'gog', type: 'nope' }],
      [{ runner: 'gog', extra: 1 }],
      ['x']
    ]
  }
}

const asyncTable: FixtureTable<typeof loggerAsyncArgs> = {
  uploadLogFile: {
    valid: [
      ['Heroic log', {}],
      ['Game log of X', { appName: 'abc', runner: 'gog', type: 'launch' }]
    ],
    invalid: [['x'], [1, {}], ['x', { appName: 'abc' }], ['x', {}, 'extra']]
  },
  deleteUploadedLogFile: {
    valid: [['https://dpaste.com/ABC123']],
    invalid: [[], [''], ['not a url'], ['file:///etc/passwd'], [5]]
  },
  getUploadedLogFiles: { valid: [[]], invalid: [['x']] }
}

const pushTable: FixtureTable<typeof loggerFrontendMessagesArgs> = {
  logFileUploaded: {
    valid: [
      [
        'https://dpaste.com/ABC123',
        { name: 'Heroic log', token: '1', uploadedAt: 1 }
      ]
    ],
    invalid: [['https://dpaste.com/ABC123'], [1, {}], ['u', null]]
  },
  logFileUploadDeleted: {
    valid: [['https://dpaste.com/ABC123']],
    invalid: [[], [1]]
  }
}

describe('logger channel schemas', () => {
  it('has a fixture for every key', () => {
    expectFixtureCoverage(loggerSyncArgs, syncTable)
    expectFixtureCoverage(loggerAsyncArgs, asyncTable)
    expectFixtureCoverage(loggerFrontendMessagesArgs, pushTable)
  })
  runFixtureTable(loggerSyncArgs, syncTable)
  runFixtureTable(loggerAsyncArgs, asyncTable)
  runFixtureTable(loggerFrontendMessagesArgs, pushTable)

  it('registers every remaining logger channel in channelSchemas', () => {
    for (const k of [
      ...Object.keys(loggerSyncArgs),
      ...Object.keys(loggerAsyncArgs),
      ...Object.keys(loggerFrontendMessagesArgs)
    ]) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })
})
