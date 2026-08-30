/**
 * Source-text structural gate targeting the JSX `onClick` wiring of the EOS overlay's
 * state-mutating actions (Phase 35 plan 26 remediation).
 *
 * WHY THIS GATE EXISTS
 *
 * `EosDeclineCallSiteGuard.test.ts` asserts every `window.api.<eosChannel>` call is wrapped
 * in `callOrDeclare(...)` -- a network/decline-reliability property. It says nothing about
 * whether the BUTTON that triggers the call is itself gated behind a user confirmation, and
 * it cannot: it counts `window.api.*` call sites, and a call site that was never guarded in
 * the first place is invisible to a census of "is this one wrapped correctly" -- it only sees
 * what already exists to inspect.
 *
 * That blind spot shipped a real defect: 35-26's Task 2 wired `confirmRemoveEosOverlay` for
 * the destructive Remove button but left the Install button (`onClick={installEosOverlay}`)
 * and the Update button (`onClick={updateEosOverlay}`) calling their raw async functions
 * directly. The live human gate (Task 3) caught this: clicking Install ran
 * `legendary eos-overlay install -y` immediately, with zero confirmation, reproduced twice.
 * `EosDeclineCallSiteGuard.test.ts` was green throughout -- it censuses the wrong property.
 *
 * This gate closes that gap by reading the real component source and asserting, for each
 * action named in `GUARDED_ACTIONS`, that its JSX `onClick` attribute is NEVER wired to the
 * bare action function -- it must be reached only through a `confirm<Name>` wrapper.
 *
 * Same documented constraint as the sibling guard: `AdvancedSettings/index.tsx` cannot be
 * imported under this project's `node`-environment Frontend jest project (no jsdom, no
 * react-test-renderer -- see `src/frontend/jest.config.js`'s header). Read the real source,
 * collapse whitespace to a single space (so Prettier line-wrapping cannot break a substring
 * match), assert the shape.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

const componentPath = join(__dirname, '..', 'index.tsx')

/** Collapses every run of whitespace to a single space -- a whitespace WINDOW, not a line. */
function collapse(source: string): string {
  return source.replace(/\s+/g, ' ')
}

/**
 * Actions whose button must be reached through a `confirm<Name>` wrapper, not directly.
 * Scoped to the state-mutating EOS actions the Task 3 live gate exercises (install / update /
 * remove) -- enable/disable toggling and "check for updates" are read-only-adjacent and out
 * of this gate's scope by the operator's explicit "minimal + update" decision.
 */
const GUARDED_ACTIONS = [
  'removeEosOverlay',
  'installEosOverlay',
  'updateEosOverlay'
]

function confirmWrapperName(actionName: string): string {
  return `confirm${actionName[0].toUpperCase()}${actionName.slice(1)}`
}

function countOccurrences(haystack: string, needle: string): number {
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

describe('AdvancedSettings EOS action confirmation gate', () => {
  const source = readFileSync(componentPath, 'utf-8')
  const collapsed = collapse(source)

  it.each(GUARDED_ACTIONS)(
    '%s is never wired bare to an onClick -- it must be reached through its confirm wrapper',
    (actionName) => {
      const barePattern = `onClick={${actionName}}`
      expect(collapsed).not.toContain(barePattern)
    }
  )

  it.each(GUARDED_ACTIONS)(
    '%s has its confirm<Name> wrapper wired to exactly one onClick',
    (actionName) => {
      const wrappedPattern = `onClick={${confirmWrapperName(actionName)}}`
      expect(countOccurrences(collapsed, wrappedPattern)).toBe(1)
    }
  )

  it.each(GUARDED_ACTIONS)(
    '%s: the confirm wrapper calls the raw action only from an affirmative button, and the negative button has no onClick',
    (actionName) => {
      const wrapperName = confirmWrapperName(actionName)
      const wrapperStart = collapsed.indexOf(`function ${wrapperName}(`)
      expect(wrapperStart).toBeGreaterThan(-1)
      // A generous window past the wrapper's opening brace -- long enough to contain the
      // whole showDialogModal({...}) call, short enough not to bleed into the next function.
      const wrapperBody = collapsed.slice(wrapperStart, wrapperStart + 600)
      expect(wrapperBody).toContain('showDialogModal(')
      expect(wrapperBody).toContain(`onClick: () => ${actionName}()`)
      // The negative button in this house pattern is `{ text: t('box.no') }` with no
      // trailing `, onClick` before its closing brace.
      expect(wrapperBody).toContain("{ text: t('box.no') }")
    }
  )

  describe('self-test (anti-vacuity, RED-proof precursor)', () => {
    it('the bare-onClick assertion fires on a synthetic unguarded wiring', () => {
      const regressed = collapse(
        source.replace(
          'onClick={confirmInstallEosOverlay}',
          'onClick={installEosOverlay}'
        )
      )
      expect(regressed).toContain('onClick={installEosOverlay}')
    })
  })
})
