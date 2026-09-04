/**
 * Structural tests for `AboutDialog` (quick `260905-d33`), the in-app modal that
 * replaced the 420x380 OS `WebviewWindow` Settings -> About used to open.
 *
 * No jsdom / react-test-renderer is installed in this project (see
 * `src/frontend/jest.config.js` docstring) -- the component is invoked directly
 * as a plain function and its returned React-element object graph is inspected
 * without a DOM, following the `useState`/`useEffect` slot-harness pattern
 * established by `HeroicVersion.test.tsx`.
 */
import type { ReactElement, ReactNode } from 'react'

const mockedGetHeroicVersion = jest.fn()

let stateSlots: unknown[] = []
let stateCursor = 0
let pendingEffects: (() => void | (() => void))[] = []

function resetHookState(): void {
  stateSlots = []
  stateCursor = 0
  pendingEffects = []
}

// Runs the effects the last render queued, then re-invokes so the component
// reads back whatever state those effects committed.
async function flushEffects(): Promise<void> {
  const effects = pendingEffects
  pendingEffects = []
  effects.forEach((effect) => effect())
  await new Promise((resolve) => setImmediate(resolve))
}

jest.mock('react', () => ({
  ...jest.requireActual<typeof import('react')>('react'),
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
  useEffect: (effect: () => void | (() => void)) => {
    pendingEffects.push(effect)
  }
}))

// The interpolating stub is what lets the placeholder assertions below mean
// something: a key whose `{{version}}` stopped being substituted would surface
// here as literal braces rather than the resolved value.
jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string, vars?: Record<string, unknown>) =>
      vars
        ? defaultValue.replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
            String(vars[name])
          )
        : defaultValue
  })
}))

jest.mock('frontend/assets/gamelib-icon.png', () => 'mock-icon.png')
jest.mock('../index.scss', () => ({}))

// The shared Dialog barrel imports raw `.css`, which this jest project has no
// transform for. Mocking the barrel with sentinels keeps the assertions below
// about type identity -- proving AboutDialog consumes the SHARED primitive,
// which is the whole reason it inherits the 500ms Slide -- the same technique
// SettingsPanel.test.tsx uses for NavItem.
jest.mock('../../Dialog', () => ({
  Dialog: function Dialog() {
    return null
  },
  DialogContent: function DialogContent() {
    return null
  },
  DialogHeader: function DialogHeader() {
    return null
  }
}))
;(
  globalThis as unknown as {
    window: { api: { getHeroicVersion: () => Promise<string> } }
  }
).window = {
  api: { getHeroicVersion: () => mockedGetHeroicVersion() }
}

import AboutDialog from '../index'
import { Dialog } from '../../Dialog'

type AnyProps = Record<string, unknown> & { children?: ReactNode }
type AnyElement = ReactElement<AnyProps> & { props: AnyProps }

function collectElements(
  node: ReactNode,
  out: AnyElement[] = []
): AnyElement[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as AnyElement
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function renderDialog(onClose = jest.fn()): AnyElement {
  stateCursor = 0
  return AboutDialog({ onClose }) as unknown as AnyElement
}

function textOf(tree: ReactNode): string[] {
  return collectElements(tree)
    .flatMap((el) => {
      const children = el.props?.children
      return Array.isArray(children) ? children : [children]
    })
    .filter((c): c is string => typeof c === 'string')
}

describe('AboutDialog', () => {
  beforeEach(() => {
    resetHookState()
    mockedGetHeroicVersion.mockResolvedValue('0.7.0')
  })

  it('is built on the shared Dialog primitive, which is where the 500ms Slide comes from', () => {
    // Load-bearing: this component adds no animation of its own. If it stopped
    // consuming the shared primitive it would silently lose the entrance
    // transition that made this surface worth converting from an OS window.
    const tree = renderDialog()

    expect(tree.type).toBe(Dialog)
    expect(tree.props.className).toBe('AboutDialog')
  })

  it('closes through the onClose it was handed', () => {
    const onClose = jest.fn()
    const tree = renderDialog(onClose)

    expect(tree.props.showCloseButton).toBe(true)
    ;(tree.props.onClose as () => void)()

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders "unknown" until getHeroicVersion resolves, then the real version', async () => {
    // The retired OS window bounded this call at 1s because a wedged sidecar
    // delayed WINDOW CONSTRUCTION. A dialog is already on screen, so it is
    // allowed to render an unknown version first and fill it in after.
    expect(textOf(renderDialog())).toContain('Version: unknown')

    await flushEffects()

    expect(textOf(renderDialog())).toContain('Version: 0.7.0')
  })

  it('still renders, with an unknown version, when getHeroicVersion rejects', async () => {
    mockedGetHeroicVersion.mockRejectedValue(new Error('sidecar unreachable'))

    renderDialog()
    await flushEffects()

    expect(textOf(renderDialog())).toContain('Version: unknown')
  })

  it('gives the decorative icon an empty alt, the product name being adjacent text', () => {
    const img = collectElements(renderDialog()).find((el) => el.type === 'img')

    expect(img).toBeDefined()
    expect(img?.props.alt).toBe('')
  })

  it('declares no hardcoded colour -- the page it replaced hardcoded its whole palette', () => {
    // The retired `public/about.html` shipped `#1a1a1a` / `#e6e6e6` / `#b3b3b3`
    // inline and so rendered identically under every theme, light ones
    // included. This asserts the replacement cannot regress to that.
    //
    // Comments are stripped BEFORE matching, and deliberately so: the prose in
    // index.scss names the very hex values it exists to keep out, so a naive
    // whole-file grep convicts the correct file. Measured, not assumed -- the
    // first draft of this test failed exactly that way.
    const stylesheet = jest
      .requireActual<typeof import('fs')>('fs')
      .readFileSync(
        require.resolve('../index.scss').replace(/\.js$/, ''),
        'utf-8'
      )
    const declarations = stylesheet
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '')

    expect(declarations).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(declarations).not.toMatch(/\b(rgba?|hsla?)\(/)
    // Positive half: the colours it DOES declare are theme tokens.
    expect(declarations).toMatch(/color: var\(--/)
  })
})
