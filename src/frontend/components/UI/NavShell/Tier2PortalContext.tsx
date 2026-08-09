import React, { useMemo, useState } from 'react'

/**
 * Why this seam exists (REQ-34.10-09) -- read before "simplifying" this into
 * a component move:
 *
 * `LibrarySearchBar` and the Games tier-2 filter panel sections
 * (`FilterViewList`, `FilterCollectionList`, `FilterStoreFacet`,
 * `FilterRunnabilityFacet`, `FilterMoreGroup`) all call
 * `useContext(LibraryContext)`. `frontend/screens/Library/LibraryContext.tsx`'s
 * `initialContext` supplies a full set of silent no-op setters (`() => null`)
 * for every filter/search/layout handler. React context follows the React
 * tree, not the DOM tree -- so if the app-level shell renders `<Header>`
 * itself (a move) instead of inside `Library`'s own provider, every one of
 * those consumers falls back to `initialContext`'s no-op setters. The result
 * looks correct -- the controls render, they respond to clicks, nothing
 * throws, no test fails -- and does nothing: every filter interaction is
 * silently swallowed by a no-op.
 *
 * A portal avoids this: `Library`'s provider stays the actual React parent
 * of `<Header>` (and therefore of `LibrarySearchBar` and the panel
 * sections), while `ReactDOM.createPortal` places its rendered DOM
 * node inside the shell's tier-2 column. This context is the seam that
 * carries the portal *target* DOM node from the shell (`GamesPanel`, plan
 * 34.10-01) to the `Library` side (plan 34.10-06) without either side
 * needing to reach across the React tree by any other means.
 */
export interface Tier2PortalValue {
  target: HTMLElement | null
  setTarget: (el: HTMLElement | null) => void
  filled: boolean
  setFilled: (filled: boolean) => void
}

const defaultValue: Tier2PortalValue = {
  target: null,
  setTarget: () => null,
  filled: false,
  setFilled: () => null
}

export const Tier2PortalContext =
  React.createContext<Tier2PortalValue>(defaultValue)

export const Tier2PortalProvider: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [filled, setFilled] = useState(false)

  const value = useMemo<Tier2PortalValue>(
    () => ({ target, setTarget, filled, setFilled }),
    [target, filled]
  )

  return (
    <Tier2PortalContext.Provider value={value}>
      {children}
    </Tier2PortalContext.Provider>
  )
}
