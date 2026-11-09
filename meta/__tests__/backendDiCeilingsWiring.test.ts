/**
 * Pins the wiring of `pnpm backend-di-ceilings` (phase 66, D-16): the
 * package.json script, the lint.yml CI step (after the Steam file line
 * ceiling) and the pre-push hook line 2. Nothing here executes the gate.
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

describe('backend-di-ceilings gate wiring', () => {
  it('self-test: the files were really read', () => {
    expect(lintYml.length).toBeGreaterThan(0)
    expect(prePush.length).toBeGreaterThan(0)
    expect(Object.keys(pkg.scripts).length).toBeGreaterThan(0)
  })

  it('package.json script runs the gate', () => {
    expect(pkg.scripts['backend-di-ceilings']).toBe(
      'node meta/backendDiCeilings.cjs'
    )
  })

  it('lint.yml runs the gate after the Steam file line ceiling', () => {
    const steps = lintSteps()
    const gate = stepIndex(steps, 'pnpm backend-di-ceilings')
    const steam = stepIndex(steps, 'pnpm steam-line-ceiling')
    expect(steam).toBeGreaterThanOrEqual(0)
    expect(gate).toBeGreaterThan(steam)
  })

  it('near-miss: with the step filtered out the check would fail', () => {
    const steps = lintSteps().filter(
      (s) => s.run !== 'pnpm backend-di-ceilings'
    )
    expect(stepIndex(steps, 'pnpm backend-di-ceilings')).toBe(-1)
  })

  it('pre-push line 1 is the shebang and line 2 chains the gate', () => {
    const lines = prePush.split('\n')
    expect(lines[0]).toMatch(/^#!/)
    expect(lines[1]).toContain(
      'pnpm steam-line-ceiling && pnpm backend-di-ceilings'
    )
  })

  it('the shard directory is not empty', () => {
    const shards = readdirSync(join(REPO_ROOT, 'meta', 'backendDiCeilings'))
    expect(
      shards.filter((f) => f.endsWith('.json')).length
    ).toBeGreaterThanOrEqual(10)
  })
})
