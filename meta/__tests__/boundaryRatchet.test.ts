/**
 * Phase 62 plan 02. Pure `evaluate` cases (over, under, equal, floor) and the
 * CLI end-to-end against the real repo (a pure-half-only suite can pass while
 * the shipped command is broken).
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */
const {
  evaluate,
  FRONTEND_CEILING,
  BACKEND_CEILING,
  FRONTEND_MIN_FILES,
  BACKEND_MIN_FILES
} = require('../boundaryRatchet.cjs')
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'boundaryRatchet.cjs')

const scopes = {
  frontend: {
    label: 'frontend',
    ceilingName: 'FRONTEND_CEILING',
    ceiling: 10,
    minFiles: 5
  },
  backend: {
    label: 'backend',
    ceilingName: 'BACKEND_CEILING',
    ceiling: 3,
    minFiles: 2
  }
}
const at = (f: number, b: number, ff = 100, bf = 100) => ({
  frontend: { count: f, files: ff },
  backend: { count: b, files: bf }
})

describe('boundaryRatchet evaluate', () => {
  test('equal is green', () => {
    expect(evaluate(at(10, 3), scopes)).toEqual([])
  })
  test('over the ceiling fails with "new runner literal"', () => {
    const f = evaluate(at(11, 3), scopes)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/new runner literal/)
  })
  test('under the ceiling fails with the lower-the-ceiling instruction', () => {
    const f = evaluate(at(10, 2), scopes)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/lower BACKEND_CEILING to 2 in this commit/)
  })
  test('files below minFiles fails as a collapsed scope', () => {
    const f = evaluate(at(10, 3, 4), scopes)
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/scope collapsed/)
  })
  test('every failing condition is collected', () => {
    expect(evaluate(at(11, 2, 1), scopes).length).toBe(3)
  })
  test('committed ceilings are non-negative and floors are set', () => {
    // 62-16 took the backend and 62-19 the frontend to zero literals; zero is the goal, not a broken constant.
    expect(FRONTEND_CEILING).toBeGreaterThanOrEqual(0)
    expect(BACKEND_CEILING).toBeGreaterThanOrEqual(0)
    expect(FRONTEND_MIN_FILES).toBeGreaterThan(0)
    expect(BACKEND_MIN_FILES).toBeGreaterThan(0)
  })
})

describe('boundaryRatchet CLI (real repo)', () => {
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

  test('exits 0 at the committed ceilings', () => {
    const r = run([])
    expect(r.status).toBe(0)
  }, 120_000)

  test('--list prints one line per site, equal to the ceilings', () => {
    const r = run(['--list'])
    expect(r.status).toBe(0)
    const sites = r.stdout
      .split('\n')
      .filter((l: string) => l && !l.startsWith('#'))
    expect(sites).toHaveLength(FRONTEND_CEILING + BACKEND_CEILING)
  }, 120_000)
})
