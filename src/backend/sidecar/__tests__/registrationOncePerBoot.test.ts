/**
 * D-66.4-01: the once-only registrations carry no module latch; single-run is owned by the
 * 'register-handlers' boot step. This pins that handlers.ts calls each of them exactly once, so
 * single-run cannot silently regress into a double registration (T-66.4-60).
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import { stripSourceComments } from '../../testUtils/stripSourceComments'

const REGISTRATIONS = [
  'registerDevEpicCookieSweepFlow',
  'registerRunnerAuthFlows',
  'registerWineToolsFlows',
  'registerShortcutsFlows',
  'registerStoreWriteHandlers'
] as const

/** Names whose call-expression count in `source` is not exactly one. */
function callCountViolations(
  source: string,
  names: readonly string[]
): string[] {
  const stripped = stripSourceComments(source)
  return names.filter((name) => {
    const calls = stripped
      .split('\n')
      .filter((line) => !/^\s*import\b/.test(line))
      .join('\n')
      .match(new RegExp(`\\b${name}\\(`, 'g'))
    return (calls?.length ?? 0) !== 1
  })
}

describe('registrations are called once per boot (D-66.4-01)', () => {
  const handlersSource = readFileSync(
    join(__dirname, '..', 'handlers.ts'),
    'utf-8'
  )

  it('handlers.ts calls each latch-free registration exactly once', () => {
    expect(callCountViolations(handlersSource, REGISTRATIONS)).toEqual([])
  })

  it('reports a duplicated call', () => {
    const seeded = `${handlersSource}\nregisterRunnerAuthFlows({})\n`
    expect(callCountViolations(seeded, REGISTRATIONS)).toEqual([
      'registerRunnerAuthFlows'
    ])
  })

  it('reports a missing call', () => {
    expect(callCountViolations('', ['registerShortcutsFlows'])).toEqual([
      'registerShortcutsFlows'
    ])
  })
})
