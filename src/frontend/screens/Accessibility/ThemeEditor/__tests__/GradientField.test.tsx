/**
 * @jest-environment jsdom
 */
import 'frontend/testUtils/jsdomNoticeEnv'

import i18next from 'i18next'
import { initReactI18next } from 'react-i18next'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { GradientField } from '../GradientField'

void i18next.use(initReactI18next).init({
  lng: 'en',
  resources: {},
  initImmediate: false,
  interpolation: { escapeValue: false }
})

const GOOD = 'linear-gradient(90deg, #000, #333)'
const ERROR =
  'Enter a plain CSS gradient, for example linear-gradient(90deg, #000, #333). var() and url() aren’t allowed.'
const yes = () => true
const no = () => false
// CR-01 (64-REVIEW): attacker.example is a reserved name; jsdom fetches nothing.
const LAYERED_IMAGE_SET =
  'linear-gradient(red, blue), image-set("https://attacker.example/p.png" 1x)'

afterEach(cleanup)

const setup = (
  value: string,
  supports: (p: string, v: string) => boolean = yes,
  allowEmpty = false
) => {
  const onCommit = jest.fn()
  const utils = render(
    <GradientField
      id="gradient-test"
      label="Gradient"
      value={value}
      onCommit={onCommit}
      supports={supports}
      allowEmpty={allowEmpty}
    />
  )
  const field = screen.getByRole<HTMLTextAreaElement>('textbox')
  const strip = () =>
    utils.container.querySelector('.gradientField__strip') as HTMLElement
  const type = (text: string) =>
    fireEvent.input(field, { target: { value: text } })
  return { onCommit, field, strip, type, ...utils }
}

describe('GradientField', () => {
  it('is a two-row textarea with no picker', () => {
    const { field, container } = setup('')
    expect(field.tagName).toBe('TEXTAREA')
    expect(field.rows).toBe(2)
    expect(container.querySelector('input')).toBeNull()
  })

  it('accepts a gradient the engine supports and commits it on blur', () => {
    const { field, onCommit, type } = setup('')
    type(GOOD)
    expect(screen.queryByText(ERROR)).toBeNull()
    fireEvent.blur(field)
    expect(onCommit).toHaveBeenCalledWith(GOOD)
  })

  it('shows the gradient error and commits nothing when supports says no', () => {
    const { field, onCommit, type } = setup('', no)
    type(GOOD)
    expect(screen.getByText(ERROR)).toBeTruthy()
    fireEvent.blur(field)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it.each([
    ['var()', 'linear-gradient(90deg, var(--x), #333)'],
    ['url()', 'url(https://x)'],
    ['a semicolon', 'linear-gradient(90deg, #000, #333); color: red'],
    ['url() inside a gradient', 'linear-gradient(url(https://x), #333)']
  ])('rejects %s even when supports returns true', (_name, text) => {
    const { field, onCommit, type } = setup(GOOD)
    type(text)
    expect(screen.getByText(ERROR)).toBeTruthy()
    fireEvent.blur(field)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('restores the last good value on blur after invalid text', () => {
    const { field, type } = setup(GOOD)
    type('linear-gradient(90deg, var(--x), #333)')
    fireEvent.blur(field)
    expect(field.value).toBe(GOOD)
    expect(screen.queryByText(ERROR)).toBeNull()
  })

  it('does not commit an unchanged value on blur', () => {
    const { field, onCommit } = setup(GOOD)
    fireEvent.blur(field)
    expect(onCommit).not.toHaveBeenCalled()
  })

  it('paints the 24px strip only from the last valid gradient', () => {
    const { strip, type } = setup(GOOD)
    expect(strip().dataset.gradient).toContain('linear-gradient')
    type('url(https://x)')
    expect(strip().dataset.gradient).not.toContain('url(')
    expect(strip().dataset.gradient).toContain('linear-gradient(90deg')
    const next = 'linear-gradient(0deg, #111, #222)'
    type(next)
    expect(strip().dataset.gradient).toContain('linear-gradient(0deg')
  })

  it('never paints an untrusted stored value the engine does not accept', () => {
    const { strip } = setup('url(https://x)')
    expect(strip().dataset.gradient).toBe('')
    expect(strip().style.backgroundImage).toBe('')
  })

  it('CR-01: never paints or commits a typed layered image-set payload', () => {
    const { field, onCommit, strip, type } = setup(GOOD)
    type(LAYERED_IMAGE_SET)
    expect(screen.getByText(ERROR)).toBeTruthy()
    expect(strip().dataset.gradient).toContain('linear-gradient(90deg')
    expect(strip().dataset.gradient).not.toContain('image-set')
    fireEvent.blur(field)
    expect(onCommit).not.toHaveBeenCalled()
    expect(field.value).toBe(GOOD)
  })

  it('CR-01: never paints a stored layered image-set payload', () => {
    const { strip } = setup(LAYERED_IMAGE_SET)
    expect(strip().dataset.gradient).toBe('')
    expect(strip().style.backgroundImage).toBe('')
  })

  it('lets a derived token be cleared when empty is allowed', () => {
    const { field, onCommit, type } = setup(GOOD, yes, true)
    type('')
    expect(screen.queryByText(ERROR)).toBeNull()
    fireEvent.blur(field)
    expect(onCommit).toHaveBeenCalledWith('')
  })

  it('treats empty text as invalid when empty is not allowed', () => {
    const { field, onCommit, type } = setup(GOOD)
    type('')
    expect(screen.getByText(ERROR)).toBeTruthy()
    fireEvent.blur(field)
    expect(onCommit).not.toHaveBeenCalled()
  })
})
