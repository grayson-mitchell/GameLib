import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer
} from 'react'

/**
 * Why this seam exists (Phase 40 Plan 06, D-18/D-20) -- read before
 * "simplifying" this into a boolean `useState`:
 *
 * The Steam store/wiki embed (plan 40-05's `storeEmbedSeam`, hosted by plan
 * 40-08) is a NATIVE SUBVIEW that Tauri composites above the entire web
 * layer, not a DOM element painted inside it. DOM stacking contexts --
 * `z-index`, `position: fixed`, a portal to `document.body` -- do not reach
 * a native subview at all. This is therefore NOT a z-index problem that CSS
 * can solve: the only way to keep app UI visibly and interactively above the
 * embed is to hide() the native subview itself while that UI is open, and
 * show() it again when the UI closes.
 *
 * D-18 chose one rule for every overlay -- "opening hides the embed" -- over
 * reserving a rect overlays must avoid, because a reserved rect makes every
 * present and future overlay's layout depend on the embed's position,
 * failing silently the first time an author forgets. D-20 makes that rule
 * structural rather than a convention an author must remember: an overlay
 * acquires suppression by MOUNTING (`useSuppressStoreEmbed()`), not by
 * calling a `hide()` function it could forget to call.
 *
 * The count is a reference count, not a flag, because overlays compose: a
 * dialog opened from within an open dropdown, or a tour step that spans
 * several mounted anchors, must not let the first overlay's unmount
 * un-suppress the embed out from under the second, still-open overlay. That
 * is the exact user-visible defect D-18 exists to prevent -- a live modal
 * with the store rendering visibly (and being hit-tested, since the embed
 * still receives clicks) on top of it.
 *
 * Modelled on the shape of the Rust-side `WakeLockRegistry`
 * (`src-tauri/src/main.rs`): pure bookkeeping, every mutation through one
 * reducer, a single derived query ("is at least one holder still live").
 * The domain does not translate (this counts overlays, not wake-lock
 * kinds) but the shape does, deliberately.
 */

export type SuppressionAction = { type: 'acquire' } | { type: 'release' }

/**
 * Pure reference-count transition function, exported so its four properties
 * (zero stays zero, acquire increments, release decrements, release never
 * goes below zero) can be unit-tested directly with no React involved at
 * all -- this project has no jsdom / react-test-renderer (see
 * `src/frontend/jest.config.js`'s docstring), so keeping the core counting
 * logic as a plain function is what makes it testable without a DOM.
 *
 * A release that would take the count below zero is a wiring bug -- an
 * unmount fired without a matching mount, or a manual release call with no
 * acquire -- and is clamped at the floor rather than silently going
 * negative (T-40-06-02). A negative count would mean "un-suppress the embed
 * more than it was ever suppressed", which has no correct interpretation,
 * so it is logged rather than silently absorbed: a wiring bug should be
 * legible, not invisible.
 */
export function suppressionCountReducer(
  count: number,
  action: SuppressionAction
): number {
  switch (action.type) {
    case 'acquire':
      return count + 1
    case 'release':
      if (count <= 0) {
        console.warn(
          '[GameLib] StoreEmbedSuppressionContext: release() called while the holder count was already 0 -- an acquire/release pair is unbalanced somewhere. Ignoring this release rather than going negative.'
        )
        return 0
      }
      return count - 1
    default:
      return count
  }
}

/**
 * The same `count > 0` derivation the provider's `useMemo` uses, exported
 * so `__tests__/StoreEmbedSuppressionContext.test.tsx` exercises the exact
 * production function rather than a re-implementation of its logic.
 */
export function deriveSuppressed(count: number): boolean {
  return count > 0
}

export interface StoreEmbedSuppressionValue {
  /** True when at least one overlay currently holds suppression. */
  suppressed: boolean
  /** Acquire one hold. Call count must be matched by an equal number of `release()` calls. */
  acquire: () => void
  /** Release one hold. */
  release: () => void
}

// T-40-06-03 / Repudiation: a consumer rendered outside the provider must
// not silently no-op. `Tier2PortalContext.tsx`'s own doc comment records
// this exact hazard for a different context -- a no-op default makes every
// interaction look correct (nothing throws, no test fails) while doing
// nothing. Logging here is what makes that mistake detectable instead of
// invisible. Exported (not module-private) so the test suite can call it
// directly -- this project has no jsdom/react-test-renderer to actually
// mount a consumer outside the provider and observe the fallback in situ
// (see `src/frontend/jest.config.js`'s docstring); this is the exact value
// `useContext` hands back in that situation, so asserting its behaviour
// directly is equivalent proof.
export const defaultSuppressionValue: StoreEmbedSuppressionValue = {
  suppressed: false,
  acquire: () => {
    console.warn(
      '[GameLib] useSuppressStoreEmbed() was called outside <StoreEmbedSuppressionProvider> -- this overlay will NOT suppress the store embed. Render this component beneath the provider mounted in App.tsx.'
    )
  },
  release: () => {
    console.warn(
      '[GameLib] useStoreEmbedSuppressed()/useSuppressStoreEmbed() release() was called outside <StoreEmbedSuppressionProvider>.'
    )
  }
}

