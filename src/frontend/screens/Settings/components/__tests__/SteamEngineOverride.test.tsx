import type { ReactElement } from 'react'
import type { SteamEngineOption } from 'common/types/steam'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: () => '' }) }))
// CSS-importing UI components cannot load under this jest config; the test
// inspects the element tree, so inert stand-ins are enough.
jest.mock('frontend/components/UI/SelectField', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/components/UI/InfoIcon', () => ({
  __esModule: true,
  default: () => null
}))

import {
  SteamEngineOverrideView,
  effectiveValue,
  optionLabel
} from '../SteamEngineOverride'
import { gamelibT } from '../../../Game/GamePage/components/__tests__/gamelibT'
const opts: SteamEngineOption[] = [
  {
    id: 'automatic',
    kind: 'automatic',
    label: 'Automatic',
    available: true,
    installed: true,
    isPreviousPin: false
  },
  {
    id: 'crossover',
    kind: 'crossover',
    label: 'CrossOver',
    available: false,
    installed: false,
    isPreviousPin: false
  },
  {
    id: 'pinned:wine-staging-11.20',
    kind: 'pinned',
    label: 'Wine Staging 11.20',
    available: true,
    installed: true,
    isPreviousPin: false
  },
  {
    id: 'pinned:wine-staging-11.10',
    kind: 'pinned',
    label: 'Wine Staging 11.10',
    available: true,
    installed: false,
    isPreviousPin: true
  }
]

type El = ReactElement<Record<string, unknown>>
const render = (stored: string | undefined, over = {}) =>
  SteamEngineOverrideView({
    options: opts,
    stored,
    onOpen: jest.fn(),
    onChange: jest.fn(),
    t: gamelibT,
    ...over
  }) as El

const select = (el: El) =>
  (el.props.children as El[]).find((c) => c.props.htmlId) as El

describe('SteamEngineOverride', () => {
  it('is a collapsed details with the Engine (advanced) summary', () => {
    const el = render('automatic')
    expect(el.type).toBe('details')
    expect(el.props.open).toBeUndefined()
    const summary = (el.props.children as El[])[0]
    expect(summary.props.children).toBe('Engine (advanced)')
  })

  it('fetches only when opened', () => {
    const onOpen = jest.fn()
    const el = render('automatic', { onOpen })
    expect(onOpen).not.toHaveBeenCalled()
    ;(el.props.onToggle as (e: unknown) => void)({
      currentTarget: { open: false }
    })
    expect(onOpen).not.toHaveBeenCalled()
    ;(el.props.onToggle as (e: unknown) => void)({
      currentTarget: { open: true }
    })
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('labels options and disables unavailable ones', () => {
    expect(optionLabel(opts[0], gamelibT)).toBe(
      'Automatic (CrossOver, then built-in)'
    )
    expect(optionLabel(opts[2], gamelibT)).toBe('Wine Staging 11.20')
    expect(optionLabel(opts[3], gamelibT)).toBe(
      'Wine Staging 11.10 (previous build) (downloads on first launch)'
    )
    const items = select(render('automatic')).props.children as El[]
    expect(items).toHaveLength(4)
    expect(items[1].props.disabled).toBe(true)
  })

  it('shows no warning for automatic or unset', () => {
    expect(select(render('automatic')).props.afterSelect).toBeUndefined()
    expect(select(render(undefined)).props.afterSelect).toBeUndefined()
  })

  it('warns and passes the id through for a non-automatic choice', () => {
    const onChange = jest.fn()
    const sel = select(render('pinned:wine-staging-11.20', { onChange }))
    const warn = sel.props.afterSelect as El
    expect(warn.props.children).toBe(
      "Unsupported — known fixes and compatibility ratings don't apply"
    )
    ;(sel.props.onChange as (e: unknown) => void)({
      target: { value: 'pinned:wine-staging-11.20' }
    })
    expect(onChange).toHaveBeenCalledWith('pinned:wine-staging-11.20')
  })

  it('treats an unknown stored value as automatic with no warning', () => {
    expect(effectiveValue('pinned:gone', opts)).toBe('automatic')
    const sel = select(render('pinned:gone'))
    expect(sel.props.value).toBe('automatic')
    expect(sel.props.afterSelect).toBeUndefined()
  })

  it('puts the help icon on the label line', () => {
    const sel = select(render('automatic'))
    expect(sel.props.labelHelp).toBeTruthy()
    expect(sel.props.label).toBe('Engine')
  })
})
