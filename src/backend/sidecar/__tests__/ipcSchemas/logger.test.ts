import { loggerFrontendMessagesArgs } from 'common/types/ipc/logger'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

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
    expectFixtureCoverage(loggerFrontendMessagesArgs, pushTable)
  })
  runFixtureTable(loggerFrontendMessagesArgs, pushTable)

  it('registers every logger push in channelSchemas', () => {
    for (const k of Object.keys(loggerFrontendMessagesArgs)) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })
})
