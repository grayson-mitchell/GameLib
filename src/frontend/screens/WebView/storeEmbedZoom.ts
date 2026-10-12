/**
 * Webview-zoom unit conversion for the store embed's bounds (quick 261012-gn8, W8).
 *
 * The renderer measures the embed slot with `getBoundingClientRect()`, which is in CSS px. Rust
 * positions the child webview in LOGICAL px (`LogicalPosition`/`LogicalSize` on macOS/Windows, the
 * `gtk::Fixed` layout on Linux). The two coincide only at webview zoom 1: app zoom is a WEBVIEW
 * zoom (`getCurrentWebview().setZoom(f)`), which shrinks the CSS viewport by `f`, so under zoom
 * `f` logical px = CSS px x `f`. Spike 017's "viewport coords map 1:1 to child logical coords" was
 * measured at zoom 1 and does not hold otherwise.
 *
 * The applied factor is published as `--webview-zoom` on the document root by
 * `src/preload/api/tauriWindowChrome.ts` `publishWebviewZoom`, and only AFTER `setZoom` resolves
 * (quick 261011-t4y). It is read from the root's INLINE style, which is exactly where the preload
 * writes it and which forces no style recalculation (a computed-style read would, during a 25 Hz
 * window drag).
 *
 * Both helpers normalise a non-finite or non-positive factor to 1. That keeps every bounds payload
 * finite, since the preload's `storeEmbedSetBounds` throws on a non-finite field.
 *
 * The factor converts UNITS only. It never supplies, substitutes for or defaults a rect (D-18).
 */

// Derived from the real IPC type, the same derive-don't-redeclare pattern the hook uses for its
// nav types. The backend has a same-named interface, but the frontend does not import from it.
type StoreEmbedBounds = Parameters<typeof window.api.storeEmbedSetBounds>[0]

const WEBVIEW_ZOOM_PROPERTY = '--webview-zoom'

function normaliseFactor(factor: number): number {
  return Number.isFinite(factor) && factor > 0 ? factor : 1
}

/** The applied webview zoom factor, or 1 when none is published / readable. Never throws. */
export function readWebviewZoomFactor(): number {
  try {
    if (typeof document === 'undefined' || !document.documentElement) return 1
    const raw = document.documentElement.style
      .getPropertyValue(WEBVIEW_ZOOM_PROPERTY)
      .trim()
    return normaliseFactor(Number(raw))
  } catch {
    return 1
  }
}

/** Converts a CSS-px rect into the logical-px bounds payload Rust consumes. No rounding. */
export function scaleRectForZoom(
  rect: { x: number; y: number; width: number; height: number },
  factor: number
): StoreEmbedBounds {
  const f = normaliseFactor(factor)
  return {
    x: rect.x * f,
    y: rect.y * f,
    w: rect.width * f,
    h: rect.height * f
  }
}
