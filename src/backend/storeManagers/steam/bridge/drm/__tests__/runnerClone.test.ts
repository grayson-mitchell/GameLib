/**
 * Phase 56 plan 08: runnerClone.ts (D-08, D-09, D-10).
 *
 * These tests build synthetic CrossOver trees in mkdtemp dirs whose names
 * contain a space (`gl app`), as the real appFolder does. The tool runner is
 * faked for every step except the defaultRunTool cases, which spawn real
 * system binaries under a fake HOME. The opt-in real arm at the bottom clones
 * the real CrossOver and is not part of CI.
 */
import * as childProcess from 'child_process'
import { createHash } from 'crypto'
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
  promises as fsp
} from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { createFakeHomeProfile } from 'backend/testUtils/fakeHomeProfile'
import { callAbortController } from 'backend/utils/aborthandler/aborthandler'

const mockSpawnCalls: unknown[][] = []
jest.mock('child_process', () => {
  const actual = jest.requireActual('child_process')
  return {
    ...actual,
    spawn: (...a: unknown[]) => {
      mockSpawnCalls.push(a)
      return actual.spawn(...a)
    }
  }
})
jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

import {
  CLONE_ARGV_FALLBACK,
  CLONE_ARGV_PRIMARY,
  CrossoverAllowed,
  DYLD_ENTITLEMENT,
  RUNNER_MARKER_FILE,
  RunnerComponentInput,
  RunTool,
  RunToolResult,
  STOCK_LOADER_ENTITLEMENTS,
  defaultRunTool,
  detectAllowedCrossover,
  ensureRunnerClone,
  verifyRunnerClone
} from '../runnerClone'
import { buildDrmPaths } from '../drmPaths'
import type { NtdllPatchRow } from '../ntdllPatchTable'

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const WINE_INF_MTIME = 1784047440
const NTDLL = Buffer.from('synthetic-clean-ntdll')
const FAKE_PATCHED = Buffer.from('synthetic-patched-ntdll')
const LOADER = Buffer.from('synthetic-loader')
const BUILD = '26.3.0.39832'

const ROW: NtdllPatchRow = {
  crossoverBuild: BUILD,
  cleanSize: NTDLL.length,
  cleanSha256: sha(NTDLL),
  hookRva: 0,
  stolenBytes: '00',
  sectionName: '.npdet',
  sectionRva: 0,
  sectionVirtualSize: 0x1000,
  sectionRawSize: 0x1000,
  sectionCharacteristics: 0,
  payloadSha256: '',
  patchedSha256: sha(FAKE_PATCHED)
}

const tmps: string[] = []
function tmp(name = 'gl app'): string {
  const d = mkdtempSync(join(tmpdir(), name + '-'))
  tmps.push(d)
  return d
}
afterEach(() => {
  jest.restoreAllMocks()
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true })
})

function makeSyntheticCrossover(root: string) {
  const appPath = join(root, 'Cross Over.app')
  const cxRoot = join(appPath, 'Contents', 'SharedSupport', 'CrossOver')
  const hosted = join(cxRoot, 'CrossOver-Hosted Application')
  mkdirSync(hosted, { recursive: true })
  for (const f of ['wine', 'wineloader', 'wineserver', 'cxbottle']) {
    writeFileSync(join(hosted, f), '#!/bin/sh\n', { mode: 0o755 })
  }
  symlinkSync('CrossOver-Hosted Application', join(cxRoot, 'bin'))
  mkdirSync(join(cxRoot, 'lib', 'wine', 'x86_64-windows'), { recursive: true })
  mkdirSync(join(cxRoot, 'lib', 'wine', 'x86_64-unix'), { recursive: true })
  mkdirSync(join(cxRoot, 'share', 'wine'), { recursive: true })
  writeFileSync(join(cxRoot, 'lib/wine/x86_64-windows/ntdll.dll'), NTDLL)
  writeFileSync(join(cxRoot, 'lib/wine/x86_64-unix/wine'), LOADER, {
    mode: 0o755
  })
  writeFileSync(join(cxRoot, 'share/wine/wine.inf'), 'inf')
  utimesSync(
    join(cxRoot, 'share/wine/wine.inf'),
    WINE_INF_MTIME,
    WINE_INF_MTIME
  )
  writeFileSync(join(appPath, 'Contents', 'Info.plist'), '<plist/>')
  return { appPath, cxRoot, binDir: join(cxRoot, 'bin') }
}

function makeComponent(root: string): RunnerComponentInput {
  const dir = join(root, 'component')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'lsteamclient.dll'), 'dll-bytes')
  writeFileSync(join(dir, 'lsteamclient.so'), 'so-bytes')
  writeFileSync(join(dir, 'detour.bin'), 'payload')
  return {
    componentId: 'steamclient-layer-cx' + BUILD,
    files: {
      lsteamclientDll: join(dir, 'lsteamclient.dll'),
      lsteamclientSo: join(dir, 'lsteamclient.so'),
      detourPayload: join(dir, 'detour.bin')
    }
  }
}

const entXml = (keys: string[]) =>
  '<?xml version="1.0"?><plist version="1.0"><dict>' +
  keys.map((k) => `<key>${k}</key><true/>`).join('') +
  '</dict></plist>'

