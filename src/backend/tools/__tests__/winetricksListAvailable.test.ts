/**
 * Phase 45 Plan 06 (D-09/D-17/D-19): `Winetricks.listAvailable` merges the parsed `list-all`
 * output with script metadata read from the already-downloaded `${toolsPath}/winetricks`, derives
 * the needs-GUI flag from that same text, and returns only verbs the D-09 predicate keeps.
 *
 * NO REAL WINE OR WINETRICKS IS SPAWNED. Same drivable-runner harness as
 * `winetricksInstallLifecycle.test.ts`; additionally `fs/promises`' `stat` and `readFile` are
 * intercepted for the one script path (every other path falls through to the real module) and the
 * script text is the committed fixture excerpt of the pinned winetricks script.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const mockSendFrontendMessage = jest.fn()
const mockGetWineFromProton = jest.fn()
const mockStat = jest.fn()
const mockReadFile = jest.fn()

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  stat: (...args: unknown[]) => mockStat(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args)
}))

jest.mock('../../ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
}))

jest.mock('../../utils', () => ({
  axiosClient: {},
  downloadFile: jest.fn(),
  extractFiles: jest.fn(),
  getWineFromProton: (...args: unknown[]) => mockGetWineFromProton(...args)
}))

jest.mock('backend/utils/compatibility_layers', () => ({
  getUmuPath: jest.fn(),
  isUmuSupported: () => Promise.resolve(false)
}))

jest.mock('graceful-fs', () => ({
  ...jest.requireActual('graceful-fs'),
  existsSync: () => true
}))

jest.mock('backend/logger', () => {
  const { LogPrefix } = jest.requireActual('backend/logger/constants')
  return {
    LogPrefix,
    logError: jest.fn(),
    logInfo: jest.fn(),
    logWarning: jest.fn(),
    logDebug: jest.fn()
  }
})

import { logWarning } from 'backend/logger'
import { parseWinetricksMetadata } from 'common/winetricks/metadata'
import {
  getEnvironmentReport,
  onEnvironmentChanged
} from '../winetricksEnvironment'
import { createTools } from '../index'
import type { ToolsDeps } from '../index'
import {
  createTestServices,
  createTestStores
} from 'backend/testUtils/testServices'
import {
  createDrivableRunner,
  type DrivableRunner,
  type DrivenChild,
  type DrivenRunResult
} from 'backend/testUtils/drivableRunner'

// The tools instance is built once at module scope, so it reaches the per-test runner through
// this indirection.
let runner: DrivableRunner
/** Answers the `wine --version` probe (a supported wine unless a test says otherwise). */
let versionProbe: () => DrivenRunResult

const toolsDeps: ToolsDeps = {
  spawnAsync: createTestServices().spawnAsync,
  runner: { run: (...args) => runner.run(...args) },
  stores: createTestStores(),
  managers: {
    library: {
      gog: {
        getGame: () => ({
          isNative: () => true,
          getSettings: () => Promise.resolve({ wineVersion: {} })
        })
      }
    } as unknown as ToolsDeps['managers']['library']
  },
  commandRunner: {
    runWineCommand: jest.fn()
  } as unknown as ToolsDeps['commandRunner'],
  launcher: {
    setupEnvVars: () => ({}),
    setupWineEnvVars: () => ({}),
    validWine: () => Promise.resolve(true)
  } as unknown as ToolsDeps['launcher']
}
const { Winetricks } = createTools(toolsDeps)
import { defined } from 'backend/testUtils/indexed'

const FIXTURE_SCRIPT = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    '..',
    'common',
    'winetricks',
    '__tests__',
    'fixtures',
    'winetricks-20260125-next.metadata.sh'
  ),
  'utf8'
)

const LIST_ALL =
  '===== apps =====\n' +
  'foobar2000              foobar2000 v1.4 (Peter Pawlowski, 2018) [downloadable]\n' +
  '===== benchmarks =====\n' +
  '3dmark06                3D Mark 06 (Futuremark, 2006) [downloadable]\n' +
  '===== dlls =====\n' +
  'vcrun2019               Visual C++ 2015-2019 libraries (Microsoft, 2019) [downloadable,cached]\n' +
  'gdiplus_winxp           MS GDI+ (Microsoft, 2009) [downloadable]\n' +
  '===== settings =====\n' +
  'fontsmooth=rgb          Enable subpixel font smoothing for RGB LCDs\n'

