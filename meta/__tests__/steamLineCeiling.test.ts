/**
 * Phase 65 (65-01, D-01/D-02/D-13). Pure `countLines` / `collectFiles` /
 * `evaluate` cases plus the CLI end-to-end (a pure-only suite can pass while
 * the shipped command is broken).
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  countLines,
  collectFiles,
  evaluate
} = require('../steamLineCeiling.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'steamLineCeiling.cjs')

describe('steamLineCeiling countLines', () => {
  it('uses wc -l semantics', () => {
    expect(countLines('x\ny\n')).toBe(2)
    expect(countLines('x\ny')).toBe(2)
    expect(countLines('')).toBe(0)
  })
})

describe('steamLineCeiling evaluate', () => {
  it('flags a new file over the ceiling', () => {
    expect(evaluate({}, { a: 1001 })).toEqual([
      expect.stringContaining('over ceiling: a has 1001 lines (max 1000)')
    ])
  })
  it('flags growth', () => {
    expect(evaluate({ a: 1200 }, { a: 1300 })).toEqual([
      expect.stringContaining('grew: a 1300 > baseline 1200')
    ])
  })
  it('flags a shrink without a lowered entry', () => {
    expect(evaluate({ a: 1200 }, { a: 1100 })).toEqual([
      expect.stringContaining('lower a to 1100 in this commit')
    ])
  })
  it('flags an entry at or under the ceiling', () => {
    expect(evaluate({ a: 1200 }, { a: 900 })).toEqual([
      expect.stringContaining('remove a from the baseline in this commit')
    ])
    expect(evaluate({ a: 1200 }, { a: 1000 })).toEqual([
      expect.stringContaining('remove a from the baseline in this commit')
    ])
  })
  it('flags an entry naming a missing file', () => {
    expect(evaluate({ a: 1200 }, {})).toEqual([
      expect.stringContaining('stale baseline entry: a')
    ])
  })
  it('passes on equality and under-ceiling files', () => {
    expect(evaluate({ a: 1200 }, { a: 1200, b: 999 })).toEqual([])
  })
})

function seed(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gamelib-linecap-'))
  for (const [rel, text] of Object.entries(files)) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }
  return root
}

describe('steamLineCeiling collectFiles', () => {
  it('excludes tests, mocks, generated files and non-code extensions', () => {
    const root = seed({
      'a.ts': 'x\n',
      'sub/b.cjs': 'x\n',
      '__tests__/c.ts': 'x\n',
      '__mocks__/d.ts': 'x\n',
      'e.test.ts': 'x\n',
      'f.spec.ts': 'x\n',
      'g.generated.ts': 'x\n',
      'h.json': '{}\n'
    })
    try {
      expect(collectFiles(root, root).sort()).toEqual(['a.ts', 'sub/b.cjs'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('steamLineCeiling CLI', () => {
  function run(args: string[]) {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-linecap-' })
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

  it('exits 0 on the real repo', () => {
    const r = run([])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/PASS/)
  })

  it('exits non-zero when fewer files than the floor are scanned', () => {
    const root = seed({ 'a.ts': 'x\n' })
    const baseline = join(root, 'baseline.json')
    writeFileSync(baseline, '{}')
    try {
      const r = run(['--root', root, '--baseline', baseline])
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/floor/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exits non-zero on an over-ceiling file and zero once allowlisted', () => {
    const big = 'x\n'.repeat(1001)
    const root = seed({ 'big.ts': big })
    const baseline = join(root, 'baseline.json')
    try {
      writeFileSync(baseline, '{}')
      expect(
        run(['--root', root, '--baseline', baseline, '--min-files', '1']).status
      ).toBe(1)
      writeFileSync(baseline, JSON.stringify({ 'big.ts': 1001 }))
      expect(
        run(['--root', root, '--baseline', baseline, '--min-files', '1']).status
      ).toBe(0)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exits non-zero when the baseline cannot be read', () => {
    const r = run(['--baseline', '/nonexistent/baseline.json'])
    expect(r.status).toBe(1)
  })
})
