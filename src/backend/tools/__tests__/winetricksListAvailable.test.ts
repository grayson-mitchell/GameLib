/**
 * Phase 45 Plan 06 (D-09/D-17/D-19): `Winetricks.listAvailable` merges the parsed `list-all`
 * output with script metadata read from the already-downloaded `${toolsPath}/winetricks`, derives
 * the needs-GUI flag from that same text, and returns only verbs the D-09 predicate keeps.
 *
 * NO REAL WINE OR WINETRICKS IS SPAWNED. Same mocked-spawn harness as
 * `winetricksInstallLifecycle.test.ts`; additionally `fs/promises`' `stat` and `readFile` are
 * intercepted for the one script path (every other path falls through to the real module) and the
 * script text is the committed fixture excerpt of the pinned winetricks script.
 */
import { EventEmitter } from 'events'
import { readFileSync } from 'fs'
import { join } from 'path'

const mockSpawn = jest.fn()
const mockSendFrontendMessage = jest.fn()
const mockGetWineFromProton = jest.fn()
const mockExecAsync = jest.fn()
const mockStat = jest.fn()
const mockReadFile = jest.fn()

jest.mock('child_process', () => ({
  ...jest.requireActual('child_process'),
  spawn: (...args: unknown[]) => mockSpawn(...args)
}))

jest.mock('fs/promises', () => ({
  ...jest.requireActual('fs/promises'),
  stat: (...args: unknown[]) => mockStat(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args)
}))

jest.mock('../../storeManagers', () => ({
  libraryManagerMap: {
    gog: {
      getGame: () => ({
        getSettings: () => Promise.resolve({ wineVersion: {} })
      })
    }
  }
}))

jest.mock('../../launcher', () => ({
  runWineCommand: jest.fn(),
  setupEnvVars: () => ({}),
  setupWineEnvVars: () => ({}),
  validWine: () => Promise.resolve(true)
}))

jest.mock('../../ipc', () => ({
  sendFrontendMessage: (...args: unknown[]) => mockSendFrontendMessage(...args)
}))

jest.mock('../../utils', () => ({
  ...jest.requireActual('../../utils'),
  getWineFromProton: (...args: unknown[]) => mockGetWineFromProton(...args),
  execAsync: (...args: unknown[]) => mockExecAsync(...args)
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
import { Winetricks } from '../index'

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

type FakeChild = EventEmitter & {
  stdout: EventEmitter & { setEncoding: () => void }
  stderr: EventEmitter & { setEncoding: () => void }
}

function makeFakeChild(): FakeChild {
  const stream = () =>
    Object.assign(new EventEmitter(), { setEncoding: () => undefined })
  return Object.assign(new EventEmitter(), {
    stdout: stream(),
    stderr: stream()
  })
}

let children: FakeChild[]
// Distinct per test so the module-level mtime/size cache never carries a hit across tests.
let scriptMtime = 0

const isScriptPath = (path: unknown): path is string =>
  typeof path === 'string' && path.endsWith('/winetricks')

beforeEach(() => {
  scriptMtime += 1000
  children = []
  mockSpawn.mockImplementation(() => {
    const child = makeFakeChild()
    children.push(child)
    return child
  })
  mockGetWineFromProton.mockResolvedValue({
    winePrefix: '/fake/prefix',
    wineVersion: { bin: '/fake/wine/bin/wine', type: 'wine' }
  })
  mockExecAsync.mockResolvedValue({ stdout: '', stderr: '' })
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
async function listAvailableWith(stdout: string) {
  const list = Winetricks.listAvailable('gog', 'game')
  await flushMicrotasks()
  const child = children[children.length - 1]
  child.stdout.emit('data', stdout)
  child.emit('exit', 0)
  child.emit('close', 0)
  return list
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

    const vcrun = result[0]
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

    expect(result[1].needsGui).toBe(false)
    expect(result[1].publisher).toBe('Microsoft')
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

  it('invokes the winetricks process exactly once per call (list-all only, no second metadata spawn)', async () => {
    await listAvailableWith(LIST_ALL)

    expect(mockSpawn).toHaveBeenCalledTimes(1)
    const [, spawnArgs] = mockSpawn.mock.calls[0] as [string, string[]]
    expect(spawnArgs).toEqual(['list-all'])
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
    expect(result[0].publisher).toBeUndefined()
    expect(result[0].needsGui).toBeUndefined()
    expect(result[0].title).toBe(
      'Visual C++ 2015-2019 libraries (Microsoft, 2019)'
    )
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

    expect(scriptReads()).toBe(1)
    expect(mockSpawn).toHaveBeenCalledTimes(2)
  })

  it('re-reads the script once its mtime changes', async () => {
    await listAvailableWith(LIST_ALL)
    scriptMtime += 1
    await listAvailableWith(LIST_ALL)

    expect(scriptReads()).toBe(2)
  })
})
