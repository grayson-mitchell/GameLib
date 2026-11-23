/**
 * The DXMT oracle (87-09, D-08): the three listeners `registerDxmtListeners` attaches
 * (`wineVersionInstalled`, `wineVersionUninstalled`, `releasesInfoReady`), the macho export gate in
 * front of them, the bounded boot fetch of `api.github.com/repos/3Shain/dxmt/releases/latest`, the
 * `latest_dxmt` and versioned directories, and the `<wine>-DXMT` copies, recorded as goldens the Rust
 * `gamelib-wine` tools slice later has to reproduce. The DXVK family is `dxvk.oracle.test.ts`.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts and recorder.ts):
 *   GAMELIB_EW_ORACLE=record     fetch the latest DXMT release live (the one `live` case) and write
 *                                    recorded/dxmt/<case>/; every other case is synthetic
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    replay the recordings and rewrite golden/dxmt/expected/
 *   (default)                        replay and compare, offline
 *
 * The listeners are the production ones, reached through a stand-in event bus that keeps the
 * handlers by name, so the case can await each handler and record what it rejected with (the bus
 * itself drops a listener's promise). The export gate is the production `checkWinemacMetalViewExports`
 * over a scripted `requestRustInvoke`: the case chooses what `scan_winemac_metal_exports` answers for
 * which bundle (or rejects), and the scan request arguments are recorded. The archive is a synthetic
 * tar.gz (T-87-13); `downloadFile` is the same HEAD-and-GET stand-in as the DXVK oracle; `tar` and the
 * file copies run for real inside the fake profile. `process.platform` is pinned to darwin (the tool's
 * os) and `isMac` is mocked on.
 *
 * What is recorded per case: the result (what the handler resolved or rejected with, the scan requests,
 * the downloads, every log line), the events sent to the renderer (the download-failure `showDialog`),
 * the requests, the profile tree after the run (the `<TOOLS>/dxmt` tree and the wine version dirs) and
 * the spawns (the real `tar`). The backend jest project replaces i18next with a stub that returns the
 * key, so a `showDialog` golden carries `box.error.dxmt.title`, not its English text.
 */
import { writeFileSync } from 'fs'
import { join } from 'path'
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
import type { DxmtListenerDeps } from 'backend/tools/dxmt'
import type { ReleasesInfo, WineVersionInfo } from 'common/types'

const CRATE = 'gamelib-wine'
const SLICE = 'dxmt'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 21

interface DxmtCase {
  id: string
  trigger: 'releases-ready' | 'wine-installed' | 'wine-uninstalled'
  live?: boolean
  note: string
  seed?: SeedEntry[]
  /** The wine the install and uninstall events carry. */
  wine?: WineVersionInfo
  /** The installed wines in the wine-manager store (`wine-releases`). */
  wines?: WineVersionInfo[]
  /** The tag `releasesInfoReady` reports for dxmt. */
  tag?: string
  online?: boolean
  scan?: { mode: 'ok' | 'fail' | 'reject'; failFor?: string[] }
  /** The DXMT archive answers 500. */
  fail?: boolean
  feed?: 'no-assets-key' | 'empty-assets' | 'status-500'
}

const FEED_PATH = '/repos/3Shain/dxmt/releases/latest'
const ARCHIVE_PREFIX = '/3Shain/dxmt/releases/download/'
const ASSET = 'dxmt-v0.80-builtin.tar.gz'

/** The 11 files `copyLatestDXMTFiles` copies, as an archive with one top directory (strip 1). */
const ARCHIVE = buildTarGz(
  [
    'x86_64-windows/d3d10core.dll',
    'x86_64-windows/d3d11.dll',
    'x86_64-windows/dxgi.dll',
    'x86_64-windows/nvapi64.dll',
    'x86_64-windows/nvngx.dll',
    'x86_64-windows/winemetal.dll',
    'x86_64-unix/winemetal.so',
    'i386-windows/d3d10core.dll',
    'i386-windows/d3d11.dll',
    'i386-windows/dxgi.dll',
    'i386-windows/winemetal.dll'
  ].map((name) => ({
    name: `dxmt-synthetic/${name}`,
    text: `synthetic dxmt ${name}`
  }))
)

