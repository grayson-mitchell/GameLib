/**
 * Source-text structural gate over GameSubMenu's EOS call sites (quick task 260919-tms).
 *
 * Sibling to `AdvancedSettings/__tests__/EosDeclineCallSiteGuard.test.ts`, deliberately
 * separately named and separately scoped -- NOT a second edit to that file's
 * `EXPECTED_EOS_CALL_SITES` (11, AdvancedSettings-only). That guard's `componentPath =
 * join(__dirname, '..', 'index.tsx')` hard-binds it to AdvancedSettings, and 5 of its 6
 * assertions are AdvancedSettings-specific (`eosOverlayUnavailable` state, `getMainEosText()`,
 * `window.api.abort`) -- none of which exist in GameSubMenu. This file is GameSubMenu's own
 * sibling gate, closing the source todo's (unbuildable, see the todo's corrected "What was
 * actually shipped" section) "update the anchor to a cross-file total" instruction with a
 * separately-named test instead.
 *
 * TWO DELIBERATE DEVIATIONS FROM THE ADVANCEDSETTINGS GUARD SHAPE, both measured this session:
 *
 * (a) The call-site regex is `window\.api\s*\.\s*(<channel>)`, not `window\.api\.(<channel>)`.
 *     Measured: the strict form finds only 4 of GameSubMenu's 5 real EOS call sites, because
 *     `collapse()` maps the (pre-edit) useEffect probe's
 *       window.api
 *         .isEosOverlayEnabled(appName)
 *     newline+indent to a single SPACE ("window.api .isEosOverlayEnabled"), and the strict
 *     `window\.api\.` form requires the dot immediately after `api` with no space in between.
 *     A guard defeated by a Prettier method-chain break is exactly the green-check-proving-
 *     nothing shape this repo keeps stamping out -- the self-test block below pins this
 *     specific whitespace case so the tolerance itself is proven, not just assumed.
 * (b) The import assertion uses `DeferredChannelCallSiteGuard.test.ts`'s regex form, not
 *     AdvancedSettings' exact-literal form -- GameSubMenu imports three names
 *     (`callOrDeclare`, `DEFERRAL_D03`, `EOS_FEATURE`) from the same module in one statement,
 *     and Prettier may wrap that statement across lines.
 *
 * Every positive assertion against the REAL component source uses `toBe`/`toContain`/`toMatch`.
 * Never a bare negative-regex assertion there -- see `EosDeclineCallSiteGuard.test.ts`'s own
 * header for why (7 vacuous instances shipped in this project before that rule was adopted).
 * Negative assertions appear ONLY inside the self-test block, against synthetic strings.
 *
 * `GameSubMenu/index.tsx` cannot be imported under this project's `node`-environment Frontend
 * jest project (no jsdom, no react-test-renderer -- see `src/frontend/jest.config.js`'s
 * header). Same documented constraint and same approach as the two sibling guards: read the
 * real source, collapse whitespace to a single space, assert the shape.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { EOS_OVERLAY_CHANNELS } from 'frontend/helpers/declaredUnavailable'

const componentPath = join(__dirname, '..', 'index.tsx')

/** Collapses every run of whitespace to a single space -- a whitespace WINDOW, not a line. */
function collapse(source: string): string {
  return source.replace(/\s+/g, ' ')
}

/**
 * The real count of `window.api.<eosChannel>` occurrences in GameSubMenu's component, measured
 * against HEAD (`318817a88`) this session: 5 (`handleEosOverlay()`'s `disableEosOverlay`, first
 * `enableEosOverlay`, `installEosOverlay`, second `enableEosOverlay` in the dialog Yes handler,
 * plus the `useEffect` probe's `isEosOverlayEnabled`). This plan only WRAPS existing call
 * sites, adding and removing none, so the count is unchanged pre-edit and post-edit -- this is
 * the deletion detector, not the RED source.
 */
const EXPECTED_EOS_CALL_SITES = 5

/**
 * The real, post-edit count of `setEosOverlayRefresh(false)` occurrences in the component,
 * measured by direct recount after this plan's Task 2 edit. One more than
 * `EXPECTED_EOS_CALL_SITES - 1` (4) because two of the five wrapped call sites
 * (`disableEosOverlay` and the dialog Yes handler's second `enableEosOverlay`) release the
 * spinner unconditionally -- on BOTH the ok and not-ok branch, per C4 -- while the first
 * `enableEosOverlay` and `installEosOverlay` release it only on the not-ok branch (the ok
 * branch's release already existed, deferred to later code in the pre-edit flow), and the
 * `isEosOverlayEnabled` probe releases it never (it owns no spinner). Pinned as an exact
 * number, not an inequality, because the post-edit shape makes an exact number honest.
 */
