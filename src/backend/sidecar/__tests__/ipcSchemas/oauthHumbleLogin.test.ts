import {
  humbleLoginAsyncArgs,
  humbleLoginSyncArgs
} from 'common/types/ipc/humbleLogin'
import { oauthLoginAsyncArgs } from 'common/types/ipc/oauthLogin'
import {
  expectFixtureCoverage,
  roundTrip,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'
import { formatRejectionLog, validateInbound } from '../../ipcValidation'

const SENTINEL = 'SENTINEL-CREDENTIAL-7f3a'

const oauthTable: FixtureTable<typeof oauthLoginAsyncArgs> = {
  oauthCaptureLogin: {
    valid: [
      [{ runner: 'gog', url: 'https://auth.gog.com/auth?client_id=1' }],
      [{ runner: 'legendary', url: 'https://www.epicgames.com/id/login' }],
      [{ runner: 'nile', url: 'https://www.amazon.com/ap/signin' }]
    ],
    invalid: [
      [{ runner: 'steam', url: 'https://example.com' }],
      [{ runner: 'gog', url: 'not a url' }],
      [{ runner: 'gog', url: 'https://example.com', extra: 1 }],
      [{ runner: 'gog' }],
      ['https://example.com']
    ]
  }
}

const humbleSyncTable: FixtureTable<typeof humbleLoginSyncArgs> = {
  humbleStopLogin: { valid: [[]], invalid: [['extra']] }
}

const humbleTable: FixtureTable<typeof humbleLoginAsyncArgs> = {
  humbleStartLogin: { valid: [[]], invalid: [['extra']] },
  humbleReconnect: { valid: [[]], invalid: [[1]] },
  humbleRevealKey: {
    valid: [[{ gamekey: 'AbC123', machineName: 'game_windows' }]],
    invalid: [
      [{ gamekey: 'AbC123' }],
      [{ gamekey: '', machineName: 'm' }],
      [{ gamekey: 'a', machineName: 'm', extra: true }],
      []
    ]
  }
}

describe('oauthLogin and humbleLogin IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(oauthLoginAsyncArgs, oauthTable)
    expectFixtureCoverage(humbleLoginSyncArgs, humbleSyncTable)
    expectFixtureCoverage(humbleLoginAsyncArgs, humbleTable)
  })
  runFixtureTable(oauthLoginAsyncArgs, oauthTable)
  runFixtureTable(humbleLoginSyncArgs, humbleSyncTable)
  runFixtureTable(humbleLoginAsyncArgs, humbleTable)

  // D-10 / T-67-30: a rejection never carries the OAuth params or key identifiers.
  describe.each([
    [
      'oauthCaptureLogin',
      [
        {
          runner: 'gog',
          url: `https://x.example/?code=${SENTINEL}`,
          e: SENTINEL
        }
      ]
    ],
    ['oauthCaptureLogin', [{ runner: SENTINEL, url: SENTINEL }]],
    ['humbleRevealKey', [{ gamekey: SENTINEL, machineName: 1, [SENTINEL]: 1 }]]
  ])('%s rejection', (channel, badArgs) => {
    it('is value-free', () => {
      const verdict = validateInbound(
        channel,
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
