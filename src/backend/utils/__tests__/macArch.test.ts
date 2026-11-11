// No real subprocess runs here: the lipo/file probes run on a scripted runner and graceful-fs,
// the logger, the dialog and i18next are mocked, so no fake-HOME profile is needed
// and no `env` literal appears.

import { createScriptedRunner } from 'backend/testUtils/scriptedRunner'
import { existsSync, readdirSync, readFileSync } from 'graceful-fs'
import {
  machOArchsOfAsync,
  verdictFromArchs,
  locateMachOBinary,
  locateMachOCandidates,
  promptMac32WindowsReinstall
} from '../macArch'

jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: jest.fn((_k: string, d: string) => d) }
}))

const mExists = existsSync as unknown as jest.Mock
const mReaddir = readdirSync as unknown as jest.Mock
const mReadFile = readFileSync as unknown as jest.Mock
const mBox = jest.fn()
const dialogDeps = { dialogs: { showMessageBox: mBox } }

const DREDMOR_DIR = ['DredmorSchema.xsd', 'achievements', 'dredmor']
function plistNaming(exe: string) {
  return `<plist version="1.0">\n<dict>\n\t<key>CFBundleExecutable</key>\n\t<string>${exe}</string>\n</dict>\n</plist>`
}

beforeEach(() => {
  jest.resetAllMocks()
  jest
    .requireMock('i18next')
    .default.t.mockImplementation((_k: string, d: string) => d)
})

describe('machOArchsOfAsync', () => {
  test('resolves lipo archs, one probe bounded at 5 s', async () => {
    const runner = createScriptedRunner([
      { cmd: 'lipo', argv: ['-archs', '/b'], result: { stdout: 'i386\n' } }
    ])
    await expect(machOArchsOfAsync({ runner }, '/b')).resolves.toEqual(['i386'])
    expect(runner.calls).toHaveLength(1)
    expect(runner.calls[0]?.opts).toMatchObject({ timeoutMs: 5000 })
  })
  test('splits multi-arch lipo output', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'lipo',
        argv: ['-archs', '/b'],
        result: { stdout: 'x86_64 arm64\n' }
      }
    ])
    await expect(machOArchsOfAsync({ runner }, '/b')).resolves.toEqual([
      'x86_64',
      'arm64'
    ])
  })
  test('non-zero lipo falls back to file', async () => {
    const runner = createScriptedRunner([
      { cmd: 'lipo', argv: ['-archs', '/b'], result: { code: 1 } },
      {
        cmd: 'file',
        argv: ['/b'],
        result: { stdout: 'Mach-O x86_64 executable' }
      }
    ])
    await expect(machOArchsOfAsync({ runner }, '/b')).resolves.toEqual([
      'x86_64'
    ])
  })
  test('lipo ENOENT falls back to file', async () => {
    const runner = createScriptedRunner([
      { cmd: 'lipo', argv: ['-archs', '/b'], error: { code: 'ENOENT' } },
      { cmd: 'file', argv: ['/b'], result: { stdout: 'Mach-O i386' } }
    ])
    await expect(machOArchsOfAsync({ runner }, '/b')).resolves.toEqual(['i386'])
  })
  test('lipo timeout falls back to file', async () => {
    const runner = createScriptedRunner([
      {
        cmd: 'lipo',
        argv: ['-archs', '/b'],
        result: { timedOut: true, code: null, signal: 'SIGKILL' }
      },
      { cmd: 'file', argv: ['/b'], result: { stdout: 'Mach-O arm64' } }
    ])
    await expect(machOArchsOfAsync({ runner }, '/b')).resolves.toEqual([
      'arm64'
    ])
  })
  test('both failing resolves [] and never rejects', async () => {
    const runner = createScriptedRunner([
      { cmd: 'lipo', argv: ['-archs', '/b'], error: { code: 'ENOENT' } },
      { cmd: 'file', argv: ['/b'], result: { timedOut: true, code: null } }
    ])
    await expect(machOArchsOfAsync({ runner }, '/b')).resolves.toEqual([])
  })
})

describe('verdictFromArchs', () => {
  test('semantics', () => {
    expect(verdictFromArchs([])).toBeNull()
    expect(verdictFromArchs(['i386'])).toBe('32')
    expect(verdictFromArchs(['i386', 'x86_64'])).toBe('64')
    expect(verdictFromArchs(['arm64'])).toBe('64')
    expect(verdictFromArchs(['ppc'])).toBeNull()
  })
})

