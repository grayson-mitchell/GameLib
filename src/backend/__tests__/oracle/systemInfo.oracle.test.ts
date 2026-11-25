/**
 * The system-information oracle (88.1-05, D-11, D-12, D-13, D-14, D-15, D-20, D-22, D-24, D-25): `getSystemInfo` and
 * `formatSystemInfo` from `utils/systeminfo`, driven over injected probes and recorded as the golden the Rust
 * `gamelib-info` system-information port has to reproduce. The golden exists before any Rust port does.
 *
 * Slice `gamelib-info/tests/fixtures/golden/sysinfo/`:
 *   cases.json      built from the case tables below (write mode rewrites it, compare mode checks it)
 *   deltas.json     the documented Rust-side differences (D-19), empty in 88.1-05
 *   MANIFEST.json   `{ count, floor }`
 *   expected/<case>/input.json     the case: the call (`info`, `sequence` or `filesize`) and the whole scenario
 *   expected/<case>/result.json    `info`: `{ systemInfo }` or `{ error }` (the message `getSystemInfo` rejected
 *                                  with); `sequence`: `{ calls }`, one entry per awaited call with its result and
 *                                  `sameObjectAs` (the earlier call whose resolved object it is, by identity);
 *                                  `filesize`: `{ vectors }`
 *   expected/<case>/text.json      `formatSystemInfo(result)` under the injected platform: `{ text }`, or `null`
 *                                  when there was no result
 *   expected/<case>/spawns.json    every probe spawn (`lspci`, `free`, `sysctl`, `vm_stat`, the two PowerShell
 *                                  queries, the comet `--version` run) with argv, the env it set, `replaceEnv`,
 *                                  stdin, its timeout and its scripted result
 *   expected/<case>/versions.json  every `runRunnerCommand` the legendary, gogdl and nile version probes made:
 *                                  the args (an `undefined` field is `null`) and the options (`abortId`)
 *   expected/<case>/dns.json       every pci.ids DNS TXT lookup name with the answer it was scripted to give
 *   expected/<case>/cache.json     `{ before, after }`: the entries of `pci_ids_device` and `pci_ids_vendor`
 *   expected/<case>/events.json    the backend log lines (`{ seq, level, prefix, text }`)
 *
 * Every entry of spawns, versions, dns and events carries a `seq` from one counter, so the interleaving of a
 * probe, a version call, a lookup and a log line is recoverable (D-25).
 *
 * What is injected (D-13): the platform and `process.arch`, `os.cpus()`, `os.release()`, `os.totalmem()`,
 * `os.freemem()`, the three os-release file locations (`stat` and `readFile` of `fs/promises` answer for those
 * three absolute paths only), `FLATPAK_ID` and `APPIMAGE`, `isSteamDeckGameMode`, the spawn runner, the three
 * library managers and `dns.resolveTxt`. Linux, mac and Windows are all recorded on one machine.
 *
 * `pci_ids.ts` promisifies `dns.resolveTxt` when it loads, so the spy goes on before the modules are required, and the
 * modules are required inside `jest.isolateModules` (a fresh registry), together with the `logger` and
 * `constants/environment` instances they use. The spy's answer is set per case.
 *
 * The two pci caches are real `CacheStore`s over the fake HOME's store root, on a pinned clock (only `Date` is
 * faked): an entry is seeded `ageDays` before the pinned now, so the 7-day lifespan is exercised without waiting.
 *
 * Flagged assumption (spec-less edge probe): the edge-coverage row of SVC-03 is unclassified and unresolved; the
 * D-14 matrix stands in for edge coverage and is not claimed as a verified edge.
 *
 * Modes (see testUtils/engineWineOracle/harness.ts):
 *   GAMELIB_WRITE_ENGINE_GOLDEN=1    rewrite cases.json, deltas.json, MANIFEST.json and every expected/ folder
 *   (default)                        recompute and compare, offline
 *
 * Isolation (D-12, D-22, T-88.1-08, T-88.1-09): every case runs on a fresh fake HOME inside `withPinnedBaseEnv`
 * (eleven env keys). No real probe binary runs, no DNS query leaves the machine and no manager runner runs: an
 * unscripted spawn, lookup or runner call fails the case by name, and so does a scripted one nobody made.
 * Behaviour that looks wrong is kept as recorded and filed as a todo (D-20); a fix is never mixed into a golden diff.
 */
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { filesize } from 'filesize'
import { describeSkipOnWindows } from 'backend/__tests__/skip'
import {
  assertManifest,
  expectEmptyCasesToFail,
  goldenDir,
  loadCases,
  normalisePaths,
  syncManifest,
  withEngineOracleProfile,
  type EngineOracleProfile,
  type OraclePlatform,
  type SeedEntry
} from 'backend/testUtils/engineWineOracle/harness'
import { engineWineOracleMode } from 'backend/testUtils/engineWineOracle/recorder'
import {
  createSpawnTracer,
  type SpawnTracerOptions
} from 'backend/testUtils/engineWineOracle/spawnTrace'
import { withPinnedBaseEnv } from 'backend/testUtils/launchOracle/baseEnv'
import {
  assertCasesCoverTitles,
  slug,
  tsTestTitles
} from 'backend/testUtils/launchOracle/census'
import {
  injectPlatform,
  injectProbe,
  withInjected
} from 'backend/testUtils/launchOracle/probes'
import { createTestStoreRoot } from 'backend/testUtils/testStoreRoot'
import type { ProcessRunner } from 'backend/process/types'
import type { SystemInfoDeps } from 'backend/utils/systeminfo'

