/**
 * RegionPicker is hookless, so it is called as a plain function and the
 * returned element graph is walked without a DOM (no jsdom in this project,
 * see src/frontend/jest.config.js).
 */
import type { ReactElement, ReactNode } from 'react'
import { MenuItem, Select } from '@mui/material'

import RegionPicker from '..'

type Props = Parameters<typeof RegionPicker>[0]
type AnyElement = ReactElement<Record<string, unknown>>

const options = [
  { countryCode: 'DE', label: 'Germany', currencyCode: 'EUR' },
  { countryCode: 'AU', label: 'Australia', currencyCode: 'AUD' },
  { countryCode: 'US', label: 'United States' }
]

function build(overrides: Partial<Props> = {}): AnyElement {
  return RegionPicker({
    id: 'picker',
    label: 'Store region',
    value: null,
    autoLabel: 'Auto (United States)',
    options,
    onChange: () => undefined,
    locale: 'en',
    ...overrides
  }) as unknown as AnyElement
}

function elements(node: ReactNode, out: AnyElement[] = []): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => elements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const el = node as AnyElement
    out.push(el)
    elements(el.props.children as ReactNode, out)
  }
  return out
}

const select = (root: AnyElement): AnyElement =>
  elements(root).find((e) => e.type === Select)!
const menuItems = (root: AnyElement): AnyElement[] =>
  elements(select(root).props.children as ReactNode).filter(
    (e) => e.type === MenuItem
  )
const renderValue = (root: AnyElement, v: string): ReactNode =>
  (select(root).props.renderValue as (v: string) => ReactNode)(v)

describe('RegionPicker', () => {
  it('renders a regionPicker root (plus className) with a label bound to the id', () => {
    const root = build({ className: 'extra' })
    expect(root.props.className).toBe('regionPicker extra')
    const label = elements(root).find((e) => e.type === 'label')!
    expect(label.props.htmlFor).toBe('picker')
    expect(label.props.className).toBe('regionPicker__label')
    expect(build().props.className).toBe('regionPicker')
  })

  it('puts the Auto entry first, then the options sorted by label for the locale', () => {
    const items = menuItems(build())
    expect(items.map((i) => i.props.value)).toEqual(['', 'AU', 'DE', 'US'])
    expect(items[0]!.props.children).toBe('Auto (United States)')
  })

  it('renders a currency pill only for options that carry a currencyCode', () => {
    const items = menuItems(build())
    const pill = (code: string) =>
      elements(
        items.find((i) => i.props.value === code)!.props.children as ReactNode
      )
        .filter((e) => e.type === 'span')
        .map((e) => e.props.className)
    expect(pill('DE')).toEqual(['regionPicker__currency'])
    expect(pill('US')).toEqual([])
  })

  it('renderValue shows autoLabel for Auto and the label (+ currency when present) for a code', () => {
    const root = build()
    expect(renderValue(root, '')).toBe('Auto (United States)')
    expect(renderValue(root, 'US')).toBe('United States')
    expect(renderValue(root, 'DE')).toBe('Germany · EUR')
  })

  it("maps the Select's '' to null and a code to itself", () => {
    const onChange = jest.fn()
    const root = build({ onChange })
    const change = select(root).props.onChange as (e: {
      target: { value: string }
    }) => void
    change({ target: { value: '' } })
    change({ target: { value: 'DE' } })
    expect(onChange.mock.calls).toEqual([[null], ['DE']])
  })

  it('shows Auto when no value is chosen and the code when one is', () => {
    expect(select(build()).props.value).toBe('')
    expect(select(build({ value: 'DE' })).props.value).toBe('DE')
  })
})
