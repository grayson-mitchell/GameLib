/**
 * Tests for `meta/logSecretGate.ts`.
 *
 * The central negative proof this suite owes is the one the debug ledger
 * (`.planning/debug/resolved/log-upload-has-no-redaction.md`) demanded: the
 * gate must flag the ACTUAL historical defect — `storeManagers/gog/user.ts`
 * interpolating the raw stdout of `gogdl auth --code` into a `logError` — and
 * must NOT flag the shape that replaced it. A gate that cannot fail against the
 * one defect it was built for is worthless, so that pair is asserted first.
 *
 * The second thing it owes is proof that the repo-wide ratchet can fail. A
 * green scan over `src/backend` means nothing on its own: it would look
 * identical if `scanScope` silently matched no files, or if the vocabulary had
 * been quietly emptied. The `non-vacuity` block sabotages a scratch copy and
 * asserts the same measurement the ratchet relies on moves.
 */

import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  DEFAULT_SCOPE_ROOT,
  EXCLUDED_IDENTIFIERS,
  FILE_EXEMPT_MARKER,
  PROCESS_OUTPUT_IDENTIFIERS,
  SECRET_IDENTIFIERS,
  ScopeLoadError,
  formatReport,
  scanScope,
  scanSource
} from '../logSecretGate'

const REPO_ROOT = join(__dirname, '..', '..')

// The exact call site that leaked, reconstructed from the ledger's Evidence
// section (gog/user.ts:97 as it stood before 2026-08-22).
const HISTORICAL_DEFECT = `
  const { stdout } = await libraryManagerMap['gog'].runRunnerCommand(
    ['auth', '--code', code],
    { abortId: 'gogdl-auth', logSanitizer: authLogSanitizer }
  )
  try {
    data = JSON.parse(stdout.trim())
  } catch (err) {
    logError(
      \`GOG login failed to parse std output from gogdl. stdout: \${stdout.trim()}, error \${err}\`,
      LogPrefix.Gog
    )
  }
`

// The shape that replaced it, as shipped.
const SHIPPED_FIX = `
  const { stdout } = await libraryManagerMap['gog'].runRunnerCommand(
    ['auth', '--code', code],
    { abortId: 'gogdl-auth', logSanitizer: authLogSanitizer }
  )
  try {
    data = JSON.parse(stdout.trim())
  } catch (err) {
    logError(
      \`GOG login failed to parse std output from gogdl. stdoutLength: \${stdout.trim().length}, error \${err}\`,
      LogPrefix.Gog
    )
  }
`

