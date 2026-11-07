/**
 * Phase 56 plan 09: the bottle-stage step of DRM mode. Real fs under a temp
 * bottle, injected restoreOriginals / runReg, no network and no wine spawn.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync
} from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

jest.mock('backend/logger', () => ({
  logInfo: jest.fn(),
  logWarning: jest.fn(),
  logError: jest.fn(),
  logDebug: jest.fn(),
  LogPrefix: { Steam: 'Steam' }
}))

jest.mock('backend/constants/paths', () => ({
  builtBridgeShimPath: '/nonexistent/steam_api.dll',
  builtBridgeShim64Path: '/nonexistent/steam_api64.dll'
}))

jest.mock('../../importScan', () => ({ scanSteamApiImports: jest.fn() }))

jest.mock('backend/engine/bottlePrimitives', () => ({
  sanitizeBottleName: (n: string | null) =>
    n && /^[A-Za-z0-9_-]+$/.test(n) ? n : null,
  getBottleDir: jest.fn()
}))
jest.mock('../../../bottle', () => ({
  DEFAULT_BRIDGE_BOTTLE_NAME: 'GameLibSteamBridge'
}))
jest.mock('../../../bridgeBottleLifecycle', () => ({
  endPerGameBridgeBottleSession: jest.fn()
}))
jest.mock('../../../bridgeBottle', () => ({
  resolveBridgeBottleName: (a: string) => `GameLibSteamBridge-${a}`
}))

jest.mock('../../../depot', () => ({
  downloadSelectedDepotFiles: jest.fn(),
  normalizeDepotPath: (p: string) => p,
  resolveContainedPath: (r: string, f: string) => join(r, f),
  sha1File: jest.fn()
}))

jest.mock('backend/launcher', () => ({ runWineCommand: jest.fn() }))

import { runWineCommand } from 'backend/launcher'
import { logInfo, logWarning } from 'backend/logger'
import {
  pidsOfBottleSession,
  pidsWithCwdInBottle,
  stageDrmBottle
} from '../stageDrmBottle'
import {
  buildDrmRegistryCommands,
  DRM_HELPER_WIN,
  DRM_STEAMCLIENT64_WIN
} from '../drmRegistry'
import type { StageDrmBottleInput } from '../stageDrmTypes'
import type { GameSettings } from 'common/types'

const SHIM = Buffer.from('MZ....GameLibSteamBridgeShim....')
const ORIG = Buffer.from('MZ-original')
const FORWARDER = Buffer.concat([
  Buffer.from('MZ-fwd'),
  Buffer.from('GameLib steamclient forwarder', 'utf16le')
])

const STAGED_REG = `[Software\\\\Valve\\\\Steam] 1792813500
#time=1dd6369cfefa400
"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"

[Software\\\\Valve\\\\Steam\\\\ActiveProcess] 1792813400
#time=1dd6369cfefa3fa
"SteamClientDll64"="C:\\\\Program Files (x86)\\\\Steam\\\\steamclient64.dll"
"SteamPath"="C:\\\\Program Files (x86)\\\\Steam"
"Universe"="Public"
`

let tmp: string
let bottle: string
let installRoot: string
let exePath: string

function write(p: string, b: Buffer | string): void {
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, b)
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'gl-drm-stage-'))
  bottle = join(tmp, 'GameLibSteamBridge-1')
  installRoot = join(
    bottle,
    'drive_c',
    'Program Files (x86)',
    'Steam',
    'steamapps',
    'common',
    'Grim Dawn'
  )
  exePath = join(installRoot, 'Game.exe')
  write(exePath, 'MZ-exe')
})

afterEach(() => {
  rmSync(tmp, { recursive: true, force: true })
})

describe('stageDrmBottle', () => {
  const settings = { wineVersion: { name: 'clone' } } as unknown as GameSettings
  let valveDir: string
  let compDir: string
  let runReg: jest.Mock
  const pf = () => join(bottle, 'drive_c', 'Program Files (x86)')
  const steamDir = () => join(pf(), 'Steam')

  const input = (
    over: Partial<StageDrmBottleInput> = {}
  ): StageDrmBottleInput => ({
    appId: '1',
    bottleName: 'GameLibSteamBridge-1',
    bottleSettings: settings,
    exePath,
    installRoot,
    installdir: 'Grim Dawn',
    valveClientDir: valveDir,
    componentDir: compDir,
    ...over
  })
  const deps = (over: Record<string, unknown> = {}) => ({
    getBottleDir: () => bottle,
    findUnreal: async () => null,
    restoreOriginals: jest.fn(() =>
      Promise.resolve({ status: 'ok', outcomes: [] })
    ),
    runReg,
    ...over
  })
  const run = (
    over: Partial<StageDrmBottleInput> = {},
    d: Record<string, unknown> = {}
  ) => stageDrmBottle(input(over), deps(d) as never)

  beforeEach(() => {
    valveDir = join(tmp, 'valve')
    compDir = join(tmp, 'comp')
    for (const n of ['steamclient64.dll', 'tier0_s64.dll', 'vstdlib_s64.dll']) {
      write(join(valveDir, n), 'MZ-valve-' + n)
    }
    for (const n of ['lsteamclient.dll', 'steam.exe']) {
      write(join(compDir, n), 'MZ-comp-' + n)
    }
    runReg = jest.fn(() => Promise.resolve({ code: 0 }))
    ;(runWineCommand as jest.Mock).mockReset()
  })

  const expectErr = async (
    p: ReturnType<typeof run>,
    contains?: string
  ): Promise<void> => {
    const r = await p
    expect(r.status).toBe('error')
    if (r.status === 'error') {
      expect(r.step).toBe('bottle-stage')
      if (contains) expect(r.cause).toContain(contains)
    }
    expect(runReg).not.toHaveBeenCalled()
  }

  it('stages a bottle on the happy path', async () => {
    const r = await run()
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.steamDirHost).toBe(steamDir())
    expect(r.helperWinPath).toBe(DRM_HELPER_WIN)
    expect(r.helperWinPath).toBe('C:\\Program Files (x86)\\Steam\\steam.exe')
    expect(r.steamClient64WinPath).toBe(DRM_STEAMCLIENT64_WIN)
    expect(r.staged).toHaveLength(5)
    expect(readFileSync(join(steamDir(), 'steam.exe'), 'utf8')).toBe(
      'MZ-comp-steam.exe'
    )
    expect(readFileSync(join(steamDir(), 'tier0_s64.dll'), 'utf8')).toBe(
      'MZ-valve-tier0_s64.dll'
    )
    expect(runReg.mock.calls.map((c) => c[0])).toEqual(
      buildDrmRegistryCommands()
    )
    expect(r.registryWritten).toBe(true)
  })

  it('logs which registry values were not staged before re-running reg adds', async () => {
    write(
      join(bottle, 'user.reg'),
      STAGED_REG.replace('"Universe"="Public"', '')
    )
    await run()
    expect(logInfo).toHaveBeenCalledWith(
      'stageDrmBottle: appId 1 registry not staged: Software\\\\Valve\\\\Steam\\\\ActiveProcess:Universe',
      expect.anything()
    )
  })

  it('is idempotent once the bottle is staged', async () => {
    await run()
    write(join(bottle, 'user.reg'), STAGED_REG)
    runReg.mockClear()
    const f = join(steamDir(), 'lsteamclient.dll')
    utimesSync(f, 1000, 1000)
    const before = statSync(f).mtimeMs
    const r = await run()
    expect(r).toMatchObject({
      status: 'ok',
      staged: [],
      restored: [],
      removed: [],
      registryWritten: false
    })
    expect(runReg).toHaveBeenCalledTimes(0)
    expect(statSync(f).mtimeMs).toBe(before)
  })

  it('replaces a stale staged file and clears a crashed temp', async () => {
    mkdirSync(steamDir(), { recursive: true })
    write(join(steamDir(), 'steam.exe'), 'MZ-stale')
    write(join(steamDir(), 'steam.exe.gamelib-stage-tmp'), 'junk')
    const r = await run()
    expect(r.status).toBe('ok')
    expect(readFileSync(join(steamDir(), 'steam.exe'), 'utf8')).toBe(
      'MZ-comp-steam.exe'
    )
    expect(
      readdirSync(steamDir()).filter((n) => n.endsWith('.gamelib-stage-tmp'))
    ).toEqual([])
  })

  it('swaps and cleans before staging, and refuses early', async () => {
    const live = join(installRoot, 'steam_api64.dll')
    write(live, SHIM)
    write(join(installRoot, 'gamelib_bridge.cfg'), 'cfg')
    await expectErr(run(), 'no restorable original')
    expect(existsSync(join(steamDir(), 'steamclient64.dll'))).toBe(false)
    expect(readFileSync(live)).toEqual(SHIM)
    expect(existsSync(join(installRoot, 'gamelib_bridge.cfg'))).toBe(true)

    write(live + '.gamelib-orig', ORIG)
    const r = await run()
    expect(r.status).toBe('ok')
    expect(readFileSync(live)).toEqual(ORIG)
    expect(existsSync(join(installRoot, 'gamelib_bridge.cfg'))).toBe(false)
  })

  it('removes Shipping-dir artifacts through extraExeDirs', async () => {
    const shipping = join(installRoot, 'Game', 'Binaries', 'Win64')
    write(join(shipping, 'gamelib_bridge.cfg'), 'cfg')
    write(join(shipping, 'steamclient64.dll'), FORWARDER)
    const r = await run({ extraExeDirs: [shipping] })
    expect(r.status).toBe('ok')
    expect(existsSync(join(shipping, 'gamelib_bridge.cfg'))).toBe(false)
    expect(existsSync(join(shipping, 'steamclient64.dll'))).toBe(false)
  })

  it('rejects an extraExeDirs entry outside drive_c and removes nothing', async () => {
    write(join(installRoot, 'gamelib_bridge.cfg'), 'cfg')
    await expectErr(run({ extraExeDirs: [tmp] }), 'extra exe dir')
    expect(existsSync(join(installRoot, 'gamelib_bridge.cfg'))).toBe(true)
  })

  it('behaves as before with extraExeDirs [] ', async () => {
    const r = await run({ extraExeDirs: [] })
    expect(r.status).toBe('ok')
  })

  it.each([
    ['non-numeric appId', () => ({ appId: 'abc' }), 'appId'],
    ['bad bottle name', () => ({ bottleName: '../x' }), 'bottle name'],
    ['exe outside bottle', () => ({ exePath: join(tmp, 'x.exe') }), 'exe'],
    [
      'install root outside bottle',
      () => ({ installRoot: tmp }),
      'install root'
    ]
  ])('refuses %s', async (_n, over, cause) => {
    await expectErr(run((over as () => Partial<StageDrmBottleInput>)()), cause)
    expect(existsSync(steamDir()) && readdirSync(steamDir())).not.toContain(
      'steam.exe'
    )
  })

  it('refuses a 32-bit prefix', async () => {
    rmSync(pf(), { recursive: true, force: true })
    mkdirSync(join(bottle, 'drive_c', 'Program Files'), { recursive: true })
    write(join(bottle, 'drive_c', 'Program Files', 'Game', 'Game.exe'), 'MZ')
    await expectErr(
      run({
        exePath: join(bottle, 'drive_c', 'Program Files', 'Game', 'Game.exe'),
        installRoot: join(bottle, 'drive_c', 'Program Files', 'Game')
      }),
      '64-bit'
    )
  })

  it('refuses a symlinked Steam dir', async () => {
    const real = join(tmp, 'elsewhere')
    mkdirSync(real)
    rmSync(steamDir(), { recursive: true, force: true })
    symlinkSync(real, steamDir())
    await expectErr(run(), 'symlink')
    expect(readdirSync(real)).toEqual([])
  })

  it('refuses a bottle holding a Steam client', async () => {
    write(join(steamDir(), 'steamui.dll'), 'MZ')
    await expectErr(run(), 'Steam client')
  })

  it('refuses a missing source', async () => {
    rmSync(join(valveDir, 'tier0_s64.dll'))
    await expectErr(run(), 'tier0_s64.dll')
  })

  it('refuses a symlinked source', async () => {
    const t = join(tmp, 'real.dll')
    write(t, 'MZ-x')
    rmSync(join(compDir, 'lsteamclient.dll'))
    symlinkSync(t, join(compDir, 'lsteamclient.dll'))
    await expectErr(run(), 'lsteamclient.dll')
  })

  it('refuses a non-PE source', async () => {
    write(join(compDir, 'steam.exe'), 'ELF-nope')
    await expectErr(run(), 'steam.exe')
  })

  it('refuses a symlinked destination', async () => {
    const t = join(tmp, 'victim.exe')
    write(t, 'victim')
    mkdirSync(steamDir(), { recursive: true })
    symlinkSync(t, join(steamDir(), 'steam.exe'))
    await expectErr(run(), 'symlink')
    expect(readFileSync(t, 'utf8')).toBe('victim')
  })

  it('refuses a pre-aborted signal', async () => {
    const ac = new AbortController()
    ac.abort()
    await expectErr(run({ signal: ac.signal }), 'aborted')
    expect(existsSync(join(steamDir(), 'steam.exe'))).toBe(false)
  })

  it('maps a failing reg add to bottle-stage', async () => {
    runReg.mockResolvedValue({ code: 1, stderr: 'boom' })
    const r = await run()
    expect(r.status).toBe('error')
    if (r.status === 'error') {
      expect(r.step).toBe('bottle-stage')
      expect(r.cause).toMatch(/^reg add SteamClientDll64 failed/)
    }
  })

  it('times out a reg add and clears its timer', async () => {
    const clear = jest.spyOn(global, 'clearTimeout')
    runReg.mockImplementation(() => new Promise(() => undefined))
    const listBottleProcesses = jest.fn(() =>
      Promise.resolve(['11:97.5:wineserver', '12:0.0:steam.exe'])
    )
    const endStageSession = jest.fn(() => Promise.resolve())
    const r = await run(
      {},
      { regTimeoutMs: 20, listBottleProcesses, endStageSession }
    )
    expect(r.status).toBe('error')
    if (r.status === 'error') expect(r.cause).toContain('timed out')
    expect(listBottleProcesses).toHaveBeenCalledWith(bottle)
    expect(logWarning).toHaveBeenCalledWith(
      'stageDrmBottle: appId 1 bottle processes at timeout: 11:97.5:wineserver,12:0.0:steam.exe',
      expect.anything()
    )
    // One retry on a fresh session, then the error stands.
    expect(endStageSession).toHaveBeenCalledTimes(1)
    expect(runReg).toHaveBeenCalledTimes(2)
    expect(clear).toHaveBeenCalled()
    clear.mockRestore()
  })

  it('ends the wedged stage session and retries the reg add once', async () => {
    runReg
      .mockImplementationOnce(() => new Promise(() => undefined))
      .mockImplementation(() => Promise.resolve({ code: 0 }))
    const endStageSession = jest.fn(() => Promise.resolve())
    const r = await run({}, { regTimeoutMs: 20, endStageSession })
    expect(r.status).toBe('ok')
    if (r.status === 'ok') expect(r.registryWritten).toBe(true)
    expect(endStageSession).toHaveBeenCalledTimes(1)
    expect(endStageSession).toHaveBeenCalledWith({
      appId: '1',
      bottleName: expect.any(String),
      bottleDir: bottle
    })
    // 1 hung attempt + 4 values on the retry
    expect(runReg).toHaveBeenCalledTimes(5)
  })

  describe('stage wine log (plan 56-32)', () => {
    const makeSink = () => ({
      path: '/trace/1-9.stage.wine.log',
      write: jest.fn(),
      close: jest.fn()
    })
    const written = (sink: ReturnType<typeof makeSink>) =>
      sink.write.mock.calls.map((c) => String(c[0])).join('')

    it('A: opens the sink, marks attempt 0, logs its path, closes it', async () => {
      const sink = makeSink()
      const openStageLog = jest.fn(() => sink)
      const r = await run({ stageLogDir: '/trace' }, { openStageLog })
      expect(r.status).toBe('ok')
      expect(openStageLog).toHaveBeenCalledTimes(1)
      expect(written(sink)).toContain('[gamelib] stage attempt 0')
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('stage wine log /trace/1-9.stage.wine.log'),
        expect.anything()
      )
      expect(sink.close).toHaveBeenCalledTimes(1)
    })

    it('B: lists processes before ending the session and logs the retry pass', async () => {
      const sink = makeSink()
      const order: string[] = []
      runReg
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockImplementation(() => Promise.resolve({ code: 0 }))
      const listBottleProcesses = jest.fn(() => {
        order.push('list')
        return Promise.resolve(['11:97.5:wineserver'])
      })
      const endStageSession = jest.fn(() => {
        order.push('end')
        return Promise.resolve()
      })
      const r = await run(
        { stageLogDir: '/trace' },
        {
          regTimeoutMs: 20,
          openStageLog: () => sink,
          listBottleProcesses,
          endStageSession
        }
      )
      expect(r.status).toBe('ok')
      expect(order).toEqual(['list', 'end'])
      expect(logWarning).toHaveBeenCalledWith(
        expect.stringContaining('bottle processes at timeout:'),
        expect.anything()
      )
      expect(written(sink)).toContain('11:97.5:wineserver')
      expect(written(sink)).toContain('[gamelib] stage attempt 1')
      expect(logInfo).toHaveBeenCalledWith(
        'stageDrmBottle: appId 1 stage retry passed on attempt 1',
        expect.anything()
      )
    })

    it('C: an already staged bottle never opens a log', async () => {
      const openStageLog = jest.fn(() => makeSink())
      await run()
      write(join(bottle, 'user.reg'), STAGED_REG)
      const again = await run({ stageLogDir: '/trace' }, { openStageLog })
      expect(again.status).toBe('ok')
      expect(openStageLog).not.toHaveBeenCalled()
    })

    const forced = async (env: Record<string, string>, isPackaged: boolean) => {
      runReg
        .mockImplementationOnce(() => new Promise(() => undefined))
        .mockImplementation(() => Promise.resolve({ code: 0 }))
      const spy = jest.spyOn(global, 'setTimeout')
      await run(
        {},
        {
          regTimeoutMs: 40,
          env,
          isPackaged: () => isPackaged,
          endStageSession: () => Promise.resolve(),
          listBottleProcesses: () => Promise.resolve([])
        }
      )
      const ms = spy.mock.calls.map((c) => Number(c[1]))
      spy.mockRestore()
      return ms
    }

    it('D: forced first timeout applies to attempt 0 only, in a dev sidecar', async () => {
      const ms = await forced(
        { GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS: '300' },
        false
      )
      expect(ms).toContain(300)
      expect(ms).toContain(40)
      expect(logInfo).toHaveBeenCalledWith(
        expect.stringContaining('first stage attempt timeout forced to 300 ms'),
        expect.anything()
      )
    })

    it.each([
      ['packaged', '300', true],
      ['too short', '5', false],
      ['not digits', 'abc', false],
      ['too long', '999999', false]
    ])('E: %s value is ignored', async (_label, value, packaged) => {
      const ms = await forced(
        { GAMELIB_DRM_STAGE_FIRST_TIMEOUT_MS: value },
        packaged
      )
      expect(ms).not.toContain(Number(value))
      expect(logInfo).not.toHaveBeenCalledWith(
        expect.stringContaining('timeout forced'),
        expect.anything()
      )
    })
  })

  it('does not end the session or retry on a non-timeout failure', async () => {
    runReg.mockResolvedValue({ code: 1, stderr: 'boom' })
    const endStageSession = jest.fn(() => Promise.resolve())
    const r = await run({}, { endStageSession })
    expect(r.status).toBe('error')
    expect(endStageSession).not.toHaveBeenCalled()
    expect(runReg).toHaveBeenCalledTimes(1)
  })

  it('never rejects when the runner throws', async () => {
    runReg.mockRejectedValue(new Error('spawn failed'))
    await expect(run()).resolves.toMatchObject({
      status: 'error',
      step: 'bottle-stage'
    })
  })

  it('uses runWineCommand by default with the bottle settings', async () => {
    ;(runWineCommand as jest.Mock).mockResolvedValue({ code: 0, stderr: '' })
    const d = deps()
    delete (d as { runReg?: unknown }).runReg
    const r = await stageDrmBottle(input(), d as never)
    expect(r.status).toBe('ok')
    expect(runWineCommand).toHaveBeenCalledTimes(4)
    expect(runWineCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        wait: false,
        protonVerb: 'run',
        gameSettings: settings
      })
    )
  })

  it('settles the default reg call on reg.exe exit, not pipe close', async () => {
    ;(runWineCommand as jest.Mock).mockResolvedValue({ code: 0, stderr: '' })
    const d = deps()
    delete (d as { runReg?: unknown }).runReg
    await stageDrmBottle(input(), d as never)
    for (const [args] of (runWineCommand as jest.Mock).mock.calls) {
      expect(args).toEqual(expect.objectContaining({ resolveOnExit: true }))
    }
  })
})

describe('pidsOfBottleSession', () => {
  const dir = '/Users/u/Library/Application Support/CrossOver/Bottles/B-1'
  const ps = [
    ` 100 C:\\windows\\system32\\winedevice.exe  HOME=/x WINEPREFIX=${dir} A=b`,
    ` 101 /r/bin/wineserver CX_BOTTLE=B-1 FOO=1`,
    ` 102 C:\\windows\\system32\\winedevice.exe WINEPREFIX=${dir}2 A=b`,
    ` 103 C:\\windows\\system32\\winedevice.exe CX_BOTTLE=B-10`,
    ` 104 /usr/bin/node WINEPREFIX=${dir}`,
    ` 105 /r/bin/wineserver WINEPREFIX=${dir}`
  ].join('\n')

  it('matches only this bottle, wine-ish commands, never the own pid', () => {
    expect(pidsOfBottleSession(ps, dir, 'B-1', 105)).toEqual([100, 101])
  })
})

describe('pidsWithCwdInBottle', () => {
  const dir = '/Users/u/Library/Application Support/CrossOver/Bottles/B-1'
  const lsof = [
    'p100',
    'fcwd',
    `n${dir}/drive_c/windows/system32`,
    'p101',
    'fcwd',
    `n${dir}`,
    'p102',
    'fcwd',
    `n${dir}0/drive_c`,
    'p103',
    'fcwd',
    'n/',
    'p104',
    'fcwd',
    `n${dir}/drive_c`,
    'p105',
    'fcwd',
    `n${dir}/drive_c`
  ].join('\n')
  const ps = [
    ' 100 C:\\windows\\system32\\winedevice.exe ',
    ' 101 /r/lib/wine/x86_64-windows/winewrapper.exe --run -- C:\\x.exe',
    ' 102 C:\\windows\\system32\\winedevice.exe ',
    ' 103 C:\\windows\\system32\\winedevice.exe ',
    ' 104 C:\\windows\\system32\\winedevice.exe ',
    ' 105 -zsh'
  ].join('\n')

  it('matches wine processes with a cwd at or under the bottle dir only', () => {
    expect(pidsWithCwdInBottle(lsof, ps, dir, 104)).toEqual([100, 101])
  })
})