const CRATE = 'gamelib-info'
const SLICE = 'sysinfo'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const SYSINFO_FLOOR = 1

const mode = engineWineOracleMode()

// ---------------------------------------------------------------------------------------------
// The core modules a case injects into, and the fresh module registry the code under test runs in
// ---------------------------------------------------------------------------------------------

/* eslint-disable @typescript-eslint/no-require-imports */
const osModule = (): typeof import('os') => require('os')
const dnsModule = (): typeof import('dns') => require('dns')
const fsPromisesModule = (): typeof import('fs/promises') =>
  require('fs/promises')
/* eslint-enable @typescript-eslint/no-require-imports */

interface Fresh {
  systeminfo: typeof import('backend/utils/systeminfo')
  pciIds: typeof import('backend/utils/systeminfo/gpu/pci_ids')
  logger: typeof import('backend/logger')
  environment: typeof import('backend/constants/environment')
}

let fresh: Fresh | null = null
const freshModules = (): Fresh => {
  if (!fresh) throw new Error('the fresh module registry is not loaded')
  return fresh
}

type DnsCallback = (error: Error | null, records?: string[][]) => void
let dnsSpy: jest.SpyInstance | null = null
let dnsHandler: (name: string, callback: DnsCallback) => void = (name) => {
  throw new Error(`dns.resolveTxt(${name}) outside a case`)
}

/** Loads the code under test after the `dns.resolveTxt` spy exists, in a registry of its own. */
function loadFresh(): void {
  const spy = jest.spyOn(dnsModule(), 'resolveTxt') as jest.SpyInstance
  dnsSpy = spy
  jest.isolateModules(() => {
    /* eslint-disable @typescript-eslint/no-require-imports */
    fresh = {
      systeminfo: require('backend/utils/systeminfo'),
      pciIds: require('backend/utils/systeminfo/gpu/pci_ids'),
      logger: require('backend/logger'),
      environment: require('backend/constants/environment')
    }
    /* eslint-enable @typescript-eslint/no-require-imports */
  })
}

// ---------------------------------------------------------------------------------------------
// The case tables
// ---------------------------------------------------------------------------------------------

/** What one probe's spawn answers. `throws` is a spawn failure (the binary is missing). */
interface Script {
  code?: number | null
  stdout?: string
  stderr?: string
  timedOut?: true
  throws?: string
}

/** What one manager's `runRunnerCommand` answers. */
interface ManagerAnswer {
  stdout?: string
  stderr?: string
  error?: string
  abort?: true
}

/** One scripted DNS TXT answer: the records, or a lookup failure. */
type Dns = { txt: string[][] } | { error: string }

/** A cache entry present before the case runs, written `ageDays` before the pinned now. */
interface CacheSeed {
  key: string
  value: string
  ageDays: number
}

interface Scenario {
  platform: OraclePlatform
  arch: 'x64' | 'arm64'
  osRelease: string
  cpu: { model: string; cores: number }
  totalmem: number
  freemem: number
  env: { FLATPAK_ID?: string; APPIMAGE?: string }
  steamDeckGameMode: boolean
  /** The os-release locations that exist, with their contents; the others do not exist. */
  osReleaseFiles: Record<string, string>
  appVersion: string
  /** The `altCometBin` setting, or `null` for the bundled path under `<HOME>/public`. */
  altCometBin: string | null
  lspci: Script | null
  free: Script | null
  sysctl: Script | null
  vmStat: Script | null
  powershellGpu: Script | null
  powershellOs: Script | null
  comet: Script | null
  /** `null`: no version probe is reached, and one that is made fails the case. */
  managers: {
    legendary: ManagerAnswer
    gog: ManagerAnswer
    nile: ManagerAnswer
  } | null
  /** Lookup name (`<labels>.pci.id.ucw.cz`) to answer; a name nobody scripted fails the case. */
  dns: Record<string, Dns>
  caches: { device: CacheSeed[]; vendor: CacheSeed[] }
}

type Step =
  | { op: 'start'; call: string; cache?: boolean }
  | { op: 'settle' }
  | { op: 'await'; call: string }
  | { op: 'newCache' }

type Call =
  | { kind: 'info' }
  | { kind: 'sequence'; steps: Step[] }
  | { kind: 'filesize'; values: number[] }

interface SysCase {
  id: string
  call: Call
  scenario: Scenario | null
}

const GIB = 1024 ** 3
/** The pinned now of every case. */
const NOW = Date.parse('2026-11-25T12:00:00.000Z')
const DAY_MS = 86_400_000