describe('logSecretGate', () => {
  describe('the historical defect', () => {
    it('flags gog/user.ts:97 as it stood before the fix — the proof the gate can fail', () => {
      const result = scanSource('user.ts', HISTORICAL_DEFECT)

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0]).toMatchObject({
        kind: 'process-output',
        identifier: 'stdout'
      })
    })

    it('does NOT flag the shape that replaced it — stdout.trim().length is a reduction', () => {
      const result = scanSource('user.ts', SHIPPED_FIX)

      expect(result.violations).toHaveLength(0)
    })
  })

  describe('violations', () => {
    it.each([...PROCESS_OUTPUT_IDENTIFIERS])(
      'flags raw `%s` interpolated into a template',
      (identifier) => {
        const result = scanSource(
          'fixture.ts',
          `logError(\`failed: \${${identifier}}\`, LogPrefix.Backend)`
        )

        expect(result.violations).toHaveLength(1)
        expect(result.violations[0]).toMatchObject({
          kind: 'process-output',
          identifier
        })
      }
    )

    it.each([...SECRET_IDENTIFIERS])(
      'flags a bare secret-named identifier `%s`',
      (identifier) => {
        const result = scanSource(
          'fixture.ts',
          `logInfo(\`value=\${${identifier}}\`, LogPrefix.Backend)`
        )

        expect(result.violations).toHaveLength(1)
        expect(result.violations[0]).toMatchObject({
          kind: 'secret-identifier',
          identifier
        })
      }
    )

    it('flags a property access — the real gog/games.ts:696 shape', () => {
      const result = scanSource(
        'fixture.ts',
        `logInfo(result.stdout, { prefix: LogPrefix.Gog })`
      )

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].identifier).toBe('stdout')
    })

    it('flags an array-argument call — the real bottle.ts:805 shape', () => {
      const result = scanSource(
        'fixture.ts',
        `logError(['cxbottle failed', name, stderr], LogPrefix.Steam)`
      )

      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].identifier).toBe('stderr')
    })

    it('flags a writer-method call, not just the module-level helper', () => {
      const result = scanSource(
        'fixture.ts',
        `heroicLogWriter.logInfo([\`stdout: \${stdout}\`])`
      )

      expect(result.violations).toHaveLength(1)
    })

    it.each(['logErrorSettled', 'logInfoSettled'])(
      'flags the promise-returning sibling `%s`',
      (fn) => {
        const result = scanSource(
          'fixture.ts',
          `${fn}(\`token=\${refreshToken}\`, LogPrefix.Backend)`
        )

        expect(result.violations).toHaveLength(1)
      }
    )
  })

  describe('never flagged — the presence/length convention', () => {
    it.each([
      ['len', 'logInfo(`len=${token.length}`, LogPrefix.Backend)'],
      ['optional length', 'logInfo(`len=${token?.length}`, LogPrefix.Backend)'],
      ['Boolean', 'logInfo(`present=${Boolean(token)}`, LogPrefix.Backend)'],
      ['double negation', 'logInfo(`present=${!!stdout}`, LogPrefix.Backend)'],
      ['single negation', 'logError(`missing=${!stdout}`, LogPrefix.Backend)'],
      [
        'byteLength',
        'logInfo(`bytes=${stdout.byteLength}`, LogPrefix.Backend)'
      ],
      [
        'explicit redactor',
        'logInfo(redactNileLoginData(stdout), LogPrefix.Nile)'
      ],
      [
        'describeSchemaFailure',
        'logWarning(describeSchemaFailure(cookie), LogPrefix.Backend)'
      ]
    ])('never flags the %s form', (_label, source) => {
      const result = scanSource('fixture.ts', source)

      expect(result.violations).toHaveLength(0)
    })

    it('never flags a call that is not a log call', () => {
      const result = scanSource(
        'fixture.ts',
        `logWriter.writeString(\`\\nMods deploy log:\\n\${result.stdout}\`)`
      )

      expect(result.violations).toHaveLength(0)
    })

    it('never flags an identifier in key position', () => {
      const result = scanSource(
        'fixture.ts',
        `logInfo({ stdout: stdout.length }, LogPrefix.Backend)`
      )

      expect(result.violations).toHaveLength(0)
    })

    it.each(['stdoutLength', 'stderrLines', 'tokenCount', 'cookieJarSize'])(
      'never flags the similarly-named binding `%s` (the vocabulary is anchored)',
      (identifier) => {
        const result = scanSource(
          'fixture.ts',
          `logInfo(\`v=\${${identifier}}\`, LogPrefix.Backend)`
        )

        expect(result.violations).toHaveLength(0)
      }
    )
  })

  describe('the excluded vocabulary — measured false positives stay out', () => {
    it.each([...EXCLUDED_IDENTIFIERS])(
      'never flags `%s`, which the measurement showed is almost always benign',
      (identifier) => {
        const result = scanSource(
          'fixture.ts',
          `logInfo(\`v=\${${identifier}}\`, LogPrefix.Backend)`
        )

        expect(result.violations).toHaveLength(0)
      }
    )

    it('never flags the real game_config.ts:326 settings-key shape', () => {
      const result = scanSource(
        'fixture.ts',
        'logInfo(`${this.appName}: Setting ${key} to ${JSON.stringify(value)}`)'
      )

      expect(result.violations).toHaveLength(0)
    })

    it('never flags the real helperProcess.ts:124 exit-code shape', () => {
      const result = scanSource(
        'fixture.ts',
        'logWarning(`bridge helper exited (code=${code} signal=${signal})`, LogPrefix.Steam)'
      )

      expect(result.violations).toHaveLength(0)
    })
  })

  describe('exemptions', () => {
    it('exempts a call site whose preceding comment carries the marker and a reason', () => {
      const result = scanSource(
        'fixture.ts',
        [
          `// ${FILE_EXEMPT_MARKER} stderr of tar -xf, not an auth command`,
          'logError(`Extracting Error: ${stderr}`, LogPrefix.Backend)'
        ].join('\n')
      )

      expect(result.violations).toHaveLength(0)
      expect(result.exemptions).toHaveLength(1)
      expect(result.exemptions[0].reason).toBe(
        'stderr of tar -xf, not an auth command'
      )
    })

    it('does NOT exempt a bare marker with no reason — an unexplained exemption is not one', () => {
      const result = scanSource(
        'fixture.ts',
        [
          `// ${FILE_EXEMPT_MARKER}`,
          'logError(`Extracting Error: ${stderr}`, LogPrefix.Backend)'
        ].join('\n')
      )

      expect(result.violations).toHaveLength(1)
      expect(result.exemptions).toHaveLength(0)
    })

    it('does not leak to the NEXT call — the marker is call-site scoped', () => {
      const result = scanSource(
        'fixture.ts',
        [
          'function f() {',
          `  // ${FILE_EXEMPT_MARKER} stderr of rsync, not an auth command`,
          '  logError(`Error: ${stderr}`, LogPrefix.Backend)',
          '  logError(`Error again: ${stderr}`, LogPrefix.Backend)',
          '}'
        ].join('\n')
      )

      expect(result.exemptions).toHaveLength(1)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].line).toBe(4)
    })

    it('has NO whole-file escape hatch — a marker at the top of the file exempts nothing below it', () => {
      const result = scanSource(
        'fixture.ts',
        [
          `// ${FILE_EXEMPT_MARKER} this file is fine, trust me`,
          '',
          'function f() {',
          '  logError(`Error: ${stderr}`, LogPrefix.Backend)',
          '}'
        ].join('\n')
      )

      expect(result.violations).toHaveLength(1)
      expect(result.exemptions).toHaveLength(0)
    })

    it('accepts a block comment carrying the marker', () => {
      const result = scanSource(
        'fixture.ts',
        [
          `/* ${FILE_EXEMPT_MARKER} stderr of mv -f, not an auth command */`,
          'logError(`Error: ${stderr}`, LogPrefix.Backend)'
        ].join('\n')
      )

      expect(result.violations).toHaveLength(0)
      expect(result.exemptions).toHaveLength(1)
    })
  })

  describe('formatReport', () => {
    it('names both ways out when there are violations', () => {
      const report = scanScope({
        root: mkScratchScope('logError(`Error: ${stderr}`, LogPrefix.Backend)'),
        repoRoot: REPO_ROOT
      })
      const text = formatReport(report)

      expect(text).toContain('reaches a log call unreduced')
      expect(text).toContain('keyPresent=')
      expect(text).toContain(FILE_EXEMPT_MARKER)
      expect(text).toContain('no whole-file exemption')
    })

    it('omits the remediation hint when clean', () => {
      const report = scanScope({
        root: mkScratchScope(
          'logInfo(`len=${token.length}`, LogPrefix.Backend)'
        ),
        repoRoot: REPO_ROOT
      })

      expect(formatReport(report)).not.toContain('Fix:')
    })
  })

  describe('scanScope', () => {
    it('refuses an empty scope — a glob matching nothing must not report green', () => {
      const dir = mkdtempSync(join(tmpdir(), 'log-secret-gate-empty-'))
      try {
        expect(() => scanScope({ root: dir, repoRoot: REPO_ROOT })).toThrow(
          ScopeLoadError
        )
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    it('skips __tests__ and __mocks__ — fixtures deliberately carry fake secrets', () => {
      const dir = mkdtempSync(join(tmpdir(), 'log-secret-gate-skip-'))
      try {
        const tests = join(dir, '__tests__')
        mkdirSync(tests)
        writeFileSync(
          join(tests, 'thing.ts'),
          'logError(`Error: ${stderr}`, LogPrefix.Backend)'
        )
        writeFileSync(join(dir, 'real.ts'), 'export const x = 1')

        const report = scanScope({ root: dir, repoRoot: REPO_ROOT })

        expect(report.scannedFiles).toBe(1)
        expect(report.violations).toHaveLength(0)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })

  // -------------------------------------------------------------------------
  // The repo-wide ratchet. This is the part that runs in CI on every push.
  // -------------------------------------------------------------------------
  describe(`ratchet over ${DEFAULT_SCOPE_ROOT}`, () => {
    const auditReport = () => scanScope({ repoRoot: REPO_ROOT })

    it('finds zero violations', () => {
      const report = auditReport()

      expect(formatReport(report)).toContain('found 0 violation(s)')
      expect(report.violations).toEqual([])
    })

    it('actually scanned the tree — a scan of nothing would also report zero', () => {
      const report = auditReport()

      expect(report.scannedFiles).toBeGreaterThan(200)
    })

    it('carries exactly 12 exemptions — adding a 13th must be a conscious act', () => {
      const report = auditReport()

      expect(report.exemptions).toHaveLength(12)
    })

    it('pins WHICH files hold them, so a silent swap at the same count still fails', () => {
      const report = auditReport()
      const files = [...new Set(report.exemptions.map((e) => e.file))].sort()

      expect(files).toEqual([
        'src/backend/launcher.ts',
        'src/backend/storeManagers/gog/games.ts',
        'src/backend/storeManagers/legendary/library.ts',
        'src/backend/storeManagers/steam/bottle.ts',
        'src/backend/storeManagers/zoom/games.ts',
        'src/backend/utils.ts'
      ])
    })

    it('every exemption names the command whose output it is', () => {
      const report = auditReport()

      for (const exemption of report.exemptions) {
        expect(exemption.reason.length).toBeGreaterThan(10)
      }
    })

    it('every exemption is process output — no secret-named identifier is exempted anywhere', () => {
      const report = auditReport()
      const identifiers = [
        ...new Set(report.exemptions.map((e) => e.identifier))
      ].sort()

      expect(identifiers).toEqual(['stderr', 'stdout'])
    })

    // Non-vacuity: prove the ratchet above can fail. If a sabotaged copy of a
    // real file scanned identically to the real one, the green run would be
    // measuring nothing.
    it('non-vacuity: a scratch copy of utils.ts with the gog defect appended IS caught', () => {
      const dir = mkdtempSync(join(tmpdir(), 'log-secret-gate-sabotage-'))
      try {
        const realPath = join(REPO_ROOT, 'src/backend/utils.ts')
        const sabotaged = join(dir, 'utils.sabotaged.ts')
        writeFileSync(
          sabotaged,
          `${readFileSync(realPath, 'utf-8')}\n${HISTORICAL_DEFECT}\n`
        )

        const before = auditReport()
        const after = scanScope({
          repoRoot: REPO_ROOT,
          extraFiles: [sabotaged]
        })

        expect(before.violations).toHaveLength(0)
        expect(after.violations).toHaveLength(1)
        expect(after.violations[0]).toMatchObject({
          kind: 'process-output',
          identifier: 'stdout'
        })
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  })
})

/**
 * Writes `source` into a throwaway scope root and returns its path. Used by the
 * `formatReport` cases, which need a real `ScopeScanReport` rather than a
 * hand-built one so the report wording is exercised end to end.
 */
function mkScratchScope(source: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'log-secret-gate-scope-'))
  writeFileSync(join(dir, 'fixture.ts'), source)
  return dir
}
