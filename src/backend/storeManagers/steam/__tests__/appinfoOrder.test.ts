import {
  extractDepotOrder,
  withAppInfoOrderCapture,
  getAppInfoDepotOrder,
  clearAppInfoDepotOrder
} from '../depot/appinfoOrder'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

// Shape of XCOM 200510's real appinfo: 225341 is listed BEFORE 200522.
const VDF = `"appinfo"
{
\t"appid"\t\t"200510"
\t"depots"
\t{
\t\t"overridescddb"\t\t"1"
\t\t"200511"
\t\t{
\t\t\t"config" { "oslist" "windows" }
\t\t}
\t\t"225341"
\t\t{
\t\t\t"dlcappid"\t\t"225340"
\t\t\t"manifests" { "public" { "gid" "41984338994600089" } }
\t\t}
\t\t"200522"
\t\t{
\t\t\t"dlcappid"\t\t"225340"
\t\t}
\t\t"branches" { "public" { "buildid" "848157" } }
\t}
\t"common" { "name" "XCOM" "200999" { "x" "y" } }
}`

describe('extractDepotOrder', () => {
  it('returns depot ids in raw textual order, not numeric order', () => {
    expect(extractDepotOrder(VDF)).toEqual(['200511', '225341', '200522'])
  })
  it('ignores numeric-looking blocks outside depots and returns undefined with no depots block', () => {
    expect(
      extractDepotOrder('"appinfo" { "common" { "5" { } } }')
    ).toBeUndefined()
  })
})

describe('withAppInfoOrderCapture', () => {
  beforeEach(() => clearAppInfoDepotOrder())

  function makeClient() {
    const original = function (
      _h: unknown,
      _b: unknown,
      cb: (b: unknown) => void
    ) {
      cb({ apps: [{ appid: 200510, buffer: Buffer.from(VDF + '\0') }] })
    }
    return { _send: original, original }
  }

  it('records raw order from a PICS response, passes the body through, and restores _send', async () => {
    const client = makeClient()
    let seen: unknown
    await withAppInfoOrderCapture(client, () => {
      client._send({ msg: 8903 }, {}, (b) => (seen = b))
      return Promise.resolve()
    })
    expect(getAppInfoDepotOrder('200510')).toEqual([
      '200511',
      '225341',
      '200522'
    ])
    expect((seen as { apps: unknown[] }).apps).toHaveLength(1)
    expect(client._send).toBe(client.original)
  })

  it('ignores other messages and leaves order unknown', async () => {
    const client = makeClient()
    await withAppInfoOrderCapture(client, () => {
      client._send({ msg: 1 }, {}, () => undefined)
      return Promise.resolve()
    })
    expect(getAppInfoDepotOrder('200510')).toBeUndefined()
  })

  it('runs fn unchanged when the client has no _send', async () => {
    await expect(
      withAppInfoOrderCapture({}, () => Promise.resolve(7))
    ).resolves.toBe(7)
  })
})
