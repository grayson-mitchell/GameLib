/**
 * Source-text gate for the two Humble Keys light-theme defects found by the
 * Phase 43 REQ-43-19 live gate on 2026-09-11 and fixed by quick task
 * 260911-p6s:
 *
 * 1. The row/column-header/sort-picker `--divider` fallback was white-biased
 *    (`rgba(255, 255, 255, 0.08)`), effectively invisible against a light
 *    background (measured delta 2 against a required >=3).
 * 2. The GOG store logo never resolved through `currentColor` because
 *    `styles/_colors.scss:101`'s global `.gogIcon { fill: var(--text-default) }`
 *    matched the SVG's root element directly, beating the inherited
 *    `fill: currentColor` `.humbleKeyRowStoreLogo` supplies.
 *
 * Why a source gate and not a render test: `src/frontend/jest.config.js`
 * configures the Frontend project with `testEnvironment: 'node'` -- there is
 * no jsdom and no CSS engine here, so nothing in this file can compute
 * inheritance, resolve `currentColor`, or evaluate `color-mix`. This can only
 * prove the SOURCE says the right thing; it can never prove either fix
 * RENDERS correctly. The adjudicator of appearance is the next Phase 43
 * REQ-43-19 live gate run, which is why both todos this plan touches stay
 * OPEN at `ready: live-gate` rather than closing:
 *   .planning/todos/pending/2026-09-08-humble-key-row-store-logo-fill-currentcolor-unverified-live.md
 *   .planning/todos/pending/2026-09-11-humble-key-row-separator-is-invisible-in-light-themes.md
 *
 * `--divider` itself is deliberately declared in only 2 of the 11 theme
 * blocks in `themes.scss` -- universalising it is actively forbidden by two
 * existing NavShell gates, so a theme-side fix is not available here and
 * this file must not attempt one:
 *   src/frontend/components/UI/NavShell/__tests__/themeTokens.test.ts:285
 *     ("census: --divider is declared in strictly fewer theme blocks than
 *     the file defines")
 *   src/frontend/components/UI/NavShell/__tests__/appShellLayout.test.ts:282
 *     ("SANITY: the theme-universality checker itself correctly fails
 *     --divider")
 *
 * `stripSourceComments` runs before every assertion below, and this is not
 * hygiene -- it is load-bearing. The fix comments in `Keys/index.css` NAME
 * the very strings this file's negative assertions forbid (the old rgba
 * fallback, a bare `var(--divider)`, an unscoped `.gogIcon` rule) as part of
 * their own explanation. An unstripped scan could be satisfied (or defeated)
 * by that prose alone, with the real declaration underneath it changed or
 * missing entirely -- the two "stripper" SANITY tests below exist
 * specifically to prove that cannot happen here.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const KEYS_CSS = 'src/frontend/screens/Humble/Keys/index.css'

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

/**
 * Matches `var(--divider, color-mix(in srgb, currentColor 14%, transparent))`
 * regardless of how prettier wraps the declaration across lines -- the same
 * "matched as a regex so whitespace/formatting is irrelevant" approach
 * `themeTokens.test.ts`'s `NAVBAR_ACTIVE_FALLBACK_CHAIN` uses for the
 * equivalent multi-line-able chain.
 */
const DIVIDER_CURRENTCOLOR_FALLBACK =
  /var\(\s*--divider,\s*color-mix\(in srgb,\s*currentColor 14%,\s*transparent\)\s*\)/g

/** The white-biased fallback this plan replaced. Must not survive anywhere. */
const WHITE_BIASED_FALLBACK = /rgba\(\s*255,\s*255,\s*255,\s*0\.08\s*\)/

/** `--divider` with no fallback at all -- invalid at computed-value time in
 * the 9 themes that never declare the token, per the NavShell gates above. */
const BARE_DIVIDER = /var\(\s*--divider\s*\)/

