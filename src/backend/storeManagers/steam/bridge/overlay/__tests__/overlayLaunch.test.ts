/**
 * Phase 60 plan 07: overlayLaunch.ts (D-08, D-12, D-13).
 */
import { createTestEngineRuntime } from 'backend/testUtils/testEngineRuntime'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  appendCxEnvTokens,
  buildOverlayCxTokens,
  buildOverlayEnvVars,
  mergeOverlayEnvVars,
  overlayInputProbeFromEnv,
  prepareOverlayEnv,
  checkOverlayInputs,
  prepareOverlayLaunch,
  prepareOverlayTokens
} from '../overlayLaunch'
import { at } from '../../../__tests__/fixtures/indexed'
import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'

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
  const noRunTool = () => Promise.reject(new Error('runTool must not run'))
  const okInputs = () => Promise.resolve({ status: 'ok' as const })
  const crossover = {
    appPath: '/Applications/CrossOver.app',
    cxRoot: '/x',
    binDir: '/x/bin',
    crossoverBuild: '26.3.0.39832'
  }
  const runner = { crossoverBuild: '26.3.0.39832' } as never

  test('success returns runner and tokens', async () => {
    const r = await prepareOverlayLaunch(a, {
      engineRuntime: createTestEngineRuntime(),
      runTool: noRunTool,
      runner: createScriptedRunner([]),
      checkInputs: okInputs,
      detect: () => Promise.resolve({ status: 'ok', crossover }),
      ensure: () => Promise.resolve({ status: 'ok', runner })
    })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') {
      expect(r.runner).toBe(runner)
      expect(r.tokens).toHaveLength(4)
    }
  })
  test('detect error is returned', async () => {
    const r = await prepareOverlayLaunch(a, {
      engineRuntime: createTestEngineRuntime(),
      runTool: noRunTool,
      runner: createScriptedRunner([]),
      checkInputs: okInputs,
      detect: () =>
        Promise.resolve({
          status: 'error',
          step: 'crossover-detect',
          cause: 'none'
        })
    })
    expect(r).toMatchObject({ step: 'crossover-detect' })
  })
  test('ensure error is returned', async () => {
    const r = await prepareOverlayLaunch(a, {
      engineRuntime: createTestEngineRuntime(),
      runTool: noRunTool,
      runner: createScriptedRunner([]),
      checkInputs: okInputs,
      detect: () => Promise.resolve({ status: 'ok', crossover }),
      ensure: () =>
        Promise.resolve({ status: 'error', step: 'clone', cause: 'x' })
    })
    expect(r).toMatchObject({ step: 'clone' })
  })
  test('inputs are checked before detect or clone', async () => {
    const detect = jest.fn()
    const ensure = jest.fn()
    const r = await prepareOverlayLaunch(a, {
      engineRuntime: createTestEngineRuntime(),
      runTool: noRunTool,
      runner: createScriptedRunner([]),
      checkInputs: () =>
        Promise.resolve({
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
      engineRuntime: createTestEngineRuntime(),
      runTool: noRunTool,
      runner: createScriptedRunner([]),
      checkInputs: okInputs,
      detect: async () => {
        throw new Error('boom')
      }
    })
    expect(r.status).toBe('error')
  })
})

