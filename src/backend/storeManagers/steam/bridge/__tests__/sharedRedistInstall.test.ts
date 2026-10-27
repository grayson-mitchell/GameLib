/* eslint-disable @typescript-eslint/require-await */
/**
 * Quick 261025-rkj: installSteamBridgeSharedRedists -- the bottle runner. wine, the CM download
 * and the known-fixes reader are all mocked; the ledger is real fs under a per-test mkdtemp
 * directory in os.tmpdir(), and steamSupportPath points at a second per-test mkdtemp directory
 * (these two are the only paths this file ever removes).
 */
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  existsSync,
  rmSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import type { GameSettings } from 'common/types'
import type { ChildProcess } from 'child_process'
import {
  installSteamBridgeSharedRedists,
  REDIST_FAILURE_BACKOFF_AFTER,
  REDIST_FAILURE_BACKOFF_MS,
  REDIST_PROCESS_TIMEOUT_MS,
  REDIST_TIMEOUT_BACKOFF_AFTER,
  unrefWineChild
} from '../sharedRedistInstall'
import { parseInstallScript, classifySharedRedist } from '../sharedRedists'
import type { SharedRedistDepot, SharedRedistDownloadResult } from '../../depot'
import { runWineCommand } from 'backend/launcher'
import { downloadSharedRedistDepots } from '../../depot'
import { readKnownFixProfile } from 'backend/knownFixes'
import { sendGameStatusUpdate } from 'backend/utils'
import { logWarning } from 'backend/logger'
import {
  bridgeBottleNameFor,
  endPerGameBridgeBottleSession,
  getBottleDir
} from '../../bottle'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/launcher', () => ({ runWineCommand: jest.fn() }))
jest.mock('../../depot', () => ({ downloadSharedRedistDepots: jest.fn() }))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/knownFixes', () => ({ readKnownFixProfile: jest.fn() }))
jest.mock('../../bottle', () => ({
  getBottleDir: jest.fn(),
  bridgeBottleNameFor: jest.fn(),
  endPerGameBridgeBottleSession: jest.fn()
}))
// IN-05: a per-test mkdtemp dir, assigned in beforeEach before anything reads it.
let mockSupportDir = ''
jest.mock('../../constants', () => ({
  get steamSupportPath() {
    return mockSupportDir
  }
}))

const mockedRun = runWineCommand as jest.Mock
const mockedDownload = downloadSharedRedistDepots as jest.Mock
const mockedFixes = readKnownFixProfile as jest.Mock
const mockedStatus = sendGameStatusUpdate as jest.Mock
const mockedWarn = logWarning as jest.Mock
const mockedBottleDir = getBottleDir as jest.Mock
const mockedBridgeName = bridgeBottleNameFor as jest.Mock
const mockedEnd = endPerGameBridgeBottleSession as jest.Mock

const APP = '12345'
const SETTINGS = {
  wineCrossoverBottle: 'GameLibSteamBridge-12345'
} as GameSettings
const ROOT = '/cache/steamapps/common/Steamworks Shared'
const DIR_WIN = 'Z:\\cache\\steamapps\\common\\Steamworks Shared'

const fx = (name: string) =>
  readFileSync(join(__dirname, 'fixtures/sharedRedists', name), 'utf8')

function depot(
  id: string,
  file: string,
  scriptPath: string,
  gid = `gid-${id}`
): SharedRedistDepot {
  const entries = parseInstallScript(fx(file))!
  const { kind, label } = classifySharedRedist(scriptPath, entries)
  return {
    depotId: id,
    gid,
    kind,
    label: label ?? `depot ${id}`,
    installDirHost: ROOT,
    entries
  }
}
const dx = () =>
  depot(
    '228990',
    '228990-directx-jun2010.vdf',
    '_CommonRedist\\DirectX\\Jun2010\\installscript.vdf'
  )
const vc2010 = () =>
  depot(
    '228983',
    '228983-vcredist-2010.vdf',
    '_CommonRedist\\vcredist\\2010\\installscript.vdf'
  )
const net452 = () =>
  depot(
    '229004',
    '229004-dotnet-4.5.2.vdf',
    '_CommonRedist\\DotNet\\4.5.2\\installscript.vdf'
  )

const ok = (
  depots: SharedRedistDepot[],
  extra: Partial<SharedRedistDownloadResult> = {}
): SharedRedistDownloadResult => ({
  status: 'ok',
  depots,
  failed: [],
  skipped: [],
  ...extra
})

let bottleDir: string
const ledgerPath = () => join(bottleDir, 'gamelib-shared-redists.json')
const settledOf = () =>
  existsSync(ledgerPath()) ? ledger().settled : undefined
const ledger = () => JSON.parse(readFileSync(ledgerPath(), 'utf8'))

