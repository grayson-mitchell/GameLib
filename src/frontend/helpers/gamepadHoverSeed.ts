import { ValidGamepadAction } from 'common/types'

/**
 * Resolves the game card the mouse pointer is currently hovering, for the
 * mouse-to-controller handoff focus seed wired into `gamepad.ts`'s
 * `checkAction`. Closes
 * `2026-09-25-mouse-highlight-does-not-confer-dom-focus.md`: the operator's
 * visible highlight IS the CSS `:hover` state (`GameCard/index.css:38`), so
 * querying `:hover` at controller-dispatch time resolves exactly the
 * highlighted card by construction -- there is no separate "last hovered"
 * state to track, go stale, or clean up. This registers no DOM event
 * listener of any kind; it is a pure, on-demand query.
 *
 * The returned `link` is the direct-child `<a>` of the card wrapper
 * (`GameCard/index.tsx:559`) -- the exact element `gamepad.ts`'s
 * `isGameCard()`/`playable()`/`playGame()`/`installGame()` key on via
 * `currentElement().parentElement`. Focusing it is what makes the next A/Y
 * press, and the CSS `.gameCard:focus-within` ring, land on the card the
 * operator was looking at.
 */

export interface HoveredCard {
  card: Element
  link: HTMLElement
}

// Same set `gamepad.ts`'s pre-existing `!el` recovery branch handles -- see
// P-4 in 260930-iws-PLAN.md. mainAction/altAction are deliberately excluded:
// letting Y act on a merely-hovered card would let a controller press play
// or install a game the controller never focused.
const DIRECTIONAL_ACTIONS: ReadonlySet<ValidGamepadAction> = new Set([
  'padUp',
  'padDown',
  'padLeft',
  'padRight',
  'leftStickUp',
  'leftStickDown',
  'leftStickLeft',
  'leftStickRight'
])

export function isDirectionalAction(action: ValidGamepadAction): boolean {
  return DIRECTIONAL_ACTIONS.has(action)
}

/**
 * Total: never throws, regardless of what `doc` is. `checkAction`'s only
 * caller (`updateStatus`) swallows exceptions, so a throw here would
 * silently drop the controller press rather than fail loudly -- this
 * resolves to `null` on any missing/throwing API instead.
 */
export function resolveHoveredCard(
  doc: Pick<Document, 'querySelectorAll'>
): HoveredCard | null {
  try {
    if (typeof doc?.querySelectorAll !== 'function') return null

    const hoverChain = doc.querySelectorAll(':hover')
    if (!hoverChain || hoverChain.length === 0) return null

    // Document order, ancestors-first -- the LAST match is the deepest
    // (and therefore most specific) hovered element.
    const deepest = hoverChain[hoverChain.length - 1] as Element | undefined
    if (!deepest) return null

    const card = deepest.closest?.('.gameCard, .gameListItem')
    if (!card) return null

    const link = Array.from(card.children ?? []).find(
      (child) => child.tagName?.toUpperCase() === 'A'
    ) as HTMLElement | undefined
    if (!link) return null

    return { card, link }
  } catch {
    return null
  }
}