type FakeOpts = {
  cpFails?: number // number of leading cp calls that exit 1
  cpTimeout?: boolean
  preserveTimestamps?: boolean
  cpWaitsForSignal?: boolean
  soSigned?: boolean
  stockKeys?: string[]
  forceExit?: number
  skipDyld?: boolean
  quarantine?: boolean
  ps?: () => Partial<RunToolResult>
  plutil?: string
}
type Call = { tool: string; args: readonly string[] }

function fakeRun(o: FakeOpts = {}) {
  const calls: Call[] = []
  let keys = o.stockKeys ?? [...STOCK_LOADER_ENTITLEMENTS]
  let cpCount = 0
  const base: RunToolResult = {
    code: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    aborted: false
  }
  const run: RunTool = async (tool, args, opts) => {
    calls.push({ tool, args })
    if (tool === '/bin/cp') {
      cpCount++
      if (o.cpWaitsForSignal) {
        return new Promise((res) =>
          opts.signal?.addEventListener('abort', () =>
            res({ ...base, code: null, aborted: true })
          )
        )
      }
      if (o.cpTimeout) return { ...base, code: null, timedOut: true }
      if (o.cpFails && cpCount <= o.cpFails) {
        return { ...base, code: 1, stderr: 'clonefile failed' }
      }
      const src = args[args.length - 2]
      const dst = args[args.length - 1]
      await fsp.cp(src, dst, {
        recursive: true,
        verbatimSymlinks: true,
        preserveTimestamps: o.preserveTimestamps !== false
      })
      return base
    }
    if (tool === '/usr/bin/plutil') {
      return { ...base, stdout: (o.plutil ?? BUILD) + '\n' }
    }
    if (tool === '/usr/bin/codesign') {
      if (args[0] === '--remove-signature') return base
      if (args[0] === '-dv') {
        return o.soSigned
          ? { ...base, code: 0, stderr: 'Identifier=x' }
          : { ...base, code: 1, stderr: 'code object is not signed at all' }
      }
      if (args[0] === '-d') return { ...base, stdout: entXml(keys) }
      if (args[0] === '--force') {
        if (o.forceExit) return { ...base, code: o.forceExit }
        keys = o.skipDyld
          ? keys
          : [...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT]
        return base
      }
    }
    if (tool === '/usr/bin/xattr') {
      if (args[0] === '-r') return base
      return { ...base, stdout: o.quarantine ? 'com.apple.quarantine\n' : '' }
    }
    if (tool === '/bin/ps') {
      return { ...base, ...(o.ps ? o.ps() : {}) }
    }
    return base
  }
  return { run, calls }
}

function setup(o: FakeOpts = {}) {
  const root = tmp()
  const cx = makeSyntheticCrossover(root)
  const component = makeComponent(root)
  const appFolder = join(root, 'app folder')
  mkdirSync(appFolder)
  const crossover: CrossoverAllowed = {
    appPath: cx.appPath,
    cxRoot: cx.cxRoot,
    binDir: cx.binDir,
    crossoverBuild: BUILD,
    cleanNtdllSha256: ROW.cleanSha256,
    row: ROW,
    supportedBuilds: [BUILD]
  }
  const fake = fakeRun(o)
  const paths = buildDrmPaths(appFolder)!
  const applyPatch = () => ({ status: 'patched' as const, bytes: FAKE_PATCHED })
  return { root, cx, component, appFolder, crossover, fake, paths, applyPatch }
}

function treeState(dir: string): string {
  const out: string[] = []
  const walk = (d: string) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n)
      const st = lstatSync(p)
      if (st.isDirectory()) walk(p)
      else if (st.isSymbolicLink()) out.push(p + ' link')
      else out.push(`${p} ${st.mtimeMs} ${sha(readFileSync(p))}`)
    }
  }
  walk(dir)
  return out.join('\n')
}

// ---------------------------------------------------------------------------
// Task 1
// ---------------------------------------------------------------------------

describe('defaultRunTool', () => {
  const posix = process.platform === 'win32' ? it.skip : it

  posix('runs ps and captures stdout', async () => {
    const r = await defaultRunTool(
      '/bin/ps',
      ['-o', 'pid=', '-p', String(process.pid)],
      { timeoutMs: 10000 }
    )
    expect(r.code).toBe(0)
    expect(r.timedOut).toBe(false)
    expect(r.stdout).toContain(String(process.pid))
  })

  posix('spawns under a fake HOME that is gone afterwards', async () => {
    mockSpawnCalls.length = 0
    await defaultRunTool('/bin/ps', ['-o', 'pid=', '-p', '1'], {
      timeoutMs: 10000
    })
    expect(mockSpawnCalls).toHaveLength(1)
    const env = (mockSpawnCalls[0][2] as { env: NodeJS.ProcessEnv }).env
    expect(env.HOME).toBeTruthy()
    expect(env.HOME).not.toBe(process.env.HOME)
    expect(existsSync(env.HOME as string)).toBe(false)
  })

  it('rejects a tool that is not allowed without spawning', async () => {
    mockSpawnCalls.length = 0
    const r = await defaultRunTool('/bin/sh' as never, ['-c', 'true'], {
      timeoutMs: 1000
    })
    expect(r.code).toBeNull()
    expect(r.timedOut).toBe(false)
    expect(r.stderr).toContain('tool not allowed')
    expect(mockSpawnCalls).toHaveLength(0)
  })
})

