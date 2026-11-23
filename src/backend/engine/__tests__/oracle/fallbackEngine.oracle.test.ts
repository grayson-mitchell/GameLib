/**
 * The fallback-engine oracle (87-14, D-08, D-10): the pinned Wine-Staging + DXVK-macOS engine
 * downloaded, verified and extracted on a fake HOME, with the `gameStatusUpdate` sequence the
 * reporter sends, the `.gamelib-pin.json` markers, retention and the boot sweep, recorded as
 * goldens the Rust `gamelib-engine` slice later has to reproduce.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite golden/fallback/expected/ (and any archive fixture that is
 *                                    absent, see below)
 *   (default)                        compare, offline
 * Nothing here reaches the network. The 228 MB pinned engine is never downloaded (87-14
 * prohibition): `downloadFile` is replaced by `stubDownloadFile`, which serves a small synthetic
 * archive by the pinned URL, and the pins are overridden for the test only, with the size and sha256
 * of those archives, so the real verify, extract and retention code runs over them.
 *
 * The archive bodies are committed under `recorded/fallback/archives/`: a `wine-synthetic.tar.xz`
 * (a `wine/bin` stub tree, with a contained symlink), a `wine-escape.tar.xz` (the same plus a symlink
 * that resolves inside the fake profile but outside the extraction root, T-87-16) and a
 * `dxvk-synthetic.tar.gz` (an `x32`/`x64` tree). They are built from the ustar writer below, so no
 * real Wine or DXVK binary is a fixture. Node cannot write xz, so a missing xz fixture is made in
 * write mode by `xz -9e` over the tar this file builds; a fixture that exists is never rewritten
 * (the goldens hold its sha256). Delete one and run write mode to regenerate it and its goldens.
 *
 * What is recorded per case: the result (per caller, the reporter's outcome and the engine's raw
 * outcome and progress), every log line, the `gameStatusUpdate` pushes, the downloads asked for, the
 * spawn trace (`tar` runs for real over the fake profile; a failing `tar` is scripted so its
 * stderr does not depend on the host's tar), the `.gamelib-pin.json` bytes and the profile tree.
 * `mkdtemp`'s random suffix in `.tmp-<kind>-XXXXXX` is replaced by `XXXXXX`.
 */
