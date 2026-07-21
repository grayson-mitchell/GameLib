/**
 * Unit tests for CachedImage's ordered fallback chain (quick task 260710-mkw).
 *
 * No jsdom / react-test-renderer / DOM environment is installed in this jest
 * project (see src/frontend/jest.config.js — testEnvironment is 'node'). So we
 * cannot mount into a real DOM or fire native `error` events on an <img>.
 * Instead we follow the established project pattern (HumbleKeysWaiting /
 * HumbleOriginInfo): mock 'react' at the module level with a slot-based
 * useState and a dependency-aware useEffect, invoke the function component
 * directly, and inspect the returned React-element object graph. Errors are
 * simulated by invoking the returned <img> element's own `onError` handler and
 * re-rendering — exactly the state transition a real load failure triggers.
 */
import type { ReactElement } from 'react'

// Dependency-aware useEffect is required here: CachedImage's src-keyed effect
// resets the fallback chain, so a naive "run every render" effect mock would
// wipe the chain progression we are trying to assert. This mock only re-runs an
// effect when its dependency array changes (Object.is per element), matching
// React's real dependency semantics closely enough for these transitions.
jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCursor = 0

  return {
    ...actualReact,
    useState: (initial: unknown) => {
      const idx = stateCursor++
      if (idx >= stateSlots.length) {
        stateSlots[idx] =
          typeof initial === 'function'
            ? (initial as () => unknown)()
            : initial
      }
      const setState = (updater: unknown) => {
        stateSlots[idx] =
          typeof updater === 'function'
            ? (updater as (prev: unknown) => unknown)(stateSlots[idx])
            : updater
      }
      return [stateSlots[idx], setState]
    },
    useEffect: (effect: () => void | (() => void), deps?: unknown[]) => {
      const idx = effectCursor++
      const prev = effectDeps[idx]
      const changed =
        prev === undefined ||
        deps === undefined ||
        deps.length !== prev.length ||
        deps.some((d, i) => !Object.is(d, prev[i]))
      if (changed) {
        effectDeps[idx] = deps
        effect()
      }
    },
    __begin: () => {
      stateCursor = 0
      effectCursor = 0
    },
    __reset: () => {
      stateSlots = []
      stateCursor = 0
      effectDeps = []
      effectCursor = 0
    }
  }
})

// Imported after the mock above (this project's ts-jest setup does not hoist
// jest.mock like babel-jest — textual order matters).
import CachedImage from '../index'

type Harness = { __begin: () => void; __reset: () => void }
function harness(): Harness {
  return jest.requireMock('react') as unknown as Harness
}

type ImgElement = ReactElement<{
  src?: string
  className?: string
  onError: (e: unknown) => void
  onLoad: (e: unknown) => void
}>

type RenderProps = {
  src: string
  fallback?: string | string[]
  alt?: string
}

function mount(props: RenderProps): ImgElement {
  harness().__reset()
  harness().__begin()
  return CachedImage(props as never) as unknown as ImgElement
}

function rerender(props: RenderProps): ImgElement {
  harness().__begin()
  return CachedImage(props as never) as unknown as ImgElement
}

function fireError(el: ImgElement): void {
  el.props.onError({})
}

describe('CachedImage fallback chain', () => {
  it('renders the primary src and never touches fallbacks when it loads', () => {
    const el = mount({
      src: 'primary.jpg',
      fallback: ['header.jpg', 'missing.svg']
    })
    expect(el.props.src).toBe('primary.jpg')
  })

  it('single-string fallback: primary -> fallback then stops (backward compatible)', () => {
    const props: RenderProps = { src: 'primary.jpg', fallback: 'fallback.svg' }
    const first = mount(props)
    expect(first.props.src).toBe('primary.jpg')

    fireError(first)
    const second = rerender(props)
    expect(second.props.src).toBe('fallback.svg')

    // Bounded: another error cannot advance past the last (only) fallback.
    fireError(second)
    expect(rerender(props).props.src).toBe('fallback.svg')
  })

  it('advances src -> fallback[0] -> fallback[1] in order for a string[] fallback', () => {
    const props: RenderProps = {
      src: 'portrait.jpg',
      fallback: ['header.jpg', 'missing.svg']
    }
    const first = mount(props)
    expect(first.props.src).toBe('portrait.jpg')

    fireError(first)
    const second = rerender(props)
    expect(second.props.src).toBe('header.jpg')

    fireError(second)
    const third = rerender(props)
    expect(third.props.src).toBe('missing.svg')

    // Bounded chain: cannot loop or advance past the last entry (T-quick-02).
    fireError(third)
    expect(rerender(props).props.src).toBe('missing.svg')
  })

  it('applies the imagecache retry step to each http source before advancing', () => {
    const props: RenderProps = {
      src: 'http://cdn/portrait.jpg',
      fallback: ['http://cdn/header.jpg', 'missing.svg']
    }
    const first = mount(props)
    // http primary -> wrapped in imagecache first
    expect(first.props.src).toBe(
      `imagecache://${encodeURIComponent('http://cdn/portrait.jpg')}`
    )

    // First error: retry the raw (un-cached) primary before any fallback
    fireError(first)
    const raw = rerender(props)
    expect(raw.props.src).toBe('http://cdn/portrait.jpg')

    // Second error: advance to fallback[0]; it is http so it is imagecache-wrapped
    fireError(raw)
    const fb0 = rerender(props)
    expect(fb0.props.src).toBe(
      `imagecache://${encodeURIComponent('http://cdn/header.jpg')}`
    )
  })

  it('resets the chain back to the primary src when props.src changes', () => {
    const propsA: RenderProps = { src: 'a.jpg', fallback: ['b.svg'] }
    const first = mount(propsA)
    fireError(first)
    expect(rerender(propsA).props.src).toBe('b.svg')

    // props.src changes -> the src-keyed effect resets the index to primary.
    const propsC: RenderProps = { src: 'c.jpg', fallback: ['b.svg'] }
    rerender(propsC) // effect fires this render (resets slot for the next read)
    expect(rerender(propsC).props.src).toBe('c.jpg')
  })

  it('marks the img with usingFallback only while a fallback source is shown', () => {
    const props: RenderProps = { src: 'a.jpg', fallback: ['missing.svg'] }
    const first = mount(props)
    expect(first.props.className).not.toContain('usingFallback')

    fireError(first)
    expect(rerender(props).props.className).toContain('usingFallback')

    // A new primary src resets the chain, so the marker must clear too.
    const propsC: RenderProps = { src: 'c.jpg', fallback: ['missing.svg'] }
    rerender(propsC) // effect fires this render (resets slot for the next read)
    expect(rerender(propsC).props.className).not.toContain('usingFallback')
  })
})
