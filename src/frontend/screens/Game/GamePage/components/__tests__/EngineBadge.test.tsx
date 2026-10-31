import type { ReactElement } from 'react'
import type { SteamEngineState } from 'common/types/steam'

jest.mock('react-i18next', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gamelibT } = require('./gamelibT')
  return { useTranslation: () => ({ t: gamelibT }) }
})

import EngineBadge from '../EngineBadge'

const make = (over: Partial<SteamEngineState>): SteamEngineState => ({
  appId: '730',
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
  children: string
}> | null

describe('EngineBadge', () => {
  it('renders nothing for crossover, null engine, or no state', () => {
    expect(EngineBadge({ state: make({ engine: 'crossover' }) })).toBeNull()
    expect(EngineBadge({ state: make({ engine: null }) })).toBeNull()
    expect(EngineBadge({ state: undefined })).toBeNull()
  })

  it('shows the built-in badge with the reason in its title', () => {
    const el = EngineBadge({ state: make({}) }) as R
    expect(el?.props.children).toBe('Built-in engine (best-effort)')
    expect(el?.props.className).toContain('engineBadge--builtin')
    expect(el?.props.title).toContain('CrossOver trial expired')
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
})
