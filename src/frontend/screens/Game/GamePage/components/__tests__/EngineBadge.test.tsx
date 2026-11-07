import type { ReactElement } from 'react'
import type { EngineState } from 'common/types/engine'

jest.mock('react-i18next', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gamelibT } = require('./gamelibT')
  return { useTranslation: () => ({ t: gamelibT }) }
})

import EngineBadge from '../EngineBadge'

const make = (over: Partial<EngineState>): EngineState => ({
  runner: 'steam',
  appName: '730',
  engine: 'builtin',
  reason: 'cx-expired',
  engineLabel: null,
  trialDaysRemaining: null,
  showTrialNotice: false,
  crossoverInstalled: true,
  showNoCrossoverNote: false,
  untestedCrossoverBuild: null,
  ...over
})
type R = ReactElement<{
  className: string
  title: string
  children: unknown
}> | null

describe('EngineBadge', () => {
  it('renders nothing for crossover, null engine, or no state', () => {
    expect(EngineBadge({ state: make({ engine: 'crossover' }) })).toBeNull()
    expect(EngineBadge({ state: make({ engine: null }) })).toBeNull()
    expect(EngineBadge({ state: undefined })).toBeNull()
  })

  it('shows the built-in badge with the reason in its title', () => {
    const el = EngineBadge({ state: make({}) }) as R
    expect(el?.props.className).toContain('engineBadge--builtin')
    expect(el?.props.title).toContain('CrossOver trial expired')
  })

  it.each([
    ['cx-expired', 'CrossOver trial expired'],
    ['cx-missing', 'CrossOver not found'],
    ['cx-broken', "CrossOver isn't working"]
  ] as const)('shows %s as visible text on the badge', (reason, text) => {
    const el = EngineBadge({ state: make({ reason }) }) as R
    const kids = el?.props.children as ReactElement<{
      className?: string
      children: string
    }>[]
    expect(kids[0]).toBe('Built-in engine (best-effort)')
    const span = kids.find(
      (k) =>
        typeof k === 'object' && k.props.className === 'engineBadge__reason'
    )
    expect(span?.props.children).toBe(text)
  })

  it('shows the unsupported badge naming the engine', () => {
    const el = EngineBadge({
      state: make({
        engine: 'unsupported',
        reason: 'override',
        engineLabel: 'Wine 9'
      })
    }) as R
    expect(el?.props.children).toBe('Unsupported engine')
    expect(el?.props.className).toContain('engineBadge--unsupported')
    expect(el?.props.title).toContain('Wine 9')
  })

  it('labels a Legacy engine and uses identical text for every store', () => {
    const steam = EngineBadge({
      state: make({ engine: 'unsupported', legacyLabel: 'Wine GPTK 2.0' })
    }) as R
    const gog = EngineBadge({
      state: make({
        runner: 'gog',
        engine: 'unsupported',
        legacyLabel: 'Wine GPTK 2.0'
      })
    }) as R
    expect(steam?.props.children).toBe('Unsupported engine')
    expect(steam?.props.title).toContain('Legacy: Wine GPTK 2.0')
    expect(gog?.props.title).toBe(steam?.props.title)
    expect(gog?.props.children).toBe(steam?.props.children)
  })

  it('shows the engine label for a Wine Manager engine', () => {
    const el = EngineBadge({
      state: make({
        engine: 'unsupported',
        engineLabel: 'Wine Manager: X',
        runner: 'legendary'
      })
    }) as R
    expect(el?.props.title).toContain('Wine Manager: X')
  })
})
