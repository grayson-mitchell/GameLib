import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  classifyChangedPaths,
  assertNoUpstreamChurn,
  listChangedLocalePaths,
  parsePorcelainZ,
  UpstreamChurnError
} from '../i18nCatalogChurnGuard'

describe('classifyChangedPaths', () => {
  const fixturePaths = [
    'public/locales/en/gamelib.json',
    'public/locales/de/gamelib.mt.json',
    'public/locales/en/translation.json',
    'public/locales/fr/login.json',
    'src/frontend/index.tsx', // outside public/locales/ -- ignored entirely
    'public/locales/README.md'
  ]

  it('buckets gamelib.json and gamelib.mt.json leaves as gamelib', () => {
    const { gamelib } = classifyChangedPaths(fixturePaths)
    expect(gamelib).toEqual([
      'public/locales/en/gamelib.json',
      'public/locales/de/gamelib.mt.json'
    ])
  })

  it('buckets every other public/locales/ path as upstream', () => {
    const { upstream } = classifyChangedPaths(fixturePaths)
    expect(upstream).toEqual([
      'public/locales/en/translation.json',
      'public/locales/fr/login.json',
      'public/locales/README.md'
    ])
  })

  it('ignores paths entirely outside public/locales/', () => {
    const { gamelib, upstream } = classifyChangedPaths(fixturePaths)
    const allClassified = [...gamelib, ...upstream]
    expect(allClassified).not.toContain('src/frontend/index.tsx')
  })

  it('returns empty buckets for an empty path list', () => {
    expect(classifyChangedPaths([])).toEqual({ gamelib: [], upstream: [] })
  })
})

describe('upstream churn guard', () => {
  it('throws UpstreamChurnError when any upstream path changed', () => {
    expect(() =>
      assertNoUpstreamChurn(['public/locales/en/translation.json'])
    ).toThrow(UpstreamChurnError)
  })

  it('names every offending path in the thrown message', () => {
    const upstreamPaths = [
      'public/locales/en/translation.json',
      'public/locales/fr/login.json'
    ]
    expect.assertions(3)
    try {
      assertNoUpstreamChurn(upstreamPaths)
    } catch (error) {
      expect(error).toBeInstanceOf(UpstreamChurnError)
      for (const path of upstreamPaths) {
        expect((error as Error).message).toContain(path)
      }
    }
  })

  it('does not throw on a gamelib-only change list', () => {
    expect(() =>
      assertNoUpstreamChurn([
        'public/locales/en/gamelib.json',
        'public/locales/de/gamelib.mt.json'
      ])
    ).not.toThrow()
  })

  it('does not throw on an empty change list', () => {
    expect(() => assertNoUpstreamChurn([])).not.toThrow()
  })
})

describe('parsePorcelainZ', () => {
  it('returns modified, staged, deleted and untracked paths', () => {
    expect(
      parsePorcelainZ(
        ' M public/locales/en/a.json\0M  public/locales/en/b.json\0' +
          'D  public/locales/en/c.json\0?? public/locales/en/d.json\0'
      )
    ).toEqual([
      'public/locales/en/a.json',
      'public/locales/en/b.json',
      'public/locales/en/c.json',
      'public/locales/en/d.json'
    ])
  })

  it('returns BOTH sides of a rename, never mistaking the origin for a status record', () => {
    expect(
      parsePorcelainZ(
        'R  public/locales/en/new.json\0public/locales/en/translation.json\0' +
          ' M public/locales/en/gamelib.json\0'
      )
    ).toEqual([
      'public/locales/en/new.json',
      'public/locales/en/translation.json',
      'public/locales/en/gamelib.json'
    ])
  })

  it('returns nothing for empty output', () => {
    expect(parsePorcelainZ('')).toEqual([])
  })
})

describe('listChangedLocalePaths', () => {
  // A disposable repo, not the real tree: the cases below need a STAGED
  // change and an UNTRACKED file, and neither may be manufactured in the
  // checkout the suite is running from. No `env` is passed to git -- the
  // identity rides on `-c` flags (see the fake-HOME rule in CLAUDE.md).
  let repo: string

  function git(...args: string[]): void {
    execFileSync(
      'git',
      [
        '-c',
        'user.name=churn-guard-test',
        '-c',
        'user.email=churn-guard-test@example.invalid',
        '-c',
        'commit.gpgsign=false',
        ...args
      ],
      { cwd: repo, stdio: 'ignore' }
    )
  }

  function write(path: string, body = '{}\n'): void {
    const full = join(repo, path)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, body)
  }

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'churn-guard-'))
    git('init', '-q')
    write('public/locales/en/translation.json')
    write('public/locales/en/gamelib.json')
    write('src/index.ts', 'export {}\n')
    git('add', '-A')
    git('commit', '-q', '-m', 'seed')
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('is empty on a clean tree', () => {
    expect(listChangedLocalePaths(repo)).toEqual([])
  })

  it('sees an unstaged catalogue change', () => {
    write('public/locales/en/translation.json', '{"a": "b"}\n')
    expect(listChangedLocalePaths(repo)).toEqual([
      'public/locales/en/translation.json'
    ])
  })

  it('sees a STAGED upstream-catalogue change (the old comment claimed this; plain `git diff` did not)', () => {
    write('public/locales/en/translation.json', '{"a": "b"}\n')
    git('add', 'public/locales/en/translation.json')
    expect(listChangedLocalePaths(repo)).toEqual([
      'public/locales/en/translation.json'
    ])
  })

  it("sees an UNTRACKED catalogue the parser created -- the typo'd-namespace case", () => {
    // `t('gamelb:x')` makes the parser write a brand-new file.
    write('public/locales/en/gamelb.json')
    expect(listChangedLocalePaths(repo)).toEqual([
      'public/locales/en/gamelb.json'
    ])
    expect(() => assertNoUpstreamChurn(listChangedLocalePaths(repo))).toThrow(
      UpstreamChurnError
    )
  })

  it('lists each file of a wholly new locale directory, not the collapsed directory', () => {
    write('public/locales/xx/translation.json')
    write('public/locales/xx/gamelib.json')
    expect(listChangedLocalePaths(repo).sort()).toEqual([
      'public/locales/xx/gamelib.json',
      'public/locales/xx/translation.json'
    ])
  })

  it('ignores changes outside public/locales/', () => {
    write('src/index.ts', 'export const x = 1\n')
    write('src/new.ts', 'export {}\n')
    expect(listChangedLocalePaths(repo)).toEqual([])
  })
})

describe('live tree', () => {
  // This is a working-tree assertion, not a fixture-based one: it passes
  // trivially on a clean tree (no changed paths under public/locales/ at
  // all) and only bites when a parser run leaves an upstream-catalog change
  // behind -- staged, unstaged or untracked -- which is exactly the moment
  // D-05 needs it to bite. It can only bite in CI because
  // `.github/workflows/test.yml` runs `pnpm i18n` BEFORE `pnpm test:ci`; on
  // a fresh checkout with no parser run the tree is clean by construction
  // and this passes vacuously.
  it('classifies the real current working-tree changes with an empty upstream bucket', () => {
    const { upstream } = classifyChangedPaths(listChangedLocalePaths())
    expect(upstream).toEqual([])
  })
})
