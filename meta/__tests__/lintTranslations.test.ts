import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  cpSync,
  unlinkSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  lintTranslations,
  readCatalog,
  checkLanguage,
  CorruptCatalogError
} from '../lintTranslations'

/**
 * Builds an isolated scratch locales tree (`mkdtempSync`), always torn down
 * in a `finally`. This project has a recorded failure where a test suite
 * clobbered a real store -- REQ-41-02's own T-41-03-01 mitigation is that
 * every fixture here lives under `os.tmpdir()`, never under
 * `public/locales/`.
 */
function withFixtureLocales(run: (localesPath: string) => void): void {
  const localesPath = mkdtempSync(join(tmpdir(), 'lint-translations-'))
  try {
    run(localesPath)
  } finally {
    rmSync(localesPath, { recursive: true, force: true })
  }
}

function writeCatalog(
  localesPath: string,
  language: string,
  namespace: string,
  content: unknown
): void {
  mkdirSync(join(localesPath, language), { recursive: true })
  writeFileSync(
    join(localesPath, language, `${namespace}.json`),
    JSON.stringify(content)
  )
}

/** Ensures a locale directory exists without necessarily populating it. */
function ensureLocaleDir(localesPath: string, language: string): void {
  mkdirSync(join(localesPath, language), { recursive: true })
}

