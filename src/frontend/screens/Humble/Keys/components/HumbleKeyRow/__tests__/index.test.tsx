/**
 * Unit tests for HumbleKeyRow's D-42-03 store indicator (Phase 42 plan 04).
 *
 * This is the FIRST test file HumbleKeyRow has ever had. Existing coverage
 * of this component is entirely INDIRECT, through the callers that render
 * it (see Waiting/__tests__/index.test.tsx's findHumbleKeyRowProps helper) —
 * none of them pin the caption text or exercise the store indicator this
 * plan adds.
 *
 * HumbleKeyRow has no useState/useEffect (unlike HumbleClaimWizard/
 * HumbleKeysWaiting), so no 'react' hook-slot mock is needed here — the
 * component is invoked directly as a plain function (mirroring
 * `HumbleClaimWizard(props) as unknown as ReactElement` in
 * HumbleClaimWizard/__tests__/index.test.tsx:142) and its returned
 * React-element object graph is inspected without a DOM, following the
 * no-jsdom convention documented in src/frontend/jest.config.js.
 *
 * Only 'react-i18next' is mocked. `HumbleKeyRow` calls BOTH
 * `useTranslation()` and `useTranslation('gamelib')` (for `t` and
 * `tGamelib` respectively) — the mock below ignores its namespace argument
 * entirely, so ONE implementation correctly serves both call sites; it
 * interpolates `{{...}}` into the supplied default string, mirroring
 * HumbleClaimWizard/__tests__/index.test.tsx:39-51.
 *
 * This suite lives in the Frontend jest project (not Backend, where the
 * pure common/humble/keyTypePresentation.test.ts already lives) because
 * HumbleKeyRow is a React component, not a pure common/ helper — it
 * consumes the presentation table but is not itself part of it.
 *
 * `*.svg?react` imports resolve via the Frontend jest project's
 * moduleNameMapper (src/frontend/jest.config.js, Task 1 of this plan) to
 * src/frontend/__mocks__/svgReactStub.tsx. The mapper regex is suffix-only
 * (`\.svg\?react$`), so ALL THREE logo specifiers (steam/gog/epic) resolve
 * to the SAME stub module instance under Jest's module cache — meaning the
 * three brands' logo elements are not distinguishable from one another by
 * identity in this harness. Logo PRESENCE is therefore pinned via the
 * dedicated `.humbleKeyRowStoreLogo` wrapper element HumbleKeyRow renders
 * around the logo (present iff a logo exists for that platform); which
 * brand renders is already pinned by the caption's display NAME text.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

import type { ReactElement, ReactNode } from 'react'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

import { HumbleKey } from 'common/types/humble'
import HumbleKeyRow, { HumbleKeyScenarioId, resolveKeyScenario } from '../index'
import UrgencyBadge from '../../UrgencyBadge'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (
      _key: string,
      defaultValue: string,
      params?: Record<string, unknown>
    ): string =>
      Object.entries(params ?? {}).reduce(
        (str: string, [k, v]) => str.replace(`{{${k}}}`, String(v)),
        defaultValue
      )
  })
}))

function makeHumbleKey(overrides: Partial<HumbleKey> = {}): HumbleKey {
  return {
    gamekey: 'gamekey-1',
    machineName: 'machine-1',
    state: 'UNREVEALED',
    title: 'Some Game',
    platform: 'steam',
    expiration: null,
    origin: 'Humble RPG Bundle',
    ownedElsewhere: false,
    matchConfidence: 'none',
    ...overrides
  }
}

// Copied from HumbleClaimWizard/__tests__/index.test.tsx and
// Waiting/__tests__/index.test.tsx, which both define an identical helper
// set inline — there is no shared test-utils module in this project to
// import them from.
// 260908-vo4: `role`/`aria-label`/`aria-hidden` added as optional fields
// (rather than a separate narrower type) so the same shared helpers
// (collectElements/findByClassNamePart/firstRowChild) can inspect the
// store logo's accessible-name props without a second element-graph type.
type PropsWithChildren = {
  children?: ReactNode
  className?: string
  role?: string
  'aria-label'?: string
  'aria-hidden'?: boolean
}

function collectElements(
  node: ReactNode,
  out: ReactElement<PropsWithChildren>[] = []
): ReactElement<PropsWithChildren>[] {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return out
  }
  if (Array.isArray(node)) {
    node.forEach((child) => collectElements(child as ReactNode, out))
    return out
  }
  if (typeof node === 'object' && 'type' in node) {
    const element = node as ReactElement<PropsWithChildren>
    out.push(element)
    if (element.props?.children !== undefined) {
      collectElements(element.props.children, out)
    }
    return out
  }
  return out
}

function findByClassNamePart(
  tree: ReactNode,
  part: string
): ReactElement<PropsWithChildren> | undefined {
  return collectElements(tree).find((el) => {
    const className = el.props?.className
    return typeof className === 'string' && className.split(' ').includes(part)
  })
}

function textContent(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return ''
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map((child) => textContent(child as ReactNode)).join('')
  }
  if (typeof node === 'object' && 'props' in node) {
    return textContent(
      (node as ReactElement<PropsWithChildren>).props?.children
    )
  }
  return ''
}

function captionText(tree: ReactElement): string | undefined {
  const caption = findByClassNamePart(tree, 'humbleKeyRowCaption')
  return caption ? textContent(caption) : undefined
}

// 260908-vo4: the root element's FIRST non-falsy child, after flattening
// arrays and dropping null/undefined/false — i.e. what actually renders
// first in DOM order, not just the first JSX expression slot (several
// sibling slots are conditionally `false` and contribute nothing).
function firstRowChild(
  tree: ReactElement
): ReactElement<PropsWithChildren> | undefined {
  const children = (tree.props as PropsWithChildren)?.children
  const flat = (Array.isArray(children) ? children : [children]).filter(
    (child) => child !== null && child !== undefined && child !== false
  )
  return flat[0] as ReactElement<PropsWithChildren> | undefined
}

// 260908-vo4: NONE of the assertions in this file measure icon pixel size,
// its position relative to the row's left edge, its vertical alignment on
// a two-line row, or its resolved colour. The Frontend jest project has no
// jsdom and no browser automation (see jest.config.js's docstring) — it
// invokes the component as a plain function and inspects the returned
// React-element graph, which cannot compute CSS. Those claims are carried
// instead by the `ready: live-gate` todos this plan files/amends.
describe('HumbleKeyRow store indicator (D-42-03, redesigned 260908-vo4)', () => {
  type PlatformCase = {
    platform: string
    expectedName: string
    hasLogo: boolean
  }

  // The plan's 10 distinct key_type inputs, plus a dedicated 11th case
  // below for the origin/bundle-name field-name collision trap.
  const PLATFORM_CASES: PlatformCase[] = [
    { platform: 'steam', expectedName: 'Steam', hasLogo: true },
    { platform: 'gog', expectedName: 'GOG', hasLogo: true },
    { platform: 'epic', expectedName: 'Epic Games', hasLogo: true },
    { platform: 'epic_keyless', expectedName: 'Epic Games', hasLogo: true },
    { platform: 'uplay', expectedName: 'Ubisoft Connect', hasLogo: false },
    { platform: 'battlenet', expectedName: 'Battle.net', hasLogo: false },
    { platform: 'origin', expectedName: 'Origin', hasLogo: false },
    { platform: 'nintendo_direct', expectedName: 'Nintendo', hasLogo: false },
    { platform: 'generic', expectedName: 'Other', hasLogo: false },
    { platform: 'wibble', expectedName: 'Other', hasLogo: false }
  ]

  // GENUINE RED (before Task 2): a branded platform's caption used to be
  // `"${name} · ${origin}"` WITH the logo nested inside it. Post-redesign,
  // branded platforms render NO caption at all (the logo alone is the
  // signal, named via aria-label) and no-logo platforms render a caption
  // containing EXACTLY the display name — no ` · `, no origin. `toBe`, not
  // `toContain`: `toContain` would still pass if ` · ` and the origin
  // survived (this repo's recorded toContain blind spot).
  it.each(PLATFORM_CASES)(
    '$platform -> "$expectedName" (logo present: $hasLogo)',
    ({ platform, expectedName, hasLogo }) => {
      const key = makeHumbleKey({ platform })
      const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

      const logo = findByClassNamePart(tree, 'humbleKeyRowStoreLogo')
      if (hasLogo) {
        expect(logo).toBeDefined()
        expect(logo?.props['aria-label']).toBe(expectedName)
        expect(captionText(tree)).toBeUndefined()
      } else {
        expect(logo).toBeUndefined()
        expect(captionText(tree)).toBe(expectedName)
      }
    }
  )

  // Re-pinned for the three-column grid (43-05 Task 2, superseding the old
  // "logo is the row's first DOM child" claim from 260908-vo4): the row's
  // first child is now always the `humbleKeyTypeCell` — the TYPE column
  // renders on every row, branded or not (see the UNPICKED pin below) — and
  // the store logo lives inside it for a branded platform. The store
  // signal still leads the row; only what wraps it changed.
  it('the FIRST child of the row is humbleKeyTypeCell, and the store logo is inside it for a branded platform', () => {
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    const first = firstRowChild(tree)
    expect(first?.props?.className).toBe('humbleKeyTypeCell')
    const logo = collectElements(first?.props?.children).find(
      (el) =>
        typeof el.props?.className === 'string' &&
        el.props.className.split(' ').includes('humbleKeyRowStoreLogo')
    )
    expect(logo).toBeDefined()
  })

  // GENUINE RED: general structural invariant — wherever a caption renders
  // (the no-logo branch only, post-redesign), the store logo must never be
  // nested inside it. Today it is, for every branded platform.
  it.each(PLATFORM_CASES)(
    '$platform: the store logo, if the caption exists at all, is never a descendant of it',
    ({ platform }) => {
      const key = makeHumbleKey({ platform })
      const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement
      const caption = findByClassNamePart(tree, 'humbleKeyRowCaption')
      if (caption === undefined) {
        return
      }
      const logoInsideCaption = collectElements(caption.props?.children).find(
        (el) =>
          typeof el.props?.className === 'string' &&
          el.props.className.split(' ').includes('humbleKeyRowStoreLogo')
      )
      expect(logoInsideCaption).toBeUndefined()
    }
  )

  // GENUINE RED: the logo carries no accessible name today (aria-hidden
  // instead). The SVG stub collapses all three logo modules to one
  // identity in this harness, so aria-label is the only way this suite can
  // tell the brands apart — it replaces the caption text that used to
  // serve that purpose.
  it.each([
    { platform: 'steam', expectedName: 'Steam' },
    { platform: 'gog', expectedName: 'GOG' },
    { platform: 'epic', expectedName: 'Epic Games' }
  ])(
    'the $platform logo carries role="img" + aria-label="$expectedName" and no aria-hidden',
    ({ platform, expectedName }) => {
      const key = makeHumbleKey({ platform })
      const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement
      const logo = findByClassNamePart(tree, 'humbleKeyRowStoreLogo')

      expect(logo).toBeDefined()
      expect(logo?.props.role).toBe('img')
      expect(logo?.props['aria-label']).toBe(expectedName)
      expect(logo?.props['aria-hidden']).toBeUndefined()
    }
  )

  // GENUINE RED: origin erasure. HumbleKey.origin must appear NOWHERE in
  // the rendered row, for both a branded and a no-logo platform — 20 of
  // the operator's 33 live keys carry the gift string
  // "A very special gift just for you", which names no game and must not
  // survive as row text.
  it.each([
    { platform: 'steam', label: 'branded' },
    { platform: 'uplay', label: 'no-logo' }
  ])(
    'the gift-string origin never appears anywhere in the row ($label platform)',
    ({ platform }) => {
      const key = makeHumbleKey({
        platform,
        origin: 'A very special gift just for you'
      })
      const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

      expect(textContent(tree)).not.toContain(
        'A very special gift just for you'
      )
    }
  )

  // The field-name collision trap: 'origin' is simultaneously a key_type
  // VALUE (Origin, the EA store) and the unrelated HumbleKey.origin FIELD
  // (the bundle name, e.g. "Humble Choice"). 260908-vo4: the bundle name is
  // now deliberately UNRENDERED — dropping `origin` from the row is the
  // point of this change, not merely "not overwritten by the platform's
  // own resolved name". The caption renders ONLY the display name.
  it("pins the 'origin' key_type against the unrelated origin (bundle-name) field ever leaking into the caption", () => {
    const key = makeHumbleKey({ platform: 'origin', origin: 'Humble Choice' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    expect(captionText(tree)).toBe('Origin')
  })

  it.each(PLATFORM_CASES)(
    '$platform never renders the GameLib icon fallback (T-42-14)',
    ({ platform }) => {
      const key = makeHumbleKey({ platform })
      const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

      const hasGameLibIcon = collectElements(tree).some((el) => {
        const props = el.props as Record<string, unknown>
        return (
          (typeof props?.src === 'string' &&
            props.src.includes('gamelib-icon')) ||
          props?.alt === 'GameLib'
        )
      })
      expect(hasGameLibIcon).toBe(false)
    }
  )

  // GENUINE RED: previously pinned against the caption text; the caption
  // no longer exists for a branded platform, so the check moves to the
  // whole row's text content plus the logo's accessible name.
  it('does not leak the raw lowercase "steam" token anywhere in the row (the original defect)', () => {
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    expect(textContent(tree)).not.toContain('steam')
    const logo = findByClassNamePart(tree, 'humbleKeyRowStoreLogo')
    expect(logo?.props['aria-label']).toBe('Steam')
  })

  // GENUINE RED: retargeted to the reduced caption — exactly 'Other', no
  // longer `"Other · <origin>"`.
  it('the unknown branch fabricates no proper noun for the explicit "generic" sentinel', () => {
    const key = makeHumbleKey({ platform: 'generic' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    expect(captionText(tree)).toBe('Other')
  })

  it('the unknown branch fabricates no proper noun for an unrecognised token', () => {
    const key = makeHumbleKey({ platform: 'wibble' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    expect(captionText(tree)).toBe('Other')
  })

  // GENUINE RED risk: hoisting the logo out of the `{!isUnpicked && ...}`
  // block is exactly how a Steam glyph would leak onto a Choice-month
  // pseudo-entry — extended from the pre-existing caption-only pin. 43-05
  // Task 2 adds one more assertion: the `humbleKeyTypeCell` element itself
  // still renders (empty) for UNPICKED, so the fixed TYPE track never
  // changes width and the GAME column's left edge never shifts row to row.
  it('renders no caption and no store logo at all for an UNPICKED pseudo-entry, but the TYPE cell still renders', () => {
    const key = makeHumbleKey({ state: 'UNPICKED', platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    expect(findByClassNamePart(tree, 'humbleKeyRowCaption')).toBeUndefined()
    expect(findByClassNamePart(tree, 'humbleKeyRowStoreLogo')).toBeUndefined()
    expect(findByClassNamePart(tree, 'humbleKeyTypeCell')).toBeDefined()
  })

  // REGRESSION PIN, not a RED — passes today AND after Task 2. Encodes the
  // corrected directive: `origin` is dropped, the TITLE is not. Against the
  // 20-of-33 gift-string rows that would otherwise become unidentifiable if
  // this had gone the other way.
  it('the game title still renders even when origin is the gift-string bundle label (REGRESSION PIN)', () => {
    const key = makeHumbleKey({
      title: 'Crusader Kings III',
      origin: 'A very special gift just for you'
    })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    const title = findByClassNamePart(tree, 'humbleKeyRowTitle')
    expect(title).toBeDefined()
    expect(textContent(title)).toBe('Crusader Kings III')
  })

  // D-22 structural pin: with no claimAction/giftAction/undoOverride prop
  // supplied, the row must render ZERO button elements. The store
  // indicator itself adds no button — this proves the indicator did not
  // quietly widen the read-only contract.
  it('renders zero button elements when no action props are supplied (D-22)', () => {
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    const buttons = collectElements(tree).filter((el) => el.type === 'button')
    expect(buttons).toHaveLength(0)
  })
})

// 43-05 Task 2/3: the three-column grid structure and the D-43-17
// "interactivity lives in KEY only" contract. These gates did not exist
// before this plan — the row was a flat six-child flex strip with no single
// place interactivity was required to live.
describe('HumbleKeyRow three-column structure (43-05, D-43-13/14/15/17)', () => {
  // A key configured to render every KEY-cell affordance that CAN
  // legitimately coexist on one row at once: `claimAction` and
  // `giftAction` together, which resolveKeyScenario resolves to the
  // 'claim-and-gift' scenario (D-43-17). Used by the REQ-43-15
  // zero-interactivity gate below so that a pass is NOT vacuous — a row
  // with no affordances configured would trivially have zero buttons
  // anywhere, proving nothing about where they are forbidden from
  // appearing. `claimAction`'s `redeemedAt: null` / `revealedAt: null` /
  // `keyindexResolved: true` combination selects its "Claim"/"Activate"
  // button branch (rather than the Undo or Finish-activation branches),
  // which is the one live `<button>` claimAction can render alongside a
  // gift button on the same row.
  //
  // 43-06 (D-43-17/D-43-14): this fixture PREVIOUSLY also set
  // `ownedElsewhere: true, matchConfidence: 'fuzzy', undoOverride: true`
  // to combine the ownership-override affordances into the same "fully
  // affordanced" row. That combination is no longer reachable:
  // resolveKeyScenario now resolves any ownedElsewhere+fuzzy key straight
  // to 'override-pending' or 'override-undo' (whichever the `undoOverride`
  // flag selects), which structurally EXCLUDES claimAction/giftAction
  // content from rendering on that same row (Rule 1 bug fix — see
  // SUMMARY.md). The fixture is narrowed here to the one combination that
  // remains valid under the new one-scenario-per-row model.
  function makeFullyAffordancedRow(): ReactElement {
    return HumbleKeyRow({
      humbleKey: makeHumbleKey({
        platform: 'steam',
        state: 'UNREVEALED',
        expiration: '2999-01-01T00:00:00.000Z'
      }),
      urgencyTier: 'warning',
      claimAction: {
        revealedAt: null,
        redeemedAt: null,
        keyindexResolved: true,
        onClaim: jest.fn(),
        onFinish: jest.fn(),
        onUndoRedeem: jest.fn()
      },
      giftAction: { giftedAt: null, onGift: jest.fn() }
    }) as ReactElement
  }

  // Elements carrying interactivity, per the D-43-17 contract: a
  // `<button>`, an `<a>`, or any element with a truthy `onClick` prop
  // (defensive — this codebase currently expresses every affordance as a
  // `<button>`, but the gate should not go blind if that ever changes).
  function collectInteractive(
    node: ReactNode
  ): ReactElement<PropsWithChildren & { onClick?: unknown }>[] {
    return collectElements(node).filter(
      (el) =>
        el.type === 'button' ||
        el.type === 'a' ||
        Boolean((el.props as { onClick?: unknown })?.onClick)
    ) as ReactElement<PropsWithChildren & { onClick?: unknown }>[]
  }

  it('renders exactly three direct children — humbleKeyTypeCell, humbleKeyGameCell, humbleKeyColumnCell — in that order', () => {
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    const children = (tree.props as PropsWithChildren)?.children
    const flat = (Array.isArray(children) ? children : [children]).filter(
      (child) => child !== null && child !== undefined && child !== false
    ) as ReactElement<PropsWithChildren>[]

    expect(flat).toHaveLength(3)
    expect(flat.map((el) => el.props?.className)).toEqual([
      'humbleKeyTypeCell',
      'humbleKeyGameCell',
      'humbleKeyColumnCell'
    ])
  })

  // REQ-43-15: TYPE and GAME are strictly presentational. Checked against
  // `makeFullyAffordancedRow()` so the zero result is proof, not vacuity —
  // every affordance this component can render is present on this key, and
  // none of them leaked into TYPE or GAME.
  it('renders zero interactive elements (button/a/onClick) inside humbleKeyTypeCell, for a fully-affordanced row (REQ-43-15)', () => {
    const tree = makeFullyAffordancedRow()
    const typeCell = findByClassNamePart(tree, 'humbleKeyTypeCell')

    expect(typeCell).toBeDefined()
    expect(collectInteractive(typeCell?.props?.children)).toHaveLength(0)
  })

  it('renders zero interactive elements (button/a/onClick) inside humbleKeyGameCell, for a fully-affordanced row (REQ-43-15)', () => {
    const tree = makeFullyAffordancedRow()
    const gameCell = findByClassNamePart(tree, 'humbleKeyGameCell')

    expect(gameCell).toBeDefined()
    expect(collectInteractive(gameCell?.props?.children)).toHaveLength(0)
  })

  // The other half of the non-vacuity proof: the SAME fully-affordanced row
  // DOES render interactive elements, and they are all inside KEY. Without
  // this, the two tests above could pass because `makeFullyAffordancedRow`
  // renders no buttons anywhere.
  it('renders every configured affordance as an interactive element inside humbleKeyColumnCell, for a fully-affordanced row (REQ-43-15)', () => {
    const tree = makeFullyAffordancedRow()
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')

    expect(keyCell).toBeDefined()
    const interactive = collectInteractive(keyCell?.props?.children)
    // The claim button and the gift button — two distinct affordances
    // co-rendered in the 'claim-and-gift' scenario. The override button and
    // its undo-override counterpart belong to a DIFFERENT, mutually
    // exclusive scenario (D-43-14) and cannot appear on this row at all —
    // see makeFullyAffordancedRow's comment above.
    expect(interactive).toHaveLength(2)
  })

  // REQ-43-13: the status line (state badge + expiration) lives in KEY, not
  // GAME.
  it('renders the state badge and expiration inside humbleKeyColumnCell, not humbleKeyGameCell (REQ-43-13)', () => {
    const key = makeHumbleKey({
      platform: 'steam',
      state: 'UNREVEALED',
      expiration: '2999-01-01T00:00:00.000Z'
    })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement
    const gameCell = findByClassNamePart(tree, 'humbleKeyGameCell')
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')

    expect(
      findByClassNamePart(keyCell?.props?.children, 'humbleKeyStateBadge')
    ).toBeDefined()
    expect(
      findByClassNamePart(keyCell?.props?.children, 'humbleKeyRowExpiration')
    ).toBeDefined()
    expect(
      findByClassNamePart(gameCell?.props?.children, 'humbleKeyStateBadge')
    ).toBeUndefined()
    expect(
      findByClassNamePart(gameCell?.props?.children, 'humbleKeyRowExpiration')
    ).toBeUndefined()
  })

  // REQ-43-14: the UrgencyBadge lives in GAME, not KEY. Identified by
  // element-type identity (`el.type === UrgencyBadge`) rather than
  // className, because `HumbleKeyRow({...})` returns an unrendered element
  // graph — `<UrgencyBadge .../>` appears as an element whose `type` is the
  // imported component function itself, not its expanded output.
  it('renders UrgencyBadge inside humbleKeyGameCell, not humbleKeyColumnCell (REQ-43-14)', () => {
    const key = makeHumbleKey({
      platform: 'steam',
      state: 'UNREVEALED',
      expiration: '2999-01-01T00:00:00.000Z'
    })
    const tree = HumbleKeyRow({
      humbleKey: key,
      urgencyTier: 'warning'
    }) as ReactElement
    const gameCell = findByClassNamePart(tree, 'humbleKeyGameCell')
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')

    const inGame = collectElements(gameCell?.props?.children).find(
      (el) => el.type === UrgencyBadge
    )
    const inKey = collectElements(keyCell?.props?.children).find(
      (el) => el.type === UrgencyBadge
    )
    expect(inGame).toBeDefined()
    expect(inKey).toBeUndefined()
  })

  // D-42's ownership badge and its fuzzy-only "Not the same game" override,
  // plus the WR-04 undo-override counterpart, all moved from the old
  // .humbleKeyRowInfo (GAME today) into KEY — this is the specific thing
  // this plan's move changes about D-42's affordance placement.
  //
  // 43-06 (D-43-17/D-43-14, Rule 1 bug fix): this test PREVIOUSLY asserted
  // `ownedBadgesInKey.toHaveLength(2)` for a key with BOTH
  // `ownedElsewhere: true, matchConfidence: 'fuzzy'` AND `undoOverride:
  // true` supplied simultaneously — i.e. it asserted that the
  // 'override-pending' badge (with its "Not the same game" button) and the
  // 'override-undo' badge (with its "Undo — I do own this game" button)
  // rendered TOGETHER on the same row. That is exactly the bug D-43-14
  // forbids: an override record's existence (`undoOverride`) and the raw
  // fuzzy-match flags are two different signals about the SAME override
  // question, and only one of the two answers can ever be true at once for
  // a real key. resolveKeyScenario now enforces this — `undoOverride` is
  // checked BEFORE the fuzzy-match override-pending branch and wins
  // outright — so this scenario resolves to exactly ONE badge. The two
  // branches are re-pinned as separate tests below, each independently
  // proving KEY-not-GAME placement.
  it("renders ONLY the override-undo badge inside humbleKeyColumnCell when undoOverride is set, even though the key's raw flags also look like a pending fuzzy override (D-43-14 mutual exclusion)", () => {
    const key = makeHumbleKey({
      platform: 'steam',
      ownedElsewhere: true,
      matchConfidence: 'fuzzy'
    })
    const tree = HumbleKeyRow({
      humbleKey: key,
      undoOverride: true
    }) as ReactElement
    const gameCell = findByClassNamePart(tree, 'humbleKeyGameCell')
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')

    const ownedBadgesInKey = collectElements(keyCell?.props?.children).filter(
      (el) =>
        typeof el.props?.className === 'string' &&
        el.props.className.split(' ').includes('humbleKeyOwnedBadge')
    )
    const ownedBadgesInGame = collectElements(gameCell?.props?.children).filter(
      (el) =>
        typeof el.props?.className === 'string' &&
        el.props.className.split(' ').includes('humbleKeyOwnedBadge')
    )
    expect(ownedBadgesInKey).toHaveLength(1)
    expect(ownedBadgesInGame).toHaveLength(0)
    expect(textContent(ownedBadgesInKey[0])).toContain(
      'Undo — I do own this game'
    )
    expect(textContent(ownedBadgesInKey[0])).not.toContain('Not the same game')
  })

  it('renders ONLY the override-pending badge (with "Not the same game") inside humbleKeyColumnCell when undoOverride is absent', () => {
    const key = makeHumbleKey({
      platform: 'steam',
      ownedElsewhere: true,
      matchConfidence: 'fuzzy'
    })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement
    const gameCell = findByClassNamePart(tree, 'humbleKeyGameCell')
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')

    const ownedBadgesInKey = collectElements(keyCell?.props?.children).filter(
      (el) =>
        typeof el.props?.className === 'string' &&
        el.props.className.split(' ').includes('humbleKeyOwnedBadge')
    )
    const ownedBadgesInGame = collectElements(gameCell?.props?.children).filter(
      (el) =>
        typeof el.props?.className === 'string' &&
        el.props.className.split(' ').includes('humbleKeyOwnedBadge')
    )
    expect(ownedBadgesInKey).toHaveLength(1)
    expect(ownedBadgesInGame).toHaveLength(0)
    expect(textContent(ownedBadgesInKey[0])).toContain('Not the same game')
    expect(textContent(ownedBadgesInKey[0])).not.toContain(
      'Undo — I do own this game'
    )
  })
})

// 43-06 (D-43-17): one describe per row of the UI-SPEC's KEY-Column
// Scenario Matrix, plus the two REQ-43-01/REQ-43-11 mutation-proof targets
// recorded verbatim in 43-06-SUMMARY.md.
describe('HumbleKeyRow KEY-column scenario resolution (D-43-17, Phase 43 plan 06)', () => {
  function makeClaimAction(
    overrides: Partial<{
      revealedAt: number | null
      redeemedAt: number | null
      keyindexResolved: boolean
    }> = {}
  ) {
    return {
      revealedAt: null,
      redeemedAt: null,
      keyindexResolved: true,
      onClaim: jest.fn(),
      onFinish: jest.fn(),
      onUndoRedeem: jest.fn(),
      ...overrides
    }
  }

  // 'pick' (REQ-43-02). Extends, does not replace, the pre-existing
  // UNPICKED pin (no caption, no store logo, TYPE cell still renders) —
  // that pin lives in the 'store indicator' describe block above.
  it("renders exactly one button — the pickOnHumble default — inside humbleKeyColumnCell for an UNPICKED key ('pick' scenario, REQ-43-02)", () => {
    const onPickOnHumble = jest.fn()
    const key = makeHumbleKey({ state: 'UNPICKED', platform: 'steam' })
    const tree = HumbleKeyRow({
      humbleKey: key,
      onPickOnHumble
    }) as ReactElement

    const buttons = collectElements(tree).filter((el) => el.type === 'button')
    expect(buttons).toHaveLength(1)
    expect(textContent(buttons[0])).toBe('Pick on Humble')
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')
    expect(
      collectElements(keyCell?.props?.children).some(
        (el) => el.type === 'button'
      )
    ).toBe(true)
    ;(buttons[0].props as { onClick?: () => void }).onClick?.()
    expect(onPickOnHumble).toHaveBeenCalledTimes(1)
  })

  // 'expired' (REQ-43-03). Asserts absence directly — configured WITH both
  // a claimAction and a giftAction so the zero-buttons result is proof, not
  // vacuity: 'expired' suppresses every affordance outright, never folded
  // into 'settled' (D-43-03 — "you have it" and "you lost it" are
  // different facts).
  it("renders ZERO button elements anywhere for an UNREDEEMABLE key, and its state badge reads the Expired label, even when claim/gift actions are supplied ('expired' scenario, REQ-43-03)", () => {
    const key = makeHumbleKey({ state: 'UNREDEEMABLE', platform: 'steam' })
    const tree = HumbleKeyRow({
      humbleKey: key,
      claimAction: makeClaimAction(),
      giftAction: { giftedAt: null, onGift: jest.fn() }
    }) as ReactElement

    const buttons = collectElements(tree).filter((el) => el.type === 'button')
    expect(buttons).toHaveLength(0)
    const badge = findByClassNamePart(tree, 'humbleKeyStateBadge')
    expect(textContent(badge)).toBe('Expired')
  })

  // 'login-and-claim' (REQ-43-10). The toggle from false to true, with
  // every other input identical, is what makes this non-vacuous.
  it("renders exactly one full-width button naming the store when storeLoginConnected is false, and switches to the claim-and-gift pair when true, with everything else identical ('login-and-claim' scenario, REQ-43-10)", () => {
    const onLoginAndClaim = jest.fn()
    const claimAction = makeClaimAction()
    const key = makeHumbleKey({ platform: 'steam' })

    const disconnectedTree = HumbleKeyRow({
      humbleKey: key,
      claimAction,
      storeLoginConnected: false,
      onLoginAndClaim
    }) as ReactElement
    const disconnectedButtons = collectElements(disconnectedTree).filter(
      (el) => el.type === 'button'
    )
    expect(disconnectedButtons).toHaveLength(1)
    expect(textContent(disconnectedButtons[0])).toBe('Log into Steam and claim')
    ;(disconnectedButtons[0].props as { onClick?: () => void }).onClick?.()
    expect(onLoginAndClaim).toHaveBeenCalledTimes(1)

    const connectedTree = HumbleKeyRow({
      humbleKey: key,
      claimAction,
      storeLoginConnected: true,
      onLoginAndClaim
    }) as ReactElement
    const connectedButtons = collectElements(connectedTree).filter(
      (el) => el.type === 'button'
    )
    expect(connectedButtons).toHaveLength(1)
    expect(textContent(connectedButtons[0])).toBe('Activate')
  })

  // 'claim-and-gift' (REQ-43-11/D-43-13). MUTATION PROOF 1 TARGET — see
  // 43-06-SUMMARY.md "Mutation Proofs" for the verbatim before/after run.
  // storeLoginConnected is deliberately `undefined` here (the realistic
  // value a caller passes for a platform with no login store at all) —
  // this is what makes the proof meaningful: if resolveKeyScenario were
  // mutated to return 'login-and-claim' for uplay unconditionally, THIS
  // test (not just a hypothetical storeLoginConnected: false case) would
  // fail, because D-43-13 says scenario 1 must be structurally
  // unreachable for a no-login-store platform regardless of caller input.
  it.each([
    'uplay',
    'battlenet',
    'origin',
    'origin_keyless',
    'nintendo_direct',
    'generic'
  ])(
    "%s (no GameLib login store, D-43-13) never renders login-and-claim's text even though it has a claimAction (REQ-43-11)",
    (platform) => {
      const tree = HumbleKeyRow({
        humbleKey: makeHumbleKey({ platform }),
        claimAction: makeClaimAction(),
        storeLoginConnected: undefined
      }) as ReactElement

      expect(textContent(tree)).not.toContain('Log into')
    }
  )

  it("a Steam claim-and-gift row still says 'Activate'; a non-Steam claim-and-gift row says 'Claim on {{store}}' (REQ-43-11)", () => {
    const claimAction = makeClaimAction()
    const steamTree = HumbleKeyRow({
      humbleKey: makeHumbleKey({ platform: 'steam' }),
      claimAction
    }) as ReactElement
    const gogTree = HumbleKeyRow({
      humbleKey: makeHumbleKey({ platform: 'gog' }),
      claimAction
    }) as ReactElement

    const steamButton = collectElements(steamTree).find(
      (el) => el.type === 'button'
    )
    const gogButton = collectElements(gogTree).find(
      (el) => el.type === 'button'
    )
    expect(textContent(steamButton)).toBe('Activate')
    expect(textContent(gogButton)).toBe('Claim on GOG')
  })

  // Pitfall C: a disabled state is a caption, never a `disabled` button.
  it('renders humbleKeyClaimDisabledCaption and zero claim buttons when keyindexResolved is false (Pitfall C)', () => {
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({
      humbleKey: key,
      claimAction: makeClaimAction({ keyindexResolved: false })
    }) as ReactElement

    const caption = findByClassNamePart(tree, 'humbleKeyClaimDisabledCaption')
    expect(caption).toBeDefined()
    expect(textContent(caption)).toBe('Sync to enable claiming')
    const buttons = collectElements(tree).filter((el) => el.type === 'button')
    expect(buttons).toHaveLength(0)
  })

  // 260925-j58: a code-assuming affordance is never offered to a keyless
  // entitlement (the rule T-UIC-01 and isGiftable already express, third
  // site). "Finish activation" routes to openWizard(key, 'finish') — the
  // reveal/redeem wizard — against an entitlement that has no code, so the
  // button is a dead end. These four cases pin the exemption AND both
  // regressions it must not cause.
  it.each([
    ['gog_keyless', 'Claimed on GOG — no key needed'],
    ['epic_keyless', 'Claimed on Epic Games — no key needed']
  ])(
    'a REVEALED %s row renders zero buttons and a humbleKeyClaimAnnotation reading %j (260925-j58)',
    (platform, expected) => {
      const tree = HumbleKeyRow({
        humbleKey: makeHumbleKey({ state: 'REVEALED', platform }),
        claimAction: makeClaimAction()
      }) as ReactElement

      const buttons = collectElements(tree).filter((el) => el.type === 'button')
      expect(buttons).toHaveLength(0)

      // The cell must never be EMPTY. For a keyless key
      // `claimAction.revealedAt` is always null (no local reveal record can
      // exist for an entitlement that was never revealed), so the existing
      // "Revealed {date}" annotation renders nothing — a bare suppression
      // would delete the row's only information.
      const annotation = findByClassNamePart(tree, 'humbleKeyClaimAnnotation')
      expect(annotation).toBeDefined()
      expect(textContent(annotation)).toBe(expected)
    }
  )

  // REGRESSION GUARD (CR-01): the keyed sibling of the case above must come
  // out byte-identical — a key revealed on Humble's WEBSITE still needs its
  // Finish-activation path.
  it("a REVEALED keyed 'gog' row still renders a 'Finish activation' button (CR-01 unregressed, 260925-j58)", () => {
    const tree = HumbleKeyRow({
      humbleKey: makeHumbleKey({ state: 'REVEALED', platform: 'gog' }),
      claimAction: makeClaimAction()
    }) as ReactElement

    const buttons = collectElements(tree).filter((el) => el.type === 'button')
    expect(buttons).toHaveLength(1)
    expect(textContent(buttons[0])).toBe('Finish activation')
  })

  // REGRESSION GUARD (260823-op3): a REVEALED Steam key still activates in
  // one click and keeps its own verb.
  it("a REVEALED 'steam' row still renders an 'Activate' button (260823-op3 unregressed, 260925-j58)", () => {
    const tree = HumbleKeyRow({
      humbleKey: makeHumbleKey({ state: 'REVEALED', platform: 'steam' }),
      claimAction: makeClaimAction()
    }) as ReactElement

    const buttons = collectElements(tree).filter((el) => el.type === 'button')
    expect(buttons).toHaveLength(1)
    expect(textContent(buttons[0])).toBe('Activate')
  })

  // MUTATION PROOF 2 TARGET — see 43-06-SUMMARY.md "Mutation Proofs" for
  // the verbatim before/after run. Exhaustively covers every combination of
  // the three inputs resolveKeyScenario's override branch reads, so a
  // regression that lets 'override-pending' and 'override-undo' both
  // render cannot hide behind an untested combination.
  it('across every combination of ownedElsewhere, matchConfidence and undoOverride, at most one humbleKeyOwnedOverride-classed element ever renders (D-43-14, REQ-43-12)', () => {
    const ownedElsewhereValues = [true, false]
    const matchConfidenceValues: Array<HumbleKey['matchConfidence']> = [
      'exact',
      'fuzzy',
      'none'
    ]
    const undoOverrideValues: Array<boolean | undefined> = [
      true,
      false,
      undefined
    ]

    for (const ownedElsewhere of ownedElsewhereValues) {
      for (const matchConfidence of matchConfidenceValues) {
        for (const undoOverride of undoOverrideValues) {
          const key = makeHumbleKey({
            platform: 'steam',
            ownedElsewhere,
            matchConfidence
          })
          const tree = HumbleKeyRow({
            humbleKey: key,
            undoOverride
          }) as ReactElement

          const overrideButtons = collectElements(tree).filter(
            (el) =>
              typeof el.props?.className === 'string' &&
              el.props.className.split(' ').includes('humbleKeyOwnedOverride')
          )
          expect(overrideButtons.length).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  // REQ-43-01: generic-platform rows get NO special scenario — whichever
  // scenario the SAME state/ownedElsewhere/matchConfidence combination
  // resolves to for any other platform. Proven two ways: (1) direct
  // resolver equality across all 5 states, with platform as the only
  // variable, and (2) a rendered check that a generic row with a
  // claimAction gets the SAME claim-and-gift button shape as steam,
  // differing only in the button's label (TYPE cell content is the only
  // other difference, already pinned by the PLATFORM_CASES table above).
  it.each([
    'UNPICKED',
    'UNREVEALED',
    'REVEALED',
    'REDEEMED',
    'UNREDEEMABLE'
  ] as const)(
    'a generic-platform key in %s state resolves to the same scenario a steam key in that state would (REQ-43-01)',
    (state) => {
      const common = {
        hasGiftAction: false,
        hasClaimAction: false,
        hasSettleAction: false,
        undoOverride: false,
        storeLoginConnected: undefined
      }
      const steamScenario: HumbleKeyScenarioId = resolveKeyScenario({
        humbleKey: {
          state,
          ownedElsewhere: false,
          matchConfidence: 'none',
          platform: 'steam'
        },
        ...common
      })
      const genericScenario: HumbleKeyScenarioId = resolveKeyScenario({
        humbleKey: {
          state,
          ownedElsewhere: false,
          matchConfidence: 'none',
          platform: 'generic'
        },
        ...common
      })
      expect(genericScenario).toBe(steamScenario)
    }
  )

  it('a generic-platform row with a claimAction renders the same claim-and-gift button shape as steam, differing only in the label (D-43-01: no special generic scenario)', () => {
    const claimAction = makeClaimAction()
    const steamTree = HumbleKeyRow({
      humbleKey: makeHumbleKey({ platform: 'steam' }),
      claimAction
    }) as ReactElement
    const genericTree = HumbleKeyRow({
      humbleKey: makeHumbleKey({ platform: 'generic' }),
      claimAction
    }) as ReactElement

    const steamButtons = collectElements(steamTree).filter(
      (el) => el.type === 'button'
    )
    const genericButtons = collectElements(genericTree).filter(
      (el) => el.type === 'button'
    )
    expect(steamButtons).toHaveLength(1)
    expect(genericButtons).toHaveLength(1)
    expect(textContent(steamButtons[0])).toBe('Activate')
    expect(textContent(genericButtons[0])).toBe('Claim on Other')
  })

  // REQ-43-15 re-run (43-05's gate), against a row rendering
  // 'claim-and-gift' WITH an override pending elsewhere in the suite
  // (see makeFullyAffordancedRow above) — the new buttons this plan adds
  // must not have leaked interactivity into TYPE or GAME either.
  it('renders zero interactive elements inside humbleKeyTypeCell or humbleKeyGameCell for a login-and-claim row (REQ-43-15 re-run)', () => {
    const tree = HumbleKeyRow({
      humbleKey: makeHumbleKey({ platform: 'steam' }),
      claimAction: makeClaimAction(),
      storeLoginConnected: false,
      onLoginAndClaim: jest.fn()
    }) as ReactElement
    const typeCell = findByClassNamePart(tree, 'humbleKeyTypeCell')
    const gameCell = findByClassNamePart(tree, 'humbleKeyGameCell')

    const interactiveInType = collectElements(typeCell?.props?.children).filter(
      (el) => el.type === 'button' || el.type === 'a'
    )
    const interactiveInGame = collectElements(gameCell?.props?.children).filter(
      (el) => el.type === 'button' || el.type === 'a'
    )
    expect(interactiveInType).toHaveLength(0)
    expect(interactiveInGame).toHaveLength(0)
  })
})

// 43-05 Task 3: this proves the CSS source declares one shared grid
// template for the header row and every data row — it proves the STRING
// was written, and proves NOTHING about the rendered column geometry.
// This project has no jsdom and no browser automation (jest.config.js's
// docstring), so no test here (or anywhere in this suite) can measure a
// computed width. REQ-43-19's actual verification is plan 43-09's live
// gate.
describe('Humble Keys index.css column geometry (source census only, REQ-43-19 verified live in 43-09)', () => {
  it('declares exactly one grid-template-columns rule for the shared row/column-header geometry, on the combined .humbleKeysColumnHeader, .humbleKeyRow selector', () => {
    const css = readFileSync(join(__dirname, '../../../index.css'), 'utf-8')

    // 260911-t0p added a second, unrelated grid-template-columns
    // declaration scoped to `.humbleKeysSortPicker` (an explicit
    // column-width fix for that picker's own label/select layout -- see
    // the fix comment on that rule) -- this test's invariant is about the
    // SHARED row/column-header geometry only, so it now expects exactly
    // two file-wide occurrences; the sibling test below separately proves
    // the second one is that deliberate sort-picker rule and not a stray
    // duplicate of the row geometry.
    const matches = css.match(/grid-template-columns/g) ?? []
    expect(matches).toHaveLength(2)

    const declarationIndex = css.indexOf('grid-template-columns')
    const precedingCss = css.slice(0, declarationIndex)
    const selectorBlockStart = precedingCss.lastIndexOf(
      '.humbleKeysColumnHeader'
    )
    // The selector list must appear immediately before the declaration
    // (i.e. no closing brace of an unrelated rule in between).
    const closingBraceBetween = precedingCss
      .slice(selectorBlockStart)
      .indexOf('}')
    expect(selectorBlockStart).toBeGreaterThan(-1)
    expect(closingBraceBetween).toBe(-1)
    expect(precedingCss.slice(selectorBlockStart)).toContain('.humbleKeyRow')
  })

  it('the second grid-template-columns occurrence is the deliberate .humbleKeysSortPicker rule, not a stray duplicate of the row geometry (260911-t0p)', () => {
    const css = readFileSync(join(__dirname, '../../../index.css'), 'utf-8')

    const firstIndex = css.indexOf('grid-template-columns')
    const secondIndex = css.indexOf('grid-template-columns', firstIndex + 1)
    expect(secondIndex).toBeGreaterThan(-1)

    const precedingSecond = css.slice(0, secondIndex)
    const secondSelectorBlockStart = precedingSecond.lastIndexOf(
      '.humbleKeysSortPicker'
    )
    // The selector must appear immediately before the declaration (i.e. no
    // closing brace of an unrelated rule in between).
    const closingBraceBetween = precedingSecond
      .slice(secondSelectorBlockStart)
      .indexOf('}')
    expect(secondSelectorBlockStart).toBeGreaterThan(-1)
    expect(closingBraceBetween).toBe(-1)
  })

  it('SANITY: the two-occurrence check above fails against a known-bad input with only one declaration -- proves it is not vacuously true', () => {
    const oneDeclarationOnly =
      '.humbleKeysColumnHeader,\n.humbleKeyRow {\n  grid-template-columns: 1fr;\n}'
    const matches = oneDeclarationOnly.match(/grid-template-columns/g) ?? []
    expect(matches).toHaveLength(1)
  })
})

// D-42-01 Exception 4 (Phase 42 plan 06): the reversal affordance for a key
// settled from an exact-match Steam ownership signal. An `ownedElsewhere`
// key never reaches Keys-waiting (viewFilters.ts:62), so `claimAction` is
// never supplied for it — `settleAction` is the ONLY way this row can ever
// render an Undo for such a key.
describe('HumbleKeyRow settleAction (D-42-01 Exception 4, Phase 42 plan 06)', () => {
  function findUndoButtons(
    tree: ReactElement
  ): ReactElement<PropsWithChildren & { onClick?: () => void }>[] {
    return collectElements(tree).filter(
      (el) =>
        el.type === 'button' &&
        typeof el.props?.className === 'string' &&
        el.props.className.split(' ').includes('humbleKeyUndoButton')
    ) as ReactElement<PropsWithChildren & { onClick?: () => void }>[]
  }

  // 43-06 (D-43-17): `resolveKeyScenario` only reaches the 'settled'
  // scenario for `ownedElsewhere: true, matchConfidence: 'exact'` — the
  // exact shape D-48's keep-last-known behaviour actually leaves on a real
  // auto-settled key (library.ts:258-259 carries `ownedElsewhere`/
  // `matchConfidence` forward through the settle, never clearing them).
  // These fixtures now set both explicitly, where the pre-scenario-resolver
  // version of this test did not need to.
  it('renders a humbleKeyUndoButton and calls onUndoSettle exactly once when clicked', () => {
    const onUndoSettle = jest.fn()
    const key = makeHumbleKey({
      platform: 'steam',
      ownedElsewhere: true,
      matchConfidence: 'exact'
    })
    const tree = HumbleKeyRow({
      humbleKey: key,
      settleAction: { settledAt: 1700000000000, onUndoSettle }
    }) as ReactElement

    const undoButtons = findUndoButtons(tree)
    expect(undoButtons).toHaveLength(1)
    undoButtons[0].props.onClick?.()
    expect(onUndoSettle).toHaveBeenCalledTimes(1)
  })

  it('renders the "Already in your Steam library" caption', () => {
    const key = makeHumbleKey({
      platform: 'steam',
      ownedElsewhere: true,
      matchConfidence: 'exact'
    })
    const tree = HumbleKeyRow({
      humbleKey: key,
      settleAction: { settledAt: 1700000000000, onUndoSettle: jest.fn() }
    }) as ReactElement

    expect(textContent(tree)).toContain('Already in your Steam library')
  })

  // D-22 structural pin, re-stated for Exception 4 specifically: adding
  // settleAction to the contract block must not widen the read-only
  // default when the prop is simply absent.
  it('renders zero button elements without settleAction (and without claimAction/giftAction/undoOverride)', () => {
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    const buttons = collectElements(tree).filter((el) => el.type === 'button')
    expect(buttons).toHaveLength(0)
  })

  // Defensive mutual-exclusion rule (index.tsx's `!claimAction` guard): no
  // real caller supplies both props, but if one somehow did, claimAction's
  // richer Keys-waiting affordance must win and settleAction's Undo must
  // not also render — never two Undo controls on one row.
  it('renders exactly one Undo control when BOTH claimAction and settleAction are supplied — claimAction wins', () => {
    const onUndoRedeem = jest.fn()
    const onUndoSettle = jest.fn()
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({
      humbleKey: key,
      claimAction: {
        revealedAt: null,
        redeemedAt: 1600000000000,
        keyindexResolved: true,
        onClaim: jest.fn(),
        onFinish: jest.fn(),
        onUndoRedeem
      },
      settleAction: { settledAt: 1700000000000, onUndoSettle }
    }) as ReactElement

    const undoButtons = findUndoButtons(tree)
    expect(undoButtons).toHaveLength(1)
    undoButtons[0].props.onClick?.()
    expect(onUndoRedeem).toHaveBeenCalledTimes(1)
    expect(onUndoSettle).not.toHaveBeenCalled()
  })
})

// D-43-11/REQ-43-24 (Phase 43 plan 09): the probe named on
// `43-PROBE-D-43-11.md` selected candidate B -- the Phase 40 embedded store
// browser pointed at Humble's own keys page -- after candidate A (the
// reveal endpoint) measured a definitive `success=false` denial for a real,
// precondition-satisfied gog_keyless entitlement, and after the
// external-browser fallback was rejected as a primary path (operator asked
// to stay in-app). This block pins that destination: the label names where
// the click actually goes, and it must never claim GOG's own site is the
// destination, because the embed opens Humble's, not GOG's.
//
// KNOWN LIMIT OF THIS COVERAGE (carried verbatim from the probe's residual
// unknowns): behaviour when the GOG-to-Humble account link is ABSENT on the
// operator's Humble account is unmeasured -- there is no second, unlinked
// test account, and the probe's n=1 sample is now consumed (moved out of
// UNREVEALED) and cannot be re-attempted. This test suite exercises only
// the UI destination-and-label contract; it cannot and does not assert
// anything about server-side behaviour for an unlinked account.
describe('gog_keyless KEY destination (REQ-43-24, D-43-11)', () => {
  function makeGogKeylessRow(): ReactElement {
    return HumbleKeyRow({
      humbleKey: makeHumbleKey({
        platform: 'gog_keyless',
        state: 'UNREVEALED'
      }),
      claimAction: {
        revealedAt: null,
        redeemedAt: null,
        keyindexResolved: true,
        onClaim: jest.fn(),
        onFinish: jest.fn(),
        onUndoRedeem: jest.fn()
      }
    }) as ReactElement
  }

  it('renders exactly one claim affordance in humbleKeyColumnCell -- not two, not zero', () => {
    const tree = makeGogKeylessRow()
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')

    expect(keyCell).toBeDefined()
    const buttons = collectElements(keyCell?.props?.children).filter(
      (el) => el.type === 'button'
    )
    expect(buttons).toHaveLength(1)
  })

  it('the claim button\'s label is exactly "Claim on Humble" -- the SELECTED BRANCH (candidate B) destination', () => {
    const tree = makeGogKeylessRow()
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')
    const button = collectElements(keyCell?.props?.children).find(
      (el) => el.type === 'button'
    )

    expect(button).toBeDefined()
    expect(textContent(button?.props?.children).trim()).toBe('Claim on Humble')
  })

  it('the label does not contain "GOG" -- the click reaches Humble\'s site, not GOG\'s, and must not imply otherwise', () => {
    const tree = makeGogKeylessRow()
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')
    const button = collectElements(keyCell?.props?.children).find(
      (el) => el.type === 'button'
    )

    expect(textContent(button?.props?.children)).not.toContain('GOG')
  })

  // Candidates A and B both stay inside the app (a reveal-and-redeem call
  // and an embedded browser, respectively) -- only the rejected
  // external-browser fallback would leave the window, and that branch was
  // not built. No external-link icon should appear on this row's claim
  // button.
  it('renders no faExternalLinkAlt icon on the claim button -- the embed stays inside the app', () => {
    const tree = makeGogKeylessRow()
    const keyCell = findByClassNamePart(tree, 'humbleKeyColumnCell')
    const button = collectElements(keyCell?.props?.children).find(
      (el) => el.type === 'button'
    )

    const icon = collectElements(button?.props?.children).find(
      (el) => el.type === FontAwesomeIcon
    )
    expect(icon).toBeUndefined()
  })

  // The destination choice is a KEY-column concern only. gog_keyless still
  // presents as a branded GOG platform in TYPE (keyTypePresentation.ts:89)
  // -- the identity of the entitlement and the destination of the claim
  // click are two different facts, and this plan changes only the second.
  it('still renders the GOG branded logo in humbleKeyTypeCell -- the destination choice did not leak into platform identity', () => {
    const tree = makeGogKeylessRow()
    const typeCell = findByClassNamePart(tree, 'humbleKeyTypeCell')
    const logo = findByClassNamePart(
      typeCell?.props?.children,
      'humbleKeyRowStoreLogo'
    )

    expect(logo).toBeDefined()
    expect(logo?.props['aria-label']).toBe('GOG')
  })

  it('renders exactly three direct children in order, unchanged geometry (43-05)', () => {
    const tree = makeGogKeylessRow()
    const children = (tree.props as PropsWithChildren)?.children
    const flat = (Array.isArray(children) ? children : [children]).filter(
      (child) => child !== null && child !== undefined && child !== false
    ) as ReactElement<PropsWithChildren>[]

    expect(flat).toHaveLength(3)
    expect(flat.map((el) => el.props?.className)).toEqual([
      'humbleKeyTypeCell',
      'humbleKeyGameCell',
      'humbleKeyColumnCell'
    ])
  })

  it('renders zero interactive elements (button/a/onClick) inside humbleKeyTypeCell (REQ-43-15)', () => {
    const tree = makeGogKeylessRow()
    const typeCell = findByClassNamePart(tree, 'humbleKeyTypeCell')
    const interactive = collectElements(typeCell?.props?.children).filter(
      (el) =>
        el.type === 'button' ||
        el.type === 'a' ||
        Boolean((el.props as { onClick?: unknown })?.onClick)
    )

    expect(interactive).toHaveLength(0)
  })

  it('renders zero interactive elements (button/a/onClick) inside humbleKeyGameCell (REQ-43-15)', () => {
    const tree = makeGogKeylessRow()
    const gameCell = findByClassNamePart(tree, 'humbleKeyGameCell')
    const interactive = collectElements(gameCell?.props?.children).filter(
      (el) =>
        el.type === 'button' ||
        el.type === 'a' ||
        Boolean((el.props as { onClick?: unknown })?.onClick)
    )

    expect(interactive).toHaveLength(0)
  })
})
