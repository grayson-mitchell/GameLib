/**
 * Source-text gate for the non-console highlight ring (quick task 260925-pga,
 * rewritten by 260926-acw, and flipped again for `.gameCard` by Phase 48
 * plan 09, gap G-48-8b).
 *
 * What this proves NOW:
 *
 * - `.gameCard`: tile hover wears the SAME console-style ring that focus
 *   wears, from ONE shared grouped rule (`.gameCard:hover,
 *   .gameCard:focus-within`), by operator ruling 2026-10-07 (UAT item 8,
 *   quote: "I want the thicker border that is in controller mode (like
 *   console)"; follow-up the same day: "I want 3px for all"). The two
 *   single-selector rules carry only z-index (focus above a hovered
 *   neighbour), so hover and focus cannot drift apart again.
 * - A new `body.controllerLayout` rule returns a hovered-but-not-focused
 *   tile to rest, because a parked cursor would otherwise ring a second tile
 *   that is now pixel-identical to the focused one.
 * - The stale-focus suppression (a card left focused by gamepad navigation
 *   or a click) is scoped to `body:not(.controllerLayout) .listing:hover`,
 *   `.listing` being the Library's common ancestor of the focus-row strip's
 *   `.gameList` and the main grid's `.gameList` (G-48-8b, operator
 *   observation 2). It used to be scoped to `.gameList:hover`, which are two
 *   separate elements, so moving the pointer from the strip into the grid
 *   left the strip's last-focused card ringed.
 * - `.gameListItem` (list layout) keeps the 260926-acw split: hover stays a
 *   plain 2px outline, focus is the loud token-driven ring. That split is
 *   untouched except for the `.listing` scope above.
 * - The old `-webkit-focus-ring-color` hairline is still gone, and
 *   `.consoleCard.focused` in `ConsoleMode/index.scss` still spends the same
 *   `--accent` token for its own ring.
 *
 * Why the `.gameCard` contract flipped: 260926-acw split hover (subtle) from
 * focus (loud) so an operator could tell which one a ring meant. The
 * operator has since ruled, live, that tile hover should look like the
 * console-style ring. Ambiguity between a mouse ring and a controller ring is
 * handled structurally instead: the controller-mode parked-cursor rule and
 * the mouse-only stale-focus rule guarantee exactly one tile rings at a time.
 *
 * What this does NOT prove: anything about rendered pixels, whether either
 * ring is actually legible against cover art in any given theme, or whether
 * `:hover`/`:focus-within` fire for a given input path. This project treats
 * a gate that appears to cover more than it does as worse than no gate, so
 * that proof is deliberately routed elsewhere -- to the operator's live
 * sweep recorded in `48-UAT.md` -- and not claimed here.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'
import { KEYBOARD_NAV_CLASS } from '../../../../../helpers/inputModality'

function readGameCardCss(): string {
  const raw = readFileSync(join(__dirname, '..', 'index.css'), 'utf8')
  return stripSourceComments(raw)
}

function readConsoleModeScss(): string {
  const raw = readFileSync(
    join(__dirname, '..', '..', '..', '..', 'ConsoleMode', 'index.scss'),
    'utf8'
  )
  return stripSourceComments(raw)
}

function ruleBody(css: string, selector: RegExp): string {
  const match = css.match(selector)
  if (!match) {
    throw new Error(`could not find a rule matching ${selector}`)
  }
  return match[0]
}

// Single-selector rules are anchored on the start of the file or a preceding
// `}` so `.gameCard:focus-within {` cannot match the second line of the
// grouped `.gameCard:hover,\n.gameCard:focus-within {` selector list.
const GAME_CARD_REST_RULES = /(?:^|\})\s*\.gameCard\s*\{([^}]*)\}/g
const GAME_CARD_HOVER_RULE = /(?:^|\})\s*\.gameCard:hover\s*\{[^}]*\}/
const GAME_CARD_FOCUS_RULE = /(?:^|\})\s*\.gameCard:focus-within\s*\{[^}]*\}/
const GAME_CARD_GROUPED_RULES =
  /(?:^|\})\s*\.gameCard:hover,\s*\.gameCard:focus-within\s*\{([^}]*)\}/g
const GAME_CARD_PARKED_CURSOR_RULE =
  /(?:^|\})\s*body\.controllerLayout \.gameCard:hover:not\(:focus-within\)\s*\{[^}]*\}/
const GAME_LIST_ITEM_HOVER_RULE = /\.gameListItem:hover\s*\{[^}]*\}/
const GAME_LIST_ITEM_FOCUS_RULE = /\.gameListItem:focus-within\s*\{[^}]*\}/

// Stale-focus suppression (260925-pga, scoped to mouse-only sessions by
// 260926-acw, re-scoped from `.gameList` to `.listing` by G-48-8b). Two rule
// bodies for `.gameCard` (ring/box-shadow/z-index, then the scale transform)
// share the same selector text, so this is matched with the global flag and
// both bodies are inspected independently below.
//
// Phase 48 plan 16 (G-48-12a, WR-02): the `.gameCard` suppression is ALSO
// scoped off keyboard mode, so a Tab-focused card keeps its ring while the
// pointer rests over the library. The class name is read from the module that
// sets it, so the stylesheet and the tracker cannot drift apart.
const KEYBOARD_CLASS_PATTERN = KEYBOARD_NAV_CLASS.replace(
  /[.*+?^${}()|[\]\\]/g,
  '\\$&'
)
const GAME_CARD_STALE_FOCUS_SELECTOR = new RegExp(
  `body:not\\(\\.controllerLayout\\):not\\(\\.${KEYBOARD_CLASS_PATTERN}\\)\\s+\\.listing:hover\\s+\\.gameCard:focus-within:not\\(:hover\\)\\s*\\{[^}]*\\}`,
  'g'
)
const GAME_LIST_ITEM_STALE_FOCUS_RULE = new RegExp(
  `body:not\\(\\.controllerLayout\\):not\\(\\.${KEYBOARD_CLASS_PATTERN}\\)\\s+\\.listing:hover\\s+\\.gameListItem:focus-within:not\\(:hover\\)\\s*\\{[^}]*\\}`
)
// Keyboard-mode parked-cursor rule (G-48-12a): the keyboard counterpart of
// `body.controllerLayout .gameCard:hover:not(:focus-within)`.
const GAME_CARD_KEYBOARD_PARKED_CURSOR_RULE = new RegExp(
  `(?:^|\\})\\s*body\\.${KEYBOARD_CLASS_PATTERN}\\s+\\.gameCard:hover:not\\(:focus-within\\)\\s*\\{[^}]*\\}`
)

function groupedRuleBodies(css: string): string[] {
  return [...css.matchAll(GAME_CARD_GROUPED_RULES)].map((m) => m[1])
}

describe('GameCard hover wears the console-style focus ring (source gate, G-48-8b)', () => {
  it('Test A: exactly one grouped .gameCard:hover, .gameCard:focus-within rule declares the ring, consuming the shared tokens, at +2px offset with halo and glow', () => {
    const css = readGameCardCss()
    const ringRules = groupedRuleBodies(css).filter((b) =>
      /(^|[\s;])outline:/.test(b)
    )

    expect(ringRules).toHaveLength(1)
    const body = ringRules[0]
    expect(body).toMatch(/var\(--focus-ring-width/)
    expect(body).toMatch(/var\(--focus-ring-color/)
    expect(body).toMatch(/var\(--focus-ring-halo/)
    expect(body).toMatch(/outline-offset:\s*2px/)
    expect(body).toMatch(/0 0 22px color-mix\(/)
  })

  it('Test B: the only other grouped rule is the shared transform: scale(1.05), so there are exactly two grouped occurrences', () => {
    const css = readGameCardCss()
    const bodies = groupedRuleBodies(css)
    const others = bodies.filter((b) => !/(^|[\s;])outline:/.test(b))

    expect(bodies).toHaveLength(2)
    expect(others).toHaveLength(1)
    expect(others[0]).toMatch(/transform:\s*scale\(1\.05\)/)
  })

  it('Test C: the single-selector .gameCard:hover rule is z-index 2 and the single-selector .gameCard:focus-within rule is z-index 3, and neither declares an outline', () => {
    const css = readGameCardCss()
    const hover = ruleBody(css, GAME_CARD_HOVER_RULE)
    const focus = ruleBody(css, GAME_CARD_FOCUS_RULE)

    expect(hover).toMatch(/z-index:\s*2/)
    expect(hover).not.toMatch(/outline/)
    expect(focus).toMatch(/z-index:\s*3/)
    expect(focus).not.toMatch(/outline/)
  })

  it('Test D: the resting .gameCard outline has the ring geometry, a transparent 3px at +2px, so only colour and shadow animate', () => {
    const css = readGameCardCss()
    const resting = [...css.matchAll(GAME_CARD_REST_RULES)]
      .map((m) => m[1])
      .filter((b) => /(^|[\s;])outline:/.test(b))

    expect(resting).toHaveLength(1)
    expect(resting[0]).toMatch(
      /outline:\s*var\(--focus-ring-width,\s*3px\)\s+solid\s+transparent/
    )
    expect(resting[0]).toMatch(/outline-offset:\s*2px/)
  })

  it('Test E: body.controllerLayout .gameCard:hover:not(:focus-within) returns a parked-cursor card to rest', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_CARD_PARKED_CURSOR_RULE)

    expect(body).toMatch(/outline-color:\s*transparent/)
    expect(body).toMatch(/box-shadow:\s*0px 0px 12px 4px #00000055/)
    expect(body).toMatch(/transform:\s*none/)
    expect(body).toMatch(/z-index:\s*auto/)
  })

  it('Test I: body.keyboardNav .gameCard:hover:not(:focus-within) returns a parked-cursor card to rest while keyboard mode is on', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_CARD_KEYBOARD_PARKED_CURSOR_RULE)

    expect(body).toMatch(/outline-color:\s*transparent/)
    expect(body).toMatch(/box-shadow:\s*0px 0px 12px 4px #00000055/)
    expect(body).toMatch(/transform:\s*none/)
    expect(body).toMatch(/z-index:\s*auto/)
  })

  it('Test F: the grouped ring rule has no bare hex literal outside a var(...) fallback slot', () => {
    const css = readGameCardCss()
    const ring = groupedRuleBodies(css).find((b) => /(^|[\s;])outline:/.test(b))
    expect(ring).toBeDefined()
    const withoutVarSpans = (ring as string).replace(/var\([^)]*\)/g, '')

    expect(withoutVarSpans).not.toMatch(/#[0-9a-fA-F]{3,8}/)
  })

  it('the -webkit-focus-ring-color hairline is gone from the stylesheet', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(/-webkit-focus-ring-color/)
  })

  it('ConsoleMode .consoleCard.focused still spends the same --accent token (read-only cross-file guard)', () => {
    // This does not assert ownership of console mode's styling -- it fails
    // LOUDLY if a future change moves console mode off --accent, because at
    // that moment the two modes silently stop matching and the whole
    // premise of this gate ("matching the highlight border used in console
    // mode") is void.
    const scss = readConsoleModeScss()

    expect(scss).toMatch(/0 0 0 3px var\(--accent/)
  })
})

describe('GameListItem hover and focus stay split (source gate, 260926-acw)', () => {
  it('.gameListItem has separate :hover and :focus-within rules', () => {
    const css = readGameCardCss()

    expect(css).toMatch(GAME_LIST_ITEM_HOVER_RULE)
    expect(css).toMatch(GAME_LIST_ITEM_FOCUS_RULE)
  })

  it('no selector list groups .gameListItem:hover with .gameListItem:focus-within', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(
      /\.gameListItem:hover,\s*\.gameListItem:focus-within/
    )
  })

  it('.gameListItem:hover carries a plain 2px solid var(--accent outline', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_LIST_ITEM_HOVER_RULE)

    expect(body).toMatch(/outline:\s*2px solid var\(--accent/)
    expect(body).not.toMatch(/var\(--focus-ring-/)
  })

  it('.gameListItem:focus-within consumes --focus-ring-color', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_LIST_ITEM_FOCUS_RULE)

    expect(body).toMatch(/var\(--focus-ring-color/)
  })
})

describe('Stale-focus suppression is scoped to body:not(.controllerLayout) .listing:hover (source gate, 260926-acw, G-48-8b Test G)', () => {
  it('two body:not(.controllerLayout) .listing:hover .gameCard:focus-within:not(:hover) rule bodies exist -- ring and scale', () => {
    const css = readGameCardCss()
    const matches = css.match(GAME_CARD_STALE_FOCUS_SELECTOR)

    expect(matches).not.toBeNull()
    expect((matches as RegExpMatchArray).length).toBe(2)
  })

  it('one of those bodies clears the outline and restores the resting box-shadow and z-index -- not just box-shadow: none, which would drop the normal drop shadow', () => {
    const css = readGameCardCss()
    const bodies = css.match(GAME_CARD_STALE_FOCUS_SELECTOR) ?? []
    const ringSuppression = bodies.find((b) => /outline:\s*none/.test(b))

    expect(ringSuppression).toBeDefined()
    expect(ringSuppression).toMatch(/box-shadow:\s*0px 0px 12px 4px #00000055/)
    expect(ringSuppression).not.toMatch(/box-shadow:\s*none/)
    expect(ringSuppression).toMatch(/z-index:\s*auto/)
  })

  it('the other body suppresses the shared scale(1.05) transform back to resting size', () => {
    const css = readGameCardCss()
    const bodies = css.match(GAME_CARD_STALE_FOCUS_SELECTOR) ?? []
    const scaleSuppression = bodies.find((b) => /transform:/.test(b))

    expect(scaleSuppression).toBeDefined()
    expect(scaleSuppression).toMatch(/transform:\s*none/)
  })

  it('body:not(.controllerLayout) .listing:hover .gameListItem:focus-within:not(:hover) clears the row outline, background and box-shadow', () => {
    const css = readGameCardCss()
    const body = ruleBody(css, GAME_LIST_ITEM_STALE_FOCUS_RULE)

    expect(body).toMatch(/outline:\s*none/)
    expect(body).toMatch(/background:\s*none/)
    expect(body).toMatch(/box-shadow:\s*none/)
  })

  it('no stale-focus rule is still scoped to a single .gameList or .gameListLayout: the strip and the grid are separate .gameList elements, so that scope let the strip card re-ring while mousing in the grid', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(/\.gameList:hover/)
    expect(css).not.toMatch(/\.gameListLayout:hover/)
  })

  it('neither suppression rule fires unscoped -- every selector begins with body:not(.controllerLayout), and every one also with :not(.keyboardNav)', () => {
    const css = readGameCardCss()

    expect(css).not.toMatch(
      new RegExp(
        `(?<!body:not\\(\\.controllerLayout\\):not\\(\\.${KEYBOARD_CLASS_PATTERN}\\)\\s+)\\.listing:hover\\s+\\.gameCard:focus-within:not\\(:hover\\)`
      )
    )
    expect(css).not.toMatch(
      new RegExp(
        `(?<!body:not\\(\\.controllerLayout\\):not\\(\\.${KEYBOARD_CLASS_PATTERN}\\)\\s+)\\.listing:hover\\s+\\.gameListItem:focus-within:not\\(:hover\\)`
      )
    )
  })
})

describe('Keyboard mode is tied to the stylesheet (source gate, G-48-12a, Test H)', () => {
  it('Test H: the stylesheet spells the keyboard-mode class exactly as the tracker exports it', () => {
    const css = readGameCardCss()

    expect(css).toContain(`:not(.${KEYBOARD_NAV_CLASS})`)
  })
})
