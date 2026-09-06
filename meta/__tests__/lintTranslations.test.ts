import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
  cpSync,
  unlinkSync,
  readFileSync,
  statSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  lintTranslations,
  readCatalog,
  checkLanguage,
  checkEnglishKeysPresent,
  comparePresenceBaseline,
  missingPairs,
  PRESENCE_BASELINE_PATH,
  CorruptCatalogError,
  type LintResult
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
      expect(result.hardFailures[0]).toEqual(expect.stringContaining('xx'))
      expect(result.hardFailures[0]).toEqual(expect.stringContaining('gamelib'))

      // Gap-closure plan 41-06 (GAP-2, REQ-41-01): this fixture's localesPath
      // is a non-canonical mkdtempSync tree, so it now ALSO receives one
      // presence-baseline-drift-skip finding (R20a proves this diagnostic
      // directly). That is a strengthening, not a regression: partition the
      // findings and assert the skip diagnostic is present, then assert R1's
      // original claim -- zero findings OTHER than the skip diagnostic --
      // over the remainder. Suppressing the diagnostic to keep this test
      // quiet would recreate the exact fail-open this plan closes.
      const skips = result.findings.filter((f) =>
        f.includes('presence baseline drift check skipped')
      )
      expect(skips).toHaveLength(1)
      expect(result.findings.filter((f) => !skips.includes(f))).toHaveLength(0)

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

      // Gap-closure plan 41-06 (GAP-2, REQ-41-01): this fixture's localesPath
      // is a non-canonical mkdtempSync tree, so it now ALSO receives one
      // presence-baseline-drift-skip finding (R20a proves this diagnostic
      // directly). Strengthened, not weakened: partition the findings,
      // assert the skip diagnostic is present, and keep the ORIGINAL
      // out-of-scope-namespace claim ("login" never appears anywhere)
      // applied to the non-skip findings, so it stays a statement about
      // catalog reads rather than being satisfied by the skip message's own
      // vocabulary.
      const skips = result.findings.filter((f) =>
        f.includes('presence baseline drift check skipped')
      )
      expect(skips).toHaveLength(1)
      expect(result.findings.filter((f) => !skips.includes(f))).toHaveLength(0)
      expect(result.hardFailures).toHaveLength(0)

      const nonSkipText = [
        ...result.findings.filter((f) => !skips.includes(f)),
        ...result.hardFailures
      ].join('\n')
      expect(nonSkipText).not.toEqual(expect.stringContaining('login'))
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

  // R16 -- gap-closure plan 41-06, GAP-1: a corrupt ENGLISH catalog must be
  // just as much a named hard failure as a corrupt locale catalog (R4 above)
  // -- lintTranslations() must return normally, never let CorruptCatalogError
  // escape uncaught.
  it('REQ-41-02 R16: a corrupt English catalog is a named hard failure, not a crash', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'xx', 'gamelib', { greeting: 'hi' })
      mkdirSync(join(localesPath, 'en'), { recursive: true })
      writeFileSync(join(localesPath, 'en', 'gamelib.json'), '{')

      const result = lintTranslations({ localesPath, namespaces: ['gamelib'] })

      expect(result.hardFailures).toHaveLength(1)
      expect(result.hardFailures[0]).toEqual(expect.stringContaining('en'))
      expect(result.hardFailures[0]).toEqual(expect.stringContaining('gamelib'))
      expect(result.hardFailures[0]).toEqual(
        expect.stringContaining('is not valid JSON')
      )
      expect(result.hardFailures[0]).not.toEqual(
        expect.stringContaining('Error:')
      )
      expect(result.hardFailures[0]).not.toEqual(
        expect.stringContaining('    at ')
      )
    })
  })

  // R17 -- the second, verification-missed crash site: missingPairs() reads
  // `en` unguarded at its own call site (comparePresenceBaseline's drift
  // path). Same fixture as R16, called directly.
  it('REQ-41-02 R17: missingPairs() returns [] instead of throwing when the English catalog is corrupt', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'xx', 'gamelib', { greeting: 'hi' })
      mkdirSync(join(localesPath, 'en'), { recursive: true })
      writeFileSync(join(localesPath, 'en', 'gamelib.json'), '{')

      expect(missingPairs(localesPath, 'gamelib')).toEqual([])
    })
  })

  // R18 -- the corrupt-en fixture, run through lintTranslations() end to
  // end, must skip the drift check FOR THAT REASON (not silently, and not by
  // falling through to comparePresenceBaseline() which would throw via
  // missingPairs()). Exactly one findings entry, naming the namespace and
  // the English-catalog reason.
  it('REQ-41-02 R18: a corrupt English catalog produces a named drift-skip finding, not silence', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'xx', 'gamelib', { greeting: 'hi' })
      mkdirSync(join(localesPath, 'en'), { recursive: true })
      writeFileSync(join(localesPath, 'en', 'gamelib.json'), '{')

      const result = lintTranslations({ localesPath, namespaces: ['gamelib'] })

      expect(result.findings).toHaveLength(1)
      expect(result.findings[0]).toEqual(
        expect.stringContaining('presence baseline drift check skipped')
      )
      expect(result.findings[0]).toEqual(expect.stringContaining('gamelib'))
      expect(result.findings[0]).toEqual(
        expect.stringContaining('English catalog')
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
  // Re-require it fresh (jest.resetModules) with a console.log spy already
  // installed BEFORE the import call, so the spy genuinely observes the
  // import event itself rather than a stale one from file-load time.
  //
  // Gap-closure plan 41-07 (WR-01): this test previously spied only on
  // process.exit, and reasoned that "process.exit was not called" proves
  // main() never ran. That inference is false: main() calls process.exit(1)
  // only when hardFailures.length > 0, and hard failures are zero against
  // the committed tree -- so main() running to completion and main() never
  // running are BOTH observationally silent to a process.exit spy. That
  // made the old assertion incapable of failing; it was measured passing
  // even when the entry-point guard was replaced with a bare, unconditional
  // `main()` call (see 41-07-SUMMARY.md for the verbatim measurement).
  //
  // The rewritten assertion instead observes a side effect main() ALWAYS
  // produces on its normal (non-write-baseline) path: an unconditional
  // `console.log('lint-translations[...]: N findings, M hard failures')`
  // summary line, printed regardless of whether hardFailures is zero. The
  // absence of any console.log call containing 'lint-translations[' is
  // therefore direct evidence main() did not run at import time --
  // LINT_TRANSLATIONS_WRITE_BASELINE is explicitly unset for the duration
  // (saved/restored in a finally, matching R15's pattern) so the import
  // cannot land on main()'s other, summary-line-free exit path and produce
  // a false pass. The process.exit spy is kept as a second, narrower
  // assertion, not as the proof.
  it('REQ-41-02: importing the module performs no side effects (no main() run on import)', async () => {
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {})
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(((
      code?: number
    ) => {
      throw new Error(`process.exit(${String(code)}) called during import`)
    }) as unknown as (code?: number) => never)

    const originalEnv = process.env.LINT_TRANSLATIONS_WRITE_BASELINE
    delete process.env.LINT_TRANSLATIONS_WRITE_BASELINE
    try {
      jest.resetModules()
      await expect(import('../lintTranslations')).resolves.toBeDefined()
    } finally {
      if (originalEnv === undefined) {
        delete process.env.LINT_TRANSLATIONS_WRITE_BASELINE
      } else {
        process.env.LINT_TRANSLATIONS_WRITE_BASELINE = originalEnv
      }
    }

    const summaryLineCalls = logSpy.mock.calls.filter(
      (call) =>
        typeof call[0] === 'string' && call[0].includes('lint-translations[')
    )
    expect(summaryLineCalls).toHaveLength(0)
    expect(exitSpy).not.toHaveBeenCalled()

    logSpy.mockRestore()
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

describe('checkEnglishKeysPresent (REQ-41-01)', () => {
  // R8 -- THE RED PROOF. Same fixture, two directions: the new inverted
  // check reports the missing key by name; the OLD forward direction
  // (checkFileAgainstEnglish, exercised here via an upstream namespace so
  // the inverted check -- gated to FORK_OWNED_NAMESPACES -- never fires and
  // cannot mask the comparison) sees nothing at all, because it enumerates
  // the TRANSLATION's own keys and a wholly-absent key is never visited. A
  // check that has never been observed catching its condition is not known
  // to work -- this is that observation, made explicit in one test.
  it('REQ-41-01 R8: a key wholly absent from a locale is invisible to the forward direction, reported by the inverted one', () => {
    withFixtureLocales((localesPath) => {
      // New direction: gamelib is fork-owned, so checkEnglishKeysPresent
      // runs as part of lintTranslations().
      writeCatalog(localesPath, 'en', 'gamelib', { a: { b: 'Text' } })
      writeCatalog(localesPath, 'xx', 'gamelib', {})

      const newResult = lintTranslations({
        localesPath,
        namespaces: ['gamelib']
      })
      const presenceFindings = newResult.findings.filter((f) =>
        f.includes('a.b')
      )
      expect(presenceFindings).toHaveLength(1)
      expect(presenceFindings[0]).toEqual(expect.stringContaining('xx'))
      expect(presenceFindings[0]).toEqual(expect.stringContaining('a.b'))
      expect(newResult.hardFailures).toHaveLength(0)

      // Old direction: an upstream namespace never triggers
      // checkEnglishKeysPresent (it is gated to FORK_OWNED_NAMESPACES), so
      // this run exercises ONLY checkFileAgainstEnglish -- the same
      // function, same identically-shaped fixture, same missing key.
      writeCatalog(localesPath, 'en', 'translation', { a: { b: 'Text' } })
      writeCatalog(localesPath, 'xx', 'translation', {})

      const oldResult = lintTranslations({
        localesPath,
        namespaces: ['translation']
      })
      expect(oldResult.findings).toHaveLength(0)
      expect(oldResult.hardFailures).toHaveLength(0)
    })
  })

  // R9 -- present but empty is the same defect as absent.
  it('REQ-41-01 R9: a key present but empty in the locale is reported', () => {
    const findings = checkEnglishKeysPresent(
      'xx',
      'gamelib',
      { a: { b: 'Text' } },
      { a: { b: '' } }
    )
    expect(findings).toHaveLength(1)
    expect(findings[0]).toEqual(expect.stringContaining('xx'))
    expect(findings[0]).toEqual(expect.stringContaining('a.b'))
  })

  // R10 -- keyed off `en` being non-empty: an empty-in-English key is
  // silently excluded, no exemption register needed.
  it('REQ-41-01 R10: a key empty in English is NOT reported even when absent from the locale', () => {
    const findings = checkEnglishKeysPresent(
      'xx',
      'gamelib',
      { a: { b: '' } },
      {}
    )
    expect(findings).toHaveLength(0)
  })

  // R11 -- an extra key in the locale, absent from en, is not this check's
  // concern (unchanged printExtraTransations = false behaviour).
  it('REQ-41-01 R11: an extra key in the locale not present in English is not reported', () => {
    const findings = checkEnglishKeysPresent(
      'xx',
      'gamelib',
      { a: { b: 'Text' } },
      { a: { b: 'Text' }, z: { z: 'Extra' } }
    )
    expect(findings).toHaveLength(0)
  })

  // R12 -- nested objects are compared leaf-by-leaf, not object-by-object.
  // Reordering a nested object's own keys changes nothing structurally
  // relevant to a leaf-by-leaf walk -- if this check instead compared
  // objects wholesale it would risk false signals on key order, which
  // flattening avoids entirely.
  it('REQ-41-01 R12: nested objects are compared leaf-by-leaf, independent of key order', () => {
    const findings = checkEnglishKeysPresent(
      'xx',
      'gamelib',
      { a: { b: 'Text', c: 'Other' } },
      { a: { c: 'Other', b: 'Text' } }
    )
    expect(findings).toHaveLength(0)
  })

  // The check runs for gamelib only -- an upstream namespace in scope
  // produces no presence findings, even when a key is genuinely missing.
  // (Structural coverage: this is what R8's "old direction" half already
  // demonstrates end-to-end via lintTranslations(); this is the direct
  // unit-level statement of the same gate.)
  it('REQ-41-01: checkEnglishKeysPresent is never invoked for an upstream namespace via lintTranslations()', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'translation', {
        redeemKey: { error: 'Oops' }
      })
      writeCatalog(localesPath, 'xx', 'translation', {})

      const result = lintTranslations({
        localesPath,
        namespaces: ['translation']
      })
      expect(result.findings).toHaveLength(0)
      expect(result.hardFailures).toHaveLength(0)
    })
  })
})

