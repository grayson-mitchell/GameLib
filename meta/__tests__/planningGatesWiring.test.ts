/**
 * Gates the WIRING of the planning-gate runner (Phase 34.2 gap cycle 4, WR-11).
 *
 * The finding this closes was not "a gate is wrong" but "six gates exist and
 * nothing runs them". Two of the six had been red for weeks the first time
 * anyone executed them. So the runner is only half the fix -- the other half
 * is that its CI wiring cannot be quietly removed or renamed without a test
 * going red, which is exactly the failure mode that produced WR-11.
 *
 * These are deliberately source-text assertions against the workflow and
 * `package.json`. There is no way to execute a GitHub Actions workflow from
 * jest, so the honest thing is to pin the wiring and say so, rather than
 * dress it up as a behavioural test.
 */

import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '..', '..')
const WORKFLOW_PATH = join(REPO_ROOT, '.github', 'workflows', 'codecheck.yml')
const RUNNER_PATH = join(REPO_ROOT, 'meta', 'runPlanningGates.py')
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')

describe('planning-gate runner wiring', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf-8')
  const packageJson = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf-8'))

  it('the runner script exists on disk', () => {
    expect(existsSync(RUNNER_PATH)).toBe(true)
  })

  it('package.json exposes it as `planning-gates`', () => {
    expect(packageJson.scripts['planning-gates']).toBe(
      'python3 meta/runPlanningGates.py'
    )
  })

  it('the codecheck workflow actually invokes it', () => {
    // Without this line the six gates go back to running nowhere, which is
    // the entire WR-11 finding.
    expect(workflow).toMatch(/run:\s*pnpm planning-gates/)
  })

  it('self-test: the workflow file is really being read and is the right one', () => {
    // A path typo would make the assertion above vacuous against an empty
    // string, so prove the file has the content we think it has.
    expect(workflow).toContain('name: Code check')
    expect(workflow).toMatch(/run:\s*pnpm codecheck/)
    expect(workflow.length).toBeGreaterThan(200)
  })

  it('self-test: the invocation assertion rejects a near-miss', () => {
    // `pnpm codecheck` is present in the same file; a sloppier regex would
    // match it and pass even with the planning-gates step deleted.
    expect('      - name: X\n        run: pnpm codecheck\n').not.toMatch(
      /run:\s*pnpm planning-gates/
    )
  })
})

describe('planning-gate runner anti-vacuity floor', () => {
  const runner = readFileSync(RUNNER_PATH, 'utf-8')

  it('refuses to report green when discovery finds too few gates', () => {
    // A runner whose glob stops matching would otherwise print "0/0 passed"
    // and exit 0 -- a gate that guards nothing, which is the shape this whole
    // finding is about.
    expect(runner).toMatch(/MINIMUM_EXPECTED_GATES\s*=\s*(\d+)/)
    const floor = Number(
      /MINIMUM_EXPECTED_GATES\s*=\s*(\d+)/.exec(runner)?.[1] ?? '0'
    )
    expect(floor).toBeGreaterThanOrEqual(6)
  })

  it('discovers by suffix, not by a hand-maintained list', () => {
    // A hand-maintained list reproduces WR-11 one level up: the seventh gate
    // gets added and forgotten exactly like the first six were.
    expect(runner).toContain('rglob')
    expect(runner).toContain('GATE_SUFFIX = "-gate.py"')
  })
})