/** Any `.gogIcon {` rule, scoped or not. */
const ANY_GOGICON_RULE = /\.gogIcon\s*\{/g

/** The one `.gogIcon` rule this file is allowed to declare. */
const SCOPED_GOGICON_RULE = /\.humbleKeyRowStoreLogo \.gogIcon\s*\{/g

describe('Humble Keys divider fallback (REQ-43-19, 260911-p6s)', () => {
  const stripped = read(KEYS_CSS)

  it('declares the currentColor color-mix fallback at exactly the three known sites (row, column header, sort-picker outline)', () => {
    expect(stripped.match(DIVIDER_CURRENTCOLOR_FALLBACK)).toHaveLength(3)
  })

  it('SANITY: the fallback check above fails against a known-bad input (the old rgba chain) -- proves it is not vacuously true', () => {
    const oldFallback =
      'border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.08));'
    expect(oldFallback).not.toMatch(DIVIDER_CURRENTCOLOR_FALLBACK)
  })

  it('no white-biased rgba(255, 255, 255, 0.08) divider fallback survives anywhere in the file', () => {
    expect(stripped).not.toMatch(WHITE_BIASED_FALLBACK)
  })

  it('SANITY: the rgba check above correctly flags the pre-fix declaration -- proves it is not vacuously true', () => {
    const oldFallback =
      'border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.08));'
    expect(oldFallback).toMatch(WHITE_BIASED_FALLBACK)
  })

  it("no no-fallback var(--divider) is introduced -- mirrors appShellLayout.test.ts:245-268's repo-wide rule at this file's scope", () => {
    expect(stripped).not.toMatch(BARE_DIVIDER)
  })

  it('SANITY: the no-fallback check above correctly flags a bare var(--divider) -- proves it is not vacuously true', () => {
    const bareDivider = 'border-bottom: 1px solid var(--divider);'
    expect(bareDivider).toMatch(BARE_DIVIDER)
  })
})

describe('Humble Keys GOG store-logo fill (REQ-43-19, 260911-p6s)', () => {
  const stripped = read(KEYS_CSS)

  it('.humbleKeyRowStoreLogo .gogIcon declares fill: currentColor', () => {
    const match = /\.humbleKeyRowStoreLogo \.gogIcon\s*\{([^}]*)\}/.exec(
      stripped
    )
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(/fill:\s*currentColor/)
  })

  it('SANITY: the block check above fails against a known-bad input (an unscoped .gogIcon rule) -- proves it is not vacuously true', () => {
    const unscoped = '.gogIcon {\n  fill: currentColor;\n}'
    const match = /\.humbleKeyRowStoreLogo \.gogIcon\s*\{([^}]*)\}/.exec(
      unscoped
    )
    expect(match).toBeNull()
  })

  it('the .gogIcon escape is SCOPED -- no bare top-level .gogIcon rule exists in this file (that would be the global _colors.scss rule reintroduced here)', () => {
    const anyCount = stripped.match(ANY_GOGICON_RULE)?.length ?? 0
    const scopedCount = stripped.match(SCOPED_GOGICON_RULE)?.length ?? 0
    // Every .gogIcon occurrence in this file must be the scoped one --
    // equal, non-zero counts is what proves that, per the sanity below.
    expect(anyCount).toBeGreaterThan(0)
    expect(anyCount).toBe(scopedCount)
  })

  it('SANITY: the scoping check above correctly flags an unscoped .gogIcon rule alongside the real one -- proves it is not vacuously true', () => {
    const withUnscopedRule = `
      .humbleKeyRowStoreLogo .gogIcon {
        fill: currentColor;
      }
      .gogIcon {
        fill: var(--text-default);
      }
    `
    const anyCount = withUnscopedRule.match(ANY_GOGICON_RULE)?.length ?? 0
    const scopedCount = withUnscopedRule.match(SCOPED_GOGICON_RULE)?.length ?? 0
    expect(anyCount).toBeGreaterThan(scopedCount)
  })
})

describe('stripSourceComments integrity for this file (guards against comment prose faking a result)', () => {
  it('SANITY: a comment naming the old rgba fallback as prose does not survive stripping, so the negative assertion above cannot be defeated by the fix comment itself', () => {
    const fixture = `
      /* 2026-09-11: the fallback here was white-biased rgba(255, 255, 255,
         0.08) until this date. */
      .humbleKeyRow {
        border-bottom: 1px solid var(--divider, color-mix(in srgb, currentColor 14%, transparent));
      }
    `
    const stripped = stripSourceComments(fixture)
    expect(stripped).not.toMatch(WHITE_BIASED_FALLBACK)
  })

  it('SANITY: comment prose describing the scoped .gogIcon rule cannot satisfy the positive assertion on its own -- only a real declaration can', () => {
    const fixture = `
      /* Add .humbleKeyRowStoreLogo .gogIcon { fill: currentColor; } here. */
      .humbleKeyRowStoreLogo svg {
        width: 100%;
      }
    `
    const stripped = stripSourceComments(fixture)
    expect(stripped.match(ANY_GOGICON_RULE)?.length ?? 0).toBe(0)
  })

  it("SANITY (260911-r8u): a comment naming align-items: flex-start and text-align: start as prose above a block declaring neither cannot satisfy either alignment assertion -- guards against Task 1's own rationale comment faking Task 2's results", () => {
    const fixture = `
      /* 260911-r8u: this rule defends against inherited align-items:
         flex-start and text-align: start, described here in prose only. */
      .humbleKeyGameCell {
        display: flex;
        flex-direction: column;
      }
    `
    const stripped = stripSourceComments(fixture)
    const match = /\.humbleKeyGameCell\s*\{([^}]*)\}/.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(/align-items:\s*flex-start/)
    expect(match?.[1]).not.toMatch(/text-align:\s*start/)
  })
})