import { createHash } from 'crypto'
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { gzipSync } from 'zlib'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  loadCases,
  normalisePaths,
  pinClock,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import {
  fixturesRoot,
  oracleMode,
  stubDownloadFile,
  type DownloadRecording
} from 'backend/testUtils/engineWineOracle/recorder'
import { createSpawnTracer } from 'backend/testUtils/engineWineOracle/spawnTrace'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import {
  captureLog,
  type LogLine
} from 'backend/testUtils/engineWineOracle/toolsOracleSupport'
import { createRealRunner } from 'backend/testUtils/realRunner'
import { createTestAppRuntime } from 'backend/testUtils/testAppRuntime'
import { createAbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import * as logger from 'backend/logger'
import * as utils from 'backend/utils'
import {
  createFallbackEngine,
  type FallbackDownloadProgress,
  type FallbackEngine
} from '../../fallbackEngine'
import * as enginePins from '../../enginePins'
import type { EnginePin, PinnedArtifact } from '../../enginePins'
import { ensurePinnedEngineReportingStatus } from '../../pinnedEngineProgress'

const CRATE = 'gamelib-engine'
const SLICE = 'fallback'
/** The case count this plan commits as a floor; a later edit may raise it, never lower it. */
const FLOOR = 30

/** The date the case runs at, so the ETA the downloader computes from `Date.now()` is stable. */
const NOW = Date.UTC(2026, 10, 23, 12, 0, 0)
/** The bytes per second every synthetic download reports. */
const SPEED = 10
const STOPPED = 'Download failed with Error: Download stopped or paused'
const REAL_CURRENT = enginePins.ENGINE_PINS.current

type Serve =
  | 'ok'
  | 'escape'
  | 'wrong-size'
  | 'wrong-sha'
  | 'fail-network'
  | 'fail-stopped'
  | 'tar-fails'
type WineState =
  | 'ok'
  | 'wrong-sha'
  | 'corrupt-marker'
  | 'no-marker'
  | 'no-wineserver'
type DxvkState = 'ok' | 'wrong-sha' | 'no-x64'
type AbortAt =
  | 'before'
  | 'sync'
  | 'downloading-progress'
  | 'verifying'
  | 'extracting'

interface Caller {
  app: string
  abort?: AbortAt
}

interface FallbackCase {
  id: string
  op: 'ensure' | 'prune' | 'sweep' | 'sweep-inflight' | 'installed' | 'paths'
  note: string
  /** The pin under test. Default `current`. */
  pin?: 'current' | 'previous' | 'other'
  /** Default true. */
  online?: boolean
  /** What is served for each artifact the case expects to be downloaded (absent: no download). */
  downloads: { dxvk?: Serve; wine?: Serve }
  /** What is already installed for the pin under test. */
  installed?: { wine?: WineState; dxvk?: DxvkState }
  callers?: Caller[]
  seed?: SeedEntry[]
}

/* ---- the synthetic archives ------------------------------------------------------------------ */

interface TarEntry {
  name: string
  type: 'file' | 'dir' | 'symlink'
  mode?: number
  text?: string
  link?: string
}

/** One ustar entry: uid/gid 0, mtime 0, so the bytes are reproducible. */
function tarEntry(entry: TarEntry): Buffer {
  const body = Buffer.from(entry.text ?? '', 'utf8')
  const header = Buffer.alloc(512)
  const mode = entry.mode ?? (entry.type === 'file' ? 0o644 : 0o755)
  header.write(entry.name, 0, 100, 'utf8')
  header.write(`${mode.toString(8).padStart(7, '0')}\0`, 100)
  header.write('0000000\0', 108)
  header.write('0000000\0', 116)
  header.write(
    `${(entry.type === 'file' ? body.length : 0).toString(8).padStart(11, '0')}\0`,
    124
  )
  header.write('00000000000\0', 136)
  header.write('        ', 148)
  header.write(
    entry.type === 'file' ? '0' : entry.type === 'dir' ? '5' : '2',
    156
  )
  if (entry.link !== undefined) header.write(entry.link, 157, 100, 'utf8')
  header.write('ustar\0', 257)
  header.write('00', 263)
  let sum = 0
  for (const byte of header) sum += byte
  header.write(`${sum.toString(8).padStart(6, '0')}\0 `, 148)
  if (entry.type !== 'file') return header
  const pad = Buffer.alloc((512 - (body.length % 512)) % 512)
  return Buffer.concat([header, body, pad])
}

const buildTar = (entries: readonly TarEntry[]): Buffer =>
  Buffer.concat([...entries.map(tarEntry), Buffer.alloc(1024)])

const WINE_TOP = 'wine-synthetic'
const WINE_BIN = `${WINE_TOP}/Contents/Resources/wine/bin`
const WINE_ENTRIES: TarEntry[] = [
  { name: `${WINE_TOP}/`, type: 'dir' },
  { name: `${WINE_TOP}/Contents/`, type: 'dir' },
  { name: `${WINE_TOP}/Contents/Resources/`, type: 'dir' },
  { name: `${WINE_TOP}/Contents/Resources/wine/`, type: 'dir' },
  { name: `${WINE_BIN}/`, type: 'dir' },
  {
    name: `${WINE_BIN}/wine`,
    type: 'file',
    mode: 0o755,
    text: '#!/bin/sh\n# synthetic wine stub, not a real binary\n'
  },
  {
    name: `${WINE_BIN}/wineserver`,
    type: 'file',
    mode: 0o755,
    text: '#!/bin/sh\n# synthetic wineserver stub, not a real binary\n'
  },
  // A link that stays inside the root is accepted.
  { name: `${WINE_BIN}/wine64`, type: 'symlink', link: 'wine' }
]
// `<root>/evil -> ../../../outside` resolves to `<TOOLS>/outside`: inside the fake profile (T-87-16),
// outside the extraction root `<TOOLS>/steam-engines/.tmp-wine-XXXXXX/out`.
const ESCAPE_ENTRIES: TarEntry[] = [
  ...WINE_ENTRIES,
  { name: `${WINE_TOP}/evil`, type: 'symlink', link: '../../../outside' }
]
const DXVK_TOP = 'dxvk-macOS-synthetic'
const DXVK_ENTRIES: TarEntry[] = [
  { name: `${DXVK_TOP}/`, type: 'dir' },
  { name: `${DXVK_TOP}/x32/`, type: 'dir' },
  { name: `${DXVK_TOP}/x64/`, type: 'dir' },
  {
    name: `${DXVK_TOP}/x32/d3d9.dll`,
    type: 'file',
    text: 'synthetic dll x32\n'
  },
  {
    name: `${DXVK_TOP}/x64/d3d9.dll`,
    type: 'file',
    text: 'synthetic dll x64\n'
  }
]

const archivesDir = (): string =>
  join(fixturesRoot(CRATE), 'recorded', SLICE, 'archives')

interface Archives {
  wine: Buffer
  wineEscape: Buffer
  dxvk: Buffer
}

/** Write mode only: makes a fixture that is absent. A fixture that exists is never rewritten. */
async function writeMissingArchives(dir: string): Promise<void> {
  mkdirSync(dir, { recursive: true })
  const gz = join(dir, 'dxvk-synthetic.tar.gz')
  if (!existsSync(gz)) {
    const bytes = gzipSync(buildTar(DXVK_ENTRIES), { level: 9 })
    // The gzip header's OS byte differs by platform; pin it so the bytes do not.
    bytes[9] = 3
    writeFileSync(gz, bytes)
  }
  const xzs: [string, TarEntry[]][] = [
    ['wine-synthetic.tar.xz', WINE_ENTRIES],
    ['wine-escape.tar.xz', ESCAPE_ENTRIES]
  ]
  for (const [name, entries] of xzs) {
    const out = join(dir, name)
    if (existsSync(out)) continue
    await withEngineOracleProfile(async (profile) => {
      const real = createRealRunner()
      try {
        mkdirSync(profile.tmp, { recursive: true })
        const tarPath = join(profile.tmp, 'synthetic.tar')
        writeFileSync(tarPath, buildTar(entries))
        const result = await real.runner.run(
          'xz',
          ['-9e', '-k', '-f', tarPath],
          {
            timeout: {
              none: true,
              reason:
                'one-off compression of a few-KB synthetic fixture, regenerating a deleted archive'
            }
          }
        )
        if (result.code !== 0) throw new Error(`xz failed: ${result.stderr}`)
        copyFileSync(`${tarPath}.xz`, out)
      } finally {
        real.dispose()
      }
    })
  }
}

async function loadArchives(): Promise<Archives> {
  const dir = archivesDir()
  if (oracleMode() === 'write') await writeMissingArchives(dir)
  return {
    wine: readFileSync(join(dir, 'wine-synthetic.tar.xz')),
    wineEscape: readFileSync(join(dir, 'wine-escape.tar.xz')),
    dxvk: readFileSync(join(dir, 'dxvk-synthetic.tar.gz'))
  }
}

/* ---- the pins ---------------------------------------------------------------------------------- */

const sha256 = (bytes: Buffer | string): string =>
  createHash('sha256').update(bytes).digest('hex')

interface PinSet {
  current: EnginePin
  previous: EnginePin
  other: EnginePin
}

function artifact(
  base: PinnedArtifact,
  version: string,
  urlTail: string,
  archiveName: string,
  body: Buffer
): PinnedArtifact {
  return {
    version,
    url: `${base.url.slice(0, base.url.lastIndexOf('/', base.url.lastIndexOf('/') - 1))}/${urlTail}`,
    size: body.length,
    sha256: sha256(body),
    archiveName
  }
}

/**
 * The pins this test overrides the table with: the real current pin's ids, URLs and file names with
 * the size and sha256 of the synthetic archives, a previous pin and one the table does not list.
 */
function buildPins(archives: Archives): PinSet {
  const { wine, dxvk } = REAL_CURRENT
  const mk = (
    id: string,
    wineVersion: string,
    dxvkVersion: string
  ): EnginePin => ({
    id,
    label: `${id} (synthetic)`,
    wine: artifact(
      wine,
      wineVersion,
      `${wineVersion}/wine-staging-${wineVersion}-osx64.tar.xz`,
      `wine-staging-${wineVersion}-osx64.tar.xz`,
      archives.wine
    ),
    dxvk: artifact(
      dxvk,
      dxvkVersion,
      `${dxvkVersion}/dxvk-macOS-async-${dxvkVersion}.tar.gz`,
      `dxvk-macOS-async-${dxvkVersion}.tar.gz`,
      archives.dxvk
    )
  })
  return {
    current: {
      ...mk(REAL_CURRENT.id, wine.version, dxvk.version),
      label: REAL_CURRENT.label
    },
    previous: mk('wine-staging-11.1', '11.1', 'v1.10.2-20230101-repack'),
    other: mk('wine-staging-9.0', '9.0', 'v1.10.0-20220101-repack')
  }
}

/** Applies one artifact's serve variant to its pin entry (the size or sha256 the pin claims). */
function applyServe(
  pinArtifact: PinnedArtifact,
  serve: Serve | undefined,
  body: Buffer
): PinnedArtifact {
  if (serve === 'wrong-size') return { ...pinArtifact, size: body.length + 1 }
  if (serve === 'wrong-sha') return { ...pinArtifact, sha256: '0'.repeat(64) }
  return pinArtifact
}

/** The archive an artifact is served as; an escape archive is its own pinned size and sha256. */
function servedBody(
  kind: 'dxvk' | 'wine',
  serve: Serve | undefined,
  archives: Archives
): Buffer {
  if (kind === 'dxvk') return archives.dxvk
  return serve === 'escape' ? archives.wineEscape : archives.wine
}

/* ---- seeds, recordings, readings --------------------------------------------------------------- */

const ROOT = '<TOOLS>/steam-engines'

function marker(pinArtifact: PinnedArtifact, sha?: string): string {
  return JSON.stringify({
    sha256: sha ?? pinArtifact.sha256,
    version: pinArtifact.version
  })
}

function installedSeed(
  pin: EnginePin,
  installed: FallbackCase['installed']
): SeedEntry[] {
  const out: SeedEntry[] = []
  const wineState = installed?.wine
  if (wineState) {
    const dir = `${ROOT}/${pin.id}`
    const bin = `${dir}/Contents/Resources/wine/bin`
    out.push({ path: `${bin}/wine`, text: 'wine', mode: '0755' })
    if (wineState !== 'no-wineserver') {
      out.push({ path: `${bin}/wineserver`, text: 'wineserver', mode: '0755' })
    }
    if (wineState === 'ok' || wineState === 'no-wineserver') {
      out.push({ path: `${dir}/.gamelib-pin.json`, text: marker(pin.wine) })
    } else if (wineState === 'wrong-sha') {
      out.push({
        path: `${dir}/.gamelib-pin.json`,
        text: marker(pin.wine, '1'.repeat(64))
      })
    } else if (wineState === 'corrupt-marker') {
      out.push({ path: `${dir}/.gamelib-pin.json`, text: 'not json {' })
    }
  }
  const dxvkState = installed?.dxvk
  if (dxvkState) {
    const dir = `${ROOT}/dxvk-macOS-${pin.dxvk.version}`
    out.push({ path: `${dir}/x32/d3d9.dll`, text: 'x32' })
    if (dxvkState !== 'no-x64') {
      out.push({ path: `${dir}/x64/d3d9.dll`, text: 'x64' })
    }
    out.push({
      path: `${dir}/.gamelib-pin.json`,
      text:
        dxvkState === 'wrong-sha'
          ? marker(pin.dxvk, '2'.repeat(64))
          : marker(pin.dxvk)
    })
  }
  return out
}

/** The synthetic body served for one artifact and the progress it reports. */
function recording(
  pinArtifact: PinnedArtifact,
  kind: 'dxvk' | 'wine',
  serve: Serve,
  archives: Archives
): DownloadRecording {
  const body = servedBody(kind, serve, archives)
  // A quarter is exact in binary, so the percentage is exactly 25 and the ETA is `0.075 * size`.
  const steps = [
    { transferred: body.length / 4, total: body.length },
    { transferred: body.length, total: body.length }
  ]
  if (serve === 'fail-network') {
    return {
      url: pinArtifact.url,
      body,
      progress: [steps[0] as (typeof steps)[number]],
      fail: 'Download failed with Error: socket hang up'
    }
  }
  if (serve === 'fail-stopped') {
    return {
      url: pinArtifact.url,
      body,
      progress: [steps[0] as (typeof steps)[number]],
      fail: STOPPED
    }
  }
  return { url: pinArtifact.url, body, progress: steps }
}

interface SentEvent {
  channel: string
  args: unknown[]
}

/** Every `.gamelib-pin.json` under the engine root, as `placeholder path -> bytes`. */
function readMarkers(profile: EngineOracleProfile): Record<string, string> {
  const out: Record<string, string> = {}
  const root = join(profile.toolsPath, 'steam-engines')
  const walk = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name === '.gamelib-pin.json') {
        out[normalisePaths(full, profile)] = readFileSync(full, 'utf8')
      }
    }
  }
  walk(root)
  return out
}