let children: DrivenChild[]
// Distinct per test so the module-level mtime/size cache never carries a hit across tests.
let scriptMtime = 0

const isScriptPath = (path: unknown): path is string =>
  typeof path === 'string' && path.endsWith('/winetricks')

beforeEach(() => {
  scriptMtime += 1000
  // Default: a supported wine. Every test that does not care about the probe therefore
  // records nothing and logs nothing new.
  versionProbe = () => ({ stdout: 'wine-9.0\n' })
  runner = createDrivableRunner((cmd, argv) => {
    if (cmd === 'which') return { code: 0 }
    if (argv[0] === '--version') return versionProbe()
    return undefined
  })
  children = runner.children
  mockGetWineFromProton.mockResolvedValue({
    winePrefix: '/fake/prefix',
    wineVersion: { bin: '/fake/wine/bin/wine', type: 'wine' }
  })
  const actual = jest.requireActual('fs/promises')
  mockStat.mockImplementation((path: unknown, ...rest: unknown[]) =>
    isScriptPath(path)
      ? Promise.resolve({ mtimeMs: scriptMtime, size: FIXTURE_SCRIPT.length })
      : actual.stat(path, ...rest)
  )
  mockReadFile.mockImplementation((path: unknown, ...rest: unknown[]) =>
    isScriptPath(path)
      ? Promise.resolve(FIXTURE_SCRIPT)
      : actual.readFile(path, ...rest)
  )
})

async function flushMicrotasks(times = 20): Promise<void> {
  for (let i = 0; i < times; i++) {
    await Promise.resolve()
  }
}

// Runs one `listAvailable` against a fake `winetricks list-all` that prints `stdout`.
async function listAvailableWith(stdout: string, appName = 'game') {
  const list = Winetricks.listAvailable('gog', appName)
  await flushMicrotasks()
  const child = defined(children[children.length - 1], 'spawned child')
  child.stdout.emit('data', stdout)
  child.emit('exit', 0)
  child.emit('close', 0)
  return list
}

function versionProbes() {
  return runner.calls.filter((c) => c.argv[0] === '--version')
}

function scriptReads(): number {
  return mockReadFile.mock.calls.filter(([path]) => isScriptPath(path)).length
}

