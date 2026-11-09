/**
 * Phase 69 (69-02, D-12). Pure census/evaluate cases plus the CLI end to end
 * against fixture trees (tmp dirs only; no child processes besides the
 * script under test).
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
  countContextImports,
  evaluate,
  loadShards,
  parseArgs,
  shardFor
} = require('../frontendContextCeiling.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'frontendContextCeiling.cjs')
const IMPORT = "import ContextProvider from 'frontend/state/ContextProvider'\n"

const tmpRoots: string[] = []
function mkRoot(): string {
  const d = mkdtempSync(join(tmpdir(), 'fcc-'))
  tmpRoots.push(d)
  return d
}
function put(root: string, rel: string, text: string) {
  const full = join(root, rel)
  mkdirSync(dirname(full), { recursive: true })
  writeFileSync(full, text)
}
function shard(dir: string, name: string, data: unknown) {
  put(dir, `${name}.json`, JSON.stringify(data))
}
let profile: FakeHomeProfile
beforeAll(() => {
  profile = createFakeHomeProfile()
})
afterAll(() => {
  for (const d of tmpRoots) rmSync(d, { recursive: true, force: true })
  profile.dispose()
})

function run(args: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: profile.childEnv()
  })
}

describe('countContextImports', () => {
  it.each<[string, string, string, number]>([
    ['alias import', IMPORT, 'src/frontend/a.tsx', 1],
    [
      'relative import',
      "import C from '../state/ContextProvider'",
      'src/frontend/hooks/a.ts',
      1
    ],
    [
      'same dir import',
      "import C from './ContextProvider'",
      'src/frontend/state/a.ts',
      1
    ],
    [
      'import with extension',
      "import C from './ContextProvider.tsx'",
      'src/frontend/state/a.ts',
      1
    ],
    [
      're-export',
      "export { default } from './ContextProvider'",
      'src/frontend/state/a.ts',
      1
    ],
    [
      'comment-only',
      '// see ContextProvider\n/* ContextProvider */',
      'src/frontend/a.ts',
      0
    ],
    [
      'string mention',
      "const s = 'frontend/state/ContextProvider'",
      'src/frontend/a.ts',
      0
    ],
    [
      'other module',
      "import C from 'frontend/state/GlobalStateV2'",
      'src/frontend/a.ts',
      0
    ],
    [
      'same name elsewhere',
      "import C from './ContextProvider'",
      'src/frontend/hooks/a.ts',
      0
    ]
  ])('%s', (_n, src, file, expected) => {
    expect(countContextImports(src, file)).toBe(expected)
  })

  it('anti-vacuity: one import scores 1 and comment-only scores 0 via census', () => {
    const one = mkRoot()
    put(one, 'src/frontend/a.tsx', IMPORT)
    const cmt = mkRoot()
    put(cmt, 'src/frontend/a.tsx', '// ContextProvider\n')
    expect(census(one).contextImports).toEqual({ 'src/frontend/a.tsx': 1 })
    expect(census(cmt).contextImports).toEqual({})
  })

  it('census skips tests and counts only scanned non-test files', () => {
    const r = mkRoot()
    put(r, 'src/frontend/a.tsx', IMPORT)
    put(r, 'src/frontend/a.test.tsx', IMPORT)
    put(r, 'src/frontend/__tests__/b.tsx', IMPORT)
    const c = census(r)
    expect(c.frontendFiles).toBe(1)
    expect(Object.keys(c.contextImports)).toEqual(['src/frontend/a.tsx'])
  })
})

describe('evaluate', () => {
  const f = 'src/frontend/a.tsx'
  it('equal passes', () => {
    expect(evaluate({ [f]: 2 }, { [f]: 2 })).toEqual([])
  })
  it('grew', () => {
    expect(evaluate({ [f]: 1 }, { [f]: 2 })[0]).toMatch(/^grew:/)
  })
  it('shrank', () => {
    expect(evaluate({ [f]: 2 }, { [f]: 1 })[0]).toMatch(
      /^shrank: lower .* in this commit/
    )
  })
  it('stale: entry for a file with no import', () => {
    expect(evaluate({ [f]: 1 }, {})[0]).toMatch(/^stale baseline/)
  })
  it('zero entry', () => {
    expect(evaluate({ [f]: 0 }, {})[0]).toMatch(/^zero entry/)
  })
  it('new: nonzero file in no shard', () => {
    expect(evaluate({}, { [f]: 1 })[0]).toMatch(/^new violation/)
  })
})