/** Names under the engine root, sorted; null when the directory does not exist. */
function listRoot(profile: EngineOracleProfile): string[] | null {
  const root = join(profile.toolsPath, 'steam-engines')
  return existsSync(root) ? readdirSync(root).sort() : null
}

/** `mkdtemp`'s suffix is random: `.tmp-<kind>-XXXXXX`. Applied to every recorded value. */
function scrubTemp<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value).replace(
      /\.tmp-(wine|dxvk)-[A-Za-z0-9]{6}(?![A-Za-z0-9])/g,
      '.tmp-$1-XXXXXX'
    )
  ) as T
}

/* ---- the oracle -------------------------------------------------------------------------------- */

describeSkipOnWindows('fallback engine oracle (87-14)', () => {
  const cases = loadCases<FallbackCase>(CRATE, SLICE)
  let archives: Archives

  beforeAll(async () => {
    archives = await loadArchives()
  })

  it.each(cases)('$id', async (c) => {
    const pins = buildPins(archives)
    const which = c.pin ?? 'current'
    const base = pins[which]
    const served = (kind: 'dxvk' | 'wine'): PinnedArtifact => {
      const body = servedBody(kind, c.downloads[kind], archives)
      return applyServe(
        { ...base[kind], size: body.length, sha256: sha256(body) },
        c.downloads[kind],
        body
      )
    }
    const pin: EnginePin = {
      ...base,
      wine: served('wine'),
      dxvk: served('dxvk')
    }
    const table = {
      current: which === 'current' ? pin : pins.current,
      previous: which === 'previous' ? pin : pins.previous
    }
    const tarFailing = (['dxvk', 'wine'] as const).filter(
      (kind) => c.downloads[kind] === 'tar-fails'
    )
    const recordings = (['dxvk', 'wine'] as const).flatMap((kind) => {
      const serve = c.downloads[kind]
      return serve ? [recording(pin[kind], kind, serve, archives)] : []
    })

    const restores: (() => void)[] = [pinClock(NOW)]
    const replaced = jest.replaceProperty(
      enginePins,
      'ENGINE_PINS',
      table as typeof enginePins.ENGINE_PINS
    )
    const logs: LogLine[] = []
    const logSpies = (
      [
        ['logDebug', 'DEBUG'],
        ['logInfo', 'INFO'],
        ['logWarning', 'WARNING'],
        ['logError', 'ERROR']
      ] as const
    ).map(([name, level]) =>
      jest
        .spyOn(logger, name)
        .mockImplementation((message: unknown, options?: unknown) => {
          captureLog(logs, level, message, options)
        })
    )
    const stub = stubDownloadFile(recordings)
    const downloadSpy = jest.spyOn(utils, 'downloadFile')
    downloadSpy.mockImplementation(
      async ({ url, dest, abortSignal, progressCallback }) => {
        const file = join(dest, decodeURIComponent(url.split('/').pop() ?? ''))
        await stub.download(url, file, (p) => {
          progressCallback?.(
            p.transferred,
            SPEED,
            (100 * p.transferred) / p.total,
            SPEED
          )
          if (abortSignal?.aborted) throw new Error(STOPPED)
        })
      }
    )

    try {
      await withEngineOracleProfile(
        async (profile) => {
          const real = createRealRunner()
          const tracer = createSpawnTracer({
            baseEnv: profile.fake.childEnv(),
            delegate: real.runner,
            scripted: tarFailing.map((kind) => ({
              program: 'tar',
              match: (argv: readonly string[]) =>
                (argv[1] ?? '').endsWith(`/${pin[kind].archiveName}`),
              code: 2,
              stderr: 'tar: synthetic extraction failure\n'
            }))
          })
          const aborts = createAbortRegistry()
          const engine: FallbackEngine = createFallbackEngine({
            paths: { toolsPath: profile.toolsPath },
            aborts
          })
          const onlineMonitor = { isOnline: () => c.online !== false }
          const events: SentEvent[] = []
          const sendFrontendMessage = ((
            channel: string,
            ...args: unknown[]
          ) => {
            events.push({ channel, args })
            return true
          }) as never
          const appRuntime = createTestAppRuntime()

          let result: Record<string, unknown>
          if (c.op === 'ensure') {
            const calls = c.callers ?? [{ app: 'oracle-app' }]
            const running = calls.map((call) => {
              const controller = new AbortController()
              const progress: FallbackDownloadProgress[] = []
              const raw: { value: unknown } = { value: null }
              let fired = false
              const tap = (p: FallbackDownloadProgress): void => {
                progress.push(p)
                const hit =
                  (call.abort === 'downloading-progress' &&
                    p.phase === 'downloading' &&
                    (p.percentage ?? 0) > 0) ||
                  call.abort === p.phase
                if (hit && !fired) {
                  fired = true
                  controller.abort()
                }
              }
              const fallback = {
                ensurePinnedEngine: (
                  ...args: Parameters<FallbackEngine['ensurePinnedEngine']>
                ) =>
                  engine
                    .ensurePinnedEngine(args[0], {
                      ...args[1],
                      onProgress: (p) => {
                        tap(p)
                        args[1].onProgress?.(p)
                      }
                    })
                    .then((r) => {
                      raw.value = r
                      return r
                    })
              }
              if (call.abort === 'before') controller.abort()
              const promise = ensurePinnedEngineReportingStatus({
                pin,
                appName: call.app,
                runner: 'nile',
                processRunner: tracer.runner,
                onlineMonitor,
                fallback,
                sendFrontendMessage,
                appRuntime,
                signal: call.abort ? controller.signal : undefined
              })
              if (call.abort === 'sync') controller.abort()
              return { call, promise, progress, raw }
            })
            const callers = []
            for (const r of running) {
              const reporting = await r.promise
              callers.push({
                app: r.call.app,
                abort: r.call.abort ?? null,
                reporting,
                raw: r.raw.value,
                progress: r.progress
              })
            }
            result = { callers }
          } else if (c.op === 'sweep-inflight') {
            const flight = engine.ensurePinnedEngine(pin, {
              runner: tracer.runner,
              onlineMonitor
            })
            const atSweep = listRoot(profile)
            engine.sweepStaleEngineTemps()
            const afterSweep = listRoot(profile)
            const finished = await flight
            result = { atSweep, afterSweep, finished }
          } else if (c.op === 'prune') {
            const before = listRoot(profile)
            engine.pruneUnpinnedEngines()
            result = { before, after: listRoot(profile) }
          } else if (c.op === 'sweep') {
            const before = listRoot(profile)
            engine.sweepStaleEngineTemps()
            result = { before, after: listRoot(profile) }
          } else if (c.op === 'installed') {
            result = {
              installed: engine.isPinnedEngineInstalled(pin),
              paths: engine.pinnedEnginePaths(pin)
            }
          } else {
            result = {
              root: engine.pinnedEngineRoot(),
              current: engine.pinnedEnginePaths(pins.current),
              previous: engine.pinnedEnginePaths(pins.previous),
              other: engine.pinnedEnginePaths(pins.other)
            }
          }

          stub.expectAllServed()
          tracer.expectAllConsumed()
          const released = !aborts.has(`steam-engine-download:${pin.id}`)
          real.dispose()
          writeOrCompareGolden(CRATE, SLICE, c.id, {
            result: scrubTemp(
              normalisePaths(
                {
                  op: c.op,
                  pin: which,
                  online: c.online !== false,
                  ...result,
                  abortControllerReleased: released,
                  markers: readMarkers(profile),
                  logs
                },
                profile
              )
            ),
            events: scrubTemp(normalisePaths(events, profile)),
            after: scrubTemp(
              normalisePaths(snapshotTree(profile.home), profile)
            ),
            spawns: scrubTemp(normalisePaths([...tracer.records], profile)),
            requests: stub.requested.map((url) => `DOWNLOAD ${url}`)
          })
        },
        {
          seed: [
            ...installedSeed(pin, c.installed),
            ...(c.seed ?? [])
          ] as SeedEntry[]
        }
      )
    } finally {
      downloadSpy.mockRestore()
      for (const spy of logSpies) spy.mockRestore()
      replaced.restore()
      for (const restore of restores.reverse()) restore()
    }
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, SLICE, cases, FLOOR)
    assertManifest(CRATE, SLICE, cases, FLOOR)
  })

  it('an empty case list fails the manifest guard', () => {
    expectEmptyCasesToFail(CRATE, SLICE, FLOOR)
  })

  it('the cases cover every outcome the plan names', () => {
    const has = (id: string): boolean => cases.some((c) => c.id === id)
    for (const id of [
      'download-ok-fresh',
      'offline-nothing-installed',
      'size-mismatch-wine',
      'sha256-mismatch-wine',
      'abort-during-verify',
      'extract-failed-tar-error-wine',
      'symlink-escape-wine',
      'prune-after-install-keeps-current-and-previous',
      'sweep-removes-temp-dirs',
      'joined-two-callers'
    ]) {
      expect(has(id)).toBe(true)
    }
  })

  it('no recorded archive is the real pinned engine: each fixture is a few KB', () => {
    for (const body of Object.values(archives)) {
      expect(body.length).toBeGreaterThan(0)
      expect(body.length).toBeLessThan(16 * 1024)
    }
    expect(REAL_CURRENT.wine.size).toBeGreaterThan(100 * 1024 * 1024)
  })

  it('the escaping symlink is relative and resolves inside the fake profile, never at a system path', () => {
    const link = ESCAPE_ENTRIES.find((e) => e.name.endsWith('/evil'))
    expect(link?.link).toBe('../../../outside')
    expect(link?.link?.startsWith('/')).toBe(false)
  })
})
