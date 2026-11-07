import {
  loggerAsyncArgs,
  loggerFrontendMessagesArgs,
  loggerSyncArgs
} from 'common/types/ipc/logger'
import { channelSchemas } from 'common/types/ipc/channelSchemas'
import {
  formatRejectionLog,
  setIpcRejectionLogSink,
  validateInbound
} from 'backend/sidecar/ipcValidation'
import {
  expectFixtureCoverage,
  roundTrip,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'

const syncTable: FixtureTable<typeof loggerSyncArgs> = {
  logError: {
    valid: [
      ['Sync with upstream releases failed'],
      [`Library refresh failed: ${String(new Error('boom'))}`],
      // what a bare Error serialises to across IPC
      [new Error('boom')],
      [{ message: 'boom', stack: 'Error: boom\n    at x' }],
      [['a', 'b']]
    ],
    invalid: [
      [],
      [5],
      [null],
      ['x'.repeat(70000)],
      [{ message: 'x', extra: 1 }],
      ['a', 'b'],
      [Array.from({ length: 300 }, () => 'a')]
    ]
  },
  logInfo: {
    valid: [['[BLANKPROBE] {"a":1}'], [['x']], ['']],
    invalid: [[], [{ a: 1 }], [true], ['x'.repeat(70000)]]
  },
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

  it('registers all 8 channels in channelSchemas', () => {
    for (const k of [
      ...Object.keys(loggerSyncArgs),
      ...Object.keys(loggerAsyncArgs),
      ...Object.keys(loggerFrontendMessagesArgs)
    ]) {
      expect(channelSchemas[k]).toBeDefined()
    }
  })

  // D-09: a rejected logError is a verdict plus one stderr line; it never reaches a listener
  // and never routes back through logError.
  it('a rejected logError payload yields one value-free stderr line and no recursion', () => {
    const SENTINEL = 'SENTINEL-LOG-9c1d'
    const sink: string[] = []
    setIpcRejectionLogSink((l) => sink.push(l))
    const writes: string[] = []
    const spy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation((chunk: string | Uint8Array) => {
        writes.push(String(chunk))
        return true
      })
    try {
      const verdict = validateInbound(
        'logError',
        'send',
        roundTrip([{ message: SENTINEL, [SENTINEL]: 1 }]) as unknown[]
      )
      expect(verdict.ok).toBe(false)
      if (verdict.ok) return
      expect(formatRejectionLog('send', verdict)).not.toContain(SENTINEL)
      // exercise the sidecar's own logging path
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logRejection } = require('backend/sidecar/ipcValidation')
      logRejection('send', verdict)
    } finally {
      spy.mockRestore()
      setIpcRejectionLogSink(null)
    }
    expect(writes.filter((l) => l.includes('IPC_INVALID_ARGS'))).toHaveLength(1)
    expect(sink).toHaveLength(1)
    expect(JSON.stringify([writes, sink])).not.toContain(SENTINEL)
    expect(JSON.stringify([writes, sink])).not.toContain('logError(')
  })
})
