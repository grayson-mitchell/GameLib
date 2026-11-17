import {
  getDirectLaunchVerdict,
  splitLaunchArguments,
  toView,
  type DirectLaunchDeps,
  type DirectLaunchInput,
  type DirectLaunchProbes
} from '../directLaunch/directLaunchVerdict'

function makeProbes(over: Partial<DirectLaunchProbes> = {}): {
  [K in keyof DirectLaunchProbes]: jest.Mock
} {
  const base = {
    knownFixCeg: jest.fn(() => false),
    readLaunchEntry: jest.fn(() =>
      Promise.resolve({ executable: 'Game.app', arguments: '-windowed' })
    ),
    locateMacBinary: jest.fn(() => '/inst/Game.app/Contents/MacOS/Game'),
    macSteamApiFiles: jest.fn(() => Promise.resolve([] as string[])),
    macLinks: jest.fn(() => Promise.resolve('clean')),
    resolveBridgeExe: jest.fn(() => Promise.resolve('/b/Game.exe')),
    peDrm: jest.fn(() => Promise.resolve('none')),
    peImports: jest.fn(() => Promise.resolve('none')),
    peSteamApiDlls: jest.fn(() => Promise.resolve(0))
  }
  return { ...base, ...over } as never
}

function makeDeps(probes: DirectLaunchProbes): DirectLaunchDeps & {
  map: Map<string, unknown>
} {
  const map = new Map<string, unknown>()
  return {
    map,
    store: { get: (k) => map.get(k), set: (k, v) => void map.set(k, v) },
    probes,
    now: () => 1
  }
}

const macInput: DirectLaunchInput = {
  appId: '10',
  host: 'darwin',
  kind: 'mac-native',
  installPath: '/inst',
  buildid: '100'
}
const bridgeInput: DirectLaunchInput = { ...macInput, kind: 'bridge' }

describe('getDirectLaunchVerdict gating', () => {
  test.each(['win32', 'linux'] as const)(
    '%s host is unsupported',
    async (h) => {
      const probes = makeProbes()
      const v = await getDirectLaunchVerdict(makeDeps(probes), {
        ...macInput,
        host: h
      })
      expect(v).toEqual({ applies: false, reason: 'host-unsupported' })
      for (const p of Object.values(probes)) expect(p).not.toHaveBeenCalled()
    }
  )

  test('no kind and no install path', async () => {
    const d = makeDeps(makeProbes())
    expect(
      await getDirectLaunchVerdict(d, { ...macInput, kind: null })
    ).toEqual({ applies: false, reason: 'route-unsupported' })
    expect(
      await getDirectLaunchVerdict(d, { ...macInput, installPath: undefined })
    ).toEqual({ applies: false, reason: 'not-installed' })
  })
})

describe('mac-native', () => {
  test('clean binary applies with no warning and the PICS launch plan', async () => {
    const v = await getDirectLaunchVerdict(makeDeps(makeProbes()), macInput)
    expect(v).toEqual({
      applies: true,
      kind: 'mac-native',
      warning: 'none',
      launch: {
        binaryPath: '/inst/Game.app/Contents/MacOS/Game',
        args: ['-windowed']
      }
    })
    expect(toView(v)).toEqual({
      applies: true,
      kind: 'mac-native',
      warning: 'none'
    })
  })

  test('steam_api files or a load command apply with the steam-api warning', async () => {
    const files = makeProbes({
      macSteamApiFiles: jest.fn(() => Promise.resolve(['/x']))
    })
    expect(
      await getDirectLaunchVerdict(makeDeps(files), macInput)
    ).toMatchObject({
      applies: true,
      warning: 'steam-api',
      launch: { binaryPath: expect.any(String) }
    })
    const links = makeProbes({
      macLinks: jest.fn(() => Promise.resolve('links'))
    })
    expect(
      await getDirectLaunchVerdict(makeDeps(links), macInput)
    ).toMatchObject({ applies: true, warning: 'steam-api' })
  })

  test('a ceg known fix is the only thing that does not apply', async () => {
    const ceg = makeProbes({ knownFixCeg: jest.fn(() => true) })
    expect(await getDirectLaunchVerdict(makeDeps(ceg), macInput)).toEqual({
      applies: false,
      reason: 'steam-drm'
    })
  })

  test('binary not located applies with an unknown warning and no binaryPath', async () => {
    const none = makeProbes({ locateMacBinary: jest.fn(() => null) })
    expect(await getDirectLaunchVerdict(makeDeps(none), macInput)).toEqual({
      applies: true,
      kind: 'mac-native',
      warning: 'unknown',
      launch: { args: ['-windowed'] }
    })
  })

  test('an unreadable binary applies with an unknown warning', async () => {
    const unreadable = makeProbes({
      macLinks: jest.fn(() => Promise.resolve('unreadable'))
    })
    expect(
      await getDirectLaunchVerdict(makeDeps(unreadable), macInput)
    ).toMatchObject({ applies: true, warning: 'unknown' })
  })

  test('a throwing probe is unknown, never thrown', async () => {
    const boom = makeProbes({
      readLaunchEntry: jest.fn(() => Promise.reject(new Error('x')))
    })
    expect(
      await getDirectLaunchVerdict(makeDeps(boom), macInput)
    ).toMatchObject({ applies: true, warning: 'unknown' })
  })
})

