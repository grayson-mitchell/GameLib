/**
 * Behavioural + source-gate proof for `Dropdown`'s click-toggled disclosure
 * (34.10-13, closing F-34.10-01 / REQ-34.10-09).
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- `Dropdown` is invoked directly
 * as a plain function against a hand-rolled `useState` harness (the pattern
 * established by `NavShell/__tests__/DownloadsRing.test.tsx`), and its
 * returned React-element object graph is inspected without a DOM. The
 * `tsconfig.json` `jsx: "react-jsx"` automatic runtime means JSX element
 * creation goes through `react/jsx-runtime`, not the mocked `react` module,
 * so only the hook (`useState`) needs mocking here.
 *
 * The second describe block is a SOURCE-TEXT gate on `Dropdown/index.scss`
 * and proves only that the popup-geometry declarations are gone from
 * source -- it proves nothing about the rendered result. That proof is
 * routed to plan 34.10-16's live gate item 3.
 */
import type { ReactElement, ReactNode } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  stripSourceComments,
  stripTrailingLineComment
} from 'backend/testUtils/stripSourceComments'

// Colocated SCSS side-effect import -- no CSS transform configured for this
// jest project.
jest.mock('../index.scss', () => ({}))

jest.mock('react', () => {
  const actualReact = jest.requireActual<typeof import('react')>('react')
  let stateSlots: unknown[] = []
  let stateCursor = 0

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
    __beginRender: () => {
      stateCursor = 0
    },
    __resetMount: () => {
      stateSlots = []
      stateCursor = 0
    }
  }
})

const gamepadAction = jest.fn()
;(
  globalThis as unknown as {
    window: { api: { gamepadAction: typeof gamepadAction } }
  }
).window = {
  api: { gamepadAction }
}

// Imported after the mocks above (textual order -- this project's ts-jest
// setup does not hoist jest.mock like babel-jest).
import Dropdown from '../index'

type HookHarness = {
  __beginRender: () => void
  __resetMount: () => void
}

function harness(): HookHarness {
  return jest.requireMock('react') as unknown as HookHarness
}

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

function mount(): AnyElement {
  harness().__resetMount()
  harness().__beginRender()
  return Dropdown({ title: 'Filters', children: null }) as unknown as AnyElement
}

function reinvoke(): AnyElement {
  harness().__beginRender()
  return Dropdown({ title: 'Filters', children: null }) as unknown as AnyElement
}

function button(tree: AnyElement): AnyElement {
  return (tree.props.children as AnyElement[])[0]
}

function panel(tree: AnyElement): AnyElement {
  return (tree.props.children as AnyElement[])[1]
}

describe('Dropdown disclosure behaviour', () => {
  beforeEach(() => {
    gamepadAction.mockReset()
  })

  it('the root carries the dropdownContainer class and an onBlur handler', () => {
    const tree = mount()

    expect(String(tree.props.className)).toMatch(/^dropdownContainer/)
    expect(typeof tree.props.onBlur).toBe('function')
  })

  it('neither the button nor the panel carries a hover handler', () => {
    const tree = mount()

    expect(button(tree).props.onMouseEnter).toBeUndefined()
    expect(button(tree).props.onMouseLeave).toBeUndefined()
    expect(panel(tree).props.onMouseEnter).toBeUndefined()
    expect(panel(tree).props.onMouseLeave).toBeUndefined()
  })

  it('the panel is collapsed on first invocation', () => {
    const tree = mount()

    expect(panel(tree).props.className).toBe('dropdown collapsed')
  })

  it('a click expands the panel and sets aria-expanded on the button', () => {
    mount()
    const first = reinvoke()
    ;(button(first).props.onClick as () => void)()
    const second = reinvoke()

    expect(panel(second).props.className).toBe('dropdown expanded')
    expect(button(second).props['aria-expanded']).toBe(true)
  })

  it('a second click collapses the panel again and clears aria-expanded -- this pins the toggle that repairs gamepad.ts closeDropdown()', () => {
    mount()
    let tree = reinvoke()
    ;(button(tree).props.onClick as () => void)()
    tree = reinvoke()
    ;(button(tree).props.onClick as () => void)()
    tree = reinvoke()

    expect(panel(tree).props.className).toBe('dropdown collapsed')
    expect(button(tree).props['aria-expanded']).toBe(false)
  })

  it('expanding calls gamepadAction with { action: "tab" }; collapsing does not call it again', () => {
    mount()
    let tree = reinvoke()
    ;(button(tree).props.onClick as () => void)()
    tree = reinvoke()

    expect(gamepadAction).toHaveBeenCalledTimes(1)
    expect(gamepadAction).toHaveBeenCalledWith({ action: 'tab' })
    ;(button(tree).props.onClick as () => void)()
    reinvoke()

    expect(gamepadAction).toHaveBeenCalledTimes(1)
  })

  it('the root onBlur leaves the panel expanded when focus stays inside the container', () => {
    mount()
    let tree = reinvoke()
    ;(button(tree).props.onClick as () => void)()
    tree = reinvoke()

    const onBlur = tree.props.onBlur as (e: unknown) => void
    onBlur({ currentTarget: { contains: () => true }, relatedTarget: {} })
    tree = reinvoke()

    expect(panel(tree).props.className).toBe('dropdown expanded')
  })

  it('the root onBlur collapses the panel when focus leaves the container -- the click-the-trigger-while-focused case', () => {
    mount()
    let tree = reinvoke()
    ;(button(tree).props.onClick as () => void)()
    tree = reinvoke()

    const onBlur = tree.props.onBlur as (e: unknown) => void
    onBlur({ currentTarget: { contains: () => false }, relatedTarget: {} })
    tree = reinvoke()

    expect(panel(tree).props.className).toBe('dropdown collapsed')
  })

  it("the button's className contains dropdownButton -- the literal gamepad.ts:397 queries for", () => {
    const tree = mount()

    expect(String(button(tree).props.className)).toContain('dropdownButton')
  })
})

