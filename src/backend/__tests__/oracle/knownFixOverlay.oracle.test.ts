/**
 * The known-fix overlay oracle (88-06, D-03, D-11, D-14, D-25): the deterministic archive writer and strict
 * reader (`knownFixOverlayArchive`), the verified installer (`knownFixOverlayInstall`) and the overlay env
 * resolution (`knownFixOverlays`), driven on a fresh fake HOME and recorded as the goldens the Rust overlay
 * pieces (88-10) have to reproduce. The goldens exist before any Rust for them does.
 *
 * Slices under `gamelib-knownfix/tests/fixtures/golden/`:
 *   overlay_archive/   byte vectors for `buildOverlayTarGz` and verdicts of `readOverlayTarGz`
 *   overlay_install/   `ensureOverlayInstalled` outcomes with the `<APPFOLDER>/overlays` tree, and the env cases
 * each with
 *   cases.json      built in `knownFixOverlay.cases.ts` (write mode rewrites it, compare mode checks it)
 *   deltas.json     hand-authored: the documented Rust-side differences (D-19)
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/result.json   what each step answered (paths normalised)
 *   expected/<case>/events.json   every logger call the modules made (debug, info, warning), with its prefix
 *   expected/<case>/tree.json     (overlay_install) the fake HOME afterwards, so the `overlays/` tree is pinned
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * No case downloads the real catalogue archive: every fetch is scripted. The fixture overlay is pinned from
 * the archive `buildOverlayTarGz` produces for a small payload, and the env cases use a scripted installer.
 * Every case runs on a fresh fake HOME with `withPinnedBaseEnv` and an injected platform. Goldens are
 * recorded on a POSIX host.
 */
import { createHash } from 'crypto'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'fs'
import { dirname, join } from 'path'
import { gunzipSync } from 'zlib'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expandPlaceholders,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  seedProfile,
  syncManifest,
  withEngineOracleProfile,
  writeOrCompareGolden,
  type EngineOracleProfile
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import { snapshotTree } from 'backend/testUtils/engineWineOracle/treeSnapshot'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  injectPlatform,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import {
  buildOverlayTarGz,
  readOverlayTarGz
} from 'backend/knownFixOverlayArchive'
import {
  createKnownFixOverlayInstalls,
  verifyInstalledOverlay,
  type OverlayArchiveFetch
} from 'backend/knownFixOverlayInstall'
import {
  appendPathList,
  formatKnownFixEnvLine,
  knownFixProfileOverlayEnv,
  lastEnvOption,
  logKnownFixEnv,
  resolveKnownFixOverlayEnv,
  validateOverlayEntries,
  withKnownFixEnv
} from 'backend/knownFixOverlays'
import { filterTier1KnownFixes } from 'backend/knownFixes'
import {
  KNOWN_FIX_OVERLAY_CATALOGUE,
  lookupKnownFixOverlay,
  overlayArchiveUrl,
  type KnownFixOverlayCatalogueEntry
} from 'common/knownFixOverlayCatalogue'
import { LogPrefix } from 'backend/logger'
import { createAbortRegistry } from 'backend/utils/aborthandler/aborthandler'
import type { GameSettings } from 'common/types'
import {
  dropRealpathPrefix,
  json,
  spyLogs,
  withFakeClock,
  type LogLine
} from './oracleCommon'
import {
  PAYLOAD,
  buildArchiveCases,
  buildInstallCases,
  hostileDotdotArchive,
  hostileTsShapeArchive,
  type ArchiveCase,
  type DamageKind,
  type FileSpec,
  type InstallCase,
  type InstallStep
} from './knownFixOverlay.cases'

const CRATE = 'gamelib-knownfix'
const ARCHIVE_SLICE = 'overlay_archive'
const INSTALL_SLICE = 'overlay_install'
/** The case counts this plan committed; a later edit may raise them, never lower them. */
const ARCHIVE_FLOOR = 1
const INSTALL_FLOOR = 1
const FIXTURE_ID = 'test-overlay-1'
const DEFAULT_DEADLINE_MS = 120_000

const mode = engineWineOracleMode()

const sha256 = (data: Buffer): string =>
  createHash('sha256').update(data).digest('hex')
const dataOf = (f: FileSpec): Buffer =>
  f.base64 !== undefined
    ? Buffer.from(f.base64, 'base64')
    : Buffer.from(f.text ?? '')

/**
 * The text a zlib or gunzip failure carries after "bytes (" differs between zlib builds and from the
 * Rust decoder's; the golden holds the token and `deltas.json` says how the replay compares it.
 */
