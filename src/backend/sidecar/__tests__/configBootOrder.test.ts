/**
 * Boot-order gate for the 'config' step (D-66.3-03). Boots nothing and mocks nothing: it reads
 * BOOT_STEP_NAMES from source text. The config-version upgrade can log synchronously and throws
 * while the log writer is unset, so 'config' must follow 'logger' and 'migrations' and precede
 * 'command-runner' and 'i18n'.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

function stepNames(source: string): string[] {
  const match = /export const BOOT_STEP_NAMES = \[([\s\S]*?)\] as const/.exec(
    stripSourceComments(source)
  )
  return [...(match?.[1] ?? '').matchAll(/'([a-z0-9-]+)'/g)].map(
    (m) => m[1] ?? ''
  )
}

/** The chain that must hold, as the names that break it (empty when the order is right). */
function configOrderViolations(names: readonly string[]): string[] {
  const chain = ['logger', 'migrations', 'config', 'command-runner', 'i18n']
  const violations: string[] = []
  chain.slice(1).forEach((name, i) => {
    const prev = chain[i] ?? ''
    const before = names.indexOf(prev)
    const after = names.indexOf(name)
    if (before < 0 || after < 0 || before >= after) {
      violations.push(`${prev} must precede ${name}`)
    }
  })
  return violations
}

describe("the 'config' boot step order (D-66.3-03)", () => {
  it('sits after logger and migrations and before command-runner and i18n', () => {
    const names = stepNames(
      readFileSync(join(__dirname, '..', 'bootstrap.ts'), 'utf-8')
    )
    expect(configOrderViolations(names)).toEqual([])
  })

  it('flags a fixture where config precedes logger', () => {
    const seeded = ['config', 'logger', 'migrations', 'command-runner', 'i18n']
    expect(configOrderViolations(seeded)).toEqual([
      'migrations must precede config'
    ])
  })
})
