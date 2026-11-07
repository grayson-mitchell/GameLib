/**
 * Phase 60 plan 05: overlayRunnerClone.ts (D-04, D-06, D-08).
 *
 * Synthetic CrossOver trees in mkdtemp dirs whose names contain a space, with
 * a faked RunTool (no real spawns).
 */
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
  promises as fsp
} from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

jest.mock('backend/logger', () => ({
  logWarning: jest.fn(),
  logInfo: jest.fn(),
  logDebug: jest.fn(),
  logError: jest.fn(),
  LogPrefix: { Backend: 'Backend', Steam: 'Steam' }
}))

import { RUNNER_MARKER_FILE } from '../../drm/runnerVerify'
import {
  DYLD_ENTITLEMENT,
  STOCK_LOADER_ENTITLEMENTS
} from '../../drm/runnerEntitlements'
import type { RunTool, RunToolResult } from 'backend/engine/runTool'
import {
  OVERLAY_MARKER_SCHEMA,
  detectCrossoverForOverlay,
  ensureOverlayRunnerClone,
  type OverlayCrossover
} from '../overlayRunnerClone'
import { buildOverlayPaths } from '../overlayPaths'

const sha = (b: Buffer | string) => createHash('sha256').update(b).digest('hex')
const BUILD = '26.3.0.39832'

const tmps: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'gl app-'))
  tmps.push(d)
  return d
}
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true })
})

function makeCx(root: string) {
  const appPath = join(root, 'Cross Over.app')
  const cxRoot = join(appPath, 'Contents', 'SharedSupport', 'CrossOver')
  const hosted = join(cxRoot, 'CrossOver-Hosted Application')
  mkdirSync(hosted, { recursive: true })
  for (const f of ['wine', 'wineloader', 'wineserver']) {
    writeFileSync(join(hosted, f), '#!/bin/sh\nstock-' + f, { mode: 0o755 })
  }
  symlinkSync('CrossOver-Hosted Application', join(cxRoot, 'bin'))
  mkdirSync(join(cxRoot, 'lib/wine/x86_64-windows'), { recursive: true })
  mkdirSync(join(cxRoot, 'lib/wine/x86_64-unix'), { recursive: true })
  writeFileSync(join(cxRoot, 'lib/wine/x86_64-windows/ntdll.dll'), 'ntdll')
  writeFileSync(join(cxRoot, 'lib/wine/x86_64-unix/wine'), 'stock-loader', {
    mode: 0o755
  })
  writeFileSync(join(appPath, 'Contents', 'Info.plist'), '<plist/>')
  return { appPath, cxRoot, binDir: join(cxRoot, 'bin') }
}

const entXml = (keys: string[]) =>
  '<?xml version="1.0"?><plist version="1.0"><dict>' +
  keys.map((k) => `<key>${k}</key><true/>`).join('') +
  '</dict></plist>'

type FakeOpts = {
  cpFails?: boolean
  forceExitFor?: string
  stockKeys?: string[]
  nonTrueDump?: boolean
  inUse?: string
  plutil?: string | RunToolResult
}