describe('locateMachOBinary', () => {
  test('installPath ending in .app resolves Contents/MacOS/<first>', () => {
    mExists.mockReturnValue(true)
    mReaddir.mockReturnValue(['Game', 'Other'])
    expect(locateMachOBinary('/g/Endless Sky.app')).toBe(
      '/g/Endless Sky.app/Contents/MacOS/Game'
    )
  })
  test('launchExecutable ending in .app resolves into its MacOS dir', () => {
    mExists.mockReturnValue(true)
    mReaddir.mockReturnValue(['Bin'])
    expect(locateMachOBinary('/g', 'X.app')).toBe('/g/X.app/Contents/MacOS/Bin')
  })
  test('contained launchExecutable file wins', () => {
    mExists.mockReturnValue(true)
    expect(locateMachOBinary('/g', 'bin/run')).toBe('/g/bin/run')
  })
  test('escape is rejected and logged under the supplied prefix', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logWarning, LogPrefix } = require('backend/logger')
    mExists.mockReturnValue(false)
    mReaddir.mockImplementation(() => {
      throw new Error('nope')
    })
    expect(locateMachOBinary('/g', '../../etc/x', LogPrefix.Steam)).toBeNull()
    expect(logWarning).toHaveBeenCalledWith(expect.any(String), 'Steam')
  })
  test('scans top-level .app', () => {
    mExists.mockReturnValue(true)
    mReaddir.mockImplementation((p: string) =>
      p === '/g' ? ['readme', 'A.app'] : ['Bin']
    )
    expect(locateMachOBinary('/g')).toBe('/g/A.app/Contents/MacOS/Bin')
  })
  test('null on miss', () => {
    mReaddir.mockImplementation(() => {
      throw new Error('x')
    })
    expect(locateMachOBinary('/g')).toBeNull()
  })
  test('prefers CFBundleExecutable over the first MacOS entry', () => {
    mExists.mockReturnValue(true)
    mReaddir.mockImplementation((p: string) =>
      p === '/g' ? ['D.app'] : DREDMOR_DIR
    )
    mReadFile.mockReturnValue(plistNaming('dredmor'))
    expect(locateMachOBinary('/g')).toBe('/g/D.app/Contents/MacOS/dredmor')
    expect(mReadFile).toHaveBeenCalledWith(
      '/g/D.app/Contents/Info.plist',
      'utf8'
    )
  })
  test('ignores a CFBundleExecutable that is a path, or missing on disk', () => {
    mReaddir.mockReturnValue(DREDMOR_DIR)
    mExists.mockReturnValue(true)
    mReadFile.mockReturnValue(plistNaming('../../evil'))
    expect(locateMachOBinary('/g/D.app')).toBe(
      '/g/D.app/Contents/MacOS/DredmorSchema.xsd'
    )
    mExists.mockImplementation((p: string) => !p.endsWith('/gone'))
    mReadFile.mockReturnValue(plistNaming('gone'))
    expect(locateMachOBinary('/g/D.app')).toBe(
      '/g/D.app/Contents/MacOS/DredmorSchema.xsd'
    )
  })
})

describe('locateMachOCandidates', () => {
  test('lists every Contents/MacOS entry', () => {
    mExists.mockReturnValue(true)
    mReaddir.mockReturnValue(['a', 'b'])
    expect(locateMachOCandidates('/g/X.app')).toEqual([
      '/g/X.app/Contents/MacOS/a',
      '/g/X.app/Contents/MacOS/b'
    ])
  })
  test('puts a contained launchExecutable first and caps at 8', () => {
    mExists.mockReturnValue(true)
    mReaddir.mockImplementation((p: string) =>
      p === '/g' ? ['X.app'] : Array.from({ length: 12 }, (_, i) => `f${i}`)
    )
    const r = locateMachOCandidates('/g', 'run')
    expect(r[0]).toBe('/g/run')
    expect(r).toHaveLength(8)
  })
  test('keeps the declared executable inside the cap', () => {
    mExists.mockReturnValue(true)
    mReaddir.mockReturnValue([
      ...Array.from({ length: 12 }, (_, i) => `a${i}`),
      'zz-game'
    ])
    mReadFile.mockReturnValue(plistNaming('zz-game'))
    const r = locateMachOCandidates('/g/X.app')
    expect(r[0]).toBe('/g/X.app/Contents/MacOS/zz-game')
    expect(r).toHaveLength(8)
  })
  test('[] on any miss', () => {
    mReaddir.mockImplementation(() => {
      throw new Error('x')
    })
    expect(locateMachOCandidates('/g')).toEqual([])
  })
})

describe('promptMac32WindowsReinstall', () => {
  test('steam options are byte-identical to the legacy dialog', async () => {
    mBox.mockResolvedValue({ response: 0 })
    await expect(
      promptMac32WindowsReinstall(dialogDeps, 'steam')
    ).resolves.toBe(true)
    expect(mBox.mock.calls[0][0]).toEqual({
      title: '32-bit macOS build detected',
      message:
        "This game's macOS build is 32-bit only and cannot run on this version of macOS. GameLib can reinstall it through CrossOver instead, which will redownload the Windows version.",
      buttons: ['Reinstall via CrossOver', 'Cancel'],
      cancelId: 1
    })
  })
  test('non-steam uses generic keys and detail', async () => {
    const i18next = jest.requireMock('i18next').default
    i18next.t.mockImplementation((_k: string, d: string) => d)
    mBox.mockResolvedValue({ response: 1 })
    await expect(
      promptMac32WindowsReinstall(dialogDeps, 'gog', 'Some Game')
    ).resolves.toBe(false)
    const opts = mBox.mock.calls[0][0]
    expect(opts.detail).toBe('Some Game')
    expect(opts.buttons).toEqual(['Install Windows version', 'Cancel'])
    expect(opts.cancelId).toBe(1)
    expect(i18next.t).toHaveBeenCalledWith(
      'gamelib:box.mac32Detected.title',
      expect.any(String)
    )
  })
  test('never throws', async () => {
    mBox.mockRejectedValue(new Error('x'))
    await expect(
      promptMac32WindowsReinstall(dialogDeps, 'legendary')
    ).resolves.toBe(false)
  })
})
