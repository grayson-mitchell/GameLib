/**
 * The DXVK-family oracle (87-09, D-08): `DXVK.installRemove` for DXVK, dxvk-nvapi, vkd3d and
 * the macOS DXVK (`dxvk-macOS`), install (`backup`) and remove (`restore`), on fake-HOME prefixes and
 * bottles, with the GitHub release lookups per tool and platform, the multi-step wine commands, the
 * `current_<tool>` markers and the download-failure dialog, recorded as goldens the Rust
 * `gamelib-wine` tools slice later has to reproduce. Winetricks is 87-10; DXMT is `dxmt.oracle.test.ts`.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts and recorder.ts):
 *   GAMELIB_ENGINE_ORACLE=record     fetch the live feeds (the cases flagged `live`) and write
 *                                    recorded/dxvk/<case>/; every other case is synthetic
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    replay the recordings and rewrite golden/dxvk/expected/
 *   (default)                        replay and compare, offline
 *
 * What is recorded per case: the result (the boolean installRemove resolved with, or the message it
 * rejected with), every log line the tools wrote (the evidence lines the live gates cite), the events
 * sent to the renderer (the download-failure `showDialog`), the requests (with their headers, in
 * recorded/), the profile tree after the run, and the process trace: the spawns (the vulkan-helper
 * probes and the real `tar`) followed by each `runWineCommand` the tools issued, with the
 * `reg import` file's text.
 *
 * Release archives are never downloaded (T-87-13): `downloadFile` is replaced by a stand-in that makes
 * the same `HEAD` and one `GET` through the recorder, and the recorder serves a synthetic tar.gz built
 * here (a minimal ustar writer, so the bytes need no real DXVK, vkd3d or nvapi binary). The tools run
 * for real: `tar` extracts the synthetic archive into the fake profile. `runWineCommand` does not run
 * wine: the case scripts its exit codes. `process.platform` and `process.arch` are pinned, because
 * `installOrUpdateTool` compares the tool's os to `process.platform` and the vulkan-helper path
 * carries both; `tar` calls are serialised so three concurrent installs trace in one order. The
 * backend jest project replaces i18next with a stub that returns the key, so the `showDialog`
 * golden carries `box.error.dxvk.title` and `box.error.dxvk.message`, not their English text.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertLiveRecorded,
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  loadCases,
  mockPlatform,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import {
  installAdapter,
  installRecorder,
  type SyntheticResponse
} from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import {
  buildTarGz,
  captureLog,
  pinProcess,
  waitForTreeToSettle,
  type LogLine
} from 'backend/testUtils/engineWineOracle/toolsOracleSupport'
import { createRealRunner } from 'backend/testUtils/realRunner'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import type { ToolsDeps } from 'backend/tools'
import type { GameSettings, WineInstallation } from 'common/types'

const CRATE = 'gamelib-wine'
const SLICE = 'dxvk'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 38

type ToolKey = 'dxvk' | 'dxvk-nvapi' | 'vkd3d' | 'dxvk-macOS'

interface DxvkCase {
  id: string
  platform: OraclePlatform
  tool: 'dxvk' | 'dxvk-nvapi' | 'vkd3d'
  action: 'backup' | 'restore'
  live?: boolean
  note: string
  seed?: SeedEntry[]
  /** The winePrefix setting. Default `<HOME>/prefix`. */
  prefix?: string
  wineVersion: { name: string; bin: string; type: string }
  /** A Phase 59 GameLib-pinned source. */
  source?: { dir: string; version: string }
  /** The best Vulkan version `vulkan-helper physical-versions` reports. Default 1.3. */
  gpu?: '1.3' | '1.2' | 'none'
  /** Whether `vulkan-helper nvapi-path` finds a directory. */
  nvngx?: boolean
  online?: boolean
  /** The tool whose archive answers 500. */
  fail?: ToolKey
  macBuiltinFirst?: boolean
  wine?: {
    import?: number
    left?: string[]
    boot?: number
    /** Files the first wine process (the reg import) writes, as the prefix update would. */
    restock?: string[]
  }
}

const API = 'https://api.github.com'
const GITHUB = 'https://github.com'

