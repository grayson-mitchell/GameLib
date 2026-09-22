/**
 * Deterministic reproduction + regression guard for the
 * "library-search-typing-lag" debug session (typing needs repeated
 * attempts before the Library grid filters usably).
 *
 * No jsdom / jest-environment-jsdom / react-test-renderer is installed in
 * this project (see src/frontend/jest.config.js docstring) — confirmed
 * absent from node_modules during this investigation, not merely assumed.
 * A literal RTL-over-jsdom reproduction driving real native `input` events
 * cannot be built without adding a new npm dependency, which is outside the
 * executor auto-fix carve-out and needs a human package-legitimacy
 * checkpoint. See .planning/debug/resolved/library-search-typing-lag.md's
 * Evidence log for this finding recorded as a first-class result, not
 * folded into "component behaves correctly".
 *
 * This harness instead invokes the REAL, unmodified `SearchBar` (imported
 * from `../index`, not reimplemented) with hand-rolled `useRef` /
 * `useEffect` / `useLayoutEffect` / `useCallback` shims that reproduce
 * React's own documented contract: render+commit is synchronous, but
 * *passive* `useEffect` callbacks are deferred to a later task
 * (`flushEffects` below awaits a macrotask before running queued passive
 * effects), while *layout* `useLayoutEffect` callbacks run synchronously,
 * as part of the same commit (`runLayoutEffectsSync`, called with no
 * `await` from `render()`). This lets the test drive a precise
 * interleaving — a native DOM mutation + event dispatch landing in the gap
 * between a render committing and that render's *passive* effects flushing
 * — without needing a real DOM.
 *
 * This is a substitute for, not equivalent to, an in-browser/jsdom
 * measurement: it proves the mechanism is real and deterministic given
 * that interleaving, but does not prove that interleaving occurs at the
 * keystroke rate of the shipped app on the operator's machine — that
 * remains open. See the debug file's live-fallback section
 * (searchProbe.ts / `pnpm tauri:dev`) if this ever needs confirming against
 * a real browser.
 *
 * History: the root cause was that both of SearchBar's DOM-sync effects
 * were `useEffect` (passive), so a render committed from keystroke N could
 * have its effect flush deferred past keystroke N+1's native 'input' event
 * — and the deferred effect would then stomp the DOM back to the stale
 * value from render N, silently erasing the already-typed character. The
 * fix moved both to `useLayoutEffect` (synchronous, no task boundary for a
 * native event to land in). The first version of this test file also
 * carried an isolated "proves the old `useEffect` mechanism was buggy"
 * case; it was retired once the fix landed, because the real component no
 * longer calls `useEffect` at all, so a scenario built around flushing
 * passive effects can no longer say anything about shipped code. The test
 * below verifies the CURRENT (`useLayoutEffect`) behavior directly, was
 * confirmed RED against the pre-fix source (reverting the
 * `useEffect`->`useLayoutEffect` change locally reproduces the failure),
 * and is GREEN against the fix.
 */

type Cleanup = (() => void) | void

interface EffectSlot {
  deps: unknown[] | undefined
  create: () => Cleanup
  cleanup: Cleanup
  pending: boolean
}

interface RefSlot {
  current: unknown
}

/** One isolated hook "fiber" so multiple SearchBar mounts in one test file
 * don't share ref/effect slots. */