describe('buildOverlayEnvVars (D-07)', () => {
  const SBIN = '/u/Steam/Contents/MacOS'
  const a = { appId: '3205720', shimPath: '/s/shim.dylib', steamBinDir: SBIN }

  it('returns the four plain vars, shim first, unquoted', () => {
    expect(buildOverlayEnvVars(a)).toEqual({
      status: 'ok',
      vars: [
        {
          key: 'DYLD_INSERT_LIBRARIES',
          value: `/s/shim.dylib:${SBIN}/steamloader.dylib:${SBIN}/gameoverlayrenderer.dylib`
        },
        { key: 'SteamOverlayGameId', value: '3205720' },
        { key: 'SteamGameId', value: '3205720' },
        { key: 'SteamAppId', value: '3205720' }
      ]
    })
  })

  it.each([
    { ...a, appId: 'x1' },
    { ...a, shimPath: 'rel/shim.dylib' },
    { ...a, shimPath: '/s/a:b.dylib' },
    { ...a, steamBinDir: "/s/a'b" },
    { ...a, steamBinDir: '/s/a\nb' }
  ])('rejects bad input %#', (bad) => {
    const r = buildOverlayEnvVars(bad)
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.step).toBe('env')
  })

  it('stays in step with buildOverlayCxTokens', () => {
    const env = buildOverlayEnvVars(a)
    const cx = buildOverlayCxTokens(a)
    if (env.status !== 'ok' || cx.status !== 'ok') throw new Error('not ok')
    expect(cx.tokens).toEqual(
      env.vars.map((v) =>
        v.key === 'DYLD_INSERT_LIBRARIES'
          ? `${v.key}='${v.value}'`
          : `${v.key}=${v.value}`
      )
    )
  })
})

describe('prepareOverlayEnv', () => {
  const a = { appId: '1', shimPath: '/s/shim.dylib', steamBinDir: '/u/bin' }

  it('returns the input check error unchanged', async () => {
    const err = { status: 'error', step: 'shim', cause: 'missing' } as const
    const r = await prepareOverlayEnv(a, {
      checkInputs: () => Promise.resolve(err)
    })
    expect(r).toEqual(err)
  })

  it('returns vars on ok', async () => {
    const r = await prepareOverlayEnv(a, {
      checkInputs: () => Promise.resolve({ status: 'ok' })
    })
    expect(r).toEqual(buildOverlayEnvVars(a))
  })

  it('never rejects', async () => {
    const r = await prepareOverlayEnv(a, {
      checkInputs: async () => {
        throw new Error('boom')
      }
    })
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.step).toBe('env')
  })
})

describe('mergeOverlayEnvVars', () => {
  const vars = [
    { key: 'DYLD_INSERT_LIBRARIES', value: '/ours' },
    { key: 'SteamOverlayGameId', value: '9' },
    { key: 'SteamGameId', value: '9' },
    { key: 'SteamAppId', value: '9' }
  ]

  it('replaces same-key Steam entries and keeps unrelated ones in order', () => {
    const env = [
      { key: 'WINEDEBUG', value: '-all' },
      { key: 'SteamAppId', value: '1' },
      { key: 'CX_ENV', value: 'A=b' },
      { key: 'steamappid', value: 'lower' }
    ]
    const out = mergeOverlayEnvVars(env, vars)
    expect(out.map((e) => e.key)).toEqual([
      'WINEDEBUG',
      'CX_ENV',
      'steamappid',
      'DYLD_INSERT_LIBRARIES',
      'SteamOverlayGameId',
      'SteamGameId',
      'SteamAppId'
    ])
    expect(out.filter((e) => e.key === 'SteamAppId')).toEqual([
      { key: 'SteamAppId', value: '9' }
    ])
  })

  it.each([
    ['x.dylib', '/ours:x.dylib'],
    ['"x.dylib"', '/ours:x.dylib'],
    ['', '/ours']
  ])('DYLD existing %j -> %j', (existing, expected) => {
    const out = mergeOverlayEnvVars(
      [{ key: 'DYLD_INSERT_LIBRARIES', value: existing }],
      vars
    )
    const d = out.filter((e) => e.key === 'DYLD_INSERT_LIBRARIES')
    expect(d).toEqual([{ key: 'DYLD_INSERT_LIBRARIES', value: expected }])
  })

  it('does not mutate its input', () => {
    const env = [{ key: 'SteamAppId', value: '1' }]
    const copy = JSON.parse(JSON.stringify(env))
    mergeOverlayEnvVars(env, vars)
    expect(env).toEqual(copy)
  })
})

