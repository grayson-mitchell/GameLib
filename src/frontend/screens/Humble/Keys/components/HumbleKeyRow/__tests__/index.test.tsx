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

describe('HumbleKeyRow store indicator (D-42-03)', () => {
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

  it.each(PLATFORM_CASES)(
    '$platform -> "$expectedName" (logo present: $hasLogo)',
    ({ platform, expectedName, hasLogo }) => {
      const key = makeHumbleKey({ platform })
      const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

      const caption = captionText(tree)
      expect(caption).toContain(`${expectedName} · Humble RPG Bundle`)

      const logo = findByClassNamePart(tree, 'humbleKeyRowStoreLogo')
      if (hasLogo) {
        expect(logo).toBeDefined()
      } else {
        expect(logo).toBeUndefined()
      }
    }
  )

  // The field-name collision trap: 'origin' is simultaneously a key_type
  // VALUE (Origin, the EA store) and the unrelated HumbleKey.origin FIELD
  // (the bundle name, e.g. "Humble RPG Bundle"). Pin that the bundle-name
  // half is untouched and was not silently overwritten by the platform's
  // own resolved display name.
  it("pins the 'origin' key_type against overwriting the unrelated origin (bundle-name) field", () => {
    const key = makeHumbleKey({ platform: 'origin', origin: 'Humble Choice' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    expect(captionText(tree)).toBe('Origin · Humble Choice')
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

  it('does not leak the raw lowercase "steam" token into the caption (the actual defect)', () => {
    const key = makeHumbleKey({ platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement
    const caption = captionText(tree)

    expect(caption).toBeDefined()
    expect(caption).not.toContain('steam ·')
    expect(caption).toContain('Steam ·')
  })

  it('the unknown branch fabricates no proper noun for the explicit "generic" sentinel', () => {
    const key = makeHumbleKey({ platform: 'generic' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement
    const caption = captionText(tree)

    expect(caption).toBeDefined()
    expect(caption).not.toContain('Generic')
    expect(caption).not.toContain('generic')
  })

  it('the unknown branch fabricates no proper noun for an unrecognised token', () => {
    const key = makeHumbleKey({ platform: 'wibble' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement
    const caption = captionText(tree)

    expect(caption).toBeDefined()
    expect(caption).not.toContain('Wibble')
    expect(caption).not.toContain('wibble')
  })

  it('renders no caption at all for an UNPICKED pseudo-entry', () => {
    const key = makeHumbleKey({ state: 'UNPICKED', platform: 'steam' })
    const tree = HumbleKeyRow({ humbleKey: key }) as ReactElement

    expect(findByClassNamePart(tree, 'humbleKeyRowCaption')).toBeUndefined()
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