/** Default wine: reg query absent, everything else exits 0. */
function defaultWine(
  overrides: (parts: string[]) => unknown = () => undefined
) {
  mockedRun.mockImplementation(
    async ({ commandParts }: { commandParts: string[] }) => {
      const o = overrides(commandParts)
      if (o !== undefined) return o
      if (commandParts[0] === 'reg' && commandParts[1] === 'query')
        return { code: 1, stdout: '', stderr: '' }
      return { code: 0, stdout: '', stderr: '' }
    }
  )
}
const DRIVERS = 'HKEY_CURRENT_USER\\Software\\Wine\\Drivers'
/** Wine Graphics-value argv (query/add/delete against the Drivers key). */
const graphicsCalls = () =>
  mockedRun.mock.calls
    .map(([a]) => a.commandParts as string[])
    .filter((p) => p[2] === DRIVERS)
const isGfx = (p: string[]) => p[2] === DRIVERS
const installerCalls = () =>
  mockedRun.mock.calls
    .map(([a]) => a.commandParts as string[])
    .filter((p) => p[0] !== 'reg')

beforeEach(() => {
  jest.clearAllMocks()
  bottleDir = mkdtempSync(join(tmpdir(), 'rkj-redist-bottle-'))
  mockSupportDir = mkdtempSync(join(tmpdir(), 'rkj-redist-support-'))
  mockedBottleDir.mockReturnValue(bottleDir)
  mockedFixes.mockReturnValue(null)
  mockedEnd.mockResolvedValue(true)
  mockedBridgeName.mockImplementation((id: string) =>
    /^\d+$/.test(id) ? `GameLibSteamBridge-${id}` : null
  )
  defaultWine()
})

afterEach(() => {
  jest.useRealTimers()
  // Only ever remove the mkdtemp dir created above.
  if (bottleDir.startsWith(tmpdir()))
    rmSync(bottleDir, { recursive: true, force: true })
  if (mockSupportDir.startsWith(tmpdir()))
    rmSync(mockSupportDir, { recursive: true, force: true })
})

