/**
 * Pins the wiring of `pnpm steam-line-ceiling` (phase 65, D-02): the
 * package.json script, the lint.yml CI step (after Module boundaries) and the
 * pre-push hook line 2. Nothing here executes the gate.
 */

import { load } from 'js-yaml'
import { readFileSync } from 'fs'
import { join } from 'path'

const REPO_ROOT = join(__dirname, '..', '..')

interface Step {
  name?: string
  run?: string
}
interface ParsedWorkflow {
  jobs?: { lint?: { steps?: Step[] } }
}

function read(...parts: string[]): string {
  return readFileSync(join(REPO_ROOT, ...parts), 'utf-8')
}

function stepIndex(steps: Step[], run: string): number {
  return steps.findIndex((s) => s.run === run)
}

const lintYml = read('.github', 'workflows', 'lint.yml')
const prePush = read('.husky', 'pre-push')
const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>
}

function lintSteps(): Step[] {
  return (load(lintYml) as ParsedWorkflow).jobs?.lint?.steps ?? []
}

describe('steam-line-ceiling gate wiring', () => {
  it('self-test: the files were really read', () => {
    expect(lintYml.length).toBeGreaterThan(0)
    expect(prePush.length).toBeGreaterThan(0)
    expect(Object.keys(pkg.scripts).length).toBeGreaterThan(0)
  })

  it('package.json script runs the gate', () => {
    expect(pkg.scripts['steam-line-ceiling']).toBe(
      'node meta/steamLineCeiling.cjs'
    )
  })

  it('lint.yml runs the gate after Module boundaries', () => {
    const steps = lintSteps()
    const gate = stepIndex(steps, 'pnpm steam-line-ceiling')
    const boundaries = stepIndex(steps, 'pnpm boundaries')
    expect(boundaries).toBeGreaterThanOrEqual(0)
    expect(gate).toBeGreaterThan(boundaries)
  })

  it('near-miss: with the step filtered out the check would fail', () => {
    const steps = lintSteps().filter((s) => s.run !== 'pnpm steam-line-ceiling')
    expect(stepIndex(steps, 'pnpm steam-line-ceiling')).toBe(-1)
  })

  it('pre-push line 1 is the shebang and line 2 chains the gate', () => {
    const lines = prePush.split('\n')
    expect(lines[0]).toMatch(/^#!/)
    expect(lines[1]).toContain('pnpm boundaries && pnpm steam-line-ceiling')
  })
})
