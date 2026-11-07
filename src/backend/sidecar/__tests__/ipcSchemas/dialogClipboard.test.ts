import {
  clipboardAsyncArgs,
  clipboardSyncArgs
} from 'common/types/ipc/clipboard'
import { dialogAsyncArgs } from 'common/types/ipc/dialog'
import {
  expectFixtureCoverage,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const dialogTable: FixtureTable<typeof dialogAsyncArgs> = {
  openDialog: {
    valid: [
      [
        {
          buttonLabel: 'Choose',
          properties: ['openDirectory'],
          title: 'Move install',
          defaultPath: '/home/user/Games'
        }
      ],
      [
        {
          properties: ['openFile'],
          filters: [{ name: 'Executables', extensions: ['exe', 'bat'] }]
        }
      ],
      [{}]
    ],
    invalid: [
      [{ title: 'x', smuggled: true }],
      [{ properties: ['openEverything'] }],
      [{ filters: [{ name: 'x', extensions: ['a'], extra: 1 }] }],
      []
    ]
  }
}

const syncTable: FixtureTable<typeof clipboardSyncArgs> = {
  clipboardWriteText: {
    valid: [['ABCDE-FGHIJ-KLMNO'], ['']],
    invalid: [[], [42], ['x'.repeat(1_000_001)]]
  },
  copySystemInfoToClipboard: { valid: [[]], invalid: [['extra']] }
}

const asyncTable: FixtureTable<typeof clipboardAsyncArgs> = {
  clipboardReadText: { valid: [[]], invalid: [['extra']] }
}

describe('dialog and clipboard IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(dialogAsyncArgs, dialogTable)
    expectFixtureCoverage(clipboardSyncArgs, syncTable)
    expectFixtureCoverage(clipboardAsyncArgs, asyncTable)
  })
  runFixtureTable(dialogAsyncArgs, dialogTable)
  runFixtureTable(clipboardSyncArgs, syncTable)
  runFixtureTable(clipboardAsyncArgs, asyncTable)
})
