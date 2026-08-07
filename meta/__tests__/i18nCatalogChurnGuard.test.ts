import { execFileSync } from 'node:child_process'

import {
  classifyChangedPaths,
  assertNoUpstreamChurn,
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

describe('live tree', () => {
  // This is a working-tree assertion, not a fixture-based one: it passes
  // trivially on a clean tree (no changed paths under public/locales/ at
  // all) and only bites when someone runs `pnpm i18n`, staged or unstaged,
  // and leaves an upstream-catalog change behind -- which is exactly the
  // moment D-05 needs it to bite. Running under `pnpm test:ci` turns the
  // "we never touch upstream catalogs" promise into something CI proves
  // after every parser run, rather than something the phase merely
  // asserts.
  it('classifies the real current git diff with an empty upstream bucket', () => {
    const diffOutput = execFileSync(
      'git',
      ['diff', '--name-only', '--', 'public/locales'],
      { encoding: 'utf-8' }
    )
    const changedPaths = diffOutput
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    const { upstream } = classifyChangedPaths(changedPaths)
    expect(upstream).toEqual([])
  })
})