describe('detectAllowedCrossover', () => {
  async function detect(
    over: {
      plutil?: string | RunToolResult
      mutate?: (cx: ReturnType<typeof makeSyntheticCrossover>) => void
      binDir?: (cx: { binDir: string }) => string | undefined
      deps?: Parameters<typeof detectAllowedCrossover>[1]
      appFolder?: string
    } = {}
  ) {
    const root = tmp()
    const cx = makeSyntheticCrossover(root)
    over.mutate?.(cx)
    const calls: Call[] = []
    const runTool: RunTool = async (tool, args) => {
      calls.push({ tool, args })
      const p = over.plutil ?? BUILD
      if (typeof p !== 'string') return p
      return {
        code: 0,
        stdout: p + '\n',
        stderr: '',
        timedOut: false,
        aborted: false
      }
    }
    const appFolder = over.appFolder ?? join(root, 'app folder')
    const bin = over.binDir ? over.binDir(cx) : cx.binDir
    const res = await detectAllowedCrossover(
      { crossoverBinDir: bin, appFolder },
      { runTool, platform: 'darwin', ...over.deps }
    )
    return { res, calls, cx, appFolder }
  }
  const failRes = (r: unknown) =>
    r as { status: string; step: string; cause: string }

  it('returns ok for a synthetic allowlisted tree and reads the plist via plutil', async () => {
    const { res, calls, cx } = await detect({
      deps: { findRow: () => ROW }
    })
    expect(res).toMatchObject({
      status: 'ok',
      crossoverBuild: BUILD,
      appPath: cx.appPath,
      cxRoot: cx.cxRoot,
      cleanNtdllSha256: sha(NTDLL),
      row: ROW
    })
    expect(calls[0]).toEqual({
      tool: '/usr/bin/plutil',
      args: [
        '-extract',
        'CFBundleVersion',
        'raw',
        '-o',
        '-',
        join(cx.appPath, 'Contents', 'Info.plist')
      ]
    })
  })

  it('refuses an unlisted build naming installed and supported versions', async () => {
    const { res } = await detect({ plutil: '25.1.0.1' })
    const r = failRes(res)
    expect(r).toMatchObject({ status: 'error', step: 'unsupported-crossover' })
    expect(r.cause).toContain('25.1.0.1')
    expect(r.cause).toContain('26.3.0.39832')
  })

  it('refuses a listed build with an unknown clean ntdll sha', async () => {
    const { res } = await detect()
    const r = failRes(res)
    expect(r.step).toBe('unsupported-crossover')
    expect(r.cause).toContain('ntdll')
    expect(r.cause).toContain('26.3.0.39832')
  })

  const cases: Array<[string, Parameters<typeof detect>[0]]> = [
    ['a two-part version', { plutil: '26.3' }],
    [
      'a failing plutil',
      {
        plutil: {
          code: 1,
          stdout: '',
          stderr: 'x',
          timedOut: false,
          aborted: false
        }
      }
    ],
    [
      'a timed-out plutil',
      {
        plutil: {
          code: null,
          stdout: '',
          stderr: '',
          timedOut: true,
          aborted: false
        }
      }
    ],
    [
      'a missing ntdll',
      {
        deps: { findRow: () => ROW },
        mutate: (cx) =>
          rmSync(join(cx.cxRoot, 'lib/wine/x86_64-windows/ntdll.dll'))
      }
    ],
    [
      'a symlinked ntdll',
      {
        deps: { findRow: () => ROW },
        mutate: (cx) => {
          const p = join(cx.cxRoot, 'lib/wine/x86_64-windows/ntdll.dll')
          const real = p + '.real'
          writeFileSync(real, NTDLL)
          rmSync(p)
          symlinkSync(real, p)
        }
      }
    ],
    ['a bad binDir suffix', { binDir: (cx) => cx.binDir + '/x' }],
    ['no CrossOver at all', { binDir: () => undefined }]
  ]
  it.each(cases)('fails closed on %s', async (_n, over) => {
    const { res } = await detect({
      ...over,
      deps: {
        resolveCrossoverBinDir: async () => undefined,
        ...over?.deps
      }
    })
    const r = failRes(res)
    expect(r.step).toBe('unsupported-crossover')
    expect(r.cause.length).toBeGreaterThan(0)
  })

  it('refuses a binDir under the runners root', async () => {
    const root = tmp()
    const appFolder = join(root, 'app folder')
    const paths = buildDrmPaths(appFolder)!
    const cx = makeSyntheticCrossover(join(paths.runnersRoot, 'x'))
    const res = await detectAllowedCrossover(
      { crossoverBinDir: cx.binDir, appFolder },
      { platform: 'darwin' }
    )
    expect(failRes(res).step).toBe('unsupported-crossover')
  })

  it('refuses non-macOS platforms', async () => {
    const { res } = await detect({ deps: { platform: 'linux' } })
    expect(failRes(res).cause).toContain('macOS')
  })

  it('creates nothing and never calls cp when unsupported', async () => {
    const { calls, appFolder } = await detect({ plutil: '25.1.0.1' })
    expect(existsSync(join(appFolder, 'steam-bridge'))).toBe(false)
    expect(calls.some((c) => c.tool === '/bin/cp')).toBe(false)
  })

  it('module source keeps its import discipline', () => {
    const src = readFileSync(join(__dirname, '..', 'runnerClone.ts'), 'utf8')
    expect(src).not.toMatch(/from 'backend\/launcher'/)
    expect(src).not.toMatch(/from 'backend\/utils'/)
    expect(src).not.toMatch(/constants\/paths/)
    expect(src).not.toMatch(/^import .*crossoverLocation/m)
    expect(src).not.toMatch(/\[bridge-notice\]|\[bridge-drm\]|\[drm-trace\]/)
    expect(src).not.toMatch(/\/Applications/)
    expect(src).not.toMatch(/[0-9a-f]{64}/)
  })
})

