/**
 * Behaviour gate for the keyboard-mode body class (Phase 48 plan 16, gap
 * G-48-12a, review finding WR-02).
 *
 * `installKeyboardNavTracking` sets `body.keyboardNav` on a TRUSTED Tab
 * keydown and clears it on a REAL pointer move or a pointer press. The Library
 * stylesheet scopes its stale-focus suppression off that class, so a card the
 * keyboard focused keeps its ring while the pointer rests over the library.
 *
 * This file runs in the node jest project (no jsdom), so the window and the
 * body are stubs: a target that records and dispatches to the listeners
 * actually registered on it, and a body whose `classList` is Set-backed.
 *
 * What this proves: when the class is set and cleared, that untrusted and
 * non-Tab keys and same-coordinate moves are ignored, that every listener is
 * capture + passive and is removed by the disposer, and that nothing throws.
 * What it does NOT prove: how an engine dispatches events or what the
 * stylesheet paints. That is the desk matrix in
 * `.planning/phases/48-*\/evidence/48-16/` and the live gate in 48-18.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import {
  KEYBOARD_NAV_CLASS,
  installKeyboardNavTracking
} from '../inputModality'

type Handler = (event: Event) => void
interface Registered {
  type: string
  handler: Handler
  capture: boolean
  options: unknown
}

function makeTarget(opts: { throwOnAddCall?: number } = {}) {
  const active: Registered[] = []
  const added: Registered[] = []
  let addCalls = 0
  const captureOf = (options: unknown): boolean =>
    typeof options === 'boolean'
      ? options
      : Boolean((options as { capture?: boolean } | undefined)?.capture)
  return {
    active,
    added,
    addEventListener(type: string, handler: Handler, options?: unknown) {
      addCalls++
      if (opts.throwOnAddCall === addCalls) throw new Error('add failed')
      const r = { type, handler, capture: captureOf(options), options }
      added.push(r)
      active.push(r)
    },
    removeEventListener(type: string, handler: Handler, options?: unknown) {
      const capture = captureOf(options)
      const i = active.findIndex(
        (r) => r.type === type && r.handler === handler && r.capture === capture
      )
      if (i >= 0) active.splice(i, 1)
    },
    fire(type: string, event: Record<string, unknown> = {}) {
      for (const r of [...active])
        if (r.type === type) r.handler(event as unknown as Event)
    }
  }
}

function makeBody() {
  const classes = new Set<string>()
  return {
    classes,
    body: {
      classList: {
        add: (c: string) => void classes.add(c),
        remove: (c: string) => void classes.delete(c)
      }
    }
  }
}

function setup() {
  const target = makeTarget()
  const { body, classes } = makeBody()
  const dispose = installKeyboardNavTracking(target, () => body)
  return { target, classes, dispose }
}

const tab = (extra: Record<string, unknown> = {}) => ({
  key: 'Tab',
  isTrusted: true,
  ...extra
})

describe('installKeyboardNavTracking (G-48-12a)', () => {
  it('exports the class name the stylesheet is built from', () => {
    expect(KEYBOARD_NAV_CLASS).toBe('keyboardNav')
  })

  it('K1: a trusted Tab keydown adds the class', () => {
    const { target, classes } = setup()
    target.fire('keydown', tab())
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(true)
  })

  it('K2: Shift+Tab adds it too', () => {
    const { target, classes } = setup()
    target.fire('keydown', tab({ shiftKey: true }))
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(true)
  })

  it('K3: an untrusted (synthetic, gamepad-driven) Tab keydown does not', () => {
    const { target, classes } = setup()
    target.fire('keydown', tab({ isTrusted: false }))
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(false)
  })

  it('K4: a non-Tab key does not', () => {
    const { target, classes } = setup()
    target.fire('keydown', { key: 'a', isTrusted: true })
    target.fire('keydown', { key: 'Enter', isTrusted: true })
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(false)
  })

  it('K5: a mousemove at different screen coordinates removes it', () => {
    const { target, classes } = setup()
    target.fire('mousemove', { screenX: 10, screenY: 10 })
    target.fire('keydown', tab())
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(true)
    target.fire('mousemove', { screenX: 12, screenY: 10 })
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(false)
  })

  it('K5b: the first recorded move counts as real', () => {
    const { target, classes } = setup()
    target.fire('keydown', tab())
    target.fire('mousemove', { screenX: 10, screenY: 10 })
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(false)
  })

  it('K6: a mousemove at the same screen coordinates (the engine synthetic move after a scroll) keeps it', () => {
    const { target, classes } = setup()
    target.fire('mousemove', { screenX: 10, screenY: 10 })
    target.fire('keydown', tab())
    target.fire('mousemove', { screenX: 10, screenY: 10 })
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(true)
    // only one coordinate matching is still a real move
    target.fire('mousemove', { screenX: 10, screenY: 11 })
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(false)
  })

  it('K7: a pointerdown removes it', () => {
    const { target, classes } = setup()
    target.fire('keydown', tab())
    target.fire('pointerdown', {})
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(false)
  })

  it('K8: the disposer removes every listener it added and a later event changes nothing', () => {
    const { target, classes, dispose } = setup()
    expect(target.added.length).toBe(3)
    expect(target.active.length).toBe(3)
    dispose()
    expect(target.active.length).toBe(0)
    target.fire('keydown', tab())
    expect(classes.has(KEYBOARD_NAV_CLASS)).toBe(false)
  })

  it('K9: totality. A body that is null, or a classList that throws, never throws out of a handler', () => {
    const nullTarget = makeTarget()
    installKeyboardNavTracking(nullTarget, () => null)
    expect(() => {
      nullTarget.fire('keydown', tab())
      nullTarget.fire('mousemove', { screenX: 1, screenY: 1 })
      nullTarget.fire('pointerdown', {})
    }).not.toThrow()

    const throwTarget = makeTarget()
    const throwingBody = {
      classList: {
        add: () => {
          throw new Error('add')
        },
        remove: () => {
          throw new Error('remove')
        }
      }
    }
    installKeyboardNavTracking(throwTarget, () => throwingBody)
    expect(() => {
      throwTarget.fire('keydown', tab())
      throwTarget.fire('mousemove', { screenX: 1, screenY: 1 })
      throwTarget.fire('pointerdown', {})
    }).not.toThrow()

    // a getBody that itself throws
    const getBodyTarget = makeTarget()
    installKeyboardNavTracking(getBodyTarget, () => {
      throw new Error('getBody')
    })
    expect(() => getBodyTarget.fire('keydown', tab())).not.toThrow()

    // a malformed event
    const { target } = setup()
    expect(() => {
      target.fire('keydown', undefined as unknown as Record<string, unknown>)
      target.fire('mousemove', undefined as unknown as Record<string, unknown>)
    }).not.toThrow()
  })

  it('K9b: an addEventListener that throws part way neither throws nor leaves a listener installed', () => {
    const target = makeTarget({ throwOnAddCall: 2 })
    const { body } = makeBody()
    let dispose: (() => void) | undefined
    expect(() => {
      dispose = installKeyboardNavTracking(target, () => body)
    }).not.toThrow()
    expect(target.active.length).toBe(0)
    expect(() => dispose?.()).not.toThrow()
  })

  it('K10: every listener is registered capture: true and passive: true', () => {
    const { target } = setup()
    expect(target.added.map((r) => r.type).sort()).toEqual([
      'keydown',
      'mousemove',
      'pointerdown'
    ])
    for (const r of target.added) {
      expect(r.options).toMatchObject({ capture: true, passive: true })
    }
  })

  it('K11: src/frontend/index.tsx imports installKeyboardNavTracking from ./helpers/inputModality and calls it exactly once', () => {
    const src = stripSourceComments(
      readFileSync(join(__dirname, '..', '..', 'index.tsx'), 'utf8')
    )
    expect(src).toMatch(
      /import\s*\{\s*installKeyboardNavTracking\s*\}\s*from\s*'\.\/helpers\/inputModality'/
    )
    expect(src.match(/installKeyboardNavTracking\(\)/g)).toHaveLength(1)
  })
})