/** The feed URLs `getDxvkUrl`, `getVkd3dUrl` and `getLatest` can ask, with the asset each serves. */
const FEEDS: { path: string; tag: string; asset: string; kind: ToolKey }[] = [
  {
    path: '/repos/doitsujin/dxvk/releases/latest',
    tag: 'v2.9',
    asset: 'dxvk-2.9.tar.gz',
    kind: 'dxvk'
  },
  {
    path: '/repos/doitsujin/dxvk/releases/tags/v1.10.3',
    tag: 'v1.10.3',
    asset: 'dxvk-1.10.3.tar.gz',
    kind: 'dxvk'
  },
  {
    path: '/repos/Heroic-Games-Launcher/vkd3d-proton/releases/latest',
    tag: 'v3.0',
    asset: 'vkd3d-proton-3.0.tar.gz',
    kind: 'vkd3d'
  },
  {
    path: '/repos/Heroic-Games-Launcher/vkd3d-proton/releases/tags/v2.6',
    tag: 'v2.6',
    asset: 'vkd3d-proton-2.6.tar.gz',
    kind: 'vkd3d'
  },
  {
    path: '/repos/jp7677/dxvk-nvapi/releases/latest',
    tag: 'v0.9.1',
    asset: 'dxvk-nvapi-v0.9.1.tar.gz',
    kind: 'dxvk-nvapi'
  },
  {
    path: '/repos/Gcenx/DXVK-macOS/releases/tags/v1.10.3-20230507-repack',
    tag: 'v1.10.3-20230507-repack',
    asset: 'dxvk-macOS-async-v1.10.3-20230507-repack.tar.gz',
    kind: 'dxvk-macOS'
  }
]

/** Where each tool's release archives live, by the repository segment of the download URL. */
const ARCHIVE_ROUTES: { prefix: string; kind: ToolKey }[] = [
  { prefix: '/doitsujin/dxvk/releases/download/', kind: 'dxvk' },
  {
    prefix: '/Heroic-Games-Launcher/vkd3d-proton/releases/download/',
    kind: 'vkd3d'
  },
  { prefix: '/jp7677/dxvk-nvapi/releases/download/', kind: 'dxvk-nvapi' },
  { prefix: '/Gcenx/DXVK-macOS/releases/download/', kind: 'dxvk-macOS' }
]

/** The synthetic archive content per tool: files under `x32`/`x64` (`x86`/`x64` for vkd3d). */
function archiveEntries(kind: ToolKey): { name: string; text: string }[] {
  const layout: Record<
    ToolKey,
    { top: string; dirs: Record<string, string[]> }
  > = {
    dxvk: {
      top: 'dxvk-synthetic/',
      dirs: {
        x32: ['d3d9.dll', 'd3d11.dll', 'dxgi.dll'],
        x64: ['d3d9.dll', 'd3d11.dll', 'dxgi.dll']
      }
    },
    'dxvk-macOS': {
      top: 'dxvk-macOS-synthetic/',
      dirs: {
        x32: ['d3d9.dll', 'd3d11.dll', 'dxgi.dll'],
        x64: ['d3d9.dll', 'd3d11.dll', 'dxgi.dll']
      }
    },
    vkd3d: {
      top: 'vkd3d-proton-synthetic/',
      dirs: {
        x86: ['d3d12.dll', 'd3d12core.dll'],
        x64: ['d3d12.dll', 'd3d12core.dll']
      }
    },
    // strip 0: the archive has no top directory
    'dxvk-nvapi': {
      top: '',
      dirs: { x32: ['nvapi.dll'], x64: ['nvapi64.dll'] }
    }
  }
  const { top, dirs } = layout[kind]
  return Object.entries(dirs).flatMap(([dir, files]) =>
    files.map((file) => ({
      name: `${top}${dir}/${file}`,
      text: `synthetic ${kind} ${dir} ${file}`
    }))
  )
}

function archiveFor(kind: ToolKey): Buffer {
  return buildTarGz(archiveEntries(kind))
}

function release(tag: string, assets: string[], route: string) {
  return {
    tag_name: tag,
    assets: assets.map((name) => ({
      name,
      browser_download_url: `${GITHUB}${route}${tag}/${name}`
    }))
  }
}

function routeOf(kind: ToolKey): string {
  return (ARCHIVE_ROUTES.find((r) => r.kind === kind) as { prefix: string })
    .prefix
}

function syntheticFor(c: DxvkCase): SyntheticResponse[] {
  const out: SyntheticResponse[] = []
  // The feeds. A live case reaches the real ones (the recorder refuses anything else live).
  if (!c.live) {
    for (const feed of FEEDS) {
      const assets =
        feed.kind === 'dxvk-macOS' && c.macBuiltinFirst
          ? ['dxvk-macOS-async-v1.10.3-20230507-builtin.tar.gz', feed.asset]
          : [feed.asset]
      out.push({
        method: 'GET',
        path: feed.path,
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(release(feed.tag, assets, routeOf(feed.kind)))
      })
    }
  }
  // The archives: HEAD and one GET each, whatever name the (live or synthetic) feed gave them.
  for (const route of ARCHIVE_ROUTES) {
    const pattern = new RegExp(`^${route.prefix}`)
    out.push({
      method: 'HEAD',
      path: pattern,
      status: 200,
      headers: { 'content-length': String(archiveFor(route.kind).length) },
      body: ''
    })
    out.push(
      c.fail === route.kind
        ? {
            method: 'GET',
            path: pattern,
            status: 500,
            body: 'Internal Server Error'
          }
        : {
            method: 'GET',
            path: pattern,
            status: 200,
            headers: { 'content-type': 'application/gzip' },
            body: '',
            bodyBase64: archiveFor(route.kind).toString('base64')
          }
    )
  }
  return out
}