const normaliseMessage = (message: string): string =>
  message.startsWith('overlay archive: gunzip failed or exceeded')
    ? message.replace(/\([\s\S]*\)$/, '(<ZLIB-MESSAGE>)')
    : message

/** The lengths in "archive size N does not match the pinned M" depend on the zlib build: `<A>` is the fetched length. */
const normaliseLengths = (text: string): string =>
  text.replace(
    /archive size (\d+) does not match the pinned (\d+)/,
    (_all, got: string, pinned: string) =>
      `archive size <A> does not match the pinned <A${Number(pinned) - Number(got) >= 0 ? '+' : ''}${Number(pinned) - Number(got)}>`
  )

// ---------------------------------------------------------------------------------------------
// overlay_archive
// ---------------------------------------------------------------------------------------------

type ArchiveStepResult = Record<string, unknown>

async function runArchiveStep(
  s: ArchiveCase['steps'][number]
): Promise<ArchiveStepResult> {
  const filesOf = (files: FileSpec[]) =>
    files.map((f) => ({ path: f.path, data: dataOf(f) }))
  const listOf = (map: Map<string, Buffer>) =>
    [...map].map(([path, data]) => ({
      path,
      size: data.length,
      sha256: sha256(data)
    }))
  switch (s.op) {
    case 'build': {
      try {
        const out = buildOverlayTarGz(filesOf(s.files))
        const tar = gunzipSync(out)
        return {
          op: s.op,
          label: s.label ?? null,
          error: null,
          size: out.length,
          sha256: sha256(out),
          tarSize: tar.length,
          tarSha256: sha256(tar),
          base64: out.length < 64 * 1024 ? out.toString('base64') : null
        }
      } catch (error) {
        return {
          op: s.op,
          label: s.label ?? null,
          error: (error as Error).message
        }
      }
    }
    case 'buildPair': {
      const one = buildOverlayTarGz(filesOf(s.files))
      const two = buildOverlayTarGz([...filesOf(s.files)].reverse())
      return {
        op: s.op,
        identical: one.equals(two),
        size: one.length,
        sha256: sha256(one)
      }
    }
    case 'buildHeader': {
      const arc = buildOverlayTarGz(filesOf(s.files))
      const tar = gunzipSync(arc)
      const h = tar.subarray(0, 512)
      const cString = (start: number, len: number) => {
        const slice = h.subarray(start, start + len)
        const nul = slice.indexOf(0)
        return slice.subarray(0, nul === -1 ? len : nul).toString('latin1')
      }
      return {
        op: s.op,
        gzipMtime: arc.readUInt32LE(4),
        gzipOsByte: arc[9],
        tarLengthModulo10240: tar.length % 10240,
        tarSize: tar.length,
        tarSha256: sha256(tar),
        firstEntry: {
          name: cString(0, 100),
          mode: cString(100, 8),
          uid: cString(108, 8),
          gid: cString(116, 8),
          size: cString(124, 12),
          mtime: cString(136, 12),
          checksum: h.subarray(148, 156).toString('latin1'),
          typeflag: h.subarray(156, 157).toString('latin1'),
          linkname: cString(157, 100),
          magic: h.subarray(257, 263).toString('latin1'),
          version: h.subarray(263, 265).toString('latin1'),
          unameAndGnameAreZero: h.subarray(265, 329).every((b) => b === 0),
          prefixIsZero: h.subarray(345, 500).every((b) => b === 0)
        }
      }
    }
    case 'roundTrip': {
      const files = filesOf(s.files)
      const out = await readOverlayTarGz(
        buildOverlayTarGz(files),
        new Map(Object.entries(s.expected)),
        s.cap
      )
      return {
        op: s.op,
        files: listOf(out),
        byteExact: files.every((f) => out.get(f.path)?.equals(f.data) === true)
      }
    }
    case 'read': {
      try {
        const out = await readOverlayTarGz(
          Buffer.from(s.archiveBase64, 'base64'),
          new Map(Object.entries(s.expected)),
          s.cap
        )
        return { op: s.op, label: s.label, ok: true, files: listOf(out) }
      } catch (error) {
        return {
          op: s.op,
          label: s.label,
          ok: false,
          message: normaliseMessage((error as Error).message)
        }
      }
    }
  }
}

