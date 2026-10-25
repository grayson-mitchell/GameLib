/**
 * quick 261026-avw: fetchRemoteKnownFixes -- GameLib's known-fixes repo first,
 * Heroic's feed as a fallback for epic/gog/amazon only. Runs against a real tmp
 * fixes dir with an injected `get`.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { join } from 'path'

jest.mock('../constants/paths', () => {
  const actual = jest.requireActual('../constants/paths')
  const path = jest.requireActual('path')
  const os = jest.requireActual('os')
  const base = path.join(os.tmpdir(), `gamelib-fetcher-test-${process.pid}`)
  return {
    ...actual,
    fixesPath: path.join(base, 'fixes'),
    localFixesPath: path.join(base, 'fixes', 'local'),
    bundledFixesPath: path.join(base, 'bundled')
  }
})

jest.mock('../logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  LogPrefix: { Backend: 'Backend' }
}))

import {
  fetchRemoteKnownFixes,
  GAMELIB_KNOWN_FIXES_BASE,
  HEROIC_KNOWN_FIXES_BASE,
  KnownFixesGet
} from '../knownFixesFetcher'
import { fixesPath, localFixesPath } from '../constants/paths'
import { logWarning } from '../logger'

type Reply = { status: number; data?: unknown } | Error

function makeGet(replies: Record<string, Reply>) {
  const urls: string[] = []
  const get: KnownFixesGet = async (url) => {
    urls.push(url)
    const reply = replies[url]
    if (!reply) return { status: 404, data: '' }
    if (reply instanceof Error) throw reply
    return { status: reply.status, data: reply.data }
  }
  return { get, urls }
}

const gl = (store: string, app: string) =>
  `${GAMELIB_KNOWN_FIXES_BASE}/${store}/${app}-${store}.json`
const he = (store: string, app: string) =>
  `${HEROIC_KNOWN_FIXES_BASE}/${store}/${app}-${store}.json`

const dest = (app: string, store: string) =>
  join(fixesPath, `${app}-${store}.json`)

beforeEach(() => {
  jest.clearAllMocks()
  rmSync(join(fixesPath, '..'), { recursive: true, force: true })
  mkdirSync(localFixesPath, { recursive: true })
})

afterAll(() => {
  rmSync(join(fixesPath, '..'), { recursive: true, force: true })
})

describe('GameLib source', () => {
  it('steam 200 writes only allow-listed keys and never asks Heroic', async () => {
    const { get, urls } = makeGet({
      [gl('steam', '284100')]: {
        status: 200,
        data: JSON.stringify({
          envVariables: { A: '1' },
          registry: [],
          foo: 1
        })
      }
    })
    await fetchRemoteKnownFixes('284100', 'steam', get)
    expect(urls).toEqual([
      'https://raw.githubusercontent.com/grayson-mitchell/known-fixes/main/steam/284100-steam.json'
    ])
    expect(JSON.parse(readFileSync(dest('284100', 'steam'), 'utf8'))).toEqual({
      envVariables: { A: '1' }
    })
    expect(logWarning).toHaveBeenCalled()
  })

  it('gog 200 overwrites a stale file; Heroic not requested', async () => {
    writeFileSync(dest('1207658930', 'gog'), '{"title":"stale"}')
    const { get, urls } = makeGet({
      [gl('gog', '1207658930')]: {
        status: 200,
        data: { title: 'fresh' }
      }
    })
    await fetchRemoteKnownFixes('1207658930', 'gog', get)
    expect(urls).toEqual([gl('gog', '1207658930')])
    expect(JSON.parse(readFileSync(dest('1207658930', 'gog'), 'utf8'))).toEqual(
      { title: 'fresh' }
    )
  })

  it('leaves no .tmp files behind after a write', async () => {
    const { get } = makeGet({
      [gl('gog', '1')]: { status: 200, data: { title: 't' } }
    })
    await fetchRemoteKnownFixes('1', 'gog', get)
    expect(readdirSync(fixesPath).filter((f) => f.includes('.tmp'))).toEqual([])
  })
})

describe('Heroic fallback', () => {
  it.each([
    ['gog', 'gog', '1207658930'],
    ['legendary', 'epic', 'Fortnite'],
    ['nile', 'amazon', 'abc']
  ] as const)('%s falls back on a GameLib 404', async (runner, store, app) => {
    const { get, urls } = makeGet({
      [he(store, app)]: { status: 200, data: { title: 'heroic' } }
    })
    await fetchRemoteKnownFixes(app, runner, get)
    expect(urls).toEqual([gl(store, app), he(store, app)])
    expect(JSON.parse(readFileSync(dest(app, store), 'utf8'))).toEqual({
      title: 'heroic'
    })
  })

  it('gog Heroic URL is exact', async () => {
    const { get, urls } = makeGet({})
    await fetchRemoteKnownFixes('1207658930', 'gog', get)
    expect(urls[1]).toBe(
      'https://raw.githubusercontent.com/Heroic-Games-Launcher/known-fixes/main/gog/1207658930-gog.json'
    )
  })

  it.each([
    ['steam', 'steam'],
    ['zoom', 'zoom']
  ] as const)(
    '%s never asks Heroic and a 404 deletes the stale file',
    async (runner, store) => {
      writeFileSync(dest('77', store), '{"title":"old"}')
      const { get, urls } = makeGet({})
      await fetchRemoteKnownFixes('77', runner, get)
      expect(urls).toEqual([gl(store, '77')])
      expect(existsSync(dest('77', store))).toBe(false)
    }
  )

  it('both 404 deletes the stale file (epic)', async () => {
    writeFileSync(dest('App', 'epic'), '{"title":"old"}')
    const { get } = makeGet({})
    await fetchRemoteKnownFixes('App', 'legendary', get)
    expect(existsSync(dest('App', 'epic'))).toBe(false)
  })

  it('GameLib 404 then Heroic throws leaves dest untouched', async () => {
    writeFileSync(dest('1', 'gog'), '{"title":"old"}')
    const { get } = makeGet({ [he('gog', '1')]: new Error('boom') })
    await fetchRemoteKnownFixes('1', 'gog', get)
    expect(readFileSync(dest('1', 'gog'), 'utf8')).toBe('{"title":"old"}')
  })
})

describe('indeterminate GameLib answers', () => {
  const OLD = '{"title":"old"}'
  beforeEach(() => writeFileSync(dest('1', 'gog'), OLD))

  it('network error: resolves, no fallback, file untouched', async () => {
    const { get, urls } = makeGet({ [gl('gog', '1')]: new Error('ETIMEDOUT') })
    await expect(
      fetchRemoteKnownFixes('1', 'gog', get)
    ).resolves.toBeUndefined()
    expect(urls).toEqual([gl('gog', '1')])
    expect(readFileSync(dest('1', 'gog'), 'utf8')).toBe(OLD)
  })

  it.each([500, 403])('status %i behaves like a network error', async (s) => {
    const { get, urls } = makeGet({ [gl('gog', '1')]: { status: s } })
    await fetchRemoteKnownFixes('1', 'gog', get)
    expect(urls).toEqual([gl('gog', '1')])
    expect(readFileSync(dest('1', 'gog'), 'utf8')).toBe(OLD)
  })

  it.each([
    ['malformed', '{not json'],
    ['array', '[1,2]']
  ])('200 with %s body: warns, untouched, no fallback', async (_n, body) => {
    const { get, urls } = makeGet({
      [gl('gog', '1')]: { status: 200, data: body }
    })
    await fetchRemoteKnownFixes('1', 'gog', get)
    expect(urls).toEqual([gl('gog', '1')])
    expect(readFileSync(dest('1', 'gog'), 'utf8')).toBe(OLD)
    expect(logWarning).toHaveBeenCalled()
  })
})

describe('guards', () => {
  it('sideload makes no requests', async () => {
    const { get, urls } = makeGet({})
    await fetchRemoteKnownFixes('x', 'sideload', get)
    expect(urls).toEqual([])
    expect(readdirSync(fixesPath)).toEqual(['local'])
  })

  it('rejects a traversing appName', async () => {
    const { get, urls } = makeGet({})
    await fetchRemoteKnownFixes('../escape', 'gog', get)
    expect(urls).toEqual([])
    expect(logWarning).toHaveBeenCalled()
    expect(existsSync(join(fixesPath, '..', 'escape-gog.json'))).toBe(false)
  })

  it('never touches local or profile files', async () => {
    const local = join(localFixesPath, '9-steam.json')
    const profile = join(fixesPath, '9-steam.profile.json')
    writeFileSync(local, 'L')
    writeFileSync(profile, 'P')
    const outcomes: Record<string, Reply>[] = [
      { [gl('steam', '9')]: { status: 200, data: { title: 't' } } },
      {},
      { [gl('steam', '9')]: new Error('x') },
      { [gl('steam', '9')]: { status: 500 } }
    ]
    for (const o of outcomes) {
      await fetchRemoteKnownFixes('9', 'steam', makeGet(o).get)
    }
    expect(readFileSync(local, 'utf8')).toBe('L')
    expect(readFileSync(profile, 'utf8')).toBe('P')
  })
})
