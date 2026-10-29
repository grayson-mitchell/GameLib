// No real subprocess runs here: the detection helper, store, uninstaller,
// download queue and store managers are all mocked, so no fake-HOME profile is
// needed and no `env` literal appears.

import {
  recordedMacArch,
  checkInstalledMacArch,
  offerWindowsReinstall,
  scheduleMacArchSweep,
  MAX_SWEEP_PROBES
} from '../recovery'
import * as macArch from 'backend/utils/macArch'

const mem: { verdicts: Record<string, unknown> } = { verdicts: {} }

jest.mock('../electronStores', () => ({
  macArchStore: {
    get: (_k: string, d: unknown) => (mem.verdicts ? mem.verdicts : d),
    set: (_k: string, v: Record<string, unknown>) => {
      mem.verdicts = v
    }
  }
}))
jest.mock('backend/constants/environment', () => ({ isMac: true }))
jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Gog: 'Gog', Legendary: 'Legendary' },
  RunnerToLogPrefixMap: { gog: 'Gog', legendary: 'Legendary' }
}))
jest.mock('backend/utils/macArch', () => ({
  locateMachOCandidates: jest.fn(),
  machOArchsOfAsync: jest.fn(),
  verdictFromArchs: jest.fn(),
  promptMac32WindowsReinstall: jest.fn()
}))

const getInstallInfo = jest.fn()
const getGameInfo = jest.fn()
jest.mock('backend/storeManagers', () => ({
  libraryManagerMap: {
    gog: {
      getInstallInfo: (...a: unknown[]) => getInstallInfo(...a),
      getGameInfo: (...a: unknown[]) => getGameInfo(...a)
    }
  }
}))
const uninstallGameCallback = jest.fn()
jest.mock('backend/utils/uninstaller', () => ({
  uninstallGameCallback: (...a: unknown[]) => uninstallGameCallback(...a)
}))
const addToQueue = jest.fn()
jest.mock('backend/downloadmanager/downloadqueue', () => ({
  addToQueue: (...a: unknown[]) => addToQueue(...a)
}))

const m = macArch as jest.Mocked<typeof macArch>

const baseArgs = (over = {}) => ({
  runner: 'gog' as const,
  appName: 'g1',
  installPath: '/games/G.app',
  apply: jest.fn(),
  prompt: true,
  ...over
})

const flush = async () => {
  for (let i = 0; i < 20; i++) await Promise.resolve()
}

beforeEach(() => {
  jest.clearAllMocks()
  mem.verdicts = {}
  m.locateMachOCandidates.mockReturnValue(['/games/G.app/Contents/MacOS/G'])
  m.machOArchsOfAsync.mockResolvedValue(['i386'])
  m.verdictFromArchs.mockReturnValue('32')
  m.promptMac32WindowsReinstall.mockResolvedValue(false)
  getInstallInfo.mockResolvedValue({ manifest: {} })
})

describe('checkInstalledMacArch', () => {
  test('no candidates writes nothing', async () => {
    m.locateMachOCandidates.mockReturnValue([])
    const a = baseArgs()
    await checkInstalledMacArch(a)
    expect(a.apply).not.toHaveBeenCalled()
    expect(recordedMacArch('gog', 'g1')).toBeUndefined()
  })
  test('null verdict writes nothing and never prompts', async () => {
    m.verdictFromArchs.mockReturnValue(null)
    const a = baseArgs()
    await checkInstalledMacArch(a)
    expect(a.apply).not.toHaveBeenCalled()
    expect(m.promptMac32WindowsReinstall).not.toHaveBeenCalled()
    expect(recordedMacArch('gog', 'g1')).toBeUndefined()
  })
  test('64 records, applies, no prompt', async () => {
    m.verdictFromArchs.mockReturnValue('64')
    const a = baseArgs()
    await checkInstalledMacArch(a)
    await flush()
    expect(recordedMacArch('gog', 'g1')).toBe('64')
    expect(a.apply).toHaveBeenCalledWith('g1', '64')
    expect(m.promptMac32WindowsReinstall).not.toHaveBeenCalled()
  })
  test('32 records, applies and prompts once', async () => {
    const a = baseArgs()
    await checkInstalledMacArch(a)
    await flush()
    expect(recordedMacArch('gog', 'g1')).toBe('32')
    expect(a.apply).toHaveBeenCalledWith('g1', '32')
    expect(m.promptMac32WindowsReinstall).toHaveBeenCalledTimes(1)
  })
  test('two 32 verdicts show dialogs one after the other', async () => {
    let active = 0
    let maxActive = 0
    m.promptMac32WindowsReinstall.mockImplementation(async () => {
      active++
      maxActive = Math.max(maxActive, active)
      await new Promise((r) => setTimeout(r, 5))
      active--
      return false
    })
    await checkInstalledMacArch(baseArgs({ appName: 'a' }))
    await checkInstalledMacArch(baseArgs({ appName: 'b' }))
    await new Promise((r) => setTimeout(r, 60))
    expect(m.promptMac32WindowsReinstall).toHaveBeenCalledTimes(2)
    expect(maxActive).toBe(1)
  })
})

