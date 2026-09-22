/**
 * Source-text gate for the RedeemSteamKeyDialog outcome-paragraph tone fix
 * (quick task 260922-gxd, closing
 * `.planning/todos/completed/2026-09-21-redeem-steam-key-outcome-copy-classnames-have-no-css-rule.md`).
 *
 * Judgment on whether a test earns its keep here: the two colour
 * declarations are low-risk on their own and would not, alone, justify a
 * gate. The one thing that does is the import line. "A stylesheet can ship
 * wholly dead against its component" is a recorded failure mode in this
 * repo, and nothing else currently detects it: `cssTokenSweep.test.ts`
 * checks token NAMES only, `pnpm lint` is eslint over `.ts`/`.tsx`, there is
 * no stylelint, and no other test parses CSS. A rule file that is never
 * imported passes every existing gate in this repo. Assertion 5 below is the
 * one that cannot be obtained any other way.
 *
 * `stripSourceComments` runs before every positive/negative assertion below,
 * and this is load-bearing, not hygiene: the fix comment in `index.css`
 * NAMES the token pair, the fills-vs-text rule and the AA-shortfall figure
 * as prose as part of its own rationale, and an unstripped scan could be
 * satisfied (or defeated) by that prose alone with the real declaration
 * underneath it changed or missing entirely. The "stripper integrity"
 * describe block below exists specifically to prove that cannot happen here.
 *
 * What this file CANNOT prove: `src/frontend/jest.config.js` configures the
 * Frontend project with `testEnvironment: 'node'` -- there is no jsdom and
 * no CSS engine here, so nothing in this file can render anything, resolve
 * inheritance, or compute a used contrast ratio. This can only prove the
 * SOURCE says the right thing. The 7.35:1 / 3.55:1 figures recorded in the
 * commit message and SUMMARY for this task are arithmetic against declared
 * token values, not a measurement of a built app -- no live run, screenshot,
 * or pixel measurement was performed as part of this task.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { stripSourceComments } from 'backend/testUtils/stripSourceComments'

const REPO_ROOT = join(__dirname, '..', '..', '..', '..', '..', '..')
const DIALOG_CSS = 'src/frontend/components/UI/RedeemSteamKeyDialog/index.css'
const DIALOG_TSX = 'src/frontend/components/UI/RedeemSteamKeyDialog/index.tsx'

const read = (relPath: string) =>
  stripSourceComments(readFileSync(join(REPO_ROOT, relPath), 'utf8'))

/**
 * Block-scoped anchors, same `\.SELECTOR\s*\{([^}]*)\}` idiom
 * `humbleKeysStylesheet.test.ts` uses -- this proves a declaration lives
 * INSIDE the right rule, not merely somewhere in the file.
 */
const SUCCESS_BLOCK = /\.redeemSteamKey__success\s*\{([^}]*)\}/
const ERROR_BLOCK = /\.redeemSteamKey__error\s*\{([^}]*)\}/

const COLOR_VAR_SUCCESS = /color:\s*var\(--success\)/
const COLOR_VAR_DANGER = /color:\s*var\(--danger\)/

