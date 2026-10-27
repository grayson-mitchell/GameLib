/**
 * debug/shutdown-mid-connect-logon-survives: abortSteamUserLogon against the
 * REAL steam-user (not the fake the user.ts suites use), because the defect is
 * in the library's own retry path. A plain logOff() after ClientLogon is sent
 * logs on again by itself about 6 s later through `_logonMsgTimeout` ->
 * `_enqueueLogonAttempt` -> `logOn(true)`. If a steam-user upgrade renames that
 * internal, the "abort" case here fails.
 *
 * No network and no disk: `_doConnection` and `_send` are stubbed, and
 * `dataDirectory: null` turns off steam-user's file storage.
 */
import SteamUserLib from 'steam-user'
import { abortSteamUserLogon } from '../steamUserLogonAbort'

// A syntactically valid Steam refresh token (iss=steam, aud=client); never sent anywhere.
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const FAKE_REFRESH_TOKEN = `${b64({ alg: 'none' })}.${b64({
  iss: 'steam',
  sub: '76561197960287930',
  aud: ['client']
})}.sig`

interface Probe {
  client: InstanceType<typeof SteamUserLib>
  connects: () => number
}

async function clientWithClientLogonSent(): Promise<Probe> {
  const client = new SteamUserLib({
    dataDirectory: null,
    enablePicsCache: false,
    autoRelogin: false
  } as never)
  const raw = client as unknown as Record<string, unknown>
  let connects = 0
  raw._doConnection = () => {
    connects++
  }
  raw._send = () => undefined
  client.logOn({ refreshToken: FAKE_REFRESH_TOKEN })
  // logOn's body runs on nextTick and awaits _readFiles before _doConnection.
  await jest.advanceTimersByTimeAsync(0)
  expect(connects).toBe(1)
  // The connection is up and encrypted: steam-user now sends ClientLogon and
  // arms its 5 s logon-message timeout.
  raw._connection = { end: () => undefined }
  await (raw._sendLogOn as () => Promise<void>).call(client)
  expect(raw._logonMsgTimeout).toBeDefined()
  return { client, connects: () => connects }
}

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.clearAllTimers()
  jest.useRealTimers()
})

describe('abortSteamUserLogon (real steam-user)', () => {
  it('control: a bare logOff() after ClientLogon is sent connects again by itself', async () => {
    const probe = await clientWithClientLogonSent()
    probe.client.logOff()
    await jest.advanceTimersByTimeAsync(7000)
    // This is the live defect: a second connect, with the saved refresh token.
    expect(probe.connects()).toBe(2)
  })

  it('abort after ClientLogon is sent never connects again', async () => {
    const probe = await clientWithClientLogonSent()
    abortSteamUserLogon(probe.client)
    await jest.advanceTimersByTimeAsync(60000)
    expect(probe.connects()).toBe(1)
    expect(jest.getTimerCount()).toBe(0)
  })

  it('clears the retry timer even when logOff() throws, and rethrows', async () => {
    const probe = await clientWithClientLogonSent()
    const err = new Error('boom')
    jest.spyOn(probe.client, 'logOff').mockImplementation(() => {
      throw err
    })
    expect(() => abortSteamUserLogon(probe.client)).toThrow(err)
    expect(
      (probe.client as unknown as Record<string, unknown>)._logonMsgTimeout
    ).toBeUndefined()
  })

  it('is a plain logOff() on a client with no logon in flight', () => {
    const logOff = jest.fn()
    abortSteamUserLogon({ logOff })
    expect(logOff).toHaveBeenCalledTimes(1)
  })
})
