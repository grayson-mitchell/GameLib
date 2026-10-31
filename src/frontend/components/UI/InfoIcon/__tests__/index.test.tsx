/**
 * Tests for InfoIcon. No DOM environment (no jsdom) exists in this project, so
 * components are called as plain functions and the element trees inspected.
 * Click-to-open and Esc-to-close need a DOM; Esc/outside-click are covered by
 * the bindPopoverDismiss tests in PopoverComponent.
 */
import React from 'react'
import InfoIcon from '../index'
import InfoBox from '../../InfoBox'
import PopoverComponent from '../../PopoverComponent'

jest.mock('../index.css', () => ({}))
jest.mock('../../InfoBox/index.css', () => ({}))
jest.mock('../../PopoverComponent/index.scss', () => ({}), { virtual: true })
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
  type?: string
  title?: string
  'aria-label'?: string
  iconOnly?: boolean
  text?: string
  item?: El
  children?: unknown
}>

describe('InfoIcon', () => {
  it('wraps a single InfoBox iconOnly with the text as its children', () => {
    const el = InfoIcon({ text: 'Some help' }) as El
    expect(el.props.className).toBe('InfoIcon')
    const box = el.props.children as El
    expect(box.type).toBe(InfoBox)
    expect(box.props.iconOnly).toBe(true)
    expect(box.props.text).toBe('infobox.help')
    expect(box.props.children).toBe('Some help')
  })

  it('renders a labelled button trigger with the text in the popover body', () => {
    const box = (InfoIcon({ text: 'Some help' }) as El).props.children as El
    const pop = (InfoBox as unknown as (p: El['props']) => El)(box.props)
    expect(pop.type).toBe(PopoverComponent)
    const button = pop.props.item as El
    expect(button.type).toBe('button')
    expect(button.props.type).toBe('button')
    expect(button.props['aria-label']).toBe('Help')
    const body = pop.props.children as El
    expect(body.props.className).toBe('poppedElement')
    expect(body.props.children).toBe('Some help')
  })

  it('does not carry the help text in a title tooltip', () => {
    const box = (InfoIcon({ text: 'Some help' }) as El).props.children as El
    const pop = (InfoBox as unknown as (p: El['props']) => El)(box.props)
    expect((pop.props.item as El).props.title).toBe('Help')
  })
})