const rec = (fields: Record<string, string>): string =>
  Object.entries(fields)
    .map(([k, v]) => `${k}:\t${v}`)
    .join('\n')

const gpuRec = (
  cls: string,
  vendor: string,
  device: string,
  driver?: string,
  sub?: [string, string]
): string =>
  rec({
    Slot: '04:00.0',
    Class: cls,
    Vendor: vendor,
    Device: device,
    ...(sub ? { SVendor: sub[0], SDevice: sub[1] } : {}),
    Rev: 'ae',
    ProgIf: '00',
    ...(driver ? { Driver: driver, Module: driver } : {})
  })

const BRIDGE = rec({
  Slot: '00:01.1',
  Class: '0604',
  Vendor: '1022',
  Device: '1634',
  Driver: 'pcieport'
})
const USB = rec({
  Slot: '00:14.0',
  Class: '0c03',
  Vendor: '1022',
  Device: '15b6',
  Driver: 'xhci_hcd'
})
const lspciJoin = (...records: string[]): string => records.join('\n\n') + '\n'

const freeOut = (total: number, used: number): string =>
  `               total        used        free      shared  buff/cache   available\nMem:     ${total}  ${used}  1000  100  200  300\nSwap:    0 0 0\n`

const txt = (name: string): Dns => ({ txt: [[`i=${name}`]] })
const NXDOMAIN: Dns = { error: 'ENOTFOUND' }
/** `e445_1da2_73bf_1002` becomes the lookup name `e445.1da2.73bf.1002.pci.id.ucw.cz`. */
const dnsMap = (answers: Record<string, Dns>): Record<string, Dns> =>
  Object.fromEntries(
    Object.entries(answers).map(([key, answer]) => [
      `${key.split('_').join('.')}.pci.id.ucw.cz`,
      answer
    ])
  )

const AMD_VENDOR = 'Advanced Micro Devices, Inc. [AMD/ATI]'
const NAVI21 = 'Navi 21 [Radeon RX 6800/6800 XT / 6900 XT]'
const NVIDIA_VENDOR = 'NVIDIA Corporation'
const INTEL_VENDOR = 'Intel Corporation'

const UBUNTU = [
  'NAME="Ubuntu"',
  'VERSION="22.04.3 LTS (Jammy Jellyfish)"',
  'ID=ubuntu',
  'PRETTY_NAME="Ubuntu 22.04.3 LTS"',
  'VERSION_ID="22.04"',
  'VERSION_CODENAME=jammy',
  ''
].join('\n')

const STEAMOS = [
  'NAME="SteamOS"',
  'PRETTY_NAME="SteamOS Holo"',
  'VERSION_ID="3.5.7"',
  'VERSION_CODENAME=holo',
  ''
].join('\n')

const VM_STAT = [
  'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
  'Pages free:                               12345.',
  'Pages active:                            100000.',
  'Pages inactive:                           90000.',
  'Pages speculative:                            1.',
  'Pages wired down:                         50000.',
  ''
].join('\n')

const MANAGERS_OK = {
  legendary: {
    stdout: 'legendary version "0.20.33", codename "Undue Alarm"\n'
  },
  gog: { stdout: '0.9.2' },
  nile: { stdout: '1.0.4' }
}

const NVIDIA_WIN = {
  AdapterCompatibility: 'NVIDIA',
  DriverVersion: '31.0.15.3713',
  PnPDeviceID: 'PCI\\VEN_10DE&DEV_2684&SUBSYS_88EE1043&REV_A1\\4&1A2B3C&0&0008'
}
const AMD_WIN = {
  AdapterCompatibility: 'Advanced Micro Devices, Inc.',
  DriverVersion: '31.0.21001.1',
  PnPDeviceID: 'PCI\\VEN_1002&DEV_1681&SUBSYS_88231043&REV_C7\\4&2B3C4D&0&0108'
}
const INTEL_WIN = {
  AdapterCompatibility: 'Intel Corporation',
  DriverVersion: '1.2.3',
  PnPDeviceID: 'PCI\\VEN_8086&DEV_1234&SUBSYS_5678ABCD'
}
const WIN_OS = JSON.stringify({
  Caption: 'Microsoft Windows 11 Pro',
  Version: '10.0.22631'
})

const NVIDIA_WIN_DNS = {
  '88ee_1043_2684_10de': txt('AD104 [GeForce RTX 4070]'),
  '10de': txt(NVIDIA_VENDOR)
}

