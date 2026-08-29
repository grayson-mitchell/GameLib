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
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// Controls preload/tauriTransport's imageCacheSchemeAvailable() for the
// scheme-served vs. not-served cases (34.4.1 gap cycle 2, plan 27, Task 2).
// jest.config.js sets `resetMocks: true`, which wipes any mockReturnValue
// set via the jest.fn() factory argument before EVERY test -- so the
// default is (re)established in this file's own beforeEach below, which
// runs after Jest's automatic reset.
const mockImageCacheSchemeAvailable = jest.fn<boolean, []>()
jest.mock('../../../../../preload/tauriTransport', () => ({
  imageCacheSchemeAvailable: () => mockImageCacheSchemeAvailable()
}))

beforeEach(() => {
  mockImageCacheSchemeAvailable.mockReturnValue(true)
})

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
          typeof initial === 'function' ? (initial as () => unknown)() : initial
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

describe('CachedImage — imagecache:// gated on imageCacheSchemeAvailable() (34.4.1 gap cycle 2, plan 27)', () => {
  it('mirrors "applies the imagecache retry step…" for the not-served condition: never emits imagecache://, for the primary source AND after advancing to a fallback', () => {
    mockImageCacheSchemeAvailable.mockReturnValue(false)

    const props: RenderProps = {
      src: 'http://cdn/portrait.jpg',
      fallback: ['http://cdn/header.jpg', 'missing.svg']
    }
    const first = mount(props)
    // Scheme not served -> the raw http URL is used directly, never wrapped.
    expect(first.props.src).toBe('http://cdn/portrait.jpg')
    expect(first.props.src).not.toContain('imagecache://')

    // First error advances straight to the first fallback (no always-failing
    // imagecache attempt to retry past first, unlike the scheme-served case).
    fireError(first)
    const fb0 = rerender(props)
    expect(fb0.props.src).toBe('http://cdn/header.jpg')
    expect(fb0.props.src).not.toContain('imagecache://')
  })

  it('the existing scheme-available wrapping test above is unaffected by the new default (beforeEach sets imageCacheSchemeAvailable() -> true)', () => {
    expect(mockImageCacheSchemeAvailable()).toBe(true)
  })

  it('bounded fallback chain still terminates at the last entry when the scheme IS served', () => {
    mockImageCacheSchemeAvailable.mockReturnValue(true)
    const props: RenderProps = {
      src: 'http://cdn/portrait.jpg',
      fallback: ['http://cdn/header.jpg', 'missing.svg']
    }
    const first = mount(props)
    fireError(first) // -> raw primary retry
    const raw = rerender(props)
    fireError(raw) // -> fallback[0], imagecache-wrapped
    const fb0 = rerender(props)
    fireError(fb0) // -> raw fallback[0] retry
    const rawFb0 = rerender(props)
    fireError(rawFb0) // -> fallback[1] (missing.svg, non-http, never wrapped)
    const fb1 = rerender(props)
    expect(fb1.props.src).toBe('missing.svg')

    // Bounded: cannot advance past the last entry.
    fireError(fb1)
    expect(rerender(props).props.src).toBe('missing.svg')
  })

  it('bounded fallback chain still terminates at the last entry when the scheme is NOT served', () => {
    mockImageCacheSchemeAvailable.mockReturnValue(false)
    const props: RenderProps = {
      src: 'http://cdn/portrait.jpg',
      fallback: ['http://cdn/header.jpg', 'missing.svg']
    }
    const first = mount(props)
    fireError(first) // -> fallback[0] directly (no imagecache retry to consume)
    const fb0 = rerender(props)
    expect(fb0.props.src).toBe('http://cdn/header.jpg')

    fireError(fb0) // -> fallback[1]
    const fb1 = rerender(props)
    expect(fb1.props.src).toBe('missing.svg')

    // Bounded: cannot advance past the last entry.
    fireError(fb1)
    expect(rerender(props).props.src).toBe('missing.svg')
  })

  it('a non-http source is never wrapped, under either condition', () => {
    for (const available of [true, false]) {
      mockImageCacheSchemeAvailable.mockReturnValue(available)
      const el = mount({ src: 'bundled-asset.svg' })
      expect(el.props.src).toBe('bundled-asset.svg')
    }
  })
})

describe('CachedImage source guard — no direct Tauri-context sniff (mirrors GlobalStateSteamLogout.test.ts house pattern)', () => {
  it('the tauriTransport import brings in ONLY imageCacheSchemeAvailable — the decision must stay there, never duplicated as a second shell-detection import here', () => {
    const rawSource = readFileSync(join(__dirname, '..', 'index.tsx'), 'utf-8')
    const stripped = stripSourceComments(rawSource)

    // Phase 35 plan 17: generalized from a literal-named-predicate search (the same
    // predicate this repo-wide-deletes) to an import-shape check. CachedImage
    // legitimately imports `imageCacheSchemeAvailable` from tauriTransport, so a bare
    // "no tauriTransport reference" gate would be wrong here — instead this asserts the
    // import brings in EXACTLY that one name, so ANY second shell-detection import
    // reintroduced alongside it (whatever it is named) still fails this gate.
    const importMatch = stripped.match(
      /import\s*\{([^}]*)\}\s*from\s*['"][^'"]*preload\/tauriTransport['"]/
    )
    expect(importMatch).not.toBeNull()
    const specifiers = (importMatch?.[1] ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
    expect(specifiers).toEqual(['imageCacheSchemeAvailable'])
  })
})
