/**
 * Structural tests for `FilterFacetGroup` / `FilterFacetRow`, the shared
 * collapsed-group wrapper and checkbox row primitive the Store, Runnability
 * and More-filters groups all reuse (34.11-07 Task 1).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- both are invoked directly as
 * plain functions and their returned React-element object graphs are
 * inspected without a DOM, the same direct-invocation idiom as
 * `CrossoverBadge.test.tsx`. `Dropdown` (a child this file does not own) is
 * mocked wholesale -- following `FilterCollectionList.test.tsx`'s `NavItem`
 * pattern -- rather than mocking its colocated stylesheet and letting the
 * real component render, since Dropdown's own `useState`/gamepad side
 * effect is out of scope here.
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('../components/FilterFacetGroup/index.scss', () => ({}))

jest.mock('../../Dropdown', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-dropdown',
    props
  })
}))

jest.mock('@fortawesome/react-fontawesome', () => ({
  FontAwesomeIcon: (props: Record<string, unknown>) => ({
    type: 'mock-fontawesome-icon',
    props
  })
}))

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import Dropdown from '../../Dropdown'
import FilterFacetGroup, { FilterFacetRow } from '../components/FilterFacetGroup'

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

describe('FilterFacetRow', () => {
  it('renders real checkbox semantics -- role="checkbox" and aria-checked mirrors the checked prop', () => {
    const onToggle = jest.fn()
    const checkedRow = FilterFacetRow({
      label: 'GOG',
      count: 3,
      checked: true,
      onToggle
    }) as AnyElement
    const uncheckedRow = FilterFacetRow({
      label: 'GOG',
      count: 3,
      checked: false,
      onToggle
    }) as AnyElement

    expect(checkedRow.props.role).toBe('checkbox')
    expect(checkedRow.props['aria-checked']).toBe(true)
    expect(uncheckedRow.props['aria-checked']).toBe(false)
  })

  it('clicking the row calls onToggle exactly once with no arguments', () => {
    const onToggle = jest.fn()
    const row = FilterFacetRow({
      label: 'GOG',
      checked: false,
      onToggle
    }) as AnyElement

    ;(row.props.onClick as () => void)()

    expect(onToggle).toHaveBeenCalledTimes(1)
    expect(onToggle.mock.calls[0]).toHaveLength(0)
  })

  it('count=0 and unchecked carries the zero-count modifier; count=0 and checked does not', () => {
    const onToggle = jest.fn()
    const zero = FilterFacetRow({
      label: 'GOG',
      count: 0,
      checked: false,
      onToggle
    }) as AnyElement
    const zeroChecked = FilterFacetRow({
      label: 'GOG',
      count: 0,
      checked: true,
      onToggle
    }) as AnyElement

    expect(zero.props.className).toContain('FilterFacetRow--zero')
    expect(zeroChecked.props.className).not.toContain('FilterFacetRow--zero')
  })

  it('count omitted entirely renders no count element (More-filters rows carry no counts -- D-28)', () => {
    const onToggle = jest.fn()
    const row = FilterFacetRow({
      label: 'GOG',
      checked: false,
      onToggle
    }) as AnyElement
    const children = row.props.children as AnyElement[]
    const countElement = children.find(
      (child) =>
        typeof child === 'object' &&
        child !== null &&
        (child as AnyElement).props?.className === 'FilterFacetRow__count'
    )

    expect(countElement).toBeUndefined()
  })

  it('count=7 renders a count element whose text child is 7', () => {
    const onToggle = jest.fn()
    const row = FilterFacetRow({
      label: 'GOG',
      count: 7,
      checked: false,
      onToggle
    }) as AnyElement
    const children = row.props.children as AnyElement[]
    const countElement = children.find(
      (child) =>
        typeof child === 'object' &&
        child !== null &&
        (child as AnyElement).props?.className === 'FilterFacetRow__count'
    ) as AnyElement

    expect(countElement).toBeDefined()
    expect(countElement.props.children).toBe(7)
  })
})

describe('FilterFacetGroup', () => {
  it('renders a Dropdown whose className includes FilterFacetGroup and whose title contains the passed string', () => {
    const element = FilterFacetGroup({
      title: 'Store',
      children: null
    }) as AnyElement

    expect(element.type).toBe(Dropdown)
    expect(element.props.className).toContain('FilterFacetGroup')

    const titleFragment = element.props.title as ReactElement<{
      children: ReactElement[]
    }>
    const titleSpan = titleFragment.props.children[0] as ReactElement<{
      children: string
    }>

    expect(titleSpan.props.children).toBe('Store')
  })
})
