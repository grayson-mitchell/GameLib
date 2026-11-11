/**
 * Phase 66 (66-02, D-06/D-13/D-14/D-16). Pure census and evaluate cases for
 * every D-06 shape, plus the CLI end to end (a pure-only suite can pass while
 * the shipped command is broken).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import {
  createFakeHomeProfile,
  type FakeHomeProfile
} from '../../src/backend/testUtils/fakeHomeProfile'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  census,
  countModuleState,
  countChildProcessImports,
  countJestMock,
  evaluate,
  loadShards,
  SANCTIONED_PATHS,
  parseArgs
} = require('../backendDiCeilings.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'backendDiCeilings.cjs')

describe('countModuleState', () => {
  it.each<[string, string, number]>([
    ['let', 'let a', 1],
    ['multiple let', 'let a, b', 2],
    ['destructured let', 'let { a, b: [c] } = x', 2],
    ['var', 'var v', 1],
    ['export let', 'export let e = 1', 1],
    ['new Map', 'const m = new Map()', 1],
    ['new Set', 'const s = new Set()', 1],
    ['new WeakMap', 'const w = new WeakMap()', 1],
    ['new Foo', 'const i = new Foo()', 1],
    ['new RegExp', "const r = new RegExp('x')", 0],
    ['new URL', "const u = new URL('http://x')", 0],
    ['new Intl.NumberFormat', 'const n = new Intl.NumberFormat()', 0],
    ['plain const', 'const k = 1', 0],
    ['mutated object by assignment', 'const o = {}\no.x = 1', 1],
    ['mutated array by push', 'const a2 = []\na2.push(1)', 1],
    ['unmutated object', 'const o2 = {}', 0],
    ['nested path assignment', 'const o3 = {a:{}}\no3.a.b = 2', 1],
    ['postfix increment', 'const c = { n: 0 }\nc.n++', 1],
    ['prefix decrement', 'const c = { n: 0 }\n--c.n', 1],
    ['compound assignment', 'const c = { n: 0 }\nc.n += 2', 1],
    ['element assignment', "const c = {}\nc['k'] = 2", 1],
    ['nested mutator call', 'const o = { l: [] }\no.l.push(1)', 1],
    ['Object.assign', 'const o4 = {}\nObject.assign(o4, {})', 1],
    ['new Map with as', 'const m2 = new Map() as Map<string, number>', 1],
    ['non-null new', 'const m3 = new Map()!', 1],
    ['let inside a function', 'function f() { let z = 1; return z }', 0],
    ['declare let', 'declare let g: number', 0],
    [
      'mutation inside a function body',
      'const o = {}\nfunction f() { o.x = 1 }',
      1
    ],
    ['read-only property use', 'const o = { a: 1 }\nconsole.log(o.a)', 0],
    ['static field', 'class A { static bound: X | null = null }', 1],
    ['private static field', 'class A { private static n = 0 }', 1],
    ['protected static field', 'class A { protected static g: G }', 1],
    ['two static fields', 'class A { static a = 1; static b = 2 }', 2],
    ['static readonly field', 'class A { static readonly K = 1 }', 0],
    ['static method', 'class A { static f() { return 1 } }', 0],
    ['static accessor', 'class A { static get g() { return 1 } }', 0],
    ['instance field', 'class A { bound: X | null = null }', 0],
    ['declare static field', 'class A { declare static d: number }', 0],
    [
      'static field in a class expression',
      'const C = class { static s = 1 }',
      1
    ],
    ['top-level let plus static', 'let a\nclass A { static s = 1 }', 2]
  ])('%s', (_name, src, expected) => {
    expect(countModuleState(src, 'x.ts')).toBe(expected)
  })

  it('let Map and its const new Map rewrite both count 1 (the rewrite gaming case)', () => {
    expect(countModuleState('let m: Map<string, number>', 'x.ts')).toBe(1)
    expect(
      countModuleState('const m = new Map<string, number>()', 'x.ts')
    ).toBe(1)
  })

  it('documented residual: a call returning a container is NOT counted', () => {
    expect(countModuleState('const reg = createRegistry()', 'x.ts')).toBe(0)
  })

  it('counts in .tsx files', () => {
    expect(countModuleState('let a = <div />', 'x.tsx')).toBe(1)
  })
})

describe('countChildProcessImports', () => {
  it.each<[string, string, number]>([
    ['named import', "import { spawn } from 'child_process'", 1],
    ['node: default import', "import cp from 'node:child_process'", 1],
    ['import type', "import type { ChildProcess } from 'child_process'", 0],
    [
      'inline type specifier',
      "import { type ChildProcess } from 'child_process'",
      0
    ],
    ['require', "const cp = require('child_process')", 1],
    ['dynamic import', "const m = await import('node:child_process')", 1],
    ['export from', "export { spawn } from 'child_process'", 1],
    ['side-effect import', "import 'child_process'", 1],
    ['import equals require', "import cp = require('child_process')", 1],
    [
      'process.getBuiltinModule',
      'const cp = process.getBuiltinModule("child_process")',
      1
    ],
    [
      'globalThis.process.getBuiltinModule',
      'globalThis.process.getBuiltinModule(x)',
      1
    ],
    ['bare getBuiltinModule', 'getBuiltinModule(x)', 1],
    [
      'createRequire',
      'import { createRequire } from "node:module"; const r = createRequire(import.meta.url)',
      1
    ],
    ['module.createRequire', 'module.createRequire(x)', 1],
    ['computed require', 'const m = "child_" + "process"; require(m)', 1],
    ['computed dynamic import', 'await import(name)', 1],
    ['template with substitution', 'require(`child_${x}`)', 1],
    [
      'no-substitution template of child_process',
      'require(`child_process`)',
      1
    ],
    ['no-substitution template of fs', 'require(`fs`)', 0],
    ['require of a literal fs', "require('fs')", 0],
    ['a comment', "// import x from 'child_process'", 0],
    ['an unrelated module', "import fs from 'fs'", 0],
    [
      'mixed value and type specifier',
      "import { spawn, type ChildProcess } from 'child_process'",
      1
    ]
  ])('%s', (_name, src, expected) => {
    expect(countChildProcessImports(src, 'x.ts')).toBe(expected)
  })
})

describe('countJestMock', () => {
  it('counts each call', () => {
    expect(
      countJestMock("jest.mock('x')\njest.mock('y', () => ({}))", 'x.ts')
    ).toBe(2)
  })
  it('ignores comments', () => {
    expect(countJestMock("// jest.mock('y')", 'x.ts')).toBe(0)
  })
  it('counts doMock', () => {
    expect(countJestMock("jest.doMock('z')", 'x.ts')).toBe(1)
  })
  it('counts setMock', () => {
    expect(countJestMock("jest.setMock('z', {})", 'x.ts')).toBe(1)
  })
  it('counts unstable_mockModule', () => {
    expect(
      countJestMock("jest.unstable_mockModule('z', () => ({}))", 'x.ts')
    ).toBe(1)
  })
  it('counts destructured mock calls, including renames', () => {
    expect(
      countJestMock(
        "const { mock, doMock: dm } = jest\nmock('a')\ndm('b')",
        'x.ts'
      )
    ).toBe(2)
  })
  it('does not count requireMock or createMockFromModule', () => {
    expect(
      countJestMock(
        "jest.requireMock('a')\njest.createMockFromModule('b')",
        'x.ts'
      )
    ).toBe(0)
  })
})

const SANC = {
  kind: 'runner',
  moduleState: 0,
  childProcess: 1,
  reason: 'a reason that is long enough to pass'
}
const RUNNER = 'src/backend/process/runner.ts'
const empty = () => ({ moduleState: {}, childProcess: {}, jestMock: {} })

describe('evaluate', () => {
  it('passes on exact match', () => {
    expect(
      evaluate(
        { moduleState: { a: 2 }, childProcess: { b: 1 }, jestMock: { c: 3 } },
        { moduleState: { a: 2 }, childProcess: { b: 1 }, jestMock: { c: 3 } }
      )
    ).toEqual([])
  })
  it('flags growth', () => {
    expect(
      evaluate({ moduleState: { a: 1 } }, { ...empty(), moduleState: { a: 2 } })
    ).toEqual([expect.stringContaining('grew: a 2 > baseline 1')])
  })
  it('flags a shrink without a lowered entry', () => {
    expect(
      evaluate({ jestMock: { a: 3 } }, { ...empty(), jestMock: { a: 2 } })
    ).toEqual([expect.stringContaining('shrank: lower a to 2 in this commit')])
  })
  it('flags a stale entry', () => {
    expect(evaluate({ childProcess: { a: 1 } }, empty())).toEqual([
      expect.stringContaining('stale baseline entry: a')
    ])
  })
  it('flags a zero entry', () => {
    expect(evaluate({ moduleState: { a: 0 } }, empty())).toEqual([
      expect.stringContaining('zero entry: remove a')
    ])
  })
  it('flags an unbaselined nonzero file', () => {
    expect(evaluate({}, { ...empty(), childProcess: { a: 1 } })).toEqual([
      expect.stringContaining('new violation: a')
    ])
  })
  it('passes a sanctioned exact match', () => {
    expect(
      evaluate(
        { sanctioned: { [RUNNER]: SANC } },
        { ...empty(), childProcess: { [RUNNER]: 1 } }
      )
    ).toEqual([])
  })
  it('CR-01: a sanctioned entry of 2 for a file at 9 fails (no entry exempts at any size)', () => {
    expect(
      evaluate(
        {
          sanctioned: { [RUNNER]: { ...SANC, moduleState: 2, childProcess: 0 } }
        },
        { ...empty(), moduleState: { [RUNNER]: 9 } }
      )
    ).toEqual([expect.stringContaining(`grew: ${RUNNER} 9 > baseline 2`)])
  })
  it('flags sanctioned growth in childProcess', () => {
    expect(
      evaluate(
        { sanctioned: { [RUNNER]: SANC } },
        { ...empty(), childProcess: { [RUNNER]: 2 } }
      )
    ).toEqual([expect.stringContaining(`grew: ${RUNNER} 2 > baseline 1`)])
  })
  it('flags sanctioned shrink', () => {
    expect(
      evaluate(
        { sanctioned: { [RUNNER]: { ...SANC, moduleState: 3 } } },
        {
          ...empty(),
          moduleState: { [RUNNER]: 1 },
          childProcess: { [RUNNER]: 1 }
        }
      )
    ).toEqual([expect.stringContaining(`shrank: lower ${RUNNER} to 1`)])
  })
  it('flags a sanctioned stale entry', () => {
    expect(evaluate({ sanctioned: { [RUNNER]: SANC } }, empty())).toEqual([
      expect.stringContaining(`stale sanctioned entry: ${RUNNER}`)
    ])
  })
  it('flags both-zero sanctioned counts', () => {
    expect(
      evaluate(
        { sanctioned: { [RUNNER]: { ...SANC, childProcess: 0 } } },
        empty()
      )
    ).toEqual([expect.stringContaining('both counts are 0')])
  })
  it('flags an unknown sanctioned kind', () => {
    const f = evaluate(
      { sanctioned: { [RUNNER]: { ...SANC, kind: 'whatever' } } },
      { ...empty(), childProcess: { [RUNNER]: 1 } }
    )
    expect(f.join('\n')).toContain('unknown kind')
  })
  it('flags a short reason', () => {
    const f = evaluate(
      { sanctioned: { [RUNNER]: { ...SANC, reason: 'short' } } },
      { ...empty(), childProcess: { [RUNNER]: 1 } }
    )
    expect(f.join('\n')).toContain('reason must be')
  })
  it('flags rust-overlap without deletedBy', () => {
    const base = { ...SANC, kind: 'rust-overlap' }
    const cur = { ...empty(), childProcess: { [RUNNER]: 1 } }
    expect(
      evaluate({ sanctioned: { [RUNNER]: base } }, cur).join('\n')
    ).toContain('deletedBy')
    expect(
      evaluate(
        { sanctioned: { [RUNNER]: { ...base, deletedBy: 'later' } } },
        cur
      ).join('\n')
    ).toContain('deletedBy')
  })
  it('flags a sanctioned path that is also baselined', () => {
    const f = evaluate(
      { sanctioned: { [RUNNER]: SANC }, childProcess: { [RUNNER]: 1 } },
      { ...empty(), childProcess: { [RUNNER]: 1 } }
    )
    expect(f.join('\n')).toContain('also appears in childProcess')
  })
  it('does not exempt jestMock for a sanctioned path', () => {
    expect(
      evaluate(
        { sanctioned: { [RUNNER]: SANC } },
        { ...empty(), childProcess: { [RUNNER]: 1 }, jestMock: { [RUNNER]: 1 } }
      )
    ).toEqual([expect.stringContaining(`new violation: ${RUNNER}`)])
  })
  it('rejects a sanctioned entry at a path its kind does not allow', () => {
    const f = evaluate(
      { sanctioned: { 'src/backend/other.ts': SANC } },
      { ...empty(), childProcess: { 'src/backend/other.ts': 1 } }
    )
    expect(f.join('\n')).toContain(
      'kind runner only allows [src/backend/process/runner.ts]'
    )
  })
  it('rust-overlap allows no path (D-14 table is empty)', () => {
    expect(SANCTIONED_PATHS['rust-overlap']).toEqual([])
    const f = evaluate(
      {
        sanctioned: {
          [RUNNER]: { ...SANC, kind: 'rust-overlap', deletedBy: 'Phase 75' }
        }
      },
      { ...empty(), childProcess: { [RUNNER]: 1 } }
    )
    expect(f.join('\n')).toContain('kind rust-overlap only allows []')
  })
})

describe('loadShards', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bdc-shards-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  it('loads an empty directory without failures (no file is required by name)', () => {
    expect(loadShards(dir)).toEqual({
      merged: {
        moduleState: {},
        childProcess: {},
        jestMock: {},
        sanctioned: {}
      },
      failures: []
    })
  })
  it('merges disjoint shards', () => {
    writeFileSync(
      join(dir, 'a.json'),
      JSON.stringify({ moduleState: { x: 1 } })
    )
    writeFileSync(
      join(dir, 'b.json'),
      JSON.stringify({ moduleState: { y: 2 } })
    )
    const { merged, failures } = loadShards(dir)
    expect(failures).toEqual([])
    expect(merged.moduleState).toEqual({ x: 1, y: 2 })
  })
  it('fails when a path is in two shards for one section', () => {
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ jestMock: { x: 1 } }))
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ jestMock: { x: 2 } }))
    expect(loadShards(dir).failures).toEqual([
      expect.stringContaining('duplicate: x')
    ])
  })
  it('rejects a childProcess section in any shard (66.2 D-16)', () => {
    writeFileSync(
      join(dir, 'a.json'),
      JSON.stringify({ childProcess: { 'src/backend/x.ts': 1 } })
    )
    writeFileSync(join(dir, 'b.json'), JSON.stringify({ childProcess: {} }))
    const { failures } = loadShards(dir)
    expect(failures).toHaveLength(2)
    expect(failures[0]).toContain(
      'childProcess ceiling deleted (66.2 D-16): remove the section; only sanctioned process/runner.ts may import child_process'
    )
  })
  it('names the ban when a non-sanctioned file imports child_process', () => {
    const f = evaluate(
      {},
      { ...empty(), childProcess: { 'src/backend/x.ts': 1 } }
    )
    expect(f).toEqual([
      expect.stringContaining('new violation: src/backend/x.ts')
    ])
    expect(f[0]).toContain(
      'only sanctioned process/runner.ts may import child_process'
    )
  })
  it('fails on unknown keys, zero values and bad JSON', () => {
    writeFileSync(join(dir, 'a.json'), JSON.stringify({ bogus: {} }))
    writeFileSync(
      join(dir, 'b.json'),
      JSON.stringify({ moduleState: { x: 0 } })
    )
    writeFileSync(join(dir, 'c.json'), '{nope')
    expect(loadShards(dir).failures).toHaveLength(3)
  })
})

describe('parseArgs', () => {
  it('parses all flags', () => {
    expect(
      parseArgs([
        '--root',
        'r',
        '--baseline-dir',
        'd',
        '--shard',
        's',
        '--min-backend-files',
        '3',
        '--min-src-files',
        '4'
      ])
    ).toEqual({
      root: 'r',
      baselineDir: 'd',
      shard: 's',
      minBackendFiles: 3,
      minSrcFiles: 4
    })
  })
  it('throws on a missing value, an unknown flag and a bad floor', () => {
    expect(() => parseArgs(['--root'])).toThrow('needs a value')
    expect(() => parseArgs(['--shard', '--root'])).toThrow('needs a value')
    expect(() => parseArgs(['--update'])).toThrow('unknown argument')
    expect(() => parseArgs(['--min-src-files', 'x'])).toThrow('invalid')
  })
})

describe('backendDiCeilings CLI', () => {
  let tmp: string
  let profile: FakeHomeProfile

  const write = (rel: string, text: string) => {
    const full = join(tmp, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  }
  const run = (extra: string[] = []) =>
    spawnSync(
      process.execPath,
      [
        SCRIPT,
        '--root',
        tmp,
        '--baseline-dir',
        join(tmp, 'baselines'),
        '--min-backend-files',
        '1',
        '--min-src-files',
        '1',
        ...extra
      ],
      { env: profile.childEnv(), encoding: 'utf-8' }
    )

  beforeEach(() => {
    profile = createFakeHomeProfile()
    tmp = mkdtempSync(join(tmpdir(), 'bdc-cli-'))
    write('src/backend/a.ts', 'let x = 1\n')
    write('src/backend/b.ts', 'export const b = 1\n')
    write(
      'src/backend/__tests__/a.test.ts',
      "jest.mock('x')\nlet skipped = 1\n"
    )
    write(
      'baselines/one.json',
      JSON.stringify({
        moduleState: { 'src/backend/a.ts': 1 },
        jestMock: { 'src/backend/__tests__/a.test.ts': 1 }
      })
    )
  })
  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true })
    profile.dispose()
  })

  it('exits 0 when the shards match', () => {
    const r = run()
    expect(r.stderr).toBe('')
    expect(r.status).toBe(0)
    expect(r.stdout).toContain('backend-di-ceilings: PASS')
  })
  it('census skips test dirs for module state', () => {
    const c = census(tmp)
    expect(c.moduleState).toEqual({ 'src/backend/a.ts': 1 })
    expect(c.backendFiles).toBe(2)
    expect(c.srcFiles).toBe(3)
  })
  it('exits 1 with grew after a site is added', () => {
    write('src/backend/a.ts', 'let x = 1\nlet y = 2\n')
    const r = run()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('grew')
  })
  it('exits 1 with new violation for an unbaselined file', () => {
    write('src/backend/c.ts', 'let z\n')
    const r = run()
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('new violation')
  })
  it('exits 1 when the floor exceeds files scanned', () => {
    const r = run(['--min-backend-files', '50'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('below the floor')
  })
  it('--shard restricts evaluation to the paths that shard lists', () => {
    write(
      'baselines/two.json',
      JSON.stringify({ moduleState: { 'src/backend/c.ts': 1 } })
    )
    write('src/backend/c.ts', 'let z\nlet w\n')
    expect(run(['--shard', 'one']).status).toBe(0)
    const r = run(['--shard', 'two'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('grew')
  })
  it('--shard with an unknown name fails', () => {
    const r = run(['--shard', 'nope'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('unknown shard')
  })
  it('scans a testUtils directory that is not src/backend/testUtils', () => {
    write('src/backend/testUtils/skip.ts', 'let skipped\n')
    write('src/backend/foo/testUtils/scan.ts', 'let scanned\n')
    expect(census(tmp).moduleState).toEqual({
      'src/backend/a.ts': 1,
      'src/backend/foo/testUtils/scan.ts': 1
    })
  })
  // 66.2 WR-02: production value-imports testUtils, so the ban still covers it.
  it('counts child_process in src/backend/testUtils but not in its tests', () => {
    write('src/backend/testUtils/spawny.ts', "import 'node:child_process'\n")
    write(
      'src/backend/testUtils/__tests__/ok.test.ts',
      "import 'node:child_process'\n"
    )
    write('src/backend/testUtils/ok.test.ts', "import 'child_process'\n")
    expect(census(tmp).childProcess).toEqual({
      'src/backend/testUtils/spawny.ts': 1
    })
  })
  it('a malformed --shard file is reported as a failure, not thrown', () => {
    write('baselines/bad.json', '{ nope')
    const r = run(['--shard', 'bad'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('cannot read shard bad.json')
    expect(r.stderr).not.toContain('SyntaxError: ')
  })
  it('--update is rejected (no update flag exists)', () => {
    const r = run(['--update'])
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('unknown argument')
  })
})
