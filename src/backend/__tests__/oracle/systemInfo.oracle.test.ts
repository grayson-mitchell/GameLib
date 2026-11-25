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
import * as mainLogger from 'backend/logger'
import type { SystemInfoDeps } from 'backend/utils/systeminfo'

const CRATE = 'gamelib-info'
const SLICE = 'sysinfo'
/** The case count this plan committed; a later edit may raise it, never lower it. */
const SYSINFO_FLOOR = 94

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
  'VERSION_ID=3.5.7',
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

// ----- the three systeminfo test files (D-14, D-15): one named case per title

const SYSINFO_TESTS = join(
  __dirname,
  '..',
  '..',
  'utils',
  'systeminfo',
  '__tests__'
)

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
  const one = (id: string, scenario: Scenario): void => add(info(id, scenario))
  const AMD_NO_SUB = lspciJoin(gpuRec('0300', '1002', '73bf', 'amdgpu'))
  const sequenceOnLinux = (id: string, steps: Step[]): void =>
    add(sequence(id, steps, L()))

  // ----- gpuLinux.test.ts > parseLspciGpus. The first row is the tracer: Linux, one AMD GPU with sub ids,
  // every lookup found and written back.
  one(titled(PARSE, 'keeps only the GPU record of a single AMD system'), L())
  one(
    titled(PARSE, 'keeps hybrid GPUs in order, including 0302 and 0380'),
    L({
      lspci: {
        stdout: lspciJoin(
          gpuRec('0300', '8086', 'a7a0', 'i915'),
          gpuRec('0302', '10de', '2860', 'nvidia'),
          gpuRec('0380', '1002', '1234')
        )
      },
      dns: dnsMap({
        a7a0_8086: txt('Raptor Lake-P [Iris Xe Graphics]'),
        '8086': txt(INTEL_VENDOR),
        '2860_10de': txt('AD107M [GeForce RTX 4060 Max-Q / Mobile]'),
        '10de': txt(NVIDIA_VENDOR),
        '1234_1002': txt('Example Display Controller'),
        '1002': txt(AMD_VENDOR)
      })
    })
  )
  one(
    titled(
      PARSE,
      'omits driverVersion without Driver, lowercases hex, tolerates CRLF'
    ),
    L({
      lspci: {
        stdout: lspciJoin(gpuRec('0300', '10DE', '2860')).replace(/\n/g, '\r\n')
      },
      dns: dnsMap({
        '2860_10de': txt('AD107M [GeForce RTX 4060 Max-Q / Mobile]'),
        '10de': txt(NVIDIA_VENDOR)
      })
    })
  )
  one(
    titled(PARSE, 'returns [] for empty or garbage output'),
    L({ lspci: { stdout: 'nope\n\n::::\nClass:\tzz\n' }, dns: {} })
  )
  one('lspci-empty-output', L({ lspci: { stdout: '' }, dns: {} }))
  one(
    'lspci-record-with-malformed-ids',
    L({
      lspci: {
        stdout: rec({ Class: '0300', Vendor: 'xyz', Device: '1' })
      },
      dns: {}
    })
  )
  one(
    titled(PARSE, 'feeds Steam Deck detection (%s)'),
    deck('0405', '163f', false)
  )

  // ----- gpuLinux.test.ts > getGpuInfo_linux
  one(
    titled(
      LINUX_PROBE,
      'runs one lspci call through the runner with no env override'
    ),
    L({
      lspci: { stdout: lspciJoin(gpuRec('0300', '1002', '163f', 'amdgpu')) },
      dns: dnsMap({
        '163f_1002': txt('VanGogh [Radeon Custom GPU]'),
        '1002': txt(AMD_VENDOR)
      })
    })
  )
  one(
    titled(LINUX_PROBE, 'resolves [] on ENOENT'),
    L({ lspci: { throws: 'spawn lspci ENOENT' }, dns: {} })
  )
  one(
    titled(LINUX_PROBE, 'resolves [] on non-zero exit'),
    L({ lspci: { code: 1 }, dns: {} })
  )
  one(
    titled(LINUX_PROBE, 'resolves [] on timeout'),
    L({ lspci: { timedOut: true, code: null }, dns: {} })
  )

  // ----- gpuLinux.test.ts > getGpuInfo tolerance
  one(
    titled(TOLERANCE, 'resolves [] when the win32 probe rejects'),
    W({ powershellGpu: { throws: 'spawn powershell ENOENT' }, dns: {} })
  )
  one(
    titled(TOLERANCE, 'resolves [] when lspci is missing on linux'),
    L({
      lspci: { throws: 'spawn lspci ENOENT' },
      env: { FLATPAK_ID: 'org.gamelib.GameLib' },
      dns: {}
    })
  )

  // ----- probes.test.ts
  one(
    titled(
      PROBE_SUITE,
      'free -b with a replaced LANG=C env and the default timeout'
    ),
    L({ free: { stdout: 'Mem:  1000  400  600\n' } })
  )
  one(
    titled(PROBE_SUITE, 'free rejects on ENOENT'),
    L({
      free: { throws: 'spawn free ENOENT' },
      lspci: null,
      comet: null,
      managers: null,
      dns: {}
    })
  )
  one(
    titled(
      PROBE_SUITE,
      'macOS: sysctl then vm_stat; timeout falls back to defaults'
    ),
    M({
      sysctl: { timedOut: true, code: null },
      vmStat: { stdout: 'Pages active: 10\nPages wired down: 5\n' }
    })
  )
  one(
    titled(PROBE_SUITE, 'macOS: non-zero vm_stat yields zero used'),
    M({ sysctl: { stdout: '16384' }, vmStat: { code: 1 } })
  )
  one(
    titled(
      PROBE_SUITE,
      'windows OS info runs powershell and falls back when it fails'
    ),
    W({
      powershellOs: { code: 1 },
      powershellGpu: { stdout: '[]' },
      dns: {}
    })
  )
  one(
    titled(PROBE_SUITE, 'windows GPU info parses powershell output'),
    W({
      powershellGpu: { stdout: JSON.stringify(INTEL_WIN) },
      dns: dnsMap({
        '5678_abcd_1234_8086': txt('Example Intel Graphics'),
        '8086': txt(INTEL_VENDOR)
      })
    })
  )

  // ----- index.test.ts: the single-flight cache (debug/gog-spawn-reduction fix 3)
  sequenceOnLinux(
    titled(
      MEMO_SUITE,
      'concurrent cache=true callers share ONE in-flight fetch -- each version probe runs exactly once'
    ),
    [
      { op: 'start', call: 'first' },
      { op: 'start', call: 'second' },
      { op: 'start', call: 'third' },
      { op: 'await', call: 'first' },
      { op: 'await', call: 'second' },
      { op: 'await', call: 'third' }
    ]
  )
  sequenceOnLinux(
    titled(
      MEMO_SUITE,
      'a caller that arrives AFTER the first fetch resolved gets the cached value -- no new probes'
    ),
    [
      { op: 'start', call: 'first' },
      { op: 'await', call: 'first' },
      { op: 'start', call: 'second' },
      { op: 'await', call: 'second' }
    ]
  )
  sequenceOnLinux(
    titled(
      MEMO_SUITE,
      'cache=false always triggers a fresh fetch, independent of any in-flight cache=true call'
    ),
    [
      { op: 'start', call: 'cached' },
      { op: 'settle' },
      { op: 'start', call: 'forced', cache: false },
      { op: 'await', call: 'cached' },
      { op: 'await', call: 'forced' }
    ]
  )
  sequenceOnLinux(
    titled(
      MEMO_SUITE,
      'a second cache instance fetches again: nothing is shared between instances'
    ),
    [
      { op: 'start', call: 'first' },
      { op: 'await', call: 'first' },
      { op: 'newCache' },
      { op: 'start', call: 'second' },
      { op: 'await', call: 'second' }
    ]
  )
  // The same single-flight rows with cache=false in flight at once and a forced call after the cache is warm.
  sequenceOnLinux('single-flight-two-forced-calls-each-fetch', [
    { op: 'start', call: 'one', cache: false },
    { op: 'start', call: 'two', cache: false },
    { op: 'await', call: 'one' },
    { op: 'await', call: 'two' }
  ])
  sequenceOnLinux('single-flight-forced-call-after-the-cache-is-warm', [
    { op: 'start', call: 'warm' },
    { op: 'await', call: 'warm' },
    { op: 'start', call: 'forced', cache: false },
    { op: 'await', call: 'forced' },
    { op: 'start', call: 'after' },
    { op: 'await', call: 'after' }
  ])

  // ----- Linux memory (free -b)
  one('free-non-zero-exit-reports-zero-memory', L({ free: { code: 1 } }))
  one(
    'free-timeout-reports-zero-memory',
    L({ free: { timedOut: true, code: null } })
  )
  one(
    'free-output-without-a-labelled-line-reports-zero-memory',
    L({ free: { stdout: 'no labelled line here\n' } })
  )

  // ----- Linux os-release locations and fields
  one(
    'os-release-run-host-wins-over-snapd-and-etc',
    L({
      osReleaseFiles: {
        '/run/host/os-release': 'NAME="Host OS"\nVERSION="1"\n',
        '/var/lib/snapd/hostfs/etc/os-release': 'NAME="Snap OS"\nVERSION="2"\n',
        '/etc/os-release': UBUNTU
      }
    })
  )
  one(
    'os-release-snapd-hostfs-wins-over-etc',
    L({
      osReleaseFiles: {
        '/var/lib/snapd/hostfs/etc/os-release': 'NAME="Snap OS"\nVERSION="2"\n',
        '/etc/os-release': UBUNTU
      }
    })
  )
  one('os-release-none-found', L({ osReleaseFiles: {} }))
  one(
    'os-release-pretty-name-only-has-no-version',
    L({
      osReleaseFiles: { '/etc/os-release': 'PRETTY_NAME="Some Distro 1"\n' }
    })
  )
  one(
    'os-release-version-id-and-codename-without-version',
    L({
      osReleaseFiles: {
        '/etc/os-release':
          'NAME=Arch\nVERSION_ID=rolling\nVERSION_CODENAME=base\n'
      }
    })
  )
  one(
    'os-release-quoted-version-id-keeps-its-quotes',
    L({
      osReleaseFiles: {
        '/etc/os-release':
          'NAME="Quoted"\nVERSION_ID="22.04"\nVERSION_CODENAME=jammy\n'
      }
    })
  )
  one(
    'os-release-without-name-fields-is-linux',
    L({ osReleaseFiles: { '/etc/os-release': 'ID=custom\n' } })
  )
  one(
    'os-release-unquoted-name-and-quoted-version',
    L({
      osReleaseFiles: {
        '/etc/os-release':
          'NAME=Fedora Linux\nVERSION="39 (Workstation Edition)"\n'
      }
    })
  )
  one(
    'os-release-single-quotes-are-kept',
    L({
      osReleaseFiles: { '/etc/os-release': "NAME='Quoted OS'\nVERSION='9'\n" }
    })
  )

  // ----- Flatpak and AppImage
  one(
    'linux-flatpak-env-set',
    L({ env: { FLATPAK_ID: 'org.gamelib.GameLib' } })
  )
  one(
    'linux-appimage-env-set',
    L({ env: { APPIMAGE: '/pins/GameLib.AppImage' } })
  )
  one(
    'linux-flatpak-and-appimage-env-set',
    L({
      env: {
        FLATPAK_ID: 'org.gamelib.GameLib',
        APPIMAGE: '/pins/GameLib.AppImage'
      }
    })
  )
  one(
    'windows-flatpak-env-text-has-no-linux-lines',
    W({ env: { FLATPAK_ID: 'org.gamelib.GameLib' } })
  )

  // ----- pci.ids: sub ids, fallback, write-back, missing names and the cache
  one(
    'pci-sub-ids-missing-falls-back-and-writes-back',
    L({
      dns: dnsMap({
        e445_1da2_73bf_1002: NXDOMAIN,
        '73bf_1002': txt(NAVI21),
        '1002': txt(AMD_VENDOR)
      })
    })
  )
  one(
    'pci-vendor-missing-drops-the-gpu',
    L({
      dns: dnsMap({ e445_1da2_73bf_1002: txt(NAVI21), '1002': NXDOMAIN })
    })
  )
  one(
    'pci-device-missing-drops-the-gpu',
    L({
      lspci: { stdout: AMD_NO_SUB },
      dns: dnsMap({ '73bf_1002': NXDOMAIN, '1002': txt(AMD_VENDOR) })
    })
  )
  one(
    'pci-empty-txt-answer-drops-the-gpu',
    L({
      lspci: { stdout: AMD_NO_SUB },
      dns: dnsMap({ '73bf_1002': { txt: [] }, '1002': txt(AMD_VENDOR) })
    })
  )
  one(
    'pci-cache-hit-makes-no-lookup',
    L({
      dns: {},
      caches: {
        device: [{ key: 'e445_1da2_73bf_1002', value: NAVI21, ageDays: 0 }],
        vendor: [{ key: '1002', value: AMD_VENDOR, ageDays: 0 }]
      }
    })
  )
  one(
    'pci-entries-six-days-old-are-still-cached',
    L({
      dns: {},
      caches: {
        device: [{ key: 'e445_1da2_73bf_1002', value: NAVI21, ageDays: 6 }],
        vendor: [{ key: '1002', value: AMD_VENDOR, ageDays: 6 }]
      }
    })
  )
  one(
    'pci-entries-older-than-seven-days-are-looked-up-again',
    L({
      caches: {
        device: [
          { key: 'e445_1da2_73bf_1002', value: 'Stale device name', ageDays: 8 }
        ],
        vendor: [{ key: '1002', value: 'Stale vendor name', ageDays: 8 }]
      }
    })
  )
  one(
    'pci-vendor-cached-device-looked-up',
    L({
      dns: dnsMap({ e445_1da2_73bf_1002: txt(NAVI21) }),
      caches: {
        device: [],
        vendor: [{ key: '1002', value: AMD_VENDOR, ageDays: 0 }]
      }
    })
  )
  one(
    'pci-generic-device-cached-sub-key-looked-up-then-written-back',
    L({
      dns: dnsMap({ e445_1da2_73bf_1002: NXDOMAIN }),
      caches: {
        device: [{ key: '73bf_1002', value: NAVI21, ageDays: 0 }],
        vendor: [{ key: '1002', value: AMD_VENDOR, ageDays: 0 }]
      }
    })
  )
  one(
    'pci-two-gpus-of-one-vendor-share-the-vendor-lookup',
    L({
      lspci: {
        stdout: lspciJoin(
          gpuRec('0300', '1002', '73bf', 'amdgpu'),
          gpuRec('0300', '1002', '7340', 'amdgpu')
        )
      },
      dns: dnsMap({
        '73bf_1002': txt(NAVI21),
        '7340_1002': txt('Navi 14 [Radeon RX 5500/5500M / Pro 5500M]'),
        '1002': txt(AMD_VENDOR)
      })
    })
  )
  one(
    'pci-txt-answer-without-the-i-prefix-is-kept',
    L({
      lspci: { stdout: AMD_NO_SUB },
      dns: dnsMap({
        '73bf_1002': { txt: [['Plain Name']] },
        '1002': txt(AMD_VENDOR)
      })
    })
  )
  one(
    'pci-first-txt-record-wins',
    L({
      lspci: { stdout: AMD_NO_SUB },
      dns: dnsMap({
        '73bf_1002': { txt: [['i=First', 'i=Chunk'], ['i=Second']] },
        '1002': txt(AMD_VENDOR)
      })
    })
  )

  // ----- Steam Deck: every model and mode, and the cases that are not a Deck
  one('steam-deck-apu-0405-lcd-game-mode', deck('0405', '163f', true))
  one('steam-deck-apu-0932-oled-desktop-mode', deck('0932', '1435', false))
  one('steam-deck-apu-0932-oled-game-mode', deck('0932', '1435', true))
  one(
    'steam-deck-apu-0932-with-lcd-gpu-reports-lcd',
    deck('0932', '163f', false)
  )
  one(
    'steam-deck-apu-0405-with-oled-gpu-reports-oled',
    deck('0405', '1435', true)
  )
  one(
    'steam-deck-apu-with-nvidia-primary-gpu-is-not-a-deck',
    deck('0405', '163f', false, {
      lspci: {
        stdout: lspciJoin(
          gpuRec('0302', '10de', '2860', 'nvidia'),
          gpuRec('0300', '1002', '163f', 'amdgpu')
        )
      },
      dns: dnsMap({
        '2860_10de': txt('AD107M [GeForce RTX 4060 Max-Q / Mobile]'),
        '10de': txt(NVIDIA_VENDOR),
        '163f_1002': txt('VanGogh [Radeon Custom GPU]'),
        '1002': txt(AMD_VENDOR)
      })
    })
  )
  one(
    'steam-deck-apu-with-unknown-amd-device-is-not-a-deck',
    deck('0405', '73bf', false, {
      dns: dnsMap({ '73bf_1002': txt(NAVI21), '1002': txt(AMD_VENDOR) })
    })
  )
  one(
    'steam-deck-apu-with-no-gpu-is-not-a-deck',
    deck('0405', '163f', false, {
      lspci: { stdout: 'nope\n' },
      dns: {}
    })
  )
  one(
    'steam-deck-other-apu-with-deck-gpu-is-not-a-deck',
    deck('0405', '163f', false, {
      cpu: { model: 'AMD Custom APU 0000', cores: 8 }
    })
  )
  one(
    'steam-deck-game-mode-on-a-desktop-pc-is-not-a-deck',
    L({ steamDeckGameMode: true })
  )

  // ----- macOS
  one('mac-sysctl-and-vm-stat-success', M())
  one(
    'mac-sysctl-garbage-page-size-falls-back-to-4096',
    M({ sysctl: { stdout: 'abc\n' } })
  )
  one(
    'mac-sysctl-spawn-failure-rejects-the-whole-read',
    M({
      sysctl: { throws: 'spawn sysctl ENOENT' },
      vmStat: null,
      comet: null,
      managers: null
    })
  )
  one(
    'mac-vm-stat-unparseable-reports-zero-used',
    M({ vmStat: { stdout: 'nothing useful\n' } })
  )
  one(
    'mac-vm-stat-timeout-reports-zero-used',
    M({ vmStat: { timedOut: true, code: null } })
  )
  one('mac-comet-bundled-path-arm64', M({ altCometBin: null }))

  // ----- Windows
  one(
    'windows-gpu-array-nvidia-and-amd',
    W({
      powershellGpu: { stdout: JSON.stringify([NVIDIA_WIN, AMD_WIN]) },
      dns: dnsMap({
        ...NVIDIA_WIN_DNS,
        '8823_1043_1681_1002': txt('Cezanne [Radeon Vega Series]'),
        '1002': txt(AMD_VENDOR)
      })
    })
  )
  one(
    'windows-gpu-malformed-json-yields-no-gpu',
    W({ powershellGpu: { stdout: 'not json' }, dns: {} })
  )
  one(
    'windows-gpu-json-with-missing-fields-yields-no-gpu',
    W({
      powershellGpu: { stdout: '{"AdapterCompatibility":"NVIDIA"}' },
      dns: {}
    })
  )
  one(
    'windows-gpu-pnp-id-without-ven-and-dev-is-skipped',
    W({
      powershellGpu: {
        stdout: JSON.stringify({
          ...NVIDIA_WIN,
          PnPDeviceID: 'USB\\ROOT_HUB30\\4&1'
        })
      },
      dns: {}
    })
  )
  one(
    'windows-gpu-timeout-yields-no-gpu',
    W({ powershellGpu: { timedOut: true, code: null }, dns: {} })
  )
  one('windows-os-info-success-and-memory-from-os-module', W())
  one(
    'windows-os-info-malformed-json-falls-back',
    W({ powershellOs: { stdout: 'oops' } })
  )
  one(
    'windows-os-info-powershell-missing-rejects-the-whole-read',
    W({
      powershellOs: { throws: 'spawn powershell ENOENT' },
      comet: null,
      managers: null
    })
  )
  one('windows-comet-bundled-path-exe', W({ altCometBin: null }))

  // ----- version probes
  one(
    'legendary-output-without-codename-is-invalid',
    L({
      managers: {
        ...MANAGERS_OK,
        legendary: { stdout: 'legendary 0.20.33\n' }
      }
    })
  )
  one(
    'legendary-error-is-invalid',
    L({
      managers: { ...MANAGERS_OK, legendary: { error: 'boom' } }
    })
  )
  one(
    'legendary-abort-is-invalid',
    L({
      managers: { ...MANAGERS_OK, legendary: { abort: true } }
    })
  )
  one(
    'gogdl-error-is-invalid',
    L({ managers: { ...MANAGERS_OK, gog: { error: 'boom' } } })
  )
  one(
    'gogdl-stdout-is-returned-raw',
    L({ managers: { ...MANAGERS_OK, gog: { stdout: '0.9.2\n' } } })
  )
  one(
    'nile-error-is-invalid',
    L({ managers: { ...MANAGERS_OK, nile: { error: 'boom' } } })
  )
  one(
    'nile-stdout-is-returned-raw',
    L({ managers: { ...MANAGERS_OK, nile: { stdout: '1.0.4\n' } } })
  )
  one('comet-timeout-is-invalid', L({ comet: { timedOut: true, code: null } }))
  one(
    'comet-spawn-failure-is-invalid',
    L({ comet: { throws: 'spawn comet ENOENT' } })
  )
  one(
    'comet-output-is-right-trimmed',
    L({ comet: { stdout: 'comet 0.1.3  \n\n' } })
  )
  one(
    'comet-non-zero-exit-keeps-its-stdout',
    L({ comet: { code: 1, stdout: 'broken\n' } })
  )
  one('comet-bundled-path-linux-x64', L({ altCometBin: null }))

  // ----- the app version name
  one('app-version-beta-has-the-beta-name', L({ appVersion: '2.16.0-beta.1' }))
  one(
    'app-version-alpha-has-the-beta-name',
    L({ appVersion: '2.16.0-alpha.2' })
  )

  // ----- no CPU
  one(
    'no-cpus-reported-rejects-after-the-probes',
    L({ cpu: { model: '', cores: 0 } })
  )

  // ----- the byte-size format both formatSystemInfo calls use (npm filesize)
  add({
    id: 'filesize-vectors',
    call: {
      kind: 'filesize',
      values: [
        0,
        1,
        999,
        1000,
        1023,
        1024,
        1536,
        999999,
        1000000,
        1048575,
        1048576,
        999999999,
        1073741823,
        2 ** 30,
        16642998272,
        999999999999,
        1099511627775,
        2 ** 40 + 1,
        1125899906842623
      ]
    },
    scenario: null
  })

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