async function recordArchiveCase(c: ArchiveCase): Promise<unknown> {
  return withEngineOracleProfile((profile) =>
    withInjected([injectPlatform('mac')], () =>
      withPinnedBaseEnv(profile.fake, async () => {
        const steps: ArchiveStepResult[] = []
        for (const s of c.steps) steps.push(await runArchiveStep(s))
        return { steps }
      })
    )
  )
}

// ---------------------------------------------------------------------------------------------
// overlay_install
// ---------------------------------------------------------------------------------------------

interface InstallRecord {
  result: unknown
  events: LogLine[]
  tree: unknown[]
}

async function recordInstallCase(c: InstallCase): Promise<InstallRecord> {
  return withEngineOracleProfile(async (profile) => {
    const events: LogLine[] = []
    let step = 0
    const stepOf = () => step
    const flags = { started: false }

    const payload = (c.payload ?? PAYLOAD).map((f) => ({
      path: f.path,
      data: dataOf(f)
    }))
    const goodArchive = buildOverlayTarGz(payload)
    const dotdotArchive = hostileDotdotArchive()
    const tsShapeArchive = hostileTsShapeArchive()
    const entryFor = (
      archive: Buffer,
      id = FIXTURE_ID
    ): KnownFixOverlayCatalogueEntry => ({
      id,
      target: 'gstreamer-plugin-path',
      pluginSubdir: 'lib/gstreamer-1.0',
      platform: { os: 'darwin', wine: 'crossover' },
      release: { repo: 'o/r', tag: 't', asset: 'a.tar.gz' },
      archiveSha256: sha256(archive),
      archiveSize: archive.length,
      files: payload.map((f) => ({
        path: f.path,
        sha256: sha256(f.data),
        size: f.data.length
      }))
    })
    const pinned = (
      kind: NonNullable<Extract<InstallStep, { op: 'ensure' }>['pins']>,
      id: string
    ) => {
      switch (kind) {
        case 'zero-sha':
          return {
            entry: {
              ...entryFor(goodArchive, id),
              archiveSha256: '0'.repeat(64)
            },
            archive: goodArchive
          }
        case 'size-plus-one':
          return {
            entry: {
              ...entryFor(goodArchive, id),
              archiveSize: goodArchive.length + 1
            },
            archive: goodArchive
          }
        case 'hostile-ts-shape':
          return {
            entry: entryFor(tsShapeArchive, id),
            archive: tsShapeArchive
          }
        case 'hostile-dotdot':
          return { entry: entryFor(dotdotArchive, id), archive: dotdotArchive }
        default:
          return { entry: entryFor(goodArchive, id), archive: goodArchive }
      }
    }

    const rootA = profile.paths.knownFixOverlaysPath
    const rootB = join(profile.home, 'overlays-b')
    const installs = {
      A: createKnownFixOverlayInstalls(),
      B: createKnownFixOverlayInstalls()
    }
    const aborts = createAbortRegistry()
    const installedDir = join(rootA, FIXTURE_ID)

    const deps = {
      paths: {
        ...profile.paths,
        bundledFixesPath: join(profile.home, 'public', 'fixes')
      }
    }

    const results: unknown[] = []
    const restoreLogs = spyLogs(events, stepOf, ['debug', 'info', 'warning'])

    const scriptedInstaller = (
      install: 'dir' | 'null' | 'reject',
      ensureCalls: { id: string; label: string }[]
    ) => ({
      ensureOverlayInstalled: (
        entry: KnownFixOverlayCatalogueEntry,
        ctx: { label: string }
      ) => {
        ensureCalls.push({ id: entry.id, label: ctx.label })
        if (install === 'null') return Promise.resolve(null)
        if (install === 'reject') return Promise.reject(new Error('boom'))
        return Promise.resolve(join(rootA, entry.id))
      }
    })
    const expand = <T>(v: T): T => expandDeepWith(v, profile)

    const run = async (s: InstallStep): Promise<unknown> => {
      switch (s.op) {
        case 'ensure': {
          const id = s.entryId ?? FIXTURE_ID
          const { entry, archive } = pinned(s.pins ?? 'good', id)
          const fetches: {
            boot: string
            url: string
            maxBytesMinusPinnedArchive: number
          }[] = []
          const signals: AbortSignal[] = []
          const fetchFor =
            (boot: string): OverlayArchiveFetch =>
            (url, { signal, maxBytes }) => {
              fetches.push({
                boot,
                url,
                maxBytesMinusPinnedArchive: maxBytes - archive.length
              })
              signals.push(signal)
              switch (s.fetch) {
                case 'reject':
                  return Promise.reject(new Error('HTTP 500'))
                case 'never':
                  flags.started = true
                  return new Promise<Buffer>(() => undefined)
                case 'wrong-bytes':
                  return Promise.resolve(Buffer.alloc(goodArchive.length, 0x78))
                case 'hostile-ts-shape':
                  return Promise.resolve(tsShapeArchive)
                case 'hostile-dotdot':
                  return Promise.resolve(dotdotArchive)
                default:
                  return Promise.resolve(goodArchive)
              }
            }
          const ctx = { label: 'test', logPrefix: LogPrefix.Backend }
          const callList = s.calls ?? [{ boot: 'A' as const }]
          const start = () =>
            Promise.all(
              callList.map((call) => {
                const root = call.boot === 'A' ? rootA : rootB
                return installs[call.boot].ensureOverlayInstalled(entry, ctx, {
                  aborts,
                  paths: { knownFixOverlaysPath: root },
                  overlaysRoot: root,
                  fetchArchive: fetchFor(call.boot),
                  ...(s.timeoutMs !== undefined
                    ? { timeoutMs: s.timeoutMs }
                    : {})
                })
              })
            )
          const dirs =
            s.fetch === 'never'
              ? await withFakeClock(start, () => {
                  if (!flags.started) return null
                  flags.started = false
                  if (s.abort) {
                    aborts.call(`known-fix-overlay:${id}`)
                    return null
                  }
                  return s.timeoutMs ?? DEFAULT_DEADLINE_MS
                })
              : await start()
          return {
            op: s.op,
            entryId: id,
            pins: s.pins ?? 'good',
            fetch: s.fetch,
            timeoutMs: s.timeoutMs ?? null,
            calls: callList.map((call, i) => ({
              boot: call.boot,
              dir: dirs[i] ?? null
            })),
            // Concurrent boots reach their fetch in the order their file system checks finish, which is
            // not fixed; the golden lists them by boot.
            fetches: [...fetches].sort((a, b) => a.boot.localeCompare(b.boot)),
            signalsAbortedAfterwards: signals.map((x) => x.aborted),
            registryStillHolds: aborts.has(`known-fix-overlay:${id}`),
            leftovers: existsSync(rootA)
              ? readdirSync(rootA).filter((n) => n.startsWith('.'))
              : [],
            escapedFileExists: existsSync(join(rootA, '..', 'x'))
          }
        }
        case 'damage': {
          const d = installedDir
          const damages: Record<DamageKind, () => void> = {
            'extra-in-plugin-subdir': () =>
              writeFileSync(join(d, 'lib/gstreamer-1.0/extra.dylib'), 'x'),
            'corrupted-file': () =>
              writeFileSync(join(d, 'lib/libdep.1.dylib'), 'xxxxxxxxxxxxxxxx'),
            'wrong-size': () =>
              writeFileSync(join(d, 'lib/libdep.1.dylib'), 'short'),
            'symlink-in-place-of-a-file': () => {
              rmSync(join(d, 'lib/libdep.1.dylib'))
              writeFileSync(join(rootA, 'real'), 'dependency bytes')
              symlinkSync(join(rootA, 'real'), join(d, 'lib/libdep.1.dylib'))
            },
            'lib-is-a-symlink': () => {
              const moved = join(rootA, 'lib-moved')
              renameSync(join(d, 'lib'), moved)
              symlinkSync(moved, join(d, 'lib'))
            },
            'extra-root-file': () => writeFileSync(join(d, 'SHA256SUMS'), 'x')
          }
          damages[s.kind]()
          return { op: s.op, kind: s.kind }
        }
        case 'verify': {
          const outcome = await verifyInstalledOverlay(
            installedDir,
            entryFor(goodArchive)
          )
          // A file system error reaches the module from outside the jest realm, so `instanceof Error` is false
          // there and the module prints `Error: ENOENT...`; in the app the message has no such prefix.
          return {
            op: s.op,
            target: s.target ?? 'installed',
            ...(outcome.ok
              ? outcome
              : { ok: false, reason: outcome.reason.replace(/^Error: /, '') })
          }
        }
        case 'validate': {
          const out = validateOverlayEntries(s.raw, {
            label: 'test',
            logPrefix: LogPrefix.Backend
          })
          return { op: s.op, raw: s.raw ?? null, ids: out.map((e) => e.id) }
        }
        case 'resolveEnv': {
          const ensureCalls: { id: string; label: string }[] = []
          const asked: Record<string, string | null> = {}
          const base = expand(s.base)
          const result = await resolveKnownFixOverlayEnv(s.raw, {
            label: 'test',
            logPrefix: LogPrefix.Backend,
            wineType: s.wineType,
            platform: s.platform,
            baseValue: (key) => {
              asked[key] = base[key] ?? null
              return base[key]
            },
            deps: {
              aborts: {
                create: () => new AbortController(),
                delete: () => undefined
              },
              paths: { knownFixOverlaysPath: rootA },
              appRuntime: {
                overlayInstalls: scriptedInstaller(s.install, ensureCalls)
              }
            } as never
          })
          return {
            op: s.op,
            raw: s.raw ?? null,
            platform: s.platform,
            wineType: s.wineType ?? null,
            base: s.base,
            install: s.install,
            result,
            baseAsked: asked,
            ensureCalls
          }
        }
        case 'profileEnv': {
          const ensureCalls: { id: string; label: string }[] = []
          delete process.env.GST_PLUGIN_PATH
          for (const [k, v] of Object.entries(s.processEnv)) process.env[k] = v
          const result = await knownFixProfileOverlayEnv(
            {
              aborts: {
                create: () => new AbortController(),
                delete: () => undefined
              },
              paths: { ...deps.paths, knownFixOverlaysPath: rootA },
              appRuntime: {
                overlayInstalls: scriptedInstaller(s.install, ensureCalls)
              }
            } as never,
            s.appName,
            s.runner,
            expand(s.settings) as unknown as GameSettings,
            expand(s.tier1Env)
          )
          return {
            op: s.op,
            appName: s.appName,
            runner: s.runner,
            settings: s.settings,
            tier1Env: s.tier1Env,
            processEnv: s.processEnv,
            result,
            ensureCalls
          }
        }
        case 'appendPathList':
          return {
            op: s.op,
            existing: s.existing ?? null,
            dir: s.dir,
            result: appendPathList(s.existing, s.dir)
          }
        case 'lastEnvOption':
          return {
            op: s.op,
            options: s.options ?? null,
            key: s.key,
            result: lastEnvOption(s.options, s.key) ?? null
          }
        case 'formatLine':
          return {
            op: s.op,
            entries: s.entries,
            result: formatKnownFixEnvLine(s.entries)
          }
        case 'logLine':
          return {
            op: s.op,
            label: s.label,
            entries: s.entries,
            result: logKnownFixEnv(s.label, s.entries, LogPrefix.Backend)
          }
        case 'withEnv': {
          const settings = s.settings as unknown as GameSettings
          const before = settings.enviromentOptions?.length ?? null
          const out = withKnownFixEnv(settings, s.env)
          return {
            op: s.op,
            settings: s.settings,
            env: s.env,
            result: out,
            isTheSameObject: out === settings,
            originalOptionCountAfter:
              settings.enviromentOptions?.length ?? null,
            originalOptionCountBefore: before
          }
        }
        case 'filterTier1': {
          const out = filterTier1KnownFixes(
            s.appName,
            s.layer,
            s.parsed as never
          ) as Record<string, unknown> | null
          return {
            op: s.op,
            appName: s.appName,
            layer: s.layer,
            parsed: s.parsed,
            result: out,
            hasOverlays: out !== null && 'overlays' in out
          }
        }
        case 'catalogue': {
          const real = lookupKnownFixOverlay('gst-libav-1.24.13')
          if (!real)
            throw new Error('gst-libav-1.24.13 is not in the catalogue')
          return {
            op: s.op,
            paths: real.files.map((f) => f.path),
            everyFileShaIs64Hex: real.files.every((f) =>
              /^[0-9a-f]{64}$/.test(f.sha256)
            ),
            totalFileBytes: real.files.reduce((n, f) => n + f.size, 0),
            archiveSha256: real.archiveSha256,
            archiveSize: real.archiveSize,
            url: overlayArchiveUrl(real),
            pluginSubdir: real.pluginSubdir,
            filesInPluginSubdir: real.files.filter((f) =>
              f.path.startsWith('lib/gstreamer-1.0/')
            ).length,
            tableHoldsThisEntry: KNOWN_FIX_OVERLAY_CATALOGUE[real.id] === real,
            protoLookup: lookupKnownFixOverlay('__proto__') ?? null,
            constructorLookup: lookupKnownFixOverlay('constructor') ?? null
          }
        }
      }
    }

    await withInjected([injectPlatform('mac'), restoreLogs], () =>
      withPinnedBaseEnv(profile.fake, async () => {
        for (const [index, s] of c.steps.entries()) {
          step = index
          if (s.seed) seedProfile(profile, s.seed)
          results.push(await run(s))
        }
      })
    )

    const clean = <T>(value: T): T =>
      dropRealpathPrefix(
        normalisePaths(
          JSON.parse(JSON.stringify(value), (_k, v) =>
            typeof v === 'string' ? normaliseLengths(v) : v
          ) as T,
          profile
        )
      )
    return {
      result: clean({ steps: results }),
      events: clean(events),
      tree: clean(snapshotTree(profile.home))
    }
  })
}

