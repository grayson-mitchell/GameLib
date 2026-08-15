/**
 * Phase 34.13, Plan 11, Task 2 -- D-25's in-dialog loading row: the loading
 * state lives INSIDE the options dialog, in the wine-section slot, the
 * exact INVERSION of the retired D-12 contract that put it on the origin
 * button (`MainButton.tsx`/`GameCard/index.tsx`).
 *
 * The component is INVOKED as a plain function and only its returned
 * React-element object graph is inspected -- nothing is rendered, there is
 * no DOM, no click is simulated. `src/frontend/jest.config.js`'s own
 * docstring is the authority for this no-jsdom idiom (see also
 * `MainButton.steamIncomplete.test.tsx`, the harness this file copies).
 *
 * VACUITY BOUNDARY: this proves the element graph, not pixels. It does NOT
 * prove `InstallModal -> SteamDialog -> screen` actually MOUNTS this
 * component -- that is Task 3's structural gate plus 34.13-13's blocking
 * manual gate.
 */
import type { ReactElement } from 'react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { faSyncAlt } from '@fortawesome/free-solid-svg-icons'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, defaultValue: string): string => defaultValue
  })
}))

import EligibilityLoadingRow from '../EligibilityLoadingRow'

/** Recursively collect all string text nodes from a React element tree. */
function collectText(node: unknown): string {
  if (node === null || node === undefined || typeof node === 'boolean')
    return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(collectText).join(' ')
  const el = node as ReactElement
  if (el.props && 'children' in el.props) {
    return collectText((el.props as { children: unknown }).children)
  }
  return ''
}

/**
 * Recursively locates the element whose `props.className` is `fa-spin` and
 * returns it, so `props.icon` can be inspected directly. `collectText` only
 * descends `children`, so `className`/`icon` are read as PROPS, never as
 * text -- a static sentence with no icon element would fail this search.
 */
function findIcon(node: unknown): ReactElement | null {
  if (node === null || node === undefined || typeof node === 'boolean')
    return null
  if (typeof node === 'string' || typeof node === 'number') return null
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findIcon(child)
      if (found) return found
    }
    return null
  }
  const el = node as ReactElement
  if (
    el.props &&
    (el.props as { className?: unknown }).className === 'fa-spin'
  ) {
    return el
  }
  if (el.props && 'children' in el.props) {
    return findIcon((el.props as { children: unknown }).children)
  }
  return null
}

describe('EligibilityLoadingRow', () => {
  const tree = EligibilityLoadingRow() as ReactElement

  it('renders the reused copy', () => {
    expect(collectText(tree)).toContain('Checking install options…')
  })

  it('DISCRIMINATOR: the spinner is part of the row — a text-only loading row fails', () => {
    // An implementation returning only the sentence passes the previous
    // spec and fails ONLY this one -- a static sentence is not a loading
    // state.
    const icon = findIcon(tree)
    expect(icon).not.toBeNull()
    expect((icon!.props as { icon: unknown }).icon).toBe(faSyncAlt)
    expect((icon!.props as { className: unknown }).className).toBe('fa-spin')
  })

  it('uses the shared buttonWithIcon wrapper, not a bespoke class', () => {
    expect((tree.props as { className: unknown }).className).toBe(
      'buttonWithIcon'
    )
  })

  describe('source gates', () => {
    const MODULE_PATH = join(__dirname, '..', 'EligibilityLoadingRow.tsx')
    const stripped = stripSourceComments(readFileSync(MODULE_PATH, 'utf8'))

    it('gamelib:status.checkingSteamInstallOptions appears exactly once -- the key survives even though the mocked t hides it above', () => {
      expect(
        stripped.split('gamelib:status.checkingSteamInstallOptions').length -
          1
      ).toBe(1)
    })

    it('zero matches of CircularProgress, <Spinner, @mui/material -- no alternative spinner, no new dependency', () => {
      for (const token of ['CircularProgress', '<Spinner', '@mui/material']) {
        expect(stripped.includes(token)).toBe(false)
      }
    })

    it('the same searches DO hit an inline known-bad specimen -- proving the gate above is non-vacuous', () => {
      const specimen = stripSourceComments(
        "import { CircularProgress } from '@mui/material'\nconst x = <Spinner />"
      )
      for (const token of ['CircularProgress', '<Spinner', '@mui/material']) {
        expect(specimen.includes(token)).toBe(true)
      }
    })

    it("imports no stylesheet -- zero matches of import './ and .scss/.css", () => {
      expect(stripped.includes("import './")).toBe(false)
      expect(/\.scss|\.css/.test(stripped)).toBe(false)
    })

    it('zero matches of a hardcoded hex value', () => {
      expect(/#[0-9a-fA-F]{3,8}\b/.test(stripped)).toBe(false)
    })
  })
})