const sortedEntries = (cache: {
  entries(): Array<[string, string]>
}): Record<string, string> =>
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

    // ----- the backend log, spied (not mocked). The statically imported modules log through the fresh registry's
    // logger; the ones `import()` loads later (`gpu/linux`, `memory/*`, `osInfo/*`) resolve in this file's own
    // registry, so both logger instances are spied.
    const logSpies = [mods.logger, mainLogger].flatMap((loggerModule) =>
      (['logDebug', 'logInfo', 'logWarning', 'logError'] as const).map(
        (name) => {
          const level = name.slice(3).toLowerCase()
          const spy = jest.spyOn(loggerModule, name)
          spy.mockImplementation(((message: unknown, prefix?: unknown) => {
            events.push({
              seq: next(),
              level,
              prefix: typeof prefix === 'string' ? prefix : null,
              text: asText(message)
            })
          }) as never)
          return () => spy.mockRestore()
        }
      )
    )

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

  it.each(['gpuLinux.test.ts', 'probes.test.ts', 'index.test.ts'])(
    'every title of %s is a named case (census, nothing excluded)',
    (file) => {
      assertCasesCoverTitles(
        cases.map((c) => c.id),
        tsTestTitles(join(SYSINFO_TESTS, file)),
        {}
      )
    }
  )

  it('the three census files hold 21 titles', () => {
    const titles = ['gpuLinux.test.ts', 'probes.test.ts', 'index.test.ts'].map(
      (file) => tsTestTitles(join(SYSINFO_TESTS, file)).length
    )
    expect(titles).toEqual([11, 6, 4])
  })

  describe('the single-flight cache', () => {
    const legendaryCalls = (recorded: Recorded): number =>
      (recorded.versions as { manager: string }[]).filter(
        (v) => v.manager === 'legendary'
      ).length
    const sameObjects = (recorded: Recorded): (string | null)[] =>
      (
        recorded.result as { calls: { sameObjectAs: string | null }[] }
      ).calls.map((c) => c.sameObjectAs)

    it('two concurrent callers record exactly one legendary version call and share one object', async () => {
      const recorded = await recordCase(
        byId(
          titled(
            MEMO_SUITE,
            'concurrent cache=true callers share ONE in-flight fetch -- each version probe runs exactly once'
          )
        )
      )
      expect(legendaryCalls(recorded)).toBe(1)
      expect(sameObjects(recorded)).toEqual([null, 'first', 'first'])
    })

    it('a later caller records no version call, and cache=false records a fresh set', async () => {
      const later = await recordCase(
        byId(
          titled(
            MEMO_SUITE,
            'a caller that arrives AFTER the first fetch resolved gets the cached value -- no new probes'
          )
        )
      )
      expect(legendaryCalls(later)).toBe(1)
      expect(sameObjects(later)).toEqual([null, 'first'])
      const forced = await recordCase(
        byId('single-flight-forced-call-after-the-cache-is-warm')
      )
      expect(legendaryCalls(forced)).toBe(2)
      expect(sameObjects(forced)).toEqual([null, null, 'forced'])
    })

    it('a second cache instance fetches again', async () => {
      const recorded = await recordCase(
        byId(
          titled(
            MEMO_SUITE,
            'a second cache instance fetches again: nothing is shared between instances'
          )
        )
      )
      expect(legendaryCalls(recorded)).toBe(2)
    })
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
