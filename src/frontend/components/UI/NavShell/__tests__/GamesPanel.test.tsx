/**
 * Unit tests for the tier-2 portal seam (Tier2PortalContext) and its Games
 * portal-target (GamesPanel), REQ-34.10-09.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * src/frontend/jest.config.js docstring), so GamesPanel is invoked directly
 * as a plain function against a mocked 'react' (useContext), following the
 * pattern established by SidebarLinks/__tests__/index.test.tsx and
 * HumbleOriginInfo.test.tsx. Tier2PortalContext's default value is read via
 * the context object's `_currentValue` field -- an internal-but-stable React
 * field (see node_modules/react/cjs/react.development.js) -- since there is
 * no render harness available to mount a consumer without a Provider.
 *
 * No `render(`, `screen.` or `userEvent` anywhere in this file.
 */
import type { ReactElement } from 'react'

const mockSetTarget = jest.fn()
const mockSetFilled = jest.fn()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => ({
    target: null,
    setTarget: mockSetTarget,
    filled: false,
    setFilled: mockSetFilled
  })
}))

import { Tier2PortalContext, Tier2PortalProvider } from '../Tier2PortalContext'
import GamesPanel from '../components/GamesPanel'

type DivElement = ReactElement<{
  className?: string
  ref?: unknown
  children?: unknown
}>

describe('Tier2PortalContext', () => {
  it('has target: null, filled: false and no-throw setters by default', () => {
    const defaultValue = (
      Tier2PortalContext as unknown as {
        _currentValue: {
          target: unknown
          filled: boolean
          setTarget: (el: unknown) => void
          setFilled: (filled: boolean) => void
        }
      }
    )._currentValue

    expect(defaultValue.target).toBeNull()
    expect(defaultValue.filled).toBe(false)
    expect(() => defaultValue.setTarget(null)).not.toThrow()
    expect(() => defaultValue.setFilled(false)).not.toThrow()
  })

  it('exports a Tier2PortalProvider component', () => {
    expect(typeof Tier2PortalProvider).toBe('function')
  })
})

describe('GamesPanel', () => {
  afterEach(() => {
    mockSetTarget.mockClear()
    mockSetFilled.mockClear()
  })

  it('returns an element with className NavShell__tier2Portal', () => {
    const element = GamesPanel() as DivElement
    expect(element.props.className).toBe('NavShell__tier2Portal')
  })

  it("forwards the context's setTarget as the ref callback", () => {
    const element = GamesPanel() as DivElement
    expect(element.props.ref).toBe(mockSetTarget)
  })

  it('renders no children of its own', () => {
    const element = GamesPanel() as DivElement
    expect(element.props.children).toBeUndefined()
  })
})