describe('comparePresenceBaseline (REQ-41-01)', () => {
  // R13 -- the CI-facing live gate: the committed baseline agrees exactly
  // with a fresh derivation over the real, committed public/locales/ tree.
  it('REQ-41-01 R13: zero drift between the live tree and the committed baseline', () => {
    const diff = comparePresenceBaseline(
      'public/locales',
      PRESENCE_BASELINE_PATH
    )
    expect(diff.added).toHaveLength(0)
    expect(diff.removed).toHaveLength(0)
  })

  // R14 -- non-vacuity of R13, in BOTH directions. Never mutates the
  // committed baseline -- every mutation happens on a JSON-cloned COPY
  // written to an mkdtempSync scratch file. This project has a recorded
  // lesson that a one-directional residual check misses half the defect
  // class ("a `toContain` pin catches DELETION but not EXTENSION") -- both
  // directions are proven here, independently, with their own assertion.
  it('REQ-41-01 R14: comparePresenceBaseline detects drift in BOTH directions against copied baselines', () => {
    type BaselineShape = {
      namespace: string
      totalPairs: number
      missing: Record<string, string[]>
    }
    const parsedCommitted: unknown = JSON.parse(
      readFileSync(PRESENCE_BASELINE_PATH, 'utf8')
    )
    const committed = parsedCommitted as BaselineShape

    const scratchDir = mkdtempSync(join(tmpdir(), 'presence-baseline-'))
    try {
      // (a) Shrink direction: a baseline that does NOT record a pair that
      // is genuinely still missing live must be reported as `added` (a new
      // blind spot). Built on an isolated fixture locales tree (never
      // `public/locales`) rather than deleting an entry from the real
      // committed baseline's `missing` map -- REQ-41-01's intended end
      // state is that map going to `{}` once every real gap is filled
      // (see quick task 260906-u8i), and this direction of R14 must stay
      // testable regardless of whether the real tree currently has ANY
      // gaps of its own.
      withFixtureLocales((fixtureLocalesPath) => {
        writeCatalog(fixtureLocalesPath, 'en', 'gamelib', { greeting: 'hi' })
        writeCatalog(fixtureLocalesPath, 'xx', 'gamelib', {})

        const shrunkBaseline = { namespace: 'gamelib', missing: {} }
        const shrunkPath = join(scratchDir, 'shrunk.json')
        writeFileSync(shrunkPath, JSON.stringify(shrunkBaseline))

        const diffShrunk = comparePresenceBaseline(
          fixtureLocalesPath,
          shrunkPath
        )
        expect(diffShrunk.added.length).toBeGreaterThan(0)
        expect(diffShrunk.added).toEqual(
          expect.arrayContaining([{ locale: 'xx', key: 'greeting' }])
        )
      })

      // (b) Grow a COPY: add a fabricated pair that is NOT actually
      // missing live (a locale/key pair that does not exist at all). The
      // comparison must report it as `removed` (the copy overstating
      // reality).
      const grown = JSON.parse(JSON.stringify(committed)) as typeof committed
      grown.missing['__fabricated_key_for_r14__'] = [
        '__fabricated_locale_for_r14__'
      ]
      grown.totalPairs += 1
      const grownPath = join(scratchDir, 'grown.json')
      writeFileSync(grownPath, JSON.stringify(grown))

      const diffGrown = comparePresenceBaseline('public/locales', grownPath)
      expect(diffGrown.removed.length).toBeGreaterThan(0)
      expect(diffGrown.removed).toEqual(
        expect.arrayContaining([
          {
            locale: '__fabricated_locale_for_r14__',
            key: '__fabricated_key_for_r14__'
          }
        ])
      )
    } finally {
      rmSync(scratchDir, { recursive: true, force: true })
    }

    // Never touched the committed baseline itself.
    const stillCommitted = readFileSync(PRESENCE_BASELINE_PATH, 'utf8')
    expect(JSON.parse(stillCommitted)).toEqual(committed)
  })
})