describe('overlay input probe (60-11, G1)', () => {
  const base = {
    appId: '3205720',
    shimPath: '/A/overlay_shim.dylib',
    steamBinDir: SBIN
  }
  const probe = {
    dylibPath: '/A B/overlay_input_probe.dylib',
    logPath: '/T R/input-probe-3205720-1.log'
  }

  test('overlayInputProbeFromEnv returns paths only for flag exactly 1', () => {
    const a = {
      appId: '3205720',
      traceRoot: '/abs/trace',
      dylibPath: '/abs/p.dylib',
      now: 1700000000000
    }
    expect(
      overlayInputProbeFromEnv({ GAMELIB_OVERLAY_INPUT_PROBE: '1' }, a)
    ).toEqual({
      dylibPath: '/abs/p.dylib',
      logPath: '/abs/trace/input-probe-3205720-1700000000000.log'
    })
    expect(overlayInputProbeFromEnv({}, a)).toBeUndefined()
    for (const v of ['0', 'true', '', '11', ' 1']) {
      expect(
        overlayInputProbeFromEnv({ GAMELIB_OVERLAY_INPUT_PROBE: v }, a)
      ).toBeUndefined()
    }
  })

  test('tokens: probe appended last and log token single-quoted', () => {
    const r = buildOverlayCxTokens({ ...base, probe })
    expect(r).toEqual({
      status: 'ok',
      tokens: [
        `DYLD_INSERT_LIBRARIES='/A/overlay_shim.dylib:${SBIN}/steamloader.dylib:${SBIN}/gameoverlayrenderer.dylib:${probe.dylibPath}'`,
        'SteamOverlayGameId=3205720',
        'SteamGameId=3205720',
        'SteamAppId=3205720',
        `GAMELIB_OVERLAY_PROBE_LOG='${probe.logPath}'`
      ]
    })
  })

  test('env vars carry the probe last in DYLD and the log var', () => {
    const r = buildOverlayEnvVars({ ...base, probe })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(at(r.vars, 0).value.endsWith(`:${probe.dylibPath}`)).toBe(true)
    expect(at(r.vars, 0).value.startsWith('/A/overlay_shim.dylib:')).toBe(true)
    expect(r.vars).toContainEqual({
      key: 'GAMELIB_OVERLAY_PROBE_LOG',
      value: probe.logPath
    })
  })

  describe('release experiment (60-15)', () => {
    const a = {
      appId: '3205720',
      traceRoot: '/abs/trace',
      dylibPath: '/abs/p.dylib',
      now: 1
    }
    test.each(['cb:release', 'cb:release+block', 'key:release'])(
      'valid %s is carried',
      (v) => {
        const p = overlayInputProbeFromEnv(
          {
            GAMELIB_OVERLAY_INPUT_PROBE: '1',
            GAMELIB_OVERLAY_RELEASE_EXPERIMENT: v
          },
          a
        )
        expect(p?.experiment).toBe(v)
      }
    )
    test.each([
      undefined,
      '',
      'key:release+block',
      'cb:release ',
      'CB:RELEASE',
      'cb:release;x'
    ])('invalid %j is dropped', (v) => {
      const p = overlayInputProbeFromEnv(
        {
          GAMELIB_OVERLAY_INPUT_PROBE: '1',
          GAMELIB_OVERLAY_RELEASE_EXPERIMENT: v
        },
        a
      )
      expect(p).toBeDefined()
      expect(p && 'experiment' in p).toBe(false)
    })
    test('experiment without the probe flag is undefined', () => {
      expect(
        overlayInputProbeFromEnv(
          { GAMELIB_OVERLAY_RELEASE_EXPERIMENT: 'cb:release' },
          a
        )
      ).toBeUndefined()
    })
    test('tokens append the quoted experiment after the probe log', () => {
      const r = buildOverlayCxTokens({
        ...base,
        probe: { ...probe, experiment: 'cb:release+block' }
      })
      expect(r.status === 'ok' && r.tokens.slice(-2)).toEqual([
        `GAMELIB_OVERLAY_PROBE_LOG='${probe.logPath}'`,
        `GAMELIB_OVERLAY_RELEASE_EXPERIMENT='cb:release+block'`
      ])
      expect(r.status === 'ok' && r.tokens[0]).toMatch(
        /^DYLD_INSERT_LIBRARIES='\/A\/overlay_shim\.dylib:.*overlay_input_probe\.dylib'$/
      )
    })
    test('env vars carry the experiment and merge replaces the old one', () => {
      const r = buildOverlayEnvVars({
        ...base,
        probe: { ...probe, experiment: 'key:release' }
      })
      expect(r.status).toBe('ok')
      if (r.status !== 'ok') return
      const v = {
        key: 'GAMELIB_OVERLAY_RELEASE_EXPERIMENT',
        value: 'key:release'
      }
      expect(r.vars).toContainEqual(v)
      const out = mergeOverlayEnvVars(
        [{ key: 'GAMELIB_OVERLAY_RELEASE_EXPERIMENT', value: 'old' }],
        r.vars
      )
      expect(
        out.filter((e) => e.key === 'GAMELIB_OVERLAY_RELEASE_EXPERIMENT')
      ).toEqual([v])
    })
  })

  test('without a probe the output is unchanged', () => {
    const r = buildOverlayEnvVars(base)
    expect(r.status === 'ok' && r.vars.map((v) => v.key)).toEqual([
      'DYLD_INSERT_LIBRARIES',
      'SteamOverlayGameId',
      'SteamGameId',
      'SteamAppId'
    ])
  })

  test.each([
    ['quote in dylib', { dylibPath: "/A/p'.dylib", logPath: '/T/l.log' }],
    ['colon in log', { dylibPath: '/A/p.dylib', logPath: '/T:x/l.log' }],
    ['relative dylib', { dylibPath: 'p.dylib', logPath: '/T/l.log' }]
  ])('unsafe probe (%s) is dropped, status stays ok', (_n, bad) => {
    expect(buildOverlayCxTokens({ ...base, probe: bad })).toEqual(
      buildOverlayCxTokens(base)
    )
    expect(buildOverlayEnvVars({ ...base, probe: bad })).toEqual(
      buildOverlayEnvVars(base)
    )
  })
})

