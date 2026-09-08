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
import type { ReactElement, ReactNode } from 'react'

import { HumbleKey } from 'common/types/humble'
import HumbleKeyRow from '../index'

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
type PropsWithChildren = { children?: ReactNode; className?: string }

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
  tree: ReactElement<PropsWithChildren>
): ReactElement<PropsWithChildren> | undefined {
  const children = tree.props?.children
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

  // GENUINE RED: today the first non-falsy child of the row is the state
  // badge column (or an action column, when a claim/gift/settle prop is
  // supplied) — the logo lives two levels deep inside
  // .humbleKeyRowInfo > .humbleKeyRowCaption. `order:` cannot fix this (it
  // only permutes siblings within one flex container); only a DOM move can.
  it('the store logo is the FIRST non-falsy child of the row for a branded platform', () => {
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    const first = firstRowChild(tree)
    expect(first?.props?.className).toContain('humbleKeyRowStoreLogo')
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
  // pseudo-entry — extended from the pre-existing caption-only pin.
  it('renders no caption and no store logo at all for an UNPICKED pseudo-entry', () => {
    const key = makeHumbleKey({ state: 'UNPICKED', platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    expect(findByClassNamePart(tree, 'humbleKeyRowCaption')).toBeUndefined()
    expect(findByClassNamePart(tree, 'humbleKeyRowStoreLogo')).toBeUndefined()
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

  it('renders a humbleKeyUndoButton and calls onUndoSettle exactly once when clicked', () => {
    const onUndoSettle = jest.fn()
    const key = makeHumbleKey({ platform: 'steam' })
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
    const key = makeHumbleKey({ platform: 'steam' })
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