function fakeRun(o: FakeOpts = {}) {
  const calls: Array<{ tool: string; args: readonly string[] }> = []
  const signed = new Map<string, string[]>()
  const base: RunToolResult = {
    code: 0,
    stdout: '',
    stderr: '',
    timedOut: false,
    aborted: false
  }
  const rel = (p: string) => p.slice(p.lastIndexOf('/CrossOver/'))
  const run: RunTool = async (tool, args) => {
    calls.push({ tool, args })
    if (tool === '/bin/cp') {
      if (o.cpFails) return { ...base, code: 1, stderr: 'no clonefile' }
      await fsp.cp(args[args.length - 2], args[args.length - 1], {
        recursive: true,
        verbatimSymlinks: true
      })
      return base
    }
    if (tool === '/usr/bin/plutil') {
      if (o.plutil && typeof o.plutil !== 'string') return o.plutil
      return { ...base, stdout: (o.plutil ?? BUILD) + '\n' }
    }
    if (tool === '/usr/bin/codesign') {
      const target = args[args.length - 1]
      if (args[0] === '-d') {
        if (o.nonTrueDump) {
          return {
            ...base,
            stdout: '<plist><dict><key>a</key><string>x</string></dict></plist>'
          }
        }
        return {
          ...base,
          stdout: entXml(
            signed.get(rel(target)) ??
              o.stockKeys ?? [...STOCK_LOADER_ENTITLEMENTS]
          )
        }
      }
      if (args[0] === '--force') {
        if (o.forceExitFor && target.endsWith(o.forceExitFor)) {
          return { ...base, code: 1, stderr: 'sign failed' }
        }
        const plist = readFileSync(
          args[args.indexOf('--entitlements') + 1],
          'utf8'
        )
        const keys = [...plist.matchAll(/<key>([^<]+)<\/key>/g)].map(
          (m) => m[1]
        )
        signed.set(rel(target), keys)
        // re-signing changes the binary
        await fsp.appendFile(target, '\nsigned')
        return base
      }
    }
    if (tool === '/usr/bin/xattr') return base
    if (tool === '/bin/ps') return { ...base, stdout: o.inUse ?? '' }
    return base
  }
  return { run, calls, signed }
}

function setup(o: FakeOpts = {}) {
  const root = tmp()
  const cx = makeCx(root)
  const appFolder = join(root, 'app folder')
  mkdirSync(appFolder)
  const crossover: OverlayCrossover = { ...cx, crossoverBuild: BUILD }
  return {
    root,
    cx,
    appFolder,
    crossover,
    fake: fakeRun(o),
    paths: buildOverlayPaths(appFolder)!
  }
}

describe('detectCrossoverForOverlay', () => {
  async function detect(over: {
    platform?: NodeJS.Platform
    binDir?: (b: string) => string | undefined
    plutil?: string | RunToolResult
    appFolder?: (root: string) => string
  }) {
    const s = setup({ plutil: over.plutil })
    const binDir = over.binDir ? over.binDir(s.cx.binDir) : s.cx.binDir
    return {
      s,
      r: await detectCrossoverForOverlay(
        {
          appFolder: over.appFolder ? over.appFolder(s.root) : s.appFolder,
          crossoverBinDir: binDir
        },
        { runTool: s.fake.run, platform: over.platform ?? 'darwin' }
      )
    }
  }

  it('fails on linux with step crossover-detect', async () => {
    const { r } = await detect({ platform: 'linux' })
    expect(r).toMatchObject({ status: 'error', step: 'crossover-detect' })
  })

  it('fails on a binDir outside a CrossOver bundle', async () => {
    const { r } = await detect({ binDir: () => '/opt/wine/bin' })
    expect(r).toMatchObject({ status: 'error', step: 'crossover-detect' })
  })

  it('fails when the CrossOver root sits inside the overlay runners root', async () => {
    const root = tmp()
    const appFolder = join(root, 'app folder')
    const paths = buildOverlayPaths(appFolder)!
    const inner = join(
      paths.runnersRoot,
      'crossover-1.2.3',
      'x.app',
      'Contents',
      'SharedSupport',
      'CrossOver',
      'bin'
    )
    const r = await detectCrossoverForOverlay(
      { appFolder, crossoverBinDir: inner },
      { platform: 'darwin' }
    )
    expect(r).toMatchObject({ status: 'error', step: 'crossover-detect' })
  })

  it('accepts a version no DRM allowlist knows (D-06)', async () => {
    const { r } = await detect({ plutil: '99.9.9.1' })
    expect(r).toMatchObject({
      status: 'ok',
      crossover: { crossoverBuild: '99.9.9.1' }
    })
  })

  it('fails when CFBundleVersion is unreadable', async () => {
    const { r } = await detect({
      plutil: {
        code: 1,
        stdout: '',
        stderr: '',
        timedOut: false,
        aborted: false
      }
    })
    expect(r).toMatchObject({ status: 'error', step: 'crossover-detect' })
  })
})

