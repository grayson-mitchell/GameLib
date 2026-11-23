/**
 * The wine-manager oracle (87-07, D-08): the seven GitHub release feeds and the stored list they
 * merge into, `installWineVersion` (sha512 checksum present, mismatched and absent, overwrite,
 * abort) and `removeWineVersion`, driven through the same handlers the sidecar registers and recorded
 * as goldens the Rust `gamelib-wine` wine-manager slice later has to reproduce. The lutris runtimes
 * half of the `wine/` goldens is 87-05.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts and recorder.ts):
 *   GAMELIB_EW_ORACLE=record     fetch the seven GitHub feeds live (the one `live` case) and write
 *                                    recorded/wine_manager/<case>/; every other case is synthetic
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    replay the recordings and rewrite golden/wine_manager/expected/
 *   (default)                        replay and compare, offline
 *
 * What is recorded per case: the result and the store bytes, the event sequence, the notification
 * keys, the requests (with the headers the TS sent, in recorded/), the spawn trace and the profile tree.
 *
 * Release archives are never downloaded (T-87-60): `downloadFile` is the one seam the multi-connection
 * downloader (EasyDl) hides its sockets behind, so a case replaces it with a stand-in that makes the
 * same `HEAD` and a single `GET` through the recorder, and writes the synthetic 200-byte archive the
 * recorder serves. A real download is HEAD plus ranged GETs; the Rust replay pins the HEAD and the GET.
 * Progress events are D-10: the oracle collapses a run of identical `progressOfWineManager` statuses
 * to one entry, so the golden pins the sequence (downloading, unzipping, idle) and not how many
 * progress events fired.
 *
 * `process.arch` is pinned to x64 (GE-Proton picks its asset by it) and the clock is pinned for the
 * installs (the ETA reads `Date.now`). The goldens are recorded on a POSIX host (file modes, `tar`).
 */
