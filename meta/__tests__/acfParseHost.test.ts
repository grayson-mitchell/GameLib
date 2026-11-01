/**
 * quick-261101-j03 (WR-02): behavioural proof of the DRM-mode ACF/VDF KeyValues parser.
 * The text between the GAMELIB-ACF-PARSE fences of steamclient_main.c is extracted and compiled on
 * the host, so the bytes that ship are the bytes under test.
 */
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'

const HARNESS = join(__dirname, 'fixtures', 'acf_parse_harness.c')
const SOURCE = join(
  __dirname,
  '..',
  '..',
  'native',
  'steam-bridge',
  'steamclient-layer',
  'lsteamclient',
  'steamclient_main.c'
)

const CASES = [
  'basic',
  'nested_first',
  'nested_only',
  'case_insensitive',
  'escaped_quotes',
  'comments',
  'missing',
  'overflow',
  'non_digit',
  'value_is_block',
  'malformed',
  'vdf_paths'
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

function extractParser(): string {
  const lines = readFileSync(SOURCE, 'utf8').split('\n')
  const idx = (needle: string) =>
    lines.flatMap((l, i) => (l.trim() === needle ? [i] : []))
  const begins = idx('/* GAMELIB-ACF-PARSE BEGIN */')
  const ends = idx('/* GAMELIB-ACF-PARSE END */')
  expect(begins).toHaveLength(1)
  expect(ends).toHaveLength(1)
  const traceBegin = lines.flatMap((l, i) =>
    l.includes('GAMELIB-DRM-TRACE BEGIN') ? [i] : []
  )[1]
  const traceEnd = lines.findIndex(
    (l, i) => i > traceBegin && l.includes('GAMELIB-DRM-TRACE END')
  )
  expect(begins[0]).toBeGreaterThan(traceBegin)
  expect(ends[0]).toBeLessThan(traceEnd)
  expect(begins[0]).toBeLessThan(ends[0])
  return lines.slice(begins[0] + 1, ends[0]).join('\n') + '\n'
}

describe('ACF/VDF KeyValues parser host harness (WR-02)', () => {
  let profile: FakeHomeProfile
  let skipReason: string | undefined
  let run: { code: number | null; stdout: string; stderr: string }

  beforeAll(async () => {
    profile = createFakeHomeProfile({ prefix: 'gamelib-acfparse-' })
    writeFileSync(join(profile.root, 'gl_acf_parse.c'), extractParser())
    const exe = join(profile.root, 'acfparse')
    try {
      const cc = await spawnArgv(
        'clang',
        [
          '-std=c11',
          '-Wall',
          '-Wextra',
          '-Werror',
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
        console.warn(`acfParseHost skipped: ${skipReason}`)
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
