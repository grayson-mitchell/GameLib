/**
 * Boot-order gate for the 'app-folder' step (D-66.4-04). Boots nothing and mocks nothing: it
 * reads BOOT_STEP_NAMES from source text. The heroic -> GameLib config-folder rename (and the
 * CI=e2e app folder) must happen before anything reads under the app folder, and `constants/paths`
 * used to guarantee that implicitly by running at import. 'app-folder' is therefore the FIRST
 * step, ahead of 'logger', 'stores', 'migrations', 'config' and 'secret-vault'.
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

/** The readers of the app folder that 'app-folder' must precede (empty result when the order is right). */
function appFolderOrderViolations(names: readonly string[]): string[] {
  const readers = ['logger', 'stores', 'migrations', 'config', 'secret-vault']
  const first = names.indexOf('app-folder')
  const violations: string[] = []
  if (first !== 0) violations.push('app-folder must be the first boot step')
  for (const reader of readers) {
    const at = names.indexOf(reader)
    if (first < 0 || at < 0 || first >= at) {
      violations.push(`app-folder must precede ${reader}`)
    }
  }
  return violations
}

describe("the 'app-folder' boot step order (D-66.4-04)", () => {
  it('is the first step, ahead of every reader of the app folder', () => {
    const names = stepNames(
      readFileSync(join(__dirname, '..', 'bootstrap.ts'), 'utf-8')
    )
    expect(names[0]).toBe('app-folder')
    expect(appFolderOrderViolations(names)).toEqual([])
  })

  it('flags a fixture where stores precede app-folder', () => {
    const seeded = [
      'logger',
      'stores',
      'app-folder',
      'migrations',
      'config',
      'secret-vault'
    ]
    expect(appFolderOrderViolations(seeded)).toEqual([
      'app-folder must be the first boot step',
      'app-folder must precede logger',
      'app-folder must precede stores'
    ])
  })

  it('flags a fixture with no app-folder step at all', () => {
    expect(
      appFolderOrderViolations(['logger', 'stores', 'migrations', 'config'])
    ).toContain('app-folder must be the first boot step')
  })
})
