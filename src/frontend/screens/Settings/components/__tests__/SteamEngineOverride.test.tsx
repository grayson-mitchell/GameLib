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
  selectValue,
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
    loaded: true,
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
    expect(items.every((i) => i)).toBe(true)
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

  it('does not flag CrossOver as unsupported (G9)', () => {
    expect(select(render('crossover')).props.afterSelect).toBeUndefined()
  })

  it('warns for a wine-manager choice', () => {
    expect(select(render('wine-manager:X')).props.afterSelect).toBeTruthy()
  })

  it('keeps an uninstalled wine-manager value selected as a disabled entry (WR-05)', () => {
    const onChange = jest.fn()
    const sel = select(render('wine-manager:9.0-gone', { onChange }))
    expect(selectValue('wine-manager:9.0-gone')).toBe('wine-manager:9.0-gone')
    expect(sel.props.value).toBe('wine-manager:9.0-gone')
    const items = sel.props.children as El[]
    expect(items).toHaveLength(5)
    expect(items[4].props.disabled).toBe(true)
    expect(items[4].props.children).toBe(
      'Wine Manager: 9.0-gone (not installed)'
    )
    expect(sel.props.afterSelect).toBeTruthy()
    ;(sel.props.onChange as (e: unknown) => void)({
      target: { value: 'automatic' }
    })
    expect(onChange).toHaveBeenCalledWith('automatic')
  })

  it('labels an uninstalled pinned value by its id', () => {
    const items = select(render('pinned:old-pin')).props.children as El[]
    expect(items[4].props.children).toBe('old-pin (not installed)')
    expect(items[4].props.disabled).toBe(true)
  })

  it('is disabled and shows the stored value until options load (G12b)', () => {
    const sel = select(
      render('pinned:wine-staging-11.20', {
        loaded: false,
        options: []
      })
    )
    expect(sel.props.disabled).toBe(true)
    expect(sel.props.value).toBe('pinned:wine-staging-11.20')
    expect(sel.props.children as El[]).toHaveLength(1)
  })

  it('puts the help icon on the label line', () => {
    const sel = select(render('automatic'))
    expect(sel.props.labelHelp).toBeTruthy()
    expect(sel.props.label).toBe('Engine')
  })
})
