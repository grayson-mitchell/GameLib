/**
 * Proves the Frontend jest project can resolve vite's `?react` SVG-import
 * suffix before `HumbleKeyRow` starts using it (Phase 42, D-42-03). The
 * Frontend jest project has no `moduleNameMapper`, `moduleFileExtensions`
 * does not include `svg`, and the `?react` query suffix makes the specifier
 * unresolvable to ts-jest by default. `Waiting/__tests__/index.test.tsx:22`
 * imports the REAL `HumbleKeyRow` module (never `jest.mock`ed) — so without
 * a working mapper, adding a `*.svg?react` import to `HumbleKeyRow` would
 * turn that currently-green suite red. This is a hard prerequisite, not
 * housekeeping: RED here first proves the moduleNameMapper this task adds is
 * load-bearing rather than defensive.
 */
import type { ReactElement } from 'react'

import SteamLogo from 'frontend/assets/steam-logo.svg?react'

describe('*.svg?react module resolution (Frontend jest project)', () => {
  it('resolves the import to a callable React component', () => {
    expect(typeof SteamLogo).toBe('function')
  })

  it('renders as <SteamLogo className="x" /> into an element carrying that className', () => {
    const element = (<SteamLogo className="x" />) as ReactElement<{
      className?: string
    }>
    expect(element.props.className).toBe('x')
  })
})
