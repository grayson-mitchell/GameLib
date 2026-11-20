/**
 * quick 261120-rdo (D-53-09 tier 1): runs the REAL x86 steam_api.dll shim under
 * CrossOver's Wine with a 32-bit PE harness, to prove the modern SteamInternal_*
 * lookup family and the manifest-backed x86 null objects at runtime: the SDK
 * ContextInit protocol, served/null/unknown lookup answers, and that a null slot
 * pops exactly its manifest stackBytes under __thiscall (ESP balance, an sret
 * slot, and a live mismatch control). No helper is started and no
 * gamelib_bridge.cfg is written, so every bridge_transact fails closed (D-51-01).
 * Skips only when CrossOver or the pinned zig are absent, unless
 * GAMELIB_REQUIRE_WINE_HARNESS=1.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'
import { buildShimCompileArgv } from '../buildSteamBridgeShims'

const REPO = join(__dirname, '..', '..')
const CX_BIN =
  '/Applications/CrossOver.app/Contents/SharedSupport/CrossOver/bin'
const WINELOADER = join(CX_BIN, 'wineloader')
const WINESERVER = join(CX_BIN, 'wineserver')
const ZIG = join(REPO, '.build-tools', 'zig', 'zig')
const FIXTURE = join(__dirname, 'fixtures', 'x86_modern_lookup_pe_harness.c')
const SDK_DIR = join(REPO, 'meta', 'sdk')

interface ManifestMethod {
  slot: number
  name: string
  stackBytes: number
  structSize?: number
  returnKind: string
}
interface Manifest {
  interface: string
  arches: string[]
  methods: ManifestMethod[]
}

function loadManifest(file: string): Manifest {
  return JSON.parse(readFileSync(join(SDK_DIR, file), 'utf-8')) as Manifest
}

function method(m: Manifest, name: string): ManifestMethod {
  const found = m.methods.find((x) => x.name === name)
  if (found === undefined) throw new Error(`${m.interface} has no ${name}`)
  return found
}

interface RunResult {
  code: number | null
  stdout: string
  stderr: string
  timedOut: boolean
}

function spawnArgv(
  command: string,
  args: string[],
  opts: { cwd?: string; env: NodeJS.ProcessEnv; timeoutMs?: number }
): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: opts.cwd,
      env: opts.env,
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          timedOut = true
          child.kill('SIGKILL')
        }, opts.timeoutMs)
      : undefined
    child.stdout?.on('data', (d) => (stdout += d.toString()))
    child.stderr?.on('data', (d) => (stderr += d.toString()))
    child.on('error', (e) => {
      if (timer) clearTimeout(timer)
      reject(e)
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr, timedOut })
    })
  })
}

function skipReasonNow(): string | undefined {
  if (process.platform !== 'darwin') return 'not macOS'
  if (!existsSync(WINELOADER)) return 'CrossOver wineloader not found'
  if (!existsSync(ZIG)) return 'pinned zig not found (.build-tools/zig/zig)'
  return undefined
}

async function runHarness(): Promise<RunResult> {
  // The two probe versions must stay x64-only manifests, else the x86 shim
  // would serve them and the null-object path would not be exercised.
  const ugc = loadManifest('isteamugc017.manifest.json')
  const input = loadManifest('isteaminput006.manifest.json')
  expect(ugc.arches).not.toContain('x86')
  expect(input.arches).not.toContain('x86')
  const ugcSlot0 = method(ugc, 'CreateQueryUserUGCRequest')
  const motion = method(input, 'GetMotionData')
  expect(ugcSlot0.stackBytes % 4).toBe(0)
  expect(motion.stackBytes).toBe(12)
  expect(motion.returnKind).toBe('class')

  const profile = createFakeHomeProfile({ prefix: 'gamelib-x86modernwine-' })
  try {
    const work = join(profile.root, 'run')
    mkdirSync(work, { recursive: true })
    const env = profile.childEnv()

    const { command, args } = buildShimCompileArgv(ZIG)
    if (!args.includes('x86-windows-gnu')) {
      throw new Error('buildShimCompileArgv no longer targets x86-windows-gnu')
    }
    const oi = args.indexOf('-o')
    if (oi < 0) throw new Error('shim argv has no -o')
    const shimArgs = [...args]
    shimArgs[oi + 1] = join(work, 'steam_api.dll')
    const shim = await spawnArgv(command, shimArgs, {
      cwd: REPO,
      env,
      timeoutMs: 240_000
    })
    if (shim.code !== 0) throw new Error(`shim build failed:\n${shim.stderr}`)

    const hz = await spawnArgv(
      ZIG,
      [
        'cc',
        '-target',
        'x86-windows-gnu',
        '-O2',
        '-std=c11',
        '-Wall',
        '-Werror',
        `-DUGC_SLOT=${ugcSlot0.slot}`,
        `-DUGC_STACK_DWORDS=${ugcSlot0.stackBytes / 4}`,
        `-DINPUT_SLOT=${motion.slot}`,
        `-DINPUT_STRUCT=${motion.structSize ?? 0}`,
        '-o',
        join(work, 'harness.exe'),
        FIXTURE
      ],
      { cwd: work, env, timeoutMs: 180_000 }
    )
    if (hz.code !== 0) throw new Error(`harness build failed:\n${hz.stderr}`)

    const wine = await spawnArgv(WINELOADER, [join(work, 'harness.exe')], {
      cwd: work,
      env: {
        ...env,
        WINEPREFIX: join(profile.root, 'wineprefix'),
        WINEDEBUG: '-all',
        WINEDLLOVERRIDES: 'mscoree,mshtml='
      },
      timeoutMs: 120_000
    })
    return { ...wine, stdout: wine.stdout.replace(/\r\n/g, '\n') }
  } finally {
    try {
      await spawnArgv(WINESERVER, ['-k'], {
        env: {
          ...profile.childEnv(),
          WINEPREFIX: join(profile.root, 'wineprefix'),
          WINEDEBUG: '-all'
        },
        timeoutMs: 30_000
      })
    } catch {
      /* ignore */
    }
    profile.dispose()
  }
}

const NAMES = [
  'hsteam_handles',
  'context_init_protocol',
  'find_or_create_served',
  'null_object_known_version',
  'null_slot_esp_balanced',
  'null_sret_slot',
  'esp_check_detects_mismatch',
  'unknown_version_null',
  'steaminternal_init_fails_closed',
  'gameserver_init_v2_fails'
]

describe('x86 modern SteamInternal_* family and null objects under Wine (D-53-09 tier 1)', () => {
  let skipReason: string | undefined
  let run: RunResult

  beforeAll(async () => {
    skipReason = skipReasonNow()
    if (skipReason) {
      if (process.env.GAMELIB_REQUIRE_WINE_HARNESS === '1') {
        throw new Error(`x86 Wine harness required but: ${skipReason}`)
      }
      console.warn(`x86ModernLookupWineHarness skipped: ${skipReason}`)
      return
    }
    run = await runHarness()
    console.log(
      `code=${run.code}, timedOut=${run.timedOut}\n${run.stdout}\n${run.stderr}`
    )
  }, 500_000)

  for (const name of NAMES) {
    it(`PASS ${name}`, () => {
      if (skipReason) return
      expect(run.stdout).toContain(`PASS ${name}\n`)
    })
  }

  it('harness completes cleanly', () => {
    if (skipReason) return
    expect(run.timedOut).toBe(false)
    expect(run.stdout).toContain('DONE')
    expect(run.stdout).not.toContain('FAIL')
    expect(run.code).toBe(0)
  })
})
