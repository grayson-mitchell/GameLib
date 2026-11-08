import type { ReactElement } from 'react'

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: () => '' }) }))
// CSS-importing UI components cannot load under this jest config; the test
// inspects the element tree, so inert stand-ins are enough.
jest.mock('frontend/components/UI/InfoIcon', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('frontend/components/UI', () => ({
  ToggleSwitch: () => null
}))

import { EnableSteamNativeDeleteView } from '../EnableSteamNativeDelete'
import { at } from '../../../__tests__/fixtures/indexed'

type El = ReactElement<Record<string, unknown>>
const t = (_k: string, fallback: string) => fallback

const render = (isMac: boolean, value = true, onToggle = jest.fn()) =>
  EnableSteamNativeDeleteView({ isMac, value, onToggle, t }) as El

const childrenOf = (el: El): El[] => {
  const c = el.props.children
  return (Array.isArray(c) ? c : [c]) as El[]
}

describe('EnableSteamNativeDelete (quick 261106-s3n)', () => {
  test('renders the label with an icon-only (i) help on the same row', () => {
    const el = render(true)
    expect(el.props.className).toBe('toggleRow')
    const kids = childrenOf(el)
    const toggle = at(kids, 0)
    const info = at(kids, 1)
    expect(toggle.props.htmlId).toBe('enable-steam-native-delete')
    expect(toggle.props.title).toBe('Delete Steam games directly in GameLib')
    expect(String(toggle.props.title)).not.toMatch(/experimental/i)
    expect(info.props.text).toEqual(expect.any(String))
    expect(info.props.text).not.toMatch(/^Help$/)
  })

  test('shows the value it is given', () => {
    expect(at(childrenOf(render(true, false)), 0).props.value).toBe(false)
    expect(at(childrenOf(render(true, true)), 0).props.value).toBe(true)
  })

  test('toggling calls onToggle with the negation', () => {
    const off = jest.fn()
    ;(
      at(childrenOf(render(true, true, off)), 0).props
        .handleChange as () => void
    )()
    expect(off).toHaveBeenCalledWith(false)
    const on = jest.fn()
    ;(
      at(childrenOf(render(true, false, on)), 0).props
        .handleChange as () => void
    )()
    expect(on).toHaveBeenCalledWith(true)
  })

  test('macOS and non-mac help copy differ', () => {
    const mac = at(childrenOf(render(true)), 1).props.text
    const other = at(childrenOf(render(false)), 1).props.text
    expect(mac).not.toBe(other)
    expect(mac).toMatch(/signed in/)
    expect(other).not.toMatch(/signed in/)
  })
})