describe('presence baseline drift skip diagnostics (REQ-41-01, gap-closure 41-06)', () => {
  // R19a -- an absent baseline (injected via opts.baselinePath, NEVER the
  // committed artifact) makes the gate say so, rather than disabling drift
  // detection in silence.
  it('R19a: an absent (injected) baseline path emits exactly one named skip finding', () => {
    const scratchDir = mkdtempSync(join(tmpdir(), 'presence-baseline-absent-'))
    try {
      const nonexistentBaselinePath = join(scratchDir, 'no-such-baseline.json')

      const result = lintTranslations({
        localesPath: 'public/locales',
        namespaces: ['gamelib'],
        baselinePath: nonexistentBaselinePath
      })

      const skips = result.findings.filter((f) =>
        f.includes('presence baseline drift check skipped')
      )
      expect(skips).toHaveLength(1)
      expect(skips[0]).toEqual(expect.stringContaining('gamelib'))
      expect(skips[0]).toEqual(expect.stringContaining(nonexistentBaselinePath))
      expect(result.hardFailures).toHaveLength(0)
    } finally {
      rmSync(scratchDir, { recursive: true, force: true })
    }
  })

  // R19b -- non-vacuity of R19a: the negative half of the pair. Omitting
  // baselinePath entirely resolves to the real committed PRESENCE_BASELINE_PATH
  // and drift detection actually runs -- no skip finding.
  it('R19b: omitting baselinePath resolves to the committed baseline and emits no skip finding', () => {
    const result = lintTranslations({
      localesPath: 'public/locales',
      namespaces: ['gamelib']
    })

    const skips = result.findings.filter((f) =>
      f.includes('presence baseline drift check skipped')
    )
    expect(skips).toHaveLength(0)
  })

  // R20a -- a non-canonical localesPath (a fixture tree, as every other test
  // in this file uses) makes the gate say so, rather than disabling drift
  // detection in silence.
  it('R20a: a non-canonical localesPath emits exactly one named skip finding for the fork-owned namespace', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'gamelib', { greeting: 'hi' })
      writeCatalog(localesPath, 'xx', 'gamelib', { greeting: 'hi' })

      const result = lintTranslations({ localesPath, namespaces: ['gamelib'] })

      const skips = result.findings.filter((f) =>
        f.includes('presence baseline drift check skipped')
      )
      expect(skips).toHaveLength(1)
      expect(skips[0]).toEqual(expect.stringContaining('gamelib'))
      expect(skips[0]).toEqual(expect.stringContaining(localesPath))
      expect(skips[0]).toEqual(expect.stringContaining('public/locales'))
    })
  })

  // R20b -- non-vacuity of R20a: the same non-canonical fixture path with an
  // UPSTREAM namespace in scope emits no skip finding, proving the emission
  // is gated to fork-owned namespaces and adds no noise to a full-namespace
  // run (the D-15 silent branch).
  it('R20b: the same non-canonical fixture with an upstream namespace emits no skip finding', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'translation', { hello: 'hi' })
      writeCatalog(localesPath, 'xx', 'translation', { hello: 'salut' })

      const result = lintTranslations({
        localesPath,
        namespaces: ['translation']
      })

      const skips = result.findings.filter((f) =>
        f.includes('presence baseline drift check skipped')
      )
      expect(skips).toHaveLength(0)
    })
  })
})

