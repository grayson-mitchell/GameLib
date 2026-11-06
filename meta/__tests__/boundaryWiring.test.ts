/**
 * Pins the wiring of `pnpm boundaries` (phase 62, D-14): the package.json
 * script, the lint.yml CI step and the pre-push hook line 2. Nothing here
 * executes the gate; it only proves the wiring cannot be dropped silently.
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

function hasBoundariesStep(doc: ParsedWorkflow): boolean {
  const steps = doc.jobs?.lint?.steps
  if (!Array.isArray(steps)) return false
  return steps.some((s) => s.run === 'pnpm boundaries')
}

const lintYml = read('.github', 'workflows', 'lint.yml')
const prePush = read('.husky', 'pre-push')
const pkg = JSON.parse(read('package.json')) as {
  scripts: Record<string, string>
}

describe('boundary gate wiring', () => {
  it('self-test: the files were really read', () => {
    expect(lintYml.length).toBeGreaterThan(0)
    expect(prePush.length).toBeGreaterThan(0)
    expect(Object.keys(pkg.scripts).length).toBeGreaterThan(0)
  })

  it('lint.yml job lint runs pnpm boundaries', () => {
    expect(hasBoundariesStep(load(lintYml) as ParsedWorkflow)).toBe(true)
  })

  it('pre-push line 2 chains pnpm boundaries and line 1 is the shebang', () => {
    const lines = prePush.split('\n')
    expect(lines[0]).toMatch(/^#!/)
    expect(lines[1]).toContain('pnpm boundaries')
  })

  it('package.json boundaries script runs both gates', () => {
    const script = pkg.scripts.boundaries
    expect(script).toContain('--ignore-known')
    expect(script).toContain('.dependency-cruiser.cjs')
    expect(script).toContain('meta/boundaryRatchet.cjs')
  })

  it('near-miss: the matcher rejects a workflow with the step removed', () => {
    const doc = load(lintYml) as ParsedWorkflow
    const stripped: ParsedWorkflow = {
      jobs: {
        lint: {
          steps: (doc.jobs?.lint?.steps ?? []).filter(
            (s) => s.run !== 'pnpm boundaries'
          )
        }
      }
    }
    expect(hasBoundariesStep(stripped)).toBe(false)
  })
})
