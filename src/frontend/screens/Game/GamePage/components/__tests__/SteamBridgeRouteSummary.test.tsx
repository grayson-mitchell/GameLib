import type { ReactElement, ReactNode } from 'react'

jest.mock('react-i18next', () => {
  const { gamelibT } =
    jest.requireActual<typeof import('./gamelibT')>('./gamelibT')
  return { useTranslation: () => ({ t: gamelibT }) }
})

jest.mock('../SteamBridgeRouteSummary.scss', () => ({}))

import SteamBridgeRouteSummary from '../SteamBridgeRouteSummary'

type El = ReactElement<Record<string, unknown>>
const R = 'steam.bridge.route.reason.'
const syms = (n: number) => Array.from({ length: n }, (_, i) => `sym${i}`)

const isEl = (n: unknown): n is El =>
  !!n && typeof n === 'object' && 'props' in n

const text = (n: ReactNode): string => {
  if (n == null || typeof n === 'boolean') return ''
  if (typeof n === 'string' || typeof n === 'number') return String(n)
  if (Array.isArray(n)) return n.map(text).join('')
  if (isEl(n)) return text(n.props.children as ReactNode)
  return ''
}

const find = (n: ReactNode, pred: (e: El) => boolean): El | undefined => {
  if (Array.isArray(n)) {
    for (const c of n as ReactNode[]) {
      const r = find(c, pred)
      if (r) return r
    }
    return undefined
  }
  if (!isEl(n)) return undefined
  if (pred(n)) return n
  return find(n.props.children as ReactNode, pred)
}

const render = (over: Partial<Parameters<typeof SteamBridgeRouteSummary>[0]>) =>
  SteamBridgeRouteSummary({
    routeKey: 'native',
    reasonKey: null,
    reasonParams: {},
    missingSymbols: [],
    ...over
  }) as El

const badge = (el: El) =>
  find(el, (e) => e.props.className === 'steamBridgeIssueBadge')
const tooltipEl = (el: El) =>
  find(el, (e) => 'arrow' in e.props && 'title' in e.props)

describe('SteamBridgeRouteSummary', () => {
  it('caps 25 symbols to 10 plus "and 15 more", no inline dump', () => {
    const el = render({
      reasonKey: `${R}scanMiss`,
      missingSymbols: syms(25)
    })
    const visible = text(el)
    expect(visible).toContain('Native Steam bridge')
    expect(visible).toContain('25 Steam calls not covered')
    expect(visible).not.toContain('sym0')
    const tip = text(tooltipEl(el)?.props.title as ReactNode)
    expect(tip).toContain('does not cover every Steam call')
    expect(tip).toContain('sym9')
    expect(tip).not.toContain('sym10')
    expect(tip).toContain('and 15 more')
  })

  it('uses the singular badge and no "more" line for one symbol', () => {
    const el = render({
      reasonKey: `${R}scanMiss`,
      missingSymbols: ['only']
    })
    expect(text(badge(el))).toBe('1 Steam call not covered')
    expect(text(tooltipEl(el)?.props.title as ReactNode)).not.toContain('more')
  })

  it('shows a short badge and the interpolated sentence for knownBad', () => {
    const el = render({
      reasonKey: `${R}knownBad`,
      reasonParams: { reasonKey: `${R}seed` }
    })
    expect(text(badge(el))).toBe('Known issue')
    expect(text(tooltipEl(el)?.props.title as ReactNode)).toContain(
      'Known not to work with the bridge: Known to work with the bridge'
    )
  })

  it('shows no badge for benign reasons and puts the reason in the title', () => {
    const el = render({ reasonKey: `${R}scanClean` })
    expect(badge(el)).toBeUndefined()
    const label = find(el, (e) => e.props.className === 'steamBridgeRouteLabel')
    expect(label?.props.title).toBe(
      'Every Steam call this game makes is covered'
    )
  })

  it('has no badge and no title for a null reason', () => {
    const el = render({})
    expect(badge(el)).toBeUndefined()
    const label = find(el, (e) => e.props.className === 'steamBridgeRouteLabel')
    expect(label?.props.title).toBeUndefined()
  })
})
