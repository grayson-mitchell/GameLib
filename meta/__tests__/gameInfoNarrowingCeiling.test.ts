/**
 * Phase 70 (70-02, D-15). Pure `countNarrowing` / `collectFiles` / `evaluate`
 * cases plus the CLI end to end.
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  countNarrowing,
  collectFiles,
  evaluate,
  parseArgs,
  staleExemptions,
  STORE_SPECIFIC_EXEMPT
} = require('../gameInfoNarrowingCeiling.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'gameInfoNarrowingCeiling.cjs')

describe('gameInfoNarrowingCeiling countNarrowing', () => {
  it('counts a guard call', () => {
    expect(
      countNarrowing("const d = asStoreGame(g, 'steam')?.is_delisted\n", 'a.ts')
    ).toBe(1)
  })
  it('counts a member type annotation', () => {
    expect(countNarrowing('const g: SteamGameInfo = x\n', 'a.ts')).toBe(1)
  })
  it('does not count an import alone', () => {
    expect(
      countNarrowing(
        "import type { SteamGameInfo } from 'common/types'\n",
        'a.ts'
      )
    ).toBe(0)
  })
  it('does not count a comment', () => {
    expect(
      countNarrowing('// uses isStoreGame here\nconst a = 1\n', 'a.ts')
    ).toBe(0)
  })
  it('does not count an unrelated call', () => {
    expect(countNarrowing("isStore(g, 'steam')\n", 'a.ts')).toBe(0)
  })
  it('parses tsx', () => {
    expect(
      countNarrowing('const a = <div>{isStoreGame(g, "gog")}</div>\n', 'a.tsx')
    ).toBe(1)
  })
})

describe('gameInfoNarrowingCeiling evaluate', () => {
  const base = (over = {}) => ({
    counts: { a: 2 },
    baseline: { files: { a: 2 }, reasons: { a: 'why' } },
    scannedFiles: 10,
    minFiles: 5,
    ...over
  })
  const kinds = (r: { failures: { kind: string }[] }) =>
    r.failures.map((f) => f.kind)

  it('passes on equality', () => {
    expect(evaluate(base()).ok).toBe(true)
  })
  it('flags growth', () => {
    expect(kinds(evaluate(base({ counts: { a: 3 } })))).toEqual(['grew'])
  })
  it('flags a file missing from the baseline as growth', () => {
    expect(kinds(evaluate(base({ counts: { a: 2, b: 1 } })))).toEqual(['grew'])
  })
  it('flags a shrink', () => {
    expect(kinds(evaluate(base({ counts: { a: 1 } })))).toEqual(['shrank'])
  })
  it('flags an entry for a file at 0 or not scanned', () => {
    expect(kinds(evaluate(base({ counts: { a: 0 } })))).toEqual(['stale'])
    expect(kinds(evaluate(base({ counts: {} })))).toEqual(['stale'])
  })
  it('flags an entry without a reason and a reason without an entry', () => {
    expect(
      kinds(evaluate(base({ baseline: { files: { a: 2 }, reasons: {} } })))
    ).toEqual(['unreviewed'])
    expect(
      kinds(
        evaluate(
          base({ baseline: { files: { a: 2 }, reasons: { a: 'x', b: 'y' } } })
        )
      )
    ).toEqual(['unreviewed'])
  })
  it('flags a scan below the floor', () => {
    expect(kinds(evaluate(base({ scannedFiles: 1 })))).toEqual(['floor'])
  })
})

function seed(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'gamelib-narrow-'))
  for (const [rel, text] of Object.entries(files)) {
    const full = join(root, ...rel.split('/'))
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, text)
  }
  return root
}

describe('gameInfoNarrowingCeiling collectFiles', () => {
  it('skips storeManagers, tests and exempt paths', () => {
    const exempt = STORE_SPECIFIC_EXEMPT[0].path as string
    const root = seed({
      'src/frontend/a.ts': 'x',
      'src/frontend/b.test.ts': 'x',
      'src/frontend/__tests__/c.ts': 'x',
      'src/backend/storeManagers/steam/d.ts': 'x',
      'src/backend/e.ts': 'x',
      [`${exempt}/f.tsx`]: 'x',
      'src/other/g.ts': 'x'
    })
    try {
      expect(collectFiles(root).sort()).toEqual([
        'src/backend/e.ts',
        'src/frontend/a.ts'
      ])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})

describe('gameInfoNarrowingCeiling args and exemptions', () => {
  it('errors on a flag without a value', () => {
    expect(parseArgs(['--baseline'])).toEqual({
      error: '--baseline needs a value'
    })
  })
  it('errors on an invalid --min-files', () => {
    expect(parseArgs(['--min-files', '0'])).toHaveProperty('error')
  })
  it('reports a listed exemption missing from a root', () => {
    const root = seed({})
    try {
      expect(staleExemptions(root)).toHaveLength(STORE_SPECIFIC_EXEMPT.length)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
  it('finds every listed exemption in the real repo', () => {
    expect(staleExemptions(REPO_ROOT)).toEqual([])
  })
})

describe('gameInfoNarrowingCeiling CLI', () => {
  function run(args: string[]) {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-narrow-' })
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

  it('exits 0 when the baseline matches', () => {
    const root = seed({ 'src/frontend/a.ts': 'isStoreGame(g, "gog")\n' })
    const baseline = join(root, 'baseline.json')
    writeFileSync(
      baseline,
      JSON.stringify({
        files: { 'src/frontend/a.ts': 1 },
        reasons: { 'src/frontend/a.ts': 'why' }
      })
    )
    try {
      const r = run([
        '--root',
        root,
        '--baseline',
        baseline,
        '--min-files',
        '1'
      ])
      expect(r.status).toBe(0)
      expect(r.stdout).toMatch(/PASS/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exits 1 and names a grown file', () => {
    const root = seed({
      'src/frontend/a.ts': 'isStoreGame(g, "gog")\nasStoreGame(g, "gog")\n'
    })
    const baseline = join(root, 'baseline.json')
    writeFileSync(
      baseline,
      JSON.stringify({
        files: { 'src/frontend/a.ts': 1 },
        reasons: { 'src/frontend/a.ts': 'why' }
      })
    )
    try {
      const r = run([
        '--root',
        root,
        '--baseline',
        baseline,
        '--min-files',
        '1'
      ])
      expect(r.status).toBe(1)
      expect(r.stderr).toMatch(/src\/frontend\/a\.ts/)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('exits 1 naming the baseline when it is missing', () => {
    const r = run([])
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/gameInfoNarrowingBaseline\.json/)
  })
})