/** Expands every placeholder in every string of a JSON-shaped value onto the profile. */
function expandDeepWith<T>(value: T, profile: EngineOracleProfile): T {
  const walk = (node: unknown): unknown => {
    if (typeof node === 'string') return expandPlaceholders(node, profile)
    if (Array.isArray(node)) return node.map(walk)
    if (node !== null && typeof node === 'object') {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v)
        ])
      )
    }
    return node
  }
  return walk(value) as T
}

// ---------------------------------------------------------------------------------------------
// The tests
// ---------------------------------------------------------------------------------------------

function writeCases(slice: string, built: unknown): void {
  if (mode !== 'write') return
  const file = join(goldenDir(CRATE, slice), 'cases.json')
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, json(built))
}

describeSkipOnWindows('known-fix overlay archive oracle (88-06)', () => {
  const built = buildArchiveCases()
  writeCases(ARCHIVE_SLICE, built)
  const cases = loadCases<ArchiveCase>(CRATE, ARCHIVE_SLICE)

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)('$id', async (c) => {
    const result = await recordArchiveCase(c)
    writeOrCompareGolden(CRATE, ARCHIVE_SLICE, c.id, { result })
  })

  it('every title of knownFixOverlayArchive.test.ts is a named case, one for one', () => {
    const ids = cases
      .filter((c) => c.id.startsWith('knownFixOverlayArchive--'))
      .map((c) => c.id.slice('knownFixOverlayArchive--'.length))
    const titles = tsTestTitles(
      join(__dirname, '..', 'knownFixOverlayArchive.test.ts')
    )
    assertCasesCoverTitles(ids, titles, {})
    expect([...ids].sort()).toEqual(titles.map(slug).sort())
  })

  it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
    syncManifest(CRATE, ARCHIVE_SLICE, cases, cases.length)
    assertManifest(CRATE, ARCHIVE_SLICE, cases, ARCHIVE_FLOOR)
  })

  it('an empty case list fails the manifest check', () => {
    expectEmptyCasesToFail(CRATE, ARCHIVE_SLICE, ARCHIVE_FLOOR)
  })
})