describe('bridge', () => {
  const entry = { executable: 'g.exe', arguments: '-path "My Dir" -x' }
  test('applies with args from the windows entry', async () => {
    const probes = makeProbes({
      readLaunchEntry: jest.fn(() => Promise.resolve(entry))
    })
    expect(await getDirectLaunchVerdict(makeDeps(probes), bridgeInput)).toEqual(
      {
        applies: true,
        kind: 'bridge',
        warning: 'none',
        launch: { args: ['-path', 'My Dir', '-x'] }
      }
    )
    expect(probes.readLaunchEntry).toHaveBeenCalledWith('windows')
  })

  test.each([
    ['steamstub', { peDrm: () => Promise.resolve('steamstub') }],
    ['ceg markers', { peDrm: () => Promise.resolve('ceg') }],
    ['known fix', { knownFixCeg: () => true }],
    [
      'drm before steam-api',
      {
        peDrm: () => Promise.resolve('steamstub'),
        peImports: () => Promise.resolve('steam-api')
      }
    ]
  ])('%s does not apply', async (_n, over) => {
    const v = await getDirectLaunchVerdict(
      makeDeps(makeProbes(over as Partial<DirectLaunchProbes>)),
      bridgeInput
    )
    expect(v).toEqual({ applies: false, reason: 'steam-drm' })
  })

  test.each([
    ['import', { peImports: () => Promise.resolve('steam-api') }, 'steam-api'],
    [
      'runtime dll or shim',
      { peSteamApiDlls: () => Promise.resolve(1) },
      'steam-api'
    ],
    [
      'import scan error',
      { peImports: () => Promise.resolve('error') },
      'unknown'
    ],
    ['drm unreadable', { peDrm: () => Promise.resolve(undefined) }, 'unknown'],
    [
      'exe unresolved',
      { resolveBridgeExe: () => Promise.resolve(undefined) },
      'unknown'
    ]
  ])('%s applies with a warning', async (_n, over, warning) => {
    const v = await getDirectLaunchVerdict(
      makeDeps(makeProbes(over as Partial<DirectLaunchProbes>)),
      bridgeInput
    )
    expect(v).toMatchObject({
      applies: true,
      kind: 'bridge',
      warning,
      launch: { args: ['-windowed'] }
    })
  })
})

describe('cache', () => {
  test('hit skips the probes', async () => {
    const probes = makeProbes()
    const d = makeDeps(probes)
    await getDirectLaunchVerdict(d, macInput)
    const calls = probes.macLinks.mock.calls.length
    const again = await getDirectLaunchVerdict(d, macInput)
    expect(again.applies).toBe(true)
    expect(probes.macLinks.mock.calls.length).toBe(calls)
  })

  test.each([
    ['buildid', { buildid: '101' }],
    ['installPath', { installPath: '/other' }],
    ['kind', { kind: 'bridge' as const }]
  ])('%s change recomputes and re-stores', async (_n, change) => {
    const probes = makeProbes()
    const d = makeDeps(probes)
    await getDirectLaunchVerdict(d, macInput)
    const before = probes.knownFixCeg.mock.calls.length
    await getDirectLaunchVerdict(d, { ...macInput, ...change })
    expect(probes.knownFixCeg.mock.calls.length).toBeGreaterThan(before)
    const stored = d.map.get('10') as Record<string, unknown>
    expect(stored.v).toBe(2)
    expect(stored.buildid).toBe(
      (change as { buildid?: string }).buildid ?? '100'
    )
  })

  test('empty buildid computes but does not store', async () => {
    const d = makeDeps(makeProbes())
    const v = await getDirectLaunchVerdict(d, { ...macInput, buildid: '' })
    expect(v.applies).toBe(true)
    expect(d.map.size).toBe(0)
  })

  test('unknown verdict is not stored', async () => {
    const d = makeDeps(makeProbes({ locateMacBinary: jest.fn(() => null) }))
    await getDirectLaunchVerdict(d, macInput)
    expect(d.map.size).toBe(0)
  })

  test('corrupt and v1 records are recomputed', async () => {
    const good = {
      v: 2,
      kind: 'mac-native',
      installPath: '/inst',
      buildid: '100'
    }
    for (const bad of [
      'junk',
      { v: 1 },
      {
        ...good,
        v: 1,
        verdict: {
          eligible: true,
          kind: 'mac-native',
          launch: { args: [] }
        }
      },
      { ...good, verdict: { applies: true, kind: 'mac-native' } },
      {
        ...good,
        verdict: {
          applies: true,
          kind: 'mac-native',
          warning: 'unknown',
          launch: { args: [] }
        }
      },
      { ...good, verdict: { applies: false, reason: 'bogus' } },
      { ...good, verdict: { applies: false, reason: 'steam-api' } }
    ]) {
      const probes = makeProbes()
      const d = makeDeps(probes)
      d.map.set('10', bad)
      const v = await getDirectLaunchVerdict(d, macInput)
      expect(v.applies).toBe(true)
      expect(probes.knownFixCeg).toHaveBeenCalled()
    }
  })

  test('steam-api and steam-drm verdicts are cached', async () => {
    for (const [over, applies] of [
      [{ macLinks: jest.fn(() => Promise.resolve('links')) }, true],
      [{ knownFixCeg: jest.fn(() => true) }, false]
    ] as const) {
      const probes = makeProbes(over as Partial<DirectLaunchProbes>)
      const d = makeDeps(probes)
      await getDirectLaunchVerdict(d, macInput)
      expect(d.map.size).toBe(1)
      const n = probes.knownFixCeg.mock.calls.length
      const again = await getDirectLaunchVerdict(d, macInput)
      expect(again.applies).toBe(applies)
      expect(probes.knownFixCeg.mock.calls.length).toBe(n)
    }
  })
})

describe('splitLaunchArguments', () => {
  test.each([
    ['', []],
    ['-windowed -w 1280', ['-windowed', '-w', '1280']],
    ['-path "My Dir" -x', ['-path', 'My Dir', '-x']]
  ])('%j', (raw, expected) => {
    expect(splitLaunchArguments(raw)).toEqual(expected)
  })
})