// ---------------------------------------------------------------------------
// Task 2
// ---------------------------------------------------------------------------

describe('ensureRunnerClone build path', () => {
  async function build(o: FakeOpts = {}, deps: object = {}) {
    const s = setup(o)
    const onCloneStart = jest.fn()
    const res = await ensureRunnerClone(
      {
        appFolder: s.appFolder,
        crossover: s.crossover,
        component: s.component
      },
      { runTool: s.fake.run, applyPatch: s.applyPatch, onCloneStart, ...deps }
    )
    return { s, res, onCloneStart }
  }

  it('builds a fresh runner with the patched ntdll, builtins, marker and root mode', async () => {
    const { s, res, onCloneStart } = await build()
    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    const runnerDir = s.paths.runnerDir(BUILD)!
    const cxRoot = s.paths.runnerAppPath(BUILD)!
    expect(res).toMatchObject({
      source: 'clone',
      cloneMethod: 'cp -c',
      runnerDir,
      cxRoot,
      wrapperBin: join(cxRoot, 'bin', 'wine'),
      wineloaderBin: join(cxRoot, 'bin', 'wineloader'),
      wineserverBin: join(cxRoot, 'bin', 'wineserver'),
      windowsDllDir: join(cxRoot, 'lib/wine/x86_64-windows'),
      unixDllDir: join(cxRoot, 'lib/wine/x86_64-unix')
    })
    const ntdll = join(cxRoot, 'lib/wine/x86_64-windows/ntdll.dll')
    expect(sha(readFileSync(ntdll))).toBe(ROW.patchedSha256)
    expect(readFileSync(ntdll + '.gamelib-orig')).toEqual(NTDLL)
    expect(
      readFileSync(join(cxRoot, 'lib/wine/x86_64-windows/lsteamclient.dll'))
    ).toEqual(readFileSync(s.component.files.lsteamclientDll))
    expect(
      readFileSync(join(cxRoot, 'lib/wine/x86_64-unix/lsteamclient.so'))
    ).toEqual(readFileSync(s.component.files.lsteamclientSo))
    expect(
      readFileSync(join(cxRoot, 'lib/wine/x86_64-unix/wine.gamelib-orig'))
    ).toEqual(LOADER)
    const markerPath = join(runnerDir, RUNNER_MARKER_FILE)
    expect(statSync(markerPath).mode & 0o777).toBe(0o600)
    const marker = JSON.parse(readFileSync(markerPath, 'utf8'))
    expect(marker).toMatchObject({
      schema: 1,
      crossoverBuild: BUILD,
      cleanNtdllSha256: ROW.cleanSha256,
      patchedNtdllSha256: ROW.patchedSha256,
      componentId: s.component.componentId,
      lsteamclientDllSha256: sha('dll-bytes'),
      lsteamclientSoSha256: sha('so-bytes'),
      loaderSha256: sha(LOADER)
    })
    expect(
      readdirSync(s.paths.runnersRoot).filter((n) => n.includes('.partial-'))
    ).toEqual([])
    expect(statSync(s.paths.runnersRoot).mode & 0o777).toBe(0o700)
    expect(onCloneStart).toHaveBeenCalledTimes(1)
  })

  it('keeps every spawn argument inside the runners root except the cp source', async () => {
    const { s } = await build()
    const first = s.fake.calls[0]
    expect(first.tool).toBe('/bin/cp')
    expect(first.args.slice(0, CLONE_ARGV_PRIMARY.length)).toEqual([
      ...CLONE_ARGV_PRIMARY
    ])
    expect(first.args[first.args.length - 2]).toBe(s.cx.cxRoot)
    for (const c of s.fake.calls) {
      for (const a of c.args) {
        if (a.startsWith('/') && a !== s.cx.cxRoot) {
          expect(a.startsWith(s.paths.runnersRoot) || a === '/').toBe(true)
        }
      }
      if (c !== first) expect(c.args.join('\0')).not.toContain(s.cx.appPath)
    }
  })

  it('does not write to the installed CrossOver', async () => {
    const s = setup()
    const before = treeState(s.cx.appPath)
    await ensureRunnerClone(
      {
        appFolder: s.appFolder,
        crossover: s.crossover,
        component: s.component
      },
      { runTool: s.fake.run, applyPatch: s.applyPatch }
    )
    expect(treeState(s.cx.appPath)).toBe(before)
  })

  it('runs codesign and xattr in the specified order', async () => {
    const { s } = await build()
    const cs = s.fake.calls
      .filter((c) => c.tool === '/usr/bin/codesign')
      .map((c) => c.args)
    // the codesign steps run in the partial dir, before the atomic rename
    const cpDest = s.fake.calls[0].args[s.fake.calls[0].args.length - 1]
    const cxRoot = cpDest
    const so = join(cxRoot, 'lib/wine/x86_64-unix/lsteamclient.so')
    const loader = join(cxRoot, 'lib/wine/x86_64-unix/wine')
    expect(cs[0]).toEqual(['--remove-signature', so].map((a) => a))
    expect(cs[1]).toEqual(['-dv', so])
    expect(cs[2]).toEqual(['-d', '--entitlements', '-', '--xml', loader])
    expect(cs[3].slice(0, 5)).toEqual([
      '--force',
      '--sign',
      '-',
      '--options',
      'runtime'
    ])
    expect(cs[3][5]).toBe('--entitlements')
    expect(cs[3][7]).toBe(loader)
    expect(cs[4]).toEqual(['-d', '--entitlements', '-', '--xml', loader])
    const xr = s.fake.calls
      .filter((c) => c.tool === '/usr/bin/xattr' && c.args[0] === '-r')
      .map((c) => c.args.slice(0, 3))
    expect(xr).toEqual([
      ['-r', '-d', 'com.apple.quarantine'],
      ['-r', '-d', 'com.apple.provenance']
    ])
    expect(existsSync(cs[3][6])).toBe(false)
  })

  it('the entitlements plist holds the five stock keys plus dyld', async () => {
    const s = setup()
    let plistText = ''
    const run: RunTool = async (tool, args, opts) => {
      if (tool === '/usr/bin/codesign' && args[0] === '--force') {
        plistText = readFileSync(args[6], 'utf8')
      }
      return s.fake.run(tool, args, opts)
    }
    await ensureRunnerClone(
      {
        appFolder: s.appFolder,
        crossover: s.crossover,
        component: s.component
      },
      { runTool: run, applyPatch: s.applyPatch }
    )
    const keys = [...plistText.matchAll(/<key>([^<]+)<\/key>/g)].map(
      (m) => m[1]
    )
    expect(keys.sort()).toEqual(
      [...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT].sort()
    )
    expect(plistText).not.toContain('<false/>')
  })

  it('fails runner-clone when a quarantine xattr remains', async () => {
    const { res } = await build({ quarantine: true })
    expect(res).toMatchObject({ status: 'error', step: 'runner-clone' })
  })

  it('falls back to cp -R when the clone cp fails', async () => {
    const { s, res } = await build({ cpFails: 1 })
    expect(res).toMatchObject({ status: 'ok', cloneMethod: 'cp -R' })
    const cps = s.fake.calls.filter((c) => c.tool === '/bin/cp')
    expect(cps).toHaveLength(2)
    expect(cps[1].args.slice(0, CLONE_ARGV_FALLBACK.length)).toEqual([
      ...CLONE_ARGV_FALLBACK
    ])
  })

  it('returns runner-clone and leaves nothing when both cps fail', async () => {
    const { s, res } = await build({ cpFails: 2 })
    expect(res).toMatchObject({ status: 'error', step: 'runner-clone' })
    expect(existsSync(s.paths.runnerDir(BUILD)!)).toBe(false)
    expect(readdirSync(s.paths.runnersRoot)).toEqual([])
  })

  it('restores the wine.inf mtime when cp did not keep it', async () => {
    const { s, res } = await build({ preserveTimestamps: false })
    expect(res.status).toBe('ok')
    const inf = join(s.paths.runnerAppPath(BUILD)!, 'share/wine/wine.inf')
    expect(Math.floor(statSync(inf).mtimeMs / 1000)).toBe(WINE_INF_MTIME)
  })

  it('maps a refused patch to runner-patch and leaves nothing', async () => {
    const { s, res } = await build(undefined, {
      applyPatch: () => ({ status: 'refused', reason: 'stolen bytes differ' })
    })
    expect(res).toMatchObject({ status: 'error', step: 'runner-patch' })
    expect((res as { cause: string }).cause).toContain('stolen bytes differ')
    expect(existsSync(s.paths.runnerDir(BUILD)!)).toBe(false)
    expect(readdirSync(s.paths.runnersRoot)).toEqual([])
  })

  it('rejects patched bytes that miss the pinned sha', async () => {
    const { res } = await build(undefined, {
      applyPatch: () => ({ status: 'patched', bytes: Buffer.from('other') })
    })
    expect(res).toMatchObject({ status: 'error', step: 'runner-patch' })
  })

  const patchFailures: Array<[string, FakeOpts]> = [
    [
      'a loader missing disable-library-validation',
      { stockKeys: STOCK_LOADER_ENTITLEMENTS.slice(0, 2) }
    ],
    ['a codesign --force failure', { forceExit: 1 }],
    ['a post-sign dump without dyld', { skipDyld: true }],
    ['a signed lsteamclient.so', { soSigned: true }]
  ]
  it.each(patchFailures)('maps %s to runner-patch', async (_n, o) => {
    const { s, res } = await build(o)
    expect(res).toMatchObject({ status: 'error', step: 'runner-patch' })
    expect(existsSync(s.paths.runnerDir(BUILD)!)).toBe(false)
  })

  it('maps an unparseable entitlements dump to runner-patch', async () => {
    const s = setup()
    const run: RunTool = async (tool, args, opts) =>
      tool === '/usr/bin/codesign' && args[0] === '-d'
        ? {
            code: 0,
            stdout: 'garbage',
            stderr: '',
            timedOut: false,
            aborted: false
          }
        : s.fake.run(tool, args, opts)
    const res = await ensureRunnerClone(
      {
        appFolder: s.appFolder,
        crossover: s.crossover,
        component: s.component
      },
      { runTool: run, applyPatch: s.applyPatch }
    )
    expect(res).toMatchObject({ status: 'error', step: 'runner-patch' })
  })

  it('rejects a symlinked or missing component file', async () => {
    const s = setup()
    const so = s.component.files.lsteamclientSo
    rmSync(so)
    symlinkSync(s.component.files.lsteamclientDll, so)
    let res = await ensureRunnerClone(
      {
        appFolder: s.appFolder,
        crossover: s.crossover,
        component: s.component
      },
      { runTool: s.fake.run, applyPatch: s.applyPatch }
    )
    expect(res).toMatchObject({ status: 'error', step: 'runner-patch' })
    rmSync(so)
    res = await ensureRunnerClone(
      {
        appFolder: s.appFolder,
        crossover: s.crossover,
        component: s.component
      },
      { runTool: s.fake.run, applyPatch: s.applyPatch }
    )
    expect(res).toMatchObject({ status: 'error', step: 'runner-patch' })
    expect(existsSync(s.paths.runnerDir(BUILD)!)).toBe(false)
  })

  it('reports a timed-out cp', async () => {
    const { res } = await build({ cpTimeout: true })
    expect(res).toMatchObject({ status: 'error', step: 'runner-clone' })
    expect((res as { cause: string }).cause).toContain('timed out')
  })

  it('never rejects on an invalid appFolder', async () => {
    const s = setup()
    await expect(
      ensureRunnerClone(
        {
          appFolder: 'relative',
          crossover: s.crossover,
          component: s.component
        },
        { runTool: s.fake.run }
      )
    ).resolves.toMatchObject({ status: 'error', step: 'runner-clone' })
  })
})