describe('overlay input fix module (60-20, G1)', () => {
  const base = {
    appId: '3205720',
    shimPath: '/A/overlay_shim.dylib',
    steamBinDir: SBIN
  }
  const input = '/P Q/overlay_input.dylib'
  const std = `/A/overlay_shim.dylib:${SBIN}/steamloader.dylib:${SBIN}/gameoverlayrenderer.dylib`

  test('tokens: input after the renderer', () => {
    const r = buildOverlayCxTokens({ ...base, inputModulePath: input })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.tokens[0]).toBe(`DYLD_INSERT_LIBRARIES='${std}:${input}'`)
  })

  // 60-REVIEW WR-02: the two hook the same entry points, so they never load
  // together. games.ts already withholds the input module (reason=probe); the
  // builder drops it too, so a caller passing both cannot get the pair.
  test('tokens: a safe probe drops the input module', () => {
    const probe = {
      dylibPath: '/A B/overlay_input_probe.dylib',
      logPath: '/T R/p.log'
    }
    const r = buildOverlayCxTokens({ ...base, inputModulePath: input, probe })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.tokens[0]).toBe(
      `DYLD_INSERT_LIBRARIES='${std}:${probe.dylibPath}'`
    )
    expect(r.tokens[0]).not.toContain(input)
  })

  test('env vars carry the same order', () => {
    const r = buildOverlayEnvVars({ ...base, inputModulePath: input })
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.vars[0]).toEqual({
      key: 'DYLD_INSERT_LIBRARIES',
      value: `${std}:${input}`
    })
  })

  test.each([
    ['control char', '/a/b\u0001.dylib'],
    ['relative', 'overlay_input.dylib'],
    ['quote', "/a/it's.dylib"]
  ])('unsafe input (%s) is dropped, status stays ok', (_n, bad) => {
    const r = buildOverlayEnvVars({ ...base, inputModulePath: bad })
    expect(r).toEqual(buildOverlayEnvVars(base))
    expect(buildOverlayCxTokens({ ...base, inputModulePath: bad })).toEqual(
      buildOverlayCxTokens(base)
    )
  })
})