/** Any raw status token reference, anywhere. */
const ANY_STATUS_TOKEN = /var\(--status-/

/** A fallback arm on either theme-adaptive token. */
const SUCCESS_FALLBACK_ARM = /var\(--success,/
const DANGER_FALLBACK_ARM = /var\(--danger,/

describe('RedeemSteamKeyDialog outcome tone rules (260922-gxd)', () => {
  const stripped = read(DIALOG_CSS)

  it('.redeemSteamKey__success declares color: var(--success)', () => {
    const match = SUCCESS_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(COLOR_VAR_SUCCESS)
  })

  it('SANITY: the success check above fails against a known-bad input using the raw status-success token instead -- proves it is not vacuously true', () => {
    const badFixture =
      '.redeemSteamKey__success {\n  color: var(--status-success);\n}'
    const match = SUCCESS_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(COLOR_VAR_SUCCESS)
  })

  it('.redeemSteamKey__error declares color: var(--danger)', () => {
    const match = ERROR_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).toMatch(COLOR_VAR_DANGER)
  })

  it('SANITY: the error check above fails against a known-bad input using the raw status-danger token instead -- proves it is not vacuously true', () => {
    const badFixture =
      '.redeemSteamKey__error {\n  color: var(--status-danger);\n}'
    const match = ERROR_BLOCK.exec(badFixture)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(COLOR_VAR_DANGER)
  })

  it('SANITY: the block anchors do NOT match a descendant-selector-only form -- proves they resolve to the bare rule, not a nested one', () => {
    const descendantFormOnly = `
      .redeemSteamKey__success .icon {
        color: var(--success);
      }
      .redeemSteamKey__error .icon {
        color: var(--danger);
      }
    `
    expect(SUCCESS_BLOCK.exec(descendantFormOnly)).toBeNull()
    expect(ERROR_BLOCK.exec(descendantFormOnly)).toBeNull()
  })

  it('no raw status token (var(--status-...)) survives anywhere in the file, in either block or outside them', () => {
    expect(stripped).not.toMatch(ANY_STATUS_TOKEN)
    expect(SUCCESS_BLOCK.exec(stripped)?.[1]).not.toMatch(ANY_STATUS_TOKEN)
    expect(ERROR_BLOCK.exec(stripped)?.[1]).not.toMatch(ANY_STATUS_TOKEN)
  })

  it('SANITY: the status-token check above correctly flags a known-bad input carrying var(--status-success) -- proves it is not vacuously true', () => {
    const badFixture = 'color: var(--status-success);'
    expect(badFixture).toMatch(ANY_STATUS_TOKEN)
  })

  it('neither rule carries a fallback arm on its theme-adaptive token', () => {
    expect(stripped).not.toMatch(SUCCESS_FALLBACK_ARM)
    expect(stripped).not.toMatch(DANGER_FALLBACK_ARM)
  })

  it('SANITY: the fallback-arm check above correctly flags a known-bad input carrying one -- proves it is not vacuously true', () => {
    const badFixture = 'color: var(--success, #000000);'
    expect(badFixture).toMatch(SUCCESS_FALLBACK_ARM)
  })

  it('index.tsx imports ./index.css AND still carries both outcome classNames -- proves the component -> import -> rule chain is intact and this stylesheet is not orphaned', () => {
    const tsxStripped = read(DIALOG_TSX)
    expect(tsxStripped).toMatch(/import '\.\/index\.css'/)
    expect(tsxStripped).toContain('redeemSteamKey__success')
    expect(tsxStripped).toContain('redeemSteamKey__error')
  })

  it('SANITY: the import-chain check above fails against a known-bad index.tsx-shaped fixture that carries both classNames but no import line -- proves it is not vacuously true', () => {
    const badFixture = `
      export default function RedeemSteamKeyDialog() {
        return (
          <p className={copy.tone === 'success' ? 'redeemSteamKey__success' : 'redeemSteamKey__error'}>
            {copy.message}
          </p>
        )
      }
    `
    expect(badFixture).not.toMatch(/import '\.\/index\.css'/)
  })
})

describe('stripSourceComments integrity for this file (guards against comment prose faking a result)', () => {
  it("SANITY: a comment naming color: var(--success) as prose above a block that does NOT declare it cannot satisfy the positive success assertion on its own -- guards against Task 1's own rationale comment faking Task 2's result", () => {
    const fixture = `
      /* This rule should declare color: var(--success) per the token pair
         decision, described here in prose only. */
      .redeemSteamKey__success {
        font-weight: bold;
      }
    `
    const stripped = stripSourceComments(fixture)
    const match = SUCCESS_BLOCK.exec(stripped)
    expect(match).not.toBeNull()
    expect(match?.[1]).not.toMatch(COLOR_VAR_SUCCESS)
  })

  it('SANITY: a comment naming the raw status-success token as prose does not survive stripping, so the status-token negative assertion above cannot be defeated by the fix comment itself', () => {
    const fixture = `
      /* The raw status-success token, var(--status-success), measured
         1.46:1 as a foreground and is not used here. */
      .redeemSteamKey__success {
        color: var(--success);
      }
    `
    const stripped = stripSourceComments(fixture)
    expect(stripped).not.toMatch(ANY_STATUS_TOKEN)
  })

  it('SANITY: a comment naming a fallback arm as prose does not survive stripping, so the fallback negative assertion above cannot be defeated by the fix comment itself', () => {
    const fixture = `
      /* No fallback arm here -- not var(--success, #000000) -- because both
         tokens are declared in themes.scss's base body {} block. */
      .redeemSteamKey__success {
        color: var(--success);
      }
    `
    const stripped = stripSourceComments(fixture)
    expect(stripped).not.toMatch(SUCCESS_FALLBACK_ARM)
  })
})
