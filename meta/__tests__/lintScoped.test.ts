/**
 * Phase 82 Plan 02 (D-05): `meta/lintScoped.cjs`'s `minFiles` floor must fail on an empty scope.
 * A scope whose glob silently collapsed lints zero files and reports zero warnings, which a
 * zero-headroom warning ceiling reads as clean; the floor is the only thing that tells the two
 * apart. Tested through the exported pure function, so nothing is linted and nothing is spawned.
 */
// The cjs is a node script; there is no ESM form to import.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const lintScoped = require('../lintScoped.cjs') as {
  SCOPES: Record<string, { label: string; minFiles: number }>
  scopeFloorFailure: (
    scope: { label: string; minFiles: number },
    fileCount: number
  ) => string | null
}

describe('lintScoped minFiles floor (D-05)', () => {
  const names = Object.keys(lintScoped.SCOPES)

  it('exposes both scopes, each with a positive floor', () => {
    expect(names.sort()).toEqual(['src', 'tests'])
    for (const name of names) {
      const scope = lintScoped.SCOPES[name]
      expect(scope?.minFiles).toBeGreaterThan(0)
    }
  })

  it.each(['src', 'tests'])(
    'an empty result set fails the floor for the %s scope',
    (name) => {
      const scope = lintScoped.SCOPES[name]
      if (scope === undefined) throw new Error(`no scope ${name}`)
      const failure = lintScoped.scopeFloorFailure(scope, 0)
      expect(failure).toContain(`Scope "${scope.label}" linted 0 file(s)`)
      expect(failure).toContain('minFiles floor')
    }
  )

  it.each(['src', 'tests'])(
    'a single-file result set fails the floor for the %s scope',
    (name) => {
      const scope = lintScoped.SCOPES[name]
      if (scope === undefined) throw new Error(`no scope ${name}`)
      expect(lintScoped.scopeFloorFailure(scope, 1)).not.toBeNull()
    }
  )

  it.each(['src', 'tests'])(
    'the %s scope passes at the floor and fails one below it',
    (name) => {
      const scope = lintScoped.SCOPES[name]
      if (scope === undefined) throw new Error(`no scope ${name}`)
      expect(lintScoped.scopeFloorFailure(scope, scope.minFiles)).toBeNull()
      expect(
        lintScoped.scopeFloorFailure(scope, scope.minFiles - 1)
      ).not.toBeNull()
    }
  )
})
