/**
 * Regression proof for the winetricks Install-button mouse-click race (Phase 35
 * Plan 25, closing REQ-35-16's winetricks clause / 35-VERIFICATION.md gap 2).
 *
 * Live-measured on an instrumented `pnpm tauri:dev` build: a real mouse click's
 * `mousedown` correctly targets the suggestion's Install `<button>` while the
 * search input is still focused (`document.activeElement` unchanged, ruling out
 * the SearchBar-level `:focus-within` mechanism documented in
 * `../../SearchBar/index.tsx`). ~4ms later, ALL suggestion `<li>` elements are
 * removed from the DOM as a single batch -- a parent-driven remount of this
 * whole component, not a partial re-filter -- and the corresponding `mouseup`
 * ~60ms later lands on an unrelated element exposed by that remount. Because
 * `click` only fires when mousedown and mouseup share a target, `click` is
 * never synthesized and `onInstallClicked` never runs. Full narrative in the
 * fix's own comment in `../index.tsx`.
 *
 * The fix captures install intent on `mousedown` -- before the remount can
 * occur -- instead of waiting for `click`. `onClick` is kept (and a mousedown-
 * originated click is suppressed) so keyboard activation, which dispatches
 * `click` directly against the focused element with no positional hit-test
 * and so cannot be raced the same way, is unaffected.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js`), so this follows the established
 * useState/useEffect/useRef re-invocation harness pattern
 * (`NavShell/__tests__/DownloadsRing.test.tsx`): invoke the component as a
 * plain function against a hand-rolled hook harness and inspect the returned
 * React element graph, re-invoking to observe state written by effects.
 */
import type { ReactElement, ReactNode } from 'react'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

// `SearchBar` itself is proven separately (`suggestionFocusRace.test.tsx`).
// Here it is mocked to a passthrough so `suggestionsListItems` can be
// inspected directly without also invoking `SearchBar`'s own hooks.
jest.mock('../../../SearchBar', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => ({
    type: 'mock-searchbar',
    props
  })
}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0
  let effectDeps: (unknown[] | undefined)[] = []
  let effectCleanups: (void | (() => void))[] = []
  let effectCursor = 0
  let refSlots: { current: unknown }[] = []
  let refCursor = 0

  const depsChanged = (
    prev: unknown[] | undefined,
    next: unknown[] | undefined
  ): boolean => {
    if (!prev || !next) return true
    if (prev.length !== next.length) return true
    return prev.some((d, i) => !Object.is(d, next[i]))
  }

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
      if (depsChanged(effectDeps[idx], deps)) {
        const priorCleanup = effectCleanups[idx]
        if (typeof priorCleanup === 'function') {
          priorCleanup()
        }
        effectDeps[idx] = deps
        effectCleanups[idx] = effect()
      }
    },
    useRef: (initial: unknown) => {
      const idx = refCursor++
      if (idx >= refSlots.length) {
        refSlots[idx] = { current: initial }
      }
      return refSlots[idx]
    },
    __beginRender: () => {
      stateCursor = 0
      effectCursor = 0
      refCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
      effectDeps = []
      effectCleanups = []
      effectCursor = 0
      refSlots = []
      refCursor = 0
    }
  }
})

import WinetricksSearchBar from '../index'

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

interface Props {
  allComponents: string[]
  installed: string[]
  onInstallClicked: (component: string) => void
}

function mount(props: Props): ReactElement {
  harness().__resetMount()
  harness().__beginRender()
  return WinetricksSearchBar(props) as unknown as ReactElement
}

function reinvoke(props: Props): ReactElement {
  harness().__beginRender()
  return WinetricksSearchBar(props) as unknown as ReactElement
}

interface ElementLike {
  type: unknown
  props: Record<string, unknown> & { children?: unknown }
}

function walk(node: unknown, visit: (el: ElementLike) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit))
    return
  }
  if (!node || typeof node !== 'object') return
  const el = node as ElementLike
  if (!('props' in el) || !el.props) return
  visit(el)
  walk(el.props.children, visit)
}

