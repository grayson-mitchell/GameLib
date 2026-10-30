/**
 * 58-14: behavioural proof of the shim-local networking C block (identity and
 * address helpers, message pool, function-pointer config store). The generator
 * text that ships is compiled on the host with an ERRORCHECK mutex and a
 * recording fake transport, so "no lock held while a stored callback runs" and
 * "pointers never reach the transport" are exercised, not just pinned in text.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'
import {
  LIFECYCLE_NOOP_EXPORT_BODIES,
  LIFECYCLE_NOOP_SPECS,
  NETWORKING_LOCAL_C,
  NETWORKING_LOCAL_EXPORT_BODIES,
  NETWORKING_UTILS_FLAT_INLINE,
  NETWORKING_UTILS_FLAT_INLINE_NAMES
} from '../gen_vtables'

const HARNESS = join(__dirname, 'fixtures', 'networking_local_harness.c')

const CASES = [
  'identity_steamid',
  'identity_ip',
  'identity_generic',
  'identity_equal',
  'ipaddr',
  'msg_pool',
  'cfg_ptr_local',
  'cfg_int_forwarded',
  'cfg_store_bounded',
  'cfg_get_forwarded',
  'cb_intercept',
  'cb_no_lock_held',
  'utils_calls',
  'flat_inline',
  'flat_vtable',
  'outmsg_decode_two',
  'outmsg_rejects_lying_size',
  'outmsg_rejects_n_over_max',
  'outmsg_release_all',
  'open_filters_options',
  'open_bind_failure_closes',
  'rt_status_and_lanes'
]

function spawnArgv(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env
    })
    let stdout = ''
    let stderr = ''
    child.stdout?.on('data', (d) => {
      stdout += d.toString()
    })
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stdout, stderr }))
  })
}

describe('networking local host harness (58-14)', () => {
  let profile: FakeHomeProfile
  let skipReason: string | undefined
  let run: { code: number | null; stdout: string; stderr: string }

  beforeAll(async () => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-netlocal-' })
    writeFileSync(
      join(profile.root, 'gl_net_local.c'),
      [
        NETWORKING_LOCAL_C,
        ...Object.values(NETWORKING_LOCAL_EXPORT_BODIES),
        ...NETWORKING_UTILS_FLAT_INLINE_NAMES.map(
          (n) => NETWORKING_UTILS_FLAT_INLINE[n]
        )
      ].join('\n')
    )
    const exe = join(profile.root, 'netlocal')
    try {
      const cc = await spawnArgv(
        'clang',
        [
          '-std=c11',
          '-Wall',
          '-Werror',
          '-pthread',
          '-I',
          profile.root,
          '-o',
          exe,
          HARNESS
        ],
        profile.childEnv()
      )
      if (cc.code !== 0) {
        throw new Error(`harness compile failed:\n${cc.stderr}`)
      }
      run = await spawnArgv(exe, [], profile.childEnv())
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        skipReason = 'clang not found on PATH'
        console.warn(`networkingLocalHost skipped: ${skipReason}`)
      } else {
        throw e
      }
    }
  }, 120_000)

  afterAll(() => {
    profile?.dispose()
  })

  for (const name of CASES) {
    it(`PASS ${name}`, () => {
      if (skipReason) return
      expect(run.stdout).toContain(`PASS ${name}\n`)
    })
  }

  it('the harness exits cleanly', () => {
    if (skipReason) return
    expect(run.code).toBe(0)
    expect(run.stdout).not.toContain('FAIL')
  })
})

describe('networking local export wiring (58-14)', () => {
  it('no Identity, IPAddr or Message_t export is a lifecycle no-op any more', () => {
    for (const key of Object.keys(LIFECYCLE_NOOP_SPECS)) {
      expect(key).not.toMatch(/^SteamAPI_SteamNetworkingIdentity_/)
      expect(key).not.toMatch(/^SteamAPI_SteamNetworkingIPAddr_/)
      expect(key).not.toBe('SteamAPI_SteamNetworkingMessage_t_Release')
    }
    for (const name of Object.keys(NETWORKING_LOCAL_EXPORT_BODIES)) {
      expect(LIFECYCLE_NOOP_EXPORT_BODIES[name]).toBe(
        NETWORKING_LOCAL_EXPORT_BODIES[name]
      )
      expect(LIFECYCLE_NOOP_EXPORT_BODIES[name]).not.toMatch(
        /\(void\) \{ return 0; \}|\(void\) \{ \}/
      )
    }
  })

  it('exports exactly the 27 identity, 13 address and 1 release names', () => {
    const names = Object.keys(NETWORKING_LOCAL_EXPORT_BODIES)
    expect(
      names.filter((n) => n.startsWith('SteamAPI_SteamNetworkingIdentity_'))
    ).toHaveLength(27)
    expect(
      names.filter((n) => n.startsWith('SteamAPI_SteamNetworkingIPAddr_'))
    ).toHaveLength(13)
    expect(names).toContain('SteamAPI_SteamNetworkingMessage_t_Release')
    expect(names).toHaveLength(41)
  })

  it('the SDK flat-only utils inlines are all present, including the six callbacks', () => {
    expect(NETWORKING_UTILS_FLAT_INLINE_NAMES).toHaveLength(16)
    expect(
      NETWORKING_UTILS_FLAT_INLINE_NAMES.filter((n) =>
        n.startsWith('SteamAPI_ISteamNetworkingUtils_SetGlobalCallback_')
      )
    ).toHaveLength(6)
    expect(NETWORKING_UTILS_FLAT_INLINE_NAMES).toContain(
      'SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess'
    )
    expect(NETWORKING_UTILS_FLAT_INLINE_NAMES).toContain(
      'SteamAPI_ISteamNetworkingUtils_IsFakeIPv4'
    )
  })

  it('InitRelayNetworkAccess calls CheckPingDataUpToDate (slot 7) with 1e10f and IsFakeIPv4 uses slot 14 > NotFake', () => {
    const init =
      NETWORKING_UTILS_FLAT_INLINE[
        'SteamAPI_ISteamNetworkingUtils_InitRelayNetworkAccess'
      ]
    expect(init).toContain('vt[7]')
    expect(init).toContain('1e10f')
    const fake =
      NETWORKING_UTILS_FLAT_INLINE['SteamAPI_ISteamNetworkingUtils_IsFakeIPv4']
    expect(fake).toContain('vt[14]')
    expect(fake).toContain('> 1')
  })

  it('a Ptr or callback value is never forwarded: the helper-bound request is built only after the local branch returns', () => {
    const local = NETWORKING_LOCAL_C.indexOf('type == GL_NET_CFG_PTR ||')
    const forward = NETWORKING_LOCAL_C.indexOf('memcpy(req, &e, 4);')
    expect(local).toBeGreaterThan(0)
    expect(forward).toBeGreaterThan(local)
    const branch = NETWORKING_LOCAL_C.slice(local, forward)
    expect(branch).toContain('return gl_net_cfg_put(')
    expect(branch).not.toContain('gl_bridge_call_raw')
  })

  it('the utils ordinal and slots in the C block match the committed manifest', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const manifest = require('../sdk/isteamnetworkingutils004.manifest.json')
    const slot = (name: string): number =>
      manifest.methods.find((m: { name: string }) => m.name === name).slot
    const define = (name: string): number =>
      Number(new RegExp(`#define ${name} (\\d+)`).exec(NETWORKING_LOCAL_C)?.[1])
    expect(define('GL_NET_UTILS_ORDINAL')).toBe(manifest.ordinal)
    expect(define('GL_NET_SLOT_GETLOCALPING')).toBe(
      slot('GetLocalPingLocation')
    )
    expect(define('GL_NET_SLOT_CONVERTPING')).toBe(
      slot('ConvertPingLocationToString')
    )
    expect(define('GL_NET_SLOT_CHECKPING')).toBe(slot('CheckPingDataUpToDate'))
    expect(define('GL_NET_SLOT_GETPOPLIST')).toBe(slot('GetPOPList'))
    expect(define('GL_NET_SLOT_SETCONFIG')).toBe(slot('SetConfigValue'))
    expect(define('GL_NET_SLOT_GETCONFIG')).toBe(slot('GetConfigValue'))
    expect(define('GL_NET_SLOT_GETCONFIGINFO')).toBe(slot('GetConfigValueInfo'))
    // InitRelayNetworkAccess / IsFakeIPv4 call fixed vtable slots
    expect(slot('CheckPingDataUpToDate')).toBe(7)
    expect(slot('GetIPv4FakeIPType')).toBe(14)
  })
})
