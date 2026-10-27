/**
 * quick 261027-n77: tier-2 `overlays` validation, platform gate and env
 * building. The installer is mocked; platform is injected; nothing is fetched.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const mockLogWarning = jest.fn()
const mockLogInfo = jest.fn()
const mockLogDebug = jest.fn()
jest.mock('backend/logger', () => ({
  logWarning: (...a: unknown[]) => mockLogWarning(...a),
  logInfo: (...a: unknown[]) => mockLogInfo(...a),
  logDebug: (...a: unknown[]) => mockLogDebug(...a),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

const mockEnsure = jest.fn()
jest.mock('backend/knownFixOverlayInstall', () => ({
  ensureOverlayInstalled: (...a: unknown[]) => mockEnsure(...a)
}))

const mockReadProfile = jest.fn()
jest.mock('backend/knownFixes', () => {
  const actual = jest.requireActual('backend/knownFixes')
  return {
    ...actual,
    readKnownFixProfile: (...a: unknown[]) => mockReadProfile(...a)
  }
})

import { LogPrefix } from 'backend/logger'
import type { GameSettings } from 'common/types'
import { filterTier1KnownFixes } from '../knownFixes'
import {
  appendPathList,
  formatKnownFixEnvLine,
  knownFixProfileOverlayEnv,
  lastEnvOption,
  logKnownFixEnv,
  MAX_OVERLAY_ENTRIES,
  resolveKnownFixOverlayEnv,
  validateOverlayEntries,
  withKnownFixEnv
} from '../knownFixOverlays'

const ID = 'gst-libav-1.24.13'
const GOOD = { id: ID, target: 'gstreamer-plugin-path' }
const ctx = { label: 'test', logPrefix: LogPrefix.Backend }
const DIR = '/over/lays/gst-libav-1.24.13'
const PLUG = `${DIR}/lib/gstreamer-1.0`

const resolveOpts = (over: Record<string, unknown> = {}) => ({
  ...ctx,
  wineType: 'crossover',
  baseValue: () => undefined,
  platform: 'darwin' as NodeJS.Platform,
  ...over
})

beforeEach(() => {
  jest.clearAllMocks()
  mockEnsure.mockResolvedValue(DIR)
})

describe('validateOverlayEntries', () => {
  it('undefined is silent', () => {
    expect(validateOverlayEntries(undefined, ctx)).toEqual([])
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  it('non-array warns', () => {
    expect(validateOverlayEntries({}, ctx)).toEqual([])
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  it('accepts a catalogue entry', () => {
    expect(validateOverlayEntries([GOOD], ctx).map((e) => e.id)).toEqual([ID])
    expect(mockLogWarning).not.toHaveBeenCalled()
  })

  it.each([
    ['non-object', 'x'],
    ['missing id', { target: 'gstreamer-plugin-path' }],
    ['non-string id', { id: 5, target: 'gstreamer-plugin-path' }],
    ['missing target', { id: ID }],
    ['other target', { id: ID, target: 'dll-dir' }],
    ['url key', { ...GOOD, url: 'https://evil.example/x.tar.gz' }],
    ['sha256 key', { ...GOOD, sha256: 'a'.repeat(64) }],
    ['archiveSha256 key', { ...GOOD, archiveSha256: 'a'.repeat(64) }],
    ['unknown id', { id: 'nope', target: 'gstreamer-plugin-path' }],
    ['__proto__ id', { id: '__proto__', target: 'gstreamer-plugin-path' }]
  ])('rejects %s but keeps the others', (_l, bad) => {
    const out = validateOverlayEntries([bad, GOOD], ctx)
    expect(out.map((e) => e.id)).toEqual([ID])
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
  })

  it('keeps a duplicate id once', () => {
    expect(validateOverlayEntries([GOOD, GOOD], ctx)).toHaveLength(1)
  })

  it('considers at most 8 entries', () => {
    const many = Array.from({ length: MAX_OVERLAY_ENTRIES + 2 }, () => 'x')
    validateOverlayEntries(many, ctx)
    // 8 rejected entries + one over-limit warning
    expect(mockLogWarning).toHaveBeenCalledTimes(MAX_OVERLAY_ENTRIES + 1)
  })
})

describe('resolveKnownFixOverlayEnv', () => {
  it.each(['linux', 'win32'] as NodeJS.Platform[])(
    'is a no-op on %s',
    async (platform) => {
      const out = await resolveKnownFixOverlayEnv(
        [GOOD],
        resolveOpts({ platform })
      )
      expect(out).toEqual({})
      expect(mockEnsure).not.toHaveBeenCalled()
      expect(mockLogDebug).toHaveBeenCalled()
    }
  )

  it.each(['wine', 'toolkit', undefined])(
    'is a no-op for wineType %s',
    async (wineType) => {
      const out = await resolveKnownFixOverlayEnv(
        [GOOD],
        resolveOpts({ wineType })
      )
      expect(out).toEqual({})
      expect(mockEnsure).not.toHaveBeenCalled()
      expect(mockLogDebug).toHaveBeenCalled()
    }
  )

  it('emits GST_PLUGIN_PATH on darwin + crossover', async () => {
    expect(await resolveKnownFixOverlayEnv([GOOD], resolveOpts())).toEqual({
      GST_PLUGIN_PATH: PLUG
    })
  })

  it('returns {} when the install fails or throws', async () => {
    mockEnsure.mockResolvedValueOnce(null)
    expect(await resolveKnownFixOverlayEnv([GOOD], resolveOpts())).toEqual({})
    mockEnsure.mockRejectedValueOnce(new Error('boom'))
    expect(await resolveKnownFixOverlayEnv([GOOD], resolveOpts())).toEqual({})
    expect(mockLogWarning).toHaveBeenCalled()
  })

  it('appends to an existing value and warns about GST_PLUGIN_PATH_1_0', async () => {
    const base: Record<string, string> = {
      GST_PLUGIN_PATH: '/a',
      GST_PLUGIN_PATH_1_0: '/b'
    }
    const out = await resolveKnownFixOverlayEnv(
      [GOOD],
      resolveOpts({ baseValue: (k: string) => base[k] })
    )
    expect(out).toEqual({ GST_PLUGIN_PATH: `/a:${PLUG}` })
    expect(mockLogWarning).toHaveBeenCalledTimes(1)
    expect(mockLogWarning.mock.calls[0][0]).toMatch(/GST_PLUGIN_PATH_1_0/)
  })
})

describe('appendPathList', () => {
  it('handles empty bases', () => {
    expect(appendPathList(undefined, '/d')).toBe('/d')
    expect(appendPathList('', '/d')).toBe('/d')
  })
  it('appends with a colon', () => {
    expect(appendPathList('a:b', '/d')).toBe('a:b:/d')
  })
  it.each(['/d', '/d/', '/x/../d'])('does not duplicate %s', (existing) => {
    expect(appendPathList(`/p:${existing}`, '/d')).toBe(`/p:${existing}`)
  })
  it('drops empty segments', () => {
    expect(appendPathList(':a::b:', '/d')).toBe('a:b:/d')
  })
})

describe('knownFixProfileOverlayEnv base precedence', () => {
  const settings = (opts: object = {}) =>
    ({
      wineVersion: { type: 'crossover' },
      enviromentOptions: [{ key: 'GST_PLUGIN_PATH', value: '/opt' }],
      ...opts
    }) as unknown as GameSettings
  const originalPlatform = process.platform
  beforeEach(() => {
    mockReadProfile.mockReturnValue({ overlays: [GOOD] })
    Object.defineProperty(process, 'platform', { value: 'darwin' })
  })
  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform })
    delete process.env.GST_PLUGIN_PATH
  })

  it('tier-1 beats enviromentOptions beats process.env', async () => {
    process.env.GST_PLUGIN_PATH = '/proc'
    expect(
      await knownFixProfileOverlayEnv('1', 'gog', settings(), {
        GST_PLUGIN_PATH: '/t1'
      })
    ).toEqual({ GST_PLUGIN_PATH: `/t1:${PLUG}` })
    expect(await knownFixProfileOverlayEnv('1', 'gog', settings(), {})).toEqual(
      { GST_PLUGIN_PATH: `/opt:${PLUG}` }
    )
    expect(
      await knownFixProfileOverlayEnv(
        '1',
        'gog',
        settings({ enviromentOptions: [] }),
        {}
      )
    ).toEqual({ GST_PLUGIN_PATH: `/proc:${PLUG}` })
  })

  it('does not double the dir when tier-1 already holds it', async () => {
    expect(
      await knownFixProfileOverlayEnv('1', 'gog', settings(), {
        GST_PLUGIN_PATH: PLUG
      })
    ).toEqual({ GST_PLUGIN_PATH: PLUG })
  })
})

describe('env helpers', () => {
  it('lastEnvOption: last match wins', () => {
    expect(
      lastEnvOption(
        [
          { key: 'A', value: '1' },
          { key: 'A', value: '2' }
        ],
        'A'
      )
    ).toBe('2')
    expect(lastEnvOption(undefined, 'A')).toBeUndefined()
  })

  it('formatKnownFixEnvLine / logKnownFixEnv', () => {
    expect(formatKnownFixEnvLine([])).toBeNull()
    expect(
      formatKnownFixEnvLine([
        { key: 'A', value: '1', source: 'tier-1' },
        { key: 'B', value: 'x'.repeat(600), source: 'overlay' }
      ])
    ).toBe(
      `known-fix env applied: A=1 (tier-1); B=${'x'.repeat(512)}... (overlay)`
    )
    expect(logKnownFixEnv('l', [], LogPrefix.Backend)).toBeNull()
    const line = logKnownFixEnv(
      'l',
      [{ key: 'A', value: '1', source: 'overlay' }],
      LogPrefix.Backend
    )
    expect(line).toBe('known-fix env applied: A=1 (overlay)')
    expect(mockLogInfo).toHaveBeenCalledWith(`l: ${line}`, 'Backend')
  })

  it('withKnownFixEnv appends without mutating', () => {
    const s = { enviromentOptions: [{ key: 'A', value: '1' }] } as GameSettings
    expect(withKnownFixEnv(s, {})).toBe(s)
    const out = withKnownFixEnv(s, { B: '2' })
    expect(out.enviromentOptions).toEqual([
      { key: 'A', value: '1' },
      { key: 'B', value: '2' }
    ])
    expect(s.enviromentOptions).toHaveLength(1)
  })
})

describe('tier boundaries', () => {
  it('the remote layer drops overlays', () => {
    const out = filterTier1KnownFixes('284100', 'remote', {
      title: 't',
      overlays: [GOOD]
    })
    expect(out).not.toHaveProperty('overlays')
    expect(mockLogWarning).toHaveBeenCalled()
  })

  it('the bundled 284100 profile validates cleanly', () => {
    const profile = JSON.parse(
      readFileSync(
        join(__dirname, '../../../public/fixes/284100-steam.profile.json'),
        'utf-8'
      )
    )
    const out = validateOverlayEntries(profile.overlays, ctx)
    expect(out.map((e) => e.id)).toEqual([ID])
    expect(mockLogWarning).not.toHaveBeenCalled()
  })
})
