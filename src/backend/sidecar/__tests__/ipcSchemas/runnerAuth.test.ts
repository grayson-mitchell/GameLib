import {
  runnerAuthAsyncArgs,
  runnerAuthSyncArgs
} from 'common/types/ipc/runnerAuth'
import {
  expectFixtureCoverage,
  roundTrip,
  runFixtureTable,
  type FixtureTable
} from 'backend/testUtils/ipcSchemaFixtures'
import { formatRejectionLog, validateInbound } from '../../ipcValidation'

const SENTINEL = 'SENTINEL-CREDENTIAL-7f3a'

const nileData = {
  code: 'AUTHCODE',
  code_verifier: 'verifier',
  serial: 'serial-1',
  client_id: 'client-1'
}

const syncTable: FixtureTable<typeof runnerAuthSyncArgs> = {
  logoutGOG: { valid: [[]], invalid: [['extra']] }
}

const noArgs = { valid: [[]], invalid: [['extra']] }

const asyncTable: FixtureTable<typeof runnerAuthAsyncArgs> = {
  getEpicGamesStatus: noArgs,
  getUserInfo: noArgs,
  getAmazonUserInfo: noArgs,
  isLoggedIn: noArgs,
  login: {
    valid: [['0123456789abcdef']],
    invalid: [[''], [42], [], ['a', 'b']]
  },
  authGOG: { valid: [['gog-code']], invalid: [[''], [{ code: 'x' }], []] },
  authAmazon: {
    valid: [[nileData]],
    invalid: [
      [{ ...nileData, smuggled: 1 }],
      [{ code: 'x' }],
      [{ ...nileData, serial: '' }],
      [null]
    ]
  },
  logoutLegendary: noArgs,
  logoutAmazon: noArgs,
  getAmazonLoginData: noArgs
}

describe('runnerAuth IPC schemas', () => {
  it('has a fixture for every channel', () => {
    expectFixtureCoverage(runnerAuthSyncArgs, syncTable)
    expectFixtureCoverage(runnerAuthAsyncArgs, asyncTable)
  })
  runFixtureTable(runnerAuthSyncArgs, syncTable)
  runFixtureTable(runnerAuthAsyncArgs, asyncTable)

  it('bounds an oversized token', () => {
    expect(
      runnerAuthAsyncArgs.login.safeParse(['x'.repeat(5000)]).success
    ).toBe(false)
  })

  // D-10 / T-67-30: a rejection never carries the credential value.
  describe.each([
    ['login', [`${SENTINEL}${'x'.repeat(5000)}`]],
    ['authGOG', [{ code: SENTINEL }]],
    ['authAmazon', [{ ...nileData, code: SENTINEL, smuggled: SENTINEL }]],
    ['authAmazon', [{ [SENTINEL]: SENTINEL }]]
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
