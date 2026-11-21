import {
  loggerAsyncArgs,
  loggerFrontendMessagesArgs
} from 'common/types/ipc/logger'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const asyncTable: FixtureTable<typeof loggerAsyncArgs> = {
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
    expectFixtureCoverage(loggerAsyncArgs, asyncTable)
    expectFixtureCoverage(loggerFrontendMessagesArgs, pushTable)
  })
  runFixtureTable(loggerAsyncArgs, asyncTable)
  runFixtureTable(loggerFrontendMessagesArgs, pushTable)

  it('registers every remaining logger channel in channelSchemas', () => {
    for (const k of [
      ...Object.keys(loggerAsyncArgs),
      ...Object.keys(loggerFrontendMessagesArgs)
    ]) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })
})