describe('ensureOverlayRunnerClone', () => {
  it('builds an unpatched clone with both loaders re-signed and a marker', async () => {
    const s = setup()
    const r = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(r.status).toBe('ok')
    if (r.status !== 'ok') return
    expect(r.runner.source).toBe('clone')
    expect(r.runner.runnerDir).toBe(s.paths.runnerDir(BUILD))
    expect(r.runner.runnerDir.startsWith(s.paths.runnersRoot)).toBe(true)
    expect(r.runner.wrapperBin).toBe(join(r.runner.cxRoot, 'bin', 'wine'))

    const signs = s.fake.calls.filter(
      (c) => c.tool === '/usr/bin/codesign' && c.args[0] === '--force'
    )
    expect(signs).toHaveLength(2)
    for (const c of signs) {
      expect(c.args.slice(0, 6)).toEqual([
        '--force',
        '--sign',
        '-',
        '--options',
        'runtime',
        '--entitlements'
      ])
    }
    const cloneRoot = join(r.runner.runnerDir, 'CrossOver')
    for (const rel of ['lib/wine/x86_64-unix/wine', 'bin/wineloader']) {
      const keys = s.fake.signed.get('/CrossOver/' + rel)!
      expect(keys).toEqual(
        expect.arrayContaining([...STOCK_LOADER_ENTITLEMENTS, DYLD_ENTITLEMENT])
      )
    }
    expect(
      readFileSync(join(cloneRoot, 'lib/wine/x86_64-windows/ntdll.dll'), 'utf8')
    ).toBe('ntdll')
    expect(
      readdirSync(join(cloneRoot, 'lib/wine/x86_64-windows')).filter((n) =>
        n.includes('steamclient')
      )
    ).toEqual([])

    const marker = JSON.parse(
      readFileSync(join(r.runner.runnerDir, RUNNER_MARKER_FILE), 'utf8')
    )
    expect(marker.schema).toBe(OVERLAY_MARKER_SCHEMA)
    expect(marker.crossoverBuild).toBe(BUILD)
    expect(marker.wineLoaderSha256).toBe(
      sha(readFileSync(join(cloneRoot, 'lib/wine/x86_64-unix/wine')))
    )
    expect(marker.wineloaderSha256).toBe(
      sha(readFileSync(join(cloneRoot, 'bin/wineloader')))
    )
    expect(marker.sourceWineLoaderSha256).toBe(sha('stock-loader'))
    expect(marker.sourceWineloaderSha256).toBe(
      sha('#!/bin/sh\nstock-wineloader')
    )
    expect(statSync(s.paths.runnersRoot).mode & 0o777).toBe(0o700)
    expect(
      readdirSync(s.paths.runnersRoot).some((n) => n.startsWith('.'))
    ).toBe(false)
  })

  it('derives entitlements from a non-standard stock set', async () => {
    const s = setup({ stockKeys: ['com.apple.security.cs.debugger'] })
    const r = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(r.status).toBe('ok')
    expect(s.fake.signed.get('/CrossOver/bin/wineloader')?.sort()).toEqual(
      [DYLD_ENTITLEMENT, 'com.apple.security.cs.debugger'].sort()
    )
  })

  it('returns the cache with no cp or codesign --force on an unchanged tree', async () => {
    const s = setup()
    const first = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(first.status).toBe('ok')
    s.fake.calls.length = 0
    const second = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(second).toMatchObject({ status: 'ok', runner: { source: 'cache' } })
    expect(s.fake.calls.some((c) => c.tool === '/bin/cp')).toBe(false)
    expect(
      s.fake.calls.some(
        (c) => c.tool === '/usr/bin/codesign' && c.args[0] === '--force'
      )
    ).toBe(false)
  })

  it('re-clones when the installed wineloader changed in place', async () => {
    const s = setup()
    await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    writeFileSync(
      join(s.cx.cxRoot, 'bin', 'wineloader'),
      '#!/bin/sh\nreinstalled'
    )
    s.fake.calls.length = 0
    const r = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(r).toMatchObject({ status: 'ok', runner: { source: 'clone' } })
    expect(s.fake.calls.some((c) => c.tool === '/bin/cp')).toBe(true)
  })

  it('refuses to replace a stale clone while it is in use', async () => {
    const s = setup()
    await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    writeFileSync(join(s.cx.cxRoot, 'bin', 'wineloader'), 'changed')
    const busy = fakeRun({
      inUse: s.paths.runnerDir(BUILD) + '/CrossOver/bin/wine'
    })
    const r = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: busy.run }
    )
    expect(r.status).toBe('error')
    if (r.status === 'error') {
      expect(r.step).toBe('clone')
      expect(r.cause).toContain('quit the game and retry')
    }
    expect(busy.calls.some((c) => c.tool === '/bin/cp')).toBe(false)
  })

  it('prunes a stale build but never touches the DRM runners root', async () => {
    const s = setup()
    const stale = join(s.paths.runnersRoot, 'crossover-1.2.3.4')
    mkdirSync(stale, { recursive: true })
    const drm = join(
      s.appFolder,
      'steam-bridge',
      'drm',
      'runners',
      'crossover-9.9.9'
    )
    mkdirSync(drm, { recursive: true })
    const r = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(r.status).toBe('ok')
    expect(existsSync(stale)).toBe(false)
    expect(existsSync(drm)).toBe(true)
  })

  it('keeps a stale build that is in use', async () => {
    const s = setup()
    const stale = join(s.paths.runnersRoot, 'crossover-1.2.3.4')
    mkdirSync(stale, { recursive: true })
    const busy = fakeRun({ inUse: stale + '/CrossOver/bin/wine' })
    const r = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: busy.run }
    )
    expect(r.status).toBe('ok')
    expect(existsSync(stale)).toBe(true)
  })

  it('makes a new runner dir for a different build', async () => {
    const s = setup()
    await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    const r = await ensureOverlayRunnerClone(
      {
        appFolder: s.appFolder,
        crossover: { ...s.crossover, crossoverBuild: '27.0.0.1' }
      },
      { runTool: s.fake.run }
    )
    expect(r.status).toBe('ok')
    expect(existsSync(s.paths.runnerDir('27.0.0.1')!)).toBe(true)
    expect(existsSync(s.paths.runnerDir(BUILD)!)).toBe(false)
  })

  it('reports clone failure and leaves no partial dir', async () => {
    const s = setup({ cpFails: true })
    const r = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(r).toMatchObject({ status: 'error', step: 'clone' })
    expect(readdirSync(s.paths.runnersRoot)).toEqual([])
  })

  it.each(['/lib/wine/x86_64-unix/wine', '/bin/wineloader'])(
    'reports resign failure for %s and removes the partial',
    async (suffix) => {
      const s = setup({ forceExitFor: suffix })
      const r = await ensureOverlayRunnerClone(
        { appFolder: s.appFolder, crossover: s.crossover },
        { runTool: s.fake.run }
      )
      expect(r).toMatchObject({ status: 'error', step: 'resign' })
      expect(readdirSync(s.paths.runnersRoot)).toEqual([])
    }
  )

  it('reports resign failure for a non-true entitlement value', async () => {
    const s = setup({ nonTrueDump: true })
    const r = await ensureOverlayRunnerClone(
      { appFolder: s.appFolder, crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(r).toMatchObject({ status: 'error', step: 'resign' })
    expect(readdirSync(s.paths.runnersRoot)).toEqual([])
  })

  it('shares one in-flight build between concurrent calls', async () => {
    const s = setup()
    const args = { appFolder: s.appFolder, crossover: s.crossover }
    const [a, b] = await Promise.all([
      ensureOverlayRunnerClone(args, { runTool: s.fake.run }),
      ensureOverlayRunnerClone(args, { runTool: s.fake.run })
    ])
    expect(a.status).toBe('ok')
    expect(b.status).toBe('ok')
    expect(s.fake.calls.filter((c) => c.tool === '/bin/cp')).toHaveLength(1)
  })

  it('resolves with a clone error for an invalid app folder', async () => {
    const s = setup()
    const r = await ensureOverlayRunnerClone(
      { appFolder: 'relative', crossover: s.crossover },
      { runTool: s.fake.run }
    )
    expect(r).toMatchObject({ status: 'error', step: 'clone' })
  })
})