/** A Linux box with one AMD GPU, every probe answering, every manager answering. */
function linuxBase(): Scenario {
  return {
    platform: 'linux',
    arch: 'x64',
    osRelease: '6.5.0-31-generic',
    cpu: { model: 'AMD Ryzen 7 5800X 8-Core Processor', cores: 16 },
    totalmem: 16 * GIB,
    freemem: 4 * GIB,
    env: {},
    steamDeckGameMode: false,
    osReleaseFiles: { '/etc/os-release': UBUNTU },
    appVersion: '2.15.0',
    altCometBin: '/pins/bin/comet',
    lspci: {
      stdout: lspciJoin(
        BRIDGE,
        gpuRec('0300', '1002', '73bf', 'amdgpu', ['1da2', 'e445']),
        USB
      )
    },
    free: { stdout: freeOut(16642998272, 5500000000) },
    sysctl: null,
    vmStat: null,
    powershellGpu: null,
    powershellOs: null,
    comet: { stdout: 'comet 0.1.3\n' },
    managers: structuredClone(MANAGERS_OK),
    dns: dnsMap({
      e445_1da2_73bf_1002: txt(NAVI21),
      '1002': txt(AMD_VENDOR)
    }),
    caches: { device: [], vendor: [] }
  }
}

function macBase(): Scenario {
  return {
    ...linuxBase(),
    platform: 'mac',
    arch: 'arm64',
    osRelease: '23.4.0',
    cpu: { model: 'Apple M2 Pro', cores: 12 },
    totalmem: 32 * GIB,
    freemem: 6 * GIB,
    osReleaseFiles: {},
    lspci: null,
    free: null,
    sysctl: { stdout: '16384\n' },
    vmStat: { stdout: VM_STAT },
    dns: {}
  }
}

function windowsBase(): Scenario {
  return {
    ...linuxBase(),
    platform: 'windows',
    osRelease: '10.0.22631',
    cpu: { model: '12th Gen Intel(R) Core(TM) i7-12700K', cores: 20 },
    totalmem: 32 * GIB,
    freemem: 12 * GIB,
    osReleaseFiles: {},
    lspci: null,
    free: null,
    powershellGpu: { stdout: JSON.stringify(NVIDIA_WIN) },
    powershellOs: { stdout: WIN_OS },
    dns: dnsMap(NVIDIA_WIN_DNS)
  }
}

const L = (over: Partial<Scenario> = {}): Scenario => ({
  ...linuxBase(),
  ...over
})
const M = (over: Partial<Scenario> = {}): Scenario => ({
  ...macBase(),
  ...over
})
const W = (over: Partial<Scenario> = {}): Scenario => ({
  ...windowsBase(),
  ...over
})

/** A Steam Deck: the APU model the CPU reports and the GPU device id lspci lists, in a session mode. */
const deck = (
  apu: '0405' | '0932',
  device: string,
  gameMode: boolean,
  over: Partial<Scenario> = {}
): Scenario =>
  L({
    cpu: { model: `AMD Custom APU ${apu}`, cores: 8 },
    totalmem: 16 * GIB,
    steamDeckGameMode: gameMode,
    osReleaseFiles: { '/etc/os-release': STEAMOS },
    lspci: { stdout: lspciJoin(gpuRec('0300', '1002', device, 'amdgpu')) },
    dns: dnsMap({
      [`${device}_1002`]: txt('VanGogh [Radeon Custom GPU]'),
      '1002': txt(AMD_VENDOR)
    }),
    ...over
  })

/** A Linux box whose only GPU is `gpu`, with its sub ids; the device and vendor lookups answer. */
const amdGpu = (over: Partial<Scenario> = {}): Scenario => L(over)

// ----- the three systeminfo test files (D-14, D-15): one named case per title

const GPU_LINUX = 'src/backend/utils/systeminfo/__tests__/gpuLinux.test.ts'
const PROBES = 'src/backend/utils/systeminfo/__tests__/probes.test.ts'
const INDEX = 'src/backend/utils/systeminfo/__tests__/index.test.ts'

const PARSE = 'parseLspciGpus'
const LINUX_PROBE = 'getGpuInfo_linux'
const TOLERANCE = 'getGpuInfo tolerance'
const PROBE_SUITE = 'System Information probes spawn through the runner'
const MEMO_SUITE =
  'debug/gog-spawn-reduction fix 3 -- getSystemInfo(deps) in-flight-promise memoization'
const titled = (suite: string, title: string): string =>
  slug(`${suite} > ${title}`)

const info = (id: string, scenario: Scenario): SysCase => ({
  id,
  call: { kind: 'info' },
  scenario
})
const sequence = (id: string, steps: Step[], scenario: Scenario): SysCase => ({
  id,
  call: { kind: 'sequence', steps },
  scenario
})

function systemInfoCases(): SysCase[] {
  const cases: SysCase[] = []
  const add = (...more: SysCase[]): void => {
    cases.push(...more)
  }

  // ----- the tracer: Linux, one AMD GPU with sub ids, every lookup found and written back
  add(
    info(titled(PARSE, 'keeps only the GPU record of a single AMD system'), L())
  )

  return cases
}

// ---------------------------------------------------------------------------------------------
// Recording one case
// ---------------------------------------------------------------------------------------------

interface Recorded {
  input: unknown
  result: unknown
  text: unknown
  spawns: unknown[]
  versions: unknown[]
  dns: unknown[]
  cache: unknown
  events: unknown[]
}

const clone = <T>(value: T): T =>
  value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T)