describeSkipOnWindows(
  'known-fix overlay install and env oracle (88-06)',
  () => {
    const built = buildInstallCases()
    writeCases(INSTALL_SLICE, built)
    const cases = loadCases<InstallCase>(CRATE, INSTALL_SLICE)

    it('cases.json is exactly what the case builder produces', () => {
      expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
    })

    it.each(cases)('$id', async (c) => {
      const { result, events, tree } = await recordInstallCase(c)
      writeOrCompareGolden(CRATE, INSTALL_SLICE, c.id, {
        result,
        events,
        after: tree
      })
    })

    it.each([
      ['knownFixOverlayInstall', 'knownFixOverlayInstall.test.ts'],
      ['knownFixOverlays', 'knownFixOverlays.test.ts']
    ])('every title of %s is a named case, one for one', (stem, file) => {
      const ids = cases
        .filter((c) => c.id.startsWith(`${stem}--`))
        .map((c) => c.id.slice(`${stem}--`.length))
      const titles = tsTestTitles(join(__dirname, '..', file))
      assertCasesCoverTitles(ids, titles, {})
      expect([...ids].sort()).toEqual(titles.map(slug).sort())
    })

    it('no case reaches the real catalogue archive: the fixture entry is the only one installed', () => {
      for (const c of cases) {
        for (const s of c.steps) {
          if (s.op === 'ensure') {
            expect(s.entryId ?? FIXTURE_ID).not.toBe('gst-libav-1.24.13')
          }
        }
      }
    })

    it('the committed MANIFEST agrees with the case list and holds one folder per case', () => {
      syncManifest(CRATE, INSTALL_SLICE, cases, cases.length)
      assertManifest(CRATE, INSTALL_SLICE, cases, INSTALL_FLOOR)
    })

    it('an empty case list fails the manifest check', () => {
      expectEmptyCasesToFail(CRATE, INSTALL_SLICE, INSTALL_FLOOR)
    })
  }
)
