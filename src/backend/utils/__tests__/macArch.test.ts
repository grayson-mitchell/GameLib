// No real subprocess runs here: child_process, graceful-fs, the logger, the
// platform dialog and i18next are all mocked, so no fake-HOME profile is needed
// and no `env` literal appears.

import { execFile, execFileSync } from 'child_process'
import { existsSync, readdirSync } from 'graceful-fs'
import { dialog } from 'backend/platform'
import {
  machOArchsOf,
  machOArchsOfAsync,
  verdictFromArchs,
  locateMachOBinary,
  locateMachOCandidates,
  promptMac32WindowsReinstall
} from '../macArch'

jest.mock('child_process', () => ({
  execFile: jest.fn(),
  execFileSync: jest.fn()
}))
jest.mock('graceful-fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn()
}))
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))
jest.mock('backend/platform', () => ({
  dialog: { showMessageBox: jest.fn() }
}))
jest.mock('i18next', () => ({
  __esModule: true,
  default: { t: jest.fn((_k: string, d: string) => d) }
}))

const mExecSync = execFileSync as unknown as jest.Mock
const mExec = execFile as unknown as jest.Mock
const mExists = existsSync as unknown as jest.Mock
const mReaddir = readdirSync as unknown as jest.Mock
const mBox = dialog.showMessageBox as unknown as jest.Mock

type ExecCb = (err: Error | null, stdout?: string) => void
function asyncExec(handler: (cmd: string) => string | Error) {
  mExec.mockImplementation(
    (cmd: string, _a: string[], _o: unknown, cb: ExecCb) => {
      const r = handler(cmd)
      if (r instanceof Error) cb(r)
      else cb(null, r)
    }
  )
}

beforeEach(() => {
  jest.resetAllMocks()
  jest
    .requireMock('i18next')
    .default.t.mockImplementation((_k: string, d: string) => d)
})

describe('machOArchsOf', () => {
  test('splits lipo output', () => {
    mExecSync.mockReturnValue('x86_64 arm64\n')
    expect(machOArchsOf('/b')).toEqual(['x86_64', 'arm64'])
  })
  test('falls back to file', () => {
    mExecSync.mockImplementationOnce(() => {
      throw new Error('no lipo')
    })
    mExecSync.mockReturnValueOnce('Mach-O executable i386')
    expect(machOArchsOf('/b')).toEqual(['i386'])
  })
  test('both throw gives []', () => {
    mExecSync.mockImplementation(() => {
      throw new Error('x')
    })
    expect(machOArchsOf('/b')).toEqual([])
  })
})

describe('machOArchsOfAsync', () => {
  test('resolves lipo archs', async () => {
    asyncExec(() => 'i386\n')
    await expect(machOArchsOfAsync('/b')).resolves.toEqual(['i386'])
    expect(mExec.mock.calls[0][2]).toEqual({ encoding: 'utf8', timeout: 5000 })
  })
  test('lipo error falls back to file', async () => {
    asyncExec((cmd) =>
      cmd === 'lipo' ? new Error('no') : 'Mach-O x86_64 executable'
    )
    await expect(machOArchsOfAsync('/b')).resolves.toEqual(['x86_64'])
  })
  test('both erroring resolves [] and never rejects', async () => {
    asyncExec(() => new Error('no'))
    await expect(machOArchsOfAsync('/b')).resolves.toEqual([])
  })
  test('synchronous throw still resolves []', async () => {
    mExec.mockImplementation(() => {
      throw new Error('boom')
    })
    await expect(machOArchsOfAsync('/b')).resolves.toEqual([])
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
    await expect(promptMac32WindowsReinstall('steam')).resolves.toBe(true)
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
    await expect(promptMac32WindowsReinstall('gog', 'Some Game')).resolves.toBe(
      false
    )
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
    await expect(promptMac32WindowsReinstall('legendary')).resolves.toBe(false)
  })
})
