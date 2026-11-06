/**
 * Quick 261107-8yq. Pure `tally`/`evaluate` cases plus the CLI end-to-end
 * against synthetic cargo JSON (a pure-only suite can pass while the shipped
 * command is broken).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  evaluate,
  tally,
  CLIPPY_CEILINGS,
  CLIPPY_TOOLCHAIN
} = require('../clippyRatchet.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'clippyRatchet.cjs')

const warning = (
  code: string | null,
  line: number,
  message = 'msg',
  file = 'src/main.rs'
) =>
  JSON.stringify({
    reason: 'compiler-message',
    message: {
      level: 'warning',
      message,
      code: code === null ? null : { code },
      spans: [
        { is_primary: true, file_name: file, line_start: line, column_start: 1 }
      ]
    }
  })
const artifact = JSON.stringify({
  reason: 'compiler-artifact',
  target: { name: 'gamelib-shell' }
})
const finished = (success: boolean) =>
  JSON.stringify({ reason: 'build-finished', success })

const stream = (
  warnings: string[],
  opts: { art?: boolean; fin?: string } = {}
) =>
  [
    'Compiling noise',
    ...(opts.art === false ? [] : [artifact]),
    ...warnings,
    opts.fin ?? finished(true)
  ].join('\n')

/** A stream whose counts equal the given ceilings exactly. */
const streamFor = (ceilings: Record<string, number>, extra: string[] = []) => {
  const w: string[] = []
  for (const [lint, n] of Object.entries(ceilings)) {
    for (let i = 0; i < n; i++) w.push(warning(lint, i + 1))
  }
  return stream([...w, ...extra])
}

describe('clippyRatchet tally', () => {
  test('identical warnings count once; different line counts twice', () => {
    const t = tally(stream([warning('a', 1), warning('a', 1), warning('a', 2)]))
    expect(t.counts).toEqual({ a: 2 })
  })
  test('non-JSON lines and uncoded span-less summaries are ignored', () => {
    const summary = JSON.stringify({
      reason: 'compiler-message',
      message: {
        level: 'warning',
        message: '3 warnings emitted',
        code: null,
        spans: []
      }
    })
    const t = tally(stream([summary, warning('a', 1)]))
    expect(t.counts).toEqual({ a: 1 })
  })
  test('uncoded warnings with a span count under (uncoded)', () => {
    expect(tally(stream([warning(null, 1)])).counts).toEqual({
      '(uncoded)': 1
    })
  })
  test('reports finished, success and artifactSeen', () => {
    const t = tally(stream([]))
    expect(t).toMatchObject({
      finished: true,
      success: true,
      artifactSeen: true
    })
    expect(tally('').finished).toBe(false)
    expect(tally(stream([], { art: false })).artifactSeen).toBe(false)
  })
})

describe('clippyRatchet evaluate', () => {
  const ceil = { a: 2, b: 1 }
  const ok = () => tally(streamFor(ceil))
  test('equal is green', () => {
    expect(evaluate(ok(), ceil, 'darwin')).toEqual([])
  })
  test('a lint above its ceiling fails with the delta', () => {
    const f = evaluate(tally(streamFor({ a: 3, b: 1 })), ceil, 'darwin')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/1 new warning\(s\).*\ba\b/)
  })
  test('a lint absent from the ceilings is a new warning', () => {
    const f = evaluate(tally(streamFor({ a: 2, b: 1, c: 1 })), ceil, 'darwin')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/new warning\(s\).*\bc\b/)
  })
  test('a lint below its ceiling says to lower it', () => {
    const f = evaluate(tally(streamFor({ a: 1, b: 1 })), ceil, 'darwin')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/lower a to 1 in this commit/)
  })
  test('a lint at 0 that has a ceiling says to lower it to 0', () => {
    const f = evaluate(tally(streamFor({ a: 2 })), ceil, 'darwin')
    expect(f[0]).toMatch(/lower b to 0 in this commit/)
  })
  test.each([
    ['no build-finished', stream([], { fin: '' })],
    ['success false', stream([], { fin: finished(false) })],
    ['no gamelib-shell artifact', stream([], { art: false })],
    ['empty stream', '']
  ])('%s fails even with zero warnings', (_n, text) => {
    expect(evaluate(tally(text), {}, 'darwin').length).toBeGreaterThan(0)
  })
  test('undefined ceilings name the platform', () => {
    const f = evaluate(ok(), undefined, 'win32')
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/win32/)
  })
  test('constants: toolchain pinned, darwin ceilings positive', () => {
    expect(CLIPPY_TOOLCHAIN).toBe('1.99.1')
    for (const n of Object.values(CLIPPY_CEILINGS.darwin)) {
      expect(n).toBeGreaterThan(0)
    }
  })
})

describe('clippyRatchet CLI', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-clippy-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const run = (args: string[]) => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-ratchet-' })
    try {
      return spawnSync(process.execPath, [SCRIPT, ...args], {
        cwd: REPO_ROOT,
        env: profile.childEnv(process.env),
        encoding: 'utf8'
      })
    } finally {
      profile.dispose()
    }
  }
  const file = (text: string) => {
    const p = join(dir, 'clippy.json')
    writeFileSync(p, text)
    return p
  }

  test('exits 0 when the stream equals the darwin ceilings', () => {
    const r = run([
      file(streamFor(CLIPPY_CEILINGS.darwin)),
      '--platform',
      'darwin'
    ])
    expect(r.status).toBe(0)
    expect(r.stderr + r.stdout).toMatch(/PASS/)
  })
  test('--list prints the tally', () => {
    const r = run([
      file(streamFor(CLIPPY_CEILINGS.darwin)),
      '--list',
      '--platform',
      'darwin'
    ])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/dead_code/)
  })
  test('exits 1 with one extra warning', () => {
    const r = run([
      file(streamFor(CLIPPY_CEILINGS.darwin, [warning('extra_lint', 1)])),
      '--platform',
      'darwin'
    ])
    expect(r.status).toBe(1)
  })
  test('exits 1 for a missing path', () => {
    expect(run([join(dir, 'nope.json'), '--platform', 'darwin']).status).toBe(1)
  })
  test('exits 1 with --platform win32', () => {
    const r = run([
      file(streamFor(CLIPPY_CEILINGS.darwin)),
      '--platform',
      'win32'
    ])
    expect(r.status).toBe(1)
  })
})