describe('shardFor', () => {
  it.each<[string, string]>([
    ['src/frontend/App.tsx', 'app'],
    ['src/frontend/components/UI/NavShell/x.tsx', 'components-ui-navshell'],
    ['src/frontend/components/UI/x.tsx', 'components-ui'],
    [
      'src/frontend/screens/Library/components/InstallModal/x.tsx',
      'screens-library-installmodal'
    ],
    ['src/frontend/screens/Library/x.tsx', 'screens-library'],
    ['src/frontend/screens/Humble/x.tsx', 'screens-other']
  ])('%s', (p, name) => {
    expect(shardFor(p)).toBe(name)
  })
})

describe('loadShards', () => {
  it('rejects unknown top-level keys', () => {
    const d = mkRoot()
    shard(d, 'app', { jestMock: {} })
    expect(loadShards(d).failures[0]).toMatch(/unknown key/)
  })
  it('rejects non-integer and non-positive entries', () => {
    const d = mkRoot()
    shard(d, 'app', { contextImports: { 'src/frontend/App.tsx': 0 } })
    shard(d, 'state', { contextImports: { 'src/frontend/state/a.ts': 1.5 } })
    expect(loadShards(d).failures).toHaveLength(2)
  })
  it('rejects a path in two shards (two-shards)', () => {
    const d = mkRoot()
    const data = { contextImports: { 'src/frontend/App.tsx': 1 } }
    shard(d, 'app', data)
    shard(d, 'bpp', data)
    expect(loadShards(d).failures.join('\n')).toMatch(/duplicate/)
  })
  it('rejects a path in the wrong shard (wrong-shard)', () => {
    const d = mkRoot()
    shard(d, 'hooks', { contextImports: { 'src/frontend/App.tsx': 1 } })
    expect(loadShards(d).failures[0]).toMatch(/wrong shard/)
  })
  it('accepts a missing dir and an empty contextImports object', () => {
    const d = mkRoot()
    shard(d, 'app', { contextImports: {} })
    expect(loadShards(d).failures).toEqual([])
    expect(loadShards(join(d, 'nope')).failures).toEqual([])
  })
})

describe('parseArgs', () => {
  it('rejects a flag without a value and a non-integer --min-files', () => {
    expect(() => parseArgs(['--shard'])).toThrow(/needs a value/)
    expect(() => parseArgs(['--min-files', 'x'])).toThrow(/invalid/)
  })
  it('no-update-flag: --update is unknown', () => {
    expect(() => parseArgs(['--update'])).toThrow(/unknown argument/)
  })
})

describe('CLI', () => {
  function fixture(entries: Record<string, number>) {
    const root = mkRoot()
    put(root, 'src/frontend/App.tsx', IMPORT)
    put(
      root,
      'src/frontend/hooks/h.ts',
      "import C from '../state/ContextProvider'"
    )
    const dir = join(root, 'base')
    shard(dir, 'app', { contextImports: entries })
    return { root, dir }
  }
  const base = (r: string, d: string) => [
    '--root',
    r,
    '--baseline-dir',
    d,
    '--min-files',
    '1'
  ]

  it('grew: a new importer outside any shard fails', () => {
    const { root, dir } = fixture({ 'src/frontend/App.tsx': 1 })
    const r = run(base(root, dir))
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/new violation: src\/frontend\/hooks\/h.ts/)
  })
  it('passes when baselines equal the census', () => {
    const { root, dir } = fixture({ 'src/frontend/App.tsx': 1 })
    shard(dir, 'hooks', { contextImports: { 'src/frontend/hooks/h.ts': 1 } })
    const r = run(base(root, dir))
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/PASS/)
  })
  it('floor: scanning fewer files than the floor fails', () => {
    const { root, dir } = fixture({ 'src/frontend/App.tsx': 1 })
    const r = run(['--root', root, '--baseline-dir', dir, '--min-files', '50'])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/scan is broken/)
  })
  it('--shard restricts evaluation', () => {
    const { root, dir } = fixture({ 'src/frontend/App.tsx': 1 })
    const r = run([...base(root, dir), '--shard', 'app'])
    expect(r.status).toBe(0)
  })
  it('no-update-flag: --update exits non-zero', () => {
    expect(run(['--update']).status).not.toBe(0)
  })
  it('the real tree passes', () => {
    expect(run([]).status).toBe(0)
  })
})
