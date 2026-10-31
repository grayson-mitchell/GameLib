/**
 * Tests for FieldLabel and the InfoBox iconOnly trigger.
 *
 * There is no DOM test environment (no jsdom) in this project, so the
 * components are called as plain functions and the returned React element
 * trees are inspected directly (type, props, children).
 */
import React, { Children } from 'react'
import FieldLabel from '../index'
import InfoBox from '../../InfoBox'

jest.mock('../index.css', () => ({}))
jest.mock('../../InfoBox/index.css', () => ({}))
jest.mock('../../PopoverComponent/index.scss', () => ({}), { virtual: true })
jest.mock('../../PopoverComponent', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('@mui/icons-material/Info', () => ({
  __esModule: true,
  default: () => null
}))
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => (k === 'infobox.help' ? 'Help' : k)
  })
}))

type El = React.ReactElement<{
  className?: string
  htmlFor?: string
  type?: string
  'aria-label'?: string
  item?: El
  children?: unknown
}>

describe('FieldLabel', () => {
  it('without help returns a bare label with no wrapper', () => {
    const el = FieldLabel({ htmlId: 'x', label: 'Name' }) as El
    expect(el.type).toBe('label')
    expect(el.props.htmlFor).toBe('x')
    expect(el.props.children).toBe('Name')
  })

  it('with help returns a row where help is a sibling of the label', () => {
    const help = <span>help</span>
    const el = FieldLabel({ htmlId: 'x', label: 'Name', help }) as El
    expect(el.type).toBe('div')
    expect(el.props.className).toBe('fieldLabelRow')
    const [label, second] = el.props.children as [El, unknown]
    expect(label.type).toBe('label')
    expect(label.props.htmlFor).toBe('x')
    expect(label.props.children).toBe('Name')
    expect(second).toBe(help)
  })
})

describe('InfoBox iconOnly', () => {
  it('renders a button trigger with an aria-label and no text span', () => {
    const el = InfoBox({
      text: 'infobox.help',
      iconOnly: true,
      children: 'x'
    }) as El
    const item = el.props.item as El
    expect(item.type).toBe('button')
    expect(item.props.type).toBe('button')
    expect(item.props['aria-label']).toBe('Help')
    expect(Children.count(item.props.children)).toBe(1)
  })

  it('without iconOnly still renders span.helpLink with the text span', () => {
    const el = InfoBox({ text: 'infobox.help', children: 'x' }) as El
    const item = el.props.item as El
    expect(item.type).toBe('span')
    expect(item.props.className).toBe('helpLink')
    expect(Children.count(item.props.children)).toBe(2)
  })
})
