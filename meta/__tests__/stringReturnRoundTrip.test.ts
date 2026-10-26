/**
 * quick 261026-rqb: compiled host proof that the helper's string-return
 * encode (emitStringReturnEncodeLines) round-trips through the shim's decode
 * (emitStringReturnDecode). Both emitters are the SAME generator functions
 * that produce the shipped shim and dispatch header, so the two sides cannot
 * drift silently.
 *
 * Fake-HOME rule: the harness runs under createFakeHomeProfile().childEnv().
 * Nothing here is profile-dependent (pure in-memory C), so no real-profile
 * arm is needed.
 */
import { spawn } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'
import {
  STRING_RETURN_BUF_BYTES,
  STRING_RETURN_WIRE_BYTES,
  emitStringReturnDecode,
  emitStringReturnEncodeLines
} from '../gen_vtables'

const HARNESS = join(__dirname, 'fixtures', 'string_return_roundtrip_harness.c')

const CASES = [
  'empty',
  'seven_byte_name',
  'len_128',
  'len_255',
  'capped_300',
  'null_result',
  'malformed_short',
  'malformed_overlong'
]

type Result = { code: number | null; stdout: string; stderr: string }

function spawnArgv(
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv
): Promise<Result> {
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

function header(): string {
  return [
    '#include <stdint.h>',
    '#include <string.h>',
    `#define STRING_RETURN_BUF_BYTES ${STRING_RETURN_BUF_BYTES}`,
    `#define STRING_RETURN_WIRE_BYTES ${STRING_RETURN_WIRE_BYTES}`,
    'static uint8_t gl_encode(const char *result, uint8_t *resp, uint32_t respCap, uint32_t *respLen) {',
    '  switch (1) {',
    '    case 1:',
    ...emitStringReturnEncodeLines('result'),
    '  }',
    '  return 1;',
    '}',
    'static const char *gl_decode(const uint8_t *retbuf, uint32_t retlen, char *gl_buf) {',
    emitStringReturnDecode('gl_buf'),
    '}',
    ''
  ].join('\n')
}

describe('string-return encode -> decode round trip (261026-rqb)', () => {
  let profile: FakeHomeProfile
  let skipReason: string | undefined
  let run: Result

  beforeAll(async () => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-strret-' })
    writeFileSync(join(profile.root, 'gl_string_return.h'), header())
    const exe = join(profile.root, 'strret')
    const base = ['-std=c11', '-Wall', '-Werror', '-I', profile.root]
    try {
      let cc = await spawnArgv(
        'clang',
        [...base, '-fsanitize=address,undefined', '-o', exe, HARNESS],
        profile.childEnv()
      )
      if (cc.code !== 0 && /sanitize/.test(cc.stderr)) {
        console.warn('stringReturnRoundTrip: sanitizers unavailable')
        cc = await spawnArgv(
          'clang',
          [...base, '-o', exe, HARNESS],
          profile.childEnv()
        )
      }
      if (cc.code !== 0) {
        throw new Error(`harness compile failed:\n${cc.stderr}`)
      }
      run = await spawnArgv(exe, [], profile.childEnv())
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        skipReason = 'clang not found on PATH'
        console.warn(`stringReturnRoundTrip skipped: ${skipReason}`)
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

  it('harness exits 0 with no FAIL line', () => {
    if (skipReason) return
    expect(run.stdout).not.toContain('FAIL')
    expect(run.code).toBe(0)
  })
})
