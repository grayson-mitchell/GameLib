/**
 * Quick 261107-9lq. Pure bucketOf/tally/evaluate cases plus the CLI end to
 * end against fixture projects (a pure-only suite can pass while the shipped
 * command is broken).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  bucketOf,
  tally,
  evaluate,
  ADOPTED_BUCKETS
} = require('../indexedAccessRatchet.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'indexedAccessRatchet.cjs')
const STEAM = 'src/backend/storeManagers/steam'

describe('indexedAccessRatchet bucketOf', () => {
  test.each([
    [`${STEAM}/depot/crypto.ts`, STEAM],
    [`${STEAM}/bridge/drm/drmTrace.ts`, STEAM],
    [`${STEAM}/__tests__/a.ts`, `${STEAM} (tests)`],
    [`${STEAM}/bridge/__tests__/a.ts`, `${STEAM} (tests)`],
    [`${STEAM}/x.test.ts`, `${STEAM} (tests)`],
    ['src/backend/storeManagers/gog/x.ts', 'src/backend/storeManagers/gog'],
    ['src/frontend/screens/A/B.tsx', 'src/frontend/screens'],
    ['src/backend/utils.ts', 'src/backend/utils.ts'],
    ['meta/__tests__/x.test.ts', 'meta'],
    ['meta/gen_vtables.ts', 'meta']
  ])('%s -> %s', (p, b) => {
    expect(bucketOf(p)).toBe(b)
  })
  test('adopted buckets are the steam and gog buckets', () => {
    expect(ADOPTED_BUCKETS).toEqual([
      STEAM,
      'src/backend/storeManagers/gog',
      'src/backend/storeManagers/legendary',
      'src/backend/humble',
      `${STEAM} (tests)`,
      'src/backend/engine',
      'src/backend/__tests__',
      'src/backend/wine',
      'src/backend/utils',
      'src/backend/utils.ts',
      'src/backend/testUtils'
    ])
  })
})

const d = (file: string | undefined, start = 1, code = 2532) => ({
  file,
  start,
  line: 1,
  col: 1,
  code
})

describe('indexedAccessRatchet tally', () => {
  test('same file+start+code from two programs counts once', () => {
    const t = tally([d('/r/src/a/b/x.ts'), d('/r/src/a/b/x.ts')], '/r')
    expect(t.counts).toEqual({ 'src/a/b': 1 })
  })
  test('a different start counts again', () => {
    const t = tally([d('/r/src/a/b/x.ts', 1), d('/r/src/a/b/x.ts', 2)], '/r')
    expect(t.counts).toEqual({ 'src/a/b': 2 })
  })
  test('a path outside the repo fails explicitly', () => {
    const t = tally([d('/elsewhere/node_modules/x.d.ts')], '/r')
    expect(t.failures).toHaveLength(1)
    expect(t.counts).toEqual({})
  })
  test('a file-less diagnostic fails explicitly', () => {
    expect(tally([d(undefined)], '/r').failures).toHaveLength(1)
  })
})

describe('indexedAccessRatchet evaluate', () => {
  const t = (counts: Record<string, number>) => ({
    counts,
    sites: [],
    failures: [] as string[],
    files: { [STEAM]: new Set(['src/backend/storeManagers/steam/a.ts']) }
  })
  test('equal counts pass', () => {
    expect(evaluate(t({ x: 2 }), { x: 2 }, [STEAM])).toEqual([])
  })
  test('adopted bucket above 0 fails and names the files', () => {
    const f = evaluate(t({ [STEAM]: 1 }), {}, [STEAM])
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/steam\/a\.ts/)
  })
  test('growth fails with the delta', () => {
    expect(evaluate(t({ x: 5 }), { x: 2 }, [STEAM])[0]).toMatch(/3 new/)
  })
  test('unknown bucket fails as new', () => {
    expect(evaluate(t({ y: 1 }), {}, [STEAM])[0]).toMatch(/new bucket y/)
  })
  test('below baseline fails and names the number', () => {
    expect(evaluate(t({ x: 1 }), { x: 2 }, [STEAM])[0]).toMatch(
      /lower x to 1 in this commit/
    )
  })
  test('baseline bucket now at 0 says to delete it', () => {
    expect(evaluate(t({}), { x: 2 }, [STEAM])[0]).toMatch(/delete it/)
  })
  test('baseline listing an adopted bucket fails', () => {
    expect(evaluate(t({}), { [STEAM]: 3 }, [STEAM]).length).toBeGreaterThan(0)
  })
  test('config errors fail even with zero sites', () => {
    expect(evaluate(t({}), {}, [STEAM], ['config broke'])).toEqual([
      'config broke'
    ])
  })
})

describe('indexedAccessRatchet CLI', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-nuia-'))
    mkdirSync(join(dir, 'src', 'a', 'b'), { recursive: true })
    writeFileSync(
      join(dir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { strict: true, noEmit: true, types: [] },
        include: ['src']
      })
    )
    writeFileSync(
      join(dir, 'src', 'a', 'b', 'x.ts'),
      'const xs: string[] = []\nexport const n: string = xs[0]\n'
    )
    writeFileSync(join(dir, 'baseline.json'), JSON.stringify({ 'src/a/b': 1 }))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const run = (args: string[]) => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-nuia-home-' })
    try {
      return spawnSync(
        process.execPath,
        [
          SCRIPT,
          '--root',
          dir,
          '--project',
          'tsconfig.json',
          '--baseline',
          join(dir, 'baseline.json'),
          ...args
        ],
        { cwd: REPO_ROOT, env: profile.childEnv(process.env), encoding: 'utf8' }
      )
    } finally {
      profile.dispose()
    }
  }

  test('exits 0 when counts equal the baseline', () => {
    const r = run([])
    expect(r.stderr + r.stdout).toMatch(/PASS/)
    expect(r.status).toBe(0)
  })
  test('exits 1 when a fixture adds one indexed read', () => {
    writeFileSync(
      join(dir, 'src', 'a', 'b', 'y.ts'),
      'const ys: string[] = []\nexport const m: string = ys[0]\n'
    )
    const r = run([])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/1 new site/)
  })
  test('--list prints sites, filtered by prefix', () => {
    const all = run(['--list'])
    expect(all.stdout).toMatch(/src\/a\/b\/x\.ts:2:\d+ TS\d+/)
    const none = run(['--list', 'src/other/'])
    expect(none.stdout).not.toMatch(/x\.ts:2/)
  })
  test('a missing tsconfig fails rather than reading as zero', () => {
    rmSync(join(dir, 'tsconfig.json'))
    expect(run([]).status).toBe(1)
  })
})