describe('WR-03: an unreadable catalog is distinguished from an absent one', () => {
  // RED-1 -- readCatalog() itself. `mkdir <fixture>/xx/gamelib.json` makes the
  // catalog PATH a directory, so readFileSync fails with EISDIR (no chmod
  // games -- a no-op for root, and fails open in some CI images). At HEAD,
  // readCatalog()'s bare `catch { return null }` (:146-152) reports this
  // identically to a genuinely absent file. It must instead throw a
  // read-failure error naming the errno code.
  it('WR-03 RED-1: readCatalog() throws for an unreadable (EISDIR) catalog instead of returning null', () => {
    withFixtureLocales((localesPath) => {
      mkdirSync(join(localesPath, 'xx', 'gamelib.json'), { recursive: true })

      expect(() => readCatalog(localesPath, 'xx', 'gamelib')).toThrow(
        /EISDIR/
      )
    })
  })

  // RED-2 -- lintTranslations() end to end, over an UPSTREAM namespace
  // (translation), which is the dangerous half of WR-03: an absent upstream
  // catalog is normally a one-line "not yet translated" finding, not a hard
  // failure (R2 above). At HEAD, readCatalog() swallows the EISDIR the same
  // way, so this identical fixture is silently downgraded to that same
  // "not yet translated" finding -- a real filesystem fault reads as
  // ordinary Weblate incompleteness. It must instead be a NAMED hard
  // failure, and lintTranslations() must still return normally (not throw)
  // -- CR-01's defect class must not be re-created at this new errno.
  it('WR-03 RED-2: lintTranslations() reports an unreadable upstream catalog as a named hard failure, not a "not yet translated" downgrade', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'translation', { hello: 'hi' })
      mkdirSync(join(localesPath, 'xx', 'translation.json'), {
        recursive: true
      })

      let result: LintResult | undefined
      expect(() => {
        result = lintTranslations({ localesPath, namespaces: ['translation'] })
      }).not.toThrow()

      expect(result!.hardFailures).toHaveLength(1)
      expect(result!.hardFailures[0]).toEqual(expect.stringContaining('xx'))
      expect(result!.hardFailures[0]).not.toEqual(
        expect.stringContaining('not yet translated')
      )
    })
  })

  // RED-3 -- missingPairs()'s own bare catches at :332/:349 swallow a
  // read-failure identically to genuine absence, which is worse than R2's
  // downgrade: it flows into `writePresenceBaseline()` (never through
  // `lintTranslations()`'s hardFailures at all) and would record every
  // English key as missing for a locale that merely could not be READ. Built
  // so the difference is unambiguous: an `en` catalog with one known key,
  // and one locale whose catalog PATH is a directory. At HEAD this returns a
  // fully-populated missing set (every en key recorded against `xx`); it
  // must instead propagate the read-failure so the caller can distinguish
  // "unreadable" from "confirmed missing".
  it('WR-03 RED-3: missingPairs() propagates an unreadable locale catalog instead of recording every key as missing', () => {
    withFixtureLocales((localesPath) => {
      writeCatalog(localesPath, 'en', 'gamelib', { greeting: 'hi' })
      mkdirSync(join(localesPath, 'xx', 'gamelib.json'), { recursive: true })

      expect(() => missingPairs(localesPath, 'gamelib')).toThrow(/EISDIR/)
    })
  })
})