/** `JSON.stringify` drops an `undefined` field; a golden writes it as `null` instead. */
const nullUndefined = <T>(value: T): T =>
  JSON.parse(
    JSON.stringify(value, (_key, v: unknown) => (v === undefined ? null : v))
  ) as T

const asText = (message: unknown): string =>
  Array.isArray(message) ? message.map(String).join(' ') : String(message)

const OS_RELEASE_PATHS = [
  '/run/host/os-release',
  '/var/lib/snapd/hostfs/etc/os-release',
  '/etc/os-release'
]

const NODE_PLATFORM: Record<OraclePlatform, string> = {
  mac: 'darwin',
  linux: 'linux',
  windows: 'win32'
}

/** `process.arch` says `arch` until the returned function is called (the descriptor is restored). */
function injectArch(arch: string): () => void {
  const original = Object.getOwnPropertyDescriptor(process, 'arch')
  Object.defineProperty(process, 'arch', {
    value: arch,
    configurable: true,
    enumerable: true,
    writable: false
  })
  return () => {
    if (original) Object.defineProperty(process, 'arch', original)
  }
}

/** The path the bundled comet binary resolves to for a scenario with no `altCometBin`. */
const bundledCometPath = (s: Scenario, profile: EngineOracleProfile): string =>
  join(
    profile.home,
    'public',
    'bin',
    s.arch,
    NODE_PLATFORM[s.platform],
    s.platform === 'windows' ? 'comet.exe' : 'comet'
  )

const cometProgram = (s: Scenario, profile: EngineOracleProfile): string =>
  s.altCometBin ?? bundledCometPath(s, profile)

/** The files a case starts from: the bundled comet binary when the case does not name one. */
function seedFor(s: Scenario | null, profile: string): SeedEntry[] {
  if (!s || s.altCometBin !== null) return []
  const name = s.platform === 'windows' ? 'comet.exe' : 'comet'
  return [
    {
      path: `${profile}/public/bin/${s.arch}/${NODE_PLATFORM[s.platform]}/${name}`,
      text: ''
    }
  ]
}

type Scripted = NonNullable<SpawnTracerOptions['scripted']>[number]

function scriptedFor(
  s: Scenario,
  cometPath: string,
  repeat: boolean
): Scripted[] {
  const out: Scripted[] = []
  const push = (
    program: string,
    script: Script | null,
    shape: { argv?: readonly string[]; matchArg?: string }
  ): void => {
    if (!script) return
    const matchArg = shape.matchArg
    out.push({
      program,
      ...(shape.argv ? { argv: shape.argv } : {}),
      ...(matchArg ? { match: (argv) => argv.includes(matchArg) } : {}),
      ...(script.code !== undefined ? { code: script.code } : {}),
      ...(script.stdout !== undefined ? { stdout: script.stdout } : {}),
      ...(script.stderr !== undefined ? { stderr: script.stderr } : {}),
      ...(script.timedOut ? { timedOut: true } : {}),
      ...(script.throws !== undefined ? { throws: script.throws } : {}),
      ...(repeat ? { repeat: true } : {})
    })
  }
  push('lspci', s.lspci, { argv: ['-mm', '-v', '-n', '-k'] })
  push('free', s.free, { argv: ['-b'] })
  push('sysctl', s.sysctl, { argv: ['-n', 'vm.pagesize'] })
  push('vm_stat', s.vmStat, { argv: [] })
  push('powershell', s.powershellGpu, { matchArg: 'Win32_VideoController' })
  push('powershell', s.powershellOs, { matchArg: 'Win32_OperatingSystem' })
  push(cometPath, s.comet, { argv: ['--version'] })
  return out
}

/** The pinned `Date`: only `Date` is faked, so file system and DNS callbacks keep settling. */
function pinClock(): () => void {
  jest.useFakeTimers({
    now: NOW,
    doNotFake: [
      'hrtime',
      'nextTick',
      'performance',
      'queueMicrotask',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'requestIdleCallback',
      'cancelIdleCallback',
      'setImmediate',
      'clearImmediate',
      'setInterval',
      'clearInterval',
      'setTimeout',
      'clearTimeout'
    ]
  })
  return () => jest.useRealTimers()
}

const sortedEntries = (
  cache: ReturnType<Fresh['pciIds']['createPciIdCaches']>['deviceNameCache']
): Record<string, string> =>
  Object.fromEntries(
    cache.entries().sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  )

/** A turn of the real event loop, so a fetch that is only microtasks has finished. */
const settleTurn = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve))