describe('Dropdown panel geometry (source gate)', () => {
  // Proves the popup-geometry declarations are gone from source. Proves
  // nothing about the rendered result -- there is no jsdom / CSS engine in
  // this jest project to compute a box or resolve a custom property.
  function readScssStripped(): string {
    const raw = readFileSync(join(__dirname, '..', 'index.scss'), 'utf8')
    return stripSourceComments(raw)
      .split('\n')
      .map(stripTrailingLineComment)
      .join('\n')
  }

  it('no longer declares position: absolute', () => {
    expect(readScssStripped()).not.toMatch(/position:\s*absolute/)
  })

  it('no longer declares min-width: 250px', () => {
    expect(readScssStripped()).not.toMatch(/min-width:\s*250px/)
  })

  it('no longer declares right: 0px', () => {
    expect(readScssStripped()).not.toMatch(/right:\s*0px/)
  })

  it('declares width: 100%', () => {
    expect(readScssStripped()).toMatch(/width:\s*100%/)
  })

  it('declares box-sizing: border-box', () => {
    expect(readScssStripped()).toMatch(/box-sizing:\s*border-box/)
  })

  it('no longer contains a body.isRTL override', () => {
    expect(readScssStripped()).not.toMatch(/body\.isRTL/)
  })
})

describe('Dropdown panel surface (F-34.10-05 source gate)', () => {
  // Comment-immune gate on the panel's surface fix. Extends the geometry
  // gate above with 34.10-20's own assertions -- proves only that the
  // source text is right, not that a browser resolves it correctly. That
  // proof is routed to plan 34.10-22's live gate item 3.
  function readScssStripped(): string {
    const raw = readFileSync(join(__dirname, '..', 'index.scss'), 'utf8')
    return stripSourceComments(raw)
      .split('\n')
      .map(stripTrailingLineComment)
      .join('\n')
  }

  it('no longer declares background: var(--background) -- measured in dracula (34.10-F04-DIAGNOSIS.md): #090b1c on top of the tier-2 column\'s #44475a, the reported "black block"', () => {
    expect(readScssStripped()).not.toMatch(/background:\s*var\(--background\)/)
  })

  it("contains no hex colour literal -- an absolute colour here is invisible in midnightMirage (panel and column coincide) and wrong in dracula, per navigation-shell.md § 3's navbar-lighter-than-body table", () => {
    expect(readScssStripped()).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('declares the exact surface fix: background: transparent', () => {
    expect(readScssStripped()).toMatch(/background:\s*transparent/)
  })

  it('34.10-13 geometry survives -- these are the F-34.10-01 fix live gate run 2 confirmed; a failure here means a closed finding is being reopened', () => {
    const css = readScssStripped()
    expect(css).toMatch(/width:\s*100%/)
    expect(css).toMatch(/min-width:\s*0/)
    expect(css).toMatch(/box-sizing:\s*border-box/)
    expect(css).toMatch(/max-height:\s*50vh/)
    expect(css).toMatch(/box-shadow:\s*inset 0 0 0 1px var\(--divider\)/)
  })

  it('the F-34.10-01 popup geometry has not returned', () => {
    const css = readScssStripped()
    expect(css).not.toMatch(/right:\s*0/)
    expect(css).not.toMatch(/min-width:\s*250px/)
  })
})
