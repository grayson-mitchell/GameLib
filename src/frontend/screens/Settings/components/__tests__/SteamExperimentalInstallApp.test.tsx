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

import { SteamExperimentalInstallAppView } from '../SteamExperimentalInstallApp'

type El = ReactElement<Record<string, unknown>>
const t = (_k: string, fallback: string) => fallback

const render = (isMac: boolean, value = false, onToggle = jest.fn()) =>
  SteamExperimentalInstallAppView({ isMac, value, onToggle, t }) as El

const childrenOf = (el: El): El[] => {
  const c = el.props.children
  return (Array.isArray(c) ? c : [c]) as El[]
}

describe('SteamExperimentalInstallApp', () => {
  test('renders nothing off macOS', () => {
    expect(render(false).props.children).toBeUndefined()
  })

  test('on macOS renders a toggleRow with ToggleSwitch and icon-only InfoIcon', () => {
    const el = render(true, false)
    expect(el.props.className).toBe('toggleRow')
    const [toggle, info] = childrenOf(el)
    expect(toggle.props.htmlId).toBe('steamExperimentalInstallApp')
    expect(toggle.props.value).toBe(false)
    expect(toggle.props.title).toBe('Steam Experimental InstallApp Feature')
    expect(info.props.text).toEqual(expect.any(String))
    expect(info.props.text).not.toMatch(/^Help$/)
  })

  test('toggling calls onToggle(!value)', () => {
    const onToggle = jest.fn()
    const [toggle] = childrenOf(render(true, false, onToggle))
    ;(toggle.props.handleChange as () => void)()
    expect(onToggle).toHaveBeenCalledWith(true)

    const onToggleOn = jest.fn()
    const [toggleOn] = childrenOf(render(true, true, onToggleOn))
    ;(toggleOn.props.handleChange as () => void)()
    expect(onToggleOn).toHaveBeenCalledWith(false)
  })
})