describe('Winetricks.listAvailable metadata merge and visibility filter (D-09/D-17/D-19)', () => {
  it('returns only visible verbs, in list-all order, annotated from the script on disk', async () => {
    const result = await listAvailableWith(LIST_ALL)

    expect(result.map((component) => component.verb)).toEqual([
      'vcrun2019',
      'gdiplus_winxp',
      'fontsmooth=rgb'
    ])

    const vcrun = defined(result[0], 'vcrun2019 component')
    expect(vcrun.publisher).toBe('Microsoft')
    expect(vcrun.year).toBe('2019')
    expect(vcrun.media).toBe('download')
    expect(vcrun.conflicts).toContain('vcrun2022')
    expect(vcrun.needsGui).toBe(false)
    // The untruncated upstream title, not the (publisher, year) list-all one.
    const upstreamTitle =
      parseWinetricksMetadata(FIXTURE_SCRIPT).get('vcrun2019')?.title
    expect(upstreamTitle).toBeDefined()
    expect(vcrun.title).toBe(upstreamTitle)
    expect(vcrun.category).toBe('dlls')
    expect(vcrun.cached).toBe(true)

    const gdiplus = defined(result[1], 'gdiplus_winxp component')
    expect(gdiplus.needsGui).toBe(false)
    expect(gdiplus.publisher).toBe('Microsoft')
  })

  it('does not return apps, benchmarks or needs-GUI verbs', async () => {
    const result = await listAvailableWith(LIST_ALL)
    const verbs = result.map((component) => component.verb)

    expect(verbs).not.toContain('foobar2000')
    expect(verbs).not.toContain('3dmark06')
  })

  it('hides a dlls verb whose script body calls w_download_manual (needsGui derived from the script)', async () => {
    const script =
      FIXTURE_SCRIPT +
      '\nw_metadata manualdll dlls \\\n    title="Needs a manual download"\n' +
      'load_manualdll()\n{\n    w_download_manual https://example.invalid/x x.exe abc\n}\n'
    mockReadFile.mockImplementation((path: unknown) =>
      Promise.resolve(isScriptPath(path) ? script : '')
    )

    const result = await listAvailableWith(
      '===== dlls =====\n' +
        'manualdll               Needs a manual download [downloadable]\n' +
        'vcrun2019               Visual C++ [downloadable]\n'
    )

    expect(result.map((component) => component.verb)).toEqual(['vcrun2019'])
  })

  it('invokes the winetricks process exactly once per call (list-all only, no second metadata spawn) plus exactly one wine --version probe (execFile, not a winetricks spawn)', async () => {
    await listAvailableWith(LIST_ALL)
    await flushMicrotasks()

    expect(children).toHaveLength(1)
    expect(defined(children[0], 'list child').argv).toEqual(['list-all'])

    expect(versionProbes()).toHaveLength(1)
    const probe = defined(versionProbes()[0], 'version probe')
    expect(probe.cmd).toBe('/fake/wine/bin/wine')
    expect(probe.argv).toEqual(['--version'])
  })

  it('returns components unannotated but still category-filtered, with one warning, when the script is unreadable', async () => {
    mockStat.mockRejectedValue(
      Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    )

    const result = await listAvailableWith(LIST_ALL)

    expect(result.map((component) => component.verb)).toEqual([
      'vcrun2019',
      'gdiplus_winxp',
      'fontsmooth=rgb'
    ])
    const first = defined(result[0], 'first component')
    expect(first.publisher).toBeUndefined()
    expect(first.needsGui).toBeUndefined()
    expect(first.title).toBe('Visual C++ 2015-2019 libraries (Microsoft, 2019)')
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  it('does not throw when the script cannot be read after it was stat-ed', async () => {
    mockReadFile.mockRejectedValue(new Error('EACCES'))

    await expect(listAvailableWith(LIST_ALL)).resolves.toHaveLength(3)
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  it('does not re-read the script while its mtime and size are unchanged', async () => {
    await listAvailableWith(LIST_ALL)
    await listAvailableWith(LIST_ALL)
    await flushMicrotasks()

    expect(scriptReads()).toBe(1)
    expect(children).toHaveLength(2)
    // The probe is NOT cached: a bottle's wine can change between tab opens.
    expect(versionProbes()).toHaveLength(2)
  })

  it('re-reads the script once its mtime changes', async () => {
    await listAvailableWith(LIST_ALL)
    scriptMtime += 1
    await listAvailableWith(LIST_ALL)

    expect(scriptReads()).toBe(2)
  })
})

describe('unsupported-wine probe at list-all time (261011-iel, D-16)', () => {
  it('records the wine version from a wine --version probe before any install runs', async () => {
    versionProbe = () => ({ stdout: 'wine-7.7 (Game Porting Toolkit 1.1)\n' })

    const result = await listAvailableWith(LIST_ALL, 'gptk-bottle')
    await flushMicrotasks()

    expect(result.map((component) => component.verb)).toEqual([
      'vcrun2019',
      'gdiplus_winxp',
      'fontsmooth=rgb'
    ])
    expect(
      getEnvironmentReport('gog', 'gptk-bottle').unsupportedWineVersion
    ).toBe('7.7')
  })

  it("probes with the list-all child's wine binary and the same env (including overrides)", async () => {
    await listAvailableWith(LIST_ALL, 'env-probe')
    await flushMicrotasks()

    expect(versionProbes()).toHaveLength(1)
    const probe = defined(versionProbes()[0], 'version probe')
    expect(probe.cmd).toBe('/fake/wine/bin/wine')
    expect(probe.argv).toEqual(['--version'])
    expect(probe.opts?.env?.WINEDEBUG).toBe('-all')
    expect(probe.opts?.env?.LANG).toBe('C')
    expect(probe.opts?.env?.WINEPREFIX).toBe('/fake/prefix')
    expect(probe.opts?.replaceEnv).toBe(true)
  })

  it('still resolves the list, with the report left null, when the probe fails with ENOENT', async () => {
    versionProbe = () => {
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    }

    const result = await listAvailableWith(LIST_ALL, 'enoent-bottle')
    await flushMicrotasks()

    expect(result.map((component) => component.verb)).toEqual([
      'vcrun2019',
      'gdiplus_winxp',
      'fontsmooth=rgb'
    ])
    expect(
      getEnvironmentReport('gog', 'enoent-bottle').unsupportedWineVersion
    ).toBeNull()
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  it('clears a stale record once the bottle is switched to a supported wine, and never fires the listener on a no-op', async () => {
    const listener = jest.fn()
    onEnvironmentChanged(listener)

    const answerWith = (probeStdout: string) => {
      versionProbe = () => ({ stdout: probeStdout })
    }

    answerWith('wine-9.0\n')
    await listAvailableWith(LIST_ALL, 'switch-bottle')
    await flushMicrotasks()
    expect(listener).not.toHaveBeenCalled()
    expect(
      getEnvironmentReport('gog', 'switch-bottle').unsupportedWineVersion
    ).toBeNull()

    answerWith('wine-7.7 (Game Porting Toolkit 1.1)\n')
    await listAvailableWith(LIST_ALL, 'switch-bottle')
    await flushMicrotasks()
    expect(listener).toHaveBeenCalledTimes(1)
    expect(
      getEnvironmentReport('gog', 'switch-bottle').unsupportedWineVersion
    ).toBe('7.7')

    // The same 7.7 again -- still once (recordUnsupportedWine's existing
    // equality early-return).
    await listAvailableWith(LIST_ALL, 'switch-bottle')
    await flushMicrotasks()
    expect(listener).toHaveBeenCalledTimes(1)

    answerWith('wine-9.0\n')
    await listAvailableWith(LIST_ALL, 'switch-bottle')
    await flushMicrotasks()
    expect(listener).toHaveBeenCalledTimes(2)
    expect(
      getEnvironmentReport('gog', 'switch-bottle').unsupportedWineVersion
    ).toBeNull()
  })

  it('never clears an existing record when the probe result is unknown (empty stdout)', async () => {
    versionProbe = () => ({ stdout: 'wine-7.7 (Game Porting Toolkit 1.1)\n' })
    await listAvailableWith(LIST_ALL, 'unknown-bottle')
    await flushMicrotasks()
    expect(
      getEnvironmentReport('gog', 'unknown-bottle').unsupportedWineVersion
    ).toBe('7.7')

    versionProbe = () => ({ stdout: '' })
    await listAvailableWith(LIST_ALL, 'unknown-bottle')
    await flushMicrotasks()

    expect(
      getEnvironmentReport('gog', 'unknown-bottle').unsupportedWineVersion
    ).toBe('7.7')
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  it('resolves the list and leaves the report unchanged when the probe fails to spawn', async () => {
    versionProbe = () => {
      throw new Error('boom')
    }

    const result = await listAvailableWith(LIST_ALL, 'throw-bottle')
    await flushMicrotasks()

    expect(result.map((component) => component.verb)).toEqual([
      'vcrun2019',
      'gdiplus_winxp',
      'fontsmooth=rgb'
    ])
    expect(
      getEnvironmentReport('gog', 'throw-bottle').unsupportedWineVersion
    ).toBeNull()
    expect(logWarning).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a non-zero exit', { code: 1, stdout: 'wine-7.7\n' }],
    ['a timeout', { code: null, timedOut: true, stdout: 'wine-7.7\n' }],
    ['a truncated read', { truncated: true, stdout: 'wine-7.7\n' }]
  ] as [string, DrivenRunResult][])(
    'records nothing after %s of the probe, even with a parseable stdout',
    async (label, result) => {
      versionProbe = () => result
      const appName = `bad-probe-${label.replace(/\W/g, '')}`

      const list = await listAvailableWith(LIST_ALL, appName)
      await flushMicrotasks()

      expect(list).toHaveLength(3)
      expect(
        getEnvironmentReport('gog', appName).unsupportedWineVersion
      ).toBeNull()
      expect(logWarning).toHaveBeenCalledTimes(1)
    }
  )

  it('bounds the probe with a 5s timeout and a 16 KiB maxBuffer', async () => {
    await listAvailableWith(LIST_ALL, 'bounds-bottle')
    await flushMicrotasks()

    const options = defined(versionProbes()[0], 'version probe').opts
    expect(options?.timeoutMs).toBe(5000)
    expect(options?.maxBufferBytes).toBe(16384)
  })
})