import { readFileSync, existsSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { createHash } from 'crypto'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertLiveRecorded,
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  loadCases,
  mockPlatform,
  normalisePaths,
  pinClock,
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
import { createRealRunner } from 'backend/testUtils/realRunner'
import {
  GPTK_URL,
  PROTON_CACHYOS_URL,
  PROTONGE_URL,
  PROTON_URL,
  WINECROSSOVER_URL,
  WINELUTRIS_URL,
  WINESTAGINGMACOS_URL
} from 'backend/wine/manager/downloader/constants'
import type { WineToolsFlowDeps } from 'backend/sidecar/wineToolsFlowRegistration'
import type { SendFrontendMessage } from 'backend/host/frontendMessage'
import type { Repositorys, WineVersionInfo } from 'common/types'

const CRATE = 'gamelib-wine'
const SLICE = 'wine_manager'
/** The case count this plan commits; a later edit may raise it, never lower it. */
const FLOOR = 19

type Flow = 'full' | 'abort' | 'skip' | 'http-500' | 'head-fails'

interface WineManagerCase {
  id: string
  op: 'refresh' | 'install' | 'remove'
  platform: OraclePlatform
  /** Recorded once from GitHub (record mode only reaches the seven feeds). */
  live?: boolean
  note: string
  seed?: SeedEntry[]
  store?: WineVersionInfo[]
  settings?: { downloadProtonToSteam: boolean; defaultSteamPath: string }
  // refresh
  fetch?: boolean
  repositorys?: number[]
  count?: number
  feeds?: 'offline'
  // install
  release?: WineVersionInfo
  checksum?: 'match' | 'mismatch' | 'none'
  flow?: Flow
  tar?: 'real' | 'nonzero' | 'throws'
  progress?: { bytes: number; speed: number; percentage: number }[]
}

/** The seven feeds in `Repositorys` enum order. */
const FEEDS: readonly string[] = [
  PROTONGE_URL,
  PROTON_URL,
  WINELUTRIS_URL,
  WINECROSSOVER_URL,
  WINESTAGINGMACOS_URL,
  GPTK_URL,
  PROTON_CACHYOS_URL
]

/** The feeds `updateWineVersionInfos` walks when no repository list is given. */
const defaultFeeds = (platform: OraclePlatform): number[] =>
  platform === 'mac' ? [3, 4, 5] : [0, 6]

/** The 200-byte synthetic archive every install serves (one directory, one file, strip=1). */
const ARCHIVE = readFileSync(
  join(
    __dirname,
    '..',
    '..',
    'runtimes',
    '__tests__',
    'runtimes',
    'test_data',
    'ArchiveWithSubfolder.tar.xz'
  )
)

const sha512 = (bytes: Buffer): string =>
  createHash('sha512').update(bytes).digest('hex')

const pathOf = (url: string): string => new URL(url).pathname

/** GitHub-shaped release metadata for the merge case (the shape `fetchReleases` reads). */
function githubRelease(
  tag: string,
  day: string,
  assets: { name: string; size: number }[]
) {
  return {
    tag_name: tag,
    published_at: `${day}T10:00:00Z`,
    html_url: `https://downloads.oracle.invalid/notes/${tag}`,
    assets: assets.map((a) => ({
      name: a.name,
      size: a.size,
      browser_download_url: `https://downloads.oracle.invalid/${tag}/${a.name}`
    }))
  }
}

function jsonResponse(path: string, body: unknown): SyntheticResponse {
  return {
    method: 'GET',
    path,
    status: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }
}

function syntheticFor(c: WineManagerCase): SyntheticResponse[] {
  if (c.op === 'refresh') {
    if (c.feeds === 'offline') {
      return (c.repositorys ?? defaultFeeds(c.platform)).map((i) => ({
        method: 'GET',
        path: pathOf(FEEDS[i] as string),
        status: 0,
        body: '',
        networkError: true
      }))
    }
    if (c.id === 'refresh-merge-existing') {
      return [
        jsonResponse(pathOf(PROTONGE_URL), [
          githubRelease('GE-Proton9-2', '2024-06-02', [
            { name: 'GE-Proton9-2.tar.gz', size: 300 },
            { name: 'GE-Proton9-2.sha512sum', size: 10 }
          ]),
          githubRelease('GE-Proton9-1', '2024-06-01', [
            { name: 'GE-Proton9-1.tar.gz', size: 200 },
            { name: 'GE-Proton9-1.sha512sum', size: 10 }
          ])
        ]),
        jsonResponse(pathOf(PROTON_CACHYOS_URL), [
          githubRelease('cachyos-9.0-20240601-slr', '2024-06-01', [
            {
              name: 'proton-cachyos-9.0-20240601-slr-x86_64.tar.xz',
              size: 400
            },
            {
              name: 'proton-cachyos-9.0-20240601-slr-x86_64.sha512sum',
              size: 10
            }
          ])
        ])
      ]
    }
    return []
  }
  if (c.op !== 'install' || !c.release) return []
  const out: SyntheticResponse[] = []
  const release = c.release
  if (c.checksum && c.checksum !== 'none') {
    out.push({
      method: 'GET',
      path: pathOf(release.checksum),
      status: 200,
      headers: { 'content-type': 'text/plain' },
      body: `${c.checksum === 'match' ? sha512(ARCHIVE) : '0'.repeat(128)}  ${basename(pathOf(release.download))}\n`
    })
  }
  const flow = c.flow ?? 'full'
  if (flow === 'skip') return out
  if (flow === 'head-fails') {
    out.push({
      method: 'HEAD',
      path: pathOf(release.download),
      status: 0,
      body: '',
      networkError: true
    })
    return out
  }
  out.push({
    method: 'HEAD',
    path: pathOf(release.download),
    status: 200,
    headers: { 'content-length': String(ARCHIVE.length) },
    body: ''
  })
  if (flow === 'abort') return out
  if (flow === 'http-500') {
    out.push({
      method: 'GET',
      path: pathOf(release.download),
      status: 500,
      body: 'Internal Server Error'
    })
    return out
  }
  out.push({
    method: 'GET',
    path: pathOf(release.download),
    status: 200,
    headers: { 'content-type': 'application/x-xz' },
    body: '',
    bodyBase64: ARCHIVE.toString('base64')
  })
  return out
}

type Event = { channel: string; args: unknown[] }

/** D-10: a run of the same progress status is one entry; how many fired is not pinned. */
function collapseProgress(events: readonly Event[]): Event[] {
  const out: Event[] = []
  for (const event of events) {
    const last = out[out.length - 1]
    const status = (e: Event) => (e.args[1] as { status?: string }).status
    if (
      event.channel === 'progressOfWineManager' &&
      last?.channel === 'progressOfWineManager' &&
      last.args[0] === event.args[0] &&
      status(last) === status(event)
    ) {
      continue
    }
    out.push(event)
  }
  return out
}

const expand = <T>(value: T, profile: EngineOracleProfile): T =>
  JSON.parse(expandPlaceholders(JSON.stringify(value), profile)) as T

/**
 * The tree of the profile with the store file's hash taken over its normalised text: the store holds
 * the absolute `installDir` of each release, so its raw bytes differ with every temp directory.
 */
function treeOf(profile: EngineOracleProfile) {
  return snapshotTree(profile.home).map((entry) =>
    entry.path.endsWith('store/wine-downloader-info.json')
      ? {
          ...entry,
          sha256: createHash('sha256')
            .update(
              normalisePaths(
                readFileSync(join(profile.home, entry.path), 'utf8'),
                profile
              )
            )
            .digest('hex')
        }
      : entry
  )
}

function readStoreFile(profile: EngineOracleProfile): unknown {
  const file = join(profile.userData, 'store', 'wine-downloader-info.json')
  return existsSync(file)
    ? (JSON.parse(readFileSync(file, 'utf8')) as unknown)
    : null
}

/** `process.arch` is read-only, so `jest.replaceProperty` cannot restore it: redefine and put it back. */
function pinArch(arch: string): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'arch')
  Object.defineProperty(process, 'arch', { value: arch, configurable: true })
  return () => {
    if (original) Object.defineProperty(process, 'arch', original)
  }
}

