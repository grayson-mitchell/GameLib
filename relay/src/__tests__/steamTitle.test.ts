import { createFakeFetch } from './helpers/fakeFetch'
import { lookupSteamTitle, sanitizeSteamTitle } from '../steamTitle'

const url = (id: string) =>
  `https://store.steampowered.com/api/appdetails?appids=${id}&filters=basic`

const ok = (id: string, type: string | undefined, name: string) => ({
  status: 200,
  json: { [id]: { success: true, data: { type, name } } }
})

describe('title', () => {
  it('returns the title for a game', async () => {
    const { fetch } = createFakeFetch({
      [`GET ${url('220')}`]: ok('220', 'game', 'Half-Life 2')
    })
    expect(await lookupSteamTitle('220', fetch)).toEqual({
      ok: true,
      title: 'Half-Life 2'
    })
  })

  it('accepts demos', async () => {
    const { fetch } = createFakeFetch({
      [`GET ${url('5')}`]: ok('5', 'demo', 'Demo Thing')
    })
    expect((await lookupSteamTitle('5', fetch)).ok).toBe(true)
  })

  it.each(['dlc', 'music', undefined])('rejects type %s', async (type) => {
    const { fetch } = createFakeFetch({
      [`GET ${url('5')}`]: ok('5', type, 'X')
    })
    expect(await lookupSteamTitle('5', fetch)).toEqual({
      ok: false,
      kind: 'unknown-app'
    })
  })

  it('success:false is unknown-app', async () => {
    const { fetch } = createFakeFetch({
      [`GET ${url('99999999')}`]: {
        status: 200,
        json: { '99999999': { success: false } }
      }
    })
    expect(await lookupSteamTitle('99999999', fetch)).toEqual({
      ok: false,
      kind: 'unknown-app'
    })
  })

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['missing the appId key', {}],
    ['a null entry', { '7': null }],
    ['an entry without success', { '7': {} }],
    ['success:"false" as a string', { '7': { success: 'false' } }],
    ['success:true without data', { '7': { success: true } }]
  ])('a body that is %s is unavailable (WR-07)', async (_n, json) => {
    const { fetch } = createFakeFetch({
      [`GET ${url('7')}`]: { status: 200, text: JSON.stringify(json) }
    })
    expect(await lookupSteamTitle('7', fetch)).toEqual({
      ok: false,
      kind: 'unavailable'
    })
  })

  it.each([429, 500, 503])('HTTP %i is unavailable', async (status) => {
    const { fetch } = createFakeFetch({
      [`GET ${url('7')}`]: { status, json: {} }
    })
    expect(await lookupSteamTitle('7', fetch)).toEqual({
      ok: false,
      kind: 'unavailable'
    })
  })

  it('non-JSON body is unavailable', async () => {
    const { fetch } = createFakeFetch({
      [`GET ${url('7')}`]: { status: 200, text: '<html>' }
    })
    expect(await lookupSteamTitle('7', fetch)).toEqual({
      ok: false,
      kind: 'unavailable'
    })
  })

  it('fetch rejecting is unavailable', async () => {
    const { fetch } = createFakeFetch({
      [`GET ${url('7')}`]: new Error('net down')
    })
    expect(await lookupSteamTitle('7', fetch)).toEqual({
      ok: false,
      kind: 'unavailable'
    })
  })

  it('sanitises control, format chars, backticks and angle brackets', () => {
    const out = sanitizeSteamTitle(
      'A\u0000B `x` <b>Game (2004): R&D</b>   C' + String.fromCodePoint(0x202e)
    )
    expect(out).toBe('AB x bGame (2004): R&D/b C')
    expect(out).not.toMatch(/[`<>]/)
    expect(out).not.toMatch(/[\p{Cc}\p{Cf}]/u)
  })

  it('caps the title at 200 chars', () => {
    expect(sanitizeSteamTitle('a'.repeat(500))).toHaveLength(200)
  })

  it('empty after sanitising is unknown-app', async () => {
    const { fetch } = createFakeFetch({
      [`GET ${url('7')}`]: ok('7', 'game', '`<>`\u0000')
    })
    expect(await lookupSteamTitle('7', fetch)).toEqual({
      ok: false,
      kind: 'unknown-app'
    })
  })

  it('uses the exact URL with redirect manual', async () => {
    const { fetch, calls } = createFakeFetch({
      [`GET ${url('220')}`]: ok('220', 'game', 'HL2')
    })
    const spy = jest.fn(fetch)
    await lookupSteamTitle('220', spy)
    expect(spy.mock.calls[0][0]).toBe(url('220'))
    expect(spy.mock.calls[0][1]?.redirect).toBe('manual')
    expect(calls).toHaveLength(1)
  })
})
