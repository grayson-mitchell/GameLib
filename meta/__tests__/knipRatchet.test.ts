/**
 * Quick 261107-brs. Pure `identitiesFromReport`/`parseBaseline`/`evaluate`
 * cases plus the CLI end-to-end against synthetic knip JSON (a pure-only suite
 * can pass while the shipped command is broken).
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { createFakeHomeProfile } from '../../src/backend/testUtils/fakeHomeProfile'

/* eslint-disable @typescript-eslint/no-require-imports */
const {
  evaluate,
  identitiesFromReport,
  parseBaseline
} = require('../knipRatchet.cjs')
/* eslint-enable @typescript-eslint/no-require-imports */

const REPO_ROOT = join(__dirname, '..', '..')
const SCRIPT = join(REPO_ROOT, 'meta', 'knipRatchet.cjs')

const issue = (file: string, extra: Record<string, unknown>) => ({
  file,
  files: [],
  exports: [],
  types: [],
  dependencies: [],
  devDependencies: [],
  unlisted: [],
  binaries: [],
  unresolved: [],
  duplicates: [],
  enumMembers: [],
  classMembers: [],
  ...extra
})

const REPORT = {
  issues: [
    issue('src/a.ts', {
      files: [{ name: 'src/a.ts' }],
      exports: [{ name: 'foo', line: 3, col: 1, pos: 10 }],
      types: [{ name: 'Bar', line: 4, col: 1, pos: 20 }]
    }),
    issue('package.json', {
      dependencies: [{ name: 'left-pad', line: 5, col: 6, pos: 1 }],
      devDependencies: [{ name: 'xvfb-maybe', line: 9, col: 6, pos: 2 }]
    }),
    issue('src/b.ts', {
      duplicates: [
        [
          { name: 'zeta', line: 1, col: 1, pos: 1 },
          { name: 'alpha', line: 2, col: 1, pos: 2 }
        ]
      ],
      enumMembers: [
        { name: 'Red', namespace: 'Color', line: 1, col: 1, pos: 1 }
      ],
      classMembers: [{ name: 'run', namespace: 'Job', line: 1, col: 1, pos: 1 }]
    })
  ]
}

describe('identitiesFromReport', () => {
  test('maps every finding to a line-number-free identity', () => {
    expect(identitiesFromReport(REPORT)).toEqual([
      'classMembers\tsrc/b.ts\tJob.run',
      'dependencies\tpackage.json\tleft-pad',
      'devDependencies\tpackage.json\txvfb-maybe',
      'duplicates\tsrc/b.ts\talpha,zeta',
      'enumMembers\tsrc/b.ts\tColor.Red',
      'exports\tsrc/a.ts\tfoo',
      'files\tsrc/a.ts\t-',
      'types\tsrc/a.ts\tBar'
    ])
  })

  test('normalises backslash paths and absolute paths under the repo root', () => {
    const abs = join(REPO_ROOT, 'src', 'c.ts')
    const ids = identitiesFromReport({
      issues: [
        issue('src\\win\\d.ts', { exports: [{ name: 'x' }] }),
        issue(abs, { exports: [{ name: 'y' }] })
      ]
    })
    expect(ids).toEqual(['exports\tsrc/c.ts\ty', 'exports\tsrc/win/d.ts\tx'])
  })

  test('throws when the report has no issues array', () => {
    expect(() => identitiesFromReport({})).toThrow(/issues/)
  })
})

describe('parseBaseline', () => {
  test('ignores blank lines and # comments', () => {
    expect(parseBaseline('# header\n\nexports\ta.ts\tfoo\n')).toEqual([
      'exports\ta.ts\tfoo'
    ])
  })
  test('rejects duplicate identities', () => {
    expect(() =>
      parseBaseline('exports\ta.ts\tfoo\nexports\ta.ts\tfoo\n')
    ).toThrow(/duplicate/i)
  })
})

describe('evaluate', () => {
  test('passes on an exact match', () => {
    expect(evaluate(['a', 'b'], ['b', 'a'])).toEqual([])
  })
  test('fails on a new finding', () => {
    const f = evaluate(['a'], ['a', 'b'])
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/new knip finding/)
    expect(f[0]).toContain('b')
  })
  test('fails on a vanished finding', () => {
    const f = evaluate(['a', 'b'], ['a'])
    expect(f).toHaveLength(1)
    expect(f[0]).toMatch(/remove this line from meta\/knip-baseline\.txt/)
    expect(f[0]).toContain('b')
  })
})

describe('knipRatchet CLI', () => {
  let dir: string
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gamelib-knip-'))
  })
  afterEach(() => rmSync(dir, { recursive: true, force: true }))

  const baselineOf = (ids: string[]) => {
    const p = join(dir, 'baseline.txt')
    writeFileSync(p, ['# test', ...ids, ''].join('\n'))
    return p
  }
  const run = (baseline: string, input: string) => {
    const profile = createFakeHomeProfile({ prefix: 'gamelib-ratchet-' })
    try {
      return spawnSync(process.execPath, [SCRIPT, '--baseline', baseline], {
        cwd: REPO_ROOT,
        env: profile.childEnv(process.env),
        input,
        encoding: 'utf8'
      })
    } finally {
      profile.dispose()
    }
  }
  const ids = identitiesFromReport(REPORT) as string[]
  const json = JSON.stringify(REPORT)

  test('exits 0 on a matching report and prints counts per type', () => {
    const r = run(baselineOf(ids), json)
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/PASS/)
    expect(r.stdout).toMatch(/exports: 1/)
  })
  test('exits 1 on an extra finding', () => {
    const r = run(baselineOf(ids.slice(1)), json)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/new knip finding/)
  })
  test('exits 1 on a missing finding', () => {
    const r = run(baselineOf([...ids, 'exports\tsrc/gone.ts\tgone']), json)
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/remove this line/)
  })
  test('exits 1 on empty stdin', () => {
    const r = run(baselineOf(ids), '')
    expect(r.status).toBe(1)
    expect(r.stderr).toMatch(/empty/i)
  })
  test('exits 1 on unparseable JSON', () => {
    expect(run(baselineOf(ids), 'not json').status).toBe(1)
  })
  test('exits 1 on a report with no issues array', () => {
    expect(run(baselineOf([]), '{}').status).toBe(1)
  })
})
