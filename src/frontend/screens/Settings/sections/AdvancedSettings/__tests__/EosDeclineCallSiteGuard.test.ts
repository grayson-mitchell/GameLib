/**
 * Source-text structural gate targeting the CALL SITE, not the registry (Task 2, 34.5-48).
 *
 * WHY THIS GATE EXISTS AND WHY IT IS SHAPED THIS WAY
 *
 * Plan 34.5-13's SEAM Invariant B test proves the 19 dropped/deferred channel names are
 * absent from `handlerRegistry`/`listenerRegistry` -- a REGISTRY assertion. "The UI never
 * calls them" was ALSO true before this plan, and both statements held simultaneously, which
 * is exactly why that test could not catch the defect this plan fixes
 * (`34.5-CYCLE6-ROUTING.md` cluster 4): the EOS panel rendered confident, false backend state
 * while making zero calls a rejection could ever reach. A registry-shaped gate structurally
 * cannot see that. This gate reads the real component source and asserts on the CALL SITE
 * shape instead.
 *
 * `AdvancedSettings/index.tsx` cannot be imported under this project's `node`-environment
 * Frontend jest project (no jsdom, no react-test-renderer -- see
 * `src/frontend/jest.config.js`'s header). Same documented constraint and same approach as
 * `GlobalStateRefreshCacheGuard.test.ts`: read the real source, collapse whitespace to a
 * single space (so Prettier line-wrapping cannot break a substring match), assert the shape.
 *
 * Every positive assertion uses `toBe`/`toContain`. This project has shipped 7 vacuous
 * negative-regex assertions inside files a coverage map marked COVERED, each passing just as
 * happily against a file that no longer contained the construct at all -- so this gate never
 * uses that shape (see the banned-pattern grep in this plan's own acceptance criteria). The
 * RED-proof captures in `34.5-48-SUMMARY.md` are the load-bearing evidence this gate is not
 * the 8th.
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
 * The real, post-edit count of `window.api.<eosChannel>` occurrences in the component. Set
 * by direct recount after Task 2's edit (`grep -oE` over the eight channel names, see the
 * SUMMARY for the exact command and output) -- the pre-edit count was 11, and this plan only
 * WRAPS existing call sites, adding and removing none, so the post-edit count is unchanged.
 * A silent deletion of a call site changes this count and must fail this test.
 */
const EXPECTED_EOS_CALL_SITES = 11

/**
 * A whitespace-collapsed window, not a line: how many collapsed characters immediately
 * preceding a `window.api.<channel>` occurrence must contain `callOrDeclare(` for that call
 * site to count as wrapped. Generous relative to the actual object-literal shape used here
 * (`callOrDeclare({ channel: ..., feature: ..., deferral: ..., call: () =>
 * window.api.<channel>() })`, well under 150 collapsed characters end to end).
 */
const CALL_SITE_WINDOW = 200

function findEosCallSiteIndices(collapsed: string): number[] {
  const pattern = new RegExp(
    `window\\.api\\.(${EOS_OVERLAY_CHANNELS.join('|')})`,
    'g'
  )
  const indices: number[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(collapsed)) !== null) {
    indices.push(match.index)
  }
  return indices
}

describe('AdvancedSettings EOS decline call-site gate', () => {
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
    expect(collapsed).toContain(
      "import { callOrDeclare } from 'frontend/helpers/declaredUnavailable'"
    )
  })

  it('the action-button row is wrapped in exactly one {!eosOverlayUnavailable && (}, and the decline line in exactly one {eosOverlayUnavailable && (}', () => {
    const notUnavailableWrapper = '{!eosOverlayUnavailable && ('
    const unavailableWrapper = '{eosOverlayUnavailable && ('

    const countOccurrences = (haystack: string, needle: string): number => {
      let count = 0
      let fromIndex = 0
      while (true) {
        const foundAt = haystack.indexOf(needle, fromIndex)
        if (foundAt === -1) break
        count++
        fromIndex = foundAt + needle.length
      }
      return count
    }

    expect(countOccurrences(collapsed, notUnavailableWrapper)).toBe(1)
    expect(countOccurrences(collapsed, unavailableWrapper)).toBe(1)
  })

  it('getMainEosText() returns the decline text as its FIRST branch', () => {
    expect(collapsed).toContain(
      'function getMainEosText() { if (eosOverlayUnavailable) return'
    )
  })

  it('window.api.abort is called exactly once, and is guarded by eosOverlayUnavailable within 200 collapsed characters', () => {
    const abortPattern = /window\.api\.abort/g
    const indices: number[] = []
    let match: RegExpExecArray | null
    while ((match = abortPattern.exec(collapsed)) !== null) {
      indices.push(match.index)
    }
    expect(indices.length).toBe(1)

    const [abortIndex] = indices
    const windowStart = Math.max(0, abortIndex - CALL_SITE_WINDOW)
    const preceding = collapsed.slice(windowStart, abortIndex)
    expect(preceding).toContain('eosOverlayUnavailable')
  })

  describe('self-test (anti-vacuity, RED-proof precursors)', () => {
    it('the non-vacuity anchor fires on a synthetic source with fewer EOS call sites', () => {
      const regressed = collapse(
        source.replace(
          "call: () => window.api.removeEosOverlay()",
          "call: () => Promise.resolve(true)"
        )
      )
      const indices = findEosCallSiteIndices(regressed)
      expect(indices.length).not.toBe(EXPECTED_EOS_CALL_SITES)
    })

    it('the call-site invariant fires on a synthetic bare, unwrapped EOS call', () => {
      const injected = collapse(
        'const x = async () => { await window.api.getEosOverlayStatus() }'
      )
      const indices = findEosCallSiteIndices(injected)
      expect(indices.length).toBeGreaterThan(0)
      const [index] = indices
      const preceding = injected.slice(Math.max(0, index - CALL_SITE_WINDOW), index)
      expect(preceding).not.toContain('callOrDeclare(')
    })

    it('the exactly-once wrapper assertion fires when a wrapper is duplicated or missing', () => {
      const withoutWrapper = collapsed.replace(
        '{!eosOverlayUnavailable && (',
        '{'
      )
      const countOccurrences = (haystack: string, needle: string): number => {
        let count = 0
        let fromIndex = 0
        while (true) {
          const foundAt = haystack.indexOf(needle, fromIndex)
          if (foundAt === -1) break
          count++
          fromIndex = foundAt + needle.length
        }
        return count
      }
      expect(countOccurrences(withoutWrapper, '{!eosOverlayUnavailable && (')).toBe(
        0
      )
    })
  })
})
