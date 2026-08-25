/**
 * F-34.16-D gap closure (34.16-08 Task 1) -- the offline tripwire over
 * meta/runnerBuildInvocations.ts's RECORDED_RUNNER_INVOCATIONS. Four tests,
 * each proven (in the SUMMARY, by mutating the checked-in record and
 * restoring via cp+shasum -- never `git checkout --`) to fire on a distinct
 * known-bad mutation and to be SILENT here, on the unmutated record.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import {
  ONEDIR_RUNNERS,
  extractUpstreamPyinstallerCommand,
  toOnedirCommand,
  type OnedirRunnerName
} from '../buildRunnersOnedir'
import { RELEASE_TAGS } from '../releaseTags'
import {
  RECORDED_RUNNER_INVOCATIONS,
  type RecordedInvocation
} from '../runnerBuildInvocations'

const RUNNER_NAMES = Object.keys(
  RECORDED_RUNNER_INVOCATIONS
) as OnedirRunnerName[]

// Builds a minimal .github/workflows/<workflowFile> whose sole step's run:
// value is the recorded runValue, with a working-directory: sibling only
// when the record declares one -- mirrors
// meta/__tests__/buildRunnersOnedir.test.ts's own fixture-building idiom
// (single-line run:, no folding needed since runValue is already the
// extractor's OWN folded output).
function writeFixtureWorkflow(fixtureDir: string, record: RecordedInvocation) {
  const workflowsDir = join(fixtureDir, '.github', 'workflows')
  mkdirSync(workflowsDir, { recursive: true })
  const lines = [
    'name: fixture',
    'on: push',
    'jobs:',
    '  build:',
    '    steps:',
    '      - name: Build'
  ]
  if (record.workingDirectory !== null) {
    lines.push(`        working-directory: ${record.workingDirectory}`)
  }
  lines.push(`        run: ${record.runValue}`)
  writeFileSync(
    join(workflowsDir, record.workflowFile),
    lines.join('\n') + '\n'
  )
}

describe('RECORDED_RUNNER_INVOCATIONS', () => {
  // ---------------------------------------------------------------------
  // Test 1: tag coupling. RED when a recorded tag is edited to differ from
  // RELEASE_TAGS[runner] -- a record cannot go stale silently.
  // ---------------------------------------------------------------------
  describe('Test 1: each recorded tag equals RELEASE_TAGS[runner]', () => {
    it.each(RUNNER_NAMES)(
      '%s: recorded tag is coupled to RELEASE_TAGS',
      (runner) => {
        expect(RECORDED_RUNNER_INVOCATIONS[runner].tag).toBe(
          RELEASE_TAGS[runner]
        )
      }
    )
  })

  // ---------------------------------------------------------------------
  // Test 2: extractor round-trip. RED when a recorded runValue is replaced
  // by a value the REAL widened extractor does not recognise (e.g. "uv
  // build" -- a real line from legendary's own release.yml, which does NOT
  // match the uv-run-module form because its second token is "build", not
  // "run").
  // ---------------------------------------------------------------------
  describe('Test 2: a temp workflow built from the recorded runValue extracts to exactly the recorded shape', () => {
    let fixtureDir: string

    afterEach(() => {
      if (fixtureDir) {
        rmSync(fixtureDir, { recursive: true, force: true })
      }
    })

    it.each(RUNNER_NAMES)('%s: extractor round-trips the record', (runner) => {
      const record = RECORDED_RUNNER_INVOCATIONS[runner]
      fixtureDir = mkdtempSync(
        join(tmpdir(), `runner-invocation-fixture-${runner}-`)
      )
      writeFixtureWorkflow(fixtureDir, record)

      const result = extractUpstreamPyinstallerCommand(fixtureDir)
      expect(result.command).toBe(record.runValue)
      expect(result.workingDirectory ?? null).toBe(record.workingDirectory)
      expect(result.form).toBe(record.form)
    })
  })

  // ---------------------------------------------------------------------
  // Test 3: derivation round-trip. RED when "--onefile" is deleted from a
  // recorded runValue -- deriveOnedirInvocation (via toOnedirCommand, which
  // applies the same form-aware prefix slice) refuses to guess and throws.
  // ---------------------------------------------------------------------
  describe('Test 3: the derivation succeeds on each recorded invocation with no launcher token surviving', () => {
    it.each(RUNNER_NAMES)('%s: derives an --onedir command', (runner) => {
      const record = RECORDED_RUNNER_INVOCATIONS[runner]
      const { command } = toOnedirCommand(record.runValue, record.form)

      expect(command).toContain('--onedir')
      expect(command).not.toContain('--onefile')
      // No launcher token from any of the three forms survives into the
      // derived command -- T-34.16G-01, proven per-record here.
      expect(command).not.toContain('uv run')
      expect(command).not.toContain('python')
      expect(command).not.toContain('PyInstaller')
    })
  })

  // ---------------------------------------------------------------------
  // Test 4: key-set equality. RED when a fourth key is added to the record
  // (Object.keys grows past ONEDIR_RUNNERS's three) and RED when one is
  // removed (the record silently omits a runner it should still cover) --
  // symmetric equality, not a subset/superset check.
  // ---------------------------------------------------------------------
  describe('Test 4: the record key set equals Object.keys(ONEDIR_RUNNERS)', () => {
    it('no runner is missing and none is extra', () => {
      expect(Object.keys(RECORDED_RUNNER_INVOCATIONS).sort()).toEqual(
        Object.keys(ONEDIR_RUNNERS).sort()
      )
    })
  })
})
