/**
 * Structural tests for `QuitButton`, the relocated Quit action (34.10-05
 * Task 2). No test file for this component existed before 34.12-03.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `QuitButton` uses `useContext`
 * and `useTranslation` but no `useState`/`useEffect`, so it needs no hooks
 * harness; it is invoked directly, exactly the way `NavItem.test.tsx`
 * invokes `NavItem`.
 */
import type { ReactElement, ReactNode } from 'react'

type MockContextValue = {
  showDialogModal: jest.Mock
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    showDialogModal: jest.fn(),
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

jest.mock('frontend/helpers', () => ({
  handleQuit: jest.fn()
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import QuitButton from '../components/QuitButton'

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

beforeEach(() => {
  contextValue = makeContextValue()
})

describe('QuitButton', () => {
  it('returns a <button> element', () => {
    const element = QuitButton() as AnyElement
    expect(element.type).toBe('button')
  })

  it('carries data-tour="nav-quit"', () => {
    const element = QuitButton() as AnyElement
    expect(element.props['data-tour']).toBe('nav-quit')
  })

  it('carries className "NavItem" -- the anchor lands on the row element, not an inner wrapper', () => {
    const element = QuitButton() as AnyElement
    expect(element.props.className).toBe('NavItem')
  })

  it('invoking onClick calls showDialogModal once with the resolved Quit title', () => {
    const showDialogModal = jest.fn()
    contextValue = makeContextValue({ showDialogModal })

    const element = QuitButton() as AnyElement
    ;(element.props.onClick as () => void)()

    expect(showDialogModal).toHaveBeenCalledTimes(1)
    expect(showDialogModal).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Quit' })
    )
  })
})