/**
 * Block-scoped anchor for `.humbleKeyGameCell`. Uses the same
 * `\.SELECTOR\s*\{([^}]*)\}` block-exec idiom as the `.gogIcon` test above --
 * this proves the declaration lives INSIDE the right rule, not merely
 * somewhere in the file.
 */
const HUMBLE_KEY_GAME_CELL_BLOCK = /\.humbleKeyGameCell\s*\{([^}]*)\}/
const ALIGN_ITEMS_FLEX_START = /align-items:\s*flex-start/

/** Block-scoped anchor for `.humbleKeyRowTitle`. */
const HUMBLE_KEY_ROW_TITLE_BLOCK = /\.humbleKeyRowTitle\s*\{([^}]*)\}/
const TEXT_ALIGN_START = /text-align:\s*start/

/**
 * `.humbleKeysColumnHeader` appears TWICE in the stylesheet: once as part of
 * the combined `.humbleKeysColumnHeader,\n.humbleKeyRow {` grid declaration
 * (a comma follows the selector there, which is neither `\s` nor `{`, so
 * this anchor does NOT match it) and once as its own standalone typography
 * block. This anchor resolves to the standalone block only -- load-bearing,
 * not incidental. The SANITY control below proves the combined form is
 * excluded, so a future reformat of that selector fails loudly here instead
 * of silently reading the wrong block.
 */
const HUMBLE_KEYS_COLUMN_HEADER_STANDALONE_BLOCK =
  /\.humbleKeysColumnHeader\s*\{([^}]*)\}/

/**
 * `.humbleKeysEmptyState` also has a `.humbleKeysEmptyState h5` rule. The
 * same `\s*\{` anchoring excludes it -- the SANITY control below proves it,
 * because a `[^}]*` body scan that silently latched onto the wrong block
 * would be a green check proving nothing.
 */
const HUMBLE_KEYS_EMPTY_STATE_BLOCK = /\.humbleKeysEmptyState\s*\{([^}]*)\}/
const HUMBLE_KEYS_FILTERED_EMPTY_STATE_BLOCK =
  /\.humbleKeysFilteredEmptyState\s*\{([^}]*)\}/
const TEXT_ALIGN_CENTER = /text-align:\s*center/

describe('Humble Keys text alignment (REQ-43-19, 260911-r8u)', () => {
  const stripped = read(KEYS_CSS)

  it('.humbleKeyGameCell declares align-items: flex-start', () => {
    const match = HUMBLE_KEY_GAME_CELL_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(ALIGN_ITEMS_FLEX_START)
  })

  it('SANITY: the align-items check above fails against a known-bad input missing the declaration -- proves it is not vacuously true', () => {
    const badFixture = '.humbleKeyGameCell {\n  display: flex;\n}'
    const match = HUMBLE_KEY_GAME_CELL_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(ALIGN_ITEMS_FLEX_START)
  })

  it('.humbleKeyRowTitle declares text-align: start', () => {
    const match = HUMBLE_KEY_ROW_TITLE_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(TEXT_ALIGN_START)
  })

  it('SANITY: the text-align check above fails against a known-bad input missing the declaration -- proves it is not vacuously true', () => {
    const badFixture = '.humbleKeyRowTitle {\n  font-size: 1rem;\n}'
    const match = HUMBLE_KEY_ROW_TITLE_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(TEXT_ALIGN_START)
  })

  it('the standalone .humbleKeysColumnHeader block declares text-align: start', () => {
    const match = HUMBLE_KEYS_COLUMN_HEADER_STANDALONE_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(TEXT_ALIGN_START)
  })

  it('SANITY: the standalone-block check above fails against a known-bad input missing the declaration -- proves it is not vacuously true', () => {
    const badFixture = '.humbleKeysColumnHeader {\n  font-size: 1rem;\n}'
    const match = HUMBLE_KEYS_COLUMN_HEADER_STANDALONE_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(TEXT_ALIGN_START)
  })

  it('SANITY: the standalone-block anchor does NOT match the combined `.humbleKeysColumnHeader, .humbleKeyRow` grid declaration -- proves it resolves to the correct block, not the guarded combined form', () => {
    const combinedFormOnly = `
      .humbleKeysColumnHeader,
      .humbleKeyRow {
        grid-template-columns: 6.5rem minmax(0, 1fr) 20rem;
        display: grid;
        column-gap: var(--space-md);
        align-items: start;
      }
    `
    const match =
      HUMBLE_KEYS_COLUMN_HEADER_STANDALONE_BLOCK.exec(combinedFormOnly)
    expect(match).toBeNull()
  })
})

