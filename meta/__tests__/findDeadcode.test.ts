/**
 * Quick task 260922-9um. Covers BOTH halves of `meta/findDeadcode.cjs`: the
 * pure parser/identity/diff helpers, AND the CLI end-to-end, which spawns
 * the real gate against the real repo and asserts exit 0.
 *
 * The CLI half is not optional. This repo has a recorded lesson about a
 * suite that tested only the pure half of a tool while the CLI half could
 * not run at all -- every assertion passed and the shipped command was
 * broken. The whole point of this task is that `pnpm find-deadcode` exits 0,
 * which no pure-half assertion can establish.
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// `require('../findDeadcode.cjs')` below is only safe because findDeadcode.cjs
// wraps its own `main()` call in `if (require.main === module)`; if that guard
// is ever removed, this require() starts a real ts-prune run inside jest (and
// then calls process.exit) and this whole suite fails loudly, not silently --
// which is the point. Same precedent and same reasoning as
// meta/__tests__/runTs.test.ts's require of runTs.cjs.
// ---------------------------------------------------------------------------
// eslint-disable-next-line @typescript-eslint/no-require-imports
const findDeadcode = require('../findDeadcode.cjs')

const REPO_ROOT = join(__dirname, '..', '..')

describe('meta/findDeadcode.cjs parseFinding', () => {
  test('parses a "(used in module)" line', () => {
    const finding = findDeadcode.parseFinding(
      'src/frontend/types.ts:24 - Category (used in module)'
    )
    expect(finding).toEqual({
      path: 'src/frontend/types.ts',
      line: 24,
      name: 'Category',
      usedInModule: true
    })
  })

  test('parses a plain line', () => {
    const finding = findDeadcode.parseFinding(
      'src/backend/images_cache.ts:10 - initImagesCache'
    )
    expect(finding).toEqual({
      path: 'src/backend/images_cache.ts',
      line: 10,
      name: 'initImagesCache',
      usedInModule: false
    })
  })

  test('parses a "satisfies" parse artifact without special-casing it', () => {
    // A real measured finding at this tree: ts-prune mis-reads `satisfies`
    // expressions and reports the keyword as an exported symbol. The gate
    // does NOT special-case it -- it is an ordinary identity that lives in
    // the baseline with a `#` annotation explaining the tool is wrong.
    const finding = findDeadcode.parseFinding(
      'meta/releaseTags.ts:35 - satisfies'
    )
    expect(finding.name).toBe('satisfies')
    expect(finding.usedInModule).toBe(false)
  })

  test('throws on an unparseable line rather than dropping it', () => {
    // The fail-open guard. ts-prune's output format is an unversioned
    // contract on a deep-imported private module path; silently skipping
    // lines it could not read would shrink the measured population.
    expect(() => findDeadcode.parseFinding('total findings: 256')).toThrow(
      /could not parse ts-prune output line/
    )
  })
})

describe('meta/findDeadcode.cjs identityOf', () => {
  test('drops the line number', () => {
    const a = findDeadcode.identityOf({
      path: 'src/frontend/types.ts',
      line: 24,
      name: 'Category'
    })
    const b = findDeadcode.identityOf({
      path: 'src/frontend/types.ts',
      line: 991,
      name: 'Category'
    })
    expect(a).toBe('src/frontend/types.ts - Category')
    expect(b).toBe(a)
  })
})

describe('meta/findDeadcode.cjs partitionFindings', () => {
  test('splits a mixed list into two populations with nothing lost', () => {
    const findings = [
      { name: 'a', usedInModule: true },
      { name: 'b', usedInModule: false },
      { name: 'c', usedInModule: true },
      { name: 'd', usedInModule: false },
      { name: 'e', usedInModule: true }
    ]
    const { unreachable, usedInModule } =
      findDeadcode.partitionFindings(findings)

    expect(unreachable.map((f: { name: string }) => f.name)).toEqual(['b', 'd'])
    expect(usedInModule.map((f: { name: string }) => f.name)).toEqual([
      'a',
      'c',
      'e'
    ])
    expect(unreachable.length + usedInModule.length).toBe(findings.length)
  })
})

describe('meta/findDeadcode.cjs parseBaseline', () => {
  test('strips blank lines and "#" comments, trims, and dedupes', () => {
    const set = findDeadcode.parseBaseline(
      [
        '# header block explaining the population',
        '',
        'a.ts - one',
        '   b.ts - two   ',
        '# annotation for a false-positive cluster',
        'a.ts - one',
        ''
      ].join('\n')
    )

    expect(set instanceof Set).toBe(true)
    expect([...set].sort()).toEqual(['a.ts - one', 'b.ts - two'])
  })
})

describe('meta/findDeadcode.cjs diffAgainstBaseline', () => {
  test('a new finding is reported in added', () => {
    const diff = findDeadcode.diffAgainstBaseline(
      new Set(['a.ts - one']),
      new Set(['a.ts - one', 'b.ts - two'])
    )
    expect(diff.added).toEqual(['b.ts - two'])
    expect(diff.removed).toEqual([])
  })

  test('a stale baseline entry is reported in removed', () => {
    const diff = findDeadcode.diffAgainstBaseline(
      new Set(['a.ts - one', 'b.ts - two']),
      new Set(['a.ts - one'])
    )
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual(['b.ts - two'])
  })

  test('an exact match reports nothing in either direction', () => {
    const diff = findDeadcode.diffAgainstBaseline(
      new Set(['a.ts - one', 'b.ts - two']),
      new Set(['b.ts - two', 'a.ts - one'])
    )
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })

  test('duplicate identities are deduped, not reported as a diff', () => {
    // Both sides are compared as SETS so the gate never has to reason about
    // multiplicity. A baseline that listed an identity twice must not read
    // as "one entry removed".
    const baseline = findDeadcode.parseBaseline(
      ['a.ts - one', 'a.ts - one', 'b.ts - two'].join('\n')
    )
    const found = new Set(['a.ts - one', 'b.ts - two', 'b.ts - two'])
    const diff = findDeadcode.diffAgainstBaseline(baseline, found)
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })
})

describe('meta/findDeadcode.cjs readIgnorePattern', () => {
  test('reads the pattern from the committed .ts-prunerc', () => {
    expect(findDeadcode.readIgnorePattern(join(REPO_ROOT, '.ts-prunerc'))).toBe(
      'src/common/typedefs'
    )
  })

  test('throws rather than defaulting when the rc file is absent', () => {
    // A silent hardcoded fallback would let the gate analyse a different
    // population than the committed baselines were measured from.
    expect(() =>
      findDeadcode.readIgnorePattern(join(REPO_ROOT, '.ts-prunerc-absent'))
    ).toThrow(/does not exist/)
  })
})

describe('meta/findDeadcode.cjs CLI', () => {
  // The end-to-end assertion, and the only one that can establish this
  // task's headline claim: the gate PASSES at HEAD. It runs the real
  // ts-prune over the real project (~5s measured), hence the timeout.
  //
  // This test is expected RED until the two baselines are generated, which
  // happens deliberately last so the population is measured from the FINAL
  // tree -- adding a test file can itself change ts-prune's findings.
  test('exits 0 against the real repo', () => {
    const result = spawnSync(
      process.execPath,
      [join('meta', 'findDeadcode.cjs')],
      { cwd: REPO_ROOT, encoding: 'utf-8' }
    )

    expect(result.error).toBeUndefined()
    // stdout/stderr are included in the failure message so a red run says
    // WHICH identity moved, rather than just "expected 0, got 1".
    expect(`${result.status}\n${result.stdout}${result.stderr}`).toMatch(/^0\n/)
  }, 60000)
})