describe('offerWindowsReinstall', () => {
  test('no Windows build: no dialog', async () => {
    getInstallInfo.mockResolvedValue(undefined)
    await offerWindowsReinstall('gog', 'g1')
    expect(m.promptMac32WindowsReinstall).not.toHaveBeenCalled()
    getInstallInfo.mockRejectedValue(new Error('x'))
    await offerWindowsReinstall('gog', 'g1')
    expect(m.promptMac32WindowsReinstall).not.toHaveBeenCalled()
  })
  test('decline: nothing uninstalled or queued', async () => {
    await offerWindowsReinstall('gog', 'g1')
    expect(uninstallGameCallback).not.toHaveBeenCalled()
    expect(addToQueue).not.toHaveBeenCalled()
  })
  test('accept: uninstall then queue a Windows install', async () => {
    m.promptMac32WindowsReinstall.mockResolvedValue(true)
    getGameInfo
      .mockReturnValueOnce({
        title: 'G',
        is_installed: true,
        install: {
          install_path: '/games/G.app',
          language: 'en-US',
          installedDLCs: ['d1']
        }
      })
      .mockReturnValueOnce({ title: 'G', is_installed: false })
    await offerWindowsReinstall('gog', 'g1')
    expect(uninstallGameCallback).toHaveBeenCalledWith(
      undefined,
      'g1',
      'gog',
      false,
      false
    )
    expect(addToQueue).toHaveBeenCalledTimes(1)
    const el = addToQueue.mock.calls[0][0]
    expect(el.type).toBe('install')
    expect(el.params).toMatchObject({
      appName: 'g1',
      runner: 'gog',
      platformToInstall: 'Windows',
      path: '/games',
      installLanguage: 'en-US',
      installDlcs: ['d1']
    })
  })
  test('accept but still installed: nothing queued', async () => {
    m.promptMac32WindowsReinstall.mockResolvedValue(true)
    getGameInfo.mockReturnValue({
      title: 'G',
      is_installed: true,
      install: { install_path: '/games/G.app' }
    })
    await offerWindowsReinstall('gog', 'g1')
    expect(uninstallGameCallback).toHaveBeenCalled()
    expect(addToQueue).not.toHaveBeenCalled()
  })
})

describe('scheduleMacArchSweep', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  test('arms one unref d timer, skips recorded, caps probes, unrefs every timer', async () => {
    const unrefs: jest.SpyInstance[] = []
    const realSet = global.setTimeout
    const spy = jest.spyOn(global, 'setTimeout').mockImplementation(((
      fn: () => void,
      ms?: number
    ) => {
      const t = realSet(fn, ms)
      unrefs.push(jest.spyOn(t, 'unref'))
      return t
    }) as never)

    m.verdictFromArchs.mockReturnValue('64')
    mem.verdicts = { 'gog:c0': { mac_arch: '64', checkedAt: 1 } }
    const cands = Array.from({ length: 30 }, (_, i) => ({
      appName: `c${i}`,
      installPath: `/g/c${i}.app`
    }))
    const apply = jest.fn()
    scheduleMacArchSweep('gog', () => cands, apply)
    expect(spy).toHaveBeenCalledTimes(1)
    expect(m.machOArchsOfAsync).not.toHaveBeenCalled()

    for (let i = 0; i < 60; i++) {
      await jest.advanceTimersByTimeAsync(20_000)
    }
    expect(apply).toHaveBeenCalledTimes(MAX_SWEEP_PROBES)
    expect(apply).not.toHaveBeenCalledWith('c0', expect.anything())
    expect(unrefs.length).toBeGreaterThan(1)
    unrefs.forEach((u) => expect(u).toHaveBeenCalled())
    spy.mockRestore()
  })
})