async function recordOnProfile(
  c: SysCase,
  profile: EngineOracleProfile
): Promise<Recorded> {
  const empty = {
    spawns: [] as unknown[],
    versions: [] as unknown[],
    dns: [] as unknown[],
    events: [] as unknown[],
    cache: { before: null, after: null }
  }
  if (c.call.kind === 'filesize') {
    const vectors = c.call.values.map((value) => ({
      value,
      base2: filesize(value, { base: 2 }),
      plain: filesize(value)
    }))
    return {
      input: clone(c),
      result: { vectors },
      text: null,
      ...empty
    }
  }
  const call = c.call
  const s = c.scenario
  if (!s) throw new Error(`case ${c.id}: an info case needs a scenario`)
  const mods = freshModules()

  let seq = 0
  const next = (): number => seq++
  const unscripted: string[] = []
  const spawns: unknown[] = []
  const versions: unknown[] = []
  const dnsLog: unknown[] = []
  const events: unknown[] = []
  const consumedManagers = new Set<string>()
  const consumedDns = new Set<string>()
  const strict = call.kind === 'info'

  // ----- the two pci caches, real CacheStores over the fake HOME, seeded on the pinned clock
  const root = createTestStoreRoot(profile.userData)
  const caches = mods.pciIds.createPciIdCaches({ root })
  const restoreClock = pinClock()
  try {
    for (const [cache, seeds] of [
      [caches.deviceNameCache, s.caches.device],
      [caches.vendorNameCache, s.caches.vendor]
    ] as const) {
      for (const seed of seeds) {
        jest.setSystemTime(NOW - seed.ageDays * DAY_MS)
        cache.set(seed.key as never, seed.value as never)
        jest.setSystemTime(NOW)
      }
    }
    const before = {
      device: sortedEntries(caches.deviceNameCache),
      vendor: sortedEntries(caches.vendorNameCache)
    }

    // ----- the dns answers, spied (installed once, answering per case)
    // `resetMocks` wipes the spy's answer before every test; the spy object itself is what `pci_ids` captured.
    dnsSpy?.mockImplementation(((name: string, callback: DnsCallback) =>
      dnsHandler(name, callback)) as never)
    dnsHandler = (name, callback) => {
      const at = next()
      const answer = s.dns[name]
      if (!answer) {
        unscripted.push(`dns lookup ${name}`)
        dnsLog.push({ seq: at, name, answer: 'UNSCRIPTED' })
        process.nextTick(callback, new Error('unscripted'))
        return
      }
      consumedDns.add(name)
      dnsLog.push({ seq: at, name, answer: clone(answer) })
      process.nextTick(() => {
        if ('error' in answer) {
          callback(
            Object.assign(new Error(`queryTxt ${answer.error} ${name}`), {
              code: answer.error
            })
          )
        } else {
          callback(null, answer.txt)
        }
      })
    }

    // ----- the backend log, spied (not mocked) on the registry the code under test uses
    const logSpies = (
      ['logDebug', 'logInfo', 'logWarning', 'logError'] as const
    ).map((name) => {
      const level = name.slice(3).toLowerCase()
      const spy = jest.spyOn(mods.logger, name)
      spy.mockImplementation(((message: unknown, prefix?: unknown) => {
        events.push({
          seq: next(),
          level,
          prefix: typeof prefix === 'string' ? prefix : null,
          text: asText(message)
        })
      }) as never)
      return () => spy.mockRestore()
    })

    // ----- the os-release files: only the three absolute paths are answered, every other path is untouched
    const fsp = fsPromisesModule()
    const realStat = fsp.stat.bind(fsp)
    const realReadFile = fsp.readFile.bind(fsp)
    const statSpy = jest.spyOn(fsp, 'stat')
    statSpy.mockImplementation(((path: unknown, ...rest: unknown[]) => {
      const p = String(path)
      if (OS_RELEASE_PATHS.includes(p)) {
        return p in s.osReleaseFiles
          ? Promise.resolve({ isFile: () => true })
          : Promise.reject(
              Object.assign(
                new Error(`ENOENT: no such file or directory, stat '${p}'`),
                { code: 'ENOENT' }
              )
            )
      }
      return (realStat as (...a: unknown[]) => unknown)(path, ...rest)
    }) as never)
    const readSpy = jest.spyOn(fsp, 'readFile')
    readSpy.mockImplementation(((path: unknown, ...rest: unknown[]) => {
      const p = String(path)
      const content = s.osReleaseFiles[p]
      if (OS_RELEASE_PATHS.includes(p) && content !== undefined) {
        return Promise.resolve(content)
      }
      if (OS_RELEASE_PATHS.includes(p)) {
        return Promise.reject(
          Object.assign(new Error(`ENOENT: ${p}`), { code: 'ENOENT' })
        )
      }
      return (realReadFile as (...a: unknown[]) => unknown)(path, ...rest)
    }) as never)

    const cpus = Array.from({ length: s.cpu.cores }, () => ({
      model: s.cpu.model,
      speed: 3000,
      times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 }
    }))
    const restores = [
      injectPlatform(s.platform),
      injectArch(s.arch),
      injectProbe(osModule(), 'cpus', (() => cpus) as never),
      injectProbe(osModule(), 'release', (() => s.osRelease) as never),
      injectProbe(osModule(), 'totalmem', (() => s.totalmem) as never),
      injectProbe(osModule(), 'freemem', (() => s.freemem) as never),
      injectProbe(
        mods.environment,
        'isSteamDeckGameMode',
        s.steamDeckGameMode as never
      ),
      () => statSpy.mockRestore(),
      () => readSpy.mockRestore(),
      ...logSpies
    ]

    const comet = cometProgram(s, profile)
    const recorded = await withInjected(restores, () =>
      withPinnedBaseEnv(profile.fake, async () => {
        for (const [key, value] of Object.entries(s.env)) {
          process.env[key] = value
        }
        const tracer = createSpawnTracer({
          baseEnv: { ...process.env },
          scripted: scriptedFor(s, comet, !strict)
        })
        const runner: ProcessRunner = {
          ...tracer.runner,
          run: (program, argv, opts) => {
            const at = next()
            const seen = tracer.records.length
            const done = tracer.runner.run(program, argv, opts)
            done.catch((error: Error) => {
              if (error.message.startsWith('unscripted process call')) {
                unscripted.push(error.message)
              }
            })
            const record =
              tracer.records.length > seen ? tracer.records[seen] : null
            if (record) {
              spawns.push({
                seq: at,
                program: record.program,
                argv: record.argv,
                timeoutMs: opts?.timeoutMs ?? null,
                replaceEnv: opts?.replaceEnv ?? false,
                envDiff: record.envDiff,
                cwd: record.cwd,
                stdin: record.stdin,
                result: record.result
              })
            }
            return done
          }
        }
        const manager = (name: 'legendary' | 'gog' | 'nile') => ({
          runRunnerCommand: (args: unknown, options: unknown) => {
            versions.push({
              seq: next(),
              manager: name,
              args: nullUndefined(args),
              options: clone(options)
            })
            const answer = s.managers?.[name]
            if (!answer) {
              unscripted.push(`runRunnerCommand ${name}`)
              return Promise.resolve({ stdout: '', stderr: '' })
            }
            consumedManagers.add(name)
            return Promise.resolve({
              stdout: answer.stdout ?? '',
              stderr: answer.stderr ?? '',
              ...(answer.error !== undefined ? { error: answer.error } : {}),
              ...(answer.abort ? { abort: true } : {})
            })
          }
        })
        const deps = {
          runner,
          libraryManagers: {
            legendary: manager('legendary'),
            gog: manager('gog'),
            nile: manager('nile')
          },
          stores: { systemInfo: caches },
          config: {
            getSettings: () => ({ altCometBin: s.altCometBin ?? undefined })
          },
          appInfo: { version: s.appVersion },
          paths: { publicDir: join(profile.home, 'public') }
        } as unknown as SystemInfoDeps

        let systemInfoCache = mods.systeminfo.createSystemInfoCache()
        let result: unknown
        let text: unknown = null
        if (call.kind === 'info') {
          try {
            const got = await systemInfoCache.getSystemInfo(deps)
            result = { systemInfo: clone(got) }
            text = { text: await mods.systeminfo.formatSystemInfo(got) }
          } catch (error) {
            result = { error: (error as Error).message }
          }
        } else if (call.kind === 'sequence') {
          const started = new Map<
            string,
            { cache: boolean; instance: number; promise: Promise<unknown> }
          >()
          const resolvedObjects: { call: string; value: unknown }[] = []
          const calls: unknown[] = []
          let instance = 0
          for (const step of call.steps) {
            if (step.op === 'newCache') {
              systemInfoCache = mods.systeminfo.createSystemInfoCache()
              instance += 1
            } else if (step.op === 'settle') {
              await settleTurn()
            } else if (step.op === 'start') {
              const useCache = step.cache ?? true
              const promise = systemInfoCache.getSystemInfo(deps, useCache)
              promise.catch(() => undefined)
              started.set(step.call, { cache: useCache, instance, promise })
            } else {
              const entry = started.get(step.call)
              if (!entry) throw new Error(`${c.id}: no call ${step.call}`)
              try {
                const got = await entry.promise
                const same = resolvedObjects.find((r) => r.value === got)
                resolvedObjects.push({ call: step.call, value: got })
                calls.push({
                  call: step.call,
                  cache: entry.cache,
                  instance: entry.instance,
                  sameObjectAs: same ? same.call : null,
                  systemInfo: clone(got)
                })
                if (text === null) {
                  text = {
                    text: await mods.systeminfo.formatSystemInfo(
                      got as Parameters<
                        typeof mods.systeminfo.formatSystemInfo
                      >[0]
                    )
                  }
                }
              } catch (error) {
                calls.push({
                  call: step.call,
                  cache: entry.cache,
                  instance: entry.instance,
                  error: (error as Error).message
                })
              }
            }
          }
          result = { calls }
        }
        if (strict) tracer.expectAllConsumed()
        return { result, text }
      })
    )

    if (unscripted.length > 0) {
      throw new Error(`case ${c.id}: unscripted ${unscripted.join(', ')}`)
    }
    if (strict) {
      for (const name of Object.keys(s.managers ?? {})) {
        if (!consumedManagers.has(name)) {
          throw new Error(`case ${c.id}: scripted ${name} was never asked`)
        }
      }
      for (const name of Object.keys(s.dns)) {
        if (!consumedDns.has(name)) {
          throw new Error(`case ${c.id}: scripted dns ${name} was never asked`)
        }
      }
    }
    return {
      input: clone(c),
      result: recorded.result,
      text: recorded.text,
      spawns,
      versions,
      dns: dnsLog,
      cache: {
        before,
        after: {
          device: sortedEntries(caches.deviceNameCache),
          vendor: sortedEntries(caches.vendorNameCache)
        }
      },
      events
    }
  } finally {
    restoreClock()
  }
}