describe('installSteamBridgeSharedRedists', () => {
  it('installs DirectX: status, argv, reg add mark, ledger and settled', async () => {
    mockedDownload.mockResolvedValue(ok([dx()]))
    await installSteamBridgeSharedRedists(APP, SETTINGS)

    expect(mockedStatus).toHaveBeenCalledWith({
      appName: APP,
      runner: 'steam',
      status: 'redist',
      context: 'DirectX Jun2010'
    })
    expect(installerCalls()).toEqual([
      [`${DIR_WIN}\\_CommonRedist\\DirectX\\Jun2010\\DXSETUP.exe`, '/silent']
    ])
    const installerCall = mockedRun.mock.calls.find(
      ([a]) => a.commandParts[0] !== 'reg'
    )![0]
    expect(installerCall).toMatchObject({
      wait: false,
      protonVerb: 'run',
      skipPrefixCheckIKnowWhatImDoing: true,
      gameSettings: SETTINGS
    })
    const key =
      'HKEY_LOCAL_MACHINE\\Software\\Valve\\Steam\\Apps\\CommonRedist\\DirectX\\Jun2010'
    expect(mockedRun.mock.calls.map(([a]) => a.commandParts)).toEqual([
      ['reg', 'query', key, '/v', 'dxsetup', '/reg:32'],
      ['reg', 'query', DRIVERS, '/v', 'Graphics'],
      [
        'reg',
        'add',
        DRIVERS,
        '/v',
        'Graphics',
        '/t',
        'REG_SZ',
        '/d',
        'null',
        '/f'
      ],
      installerCalls()[0],
      [
        'reg',
        'add',
        key,
        '/v',
        'dxsetup',
        '/t',
        'REG_DWORD',
        '/d',
        '1',
        '/reg:32',
        '/f'
      ],
      ['reg', 'delete', DRIVERS, '/v', 'Graphics', '/f'],
      ['reg', 'query', DRIVERS, '/v', 'Graphics']
    ])
    expect(mockedEnd).toHaveBeenCalledTimes(2)
    expect(mockedEnd).toHaveBeenCalledWith(
      APP,
      SETTINGS.wineCrossoverBottle,
      20_000
    )
    const l = ledger()
    expect(Object.keys(l.done)).toEqual([`${key.toLowerCase()}|dxsetup`])
    expect(l.settled).toMatchObject({
      optIn: [],
      depotIds: ['228990'],
      skipped: []
    })
    expect(mockedDownload).toHaveBeenCalledWith(
      APP,
      expect.objectContaining({
        optInDepotIds: [],
        cacheSteamappsDir: join(mockSupportDir, 'sharedRedist', 'steamapps')
      })
    )
  })

  it('skips the installer when the registry already holds the mark', async () => {
    mockedDownload.mockResolvedValue(ok([dx()]))
    defaultWine((p) =>
      p[1] === 'query'
        ? { code: 0, stdout: '    dxsetup    REG_DWORD    0x1\r\n', stderr: '' }
        : undefined
    )
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(installerCalls()).toEqual([])
    expect(mockedStatus).not.toHaveBeenCalled()
    expect(Object.keys(ledger().done)).toHaveLength(1)
    expect(ledger().settled).toBeDefined()
  })

  it('writes the ledger atomically, leaving no temp file behind (IN-04)', async () => {
    mockedDownload.mockResolvedValue(ok([dx(), vc2010()]))
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(ledger().settled).toBeDefined()
    expect(readdirSync(bottleDir)).toEqual(['gamelib-shared-redists.json'])
  })

  it('settled ledger with equal opt-in makes no download and no wine call', async () => {
    mockedDownload.mockResolvedValue(ok([dx()]))
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    jest.clearAllMocks()
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(mockedDownload).not.toHaveBeenCalled()
    expect(mockedRun).not.toHaveBeenCalled()
  })

  it('re-evaluates a skipped depot once the profile opts into it', async () => {
    mockedDownload.mockResolvedValue(ok([dx()], { skipped: ['229004'] }))
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(ledger().settled.skipped).toEqual(['229004'])

    jest.clearAllMocks()
    defaultWine()
    mockedFixes.mockReturnValue({ steamSharedRedists: ['229004'] })
    mockedDownload.mockResolvedValue(ok([dx(), net452()]))
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(mockedDownload).toHaveBeenCalledWith(
      APP,
      expect.objectContaining({ optInDepotIds: ['229004'] })
    )
    // DirectX is already in the ledger; only the real .NET entry runs (noop is XP-only).
    expect(installerCalls()).toEqual([
      [
        'cmd',
        '/c',
        `${DIR_WIN}\\_CommonRedist\\DotNet\\4.5.2\\Microsoft .NET Framework 4.5.2.cmd`
      ]
    ])
    expect(ledger().settled.optIn).toEqual(['229004'])
  })

  it('does not settle when the client is offline, and retries next call', async () => {
    mockedDownload.mockResolvedValue({
      status: 'offline',
      depots: [],
      failed: [],
      skipped: []
    })
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(mockedRun).not.toHaveBeenCalled()
    expect(existsSync(ledgerPath())).toBe(false)
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(mockedDownload).toHaveBeenCalledTimes(2)
  })

  it('does not settle when a declared depot failed (key fetch), and retries', async () => {
    mockedDownload.mockResolvedValue(ok([], { failed: ['228990'] }))
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(settledOf()).toBeUndefined()
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(mockedDownload).toHaveBeenCalledTimes(2)
  })

  it('records the depots that installed but does not settle when another failed', async () => {
    mockedDownload.mockResolvedValue(ok([dx()], { failed: ['228983'] }))
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(Object.keys(ledger().done)).toHaveLength(1)
    expect(ledger().settled).toBeUndefined()
  })

  it('settles with a policy skip recorded', async () => {
    mockedDownload.mockResolvedValue(ok([dx()], { skipped: ['229004'] }))
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(ledger().settled).toMatchObject({ skipped: ['229004'], optIn: [] })
  })

  it("settles for status 'none' so later launches cost nothing", async () => {
    mockedDownload.mockResolvedValue({
      status: 'none',
      depots: [],
      failed: [],
      skipped: []
    })
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(ledger().settled).toBeDefined()
    jest.clearAllMocks()
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(mockedDownload).not.toHaveBeenCalled()
  })

  it('resolves void with a warning when the download rejects', async () => {
    mockedDownload.mockRejectedValue(new Error('CM down'))
    await expect(
      installSteamBridgeSharedRedists(APP, SETTINGS)
    ).resolves.toBeUndefined()
    expect(mockedWarn).toHaveBeenCalled()
    expect(existsSync(ledgerPath())).toBe(false)
  })

  it('treats an unreadable ledger as empty with a warning and still runs', async () => {
    writeFileSync(ledgerPath(), '{nope')
    mockedDownload.mockResolvedValue(ok([dx()]))
    await expect(
      installSteamBridgeSharedRedists(APP, SETTINGS)
    ).resolves.toBeUndefined()
    expect(mockedWarn).toHaveBeenCalled()
    expect(installerCalls()).toHaveLength(1)
  })

  it('resolves void when runWineCommand throws, without settling', async () => {
    mockedDownload.mockResolvedValue(ok([dx()]))
    mockedRun.mockRejectedValue(new Error('wine exploded'))
    await expect(
      installSteamBridgeSharedRedists(APP, SETTINGS)
    ).resolves.toBeUndefined()
    expect(mockedWarn).toHaveBeenCalled()
    expect(settledOf()).toBeUndefined()
  })

  it('runs x86 and x64 vcredist 2010, counts 3010 as done', async () => {
    mockedDownload.mockResolvedValue(ok([vc2010()]))
    defaultWine((p) =>
      p[0].endsWith('vcredist_x86.exe')
        ? { code: 3010, stdout: '', stderr: '' }
        : undefined
    )
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(installerCalls().map((p) => p[0].split('\\').pop())).toEqual([
      'vcredist_x86.exe',
      'vcredist_x64.exe'
    ])
    expect(ledger().settled).toBeDefined()
  })

  it('does not mark a non-success exit, does not settle, and still runs the next entry', async () => {
    mockedDownload.mockResolvedValue(ok([vc2010()]))
    defaultWine((p) =>
      p[0].endsWith('vcredist_x86.exe')
        ? { code: 1, stdout: '', stderr: '' }
        : undefined
    )
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(installerCalls()).toHaveLength(2)
    expect(Object.keys(ledger().done)).toEqual([
      'hkey_local_machine\\software\\valve\\steam\\apps\\commonredist\\vcredist\\2010|x64'
    ])
    expect(ledger().settled).toBeUndefined()
    expect(mockedWarn).toHaveBeenCalled()
    // No reg add for the failed x86 entry.
    expect(
      mockedRun.mock.calls.filter(
        ([a]) => a.commandParts[1] === 'add' && !isGfx(a.commandParts)
      )
    ).toHaveLength(1)
  })

  it('skips entries whose Requirement_OS does not apply', async () => {
    mockedDownload.mockResolvedValue(ok([net452()]))
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(installerCalls()).toHaveLength(1)
    expect(installerCalls()[0][2]).toContain(
      'Microsoft .NET Framework 4.5.2.cmd'
    )
  })

  describe('bounded retry (WR-04)', () => {
    const DX_KEY =
      'hkey_local_machine\\software\\valve\\steam\\apps\\commonredist\\directx\\jun2010|dxsetup'
    const failDx = () =>
      defaultWine((p) =>
        p[0].endsWith('DXSETUP.exe')
          ? { code: 1, stdout: '', stderr: '' }
          : undefined
      )
    const dxInstallerCalls = () =>
      installerCalls().filter((p) => p[0].endsWith('DXSETUP.exe'))

    let now: jest.SpyInstance<number, []> | undefined
    afterEach(() => {
      now?.mockRestore()
      now = undefined
    })

    it('counts consecutive failures per GID, backs off after the threshold, and retries once the window passes', async () => {
      const t0 = Date.parse('2026-10-25T00:00:00.000Z')
      now = jest.spyOn(Date, 'now').mockReturnValue(t0)
      mockedDownload.mockResolvedValue(ok([dx()]))
      failDx()
      for (let i = 1; i <= REDIST_FAILURE_BACKOFF_AFTER; i++) {
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        expect(ledger().failures[DX_KEY]).toMatchObject({
          gid: 'gid-228990',
          count: i
        })
      }
      expect(dxInstallerCalls()).toHaveLength(REDIST_FAILURE_BACKOFF_AFTER)

      // Backed off: no reg query, no installer, a log line, still not settled or done.
      mockedRun.mockClear()
      mockedWarn.mockClear()
      now.mockReturnValue(t0 + REDIST_FAILURE_BACKOFF_MS - 1)
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(mockedRun).not.toHaveBeenCalled()
      expect(mockedWarn).toHaveBeenCalledWith(
        expect.stringContaining('times in a row'),
        'Steam'
      )
      expect(ledger().done).toEqual({})
      expect(ledger().settled).toBeUndefined()

      // Window over: one more attempt, which succeeds and clears the markers.
      now.mockReturnValue(t0 + REDIST_FAILURE_BACKOFF_MS + 1)
      defaultWine()
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(dxInstallerCalls()).toHaveLength(1)
      expect(ledger().failures).toEqual({})
      expect(ledger().done[DX_KEY]).toBe('gid-228990')
      expect(ledger().settled).toBeDefined()
    })

    it('backs off sooner when the last failure was a timeout (reads timedOut)', async () => {
      const at = new Date(Date.now()).toISOString()
      writeFileSync(
        ledgerPath(),
        JSON.stringify({
          version: 1,
          done: {},
          timedOut: { [DX_KEY]: at },
          failures: {
            [DX_KEY]: {
              gid: 'gid-228990',
              count: REDIST_TIMEOUT_BACKOFF_AFTER,
              at
            }
          }
        })
      )
      mockedDownload.mockResolvedValue(ok([dx()]))
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(dxInstallerCalls()).toHaveLength(0)
      expect(ledger().settled).toBeUndefined()
    })

    it('does not back off below the threshold, or for a count from another GID', async () => {
      const at = new Date(Date.now()).toISOString()
      for (const failures of [
        { gid: 'gid-228990', count: REDIST_FAILURE_BACKOFF_AFTER - 1, at },
        { gid: 'gid-old', count: 99, at }
      ]) {
        writeFileSync(
          ledgerPath(),
          JSON.stringify({
            version: 1,
            done: {},
            timedOut: {},
            failures: { [DX_KEY]: failures }
          })
        )
        mockedRun.mockClear()
        mockedDownload.mockResolvedValue(ok([dx()]))
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        expect(dxInstallerCalls()).toHaveLength(1)
      }
    })

    it('counts a throw as a failure', async () => {
      mockedDownload.mockResolvedValue(ok([dx()]))
      mockedRun.mockRejectedValue(new Error('wine exploded'))
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(ledger().failures[DX_KEY].count).toBe(1)
      expect(ledger().done).toEqual({})
    })

    it('records a containment rejection per GID, runs none of its processes, and settles without marking it done', async () => {
      const unsafe: SharedRedistDepot = {
        depotId: '229999',
        gid: 'gid-229999',
        kind: 'other',
        label: 'Evil 1.0',
        installDirHost: ROOT,
        entries: [
          {
            name: 'evil',
            hasRunKey:
              'HKEY_LOCAL_MACHINE\\Software\\Valve\\Steam\\Apps\\CommonRedist\\Evil\\1.0',
            minimumHasRunValue: 1,
            requirementOs: null,
            processes: [
              {
                process: '%INSTALLDIR%\\_CommonRedist\\Evil\\1.0\\ok.exe'
              },
              {
                process:
                  '%INSTALLDIR%\\_CommonRedist\\Evil\\1.0\\a & evil.exe & b.cmd'
              }
            ]
          }
        ]
      }
      mockedDownload.mockResolvedValue(ok([unsafe]))
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(installerCalls()).toEqual([])
      const key =
        'hkey_local_machine\\software\\valve\\steam\\apps\\commonredist\\evil\\1.0|evil'
      expect(ledger().rejected).toEqual({ [key]: 'gid-229999' })
      expect(ledger().done).toEqual({})
      expect(ledger().settled).toMatchObject({ rejected: [key] })

      // Same GID on a re-evaluation (opt-in changed): skipped without a warning.
      mockedFixes.mockReturnValue({ steamSharedRedists: ['229999'] })
      mockedWarn.mockClear()
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(installerCalls()).toEqual([])
      expect(mockedWarn).not.toHaveBeenCalledWith(
        expect.stringContaining('unsafe'),
        'Steam'
      )
    })
  })

  it('runs same-named entries without a HasRunKey in two depots (IN-02)', async () => {
    const noKey = (id: string, family: string): SharedRedistDepot => ({
      depotId: id,
      gid: `gid-${id}`,
      kind: 'other',
      label: `${family} 1.0`,
      installDirHost: ROOT,
      entries: [
        {
          name: 'install',
          minimumHasRunValue: 1,
          requirementOs: null,
          processes: [
            {
              process: `%INSTALLDIR%\\_CommonRedist\\${family}\\1.0\\setup.exe`
            }
          ]
        }
      ]
    })
    mockedDownload.mockResolvedValue(
      ok([noKey('229100', 'A'), noKey('229101', 'B')])
    )
    await installSteamBridgeSharedRedists(APP, SETTINGS)
    expect(installerCalls()).toHaveLength(2)
    expect(Object.keys(ledger().done).sort()).toEqual([
      '|229100|install',
      '|229101|install'
    ])
  })

  describe('HasRunKey mark failure (IN-01)', () => {
    const DX_KEY =
      'hkey_local_machine\\software\\valve\\steam\\apps\\commonredist\\directx\\jun2010|dxsetup'
    const regAdds = () =>
      mockedRun.mock.calls.filter(
        ([a]) => a.commandParts[1] === 'add' && !isGfx(a.commandParts)
      )

    it.each([
      ['a non-zero exit', () => ({ code: 1, stdout: '', stderr: '' })],
      [
        'a throw',
        () => {
          throw new Error('reg exploded')
        }
      ]
    ])(
      'keeps the entry done but does not settle on %s, then retries only the mark',
      async (_what, failAdd) => {
        mockedDownload.mockResolvedValue(ok([dx()]))
        defaultWine((p) => (p[1] === 'add' ? failAdd() : undefined))
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        expect(ledger().done[DX_KEY]).toBe('gid-228990')
        expect(ledger().markPending).toEqual({ [DX_KEY]: 'gid-228990' })
        expect(ledger().settled).toBeUndefined()

        // Next launch: no installer, the mark is retried and now succeeds, then it settles.
        mockedRun.mockClear()
        defaultWine()
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        expect(installerCalls()).toEqual([])
        expect(regAdds()).toHaveLength(1)
        expect(ledger().markPending).toEqual({})
        expect(ledger().settled).toBeDefined()
      }
    )
  })

  describe('cancellation (WR-06)', () => {
    it('passes the signal to the download', async () => {
      const ctl = new AbortController()
      mockedDownload.mockResolvedValue(ok([]))
      await installSteamBridgeSharedRedists(APP, SETTINGS, ctl.signal)
      expect(mockedDownload).toHaveBeenCalledWith(
        APP,
        expect.objectContaining({ signal: ctl.signal })
      )
    })

    it('stops before the next entry once aborted, and does not settle', async () => {
      const ctl = new AbortController()
      mockedDownload.mockResolvedValue(ok([vc2010(), dx()]))
      defaultWine((p) => {
        if (p[0].endsWith('vcredist_x86.exe')) ctl.abort()
        return undefined
      })
      await installSteamBridgeSharedRedists(APP, SETTINGS, ctl.signal)
      expect(installerCalls().map((p) => p[0].split('\\').pop())).toEqual([
        'vcredist_x86.exe'
      ])
      expect(Object.keys(ledger().done)).toHaveLength(1)
      expect(ledger().settled).toBeUndefined()
    })
  })

  describe('sidecar exit contract (WR-01)', () => {
    const fakeChild = () => {
      const pipe = () => ({ unref: jest.fn() })
      return {
        unref: jest.fn(),
        stdin: pipe(),
        stdout: pipe(),
        stderr: pipe()
      }
    }

    it('unrefWineChild unrefs the process handle and all three pipes', () => {
      const c = fakeChild()
      unrefWineChild(c as unknown as ChildProcess)
      for (const h of [c, c.stdin, c.stdout, c.stderr])
        expect(h.unref).toHaveBeenCalledTimes(1)
    })

    it('tolerates null pipes and handles without unref', () => {
      expect(() =>
        unrefWineChild({
          stdin: null,
          stdout: {},
          stderr: null
        } as unknown as ChildProcess)
      ).not.toThrow()
    })

    it('passes onSpawn to every wine call and unrefs each spawned child', async () => {
      mockedDownload.mockResolvedValue(ok([dx()]))
      const children: ReturnType<typeof fakeChild>[] = []
      mockedRun.mockImplementation(
        async ({
          commandParts,
          onSpawn
        }: {
          commandParts: string[]
          onSpawn?: (c: ChildProcess) => void
        }) => {
          const c = fakeChild()
          children.push(c)
          onSpawn?.(c as unknown as ChildProcess)
          if (commandParts[1] === 'query')
            return { code: 1, stdout: '', stderr: '' }
          return { code: 0, stdout: '', stderr: '' }
        }
      )
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      // HasRunKey query, Graphics query, Graphics add, DXSETUP, HasRunKey add,
      // Graphics delete, Graphics verification query
      expect(children).toHaveLength(7)
      for (const c of children)
        for (const h of [c, c.stdin, c.stdout, c.stderr])
          expect(h.unref).toHaveBeenCalledTimes(1)
    })
  })

  describe('installer timeout', () => {
    it('records timedOut, stops all further entries and statuses, and does not settle', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
      mockedDownload.mockResolvedValue(ok([vc2010(), dx()]))
      mockedRun.mockImplementation(
        ({ commandParts }: { commandParts: string[] }) => {
          if (commandParts[0] === 'reg')
            return Promise.resolve({ code: 1, stdout: '', stderr: '' })
          return new Promise(() => undefined) // installer never settles
        }
      )

      const p = installSteamBridgeSharedRedists(APP, SETTINGS)
      for (let i = 0; i < 500 && installerCalls().length === 0; i++)
        await new Promise((r) => setImmediate(r))
      expect(installerCalls()).toHaveLength(1)
      await jest.advanceTimersByTimeAsync(REDIST_PROCESS_TIMEOUT_MS)
      await p

      // x86 timed out: no x64 entry, no DirectX, one redist status only.
      expect(installerCalls()).toHaveLength(1)
      expect(mockedStatus).toHaveBeenCalledTimes(1)
      const l = ledger()
      expect(l.done).toEqual({})
      expect(Object.keys(l.timedOut)).toHaveLength(1)
      expect(
        new Date(Object.values(l.timedOut)[0] as string).getTime()
      ).not.toBeNaN()
      expect(l.settled).toBeUndefined()
      expect(mockedWarn).toHaveBeenCalledWith(
        expect.stringContaining('timed out'),
        'Steam'
      )
      expect(jest.getTimerCount()).toBe(0)
    })

    it('clears the timedOut marker on a later successful run', async () => {
      const key =
        'hkey_local_machine\\software\\valve\\steam\\apps\\commonredist\\directx\\jun2010|dxsetup'
      writeFileSync(
        ledgerPath(),
        JSON.stringify({
          version: 1,
          done: {},
          timedOut: { [key]: '2026-10-25T00:00:00.000Z' }
        })
      )
      mockedDownload.mockResolvedValue(ok([dx()]))
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      const l = ledger()
      expect(l.timedOut).toEqual({})
      expect(l.done[key]).toBe('gid-228990')
    })
  })

  describe('null display window (261027-nd3)', () => {
    /** Wine fake that tracks the Graphics value; query reports it as wine reg does. */
    function gfxWine(
      initial: string | null,
      hooks: (p: string[]) => unknown = () => undefined
    ) {
      let value = initial
      mockedRun.mockImplementation(
        async ({ commandParts: p }: { commandParts: string[] }) => {
          const h = hooks(p)
          if (h !== undefined) return h
          if (isGfx(p)) {
            if (p[1] === 'add') value = p[8]
            if (p[1] === 'delete') value = null
            if (p[1] === 'query')
              return value === null
                ? { code: 1, stdout: '', stderr: '' }
                : {
                    code: 0,
                    stdout: `${DRIVERS}\r\n    Graphics    REG_SZ    ${value}\r\n`,
                    stderr: ''
                  }
            return { code: 0, stdout: '', stderr: '' }
          }
          if (p[0] === 'reg' && p[1] === 'query')
            return { code: 1, stdout: '', stderr: '' }
          return { code: 0, stdout: '', stderr: '' }
        }
      )
      return () => value
    }
    const mutations = () => graphicsCalls().filter((p) => p[1] !== 'query')
    const order = (fn: jest.Mock, i: number) => fn.mock.invocationCallOrder[i]

    it('orders session ends around the installer', async () => {
      mockedDownload.mockResolvedValue(ok([dx()]))
      gfxWine(null)
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      const calls = mockedRun.mock.calls.map(
        ([a]) => a.commandParts as string[]
      )
      const at = (pred: (p: string[]) => boolean) => calls.findIndex(pred)
      const addIdx = at((p) => isGfx(p) && p[1] === 'add')
      const instIdx = at((p) => p[0] !== 'reg')
      const delIdx = at((p) => isGfx(p) && p[1] === 'delete')
      const o = mockedRun.mock.invocationCallOrder
      expect(mockedEnd).toHaveBeenCalledTimes(2)
      expect(order(mockedEnd, 0)).toBeGreaterThan(o[addIdx])
      expect(order(mockedEnd, 0)).toBeLessThan(o[instIdx])
      expect(order(mockedEnd, 1)).toBeGreaterThan(o[delIdx + 1])
      expect(ledger().displayDriver).toBeUndefined()
      expect(ledger().settled).toBeDefined()
    })

    it('switches once for two entries', async () => {
      mockedDownload.mockResolvedValue(ok([vc2010()]))
      gfxWine(null)
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(installerCalls()).toHaveLength(2)
      expect(mutations().map((p) => p[1])).toEqual(['add', 'delete'])
    })

    it('restores a pre-existing value with reg add', async () => {
      mockedDownload.mockResolvedValue(ok([dx()]))
      const get = gfxWine('mac')
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(mutations().map((p) => [p[1], p[8]])).toEqual([
        ['add', 'null'],
        ['add', 'mac']
      ])
      expect(get()).toBe('mac')
      expect(ledger().displayDriver).toBeUndefined()
    })

    it.each([
      [
        'non-success exit',
        (p: string[]) =>
          p[0].endsWith('DXSETUP.exe')
            ? { code: 5, stdout: '', stderr: '' }
            : undefined
      ],
      [
        'throw',
        (p: string[]) => {
          if (p[0].endsWith('DXSETUP.exe')) throw new Error('boom')
          return undefined
        }
      ]
    ])('restores after an installer %s', async (_n, hook) => {
      mockedDownload.mockResolvedValue(ok([dx()]))
      const get = gfxWine('mac', hook)
      await expect(
        installSteamBridgeSharedRedists(APP, SETTINGS)
      ).resolves.toBeUndefined()
      expect(get()).toBe('mac')
      expect(mutations().pop()).toEqual(expect.arrayContaining(['add', 'mac']))
      expect(mockedEnd).toHaveBeenCalledTimes(2)
      expect(ledger().displayDriver).toBeUndefined()
    })

    it('restores after an abort between entries', async () => {
      const ctl = new AbortController()
      mockedDownload.mockResolvedValue(ok([vc2010(), dx()]))
      const get = gfxWine(null, (p) => {
        if (p[0].endsWith('vcredist_x86.exe')) ctl.abort()
        return undefined
      })
      await installSteamBridgeSharedRedists(APP, SETTINGS, ctl.signal)
      expect(get()).toBeNull()
      expect(mutations().map((p) => p[1])).toEqual(['add', 'delete'])
      expect(mockedEnd).toHaveBeenCalledTimes(2)
    })

    it('restores after an installer timeout', async () => {
      jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
      mockedDownload.mockResolvedValue(ok([vc2010()]))
      const get = gfxWine(null, (p) =>
        p[0] !== 'reg' ? new Promise(() => undefined) : undefined
      )
      const pr = installSteamBridgeSharedRedists(APP, SETTINGS)
      for (let i = 0; i < 500 && installerCalls().length === 0; i++)
        await new Promise((r) => setImmediate(r))
      await jest.advanceTimersByTimeAsync(REDIST_PROCESS_TIMEOUT_MS)
      await pr
      expect(get()).toBeNull()
      expect(mutations().map((p) => p[1])).toEqual(['add', 'delete'])
      expect(mockedEnd).toHaveBeenCalledTimes(2)
      expect(ledger().displayDriver).toBeUndefined()
    })

    describe('no switch', () => {
      const none = () => {
        expect(graphicsCalls()).toEqual([])
        expect(mockedEnd).not.toHaveBeenCalled()
      }
      it('settled fast path', async () => {
        mockedDownload.mockResolvedValue(ok([]))
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        jest.clearAllMocks()
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        none()
      })
      it('offline', async () => {
        mockedDownload.mockResolvedValue({
          status: 'offline',
          depots: [],
          failed: [],
          skipped: []
        })
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        none()
      })
      it('every entry already marked', async () => {
        mockedDownload.mockResolvedValue(ok([dx()]))
        defaultWine((p) =>
          p[1] === 'query'
            ? {
                code: 0,
                stdout: '    dxsetup    REG_DWORD    0x1\r\n',
                stderr: ''
              }
            : undefined
        )
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        none()
      })
      it('rejected-only run', async () => {
        const d = dx()
        mockedDownload.mockResolvedValue(ok([d]))
        writeFileSync(
          ledgerPath(),
          JSON.stringify({
            version: 1,
            done: {},
            timedOut: {},
            rejected: {
              'hkey_local_machine\\software\\valve\\steam\\apps\\commonredist\\directx\\jun2010|dxsetup':
                d.gid
            }
          })
        )
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        none()
      })
      it('backed-off-only run', async () => {
        const d = dx()
        const k =
          'hkey_local_machine\\software\\valve\\steam\\apps\\commonredist\\directx\\jun2010|dxsetup'
        mockedDownload.mockResolvedValue(ok([d]))
        writeFileSync(
          ledgerPath(),
          JSON.stringify({
            version: 1,
            done: {},
            timedOut: {},
            failures: {
              [k]: {
                gid: d.gid,
                count: REDIST_FAILURE_BACKOFF_AFTER,
                at: new Date().toISOString()
              }
            }
          })
        )
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        none()
      })
      it('shared bottle', async () => {
        mockedDownload.mockResolvedValue(ok([dx()]))
        await installSteamBridgeSharedRedists(APP, {
          wineCrossoverBottle: 'GameLibSteamBridge'
        } as GameSettings)
        expect(installerCalls()).toHaveLength(1)
        none()
      })
      it('Graphics query exits 0 with unparseable stdout', async () => {
        mockedDownload.mockResolvedValue(ok([dx()]))
        defaultWine((p) =>
          isGfx(p) && p[1] === 'query'
            ? { code: 0, stdout: 'garbage', stderr: '' }
            : undefined
        )
        await installSteamBridgeSharedRedists(APP, SETTINGS)
        expect(mutations()).toEqual([])
        expect(mockedEnd).not.toHaveBeenCalled()
        expect(installerCalls()).toHaveLength(1)
      })
      it('Graphics query times out', async () => {
        jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick'] })
        mockedDownload.mockResolvedValue(ok([dx()]))
        defaultWine((p) =>
          isGfx(p) && p[1] === 'query'
            ? new Promise(() => undefined)
            : undefined
        )
        const pr = installSteamBridgeSharedRedists(APP, SETTINGS)
        for (let i = 0; i < 500 && graphicsCalls().length === 0; i++)
          await new Promise((r) => setImmediate(r))
        await jest.advanceTimersByTimeAsync(15_000)
        await pr
        expect(mutations()).toEqual([])
        expect(mockedEnd).not.toHaveBeenCalled()
        expect(installerCalls()).toHaveLength(1)
      })
    })

    it('add-null failure: warns, restores, installers still run', async () => {
      mockedDownload.mockResolvedValue(ok([dx()]))
      const get = gfxWine(null, (p) =>
        isGfx(p) && p[1] === 'add' && p[8] === 'null'
          ? { code: 1, stdout: '', stderr: '' }
          : undefined
      )
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(installerCalls()).toHaveLength(1)
      expect(get()).toBeNull()
      expect(Object.keys(ledger().done)).toHaveLength(1)
      expect(ledger().displayDriver).toBeUndefined()
      expect(mockedWarn).toHaveBeenCalledWith(
        expect.stringContaining('null display driver'),
        'Steam'
      )
    })

    it('first session end false: restores immediately and continues', async () => {
      mockedDownload.mockResolvedValue(ok([dx()]))
      mockedEnd.mockResolvedValueOnce(false)
      gfxWine(null)
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(mutations().map((p) => p[1])).toEqual(['add', 'delete'])
      expect(installerCalls()).toHaveLength(1)
      expect(mockedEnd).toHaveBeenCalledTimes(2)
      expect(Object.keys(ledger().done)).toHaveLength(1)
    })

    it('restore failure: two attempts, loud warning, marker kept, next launch recovers', async () => {
      mockedDownload.mockResolvedValue(ok([dx()]))
      // The value stays "null" whatever the restore does.
      defaultWine((p) => {
        if (!isGfx(p)) return undefined
        if (p[1] === 'query')
          return {
            code: 0,
            stdout: `${DRIVERS}\r\n    Graphics    REG_SZ    ${mockedRun.mock.calls.some(([a]) => a.commandParts[8] === 'null') ? 'null' : 'x'}\r\n`,
            stderr: ''
          }
        return { code: 0, stdout: '', stderr: '' }
      })
      // prior must be absent for the scenario: first query says code 1.
      let first = true
      const base = mockedRun.getMockImplementation()!
      mockedRun.mockImplementation(async (a: { commandParts: string[] }) => {
        if (isGfx(a.commandParts) && a.commandParts[1] === 'query' && first) {
          first = false
          return { code: 1, stdout: '', stderr: '' }
        }
        return base(a)
      })
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(mutations().filter((p) => p[1] === 'delete')).toHaveLength(2)
      expect(mockedWarn).toHaveBeenCalledWith(
        expect.stringMatching(/may start with no display/),
        'Steam'
      )
      expect(ledger().displayDriver).toMatchObject({ prior: null })

      // Next launch: settled ledger plus marker restores first, no download.
      jest.clearAllMocks()
      mockedEnd.mockResolvedValue(true)
      gfxWine(null)
      await installSteamBridgeSharedRedists(APP, SETTINGS)
      expect(mockedDownload).not.toHaveBeenCalled()
      expect(mutations().map((p) => p[1])).toEqual(['delete'])
      expect(mockedEnd).toHaveBeenCalledTimes(1)
      expect(ledger().displayDriver).toBeUndefined()
    })
  })
})
