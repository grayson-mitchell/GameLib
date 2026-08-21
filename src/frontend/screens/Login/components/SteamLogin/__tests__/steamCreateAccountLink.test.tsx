/**
 * Quick task 260822-elw: pins the gated "create a Steam account" affordance
 * added to the Steam login dialog -- `showsCreateAccountLink(step)` and
 * `renderCreateAccountLink(step)` in `../index.tsx`.
 *
 * This jest project (`src/frontend/jest.config.js`) is `testEnvironment:
 * 'node'` -- there is no DOM, no jsdom, and no `render()`. `showsCreateAccountLink`
 * and `renderCreateAccountLink` take no hooks, so they are invoked directly as
 * plain functions and the returned React-element object graph (or boolean) is
 * inspected, the same DOM-less pattern
 * `WebView/components/__tests__/WebviewUnavailablePanel.test.tsx` uses.
 *
 * D-01's gating decision (recorded here so a future reader knows the excluded
 * steps are a decision, not an oversight): the link is offered for
 * `'tab'` (live for BOTH the QR panel and the username/password form),
 * `'qr-active'`, and `'credentials-1'` (only reachable via "Back to
 * Credentials"). It is withheld for `'checking'` (bare spinner),
 * `'not-installed'` (already owns its own two-button row with a different
 * job), `'qr-confirmed'` (QR scanned, completing sign-in), and
 * `'credentials-2'` (Steam Guard entry) -- offering account creation at
 * either of the last two moments would be misdirection at the exact point
 * the user is closest to success.
 *
 * This file is a BEHAVIOURAL test of the gate (predicate + render, both
 * directions), the click handler, and the visible copy, plus ONE source gate
 * over the single call site in `renderWindowBody()` -- the predicate/render
 * tests alone cannot detect a JSX edit that deletes the gate at the call
 * site while leaving the gated functions themselves untouched.
 *
 * Deviation from the plan's literal instruction (recorded per Rule 3 --
 * blocking issue, auto-fixed): `../index.tsx` has a direct
 * `import './index.scss'` plus a transitive `import './index.css'` via
 * `frontend/components/UI/Dialog`'s barrel -- unlike `WebviewUnavailablePanel.tsx`,
 * which has neither. Importing `../index` unmodified fails jest with
 * "Unexpected token" the instant either stylesheet is required, since this
 * project has no CSS transform (confirmed live, and independently documented
 * by `Login/__tests__/index.test.tsx`'s own header: "no CSS transform ... so
 * neither mounting a tree nor importing a component that does
 * `import './index.css'` is possible here"). Both stylesheets are mocked to
 * `{}` below via plain `jest.mock(moduleId, () => ({}))` -- both files exist
 * on disk and resolve normally, only their content/transform is swapped out
 * -- scoped to this test file's own module registry, so no shared jest
 * config changes and no other suite's behaviour is affected.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { ReactElement } from 'react'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

// See the deviation note in the file header above -- these mocks let the
// real `../index` module load without a CSS transform.
jest.mock('../index.scss', () => ({}))
jest.mock('frontend/components/UI/Dialog/index.css', () => ({}))

const mockApi = {
  openExternalUrl: jest.fn()
}
;(globalThis as unknown as { window: { api: typeof mockApi } }).window = {
  api: mockApi
}

import {
  showsCreateAccountLink,
  renderCreateAccountLink,
  type Step
} from '../index'

type AnyReactElement = ReactElement<{
  children?: unknown
  className?: string
  onClick?: () => void
  onClose?: unknown
  dismiss?: unknown
}>

/**
 * Recursively flattens a React element's `children` prop graph into a
 * single string. Operates purely on the plain element/props object graph
 * React elements already are before rendering -- no DOM required. Copied
 * verbatim from `WebviewUnavailablePanel.test.tsx`.
 */
function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map(collectText).join(' ')
  }
  if (typeof node === 'object' && node !== null && 'props' in node) {
    const props = (node as AnyReactElement).props
    return collectText(props?.children)
  }
  return ''
}

/**
 * Recursively finds the first descendant element with the given className.
 * Copied verbatim from `WebviewUnavailablePanel.test.tsx`.
 */
function findByClassName(
  node: unknown,
  className: string
): AnyReactElement | null {
  if (node === null || node === undefined || typeof node !== 'object') {
    return null
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByClassName(child, className)
      if (found) return found
    }
    return null
  }
  const el = node as AnyReactElement
  if (el.props?.className === className) {
    return el
  }
  return findByClassName(el.props?.children, className)
}

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..', '..')
const STEAM_LOGIN_TSX =
  'src/frontend/screens/Login/components/SteamLogin/index.tsx'

const readRaw = (relPath: string) =>
  readFileSync(join(REPO_ROOT, relPath), 'utf8')

const read = (relPath: string) => stripSourceComments(readRaw(relPath))

