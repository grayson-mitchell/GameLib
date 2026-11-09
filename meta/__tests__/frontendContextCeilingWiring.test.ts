/**
 * Pins the wiring of `pnpm frontend-context-ceiling` (phase 69, D-12): the
 * package.json script, the lint.yml CI step (after the backend DI ceilings)
 * and the pre-push hook line 2. Nothing here executes the gate.
 */

import { load } from 'js-yaml'
import { readdirSync, readFileSync } from 'fs'
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

describe('frontend-context-ceiling gate wiring', () => {
  it('self-test: the files were really read', () => {
    expect(lintYml.length).toBeGreaterThan(0)
    expect(prePush.length).toBeGreaterThan(0)
    expect(Object.keys(pkg.scripts).length).toBeGreaterThan(0)
  })

  it('package.json script runs the gate', () => {
    expect(pkg.scripts['frontend-context-ceiling']).toBe(
      'node meta/frontendContextCeiling.cjs'
    )
  })

  it('lint.yml runs the gate after the backend DI ceilings', () => {
    const steps = lintSteps()
    const gate = stepIndex(steps, 'pnpm frontend-context-ceiling')
    const di = stepIndex(steps, 'pnpm backend-di-ceilings')
    expect(di).toBeGreaterThanOrEqual(0)
    expect(gate).toBeGreaterThan(di)
  })

  it('near-miss: with the step filtered out the check would fail', () => {
    const steps = lintSteps().filter(
      (s) => s.run !== 'pnpm frontend-context-ceiling'
    )
    expect(stepIndex(steps, 'pnpm frontend-context-ceiling')).toBe(-1)
  })

  it('pre-push line 1 is the shebang and line 2 chains the gate', () => {
    const lines = prePush.split('\n')
    expect(lines[0]).toMatch(/^#!/)
    expect(lines[1]).toContain(
      'pnpm backend-di-ceilings && pnpm frontend-context-ceiling'
    )
  })

  it('the shard directory is not empty', () => {
    const shards = readdirSync(
      join(REPO_ROOT, 'meta', 'frontendContextCeiling')
    )
    expect(shards.filter((f) => f.endsWith('.json')).length).toBeGreaterThan(0)
  })
})
