/**
 * Phase 60 plan 07: overlayLaunch.ts (D-08, D-12, D-13).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  appendCxEnvTokens,
  buildOverlayCxTokens,
  checkOverlayInputs,
  prepareOverlayLaunch,
  prepareOverlayTokens
} from '../overlayLaunch'

const SBIN =
  '/Users/x/Library/Application Support/Steam/Steam.AppBundle/Steam/Contents/MacOS'

describe('buildOverlayCxTokens', () => {
  test('exact D-12 tokens with the shim first', () => {
    const r = buildOverlayCxTokens({
      appId: '1363080',
      shimPath: '/A/overlay_shim.dylib',
      steamBinDir: SBIN
    })
    expect(r).toEqual({
      status: 'ok',
      tokens: [
        `DYLD_INSERT_LIBRARIES='/A/overlay_shim.dylib:${SBIN}/steamloader.dylib:${SBIN}/gameoverlayrenderer.dylib'`,
        'SteamOverlayGameId=1363080',
        'SteamGameId=1363080',
        'SteamAppId=1363080'
      ]
    })
  })

  test.each([
    ['quote in shim', { shimPath: "/A/o'.dylib" }],
    ['colon in bin dir', { steamBinDir: '/A:B' }],
    ['newline in path', { shimPath: '/A/o\n.dylib' }],
    ['relative shim', { shimPath: 'rel/o.dylib' }],
    ['relative bin dir', { steamBinDir: 'MacOS' }],
    ['bad appId', { appId: '12a' }],
    ['empty appId', { appId: '' }]
  ])('%s gives step env', (_n, over) => {
    const r = buildOverlayCxTokens({
      appId: '620',
      shimPath: '/A/o.dylib',
      steamBinDir: SBIN,
      ...over
    })
    expect(r.status).toBe('error')
    expect(r.status === 'error' && r.step).toBe('env')
  })

  test('source has no GPU or OS gating (D-13)', () => {
    const src = readFileSync(join(__dirname, '..', 'overlayLaunch.ts'), 'utf8')
    const code = src
      .split('\n')
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .join('\n')
    expect(code).not.toMatch(/AGX|os\.release|gpuFamily/)
  })
})

describe('appendCxEnvTokens', () => {
  test('empty env gives one CX_ENV', () => {
    expect(appendCxEnvTokens([], ['A=1', 'B=2'])).toEqual({
      status: 'ok',
      env: [{ key: 'CX_ENV', value: 'A=1 B=2' }]
    })
  })
  test('merges case-insensitively, keeping other keys', () => {
    const r = appendCxEnvTokens(
      [
        { key: 'cx_env', value: 'FOO=1' },
        { key: 'X', value: 'y' }
      ],
      ['A=2']
    )
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.env.find((e) => e.key === 'X')?.value).toBe('y')
      const cx = r.env.filter((e) => e.key.toUpperCase() === 'CX_ENV')
      expect(cx).toEqual([{ key: 'CX_ENV', value: 'FOO=1 A=2' }])
    }
  })
  test('rejects a quote inside a quoted value', () => {
    expect(appendCxEnvTokens([], ["B='a'b'"]).status).toBe('error')
  })
})

describe('checkOverlayInputs and prepareOverlayTokens', () => {
  let dir: string
  let shim: string
  let sbin: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'ovl launch '))
    sbin = join(dir, 'MacOS')
    mkdirSync(sbin)
    shim = join(dir, 'overlay_shim.dylib')
    writeFileSync(shim, 'x')
    writeFileSync(join(sbin, 'steamloader.dylib'), 'x')
    writeFileSync(join(sbin, 'gameoverlayrenderer.dylib'), 'x')
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  test('all present is ok and tokens come back', async () => {
    expect(
      (await checkOverlayInputs({ shimPath: shim, steamBinDir: sbin })).status
    ).toBe('ok')
    const r = await prepareOverlayTokens({
      appId: '620',
      shimPath: shim,
      steamBinDir: sbin
    })
    expect(r.status).toBe('ok')
  })
  test('missing steamloader gives steam-dylibs', async () => {
    rmSync(join(sbin, 'steamloader.dylib'))
    const r = await checkOverlayInputs({ shimPath: shim, steamBinDir: sbin })
    expect(r).toMatchObject({ status: 'error', step: 'steam-dylibs' })
  })
  test('missing renderer gives steam-dylibs', async () => {
    rmSync(join(sbin, 'gameoverlayrenderer.dylib'))
    const r = await checkOverlayInputs({ shimPath: shim, steamBinDir: sbin })
    expect(r).toMatchObject({ status: 'error', step: 'steam-dylibs' })
  })
  test('missing shim gives shim', async () => {
    rmSync(shim)
    const r = await checkOverlayInputs({ shimPath: shim, steamBinDir: sbin })
    expect(r).toMatchObject({ status: 'error', step: 'shim' })
  })
  test('directories in place of files give the same steps', async () => {
    rmSync(shim)
    mkdirSync(shim)
    expect(
      await checkOverlayInputs({ shimPath: shim, steamBinDir: sbin })
    ).toMatchObject({ step: 'shim' })
    rmSync(join(sbin, 'steamloader.dylib'))
    mkdirSync(join(sbin, 'steamloader.dylib'))
    expect(
      await checkOverlayInputs({ shimPath: shim, steamBinDir: sbin })
    ).toMatchObject({ step: 'steam-dylibs' })
  })
  test('prepareOverlayTokens never rejects when a dep throws', async () => {
    const r = await prepareOverlayTokens(
      { appId: '620', shimPath: shim, steamBinDir: sbin },
      {
        checkInputs: () => {
          throw new Error('boom')
        }
      }
    )
    expect(r).toMatchObject({ status: 'error', step: 'env' })
  })
})

describe('prepareOverlayLaunch', () => {
  const a = {
    appId: '620',
    appFolder: '/App',
    shimPath: '/A/o.dylib',
    steamBinDir: SBIN
  }
  const okInputs = async () => ({ status: 'ok' as const })
  const crossover = {
    appPath: '/Applications/CrossOver.app',
    cxRoot: '/x',
    binDir: '/x/bin',
    crossoverBuild: '26.3.0.39832'
  }
  const runner = { crossoverBuild: '26.3.0.39832' } as never

  test('success returns runner and tokens', async () => {
    const r = await prepareOverlayLaunch(a, {
      checkInputs: okInputs,
      detect: async () => ({ status: 'ok', crossover }),
      ensure: async () => ({ status: 'ok', runner })
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.runner).toBe(runner)
      expect(r.tokens).toHaveLength(4)
    }
  })
  test('detect error is returned', async () => {
    const r = await prepareOverlayLaunch(a, {
      checkInputs: okInputs,
      detect: async () => ({
        status: 'error',
        step: 'crossover-detect',
        cause: 'none'
      })
    })
    expect(r).toMatchObject({ step: 'crossover-detect' })
  })
  test('ensure error is returned', async () => {
    const r = await prepareOverlayLaunch(a, {
      checkInputs: okInputs,
      detect: async () => ({ status: 'ok', crossover }),
      ensure: async () => ({ status: 'error', step: 'clone', cause: 'x' })
    })
    expect(r).toMatchObject({ step: 'clone' })
  })
  test('inputs are checked before detect or clone', async () => {
    const detect = jest.fn()
    const ensure = jest.fn()
    const r = await prepareOverlayLaunch(a, {
      checkInputs: async () => ({
        status: 'error',
        step: 'shim',
        cause: 'missing'
      }),
      detect,
      ensure
    })
    expect(r).toMatchObject({ step: 'shim' })
    expect(detect).not.toHaveBeenCalled()
    expect(ensure).not.toHaveBeenCalled()
  })
  test('a throwing dep gives a step error, not a rejection', async () => {
    const r = await prepareOverlayLaunch(a, {
      checkInputs: okInputs,
      detect: async () => {
        throw new Error('boom')
      }
    })
    expect(r.status).toBe('error')
  })
})