function syntheticFor(c: DxmtCase): SyntheticResponse[] {
  const out: SyntheticResponse[] = []
  if (!c.live) {
    const json = (body: unknown): SyntheticResponse => ({
      method: 'GET',
      path: FEED_PATH,
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (c.feed === 'status-500') {
      out.push({
        method: 'GET',
        path: FEED_PATH,
        status: 500,
        body: 'Internal Server Error'
      })
    } else if (c.feed === 'no-assets-key') {
      out.push(json({ tag_name: 'v0.80' }))
    } else if (c.feed === 'empty-assets') {
      out.push(json({ tag_name: 'v0.80', assets: [] }))
    } else {
      out.push(
        json({
          tag_name: 'v0.80',
          assets: [
            {
              name: ASSET,
              browser_download_url: `https://github.com${ARCHIVE_PREFIX}v0.80/${ASSET}`
            }
          ]
        })
      )
    }
  }
  const pattern = new RegExp(`^${ARCHIVE_PREFIX}`)
  out.push({
    method: 'HEAD',
    path: pattern,
    status: 200,
    headers: { 'content-length': String(ARCHIVE.length) },
    body: ''
  })
  out.push(
    c.fail
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
          bodyBase64: ARCHIVE.toString('base64')
        }
  )
  return out
}

type Event = { channel: string; args: unknown[] }

const expand = <T>(value: T, profile: EngineOracleProfile): T =>
  JSON.parse(expandPlaceholders(JSON.stringify(value), profile)) as T

type Listener = (...args: unknown[]) => unknown

interface SliceModules {
  utils: typeof import('backend/utils')
  dxmt: typeof import('backend/tools/dxmt')
  logger: typeof import('backend/logger')
  hostServices: typeof import('backend/testUtils/testHostServices')
  aborts: typeof import('backend/testUtils/testAbortRegistry')
}
let mods: SliceModules

describeSkipOnWindows('DXMT oracle (87-09)', () => {
  const cases = loadCases<DxmtCase>(CRATE, SLICE)

  beforeAll(async () => {
    // The recorder's dispatcher must be the default adapter before `backend/utils` builds its axios
    // client, so every slice module is imported after it.
    installAdapter()
    mods = {
      utils: await import('backend/utils'),
      dxmt: await import('backend/tools/dxmt'),
      logger: await import('backend/logger'),
      hostServices: await import('backend/testUtils/testHostServices'),
      aborts: await import('backend/testUtils/testAbortRegistry')
    }
  })

  it.each(cases)('$id', async (c) => {
    assertLiveRecorded(CRATE, SLICE, c)
    // The listeners gate on the host being macOS, and installOrUpdateTool on `process.platform`.
    const restorers: (() => void)[] = [
      mockPlatform('mac'),
      pinProcess({ platform: 'darwin', arch: 'x64' })
    ]
    const recorder = installRecorder({
      crate: CRATE,
      slice: SLICE,
      caseId: c.id,
      synthetic: syntheticFor(c),
      allowLive: (url) => c.live === true && url.endsWith(FEED_PATH)
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
          const real = createRealRunner()
          const tracer = createSpawnTracer({
            baseEnv: profile.fake.childEnv(),
            delegate: real.runner
          })

          const events: Event[] = []
          const sendFrontendMessage = ((
            channel: string,
            ...args: unknown[]
          ) => {
            events.push({ channel, args })
            return true
          }) as unknown as SendFrontendMessage

          // The scan: `requestRustInvoke(channel, [args])`. The case says what each bundle answers.
          const scanRequests: { channel: string; args: unknown[] }[] = []
          const failFor = (c.scan?.failFor ?? []).map((p) =>
            expandPlaceholders(p, profile)
          )
          const requestRustInvoke = ((channel: string, args: unknown[]) => {
            scanRequests.push({ channel, args })
            const bundle = (args[0] as { wineBundlePath: string })
              .wineBundlePath
            if (c.scan?.mode === 'reject') {
              return Promise.reject(new Error('scan transport closed'))
            }
            if (c.scan?.mode === 'fail' && failFor.includes(bundle)) {
              return Promise.resolve({
                ok: false,
                winemacPath: join(
                  bundle,
                  'Contents/Resources/wine/lib/wine/x86_64-unix/winemac.so'
                ),
                reason: 'winemac.so lacks the macdrv metal-view exports',
                missing: [
                  '_macdrv_functions',
                  '_macdrv_view_create_metal_view',
                  '_macdrv_view_get_metal_layer',
                  '_macdrv_view_release_metal_view'
                ]
              })
            }
            return Promise.resolve({ ok: true })
          }) as unknown as DxmtListenerDeps['requestRustInvoke']

          const listeners = new Map<string, Listener>()
          const host = mods.hostServices.createTestHostServices()
          const wines = expand(c.wines ?? [], profile)
          const deps = {
            requestRustInvoke,
            sendFrontendMessage,
            events: {
              on: (name: string, fn: Listener) => {
                listeners.set(name, fn)
              },
              off: (name: string) => {
                listeners.delete(name)
              }
            },
            runner: tracer.runner,
            aborts: mods.aborts.createTestAbortRegistry(),
            paths: profile.paths,
            dialogs: host.dialogs,
            appState: host.appState,
            onlineMonitor: { isOnline: () => c.online !== false },
            stores: {
              wineManager: {
                wineDownloaderInfoStore: { get: () => wines }
              }
            }
          } as unknown as DxmtListenerDeps
          const unregister = mods.dxmt.registerDxmtListeners(deps)

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

          const wine = c.wine ? expand(c.wine, profile) : undefined
          const name =
            c.trigger === 'releases-ready'
              ? 'releasesInfoReady'
              : c.trigger === 'wine-installed'
                ? 'wineVersionInstalled'
                : 'wineVersionUninstalled'
          const args: unknown[] =
            c.trigger === 'releases-ready'
              ? [{ dxmt: { tag: c.tag } } as unknown as ReleasesInfo]
              : c.trigger === 'wine-installed'
                ? [wine, join(profile.toolsPath, 'wine')]
                : [wine]
          let outcome: { resolved: true } | { rejected: string }
          try {
            await (listeners.get(name) as Listener)(...args)
            outcome = { resolved: true }
          } catch (error) {
            outcome = {
              rejected: error instanceof Error ? error.message : String(error)
            }
          }
          const registered = [...listeners.keys()].sort()
          unregister()
          await waitForTreeToSettle(profile.home)

          await recorder.finish()
          writeOrCompareGolden(CRATE, SLICE, c.id, {
            result: normalisePaths(
              {
                op: name,
                trigger: c.trigger,
                outcome,
                registered,
                scanRequests,
                downloads,
                logs
              },
              profile
            ),
            events: normalisePaths(events, profile),
            after: snapshotTree(profile.home),
            spawns: normalisePaths(tracer.records, profile),
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
})