/** Extracts the balanced-brace block body starting at the first `{` after `marker`. */
function extractBlock(source: string, marker: string): string {
  const markerIdx = source.indexOf(marker)
  if (markerIdx === -1) {
    throw new Error(`marker not found: ${marker}`)
  }
  const braceStart = source.indexOf('{', markerIdx)
  let depth = 0
  let i = braceStart
  for (; i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(braceStart, i + 1)
}

// All seven Step values with their expected showsCreateAccountLink result.
// The three `true` rows and the four `false` rows are asserted in the SAME
// test below, so a predicate rewritten to `return true` fails on the false
// rows and a predicate rewritten to `return false` fails on the true rows --
// neither direction can pass vacuously. Typed as Array<[Step, boolean]> so
// that adding an eighth Step member without updating this table is at least
// visible to tsc (an unhandled member would make the table's type narrower
// than `Step` if this were exhaustively derived -- here it is a literal
// enumeration instead, deliberately, so tsc flags nothing automatically, but
// the FILLED-SPECIMEN + falsifiability discipline below covers the gap).
const ALL_STEPS_WITH_EXPECTATION: Array<[Step, boolean]> = [
  ['checking', false],
  ['not-installed', false],
  ['tab', true],
  ['qr-active', true],
  ['qr-confirmed', false],
  ['credentials-1', true],
  ['credentials-2', false]
]

describe('quick-260822-elw: showsCreateAccountLink / renderCreateAccountLink gate', () => {
  it('FILLED-SPECIMEN GUARD (raw, unstripped) -- index.tsx actually contains the literal "steamCreateAccountLink" token, so a broken comment stripper turns every source-gate assertion below RED rather than vacuously green', () => {
    const raw = readRaw(STEAM_LOGIN_TSX)
    expect(raw).toMatch(/steamCreateAccountLink/)
  })

  it('BOTH-DIRECTION PREDICATE GATE -- showsCreateAccountLink is true for exactly tab/qr-active/credentials-1 and false for the other four steps, asserted together so neither direction can pass vacuously', () => {
    for (const [step, expected] of ALL_STEPS_WITH_EXPECTATION) {
      expect(showsCreateAccountLink(step)).toBe(expected)
    }
  })

  it('BOTH-DIRECTION RENDER GATE -- renderCreateAccountLink(step) is null for every excluded step and renders a .steamCreateAccountLink descendant for every included step', () => {
    for (const [step, expected] of ALL_STEPS_WITH_EXPECTATION) {
      const element = renderCreateAccountLink(step)
      if (expected) {
        expect(element).not.toBeNull()
        expect(
          findByClassName(element as AnyReactElement, 'steamCreateAccountLink')
        ).not.toBeNull()
      } else {
        expect(element).toBeNull()
      }
    }
  })

  it('BEHAVIOURAL CLICK GATE -- clicking the link calls window.api.openExternalUrl with the exact join URL, not a substring match', () => {
    const element = renderCreateAccountLink('tab') as AnyReactElement
    const link = findByClassName(element, 'steamCreateAccountLink')

    expect(link).not.toBeNull()
    link?.props.onClick?.()

    expect(mockApi.openExternalUrl).toHaveBeenCalledTimes(1)
    expect(mockApi.openExternalUrl).toHaveBeenCalledWith(
      'https://store.steampowered.com/join/'
    )
  })

  it('COPY GATE -- the prompt sentence and the link label are both present in the rendered text, so the affordance cannot be silently emptied while the element still renders', () => {
    const element = renderCreateAccountLink('tab') as AnyReactElement
    const text = collectText(element)

    expect(text).toContain("Don't have a Steam account?")
    expect(text).toContain('Create one')
  })

  it('DIALOG-STAYS-OPEN GATE (ABSENCE) -- the link exposes no onClose/dismiss-shaped handler, no dismissal-label text, and its source references no closeWindow', () => {
    const element = renderCreateAccountLink('tab') as AnyReactElement
    const link = findByClassName(element, 'steamCreateAccountLink')

    // Absence over the returned element graph -- weaker than a presence
    // assertion, since many unrelated shapes also satisfy it.
    expect(link?.props.onClose).toBeUndefined()
    expect(link?.props.dismiss).toBeUndefined()
    expect(collectText(element).toLowerCase()).not.toMatch(
      /\bclose\b|\bcancel\b/
    )

    // Source-text absence, closing the gap a pure element-graph check
    // cannot: renderCreateAccountLink's own function body must not
    // reference closeWindow at all -- closeWindow's total occurrence count
    // in this file is pinned at 8 by steamLoginWindowChrome.test.ts, and
    // this function must not become a 9th consumer.
    const source = read(STEAM_LOGIN_TSX)
    const fnBlock = extractBlock(
      source,
      'export function renderCreateAccountLink'
    )
    expect(fnBlock).not.toMatch(/closeWindow/)
  })

  it('CALL-SITE SOURCE GATE -- the single call site {renderCreateAccountLink(step)} exists exactly once, the identifier occurs exactly twice (one declaration, one call site), and the /join/ URL literal occurs exactly once', () => {
    const source = read(STEAM_LOGIN_TSX)

    // Breaks if: the call site is deleted (e.g. the gated markup is inlined
    // unconditionally instead), so predicate/render-gate tests above --
    // which call the exported functions directly and never touch the real
    // renderWindowBody() call site -- cannot catch this on their own.
    expect(
      (source.match(/\{renderCreateAccountLink\(step\)\}/g) ?? []).length
    ).toBe(1)
    expect((source.match(/renderCreateAccountLink/g) ?? []).length).toBe(2)
    expect(
      (source.match(/https:\/\/store\.steampowered\.com\/join\//g) ?? []).length
    ).toBe(1)
  })
})