export const StoreEmbedSuppressionContext =
  createContext<StoreEmbedSuppressionValue>(defaultSuppressionValue)

/**
 * Mounted in `App.tsx`'s `Root()`, wrapping the entire non-console render
 * (NavShell, every dialog, the Humble expiry toast, `TourProvider`, and the
 * routed `<Outlet/>`) -- NOT in `NavShell/index.tsx`, even though this file
 * lives in the `NavShell` directory. `NavShell/index.tsx` renders a
 * FRAGMENT (`<header/><aside/><NavShellTour/>`), not a wrapper element, and
 * does not enclose `<Outlet/>`, the app-level dialogs, or
 * `HumbleExpiryToast` -- those are `Root()`'s direct children, siblings of
 * `<NavShell/>`, not its descendants. Mounting the provider only inside
 * `NavShell/index.tsx` would leave those consumers outside it, permanently
 * falling back to `defaultValue` above (see `NavShell/index.tsx`'s pointer
 * comment near its imports for the same note at the consumer end).
 */
export const StoreEmbedSuppressionProvider: React.FC<{
  children: React.ReactNode
}> = ({ children }) => {
  const [count, dispatch] = useReducer(suppressionCountReducer, 0)

  const acquire = useCallback(() => dispatch({ type: 'acquire' }), [])
  const release = useCallback(() => dispatch({ type: 'release' }), [])

  const value = useMemo<StoreEmbedSuppressionValue>(
    () => ({ suppressed: deriveSuppressed(count), acquire, release }),
    [count, acquire, release]
  )

  return (
    <StoreEmbedSuppressionContext.Provider value={value}>
      {children}
    </StoreEmbedSuppressionContext.Provider>
  )
}

/** Read-only subscription: true while at least one overlay holds suppression. */
export function useStoreEmbedSuppressed(): boolean {
  return useContext(StoreEmbedSuppressionContext).suppressed
}

/**
 * Acquires suppression for the calling component's mounted lifetime: one
 * `acquire()` on mount, one matching `release()` on unmount, via a
 * symmetric effect cleanup. Takes no arguments -- the caller's mountedness
 * IS the acquisition, per D-20, so there is nothing to key it on.
 *
 * `acquire`/`release` are read fresh from context on every call (via
 * `useContext`, not captured once), but are themselves referentially stable
 * across a provider's re-renders (`useCallback` above) -- so this effect's
 * dependency array does not thrash and does not re-fire on every render,
 * only on mount and unmount. Each hook instance runs its own independent
 * effect, so two mounted instances of the same component each acquire and
 * release their own hold; neither shares or clobbers the other's.
 *
 * React 18 Strict Mode mounts, cleans up and re-mounts effects once in
 * development specifically to catch asymmetric effects. This one is
 * symmetric by construction (acquire in the effect body, release as its
 * only cleanup), so a Strict Mode double-invocation nets out at exactly one
 * held acquisition, not two and not zero (property proven in
 * `__tests__/StoreEmbedSuppressionContext.test.tsx`).
 */
export function useSuppressStoreEmbed(): void {
  const { acquire, release } = useContext(StoreEmbedSuppressionContext)

  useEffect(() => {
    acquire()
    return () => release()
  }, [acquire, release])
}

/**
 * Acquires suppression for as long as `active` is true, releasing when it
 * becomes false or the caller unmounts. `useSuppressStoreEmbed()` above
 * assumes the calling component only EXISTS in the tree while open (true
 * for `Dialog`, per T-40-06-01); this variant is for the opposite shape --
 * a component that is permanently mounted and toggles a boolean it already
 * tracks (the tier-2 portal dropdown's `isExpanded`, the Humble expiry
 * toast's `visible`, the onboarding tour's `activeTour !== null`, per D-36).
 * Same reference-counted context underneath, same symmetric acquire/release
 * discipline -- only the trigger differs.
 */
export function useSuppressStoreEmbedWhile(active: boolean): void {
  const { acquire, release } = useContext(StoreEmbedSuppressionContext)

  useEffect(() => {
    if (!active) return undefined
    acquire()
    return () => release()
  }, [active, acquire, release])
}