// ---------------------------------------------------------------------------
// Task 3
// ---------------------------------------------------------------------------

describe('verify, rebuild, prune, abort', () => {
  async function ready(o: FakeOpts = {}) {
    const s = setup(o)
    const call = (deps: object = {}) =>
      ensureRunnerClone(
        {
          appFolder: s.appFolder,
          crossover: s.crossover,
          component: s.component
        },
        { runTool: s.fake.run, applyPatch: s.applyPatch, ...deps }
      )
    const first = await call()
    expect(first.status).toBe('ok')
    s.fake.calls.length = 0
    return {
      s,
      call,
      runnerDir: s.paths.runnerDir(BUILD)!,
      cx: s.paths.runnerAppPath(BUILD)!
    }
  }
  const expectV = (s: ReturnType<typeof setup>, runnerDir: string) =>
    verifyRunnerClone(
      runnerDir,
      { crossover: s.crossover, component: s.component },
      s.fake.run
    )

  it('verify is ok on a fresh build and spawns one entitlements dump', async () => {
    const { s, runnerDir } = await ready()
    expect(await expectV(s, runnerDir)).toEqual({ ok: true })
    expect(s.fake.calls).toHaveLength(1)
    expect(s.fake.calls[0].tool).toBe('/usr/bin/codesign')
  })

  it('serves an intact clone from the cache without cp, xattr or signing', async () => {
    const { s, call } = await ready()
    const onCloneStart = jest.fn()
    const res = await call({ onCloneStart })
    expect(res).toMatchObject({ status: 'ok', source: 'cache' })
    expect(onCloneStart).not.toHaveBeenCalled()
    expect(
      s.fake.calls.some(
        (c) =>
          c.tool === '/bin/cp' ||
          c.tool === '/usr/bin/xattr' ||
          (c.tool === '/usr/bin/codesign' && c.args[0] === '--force')
      )
    ).toBe(false)
  })

  it('rebuilds a tampered ntdll when nothing runs from it', async () => {
    const { s, call, cx } = await ready()
    const ntdll = join(cx, 'lib/wine/x86_64-windows/ntdll.dll')
    writeFileSync(ntdll, Buffer.concat([FAKE_PATCHED, Buffer.from('x')]))
    const v = await expectV(s, s.paths.runnerDir(BUILD)!)
    expect(v.ok).toBe(false)
    expect((v as { reason: string }).reason).toContain('ntdll')
    s.fake.calls.length = 0
    const res = await call()
    expect(res).toMatchObject({ status: 'ok', source: 'clone' })
    expect(s.fake.calls.filter((c) => c.tool === '/bin/cp')).toHaveLength(1)
  })

  it('names lsteamclient.so when it is missing, then rebuilds', async () => {
    const { s, call, cx } = await ready()
    rmSync(join(cx, 'lib/wine/x86_64-unix/lsteamclient.so'))
    const v = await expectV(s, s.paths.runnerDir(BUILD)!)
    expect((v as { reason: string }).reason).toContain('lsteamclient.so')
    expect(await call()).toMatchObject({ status: 'ok', source: 'clone' })
  })

  it('rebuilds when the component dll changed', async () => {
    const { s, call } = await ready()
    writeFileSync(s.component.files.lsteamclientDll, 'new-dll')
    const v = await expectV(s, s.paths.runnerDir(BUILD)!)
    expect((v as { reason: string }).reason).toContain('lsteamclient.dll')
    expect(await call()).toMatchObject({ status: 'ok', source: 'clone' })
  })

  describe('verify failures each carry a distinct reason', () => {
    const mutations: Array<
      [
        string,
        (cx: string, runnerDir: string, s: ReturnType<typeof setup>) => void
      ]
    > = [
      [
        'corrupt marker',
        (_c, d) => writeFileSync(join(d, RUNNER_MARKER_FILE), '{nope')
      ],
      [
        'marker component id',
        (_c, d) => {
          const p = join(d, RUNNER_MARKER_FILE)
          const m = JSON.parse(readFileSync(p, 'utf8'))
          m.componentId = 'steamclient-layer-cx1.2.3'
          writeFileSync(p, JSON.stringify(m))
        }
      ],
      [
        'orig ntdll',
        (c) =>
          writeFileSync(
            join(c, 'lib/wine/x86_64-windows/ntdll.dll.gamelib-orig'),
            'zz'
          )
      ],
      [
        'loader',
        (c) =>
          writeFileSync(join(c, 'lib/wine/x86_64-unix/wine'), 'zz', {
            mode: 0o755
          })
      ],
      [
        'bin symlink',
        (c) => {
          rmSync(join(c, 'bin'))
          symlinkSync('elsewhere', join(c, 'bin'))
        }
      ],
      [
        'wine.inf mtime',
        (_c, _d, s) =>
          utimesSync(
            join(s.cx.cxRoot, 'share/wine/wine.inf'),
            1700000000,
            1700000000
          )
      ]
    ]
    it.each(mutations)('%s', async (_n, mutate) => {
      const { s, runnerDir, cx } = await ready()
      mutate(cx, runnerDir, s)
      const v = await expectV(s, runnerDir)
      expect(v.ok).toBe(false)
      expect((v as { reason: string }).reason.length).toBeGreaterThan(0)
    })

    it('missing dyld entitlement', async () => {
      const { s, runnerDir } = await ready()
      const run: RunTool = async () => ({
        code: 0,
        stdout: entXml([...STOCK_LOADER_ENTITLEMENTS]),
        stderr: '',
        timedOut: false,
        aborted: false
      })
      const v = await verifyRunnerClone(
        runnerDir,
        { crossover: s.crossover, component: s.component },
        run
      )
      expect((v as { reason: string }).reason).toContain('entitlement')
    })

    it('symlinked runnerDir', async () => {
      const { s, runnerDir } = await ready()
      const moved = runnerDir + '-real'
      await fsp.rename(runnerDir, moved)
      symlinkSync(moved, runnerDir)
      expect((await expectV(s, runnerDir)).ok).toBe(false)
    })
  })

  const psUse = (s: ReturnType<typeof setup>, name = 'crossover-' + BUILD) => ({
    stdout: `${join(s.paths.runnersRoot, name)}/CrossOver/CrossOver-Hosted Application/wineserver -p0\n`
  })

  it('refuses to replace a tampered clone that is in use', async () => {
    const o: FakeOpts = {}
    const { s, call, cx } = await ready(o)
    const ntdll = join(cx, 'lib/wine/x86_64-windows/ntdll.dll')
    writeFileSync(ntdll, 'tampered')
    o.ps = () => psUse(s)
    s.fake.calls.length = 0
    const res = await call()
    expect(res).toMatchObject({ status: 'error', step: 'runner-clone' })
    expect((res as { cause: string }).cause).toContain('in use')
    expect(readFileSync(ntdll, 'utf8')).toBe('tampered')
    expect(s.fake.calls.some((c) => c.tool === '/bin/cp')).toBe(false)
  })

  it.each([
    ['ps exiting 1', { code: 1 }],
    ['ps timing out', { code: null, timedOut: true }]
  ])('counts %s as in use', async (_n, psResult) => {
    const o: FakeOpts = {}
    const { call, cx } = await ready(o)
    writeFileSync(join(cx, 'lib/wine/x86_64-windows/ntdll.dll'), 'tampered')
    o.ps = () => psResult
    expect(await call()).toMatchObject({
      status: 'error',
      step: 'runner-clone'
    })
  })

  function seedStale(s: ReturnType<typeof setup>) {
    const root = s.paths.runnersRoot
    mkdirSync(join(root, 'crossover-25.1.0.1', 'CrossOver'), {
      recursive: true
    })
    writeFileSync(join(root, 'crossover-25.1.0.1', 'CrossOver', 'x'), 'x')
    mkdirSync(join(root, '.crossover-26.3.0.39832.partial-abc123'))
    return root
  }

  it('prunes stale clones and partial dirs when unused', async () => {
    const o: FakeOpts = {}
    const { s, call } = await ready(o)
    const root = seedStale(s)
    const res = await call()
    expect(res).toMatchObject({ status: 'ok', source: 'cache' })
    expect((res as { pruned: string[] }).pruned.sort()).toEqual(
      ['.crossover-26.3.0.39832.partial-abc123', 'crossover-25.1.0.1'].sort()
    )
    expect(existsSync(join(root, 'crossover-25.1.0.1'))).toBe(false)
  })

  it('keeps an in-use stale clone and still returns ok', async () => {
    const o: FakeOpts = {}
    const { s, call } = await ready(o)
    const root = seedStale(s)
    o.ps = () => psUse(s, 'crossover-25.1.0.1')
    const res = await call()
    expect(res.status).toBe('ok')
    expect((res as { pruneSkipped: string[] }).pruneSkipped).toContain(
      'crossover-25.1.0.1'
    )
    expect(existsSync(join(root, 'crossover-25.1.0.1'))).toBe(true)
  })

  it('never touches unrelated names or a symlink leading outside the root', async () => {
    const { s, call } = await ready()
    const root = s.paths.runnersRoot
    writeFileSync(join(root, 'notes.txt'), 'n')
    mkdirSync(join(root, 'crossover-x'))
    const outside = tmp('outside')
    writeFileSync(join(outside, 'keep'), 'k')
    symlinkSync(outside, join(root, 'crossover-24.0.0.1'))
    const res = await call()
    expect(res.status).toBe('ok')
    expect(existsSync(join(root, 'notes.txt'))).toBe(true)
    expect(existsSync(join(root, 'crossover-x'))).toBe(true)
    expect(existsSync(join(outside, 'keep'))).toBe(true)
  })

  it('skips ps entirely when nothing is stale', async () => {
    const { s, call } = await ready()
    await call()
    expect(s.fake.calls.some((c) => c.tool === '/bin/ps')).toBe(false)
  })

  it('aborts the clone through the abort controller and leaves no partial dir', async () => {
    const s = setup({ cpWaitsForSignal: true })
    const p = ensureRunnerClone(
      {
        appFolder: s.appFolder,
        crossover: s.crossover,
        component: s.component
      },
      { runTool: s.fake.run, applyPatch: s.applyPatch }
    )
    await new Promise((r) => setTimeout(r, 100))
    callAbortController('drm-runner-clone:' + BUILD)
    const res = await p
    expect(res).toMatchObject({ status: 'error', step: 'runner-clone' })
    expect((res as { cause: string }).cause).toContain('aborted')
    expect(readdirSync(s.paths.runnersRoot)).toEqual([])
  })

  it('shares one build between concurrent calls', async () => {
    const s = setup()
    const args = {
      appFolder: s.appFolder,
      crossover: s.crossover,
      component: s.component
    }
    const deps = { runTool: s.fake.run, applyPatch: s.applyPatch }
    const [a, b] = await Promise.all([
      ensureRunnerClone(args, deps),
      ensureRunnerClone(args, deps)
    ])
    expect(a.status).toBe('ok')
    expect(b.status).toBe('ok')
    expect(s.fake.calls.filter((c) => c.tool === '/bin/cp')).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// Opt-in real CrossOver arm. It clones the real CrossOver (about 929 MB, an
// APFS clone on the same volume) into a tmp dir. It is not part of CI; the
// executor runs it once with GAMELIB_DRM_REAL_RUNNER=1 and records the result.
// ---------------------------------------------------------------------------

const REAL_CX = '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver'
const REPO = resolve(__dirname, '..', '..', '..', '..', '..', '..', '..')
const LAYER = join(
  REPO,
  'build',
  'steamclient-layer',
  'steamclient-layer-cx' + BUILD
)
const realInputs = [
  join(REAL_CX, 'lib/wine/x86_64-windows/ntdll.dll'),
  join(LAYER, 'lsteamclient.dll'),
  join(LAYER, 'lsteamclient.so'),
  join(LAYER, `detour-cx${BUILD}.bin`)
]
const realOn =
  process.env.GAMELIB_DRM_REAL_RUNNER === '1' && realInputs.every(existsSync)

;(realOn ? describe : describe.skip)('real CrossOver runner clone', () => {
  jest.setTimeout(900_000)
  it('clones, patches, re-signs and leaves the installed CrossOver untouched', async () => {
    const root = tmp('gl app real')
    const marker = join(root, 'before.marker')
    writeFileSync(marker, 'm')
    await new Promise((r) => setTimeout(r, 1100))
    const installedBefore = sha(readFileSync(realInputs[0]))
    const found = await detectAllowedCrossover()
    expect(found.status).toBe('ok')
    if (found.status !== 'ok') return
    const component: RunnerComponentInput = {
      componentId: 'steamclient-layer-cx' + BUILD,
      files: {
        lsteamclientDll: realInputs[1],
        lsteamclientSo: realInputs[2],
        detourPayload: realInputs[3]
      }
    }
    const t0 = Date.now()
    const res = await ensureRunnerClone(
      { appFolder: root, crossover: found, component },
      {}
    )
    console.log(
      'real runner arm',
      JSON.stringify({
        ms: Date.now() - t0,
        status: res.status,
        cloneMethod: (res as { cloneMethod?: string }).cloneMethod,
        provenanceRemaining: (res as { provenanceRemaining?: boolean })
          .provenanceRemaining
      })
    )
    expect(res.status).toBe('ok')
    if (res.status !== 'ok') return
    expect(sha(readFileSync(join(res.windowsDllDir, 'ntdll.dll')))).toBe(
      'c0e21a9a5250f0a97c08d3c3e1798566255387213e2553b1e555264fb9ded97e'
    )
    const profile = createFakeHomeProfile()
    try {
      const env = profile.childEnv()
      const ent = childProcess.spawnSync(
        '/usr/bin/codesign',
        ['-d', '--entitlements', '-', '--xml', join(res.unixDllDir, 'wine')],
        { env, encoding: 'utf8' }
      )
      expect(ent.stdout).toContain(DYLD_ENTITLEMENT)
      const dv = childProcess.spawnSync(
        '/usr/bin/codesign',
        ['-dv', join(res.unixDllDir, 'lsteamclient.so')],
        { env, encoding: 'utf8' }
      )
      expect(dv.stderr).toContain('not signed')
      const newer = childProcess.spawnSync(
        '/usr/bin/find',
        ['/Applications/CrossOver.app', '-newer', marker, '-print', '-quit'],
        { env, encoding: 'utf8' }
      )
      expect(newer.stdout.trim()).toBe('')
    } finally {
      profile.dispose()
    }
    expect(sha(readFileSync(realInputs[0]))).toBe(installedBefore)
    const again = await ensureRunnerClone(
      { appFolder: root, crossover: found, component },
      {}
    )
    expect(again).toMatchObject({ status: 'ok', source: 'cache' })
  })
})