function createHookHost() {
  const refs: RefSlot[] = []
  const effects: EffectSlot[] = []
  const layoutEffects: EffectSlot[] = []
  let refIndex: number
  let effectIndex: number
  let layoutEffectIndex: number

  function depsChanged(a: unknown[] | undefined, b: unknown[] | undefined) {
    if (!a || !b) return true
    if (a.length !== b.length) return true
    return a.some((v, i) => v !== b[i])
  }

  function beginRender() {
    refIndex = 0
    effectIndex = 0
    layoutEffectIndex = 0
  }

  function useRef<T>(initial: T): { current: T } {
    const idx = refIndex++
    if (refs[idx] === undefined) {
      refs[idx] = { current: initial }
    }
    return refs[idx] as { current: T }
  }

  function registerEffect(
    slots: EffectSlot[],
    idx: number,
    create: () => Cleanup,
    deps?: unknown[]
  ) {
    const prior = slots[idx]
    const changed = !prior || depsChanged(prior.deps, deps)
    slots[idx] = {
      deps,
      create,
      cleanup: prior?.cleanup,
      pending: prior ? prior.pending || changed : true
    }
  }

  function useEffect(create: () => Cleanup, deps?: unknown[]) {
    registerEffect(effects, effectIndex++, create, deps)
  }

  /** Real React runs `useLayoutEffect` callbacks SYNCHRONOUSLY as part of
   * the same commit that produced them — no browser task boundary, so no
   * native event can land in between. Modelled here by
   * `runLayoutEffectsSync`, which the test's `render()` helper calls
   * immediately (not awaited), unlike `flushEffects` for passive effects. */
  function useLayoutEffect(create: () => Cleanup, deps?: unknown[]) {
    registerEffect(layoutEffects, layoutEffectIndex++, create, deps)
  }

  function useCallback<T>(fn: T, deps: unknown[]): T {
    const idx = refIndex++
    const stored = refs[idx] as { current: { deps: unknown[]; fn: T } }
    if (refs[idx] === undefined || depsChanged(stored?.current?.deps, deps)) {
      refs[idx] = { current: { deps, fn } }
      return fn
    }
    return refs[idx].current as T
  }

  function runSlots(slots: EffectSlot[]) {
    for (const eff of slots) {
      if (eff.pending) {
        if (eff.cleanup) eff.cleanup()
        eff.cleanup = eff.create()
        eff.pending = false
      }
    }
  }

  /** Mirrors React: render+commit already happened synchronously by the
   * time this is called. Runs any *passive* effect whose deps changed
   * since it last ran, in slot order, cleanup-then-create — but only
   * after yielding to a macrotask, so callers can interleave synchronous
   * "native events" between commit and effect flush. */
  async function flushEffects() {
    await new Promise((resolve) => setImmediate(resolve))
    runSlots(effects)
  }

  /** Mirrors React's layout-effect timing: synchronous, no task boundary. */
  function runLayoutEffectsSync() {
    runSlots(layoutEffects)
  }

  return {
    beginRender,
    useRef,
    useEffect,
    useLayoutEffect,
    useCallback,
    flushEffects,
    runLayoutEffectsSync
  }
}

// A fresh host per test (assigned in beforeEach below) — a module-level
// singleton here previously leaked ref/effect slots across `it()` blocks:
// a later test's `ref.current` came back non-null (left over from an
// earlier test's fake input), so its render() skipped attaching its OWN
// fake input, and `fireInput()` silently found no listener at all. Caught
// by a negative-control test failing for the wrong reason — worth noting
// as a harness pitfall, not a SearchBar finding.
let host: ReturnType<typeof createHookHost>

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
  useRef: (initial: unknown) => host.useRef(initial),
  useEffect: (create: () => Cleanup, deps?: unknown[]) =>
    host.useEffect(create, deps),
  useLayoutEffect: (create: () => Cleanup, deps?: unknown[]) =>
    host.useLayoutEffect(create, deps),
  useCallback: (fn: unknown, deps: unknown[]) => host.useCallback(fn, deps)
}))

beforeEach(() => {
  host = createHookHost()
})

jest.mock('../index.scss', () => ({}))

import SearchBar from '../index'

/** Minimal stand-in for an HTMLInputElement: only the surface SearchBar's
 * effects actually touch (`.value`, `addEventListener`,
 * `removeEventListener`). Not a DOM node — see file header. */