describe('lintTranslations (REQ-41-02)', () => {
  // R1 -- RED proof: an absent fork-owned catalog is a hard, named failure.
  it('REQ-41-02: an absent fork-owned (gamelib) catalog is a named hard failure', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'gamelib', { greeting: 'hi' })
      // `xx` exists as a locale directory but has no gamelib.json -- the
      // fork-owned catalog is entirely absent for this locale.
      ensureLocaleDir(localesPath, 'xx')

      const result = lintTranslations({ localesPath, namespaces: ['gamelib'] })

      expect(result.hardFailures).toHaveLength(1)
      expect(result.hardFailures[0]).toEqual(
        expect.stringContaining('xx')
      )
      expect(result.hardFailures[0]).toEqual(
        expect.stringContaining('gamelib')
      )
      expect(result.findings).toHaveLength(0)

      // Evidence this is a genuine RED proof, not an assumption: Task 1
      // (this same plan) already replaced the pre-refactor
      // `if (!content) continue` shape wholesale, so the old code can no
      // longer be executed side-by-side in this suite to demonstrate the
      // negative directly. Reasoning from the source instead: the old
      // `checkLanguage()` read `langFiles[file]` (here, `null` for the
      // absent gamelib.json), hit `if (!content) continue` unconditionally,
      // and moved on -- there was structurally no branch in the old code
      // that could ever push a finding *or* a hard failure for an absent
      // catalog. Where the assertions above observe exactly one named
      // hardFailure, the old structure would have observed zero of
      // anything for this identical fixture -- the blindness REQ-41-02
      // exists to close.
    })
  })

  // R2 -- an absent UPSTREAM catalog is a report, not a failure.
  it('REQ-41-02: an absent upstream (translation) catalog is one clean finding, not a hard failure', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'translation', { hello: 'hi' })
      ensureLocaleDir(localesPath, 'xx')

      const result = lintTranslations({
        localesPath,
        namespaces: ['translation']
      })

      expect(result.findings).toHaveLength(1)
      expect(result.hardFailures).toHaveLength(0)

      const text = result.findings.join('\n')
      expect(text).not.toEqual(expect.stringContaining('ENOENT'))
      expect(text).not.toEqual(expect.stringContaining('    at '))
    })
  })

  // R3 -- an out-of-scope namespace is never opened, so its absence is
  // invisible to the run entirely.
  it('REQ-41-02: an out-of-scope namespace (login) is never read, even when absent', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'gamelib', { greeting: 'hi' })
      writeCatalog(localesPath, 'xx', 'gamelib', { greeting: 'hi' })
      // `xx/login.json` is absent, but scope below is ['gamelib'] only.
      ensureLocaleDir(localesPath, 'xx')

      const result = lintTranslations({ localesPath, namespaces: ['gamelib'] })

      expect(result.findings).toHaveLength(0)
      expect(result.hardFailures).toHaveLength(0)

      const text = [...result.findings, ...result.hardFailures].join('\n')
      expect(text).not.toEqual(expect.stringContaining('login'))
    })
  })

  // R4 -- a catalog that EXISTS but fails to parse is a hard failure
  // regardless of namespace ownership.
  it('REQ-41-02: a corrupt (unparseable) catalog is a hard failure with no Error object dump', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'gamelib', { greeting: 'hi' })
      mkdirSync(join(localesPath, 'xx'), { recursive: true })
      writeFileSync(join(localesPath, 'xx', 'gamelib.json'), '{')

      const result = lintTranslations({ localesPath, namespaces: ['gamelib'] })

      expect(result.hardFailures).toHaveLength(1)
      expect(result.hardFailures[0]).toEqual(expect.stringContaining('xx'))
      // No raw Error object dump: readCatalog() reports the caught parse
      // message text, never the Error object itself (T-41-03-04).
      expect(result.hardFailures[0]).not.toEqual(
        expect.stringContaining('Error:')
      )
      expect(result.hardFailures[0]).not.toEqual(
        expect.stringContaining('    at ')
      )
    })
  })

  // Direct unit coverage of readCatalog()'s two distinct failure shapes,
  // underneath the lintTranslations()-level assertions above.
  it('REQ-41-02: readCatalog() returns null for an absent file and throws CorruptCatalogError for invalid JSON', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'xx', 'gamelib', { greeting: 'hi' })
      expect(readCatalog(localesPath, 'xx', 'translation')).toBeNull()

      mkdirSync(join(localesPath, 'yy'), { recursive: true })
      writeFileSync(join(localesPath, 'yy', 'gamelib.json'), 'not json')
      expect(() => readCatalog(localesPath, 'yy', 'gamelib')).toThrow(
        CorruptCatalogError
      )
    })
  })

  // R5 -- import purity: the module must be safe to import under jest.
  // Re-require it fresh (jest.resetModules) with a process.exit spy already
  // installed BEFORE the require call, so the spy genuinely observes the
  // import event itself rather than a stale one from file-load time. The
  // "no filesystem walk of public/locales" half of this behaviour is
  // structural, not separately spied: the top-level readdirSync() walk and
  // main() both live behind the same `!process.env.JEST_WORKER_ID` guard
  // Task 1 introduced, so proving process.exit was never called is proof
  // that main() -- and therefore the walk it triggers -- never ran either.
  it('REQ-41-02: importing the module performs no side effects (no process.exit on import)', async () => {
    const exitSpy = jest
      .spyOn(process, 'exit')
      .mockImplementation(((code?: number) => {
        throw new Error(`process.exit(${String(code)}) called during import`)
      }) as unknown as (code?: number) => never)

    jest.resetModules()
    await expect(import('../lintTranslations')).resolves.toBeDefined()
    expect(exitSpy).not.toHaveBeenCalled()

    exitSpy.mockRestore()
  })

  describe('live tree', () => {
    // R6 -- the CI-facing gate: zero hard failures against the real,
    // committed public/locales/ tree, scoped to the fork-owned namespace.
    // This is what makes a future absent gamelib.json fail `pnpm test:ci`.
    it('REQ-41-02: zero hard failures for the gamelib namespace against the committed tree', () => {
      const result = lintTranslations({
        localesPath: 'public/locales',
        namespaces: ['gamelib']
      })

      expect(result.hardFailures).toHaveLength(0)
    })

    // R7 -- non-vacuity of R6: prove the zero above is a measurement, not
    // a constant, by reproducing a real absence in a scratch COPY of two
    // real locales -- never touching public/locales/ itself.
    it('REQ-41-02: R6 non-vacuity -- a genuinely absent gamelib.json in a real-data copy is measured, not assumed', () => {
      withFixtureLocales((localesPath) => {
        mkdirSync(join(localesPath, 'en'), { recursive: true })
        mkdirSync(join(localesPath, 'de'), { recursive: true })
        cpSync(
          join('public/locales', 'en', 'gamelib.json'),
          join(localesPath, 'en', 'gamelib.json')
        )
        cpSync(
          join('public/locales', 'de', 'gamelib.json'),
          join(localesPath, 'de', 'gamelib.json')
        )

        // Sanity: with both copies intact, this scratch tree measures zero
        // hard failures too -- the copy itself introduces nothing.
        const before = lintTranslations({
          localesPath,
          namespaces: ['gamelib']
        })
        expect(before.hardFailures).toHaveLength(0)

        // Now delete the COPY (never the real file) to simulate a genuinely
        // absent fork-owned catalog.
        unlinkSync(join(localesPath, 'de', 'gamelib.json'))

        const after = lintTranslations({ localesPath, namespaces: ['gamelib'] })
        expect(after.hardFailures.length).toBeGreaterThan(0)
        expect(after.hardFailures[0]).toEqual(expect.stringContaining('de'))
      })
    })
  })
})

describe('checkLanguage (REQ-41-02)', () => {
  it('REQ-41-02: is directly callable with pre-read English catalogs, independent of lintTranslations()', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'gamelib', { greeting: 'hi' })
      writeCatalog(localesPath, 'xx', 'gamelib', { greeting: 'hi' })

      const result = checkLanguage(
        'xx',
        { gamelib: { greeting: 'hi' } },
        { localesPath, namespaces: ['gamelib'] }
      )

      expect(result.hardFailures).toHaveLength(0)
      expect(result.findings).toHaveLength(0)
    })
  })
})