type Handler = (event: unknown, ...args: unknown[]) => Promise<unknown>

/** Every module that builds `axiosClient` (directly or by import) loads after the recorder's adapter. */
interface SliceModules {
  utils: typeof import('backend/utils')
  manager: typeof import('backend/wine/manager/utils')
  registration: typeof import('backend/sidecar/wineToolsFlowRegistration')
  stores: typeof import('backend/wine/manager/stores')
  storeRegistry: typeof import('backend/stores/storeRegistry')
  testStoreRoot: typeof import('backend/testUtils/testStoreRoot')
  events: typeof import('backend/backend_events')
}
let mods: SliceModules

describeSkipOnWindows('wine manager oracle (87-07)', () => {
  const cases = loadCases<WineManagerCase>(CRATE, SLICE)

  beforeAll(async () => {
    // The recorder's dispatcher must be the default adapter before `backend/utils` builds its axios
    // client, so every slice module is imported after it.
    installAdapter()
    mods = {
      utils: await import('backend/utils'),
      manager: await import('backend/wine/manager/utils'),
      registration: await import('backend/sidecar/wineToolsFlowRegistration'),
      stores: await import('backend/wine/manager/stores'),
      storeRegistry: await import('backend/stores/storeRegistry'),
      testStoreRoot: await import('backend/testUtils/testStoreRoot'),
      events: await import('backend/backend_events')
    }
  })

  it.each(cases)('$id', async (c) => {
    assertLiveRecorded(CRATE, SLICE, c)
    const restorers: (() => void)[] = [mockPlatform(c.platform)]
    restorers.push(pinArch('x64'))
    if (c.op === 'install') restorers.push(pinClock(Date.UTC(2026, 10, 23)))
    const feedPrefixes = FEEDS.map((url) => `${url}?per_page=`)
    const recorder = installRecorder({
      crate: CRATE,
      slice: SLICE,
      caseId: c.id,
      synthetic: syntheticFor(c),
      allowLive: (url) =>
        c.live === true && feedPrefixes.some((prefix) => url.startsWith(prefix))
    })
    const downloads: string[] = []
    const spy = jest.spyOn(mods.utils, 'downloadFile')
    try {
      await withEngineOracleProfile(
        async (profile) => {
          const store = mods.stores.createWineManagerStores({
            registry: mods.storeRegistry.createStoreRegistry(),
            root: mods.testStoreRoot.createTestStoreRoot(profile.userData)
          })
          const releaseInput = c.release
            ? expand(c.release, profile)
            : undefined
          const seeded =
            c.store !== undefined
              ? expand(c.store, profile)
              : c.op === 'install' && releaseInput
                ? [releaseInput]
                : undefined
          if (seeded) {
            store.wineDownloaderInfoStore.set('wine-releases', seeded)
          }

          const real = createRealRunner()
          const tracer = createSpawnTracer({
            baseEnv: profile.fake.childEnv(),
            delegate: real.runner,
            scripted: [
              // `du` measures the machine's block size, so its answer is scripted.
              { program: 'du', stdout: '4096\n', repeat: true },
              ...(c.tar === 'nonzero'
                ? [
                    {
                      program: 'tar',
                      code: 2,
                      stderr: 'tar: Error is not recoverable: exiting now'
                    }
                  ]
                : [])
            ]
          })
          const runner = {
            ...tracer.runner,
            run: (...args: Parameters<typeof tracer.runner.run>) =>
              c.tar === 'throws' && args[0] === 'tar'
                ? Promise.reject(new Error('spawn tar ENOENT'))
                : tracer.runner.run(...args)
          }

          const events: Event[] = []
          const notifications: { title?: string; body?: string }[] = []
          const sendFrontendMessage = ((
            channel: string,
            ...args: unknown[]
          ) => {
            events.push({ channel, args })
            return true
          }) as unknown as SendFrontendMessage
          const bus = mods.events.createBackendEvents()
          bus.on('wineVersionInstalled', (info, dir) => {
            events.push({
              channel: 'event:wineVersionInstalled',
              args: [info, dir]
            })
          })
          bus.on('wineVersionUninstalled', (info) => {
            events.push({
              channel: 'event:wineVersionUninstalled',
              args: [info]
            })
          })
          let controller: AbortController | undefined
          const handlers = new Map<string, Handler>()
          const deps = {
            ipc: {
              handle: (name: string, fn: Handler) => {
                handlers.set(name, fn)
              }
            },
            notifications: {
              show: (options: { title?: string; body?: string }) => {
                notifications.push(options)
              }
            },
            appRuntime: { events: bus },
            stores: { wineManager: store },
            sendFrontendMessage,
            paths: profile.paths,
            config: {
              getSettings: () =>
                c.settings
                  ? expand(c.settings, profile)
                  : { downloadProtonToSteam: false, defaultSteamPath: '' }
            },
            runner,
            aborts: {
              create: () => {
                controller = new AbortController()
                return controller
              },
              delete: () => undefined
            }
          } as unknown as WineToolsFlowDeps
          mods.registration.registerWineToolsFlows(deps)

          if (c.op === 'install') {
            spy.mockImplementation(
              async ({ url, dest, progressCallback }): Promise<void> => {
                downloads.push(url)
                try {
                  await mods.utils.axiosClient.head(url)
                } catch {
                  throw new Error('Failed to get headers')
                }
                for (const step of c.progress ?? []) {
                  progressCallback?.(
                    step.bytes,
                    step.speed,
                    step.percentage,
                    step.speed
                  )
                }
                if (c.flow === 'abort') {
                  controller?.abort()
                  throw new Error(
                    'Download failed with Error: Download stopped or paused'
                  )
                }
                try {
                  const response = await mods.utils.axiosClient.get<Buffer>(
                    url,
                    {
                      responseType: 'arraybuffer'
                    }
                  )
                  writeFileSync(
                    join(dest, basename(pathOf(url))),
                    Buffer.from(response.data)
                  )
                } catch (error) {
                  throw new Error(`Download failed with ${String(error)}`)
                }
              }
            )
          }

          let value: unknown
          const handle = (name: string) => handlers.get(name) as Handler
          if (c.op === 'refresh') {
            value = await mods.manager.updateWineVersionInfos(
              deps,
              c.fetch ?? false,
              c.repositorys === undefined
                ? null
                : (c.repositorys as unknown as Repositorys[]),
              c.count
            )
          } else if (c.op === 'install') {
            await handle('installWineVersion')(undefined, releaseInput)
          } else {
            await handle('removeWineVersion')(undefined, releaseInput)
          }

          await recorder.finish()
          writeOrCompareGolden(CRATE, SLICE, c.id, {
            result: normalisePaths(
              {
                op: c.op,
                platform: c.platform,
                ...(c.op === 'refresh' ? { releases: value } : {}),
                downloads,
                notifications,
                store: readStoreFile(profile)
              },
              profile
            ),
            events: normalisePaths(collapseProgress(events), profile),
            after: treeOf(profile),
            spawns: normalisePaths(tracer.records, profile),
            requests: recorder.requested
          })
          real.dispose()
        },
        { seed: c.seed }
      )
    } finally {
      spy.mockRestore()
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
