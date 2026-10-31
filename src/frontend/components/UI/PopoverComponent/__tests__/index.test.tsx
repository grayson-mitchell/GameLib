/**
 * Tests for PopoverComponent dismissal.
 *
 * There is no DOM test environment (no jsdom) in this project, so the
 * document-level behaviour is tested through the pure bindPopoverDismiss
 * helper with an injected EventTarget.
 */
import { bindPopoverDismiss } from '../index'

jest.mock('../index.scss', () => ({}))

const keydown = (key: string) => Object.assign(new Event('keydown'), { key })

describe('bindPopoverDismiss', () => {
  it('closes with "escape" on the Escape key', () => {
    const doc = new EventTarget()
    const close = jest.fn()
    bindPopoverDismiss(doc, () => true, close)
    doc.dispatchEvent(keydown('Escape'))
    expect(close).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledWith('escape')
  })

  it('ignores other keys', () => {
    const doc = new EventTarget()
    const close = jest.fn()
    bindPopoverDismiss(doc, () => true, close)
    doc.dispatchEvent(keydown('Enter'))
    expect(close).not.toHaveBeenCalled()
  })

  it('closes with "outside" only for clicks outside', () => {
    const doc = new EventTarget()
    const close = jest.fn()
    let inside = false
    bindPopoverDismiss(doc, () => inside, close)
    doc.dispatchEvent(new Event('click'))
    expect(close).toHaveBeenCalledWith('outside')
    close.mockClear()
    inside = true
    doc.dispatchEvent(new Event('click'))
    expect(close).not.toHaveBeenCalled()
  })

  it('stops reacting after unbind', () => {
    const doc = new EventTarget()
    const close = jest.fn()
    const unbind = bindPopoverDismiss(doc, () => false, close)
    unbind()
    doc.dispatchEvent(keydown('Escape'))
    doc.dispatchEvent(new Event('click'))
    expect(close).not.toHaveBeenCalled()
  })
})
