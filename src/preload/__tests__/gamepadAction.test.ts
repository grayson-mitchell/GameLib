/**
 * Tests for `tauriGamepadInput.ts` (Phase 34.1 Plan 05, REQ-34.1-06, D-10).
 *
 * The preload jest project's `testEnvironment` is `'node'` -- `jest-environment-jsdom`
 * is not installed (see `src/frontend/jest.config.js`'s documented constraint, which
 * this file follows rather than adding a new dependency). Node >=15's built-in
 * `EventTarget`/`Event` implement real dispatch/cancel semantics --
 * `dispatchEvent()` returns `false` when a cancelable event was prevented, verified
 * sufficient below -- and `tauriGamepadInput.ts` only ever dispatches directly on a
 * specific target, never relying on tree-walking bubbling. `KeyboardEvent`,
 * `MouseEvent`, `document`, `window`, and `getComputedStyle` are NOT Node globals and
 * are hand-stubbed below with the minimum surface the module actually calls.
 */

class FakeKeyboardEvent extends Event {
  readonly key: string
  readonly code: string
  readonly shiftKey: boolean
  constructor(
    type: string,
    init: {
      key?: string
      code?: string
      shiftKey?: boolean
      bubbles?: boolean
      cancelable?: boolean
    }
  ) {
    super(type, { bubbles: init.bubbles, cancelable: init.cancelable })
    this.key = init.key ?? ''
    this.code = init.code ?? ''
    this.shiftKey = init.shiftKey === true
  }
}

class FakeMouseEvent extends Event {
  readonly button: number
  readonly clientX: number
  readonly clientY: number
  constructor(
    type: string,
    init: {
      button?: number
      clientX?: number
      clientY?: number
      bubbles?: boolean
      cancelable?: boolean
    }
  ) {
    super(type, { bubbles: init.bubbles, cancelable: init.cancelable })
    this.button = init.button ?? 0
    this.clientX = init.clientX ?? 0
    this.clientY = init.clientY ?? 0
  }
}

interface FakeRect {
  top: number
  left: number
  right: number
  bottom: number
  width: number
  height: number
}

class FakeElement extends EventTarget {
  tagName: string
  disabled = false
  scrollHeight = 0
  clientHeight = 0
  scrollTop = 0
  overflowY = 'visible'
  parentElement: FakeElement | null = null
  rect: FakeRect
  private attrs = new Map<string, string>()

  constructor(tagName: string, rect: Partial<FakeRect> = {}) {
    super()
    this.tagName = tagName
    this.rect = { top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20, ...rect }
  }

  getAttribute(name: string): string | null {
    return this.attrs.has(name) ? (this.attrs.get(name) as string) : null
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value)
  }

  getBoundingClientRect(): FakeRect {
    return this.rect
  }

  scrollBy(opts: { top: number }): void {
    this.scrollTop += opts.top
  }

  focus = jest.fn((): void => {
    fakeDocument.activeElement = this
  })

  blur(): void {
    if (fakeDocument.activeElement === this) {
      fakeDocument.activeElement = fakeDocument.body
    }
  }
}

class FakeDocument extends EventTarget {
  activeElement: FakeElement
  body: FakeElement
  documentElement: FakeElement
  scrollingElement: FakeElement | null = null
  querySelectorAll = jest.fn<FakeElement[], [string]>()
  elementFromPoint = jest.fn<FakeElement | null, [number, number]>()

  constructor() {
    super()
    this.body = new FakeElement('body')
    this.activeElement = this.body
    this.documentElement = new FakeElement('html')
  }
}

// Module-scope handle the `FakeElement.focus` field closes over; reassigned fresh in
// `beforeEach` so every test starts from a clean document.
let fakeDocument: FakeDocument = new FakeDocument()
let fakeWindow: { history: { back: jest.Mock }; innerWidth: number; innerHeight: number }

beforeEach(() => {
  fakeDocument = new FakeDocument()
  fakeDocument.querySelectorAll.mockReturnValue([])
  fakeDocument.elementFromPoint.mockReturnValue(null)
  fakeWindow = { history: { back: jest.fn() }, innerWidth: 800, innerHeight: 600 }

  ;(globalThis as unknown as { document: FakeDocument }).document = fakeDocument
  ;(globalThis as unknown as { window: typeof fakeWindow }).window = fakeWindow
  ;(
    globalThis as unknown as {
      getComputedStyle: (el: FakeElement) => { overflowY: string }
    }
  ).getComputedStyle = (el) => ({ overflowY: el.overflowY })
  ;(globalThis as unknown as { KeyboardEvent: typeof FakeKeyboardEvent }).KeyboardEvent =
    FakeKeyboardEvent
  ;(globalThis as unknown as { MouseEvent: typeof FakeMouseEvent }).MouseEvent =
    FakeMouseEvent
})

import { tauriGamepadAction } from '../api/tauriGamepadInput'
import type { GamepadActionArgs } from 'common/types'