function findInstallButton(tree: ElementLike): ElementLike {
  const searchBarProps = tree.props as { suggestionsListItems?: unknown[] }
  const items = searchBarProps.suggestionsListItems ?? []
  let found: ElementLike | undefined
  walk(items as ReactNode, (el) => {
    if (el.props.className === 'button') found = el
  })
  if (!found) {
    throw new Error(
      'no Install button found in suggestionsListItems -- this test proves nothing'
    )
  }
  return found
}

describe('WinetricksSearchBar Install button mouse-click race (Phase 35 Plan 25)', () => {
  function driveToSuggestion(onInstallClicked: (c: string) => void): ElementLike {
    const props: Props = {
      allComponents: ['vcrun', 'corefonts'],
      installed: [],
      onInstallClicked
    }

    // Render 1 (mount): search === '', no suggestions yet.
    let tree = mount(props) as unknown as ElementLike

    // Simulate typing "vcrun" via the (mocked) SearchBar's onInputChanged prop.
    const onInputChanged = tree.props.onInputChanged as (text: string) => void
    onInputChanged('vcrun')

    // Render 2: `search` now 'vcrun' -- the filtering effect's deps changed, so
    // it runs and writes `searchResults`, but the `suggestions` list computed
    // in THIS render call was already bound to the pre-effect (empty) value.
    tree = reinvoke(props) as unknown as ElementLike

    // Render 3: reflects the effect's write from render 2.
    tree = reinvoke(props) as unknown as ElementLike

    return findInstallButton(tree)
  }

  it('renders an Install button for a matching suggestion at all (non-vacuity anchor)', () => {
    expect(() => driveToSuggestion(() => undefined)).not.toThrow()
  })

  it('mousedown alone fires onInstallClicked, before any click is required', () => {
    const onInstallClicked = jest.fn()
    const button = driveToSuggestion(onInstallClicked)
    const onMouseDown = button.props.onMouseDown as
      | ((e: { preventDefault: () => void }) => void)
      | undefined

    expect(typeof onMouseDown).toBe('function')

    const preventDefault = jest.fn()
    onMouseDown!({ preventDefault })

    // This is the actual fix: install must be invoked from mousedown, which
    // fires and is fully handled before the ~4ms-later parent remount can pull
    // the button (and thus mouseup's hit-test target) out from under the click.
    expect(onInstallClicked).toHaveBeenCalledTimes(1)
    expect(onInstallClicked).toHaveBeenCalledWith('vcrun')
    expect(preventDefault).toHaveBeenCalledTimes(1)
  })

  it('a click that follows the mousedown does not double-invoke install', () => {
    const onInstallClicked = jest.fn()
    const button = driveToSuggestion(onInstallClicked)
    const onMouseDown = button.props.onMouseDown as (e: {
      preventDefault: () => void
    }) => void
    const onClick = button.props.onClick as (() => void) | undefined

    expect(typeof onClick).toBe('function')

    onMouseDown({ preventDefault: jest.fn() })
    onClick!()

    // A real mouse click that DOES land (no race this time) must not fire
    // install a second time via the trailing `click` event.
    expect(onInstallClicked).toHaveBeenCalledTimes(1)
  })

  it('click alone (no preceding mousedown) still installs -- keyboard activation path', () => {
    const onInstallClicked = jest.fn()
    const button = driveToSuggestion(onInstallClicked)
    const onClick = button.props.onClick as (() => void) | undefined

    expect(typeof onClick).toBe('function')

    // Enter/Space on a focused button dispatches `click` with no preceding
    // mousedown and no positional hit-test, so this path is unaffected by the
    // DOM-remount race and must keep working.
    onClick!()

    expect(onInstallClicked).toHaveBeenCalledTimes(1)
    expect(onInstallClicked).toHaveBeenCalledWith('vcrun')
  })
})
