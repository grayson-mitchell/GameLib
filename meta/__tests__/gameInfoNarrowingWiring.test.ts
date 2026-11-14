/**
 * Pins the wiring of `pnpm gameinfo-narrowing-ceiling` (phase 70, D-15): the
 * package.json script, the lint.yml CI step (after Module boundaries and the Steam line ceiling) and the
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

describe('gameinfo-narrowing-ceiling gate wiring', () => {
  it('self-test: the files were really read', () => {
    expect(lintYml.length).toBeGreaterThan(0)
    expect(prePush.length).toBeGreaterThan(0)
    expect(Object.keys(pkg.scripts).length).toBeGreaterThan(0)
  })

  it('package.json script runs the gate', () => {
    expect(pkg.scripts['gameinfo-narrowing-ceiling']).toBe(
      'node meta/gameInfoNarrowingCeiling.cjs'
    )
  })

  it('lint.yml runs the gate after Module boundaries and the Steam line ceiling', () => {
    const steps = lintSteps()
    const gate = stepIndex(steps, 'pnpm gameinfo-narrowing-ceiling')
    const boundaries = stepIndex(steps, 'pnpm boundaries')
    const steamCeiling = stepIndex(steps, 'pnpm steam-line-ceiling')
    expect(boundaries).toBeGreaterThanOrEqual(0)
    expect(steamCeiling).toBeGreaterThan(boundaries)
    expect(gate).toBeGreaterThan(steamCeiling)
  })

  it('near-miss: with the step filtered out the check would fail', () => {
    const steps = lintSteps().filter(
      (s) => s.run !== 'pnpm gameinfo-narrowing-ceiling'
    )
    expect(stepIndex(steps, 'pnpm gameinfo-narrowing-ceiling')).toBe(-1)
  })

  it('pre-push line 1 is the shebang and line 2 chains the gate', () => {
    const lines = prePush.split('\n')
    expect(lines[0]).toMatch(/^#!/)
    expect(lines[1]).toContain(
      'pnpm backend-di-ceilings && pnpm gameinfo-narrowing-ceiling'
    )
  })
})
