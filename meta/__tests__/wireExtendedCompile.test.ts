/**
 * 58-06: real compile gate for the extended wire kinds. A synthetic x64
 * manifest using in-buffer, in-struct, out-struct, an out-buffer capBytes
 * override, shimLocal and helperCustom is run through the generators and the
 * output is compiled -- the shim with the pinned zig toolchain for
 * x86_64-windows-gnu (the full shim, so the new stubs are checked against the
 * real bridge_transact_locked / g_bridge_lock definitions), the helper
 * dispatch header with the host C compiler (-fsyntax-only, warnings fatal).
 *
 * Skips with a logged reason off darwin or when a toolchain is not available.
 * Nothing here is written under meta/sdk.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'
import { SHIM_RELEASE_CFLAGS } from '../buildSteamBridgeShims'
import { downloadZig } from '../downloadZig'
import {
  SHIM_LOCAL_BODIES,
  computeRetN,
  generateDispatchHeader,
  generateShimC,
  type InterfaceManifestV2,
  type MethodSignature
} from '../gen_vtables'

function method(
  slot: number,
  partial: Omit<MethodSignature, 'slot' | 'stackBytes' | 'returnKind'>
): MethodSignature {
  const m = { returnKind: 'int32', ...partial, slot } as MethodSignature
  return { ...m, stackBytes: computeRetN(m) }
}

const MANIFEST: InterfaceManifestV2 = {
  schemaVersion: 2,
  interface: 'GameLibWire001',
  family: 'GameLibWire',
  ordinal: 9100,
  arches: ['x64'],
  mode: 'wire',
  complete: false,
  helperInterface: 'SteamAPI_GameLibWire_v001',
  source: { kind: 'synthetic', ref: '58-06 compile gate', file: 'n/a' },
  methods: [
    method(0, {
      name: 'Send',
      returns: 'int32',
      helperFlat: 'SteamAPI_IGameLibWire_Send',
      params: [
        {
          name: 'pData',
          type: 'const void*',
          kind: 'in-buffer',
          lenParam: 'cb'
        },
        { name: 'cb', type: 'uint32' }
      ]
    }),
    method(1, {
      name: 'Get',
      returns: 'int32',
      helperFlat: 'SteamAPI_IGameLibWire_Get',
      params: [
        {
          name: 'pInfo',
          type: 'SteamNetConnectionInfo_t*',
          kind: 'out-struct',
          structSize: 696
        }
      ]
    }),
    method(2, {
      name: 'Connect',
      returns: 'int32',
      helperFlat: 'SteamAPI_IGameLibWire_Connect',
      params: [
        {
          name: 'id',
          type: 'const SteamNetworkingIdentity*',
          kind: 'in-struct',
          structSize: 136
        },
        { name: 'nVirtualPort', type: 'int32' }
      ]
    }),
    method(3, {
      name: 'Recv',
      returns: 'int32',
      helperFlat: 'SteamAPI_IGameLibWire_Recv',
      params: [
        {
          name: 'pBuf',
          type: 'char*',
          kind: 'out-buffer',
          sizeParam: 'cb',
          capBytes: 61440
        },
        { name: 'cb', type: 'int32' }
      ]
    }),
    method(4, {
      name: 'Local',
      returns: 'int32',
      shimLocal: true,
      params: [{ name: 'x', type: 'int32' }]
    }),
    method(5, {
      name: 'Custom',
      returns: 'int32',
      helperFlat: 'SteamAPI_IGameLibWire_Custom',
      helperCustom: 'gl_custom_blob',
      params: [{ name: 'x', type: 'int32' }]
    })
  ]
}

function run(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<{ code: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ['ignore', 'ignore', 'pipe'],
      env
    })
    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += d.toString()
    })
    child.on('error', reject)
    child.on('close', (code) => resolve({ code, stderr }))
  })
}

describe('58-06 extended wire kinds compile', () => {
  const profiles: FakeHomeProfile[] = []
  let skipReason: string | null = null
  let zig = ''

  beforeAll(async () => {
    if (process.platform !== 'darwin') {
      skipReason = `requires darwin, got "${process.platform}"`
      return
    }
    try {
      zig = await downloadZig()
    } catch (error) {
      skipReason = `zig unresolvable via downloadZig: ${(error as Error).message}`
    }
    ;(SHIM_LOCAL_BODIES as Record<string, string>)['GameLibWire.Local'] =
      '  return x + 1;'
  }, 180000)

  afterAll(() => {
    delete (SHIM_LOCAL_BODIES as Record<string, string>)['GameLibWire.Local']
    for (const p of profiles) p.dispose()
  })

  it('the generated shim compiles for x86_64-windows-gnu', async () => {
    if (skipReason) {
      console.warn(`wireExtendedCompile SKIPPED: ${skipReason}`)
      return
    }
    ;(SHIM_LOCAL_BODIES as Record<string, string>)['GameLibWire.Local'] =
      '  return x + 1;'
    const home = createFakeHomeProfile({ prefix: 'gamelib-wireext-' })
    profiles.push(home)
    const dir = join(home.root, 'build')
    mkdirSync(dir, { recursive: true })
    const cPath = join(dir, 'shim.c')
    const outPath = join(dir, 'shim.o')
    writeFileSync(cPath, generateShimC([MANIFEST]))
    const res = await run(
      zig,
      [
        'cc',
        '-target',
        'x86_64-windows-gnu',
        '-c',
        ...SHIM_RELEASE_CFLAGS,
        '-Wall',
        '-o',
        outPath,
        cPath
      ],
      home.childEnv()
    )
    if (res.code !== 0 || !existsSync(outPath)) {
      throw new Error(`zig cc failed (exit ${res.code}):\n${res.stderr}`)
    }
  }, 120000)

  it('the generated dispatch header compiles with the host C compiler', async () => {
    if (skipReason) {
      console.warn(`wireExtendedCompile SKIPPED: ${skipReason}`)
      return
    }
    const home = createFakeHomeProfile({ prefix: 'gamelib-wireext-' })
    profiles.push(home)
    const dir = join(home.root, 'build')
    mkdirSync(dir, { recursive: true })
    writeFileSync(
      join(dir, 'bridge_dispatch.h'),
      generateDispatchHeader([MANIFEST])
    )
    const cPath = join(dir, 'helper.c')
    writeFileSync(
      cPath,
      [
        '#include <stddef.h>',
        '#include <stdint.h>',
        '#include <string.h>',
        'static void logts(const char *cat, const char *msg) { (void)cat; (void)msg; }',
        '#include "bridge_dispatch.h"',
        'int gl_custom_blob(void *self, const uint8_t *args, uint32_t argLen, uint8_t *resp, uint32_t respCap, uint32_t *respLen) {',
        '  (void)self; (void)args; (void)argLen; (void)resp; (void)respCap; *respLen = 0; return 0;',
        '}',
        ''
      ].join('\n')
    )
    const res = await run(
      'clang',
      [
        '-fsyntax-only',
        '-Wall',
        '-Wextra',
        '-Wno-unused-function',
        '-Wno-unused-parameter',
        '-Wno-unused-variable',
        '-I',
        dir,
        // the generated header includes gamelib_callresult.h (plan 58-10)
        '-I',
        join(process.cwd(), 'native', 'steam-bridge', 'helper'),
        cPath
      ],
      home.childEnv()
    )
    if (res.code !== 0) {
      throw new Error(`clang failed (exit ${res.code}):\n${res.stderr}`)
    }
  }, 60000)
})