function createFakeInput() {
  let value = ''
  const listeners = new Map<string, () => void>()
  return {
    get value() {
      return value
    },
    set value(v: string) {
      value = v
    },
    addEventListener: (type: string, handler: () => void) => {
      listeners.set(type, handler)
    },
    removeEventListener: (type: string) => {
      listeners.delete(type)
    },
    /** Simulates the browser dispatching a real 'input' event: fires
     * whichever handler is *currently* attached, exactly like a real
     * EventTarget would. */
    fireInput: () => {
      listeners.get('input')?.()
    },
    get attachedListenerCount() {
      return listeners.size
    }
  }
}

describe('SearchBar typing race (library-search-typing-lag)', () => {
  it('does not roll back an already-typed character when a native input event lands between one render committing and the next', async () => {
    const fakeInput = createFakeInput()
    const calls: string[] = []
    let committedValue = ''

    function onInputChangedGen() {
      // A fresh identity per render, mirroring LibrarySearchBar's inline
      // `onInputChanged` (structural fact #2 in the debug file) — this
      // alone re-arms SearchBar's listener-attaching effect every render.
      return (text: string) => {
        calls.push(text)
        committedValue = text
      }
    }

    function render() {
      host.beginRender()
      const el = SearchBar({
        onInputChanged: onInputChangedGen(),
        value: committedValue,
        placeholder: 'Search for Games'
      })
      // ref={input} is only wired up by a real renderer's commit phase;
      // simulate that one-time attachment. With the automatic JSX runtime,
      // `ref` lives on the element itself, not inside `element.props`
      // (accessing `.props.ref` there trips a React dev warning and
      // always returns undefined).
      const ref = el?.props?.children?.[1]?.ref
      if (ref && ref.current === null) {
        ref.current = fakeInput
      }
      // Layout effects run synchronously, as part of this same call — no
      // task boundary for a native event to land in. A no-op if SearchBar
      // ever regresses to `useEffect` (nothing here to run), which is
      // exactly what makes this a regression guard: it was confirmed RED
      // against that prior state (see file header).
      host.runLayoutEffectsSync()
      return el
    }

    // Mount.
    render()
    await host.flushEffects()
    expect(fakeInput.value).toBe('')
    expect(fakeInput.attachedListenerCount).toBe(1)

    // Keystroke 1: browser sets the DOM value natively, fires 'input'.
    fakeInput.value = 'a'
    fakeInput.fireInput()
    expect(calls).toEqual(['a'])

    // Commit for keystroke 1's render.
    render()

    // Physical keystroke 2, in the gap right after that commit — dispatched
    // into whatever listener is attached *now*.
    fakeInput.value = 'ab'
    fakeInput.fireInput()
    expect(calls).toEqual(['a', 'ab'])

    // Flush any still-pending passive effects (none expected under the
    // fix — SearchBar no longer registers any `useEffect`).
    await host.flushEffects()

    // The already-typed 'b' must survive: no rollback to a stale value.
    expect(fakeInput.value).toBe('ab')
  })

  it('negative control: no rollback when there is no gap at all between commit and the next keystroke', async () => {
    const fakeInput = createFakeInput()
    let committedValue = ''
    const calls: string[] = []

    function render() {
      host.beginRender()
      function onInputChanged(text: string) {
        calls.push(text)
        committedValue = text
      }
      const el = SearchBar({
        onInputChanged,
        value: committedValue,
        placeholder: 'Search for Games'
      })
      const ref = el?.props?.children?.[1]?.ref
      if (ref && ref.current === null) {
        ref.current = fakeInput
      }
      host.runLayoutEffectsSync()
      return el
    }

    render()
    await host.flushEffects()

    // Keystroke 1, immediately followed by its render AND flush with no
    // interleaved native event in the gap.
    fakeInput.value = 'a'
    fakeInput.fireInput()
    render()
    await host.flushEffects()
    expect(fakeInput.value).toBe('a')

    // Keystroke 2, same tight sequence.
    fakeInput.value = 'ab'
    fakeInput.fireInput()
    render()
    await host.flushEffects()

    expect(fakeInput.value).toBe('ab')
    expect(calls).toEqual(['a', 'ab'])
  })
})
