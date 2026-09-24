/**
 * Behavioural unit spec for `cardVisibility.ts` (quick task 260924-swb).
 *
 * This module is the fix for the one-shot `visible-cards` broadcast handshake
 * documented in
 * `.planning/todos/pending/2026-09-23-library-card-art-never-recovers-from-a-missed-visible-cards-event.md`:
 * a card that missed its one chance at the old broadcast was blank FOREVER.
 * `observeCardVisibility` instead lets each card observe its OWN node behind
 * one shared singleton `IntersectionObserver`, so a card that mounts late (or
 * remounts) still gets announced.
 *
 * What this file DOES prove: every behaviour of the pure `cardVisibility.ts`
 * module below, using a hand-rolled fake `IntersectionObserver` (there is no
 * jsdom in this project -- see `src/frontend/jest.config.js`'s header
 * comment -- so no REAL browser `IntersectionObserver` exists here either).
 *
 * What this file does NOT and CANNOT prove: that `GameCard` actually renders
 * its artwork on a real page. No component is mounted anywhere in this file --
 * `GameCard/index.tsx` imports `./index.css`, which has no jest transformer,
 * so it cannot even be `require()`d here. Task 2's wiring into `GameCard` and
 * `GamesList` is covered ONLY by comment-stripped source gates (the second
 * `describe` block below, appended by Task 2), which prove the wiring is
 * TEXTUALLY present -- not that it runs, not that art loads. That proof is
 * owed to a live run on the operator's machine, the same way the defect was
 * originally reproduced.
 *
 * Module-singleton isolation: `cardVisibility.ts` memoises its
 * `IntersectionObserver` in module scope by design (that singleton is one of
 * the behaviours under test). Each test therefore loads a FRESH copy of the
 * module via `jest.isolateModules`, so no test can see another test's
 * singleton -- state leaking between tests here would make the suite lie
 * about the very thing (`calls === 1`) it exists to prove.
 */

type Entry = { target: Element; intersectionRatio: number }

class FakeIntersectionObserver {
  static calls = 0
  static instances: FakeIntersectionObserver[] = []

  callback: (entries: Entry[], observer: FakeIntersectionObserver) => void
  options: unknown
  observed: Element[] = []
  unobserved: Element[] = []
  disconnected = false

  constructor(
    callback: (entries: Entry[], observer: FakeIntersectionObserver) => void,
    options?: unknown
  ) {
    this.callback = callback
    this.options = options
    FakeIntersectionObserver.calls++
    FakeIntersectionObserver.instances.push(this)
  }

  observe(node: Element) {
    this.observed.push(node)
  }

  unobserve(node: Element) {
    this.unobserved.push(node)
  }

  disconnect() {
    this.disconnected = true
  }

  trigger(entries: Entry[]) {
    this.callback(entries, this)
  }
}

function loadModule(): typeof import('../cardVisibility') {
  let mod!: typeof import('../cardVisibility')
  jest.isolateModules(() => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    mod = require('../cardVisibility')
  })
  return mod
}

describe('observeCardVisibility', () => {
  beforeEach(() => {
    FakeIntersectionObserver.calls = 0
    FakeIntersectionObserver.instances = []
    ;(
      globalThis as unknown as { IntersectionObserver: unknown }
    ).IntersectionObserver = FakeIntersectionObserver
  })

  it('creates the observer with EXACTLY rootMargin 500px and threshold 0 -- the values current preload behaviour is tuned to', () => {
    const { observeCardVisibility } = loadModule()
    observeCardVisibility({} as Element, () => {})

    expect(FakeIntersectionObserver.calls).toBe(1)
    expect(FakeIntersectionObserver.instances[0].options).toEqual({
      rootMargin: '500px',
      threshold: 0
    })
  })

  it('observing two different nodes creates only ONE IntersectionObserver -- the singleton property', () => {
    const { observeCardVisibility } = loadModule()
    observeCardVisibility({} as Element, () => {})
    observeCardVisibility({} as Element, () => {})

    expect(FakeIntersectionObserver.calls).toBe(1)
  })

  it('calls observe with the node passed in', () => {
    const { observeCardVisibility } = loadModule()
    const node = {} as Element
    observeCardVisibility(node, () => {})

    expect(FakeIntersectionObserver.instances[0].observed).toContain(node)
  })

  it('an entry with intersectionRatio > 0 fires that node onVisible exactly once AND unobserves it', () => {
    const { observeCardVisibility } = loadModule()
    const node = {} as Element
    const onVisible = jest.fn()
    observeCardVisibility(node, onVisible)
    const instance = FakeIntersectionObserver.instances[0]

    instance.trigger([{ target: node, intersectionRatio: 1 }])

    expect(onVisible).toHaveBeenCalledTimes(1)
    expect(instance.unobserved).toContain(node)
  })

  it('an entry with intersectionRatio === 0 fires nothing and does not unobserve', () => {
    const { observeCardVisibility } = loadModule()
    const node = {} as Element
    const onVisible = jest.fn()
    observeCardVisibility(node, onVisible)
    const instance = FakeIntersectionObserver.instances[0]

    instance.trigger([{ target: node, intersectionRatio: 0 }])

    expect(onVisible).not.toHaveBeenCalled()
    expect(instance.unobserved).not.toContain(node)
  })

  it('an intersecting entry for node A does NOT fire node B callback', () => {
    const { observeCardVisibility } = loadModule()
    const nodeA = {} as Element
    const nodeB = {} as Element
    const onVisibleA = jest.fn()
    const onVisibleB = jest.fn()
    observeCardVisibility(nodeA, onVisibleA)
    observeCardVisibility(nodeB, onVisibleB)
    const instance = FakeIntersectionObserver.instances[0]

    instance.trigger([{ target: nodeA, intersectionRatio: 1 }])

    expect(onVisibleA).toHaveBeenCalledTimes(1)
    expect(onVisibleB).not.toHaveBeenCalled()
  })

  it('calling the returned unsubscribe BEFORE intersection calls unobserve, and a subsequent intersection fires nothing', () => {
    const { observeCardVisibility } = loadModule()
    const node = {} as Element
    const onVisible = jest.fn()
    const unsubscribe = observeCardVisibility(node, onVisible)
    const instance = FakeIntersectionObserver.instances[0]

    unsubscribe()
    expect(instance.unobserved).toContain(node)

    instance.trigger([{ target: node, intersectionRatio: 1 }])
    expect(onVisible).not.toHaveBeenCalled()
  })

  it('after a node has been announced, driving the callback a second time for the same node does not fire again', () => {
    const { observeCardVisibility } = loadModule()
    const node = {} as Element
    const onVisible = jest.fn()
    observeCardVisibility(node, onVisible)
    const instance = FakeIntersectionObserver.instances[0]

    instance.trigger([{ target: node, intersectionRatio: 1 }])
    instance.trigger([{ target: node, intersectionRatio: 1 }])

    expect(onVisible).toHaveBeenCalledTimes(1)
  })
})

describe('observeCardVisibility fallback -- no IntersectionObserver available', () => {
  it('fails OPEN: calls onVisible synchronously and returns a no-op unsubscribe, so a card that cannot be observed shows its art rather than staying blank forever', () => {
    delete (globalThis as unknown as { IntersectionObserver?: unknown })
      .IntersectionObserver

    const { observeCardVisibility } = loadModule()
    const onVisible = jest.fn()
    const unsubscribe = observeCardVisibility({} as Element, onVisible)

    expect(onVisible).toHaveBeenCalledTimes(1)
    expect(() => unsubscribe()).not.toThrow()
  })
})
