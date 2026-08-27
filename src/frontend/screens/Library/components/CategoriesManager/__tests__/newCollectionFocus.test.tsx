/**
 * WR-08: direct-invocation proof that the create intent ('+ New collection')
 * lands the caret in the new-category input, and that the manage intent
 * ('Manage collections') does not.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `CategoriesManager` is invoked
 * directly as a plain function, following the `FilterCollectionList.test.tsx`
 * / `dropdownDisclosure.test.tsx` no-DOM idiom. `tsconfig.json`'s
 * `jsx: "react-jsx"` automatic runtime means JSX element creation goes
 * through `react/jsx-runtime`, not the mocked `react` module -- an element's
 * `type` is a plain reference to whatever the mocked import resolved to;
 * child components are never invoked, only their descriptor objects are
 * walked. `CategoriesManager` itself makes exactly one `useState` call
 * (`newCategoryName`); `CategoryItem`'s three `useState` calls never run
 * because `categories.map(...)` here is always empty (`listCategories()`
 * returns `[]`), so those elements are constructed, never invoked.
 */
import type { ReactNode } from 'react'

jest.mock('../index.css', () => ({}))

jest.mock('frontend/components/UI/Dialog', () => ({
  Dialog: (props: Record<string, unknown>) => ({
    type: 'mock-dialog',
    props
  }),
  DialogHeader: (props: Record<string, unknown>) => ({
    type: 'mock-dialog-header',
    props
  })
}))

jest.mock('@mui/material', () => ({
  DialogContent: (props: Record<string, unknown>) => ({
    type: 'mock-dialog-content',
    props
  })
}))

jest.mock('frontend/components/UI', () => ({
  TextInputField: (props: Record<string, unknown>) => ({
    type: 'mock-text-input-field',
    props
  })
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

jest.mock('@fortawesome/free-solid-svg-icons', () => ({
  faAdd: 'faAdd',
  faCancel: 'faCancel',
  faCheck: 'faCheck',
  faPencil: 'faPencil',
  faTrash: 'faTrash'
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

type MockContextValue = {
  customCategories: { listCategories: jest.Mock }
  setShowCategories: jest.Mock
  categoriesManagerIntent: 'manage' | 'create'
}

function makeContextValue(
  overrides: Partial<MockContextValue> = {}
): MockContextValue {
  return {
    customCategories: { listCategories: jest.fn(() => []) },
    setShowCategories: jest.fn(),
    categoriesManagerIntent: 'manage',
    ...overrides
  }
}

let contextValue: MockContextValue = makeContextValue()

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useContext: () => contextValue,
  // CategoriesManager makes exactly one useState call (`newCategoryName`) --
  // a fixed ['', jest.fn()] pair is sufficient since no test here needs to
  // observe a state transition, only the intent-driven `autoFocus` prop.
  useState: (initial: unknown) => [initial, jest.fn()]
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import CategoriesManager from '../index'

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = { type: unknown; props: AnyProps }

function collectElements(node: unknown, out: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child, out))
    return out
  }
  if (typeof node === 'object' && node !== null && 'type' in node) {
    const element = node as AnyElement
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function newCategoryNameField(tree: unknown): AnyElement | undefined {
  return collectElements(tree).find(
    (el) => el.props.htmlId === 'new-category-name'
  )
}

beforeEach(() => {
  contextValue = makeContextValue()
})

describe("CategoriesManager's new-category input autoFocus (WR-08)", () => {
  it("categoriesManagerIntent === 'create' -> the new-category-name field has autoFocus === true", () => {
    contextValue = makeContextValue({ categoriesManagerIntent: 'create' })

    const tree = CategoriesManager()
    const field = newCategoryNameField(tree)

    expect(field).toBeDefined()
    expect(field?.props.autoFocus).toBe(true)
  })

  it("categoriesManagerIntent === 'manage' -> the new-category-name field has autoFocus === false", () => {
    contextValue = makeContextValue({ categoriesManagerIntent: 'manage' })

    const tree = CategoriesManager()
    const field = newCategoryNameField(tree)

    expect(field).toBeDefined()
    expect(field?.props.autoFocus).toBe(false)
  })
})
