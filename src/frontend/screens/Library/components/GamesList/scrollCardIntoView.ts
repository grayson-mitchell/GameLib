// When a card is focused in the library, keep it in view during controller
// (gamepad) navigation.
//
// F-34.10-06 (34.10-18 Task 2): this is a module-level function, not a
// component or an effect, so the scroll container is resolved AT CALL TIME
// inside the function body -- a module-scope lookup would run before
// `main.content` exists in the DOM. Same selector and `?? document.body`
// fallback used by Library/index.tsx's two effects. Every measurement is
// relative to the CONTAINER's own `getBoundingClientRect()`: the navbar sits
// above it and the controller row below it, so window-relative arithmetic
// would be off by that chrome.
//
// Quick 261031-nwz: a minimal reveal. The card scrolls only when it is cut by
// the container's edge, and only far enough to show it whole with its focus
// ring. The previous rule scrolled whenever a card came within 100px of an
// edge (to 200px below the top / 150px above the bottom); a ~196px tile on
// the top or bottom row is always inside that band, so every Left/Right on
// those rows moved the grid (top row drifted down, bottom row up). The card
// rect is the `.gameCard`'s, not the focused link's, so the 1.05 focus scale
// is included. Cards in the Focus Row strip are rendered by this component
// too, so the strip gets the same vertical rule.
//
// Room between a revealed card and the container edge: the 3px focus ring at
// +2px offset on a card scaled 1.05, plus slack.
const REVEAL_CLEARANCE = 12

export const scrollCardIntoView = (ev: FocusEvent) => {
  const container =
    document.querySelector<HTMLElement>('main.content') ?? document.body

  const trgt = ev.target as HTMLElement
  const card = trgt.closest?.('.gameCard') ?? trgt
  const rect = card.getBoundingClientRect()
  const containerRect = container.getBoundingClientRect()

  const minTop = containerRect.top + REVEAL_CLEARANCE
  const maxBottom = containerRect.bottom - REVEAL_CLEARANCE
  let delta = 0
  if (rect.top < minTop) {
    delta = rect.top - minTop
  } else if (rect.bottom > maxBottom) {
    delta = rect.bottom - maxBottom
  }
  // Under a pixel is subpixel rounding (scrollTop is whole pixels), not a cut.
  if (Math.abs(delta) >= 1) {
    // Instant, not smooth: measured live on macOS WKWebView, a smooth
    // `scrollTo` on `main.content` from this handler never moved it (the
    // only scroll was WebKit's own focus reveal of the link, which ignores
    // the card's scale and ring).
    container.scrollTo({ top: container.scrollTop + delta })
  }
}
