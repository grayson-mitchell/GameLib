import StoreEmbedPlaceholder from './StoreEmbedPlaceholder'
import WebviewUnavailablePanel from './WebviewUnavailablePanel'

interface Props {
  /** `useStoreEmbedSuppressed()` -- app UI is covering the embed (D-19). */
  suppressed: boolean
  /** macOS Epic route: the raw `WKWebView` subview, not the Tauri embed (Phase 50 D-02). */
  isEpicSurface: boolean
  /** Rust's Cloudflare-challenge flag, surfaced by `useStoreEmbedHost` (D-09/D-10). */
  challenged: boolean
  /** The embed's current URL, for the challenged panel's Open in browser button (D-10). */
  url: string
  onTryAgain: () => void
}

/**
 * The embed slot's only children (Phase 50 review finding 6). Exactly ONE of three things fills
 * the slot, never two stacked:
 *
 * - On the Epic surface with a live challenge, the `'epic-challenged'` panel (D-10/D-11) -- with
 *   `url`, so its Open in browser button renders, and with Try again. Rust has hidden the raw
 *   subview at this point, so nothing composites over the panel. It REPLACES the placeholder
 *   rather than following it: the placeholder fills the slot at `height: 100%`, so a panel
 *   rendered after it sat below the slot's visible rect and was only reachable by scrolling.
 * - Otherwise the placeholder, while suppressed (D-19) or on the Epic surface, where it shows
 *   through the transparent subview until Epic paints (D-06). Try again clears `challenged`, so
 *   the placeholder returns while the subview reloads (UI-SPEC E4).
 * - Otherwise nothing: the Tauri embed is a native subview over an empty slot.
 *
 * Gated on `isEpicSurface`, as 50-05-PLAN intended: `challenged` is only ever set on an Epic
 * event, and the gate keeps a stray flag from putting an Epic panel on another store's slot.
 *
 * `suppressed` and `isEpicSurface` are mechanistically unrelated (D-19 is a React refcount; D-06
 * is a static per-route boolean), but until 2026-10-14 rendered the identical placeholder with
 * identical copy -- this is exactly what made
 * `.planning/debug/resolved/embed-suppression-sticks.md` look like a suppression leak when it was
 * actually a routine Epic navigation timeout. The `reason` passed to `StoreEmbedPlaceholder`
 * below is still the anti-conflation diagnostic (dev/live-gate-inspectable via
 * `data-placeholder-reason`), and as of the `2026-10-14-paused-while-a-window-is-open-...` todo
 * (option 3) it ALSO decides whether the placeholder's copy renders -- withheld for the
 * Epic-surface-only reason, kept for both suppression reasons. That is what stops the two cases
 * looking identical to a human reader, not just to an inspector.
 *
 * Hookless (D-22/D-23 chrome discipline): a pure function of its props, invoked directly in its
 * own test, no jsdom required (see `src/frontend/jest.config.js`).
 */
const StoreEmbedSlotContents = ({
  suppressed,
  isEpicSurface,
  challenged,
  url,
  onTryAgain
}: Props) => {
  if (isEpicSurface && challenged) {
    return (
      <WebviewUnavailablePanel
        reason="epic-challenged"
        url={url}
        onTryAgain={onTryAgain}
      />
    )
  }
  if (suppressed || isEpicSurface) {
    const reason =
      suppressed && isEpicSurface
        ? 'suppressed+epic-surface'
        : suppressed
          ? 'suppressed'
          : 'epic-surface'
    return <StoreEmbedPlaceholder reason={reason} />
  }
  return null
}

export default StoreEmbedSlotContents