type Event = { channel: string; args: unknown[] }

const expand = <T>(value: T, profile: EngineOracleProfile): T =>
  JSON.parse(expandPlaceholders(JSON.stringify(value), profile)) as T

interface SliceModules {
  utils: typeof import('backend/utils')
  tools: typeof import('backend/tools')
  logger: typeof import('backend/logger')
  testServices: typeof import('backend/testUtils/testServices')
}
let mods: SliceModules

interface WineCall {
  program: 'runWineCommand'
  commandParts: string[]
  wait: boolean | null
  resolveOnExit: boolean | null
  protonVerb: string | null
  winePrefix: string
  wineVersion: string
  importedFile?: string
}

describeSkipOnWindows('DXVK family oracle (87-09)', () => {
  const cases = loadCases<DxvkCase>(CRATE, SLICE)

  beforeAll(async () => {
    // The recorder's dispatcher must be the default adapter before `backend/utils` builds its axios
    // client, so every slice module is imported after it.
    installAdapter()
    mods = {
      utils: await import('backend/utils'),
      tools: await import('backend/tools'),
      logger: await import('backend/logger'),
      testServices: await import('backend/testUtils/testServices')
    }
  })

  it.each(cases)('$id', async (c) => {
    assertLiveRecorded(CRATE, SLICE, c)
    const restorers: (() => void)[] = [mockPlatform(c.platform)]
    restorers.push(
      pinProcess({
        platform: c.platform === 'mac' ? 'darwin' : 'linux',
        arch: 'x64'
      })
    )
    const recorder = installRecorder({
      crate: CRATE,
      slice: SLICE,
      caseId: c.id,
      synthetic: syntheticFor(c),
      allowLive: (url) =>
        c.live === true &&
        url.startsWith(`${API}/repos/`) &&
        url.includes('/releases/')
    })
    const downloads: string[] = []
    const logs: LogLine[] = []
    const spy = jest.spyOn(mods.utils, 'downloadFile')
    const logSpies = (
      [
        ['logDebug', 'DEBUG'],
        ['logInfo', 'INFO'],
        ['logWarning', 'WARNING'],
        ['logError', 'ERROR']
      ] as const
    ).map(([name, level]) =>
      jest
        .spyOn(mods.logger, name)
        .mockImplementation((message: unknown, options?: unknown) => {
          captureLog(logs, level, message, options)
        })
    )
    try {
      await withEngineOracleProfile(
        async (profile) => {
          const publicDir = join(profile.home, 'public')
          const real = createRealRunner()
          const helper = join(
            publicDir,
            'bin',
            'x64',
            c.platform === 'mac' ? 'darwin' : 'linux',
            'vulkan-helper'
          )
          const gpu = c.gpu ?? '1.3'
          const physical =
            gpu === 'none'
              ? []
              : [
                  {
                    name: 'Oracle GPU',
                    major: 1,
                    minor: gpu === '1.3' ? 3 : 2,
                    patch: 250
                  }
                ]
          const tracer = createSpawnTracer({
            baseEnv: profile.fake.childEnv(),
            delegate: real.runner,
            scripted: [
              {
                program: helper,
                argv: ['physical-versions'],
                stdout: JSON.stringify(physical),
                repeat: true
              },
              {
                program: helper,
                argv: ['instance-version'],
                stdout: '[1,3,280]',
                repeat: true
              },
              {
                program: helper,
                argv: ['nvapi-path'],
                stdout: c.nvngx ? `${profile.home}/nvidia-libs\n` : '\n',
                repeat: true
              }
            ]
          })
          // One process at a time: three installs run concurrently, and the order the real `tar`
          // calls finish in must not decide the order of the trace.
          let chain: Promise<unknown> = Promise.resolve()
          const runner = {
            ...tracer.runner,
            run: (...args: Parameters<typeof tracer.runner.run>) => {
              const next = chain.then(() => tracer.runner.run(...args))
              chain = next.catch(() => undefined)
              return next
            }
          }

          const events: Event[] = []
          const sendFrontendMessage = ((
            channel: string,
            ...args: unknown[]
          ) => {
            events.push({ channel, args })
            return true
          }) as unknown as SendFrontendMessage

          const prefixDir = expand(c.prefix ?? '<HOME>/prefix', profile)
          const wineCalls: WineCall[] = []
          const wine = c.wine ?? {}
          const runWineCommand = (args: {
            gameSettings: GameSettings
            commandParts: string[]
            wait?: boolean
            resolveOnExit?: boolean
            protonVerb?: string
          }): Promise<{ stdout: string; stderr: string; code: number }> => {
            const parts = args.commandParts
            const call: WineCall = {
              program: 'runWineCommand',
              commandParts: parts,
              wait: args.wait ?? null,
              resolveOnExit: args.resolveOnExit ?? null,
              protonVerb: args.protonVerb ?? null,
              winePrefix: args.gameSettings.winePrefix,
              wineVersion: args.gameSettings.wineVersion.name
            }
            let code = 0
            if (parts[0] === 'reg' && parts[1] === 'import') {
              const file = join(
                profile.home,
                'prefix',
                'drive_c',
                'gamelib-dxvk-restore.reg'
              )
              if (existsSync(file))
                call.importedFile = readFileSync(file, 'utf8')
              code = wine.import ?? 0
              for (const path of wine.restock ?? []) {
                writeFileSync(expandPlaceholders(path, profile), 'builtin')
              }
            } else if (parts[0] === 'reg' && parts[1] === 'query') {
              const name = parts[parts.indexOf('/v') + 1] as string
              code = (wine.left ?? []).includes(name) ? 0 : 1
            } else if (parts[0] === 'wineboot') {
              code = wine.boot ?? 0
            }
            wineCalls.push(call)
            return Promise.resolve({ stdout: '', stderr: '', code })
          }

          const slices = mods.testServices.createTestToolsSlices({
            sendFrontendMessage
          })
          const deps = {
            ...slices,
            paths: { ...profile.paths, publicDir },
            spawnAsync: tracer.spawnAsync,
            runner,
            onlineMonitor: { isOnline: () => c.online !== false },
            stores: mods.testServices.createTestStores(),
            managers: { library: {} },
            commandRunner: { runWineCommand },
            launcher: {
              setupEnvVars: () => ({}),
              setupWineEnvVars: () => ({}),
              validWine: () => Promise.resolve(true)
            }
          } as unknown as ToolsDeps
          const { DXVK } = mods.tools.createTools(deps)

          spy.mockImplementation(async ({ url, dest }): Promise<void> => {
            downloads.push(url)
            try {
              await mods.utils.axiosClient.head(url)
            } catch {
              throw new Error('Failed to get headers')
            }
            try {
              const response = await mods.utils.axiosClient.get<Buffer>(url, {
                responseType: 'arraybuffer'
              })
              writeFileSync(dest, Buffer.from(response.data))
            } catch (error) {
              throw new Error(`Download failed with ${String(error)}`)
            }
          })

          const gameSettings = {
            winePrefix: prefixDir,
            wineVersion: expand(c.wineVersion, profile) as WineInstallation
          } as unknown as GameSettings
          let outcome: { returned: boolean } | { thrown: string }
          try {
            outcome = {
              returned: await DXVK.installRemove(
                gameSettings,
                c.tool,
                c.action,
                c.source ? expand(c.source, profile) : undefined
              )
            }
          } catch (error) {
            outcome = {
              thrown: error instanceof Error ? error.message : String(error)
            }
          }
          await waitForTreeToSettle(profile.home)

          await recorder.finish()
          writeOrCompareGolden(CRATE, SLICE, c.id, {
            result: normalisePaths(
              {
                op: 'installRemove',
                platform: c.platform,
                tool: c.tool,
                action: c.action,
                source: c.source ?? null,
                outcome,
                downloads,
                logs
              },
              profile
            ),
            events: normalisePaths(events, profile),
            after: snapshotTree(profile.home),
            spawns: normalisePaths([...tracer.records, ...wineCalls], profile),
            requests: recorder.requested
          })
          real.dispose()
        },
        { seed: c.seed }
      )
    } finally {
      spy.mockRestore()
      for (const logSpy of logSpies) logSpy.mockRestore()
      for (const restore of restorers.reverse()) restore()
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, FLOOR)
    assertManifest(CRATE, SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FLOOR)
  })

  it('the synthetic archives carry the layouts each tool extracts', () => {
    // vkd3d reads x86 (not x32); dxvk-nvapi has no top directory (strip 0).
    expect(archiveEntries('vkd3d').map((e) => e.name)).toContain(
      'vkd3d-proton-synthetic/x86/d3d12.dll'
    )
    expect(archiveEntries('dxvk-nvapi').map((e) => basename(e.name))).toEqual([
      'nvapi.dll',
      'nvapi64.dll'
    ])
    expect(archiveEntries('dxvk-nvapi')[0]?.name.startsWith('x32/')).toBe(true)
  })
})