async function recordCase(c: SysCase): Promise<Recorded> {
  if (mode === 'record') {
    throw new Error(
      'system information has no recorded exchanges; GAMELIB_EW_ORACLE=record is not supported'
    )
  }
  return withEngineOracleProfile(
    async (profile) =>
      normalisePaths(await recordOnProfile(c, profile), profile),
    { seed: seedFor(c.scenario, '<HOME>') }
  )
}

const json = (value: unknown): string => `${JSON.stringify(value, null, 2)}\n`

/** The files of one golden folder: write mode rewrites them, compare mode checks the file set and the bytes. */
function writeOrCompare(caseId: string, recorded: Recorded): void {
  const dir = join(goldenDir(CRATE, SLICE), 'expected', caseId)
  const produced = new Map<string, string>([
    ['input.json', json(recorded.input)],
    ['result.json', json(recorded.result)],
    ['text.json', json(recorded.text)],
    ['spawns.json', json(recorded.spawns)],
    ['versions.json', json(recorded.versions)],
    ['dns.json', json(recorded.dns)],
    ['cache.json', json(recorded.cache)],
    ['events.json', json(recorded.events)]
  ])
  if (mode === 'write') {
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    for (const [name, text] of produced) writeFileSync(join(dir, name), text)
    return
  }
  expect([...produced.keys()].sort()).toEqual(readdirSync(dir).sort())
  for (const [name, text] of produced) {
    expect(text).toBe(readFileSync(join(dir, name), 'utf8'))
  }
}

