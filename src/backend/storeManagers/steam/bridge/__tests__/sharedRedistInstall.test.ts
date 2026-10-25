/* eslint-disable @typescript-eslint/require-await */
/**
 * Quick 261025-rkj: installSteamBridgeSharedRedists -- the bottle runner. wine, the CM download
 * and the known-fixes reader are all mocked; the ledger is real fs under a per-test mkdtemp
 * directory in os.tmpdir() (the only path this file ever removes).
 */
import {
  mkdtempSync,
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
import { readKnownFixesLayered } from 'backend/knownFixes'
import { sendGameStatusUpdate } from 'backend/utils'
import { logWarning } from 'backend/logger'
import { getBottleDir } from '../../bottle'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))
jest.mock('backend/launcher', () => ({ runWineCommand: jest.fn() }))
jest.mock('../../depot', () => ({ downloadSharedRedistDepots: jest.fn() }))
jest.mock('backend/utils', () => ({ sendGameStatusUpdate: jest.fn() }))
jest.mock('backend/knownFixes', () => ({ readKnownFixesLayered: jest.fn() }))
jest.mock('../../bottle', () => ({ getBottleDir: jest.fn() }))
jest.mock('../../constants', () => ({
  steamSupportPath: '/tmp/gamelib-test-steam-support'
}))

const mockedRun = runWineCommand as jest.Mock
const mockedDownload = downloadSharedRedistDepots as jest.Mock
const mockedFixes = readKnownFixesLayered as jest.Mock
const mockedStatus = sendGameStatusUpdate as jest.Mock
const mockedWarn = logWarning as jest.Mock
const mockedBottleDir = getBottleDir as jest.Mock

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
const installerCalls = () =>
  mockedRun.mock.calls
    .map(([a]) => a.commandParts as string[])
    .filter((p) => p[0] !== 'reg')

beforeEach(() => {
  jest.clearAllMocks()
  bottleDir = mkdtempSync(join(tmpdir(), 'rkj-redist-bottle-'))
  mockedBottleDir.mockReturnValue(bottleDir)
  mockedFixes.mockReturnValue(null)
  defaultWine()
})

afterEach(() => {
  jest.useRealTimers()
  // Only ever remove the mkdtemp dir created above.
  if (bottleDir.startsWith(tmpdir()))
    rmSync(bottleDir, { recursive: true, force: true })
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
      ]
    ])
    const l = ledger()
    expect(Object.keys(l.done)).toEqual([`${key.toLowerCase()}|dxsetup`])
    expect(l.settled).toMatchObject({
      optIn: [],
      depotIds: ['228990'],
      skipped: []
    })
    expect(mockedDownload).toHaveBeenCalledWith(
      APP,
      expect.objectContaining({ optInDepotIds: [] })
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
      mockedRun.mock.calls.filter(([a]) => a.commandParts[1] === 'add')
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
      // reg query, DXSETUP, reg add
      expect(children).toHaveLength(3)
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
})