describe('baseline write-guard (REQ-41-01, T-41-05-01)', () => {
  // R15 -- the write path is unreachable under jest even when explicitly
  // requested: setting LINT_TRANSLATIONS_WRITE_BASELINE=1 and re-importing
  // the module (jest.resetModules()) still cannot write, because main()
  // itself is gated behind `!process.env.JEST_WORKER_ID`, which this
  // process always has set. This is a genuine attempt-and-fail proof, not
  // an assumption: the trigger env var IS set when the import happens.
  it('REQ-41-01 R15: LINT_TRANSLATIONS_WRITE_BASELINE=1 during a jest run cannot write the baseline', async () => {
    const beforeBytes = readFileSync(PRESENCE_BASELINE_PATH)
    const beforeMtime = statSync(PRESENCE_BASELINE_PATH).mtimeMs

    const originalEnv = process.env.LINT_TRANSLATIONS_WRITE_BASELINE
    process.env.LINT_TRANSLATIONS_WRITE_BASELINE = '1'
    try {
      jest.resetModules()
      await import('../lintTranslations')
    } finally {
      if (originalEnv === undefined) {
        delete process.env.LINT_TRANSLATIONS_WRITE_BASELINE
      } else {
        process.env.LINT_TRANSLATIONS_WRITE_BASELINE = originalEnv
      }
    }

    const afterBytes = readFileSync(PRESENCE_BASELINE_PATH)
    const afterMtime = statSync(PRESENCE_BASELINE_PATH).mtimeMs
    expect(afterBytes.equals(beforeBytes)).toBe(true)
    expect(afterMtime).toBe(beforeMtime)
  })
})