/** Block-scoped anchor for `.humbleKeysTitle`. */
const HUMBLE_KEYS_TITLE_BLOCK = /\.humbleKeysTitle\s*\{([^}]*)\}/
const FLEX_SHRINK_0 = /flex-shrink:\s*0/
const WHITE_SPACE_NOWRAP = /white-space:\s*nowrap/

/**
 * Block-scoped anchor for the new `.humbleKeysSortPicker` layout rule. This
 * file already has a `.humbleKeysSortPicker .MuiSelect-select,` descendant
 * selector immediately below it -- the `\s*\{` anchor cannot match that
 * form (the next non-whitespace character after `.humbleKeysSortPicker` is
 * `.`, not `{`), so placing the bare rule first makes the first regex match
 * unambiguous, the same reasoning already documented for
 * `.humbleKeysSortPicker`'s sibling column-header anchor above.
 */
const HUMBLE_KEYS_SORT_PICKER_BLOCK = /\.humbleKeysSortPicker\s*\{([^}]*)\}/
const GRID_TEMPLATE_AREAS_LABEL_SELECT =
  /grid-template-areas:\s*'label select'/
const GRID_TEMPLATE_COLUMNS_DECLARED = /grid-template-columns:/

/** Block-scoped anchor for `.humbleKeyOwnedBadge`. */
const HUMBLE_KEY_OWNED_BADGE_BLOCK = /\.humbleKeyOwnedBadge\s*\{([^}]*)\}/
const COLOR_VAR_SUCCESS = /color:\s*var\(--success\)/
const VAR_STATUS_SUCCESS = /var\(--status-success\)/

describe('Humble Keys title no longer yields to SearchBar (REQ-43-19, 260911-t0p defect 1)', () => {
  const stripped = read(KEYS_CSS)

  it('.humbleKeysTitle declares both flex-shrink: 0 and white-space: nowrap', () => {
    const match = HUMBLE_KEYS_TITLE_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(FLEX_SHRINK_0)
    expect(match?.[1]).toMatch(WHITE_SPACE_NOWRAP)
  })

  it('SANITY: the check above fails against a known-bad input missing both declarations -- proves it is not vacuously true', () => {
    const badFixture = '.humbleKeysTitle {\n  margin: 0;\n}'
    const match = HUMBLE_KEYS_TITLE_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(FLEX_SHRINK_0)
    expect(match?.[1]).not.toMatch(WHITE_SPACE_NOWRAP)
  })
})

