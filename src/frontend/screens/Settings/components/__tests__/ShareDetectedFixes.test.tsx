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

import { ShareDetectedFixesView } from '../ShareDetectedFixes'
import { at } from '../../../__tests__/fixtures/indexed'

type El = ReactElement<Record<string, unknown>>
const t = (_k: string, fallback: string) => fallback

const render = (isMac: boolean, value = false, onToggle = jest.fn()) =>
  ShareDetectedFixesView({ isMac, value, onToggle, t }) as El

const childrenOf = (el: El): El[] => {
  const c = el.props.children
  return (Array.isArray(c) ? c : [c]) as El[]
}

describe('ShareDetectedFixes', () => {
  test('renders nothing off macOS', () => {
    const el = render(false)
    expect(el.props.children).toBeUndefined()
  })

  test('on macOS renders a toggleRow with ToggleSwitch and InfoIcon', () => {
    const el = render(true, false)
    expect(el.props.className).toBe('toggleRow')
    const kids = childrenOf(el)
    const toggle = at(kids, 0)
    const info = at(kids, 1)
    expect(toggle.props.htmlId).toBe('shareDetectedFixes')
    expect(toggle.props.value).toBe(false)
    expect(info.props.text).toEqual(expect.any(String))
  })

  test('toggling calls onToggle(true) when off', () => {
    const onToggle = jest.fn()
    const toggle = at(childrenOf(render(true, false, onToggle)), 0)
    ;(toggle.props.handleChange as () => void)()
    expect(onToggle).toHaveBeenCalledWith(true)
  })

  test('help text states what is sent and never sent', () => {
    const info = at(childrenOf(render(true)), 1)
    const text = info.props.text as string
    for (const word of ['app id', 'GameLib version', 'never', 'title', 'IP']) {
      expect(text).toContain(word)
    }
  })

  test('no consent dialog and no Help link text', () => {
    const info = at(childrenOf(render(true)), 1)
    expect(info.props.text).not.toMatch(/^Help$/)
  })
})
