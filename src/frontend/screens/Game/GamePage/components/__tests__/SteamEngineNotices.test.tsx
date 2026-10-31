import type { ReactElement, ReactNode } from 'react'
import type { SteamEngineState } from 'common/types/steam'
import { useSteamEngineState } from 'frontend/state/SteamEngineState'

jest.mock('react-i18next', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { gamelibT } = require('./gamelibT')
  return { useTranslation: () => ({ t: gamelibT }) }
})

import SteamEngineNotices from '../SteamEngineNotices'

const make = (over: Partial<SteamEngineState>): SteamEngineState => ({
  appId: '730',
  engine: 'crossover',
  reason: 'cx-healthy',
  engineLabel: null,
  trialDaysRemaining: null,
  showTrialNotice: false,
  crossoverInstalled: true,
  showNoCrossoverNote: false,
  untestedCrossoverBuild: null,
  ...over
})

type El = ReactElement<{
  children?: ReactNode
  onClick?: () => unknown
  className?: string
}>
const flat = (n: ReactNode, out: El[] = []): El[] => {
  if (Array.isArray(n)) n.forEach((c) => flat(c, out))
  else if (n && typeof n === 'object') {
    out.push(n as El)
    flat((n as El).props.children, out)
  }
  return out
}
const text = (n: ReactNode): string =>
  Array.isArray(n)
    ? n.map(text).join('')
    : typeof n === 'string'
      ? n
      : n && typeof n === 'object'
        ? text((n as El).props.children)
        : ''
const render = (s: SteamEngineState | undefined) =>
  flat(SteamEngineNotices({ state: s }) as ReactNode).filter(
    (e) => typeof e.type === 'string'
  )
const button = (els: El[], label: string) =>
  els.find((e) => (e.type as string) === 'button' && text(e) === label)

const openExternalUrl = jest.fn()
const dismiss = jest.fn().mockResolvedValue(undefined)
beforeEach(() => {
  openExternalUrl.mockClear()
  dismiss.mockClear()
  ;(globalThis as unknown as { window: unknown }).window = {
    api: { openExternalUrl, dismissSteamEngineNotice: dismiss }
  }
  useSteamEngineState.setState({ byAppId: {} })
})

describe('SteamEngineNotices', () => {
  it('renders nothing when no notice applies', () => {
    expect(render(make({ trialDaysRemaining: 20 }))).toEqual([])
    expect(render(undefined)).toEqual([])
  })

  it('trial notice: plural days, body and Buy button', () => {
    const els = render(make({ showTrialNotice: true, trialDaysRemaining: 5 }))
    const all = els.map((e) => text(e)).join('|')
    expect(all).toContain('CrossOver trial: 5 days remaining')
    expect(all).toContain('built-in engine (best-effort)')
    button(els, 'Buy CrossOver')?.props.onClick?.()
    expect(openExternalUrl).toHaveBeenCalledWith(
      'https://www.codeweavers.com/crossover'
    )
  })

  it('trial notice: singular day', () => {
    const els = render(make({ showTrialNotice: true, trialDaysRemaining: 1 }))
    expect(els.map((e) => text(e)).join('|')).toContain('1 day remaining')
  })

  it('no-CrossOver note dismiss persists and hides immediately', async () => {
    useSteamEngineState.getState().set(make({ showNoCrossoverNote: true }))
    const els = render(make({ showNoCrossoverNote: true }))
    await button(els, 'Dismiss')?.props.onClick?.()
    expect(dismiss).toHaveBeenCalledWith({ kind: 'no-crossover' })
    expect(
      useSteamEngineState.getState().byAppId['730'].showNoCrossoverNote
    ).toBe(false)
  })

  it('untested-build notice names the build; dismiss persists and hides', async () => {
    useSteamEngineState.getState().set(make({ untestedCrossoverBuild: '26.1' }))
    const els = render(make({ untestedCrossoverBuild: '26.1' }))
    expect(els.map((e) => text(e)).join('|')).toContain(
      'CrossOver 26.1 is untested'
    )
    await button(els, 'Dismiss')?.props.onClick?.()
    expect(dismiss).toHaveBeenCalledWith({
      kind: 'untested-crossover',
      build: '26.1'
    })
    expect(
      useSteamEngineState.getState().byAppId['730'].untestedCrossoverBuild
    ).toBeNull()
  })

  it('is inline and non-modal', () => {
    const els = render(make({ showNoCrossoverNote: true }))
    expect(
      els.some((e) => e.props.className?.includes('steamEngineNotice'))
    ).toBe(true)
    expect(els.every((e) => typeof e.type === 'string')).toBe(true)
  })
})