describe('Humble Keys sort picker label sits to the left of the select, not above and not to its right (REQ-43-19, 260911-t0p defect 2, reordered by 260911-ue4)', () => {
  const stripped = read(KEYS_CSS)

  it('.humbleKeysSortPicker declares grid-template-areas: \'label select\' and an explicit grid-template-columns', () => {
    const match = HUMBLE_KEYS_SORT_PICKER_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(GRID_TEMPLATE_AREAS_LABEL_SELECT)
    expect(match?.[1]).toMatch(GRID_TEMPLATE_COLUMNS_DECLARED)
  })

  it('SANITY: the check above fails against a known-bad input missing both declarations -- proves it is not vacuously true', () => {
    const badFixture = '.humbleKeysSortPicker {\n  color: red;\n}'
    const match = HUMBLE_KEYS_SORT_PICKER_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(GRID_TEMPLATE_AREAS_LABEL_SELECT)
    expect(match?.[1]).not.toMatch(GRID_TEMPLATE_COLUMNS_DECLARED)
  })

  it("SANITY: the check above fails against the pre-ue4 order (label read to the right of the select, shipped and live-verified by 260911-t0p) -- this is the exact regression this pin now guards against, not a generic negative control", () => {
    const badFixture =
      ".humbleKeysSortPicker {\n  grid-template-areas: 'select label';\n  grid-template-columns: 12rem max-content;\n}"
    const match = HUMBLE_KEYS_SORT_PICKER_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(GRID_TEMPLATE_AREAS_LABEL_SELECT)
    expect(match?.[1]).toMatch(GRID_TEMPLATE_COLUMNS_DECLARED)
  })

  it('SANITY: the block anchor does NOT match the descendant `.humbleKeysSortPicker .MuiSelect-select,` selector that follows it in this file -- proves it resolves to the bare rule, not the descendant form', () => {
    const descendantFormOnly = `
      .humbleKeysSortPicker .MuiSelect-select,
      .humbleKeysSortPicker .MuiInputBase-input {
        color: var(--text-default);
      }
    `
    const match = HUMBLE_KEYS_SORT_PICKER_BLOCK.exec(descendantFormOnly)
    expect(match).toBeNull()
  })
})

describe('Humble Keys owned-badge contrast fix (REQ-43-19, 260911-t0p defect 4)', () => {
  const stripped = read(KEYS_CSS)

  it('.humbleKeyOwnedBadge declares color: var(--success) and does not contain var(--status-success)', () => {
    const match = HUMBLE_KEY_OWNED_BADGE_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(COLOR_VAR_SUCCESS)
    expect(match?.[1]).not.toMatch(VAR_STATUS_SUCCESS)
  })

  it('SANITY: the check above fails against a known-bad input still using var(--status-success) -- proves it is not vacuously true', () => {
    const badFixture =
      '.humbleKeyOwnedBadge {\n  color: var(--status-success);\n}'
    const match = HUMBLE_KEY_OWNED_BADGE_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(COLOR_VAR_SUCCESS)
    expect(match?.[1]).toMatch(VAR_STATUS_SUCCESS)
  })

  it('var(--status-success) occurs exactly once file-wide (the surviving .humbleKeyStateBadge--REDEEMED fill)', () => {
    expect(stripped.match(/var\(--status-success\)/g) ?? []).toHaveLength(1)
  })

  it('var(--success) occurs exactly once file-wide (matched with a closing paren so it cannot also catch var(--success-hover))', () => {
    expect(stripped.match(/var\(--success\)/g) ?? []).toHaveLength(1)
  })

  it('SANITY: the exact-match regex above correctly excludes var(--success-hover) -- proves it is not vacuously true', () => {
    const fixture = 'color: var(--success-hover);'
    expect(fixture.match(/var\(--success\)/g) ?? []).toHaveLength(0)
  })
})

describe('Humble Keys empty-state centring is deliberate and preserved', () => {
  const stripped = read(KEYS_CSS)

  it('.humbleKeysEmptyState still declares text-align: center', () => {
    const match = HUMBLE_KEYS_EMPTY_STATE_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(TEXT_ALIGN_CENTER)
  })

  it('SANITY: the empty-state check above fails against a known-bad input missing the declaration -- proves it is not vacuously true', () => {
    const badFixture = '.humbleKeysEmptyState {\n  padding: 1rem;\n}'
    const match = HUMBLE_KEYS_EMPTY_STATE_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(TEXT_ALIGN_CENTER)
  })

  it('SANITY: the .humbleKeysEmptyState anchor does NOT match the .humbleKeysEmptyState h5 rule -- proves it resolves to the base block only, not the wrong nested rule', () => {
    const h5OnlyFixture = '.humbleKeysEmptyState h5 {\n  font-weight: 600;\n}'
    const match = HUMBLE_KEYS_EMPTY_STATE_BLOCK.exec(h5OnlyFixture)
    expect(match).toBeNull()
  })

  it('.humbleKeysFilteredEmptyState still declares text-align: center', () => {
    const match = HUMBLE_KEYS_FILTERED_EMPTY_STATE_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(TEXT_ALIGN_CENTER)
  })

  it('SANITY: the filtered-empty-state check above fails against a known-bad input missing the declaration -- proves it is not vacuously true', () => {
    const badFixture = '.humbleKeysFilteredEmptyState {\n  padding: 1rem;\n}'
    const match = HUMBLE_KEYS_FILTERED_EMPTY_STATE_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(TEXT_ALIGN_CENTER)
  })
})
