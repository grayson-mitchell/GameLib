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
  ;(globalThis as unknown as { KeyboardEvent: typeof FakeKeyboardEvent }).KeyboardEvent = FakeKeyboardEvent
  ;(globalThis as unknown as { MouseEvent: typeof FakeMouseEvent }).MouseEvent = FakeMouseEvent
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
    fakeDocument.querySelectorAll.mockReturnValue([visible, disabled, zeroArea, hidden, next])
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

describe('tauriGamepadAction directional focus movement (REQ-34.1-06)', () => {
  it('REQ-34.1-06: from the top-left cell, padRight focuses top-right and padDown focuses bottom-left', async () => {
    const topLeft = new FakeElement('button', { top: 0, left: 0, right: 100, bottom: 50 })
    const topRight = new FakeElement('button', { top: 0, left: 100, right: 200, bottom: 50 })
    const bottomLeft = new FakeElement('button', {
      top: 50,
      left: 0,
      right: 100,
      bottom: 100
    })
    const bottomRight = new FakeElement('button', {
      top: 50,
      left: 100,
      right: 200,
      bottom: 100
    })
    fakeDocument.querySelectorAll.mockReturnValue([topLeft, topRight, bottomLeft, bottomRight])

    fakeDocument.activeElement = topLeft
    await tauriGamepadAction({ action: 'padRight' })
    expect(fakeDocument.activeElement).toBe(topRight)

    fakeDocument.activeElement = topLeft
    await tauriGamepadAction({ action: 'padDown' })
    expect(fakeDocument.activeElement).toBe(bottomLeft)
  })

  it('REQ-34.1-06: padLeft from the leftmost cell leaves focus unchanged (no wrap)', async () => {
    const topLeft = new FakeElement('button', { top: 0, left: 0, right: 100, bottom: 50 })
    const topRight = new FakeElement('button', { top: 0, left: 100, right: 200, bottom: 50 })
    fakeDocument.querySelectorAll.mockReturnValue([topLeft, topRight])
    fakeDocument.activeElement = topLeft

    await tauriGamepadAction({ action: 'padLeft' })
    expect(fakeDocument.activeElement).toBe(topLeft)
  })

  it('REQ-34.1-06: leftStickUp and padUp produce identical results (eight actions collapse to four directions)', async () => {
    const bottom = new FakeElement('button', { top: 100, left: 0, right: 100, bottom: 150 })
    const top = new FakeElement('button', { top: 0, left: 0, right: 100, bottom: 50 })
    fakeDocument.querySelectorAll.mockReturnValue([bottom, top])

    fakeDocument.activeElement = bottom
    await tauriGamepadAction({ action: 'padUp' })
    expect(fakeDocument.activeElement).toBe(top)

    fakeDocument.activeElement = bottom
    await tauriGamepadAction({ action: 'leftStickUp' })
    expect(fakeDocument.activeElement).toBe(top)
  })

  it('REQ-34.1-06: perpendicular weighting is honoured -- the aligned-but-farther candidate wins over the nearer-but-offset one', async () => {
    // origin bottom edge at y=50, centre x=50.
    // "offset": primary (vertical gap) = 10, secondary (centre-x offset) = 40 ->
    //   score = 10 + 2*40 = 90.
    // "aligned": primary = 60, secondary = 0 -> score = 60 + 2*0 = 60. Aligned wins.
    // With the perpendicular weight dropped to 1x this reverses (offset score 50 <
    // aligned score 60) -- this is the case that actually distinguishes the weighting,
    // spot-checked manually against the `2 *` in `directionScore`.
    const origin = new FakeElement('button', { top: 0, left: 0, right: 100, bottom: 50 })
    const offset = new FakeElement('button', {
      top: 60,
      left: 40,
      right: 140,
      bottom: 110
    })
    const aligned = new FakeElement('button', {
      top: 110,
      left: 0,
      right: 100,
      bottom: 160
    })
    fakeDocument.querySelectorAll.mockReturnValue([origin, offset, aligned])
    fakeDocument.activeElement = origin

    await tauriGamepadAction({ action: 'padDown' })
    expect(fakeDocument.activeElement).toBe(aligned)
  })

  it('REQ-34.1-06: with nothing focused, a directional press focuses the top-left-most candidate', async () => {
    const topLeft = new FakeElement('button', { top: 0, left: 0, right: 100, bottom: 50 })
    const bottomRight = new FakeElement('button', {
      top: 50,
      left: 100,
      right: 200,
      bottom: 100
    })
    fakeDocument.querySelectorAll.mockReturnValue([topLeft, bottomRight])
    fakeDocument.activeElement = fakeDocument.body

    await tauriGamepadAction({ action: 'padRight' })
    expect(fakeDocument.activeElement).toBe(topLeft)
  })

  it('REQ-34.1-06: focus does not move when the dispatched arrow keydown is preventDefault()ed', async () => {
    const origin = new FakeElement('button', { top: 0, left: 0, right: 100, bottom: 50 })
    const right = new FakeElement('button', { top: 0, left: 100, right: 200, bottom: 50 })
    fakeDocument.querySelectorAll.mockReturnValue([origin, right])
    fakeDocument.activeElement = origin
    origin.addEventListener('keydown', (event) => event.preventDefault())

    await tauriGamepadAction({ action: 'padRight' })
    expect(fakeDocument.activeElement).toBe(origin)
  })

  // ── WR-02 (Phase 34.1 code review): doTab's preventDefault + stale-list bugs ──

  it('REQ-34.1-06/WR-02: tab does NOT move focus when the app preventDefault()s the Tab keydown', async () => {
    const el0 = new FakeElement('button')
    const el1 = new FakeElement('button')
    fakeDocument.querySelectorAll.mockReturnValue([el0, el1])
    fakeDocument.activeElement = el0
    // A modal focus trap / custom focus manager handling Tab itself. Before this fix
    // `doTab` discarded `dispatchKey`'s return value, so focus moved TWICE -- once by
    // the app, once by this function.
    el0.addEventListener('keydown', (event) => event.preventDefault())

    await tauriGamepadAction({ action: 'tab' })
    expect(fakeDocument.activeElement).toBe(el0)
  })

  it('REQ-34.1-06/WR-02: shiftTab also honours preventDefault()', async () => {
    const el0 = new FakeElement('button')
    const el1 = new FakeElement('button')
    fakeDocument.querySelectorAll.mockReturnValue([el0, el1])
    fakeDocument.activeElement = el1
    el1.addEventListener('keydown', (event) => event.preventDefault())

    await tauriGamepadAction({ action: 'shiftTab' })
    expect(fakeDocument.activeElement).toBe(el1)
  })

  it('REQ-34.1-06/WR-02: the focusable list is recomputed AFTER the Tab dispatch, so a DOM change made by the app handler is honoured', async () => {
    const el0 = new FakeElement('button')
    const stale = new FakeElement('button')
    const fresh = new FakeElement('button')

    // Before the dispatch the document contains [el0, stale]; the app's own (non-
    // preventing) Tab handler swaps `stale` out for `fresh` -- e.g. closing a dialog.
    // A pre-dispatch snapshot would focus the detached `stale` element.
    fakeDocument.querySelectorAll.mockReturnValue([el0, stale])
    fakeDocument.activeElement = el0
    el0.addEventListener('keydown', () => {
      fakeDocument.querySelectorAll.mockReturnValue([el0, fresh])
    })

    await tauriGamepadAction({ action: 'tab' })
    expect(fakeDocument.activeElement).toBe(fresh)
    expect(stale.focus).not.toHaveBeenCalled()
  })

  // ── WR-03 (Phase 34.1 code review): Up/Left were dead with nothing focused ──

  it('REQ-34.1-06/WR-03: padUp with nothing focused focuses the BOTTOM-most element (was a permanent no-op)', async () => {
    const top = new FakeElement('button', { top: 0, left: 350, right: 450, bottom: 50 })
    const bottom = new FakeElement('button', {
      top: 500,
      left: 350,
      right: 450,
      bottom: 550
    })
    fakeDocument.querySelectorAll.mockReturnValue([top, bottom])
    fakeDocument.activeElement = fakeDocument.body

    await tauriGamepadAction({ action: 'padUp' })
    expect(fakeDocument.activeElement).toBe(bottom)
  })

  it('REQ-34.1-06/WR-03: padLeft with nothing focused focuses the RIGHT-most element (was a permanent no-op)', async () => {
    const left = new FakeElement('button', { top: 250, left: 0, right: 100, bottom: 300 })
    const right = new FakeElement('button', {
      top: 250,
      left: 600,
      right: 700,
      bottom: 300
    })
    fakeDocument.querySelectorAll.mockReturnValue([left, right])
    fakeDocument.activeElement = fakeDocument.body

    await tauriGamepadAction({ action: 'padLeft' })
    expect(fakeDocument.activeElement).toBe(right)
  })

  it('REQ-34.1-06/WR-03: leftStickUp/leftStickLeft with nothing focused are live too, matching their pad equivalents', async () => {
    const top = new FakeElement('button', { top: 0, left: 350, right: 450, bottom: 50 })
    const bottom = new FakeElement('button', {
      top: 500,
      left: 350,
      right: 450,
      bottom: 550
    })
    fakeDocument.querySelectorAll.mockReturnValue([top, bottom])

    fakeDocument.activeElement = fakeDocument.body
    await tauriGamepadAction({ action: 'leftStickUp' })
    expect(fakeDocument.activeElement).toBe(bottom)

    fakeDocument.activeElement = fakeDocument.body
    await tauriGamepadAction({ action: 'leftStickLeft' })
    expect(fakeDocument.activeElement).toBe(bottom)
  })

  it('REQ-34.1-06/WR-03: Down/Right with nothing focused still pick the top/left-most element (unchanged behaviour)', async () => {
    const topLeft = new FakeElement('button', { top: 0, left: 0, right: 100, bottom: 50 })
    const bottomRight = new FakeElement('button', {
      top: 500,
      left: 600,
      right: 700,
      bottom: 550
    })
    fakeDocument.querySelectorAll.mockReturnValue([topLeft, bottomRight])

    fakeDocument.activeElement = fakeDocument.body
    await tauriGamepadAction({ action: 'padDown' })
    expect(fakeDocument.activeElement).toBe(topLeft)

    fakeDocument.activeElement = fakeDocument.body
    await tauriGamepadAction({ action: 'padRight' })
    expect(fakeDocument.activeElement).toBe(topLeft)
  })
})