describe('tauriGamepadAction (REQ-34.1-06)', () => {
  it('REQ-34.1-06: tab moves focus to the next focusable element and wraps', async () => {
    const el0 = new FakeElement('button')
    const el1 = new FakeElement('button')
    const el2 = new FakeElement('button')
    fakeDocument.querySelectorAll.mockReturnValue([el0, el1, el2])

    fakeDocument.activeElement = el1
    await tauriGamepadAction({ action: 'tab' })
    expect(fakeDocument.activeElement).toBe(el2)

    fakeDocument.activeElement = el2
    await tauriGamepadAction({ action: 'tab' })
    expect(fakeDocument.activeElement).toBe(el0)
  })

  it('REQ-34.1-06: shiftTab moves focus backward and wraps', async () => {
    const el0 = new FakeElement('button')
    const el1 = new FakeElement('button')
    const el2 = new FakeElement('button')
    fakeDocument.querySelectorAll.mockReturnValue([el0, el1, el2])

    fakeDocument.activeElement = el1
    await tauriGamepadAction({ action: 'shiftTab' })
    expect(fakeDocument.activeElement).toBe(el0)

    fakeDocument.activeElement = el0
    await tauriGamepadAction({ action: 'shiftTab' })
    expect(fakeDocument.activeElement).toBe(el2)
  })

  it('REQ-34.1-06: tab with nothing focused focuses the first focusable element', async () => {
    const el0 = new FakeElement('button')
    const el1 = new FakeElement('button')
    fakeDocument.querySelectorAll.mockReturnValue([el0, el1])
    fakeDocument.activeElement = fakeDocument.body

    await tauriGamepadAction({ action: 'tab' })
    expect(fakeDocument.activeElement).toBe(el0)
  })

  it('REQ-34.1-06: disabled and zero-area elements are skipped by the traversal', async () => {
    const visible = new FakeElement('button')
    const disabled = new FakeElement('button')
    disabled.disabled = true
    const zeroArea = new FakeElement('button', { width: 0, height: 0 })
    const hidden = new FakeElement('button')
    hidden.setAttribute('aria-hidden', 'true')
    const next = new FakeElement('button')
    fakeDocument.querySelectorAll.mockReturnValue([
      visible,
      disabled,
      zeroArea,
      hidden,
      next
    ])
    fakeDocument.activeElement = visible

    await tauriGamepadAction({ action: 'tab' })
    expect(fakeDocument.activeElement).toBe(next)
  })

  it('REQ-34.1-06: esc dispatches a keydown with key === "Escape" on the focused element', async () => {
    const el = new FakeElement('div')
    fakeDocument.activeElement = el
    const handler = jest.fn()
    el.addEventListener('keydown', handler)

    await tauriGamepadAction({ action: 'esc' })

    expect(handler).toHaveBeenCalledTimes(1)
    const event = handler.mock.calls[0][0] as FakeKeyboardEvent
    expect(event.key).toBe('Escape')
  })

  it('REQ-34.1-06: back calls history.back()', async () => {
    await tauriGamepadAction({ action: 'back' })
    expect(fakeWindow.history.back).toHaveBeenCalledTimes(1)
  })

  it('REQ-34.1-06: leftClick with metadata dispatches click on the element at that point', async () => {
    const target = new FakeElement('button')
    fakeDocument.elementFromPoint.mockReturnValue(target)
    const clickHandler = jest.fn()
    target.addEventListener('click', clickHandler)

    await tauriGamepadAction({
      action: 'leftClick',
      metadata: { elementTag: 'button', x: 10, y: 20 }
    })

    expect(fakeDocument.elementFromPoint).toHaveBeenCalledWith(10, 20)
    expect(clickHandler).toHaveBeenCalledTimes(1)
    const event = clickHandler.mock.calls[0][0] as FakeMouseEvent
    expect(event.clientX).toBe(10)
    expect(event.clientY).toBe(20)
  })

  it('REQ-34.1-06: leftClick without metadata warns and dispatches nothing', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined)

    await tauriGamepadAction({ action: 'leftClick' } as unknown as GamepadActionArgs)

    expect(warnSpy).toHaveBeenCalled()
    expect(fakeDocument.elementFromPoint).not.toHaveBeenCalled()
  })

  it('REQ-34.1-06: rightClick dispatches contextmenu and never click', async () => {
    const target = new FakeElement('div')
    fakeDocument.elementFromPoint.mockReturnValue(target)
    const clickHandler = jest.fn()
    const contextHandler = jest.fn()
    target.addEventListener('click', clickHandler)
    target.addEventListener('contextmenu', contextHandler)

    await tauriGamepadAction({
      action: 'rightClick',
      metadata: { elementTag: 'div', x: 5, y: 5 }
    })

    expect(contextHandler).toHaveBeenCalledTimes(1)
    expect(clickHandler).not.toHaveBeenCalled()
  })

  it('REQ-34.1-06: rightStickUp decreases scrollTop and rightStickDown increases it', async () => {
    const scrollable = new FakeElement('div')
    scrollable.scrollHeight = 500
    scrollable.clientHeight = 200
    scrollable.overflowY = 'auto'
    scrollable.scrollTop = 100
    fakeDocument.elementFromPoint.mockReturnValue(scrollable)

    await tauriGamepadAction({ action: 'rightStickUp' })
    expect(scrollable.scrollTop).toBe(50)

    scrollable.scrollTop = 100
    await tauriGamepadAction({ action: 'rightStickDown' })
    expect(scrollable.scrollTop).toBe(150)
  })

  it('REQ-34.1-06: an unknown action resolves without throwing', async () => {
    await expect(tauriGamepadAction({ action: 'guide' })).resolves.toBeUndefined()
  })

  it('REQ-34.1-06: tauriGamepadAction never rejects, even when the DOM query throws', async () => {
    fakeDocument.querySelectorAll.mockImplementation(() => {
      throw new Error('boom')
    })

    await expect(tauriGamepadAction({ action: 'tab' })).resolves.toBeUndefined()
  })
})