const EXPECTED_SPINNER_RELEASES = 6

/** Same generous 200-collapsed-character window the two sibling guards use. */
const CALL_SITE_WINDOW = 200

function findEosCallSiteIndices(collapsed: string): number[] {
  const pattern = new RegExp(
    `window\\.api\\s*\\.\\s*(${EOS_OVERLAY_CHANNELS.join('|')})`,
    'g'
  )
  const indices: number[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(collapsed)) !== null) {
    indices.push(match.index)
  }
  return indices
}

describe('GameSubMenu EOS decline call-site gate', () => {
  const source = readFileSync(componentPath, 'utf-8')
  const collapsed = collapse(source)

  it('non-vacuity anchor: exactly EXPECTED_EOS_CALL_SITES EOS call sites exist, and that is greater than zero', () => {
    const indices = findEosCallSiteIndices(collapsed)
    expect(indices.length).toBeGreaterThan(0)
    expect(indices.length).toBe(EXPECTED_EOS_CALL_SITES)
  })

  it('every EOS call site is the call thunk of a callOrDeclare(...) invocation', () => {
    const indices = findEosCallSiteIndices(collapsed)
    expect(indices.length).toBeGreaterThan(0)
    for (const index of indices) {
      const windowStart = Math.max(0, index - CALL_SITE_WINDOW)
      const preceding = collapsed.slice(windowStart, index)
      expect(preceding).toContain('callOrDeclare(')
    }
  })

  it('imports callOrDeclare from frontend/helpers/declaredUnavailable', () => {
    const importPattern =
      /import \{[^}]*\bcallOrDeclare\b[^}]*\} from 'frontend\/helpers\/declaredUnavailable'/
    expect(collapsed).toMatch(importPattern)
  })

  it('every decline branch that owns the "refreshing" spinner releases it on the not-ok path (C4)', () => {
    const callOrDeclareCount = (collapsed.match(/callOrDeclare\(/g) ?? [])
      .length
    const spinnerReleaseCount = (
      collapsed.match(/setEosOverlayRefresh\(false\)/g) ?? []
    ).length
    expect(callOrDeclareCount).toBe(EXPECTED_EOS_CALL_SITES)
    // One fewer than the call-site count: the isEosOverlayEnabled probe owns no spinner.
    expect(callOrDeclareCount - 1).toBe(EXPECTED_EOS_CALL_SITES - 1)
    expect(spinnerReleaseCount).toBe(EXPECTED_SPINNER_RELEASES)
    expect(spinnerReleaseCount).toBeGreaterThanOrEqual(
      EXPECTED_EOS_CALL_SITES - 1
    )
  })

  describe('self-test (anti-vacuity, RED-proof precursors)', () => {
    it('the non-vacuity anchor fires on a synthetic source with one call site renamed away', () => {
      const regressed = collapse(
        source.replace(
          'window.api.disableEosOverlay(appName)',
          'window.api.noop(appName)'
        )
      )
      const indices = findEosCallSiteIndices(regressed)
      expect(indices.length).not.toBe(EXPECTED_EOS_CALL_SITES)
    })

    it('the call-site invariant fires on a synthetic bare, unwrapped EOS call', () => {
      const injected = collapse(
        'const x = async () => { await window.api.disableEosOverlay(appName) }'
      )
      const indices = findEosCallSiteIndices(injected)
      expect(indices.length).toBeGreaterThan(0)
      const [index] = indices
      const preceding = injected.slice(
        Math.max(0, index - CALL_SITE_WINDOW),
        index
      )
      expect(preceding).not.toContain('callOrDeclare(')
    })

    it('the whitespace-tolerant regex matches a Prettier method-chain break, proving C3', () => {
      const chained = collapse(
        'const x = async () => {\n  window.api\n    .isEosOverlayEnabled(appName)\n    .then(() => {})\n}'
      )
      const strictIndices: number[] = []
      const strictPattern = new RegExp(
        `window\\.api\\.(${EOS_OVERLAY_CHANNELS.join('|')})`,
        'g'
      )
      let strictMatch: RegExpExecArray | null
      while ((strictMatch = strictPattern.exec(chained)) !== null) {
        strictIndices.push(strictMatch.index)
      }
      expect(strictIndices.length).toBe(0)

      const tolerantIndices = findEosCallSiteIndices(chained)
      expect(tolerantIndices.length).toBe(1)
    })
  })
})