describeSkipOnWindows('system information oracle (88.1-05)', () => {
  const built = systemInfoCases()
  const casesFile = join(goldenDir(CRATE, SLICE), 'cases.json')
  if (mode === 'write') {
    mkdirSync(dirname(casesFile), { recursive: true })
    writeFileSync(casesFile, json(built))
    writeFileSync(join(goldenDir(CRATE, SLICE), 'deltas.json'), json([]))
  }
  const cases = loadCases<SysCase>(CRATE, SLICE)
  const byId = (id: string): SysCase => {
    const found = cases.find((c) => c.id === id)
    if (!found) throw new Error(`case ${id} is missing`)
    return found
  }

  beforeAll(loadFresh, 120_000)
  afterAll(() => {
    dnsSpy?.mockRestore()
  })

  it('cases.json is exactly what the case builder produces', () => {
    expect(cases).toEqual(JSON.parse(JSON.stringify(built)))
  })

  it.each(cases)(
    '$id',
    async (c) => {
      writeOrCompare(c.id, await recordCase(c))
    },
    60_000
  )

  it('the tracer: one Linux AMD read looks up the sub id name and the vendor and writes both back', async () => {
    const recorded = await recordCase(
      byId(titled(PARSE, 'keeps only the GPU record of a single AMD system'))
    )
    const lookups = (recorded.dns as { name: string }[]).map((d) => d.name)
    expect(lookups).toEqual([
      'e445.1da2.73bf.1002.pci.id.ucw.cz',
      '1002.pci.id.ucw.cz'
    ])
    const cache = recorded.cache as {
      before: { device: object; vendor: object }
      after: { device: object; vendor: object }
    }
    expect(cache.before).toEqual({ device: {}, vendor: {} })
    expect(cache.after.device).toEqual({ e445_1da2_73bf_1002: NAVI21 })
    expect(cache.after.vendor).toEqual({ '1002': AMD_VENDOR })
    expect(recorded.text).not.toBeNull()
  })

  it('records at least the floor of cases', () => {
    expect(cases.length).toBeGreaterThanOrEqual(SYSINFO_FLOOR)
  })

  it('no case records the real home, the real machine or an unscripted call', async () => {
    const realHome = osModule().homedir()
    for (const c of cases) {
      const recorded = await recordCase(c)
      if (realHome.length > 1) {
        expect(JSON.stringify(recorded)).not.toContain(realHome)
      }
    }
  })

  it('the manifest floor holds and an empty case list fails it', () => {
    syncManifest(CRATE, SLICE, cases, SYSINFO_FLOOR)
    assertManifest(CRATE, SLICE, cases, SYSINFO_FLOOR)
    expectEmptyCasesToFail(CRATE, SLICE, SYSINFO_FLOOR)
  })
})

// Referenced by the census section added with the incident-title rows.
void [GPU_LINUX, PROBES, INDEX, LINUX_PROBE, TOLERANCE, PROBE_SUITE, MEMO_SUITE]
void [assertCasesCoverTitles, tsTestTitles, amdGpu, M, W, deck, sequence]
void [INTEL_VENDOR, INTEL_WIN, AMD_WIN, NXDOMAIN, macBase, windowsBase]
